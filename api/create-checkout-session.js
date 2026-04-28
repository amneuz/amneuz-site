const Stripe = require('stripe');
const tracks = require('../data/tracks.json');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const validPriceIds = tracks
  .map(function(track) {
    return track.stripePriceId;
  })
  .filter(Boolean);

const rateLimitStore = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var forwardedFor = req.headers['x-forwarded-for'];
  var clientIp =
    (typeof forwardedFor === 'string' && forwardedFor.split(',')[0].trim()) ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown';

  var now = Date.now();
  var existingRateLimit = rateLimitStore.get(clientIp);

  if (!existingRateLimit || now - existingRateLimit.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(clientIp, { count: 1, startedAt: now });
  } else {
    existingRateLimit.count += 1;

    if (existingRateLimit.count > RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Too many requests' });
    }
  }

  try {
    var body;

    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (err) {
      return res.status(400).json({ error: 'Invalid request payload' });
    }

    var items = body && body.items;

    if (!Array.isArray(items) || !items.length || items.length > 10) {
      return res.status(400).json({ error: 'Invalid checkout items' });
    }

    if (
      !items.every(function(item) {
        return (
          item &&
          typeof item.priceId === 'string' &&
          item.priceId.indexOf('price_') === 0 &&
          validPriceIds.indexOf(item.priceId) > -1
        );
      })
    ) {
      return res.status(400).json({ error: 'Invalid checkout items' });
    }

    const selectedTracks = tracks.filter(function(track) {
      return items.some(function(item) {
        return item.priceId === track.stripePriceId;
      });
    });

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
      customer_email: 'test+location_FR@example.com',
      adaptive_pricing: {
        enabled: true
      },
      metadata: {
        trackIds: selectedTracks
          .map(function(track) {
            return track.id;
          })
          .join(',')
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.status(500).json({ error: 'Unable to create checkout session' });
  }
};
