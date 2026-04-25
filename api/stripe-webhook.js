const Stripe = require('stripe');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const tracks = require('../data/tracks.json');
console.log('WEBHOOK V2');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    const rawBody = await getRawBody(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send('Webhook Error');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

    const priceIds = lineItems.data.map(function(item) {
      return item.price.id;
    });

    const trackIds = tracks
      .filter(function(track) {
        return priceIds.includes(track.stripePriceId);
      })
      .map(function(track) {
        return track.id;
      });

    const downloadToken = crypto.randomBytes(24).toString('hex');

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([
        {
          session_id: session.id,
          email: email,
          download_token: downloadToken,
          max_downloads: 3
        }
      ])
      .select()
      .single();

    if (orderError) {
      console.error('Order insert error:', orderError);
      return res.status(500).json({ error: 'Order insert failed' });
    }

    const itemsToInsert = trackIds.map(function(trackId) {
      return {
        order_id: order.id,
        track_id: trackId,
        downloads: 0
      };
    });

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error('Items insert error:', itemsError);
      return res.status(500).json({ error: 'Items insert failed' });
    }
  }

  return res.status(200).json({ received: true });
};

const getRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });