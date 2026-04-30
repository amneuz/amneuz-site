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

const ALLOWED_ITEM_TYPES = ['track', 'album'];

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
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(function(item) {
    const type = String(item.type || 'track').trim().toLowerCase();

    return {
      priceId: String(item.priceId || '').trim(),
      type: ALLOWED_ITEM_TYPES.indexOf(type) > -1 ? type : 'track'
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
        item.priceId.indexOf('price_') === 0 &&
        ALLOWED_ITEM_TYPES.indexOf(item.type) > -1
      );
    })
  );
}

function uniqueValues(values) {
  return values.filter(function(value, index, array) {
    return value && array.indexOf(value) === index;
  });
}

function formatTrackTitle(track) {
  const artist = track.artist || 'Amneuz';
  const collaborators = track.collaborators || '';
  const title = track.title || 'Track';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
}

function formatAlbumTitle(album) {
  const artist = album.artist || 'AMNEUZ';
  const collaborators = album.collaborators || '';
  const title = album.title || 'Release';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
}

async function getTracksByPriceIds(priceIds) {
  if (!priceIds.length) {
    return [];
  }

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

async function getAlbumsByPriceIds(priceIds) {
  if (!priceIds.length) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('albums')
    .select(`
      id,
      slug,
      title,
      artist,
      collaborators,
      release_type,
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

function buildMetadata(selectedTracks, selectedAlbums) {

  const trackIds = selectedTracks.map(function(track) {

    return track.catalog_code || track.legacy_id || track.id;

  });

  const catalogCodes = selectedTracks
    .map(function(track) {
      return track.catalog_code || '';
    })
    .filter(Boolean);

  const albumIds = selectedAlbums.map(function(album) {
    return album.id;
  });

  const albumSlugs = selectedAlbums
    .map(function(album) {
      return album.slug || '';
    })
    .filter(Boolean);

  return {
    itemTypes: [
      selectedTracks.length ? 'track' : '',
      selectedAlbums.length ? 'album' : ''
    ].filter(Boolean).join(','),
    trackIds: trackIds.join(','),
    catalogCodes: catalogCodes.join(','),
    albumIds: albumIds.join(','),
    albumSlugs: albumSlugs.join(',')
  };
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

    var itemKeys = items.map(function(item) {
      return `${item.type}:${item.priceId}`;
    });

    var uniqueItemKeys = uniqueValues(itemKeys);

    if (uniqueItemKeys.length !== itemKeys.length) {
      return res.status(400).json({ error: 'Duplicate checkout items are not allowed' });
    }

    var trackPriceIds = uniqueValues(items
      .filter(function(item) {
        return item.type === 'track';
      })
      .map(function(item) {
        return item.priceId;
      }));

    var albumPriceIds = uniqueValues(items
      .filter(function(item) {
        return item.type === 'album';
      })
      .map(function(item) {
        return item.priceId;
      }));

    const selectedTracks = await getTracksByPriceIds(trackPriceIds);
    const selectedAlbums = await getAlbumsByPriceIds(albumPriceIds);

    if (selectedTracks.length !== trackPriceIds.length) {
      return res.status(400).json({ error: 'Invalid track checkout items' });
    }

    if (selectedAlbums.length !== albumPriceIds.length) {
      return res.status(400).json({ error: 'Invalid album checkout items' });
    }

    const validTrackPriceIds = selectedTracks.map(function(track) {
      return track.stripe_price_id;
    });

    const validAlbumPriceIds = selectedAlbums.map(function(album) {
      return album.stripe_price_id;
    });

    var allItemsAreValid = items.every(function(item) {
      if (item.type === 'album') {
        return validAlbumPriceIds.indexOf(item.priceId) > -1;
      }

      return validTrackPriceIds.indexOf(item.priceId) > -1;
    });

    if (!allItemsAreValid) {
      return res.status(400).json({ error: 'Invalid checkout items' });
    }

    const origin = req.headers.origin || 'https://amneuz.com';
    const metadata = buildMetadata(selectedTracks, selectedAlbums);

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
      metadata: metadata
    });

    return res.status(200).json({
      url: session.url,
      summary: {
        tracks: selectedTracks.map(function(track) {
          return {
            id: track.id,
            catalogCode: track.catalog_code,
            title: formatTrackTitle(track)
          };
        }),
        albums: selectedAlbums.map(function(album) {
          return {
            id: album.id,
            slug: album.slug,
            title: formatAlbumTitle(album),
            releaseType: album.release_type || 'album'
          };
        })
      }
    });
  } catch (err) {
    console.error('Stripe checkout error:', err.message || err);
    return res.status(500).json({ error: 'Unable to create checkout session' });
  }
};