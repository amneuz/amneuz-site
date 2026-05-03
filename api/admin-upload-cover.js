const Stripe = require('stripe');
const sharp = require('sharp');
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

function safeName(value) {
  return String(value || 'cover')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'cover';
}

function formatTrackTitle(track) {
  const artist = track.artist || 'AMNEUZ';
  const collaborators = track.collaborators || '';
  const title = track.title || 'Untitled Track';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
}

function formatAlbumTitle(album) {
  const artist = album.artist || 'AMNEUZ';
  const collaborators = album.collaborators || '';
  const title = album.title || 'Untitled Release';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
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
      stripe_price_id,
      description_short
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function getAlbum(id) {
  const { data, error } = await supabaseAdmin
    .from('albums')
    .select(`
      id,
      slug,
      title,
      artist,
      collaborators,
      release_type,
      cover_url,
      stripe_product_id,
      stripe_price_id,
      description_short
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function resolveTrackStripeProductId(track) {
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
    console.error('Unable to resolve Stripe product from track price:', err.message || err);
    return null;
  }
}

async function resolveAlbumStripeProductId(album) {
  if (album.stripe_product_id) {
    return album.stripe_product_id;
  }

  if (!album.stripe_price_id) {
    return null;
  }

  try {
    const price = await stripe.prices.retrieve(album.stripe_price_id);
    const productId = typeof price.product === 'string' ? price.product : price.product && price.product.id;

    if (!productId) {
      return null;
    }

    await supabaseAdmin
      .from('albums')
      .update({
        stripe_product_id: productId,
        updated_at: new Date().toISOString()
      })
      .eq('id', album.id);

    return productId;
  } catch (err) {
    console.error('Unable to resolve Stripe product from album price:', err.message || err);
    return null;
  }
}

async function syncStripeTrackCover(track, publicUrl) {
  const productId = await resolveTrackStripeProductId(track);

  if (!productId) {
    return {
      synced: false,
      reason: 'missing_stripe_product_id'
    };
  }

  try {
    await stripe.products.update(productId, {
      name: formatTrackTitle(track),
      description: track.description_short || 'Official WAV extended mix, direct from AMNEUZ.',
      images: [publicUrl],
      metadata: {
        catalog_code: track.catalog_code || '',
        source: 'amneuz_admin',
        product_type: 'track',
        cover_synced: 'true'
      }
    });

    return {
      synced: true,
      stripe_product_id: productId
    };
  } catch (err) {
    console.error('Stripe track cover sync failed:', err.message || err);

    return {
      synced: false,
      stripe_product_id: productId,
      reason: err.message || 'stripe_cover_sync_failed'
    };
  }
}

async function syncStripeAlbumCover(album, publicUrl) {
  const productId = await resolveAlbumStripeProductId(album);

  if (!productId) {
    return {
      synced: false,
      reason: 'missing_stripe_product_id'
    };
  }

  try {
    await stripe.products.update(productId, {
      name: formatAlbumTitle(album),
      description: album.description_short || 'Official release by AMNEUZ.',
      images: [publicUrl],
      metadata: {
        slug: album.slug || '',
        source: 'amneuz_admin',
        product_type: 'album',
        release_type: album.release_type || 'album',
        cover_synced: 'true'
      }
    });

    return {
      synced: true,
      stripe_product_id: productId
    };
  } catch (err) {
    console.error('Stripe album cover sync failed:', err.message || err);

    return {
      synced: false,
      stripe_product_id: productId,
      reason: err.message || 'stripe_album_cover_sync_failed'
    };
  }
}

async function writeTrackAudit(admin, req, track, uploadedPath, publicUrl, stripeSyncResult, socialUploadedPath, socialPublicUrl) {
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
          social_uploaded_path: socialUploadedPath,
          social_public_url: socialPublicUrl,
          social_cover_generated: socialPublicUrl ? true : false,
          stripe_cover_synced: stripeSyncResult && stripeSyncResult.synced ? true : false,
          stripe_product_id: stripeSyncResult && stripeSyncResult.stripe_product_id ? stripeSyncResult.stripe_product_id : null,
          stripe_sync_reason: stripeSyncResult && stripeSyncResult.reason ? stripeSyncResult.reason : null
        }
      });
  } catch (err) {
    console.error('Admin track cover upload audit failed:', err.message || err);
  }
}

async function writeAlbumAudit(admin, req, album, uploadedPath, publicUrl, stripeSyncResult) {
  try {
    await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        actor_user_id: admin && admin.id ? admin.id : null,
        actor_email: admin && admin.email ? admin.email : null,
        action: 'admin.album.cover_uploaded',
        endpoint: '/api/admin-upload-cover',
        http_method: req.method,
        ip_address: getRequestIp ? getRequestIp(req) : null,
        user_agent: req.headers['user-agent'] || null,
        status: 'success',
        resource_type: 'album',
        resource_id: album.id,
        metadata: {
          slug: album.slug,
          title: album.title,
          release_type: album.release_type,
          uploaded_path: uploadedPath,
          public_url: publicUrl,
          stripe_cover_synced: stripeSyncResult && stripeSyncResult.synced ? true : false,
          stripe_product_id: stripeSyncResult && stripeSyncResult.stripe_product_id ? stripeSyncResult.stripe_product_id : null,
          stripe_sync_reason: stripeSyncResult && stripeSyncResult.reason ? stripeSyncResult.reason : null
        }
      });
  } catch (err) {
    console.error('Admin album cover upload audit failed:', err.message || err);
  }
}

async function createSocialCoverBuffer(fileBuffer) {
  return sharp(fileBuffer)
    .rotate()
    .resize(1200, 1200, {
      fit: 'cover',
      position: 'centre',
      withoutEnlargement: true
    })
    .flatten({ background: '#050505' })
    .jpeg({
      quality: 82,
      progressive: true,
      mozjpeg: true
    })
    .toBuffer();
}

async function uploadBufferToStorage(uploadedPath, fileBuffer, mimeType) {
  const { error } = await supabaseAdmin
    .storage
    .from('covers')
    .upload(uploadedPath, fileBuffer, {
      contentType: mimeType,
      upsert: true
    });

  if (error) {
    throw error;
  }

  const publicUrl = getPublicUrl(uploadedPath);

  if (!publicUrl) {
    throw new Error('Unable to create cover URL');
  }

  return publicUrl;
}

async function uploadToStorage(uploadedPath, fileBuffer, mimeType) {
  return uploadBufferToStorage(uploadedPath, fileBuffer, mimeType);
}

function runTrackPostUploadTasks(admin, req, track, uploadedPath, publicUrl, socialUploadedPath, socialPublicUrl) {
  syncStripeTrackCover(track, publicUrl)
    .then(function(stripeSyncResult) {
      if (stripeSyncResult && stripeSyncResult.reason && stripeSyncResult.reason !== 'missing_stripe_product_id') {
        console.error('Stripe cover sync failed after upload:', stripeSyncResult.reason);
      }

      return writeTrackAudit(admin, req, track, uploadedPath, publicUrl, stripeSyncResult, socialUploadedPath, socialPublicUrl);
    })
    .catch(function(err) {
      console.error('Stripe cover sync failed after upload:', err.message || err);

      return writeTrackAudit(admin, req, track, uploadedPath, publicUrl, {
        synced: false,
        reason: err.message || 'stripe_cover_sync_failed'
      }, socialUploadedPath, socialPublicUrl);
    })
    .catch(function(err) {
      console.error('Admin track cover upload audit failed:', err.message || err);
    });
}

async function handleTrackCoverUpload(admin, req, res, payload) {
  const track = await getTrack(payload.trackId);

  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }

  const extension = ALLOWED_MIME_TYPES[payload.mimeType];
  const baseName = safeName(track.catalog_code || track.slug || track.title || payload.fileName);
  const timestamp = Date.now();
  const uploadedPath = `${baseName}/cover-${timestamp}.${extension}`;
  const socialUploadedPath = `${baseName}/social-cover-${timestamp}.jpg`;

  let publicUrl;
  let socialPublicUrl;

  try {
    publicUrl = await uploadToStorage(uploadedPath, payload.fileBuffer, payload.mimeType);
  } catch (err) {
    console.error('Track cover upload failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to upload cover' });
  }

  try {
    const socialBuffer = await createSocialCoverBuffer(payload.fileBuffer);
    socialPublicUrl = await uploadBufferToStorage(socialUploadedPath, socialBuffer, 'image/jpeg');
  } catch (err) {
    console.error('Social cover generation failed:', err.message || err);
  }

  const updatePayload = {
    cover_url: publicUrl,
    updated_at: new Date().toISOString()
  };

  if (socialPublicUrl) {
    updatePayload.social_cover_url = socialPublicUrl;
  }

  const { data: updatedTrack, error: updateError } = await supabaseAdmin
    .from('tracks')
    .update(updatePayload)
    .eq('id', payload.trackId)
    .select('id, catalog_code, title, cover_url, social_cover_url, stripe_product_id')
    .single();

  if (updateError || !updatedTrack) {
    console.error('Track cover URL update failed:', updateError && (updateError.message || updateError));
    return res.status(500).json({ error: 'Unable to update track cover' });
  }

  runTrackPostUploadTasks(admin, req, track, uploadedPath, publicUrl, socialPublicUrl ? socialUploadedPath : null, socialPublicUrl || null);

  const responsePayload = {
    ok: true,
    resourceType: 'track',
    coverUrl: publicUrl,
    path: uploadedPath,
    stripeCoverSynced: false,
    stripeProductId: updatedTrack.stripe_product_id,
    track: updatedTrack
  };

  if (socialPublicUrl) {
    responsePayload.socialCoverUrl = socialPublicUrl;
    responsePayload.socialPath = socialUploadedPath;
  }

  return res.status(200).json(responsePayload);
}

async function handleAlbumCoverUpload(admin, req, res, payload) {
  const album = await getAlbum(payload.albumId);

  if (!album) {
    return res.status(404).json({ error: 'Album not found' });
  }

  const extension = ALLOWED_MIME_TYPES[payload.mimeType];
  const baseName = safeName(album.slug || album.title || payload.fileName);
  const uploadedPath = `albums/${baseName}/cover-${Date.now()}.${extension}`;

  let publicUrl;

  try {
    publicUrl = await uploadToStorage(uploadedPath, payload.fileBuffer, payload.mimeType);
  } catch (err) {
    console.error('Album cover upload failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to upload album cover' });
  }

  const stripeSyncResult = await syncStripeAlbumCover(album, publicUrl);

  const updatePayload = {
    cover_url: publicUrl,
    updated_at: new Date().toISOString()
  };

  if (stripeSyncResult && stripeSyncResult.stripe_product_id && !album.stripe_product_id) {
    updatePayload.stripe_product_id = stripeSyncResult.stripe_product_id;
  }

  const { data: updatedAlbum, error: updateError } = await supabaseAdmin
    .from('albums')
    .update(updatePayload)
    .eq('id', payload.albumId)
    .select(`
      id,
      slug,
      title,
      artist,
      collaborators,
      release_type,
      release_year,
      release_date,
      cover_url,
      soundcloud_url,
      spotify_url,
      apple_music_url,
      tidal_url,
      youtube_url,
      beatport_url,
      description_short,
      description_long,
      status,
      is_featured,
      is_latest_release,
      sort_order,
      stripe_product_id,
      stripe_price_id,
      price_mxn,
      created_at,
      updated_at
    `)
    .single();

  if (updateError || !updatedAlbum) {
    console.error('Album cover URL update failed:', updateError && (updateError.message || updateError));
    return res.status(500).json({ error: 'Unable to update album cover' });
  }

  await writeAlbumAudit(admin, req, album, uploadedPath, publicUrl, stripeSyncResult);

  return res.status(200).json({
    ok: true,
    resourceType: 'album',
    coverUrl: publicUrl,
    path: uploadedPath,
    stripeCoverSynced: stripeSyncResult && stripeSyncResult.synced ? true : false,
    stripeProductId: stripeSyncResult && stripeSyncResult.stripe_product_id ? stripeSyncResult.stripe_product_id : updatedAlbum.stripe_product_id,
    album: updatedAlbum
  });
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
  const albumId = String(body.albumId || '').trim();
  const fileName = String(body.fileName || '').trim();
  const mimeType = String(body.mimeType || '').trim().toLowerCase();
  const fileBase64 = cleanBase64(body.fileBase64);

  if (trackId && albumId) {
    return res.status(400).json({ error: 'Send either trackId or albumId, not both' });
  }

  if (!trackId && !albumId) {
    return res.status(400).json({ error: 'Missing track or album id' });
  }

  if (trackId && trackId.length > 80) {
    return res.status(400).json({ error: 'Invalid track id' });
  }

  if (albumId && albumId.length > 80) {
    return res.status(400).json({ error: 'Invalid album id' });
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
    return res.status(400).json({ error: 'Cover file is too large. Max 5MB' });
  }

  const payload = {
    trackId,
    albumId,
    fileName,
    mimeType,
    fileBuffer
  };

  try {
    if (albumId) {
      return await handleAlbumCoverUpload(admin, req, res, payload);
    }

    return await handleTrackCoverUpload(admin, req, res, payload);
  } catch (err) {
    console.error('Admin cover upload failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to upload cover' });
  }
};
