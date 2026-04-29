const Stripe = require('stripe');
const { requireAdmin, supabaseAdmin, getRequestIp } = require('./_adminAuth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }

  return req.body;
}

function cleanBase64(value) {
  return String(value || '').replace(/^data:[^;]+;base64,/, '').trim();
}

function getPublicUrl(path) {
  const { data } = supabaseAdmin
    .storage
    .from('covers')
    .getPublicUrl(path);

  return data && data.publicUrl ? data.publicUrl : '';
}

async function getTrack(id) {
  const { data, error } = await supabaseAdmin
    .from('tracks')
    .select(`
      id,
      catalog_code,
      slug,
      title,
      artist,
      collaborators,
      cover_url,
      stripe_product_id,
      stripe_price_id
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

function safeName(value) {
  return String(value || 'track')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'track';
}

async function resolveStripeProductId(track) {
  if (track.stripe_product_id) {
    return track.stripe_product_id;
  }

  if (!track.stripe_price_id) {
    return null;
  }

  try {
    const price = await stripe.prices.retrieve(track.stripe_price_id);
    const productId = typeof price.product === 'string' ? price.product : price.product && price.product.id;

    if (!productId) {
      return null;
    }

    await supabaseAdmin
      .from('tracks')
      .update({
        stripe_product_id: productId,
        updated_at: new Date().toISOString()
      })
      .eq('id', track.id);

    return productId;
  } catch (err) {
    console.error('Unable to resolve Stripe product from price:', err.message || err);
    return null;
  }
}

async function syncStripeCover(track, publicUrl) {
  const productId = await resolveStripeProductId(track);

  if (!productId) {
    return {
      synced: false,
      reason: 'missing_stripe_product_id'
    };
  }

  try {
    await stripe.products.update(productId, {
      images: [publicUrl],
      metadata: {
        catalog_code: track.catalog_code || '',
        source: 'amneuz_admin',
        cover_synced: 'true'
      }
    });

    return {
      synced: true,
      stripe_product_id: productId
    };
  } catch (err) {
    console.error('Stripe cover sync failed:', err.message || err);

    return {
      synced: false,
      stripe_product_id: productId,
      reason: err.message || 'stripe_cover_sync_failed'
    };
  }
}

async function writeAudit(admin, req, track, uploadedPath, publicUrl, stripeSyncResult) {
  try {
    await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        actor_user_id: admin && admin.id ? admin.id : null,
        actor_email: admin && admin.email ? admin.email : null,
        action: 'admin.track.cover_uploaded',
        endpoint: '/api/admin-upload-cover',
        http_method: req.method,
        ip_address: getRequestIp ? getRequestIp(req) : null,
        user_agent: req.headers['user-agent'] || null,
        status: 'success',
        resource_type: 'track',
        resource_id: track.id,
        metadata: {
          catalog_code: track.catalog_code,
          title: track.title,
          uploaded_path: uploadedPath,
          public_url: publicUrl,
          stripe_cover_synced: stripeSyncResult && stripeSyncResult.synced ? true : false,
          stripe_product_id: stripeSyncResult && stripeSyncResult.stripe_product_id ? stripeSyncResult.stripe_product_id : null,
          stripe_sync_reason: stripeSyncResult && stripeSyncResult.reason ? stripeSyncResult.reason : null
        }
      });
  } catch (err) {
    console.error('Admin cover upload audit failed:', err.message || err);
  }
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;

  try {
    body = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const trackId = String(body.trackId || '').trim();
  const fileName = String(body.fileName || '').trim();
  const mimeType = String(body.mimeType || '').trim().toLowerCase();
  const fileBase64 = cleanBase64(body.fileBase64);

  if (!trackId || trackId.length > 80) {
    return res.status(400).json({ error: 'Invalid track id' });
  }

  if (!ALLOWED_MIME_TYPES[mimeType]) {
    return res.status(400).json({ error: 'Cover must be JPG, PNG, or WEBP' });
  }

  if (!fileBase64) {
    return res.status(400).json({ error: 'Missing cover file' });
  }

  let fileBuffer;

  try {
    fileBuffer = Buffer.from(fileBase64, 'base64');
  } catch (err) {
    return res.status(400).json({ error: 'Invalid cover file' });
  }

  if (!fileBuffer.length || fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    return res.status(400).json({ error: 'Cover file is too large' });
  }

  try {
    const track = await getTrack(trackId);

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const extension = ALLOWED_MIME_TYPES[mimeType];
    const baseName = safeName(track.catalog_code || track.slug || track.title || fileName);
    const uploadedPath = `${baseName}/cover-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from('covers')
      .upload(uploadedPath, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) {
      console.error('Cover upload failed:', uploadError.message || uploadError);
      return res.status(500).json({ error: 'Unable to upload cover' });
    }

    const publicUrl = getPublicUrl(uploadedPath);

    if (!publicUrl) {
      return res.status(500).json({ error: 'Unable to create cover URL' });
    }

    const stripeSyncResult = await syncStripeCover(track, publicUrl);

    const updatePayload = {
      cover_url: publicUrl,
      updated_at: new Date().toISOString()
    };

    if (stripeSyncResult && stripeSyncResult.stripe_product_id && !track.stripe_product_id) {
      updatePayload.stripe_product_id = stripeSyncResult.stripe_product_id;
    }

    const { data: updatedTrack, error: updateError } = await supabaseAdmin
      .from('tracks')
      .update(updatePayload)
      .eq('id', trackId)
      .select('id, catalog_code, title, cover_url, stripe_product_id')
      .single();

    if (updateError || !updatedTrack) {
      console.error('Cover URL update failed:', updateError && (updateError.message || updateError));
      return res.status(500).json({ error: 'Unable to update track cover' });
    }

    await writeAudit(admin, req, track, uploadedPath, publicUrl, stripeSyncResult);

    return res.status(200).json({
      ok: true,
      coverUrl: publicUrl,
      path: uploadedPath,
      stripeCoverSynced: stripeSyncResult && stripeSyncResult.synced ? true : false,
      stripeProductId: stripeSyncResult && stripeSyncResult.stripe_product_id ? stripeSyncResult.stripe_product_id : updatedTrack.stripe_product_id,
      track: updatedTrack
    });
  } catch (err) {
    console.error('Admin cover upload failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to upload cover' });
  }
};