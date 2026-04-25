const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {


  if (req.method !== 'POST') {

    return res.status(405).json({ error: 'Method not allowed' });

  }


  try {

    console.log('REQ BODY:', req.body);

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { items } = body;

    console.log('ITEMS:', items);

    if (!items || items.length === 0) {

      return res.status(400).json({ error: 'No items provided' });

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

    console.error('Stripe error:', err);

    res.status(500).json({ error: 'Stripe session error' });

  }

}