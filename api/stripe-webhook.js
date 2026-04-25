const Stripe = require('stripe');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const tracks = require('../data/tracks.json');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

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
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook Error');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

    const priceIds = lineItems.data.map(function(item) {
      return item.price.id;
    });

    const purchasedTracks = tracks.filter(function(track) {
      return priceIds.includes(track.stripePriceId);
    });

    const trackIds = purchasedTracks.map(function(track) {
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

    const baseUrl = 'https://amneuz-site.vercel.app';
    const downloadPageUrl = `${baseUrl}/success.html?session_id=${session.id}`;

    try {
      await resend.emails.send({
        from: 'Amneuz <onboarding@resend.dev>',
        to: email,
        subject: 'Your tracks are ready',
        html: `
          <h2>Your tracks are ready</h2>
          <p>Your tracks are ready. Access your private download page below.</p>
          <p><a href="${downloadPageUrl}">Open your download page</a></p>
        `
      });
    } catch (emailError) {
      console.error('Email failed:', emailError.message || emailError);
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
  
