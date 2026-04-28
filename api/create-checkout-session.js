const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rateLimitStore = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function getClientIp(req) {
  var forwardedFor = req.headers['x-forwarded-for'];

  return (
    (typeof forwardedFor === 'string' && forwardedFor.split(',')[0].trim()) ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown'
  );
}

function checkRateLimit(req, res) {
  var clientIp = getClientIp(req);
  var now = Date.now();
  var existingRateLimit = rateLimitStore.get(clientIp);

  if (!existingRateLimit || now - existingRateLimit.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(clientIp, { count: 1, startedAt: now });
    return true;
  }

  existingRateLimit.count += 1;

  if (existingRateLimit.count > RATE_LIMIT_MAX) {
    res.status(429).json({ error: 'Too many requests' });
    return false;
  }

  return true;
}

function parseBody(req, res) {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (err) {
    res.status(400).json({ error: 'Invalid request payload' });
    return null;
  }
}

function normalizeItems(items) {
  return items.map(function(item) {
    return {
      priceId: String(item.priceId || '').trim()
    };
  });
}

function validateBasicItems(items) {
  return (
    Array.isArray(items) &&
    items.length > 0 &&
    items.length <= 10 &&
    items.every(function(item) {
      return (
        item &&
        typeof item.priceId === 'string' &&
        item.priceId.indexOf('price_') === 0
      );
    })
  );
}

async function getTracksByPriceIds(priceIds) {
  const { data, error } = await supabaseAdmin
    .from('tracks')
    .select(`
      id,
      legacy_id,
      catalog_code,
      slug,
      title,
      artist,
      collaborators,
      stripe_price_id,
      status
    `)
    .in('stripe_price_id', priceIds)
    .eq('status', 'visible');

  if (error) {
    throw error;
  }

  return data || [];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!checkRateLimit(req, res)) {
    return;
  }

  try {
    var body = parseBody(req, res);

    if (!body) {
      return;
    }

    var items = normalizeItems(body && body.items);

    if (!validateBasicItems(items)) {
      return res.status(400).json({ error: 'Invalid checkout items' });
    }

    var requestedPriceIds = items.map(function(item) {
      return item.priceId;
    });

    var uniquePriceIds = requestedPriceIds.filter(function(priceId, index, array) {
      return array.indexOf(priceId) === index;
    });

    if (uniquePriceIds.length !== requestedPriceIds.length) {
      return res.status(400).json({ error: 'Duplicate checkout items are not allowed' });
    }

    const selectedTracks = await getTracksByPriceIds(uniquePriceIds);

    if (selectedTracks.length !== uniquePriceIds.length) {
      return res.status(400).json({ error: 'Invalid checkout items' });
    }

    const validPriceIds = selectedTracks.map(function(track) {
      return track.stripe_price_id;
    });

    var allItemsAreValid = requestedPriceIds.every(function(priceId) {
      return validPriceIds.indexOf(priceId) > -1;
    });

    if (!allItemsAreValid) {
      return res.status(400).json({ error: 'Invalid checkout items' });
    }

    const origin = req.headers.origin || 'https://amneuz.com';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: items.map(function(item) {
        return {
          price: item.priceId,
          quantity: 1
        };
      }),
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel.html`,
      adaptive_pricing: {
        enabled: true
      },
      metadata: {
        trackIds: selectedTracks
          .map(function(track) {
            return track.legacy_id || track.catalog_code || track.id;
          })
          .join(','),
        catalogCodes: selectedTracks
          .map(function(track) {
            return track.catalog_code || '';
          })
          .filter(Boolean)
          .join(',')
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message || err);
    return res.status(500).json({ error: 'Unable to create checkout session' });
  }
};