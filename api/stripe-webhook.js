const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

    return res.status(400).send(`Webhook Error: ${err.message}`);

  }

  // 🎯 Aquí procesamos eventos

  if (event.type === 'checkout.session.completed') {

    const session = event.data.object;

    console.log('✅ Payment confirmed:', session.id);

    // 👉 Aquí después:

    // guardar orden

    // generar token descarga

    // enviar email

  }

  res.status(200).json({ received: true });

};

// helper necesario para Vercel

const getRawBody = (req) =>

  new Promise((resolve, reject) => {

    let data = '';

    req.on('data', chunk => { data += chunk; });

    req.on('end', () => resolve(Buffer.from(data)));

    req.on('error', reject);

  });