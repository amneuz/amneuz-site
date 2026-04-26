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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAmount(amount, currency) {
  const code = String(currency || '').toUpperCase();

  if (typeof amount !== 'number') {
    return code ? `${code} unavailable` : 'Unavailable';
  }

  const value = (amount / 100).toFixed(2);

  if (code === 'MXN') {
    return `MXN $${value}`;
  }

  return `${code || 'USD'} $${value}`;
}

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    console.error('Webhook verification failed:', err.message);
    return res.status(400).send('Webhook Error');
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;

  try {
    const { data: existingOrder, error: existingOrderError } = await supabase
      .from('orders')
      .select('id')
      .eq('session_id', session.id)
      .maybeSingle();

    if (existingOrderError) {
      console.error('Order lookup error:', existingOrderError.message || existingOrderError);
      return res.status(500).json({ error: 'Unable to process webhook' });
    }

    if (existingOrder) {
      return res.status(200).json({ received: true });
    }

    const email = session.customer_details?.email || session.customer_email;

    if (!email) {
      return res.status(500).json({ error: 'Unable to process webhook' });
    }

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

    const priceIds = lineItems.data
      .map(function(item) {
        return item.price && item.price.id;
      })
      .filter(Boolean);

    const purchasedTracks = tracks.filter(function(track) {
      return priceIds.includes(track.stripePriceId);
    });

    if (!purchasedTracks.length) {
      return res.status(500).json({ error: 'Unable to process webhook' });
    }

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
      console.error('Order insert error:', orderError.message || orderError);
      return res.status(500).json({ error: 'Unable to process webhook' });
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
      console.error('Items insert error:', itemsError.message || itemsError);
      return res.status(500).json({ error: 'Unable to process webhook' });
    }

    const baseUrl = 'https://amneuz.com';
    const downloadPageUrl = `${baseUrl}/success.html?session_id=${session.id}`;
    const orderDate = session.created ? new Date(session.created * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'Not available';
    const totalPaid = formatAmount(session.amount_total, session.currency);
    const lineItemByPriceId = new Map();

    lineItems.data.forEach(function(item) {
      if (item.price && item.price.id) {
        lineItemByPriceId.set(item.price.id, item);
      }
    });

    const trackRows = purchasedTracks.map(function(track) {
      const item = lineItemByPriceId.get(track.stripePriceId);
      const trackPrice = item ? formatAmount(item.amount_total || item.amount_subtotal || item.price.unit_amount, item.currency || session.currency) : 'Included';
      const details = [track.genre, track.key, track.bpm ? `${track.bpm} BPM` : ''].filter(Boolean).join(' · ');

      return `
        <tr>
          <td style="padding:18px 0;border-top:1px solid #242424;">
            <div style="font-size:17px;line-height:1.35;font-weight:700;color:#ffffff;">${escapeHtml(track.title)}</div>
            <div style="margin-top:6px;font-size:13px;line-height:1.45;color:#9b9b9b;">${escapeHtml(details || 'AMNEUZ release')}</div>
          </td>
          <td align="right" style="padding:18px 0;border-top:1px solid #242424;font-size:14px;line-height:1.45;color:#d8d8d8;white-space:nowrap;">${escapeHtml(trackPrice)}</td>
        </tr>
      `;
    }).join('');

    const plainTrackLines = purchasedTracks.map(function(track) {
      const item = lineItemByPriceId.get(track.stripePriceId);
      const trackPrice = item ? formatAmount(item.amount_total || item.amount_subtotal || item.price.unit_amount, item.currency || session.currency) : 'Included';
      const details = [track.genre, track.key, track.bpm ? `${track.bpm} BPM` : ''].filter(Boolean).join(' · ');

      return `- ${track.title}${details ? ` (${details})` : ''} - ${trackPrice}`;
    }).join('\n');

    try {
      await resend.emails.send({
        from: 'AMNEUZ Music <music@amneuz.com>',
        to: email,
        reply_to: 'music@amneuz.com',
        subject: 'Your AMNEUZ tracks are ready',
        html: `
          <div style="margin:0;padding:0;background:#050505;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#050505;border-collapse:collapse;">
              <tr>
                <td align="center" style="padding:42px 18px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:collapse;">
                    <tr>
                      <td align="center" style="padding:24px 0 34px;">
                        <div style="font-size:46px;line-height:1;letter-spacing:9px;font-weight:700;color:#ffffff;">AMNEUZ</div>
                        <div style="margin-top:14px;font-size:11px;line-height:1.4;letter-spacing:4px;color:#9c9c9c;text-transform:uppercase;">SOUND IS THE ENTRANCE.</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="border:1px solid #242424;background:#0b0b0b;border-radius:18px;padding:34px 30px;box-shadow:0 24px 60px rgba(0,0,0,0.45);">
                        <h1 style="margin:0;font-size:34px;line-height:1.08;letter-spacing:-1px;color:#ffffff;font-weight:700;text-align:center;">Your tracks are ready</h1>
                        <p style="margin:18px auto 0;max-width:460px;font-size:16px;line-height:1.65;color:#bdbdbd;text-align:center;">Thank you for supporting AMNEUZ directly. Your private download page is ready below.</p>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:30px;width:100%;border-collapse:collapse;">
                          <tr>
                            <td style="padding:14px 0;border-top:1px solid #242424;font-size:12px;line-height:1.4;letter-spacing:2px;color:#8f8f8f;text-transform:uppercase;">Purchaser</td>
                            <td align="right" style="padding:14px 0;border-top:1px solid #242424;font-size:14px;line-height:1.4;color:#ffffff;">${escapeHtml(email)}</td>
                          </tr>
                          <tr>
                            <td style="padding:14px 0;border-top:1px solid #242424;font-size:12px;line-height:1.4;letter-spacing:2px;color:#8f8f8f;text-transform:uppercase;">Order Date</td>
                            <td align="right" style="padding:14px 0;border-top:1px solid #242424;font-size:14px;line-height:1.4;color:#ffffff;">${escapeHtml(orderDate)}</td>
                          </tr>
                          <tr>
                            <td style="padding:14px 0;border-top:1px solid #242424;border-bottom:1px solid #242424;font-size:12px;line-height:1.4;letter-spacing:2px;color:#8f8f8f;text-transform:uppercase;">Total Paid</td>
                            <td align="right" style="padding:14px 0;border-top:1px solid #242424;border-bottom:1px solid #242424;font-size:16px;line-height:1.4;color:#ffffff;font-weight:700;">${escapeHtml(totalPaid)}</td>
                          </tr>
                        </table>
                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;width:100%;border-collapse:collapse;">
                          ${trackRows}
                        </table>
                        <div style="padding:30px 0 18px;text-align:center;">
                          <a href="${escapeHtml(downloadPageUrl)}" style="display:inline-block;padding:16px 24px;background:#f5f5f5;color:#050505;text-decoration:none;border-radius:999px;font-size:12px;line-height:1;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Open your download page</a>
                        </div>
                        <p style="margin:10px 0 0;font-size:13px;line-height:1.55;color:#969696;text-align:center;">Your downloads are limited to 3 attempts. Keep this email private.</p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding:28px 0 0;">
                        <a href="https://www.instagram.com/amneuz/" style="display:inline-block;margin:0 5px;padding:10px 14px;border:1px solid #2c2c2c;border-radius:999px;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">Instagram</a>
                        <a href="https://www.tiktok.com/@amneuz" style="display:inline-block;margin:0 5px;padding:10px 14px;border:1px solid #2c2c2c;border-radius:999px;color:#ffffff;text-decoration:none;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">TikTok</a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding:28px 0 0;color:#777777;font-size:13px;line-height:1.7;">
                        <div style="color:#ffffff;font-weight:700;letter-spacing:2px;text-transform:uppercase;">AMNEUZ Music</div>
                        <div>music@amneuz.com</div>
                        <div>Stream anywhere. Own it here.</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </div>
        `,
        text: `Your tracks are ready

Thank you for supporting AMNEUZ directly. Your private download page is ready below.

Purchaser: ${email}
Order date: ${orderDate}
Total paid: ${totalPaid}

Purchased tracks:
${plainTrackLines}

Download page:
${downloadPageUrl}

Your downloads are limited to 3 attempts. Keep this email private.

Instagram:
https://www.instagram.com/amneuz/

TikTok:
https://www.tiktok.com/@amneuz

Support:
music@amneuz.com

AMNEUZ Music
Stream anywhere. Own it here.`
      });
    } catch (emailError) {
      console.error('Email failed:', emailError.message || emailError);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err.message || err);
    return res.status(500).json({ error: 'Unable to process webhook' });
  }
};

const getRawBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
