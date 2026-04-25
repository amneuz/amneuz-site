const Stripe = require('stripe');
const tracks = require('../data/tracks.json');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const validPriceIds = tracks
  .map(function(track) { return track.stripePriceId; })
  .filter(Boolean);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
    if (!items.every(function(item) {
      return item &&
        typeof item.priceId === 'string' &&
        item.priceId.indexOf('price_') === 0 &&
        validPriceIds.indexOf(item.priceId) > -1;
    })) {
      return res.status(400).json({ error: 'Invalid checkout items' });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: items.map(item => ({
        price: item.priceId,
        quantity: 1
      })),
      success_url: `${req.headers.origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/cancel.html`
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return res.status(500).json({ error: 'Unable to create checkout session' });
  }
};
