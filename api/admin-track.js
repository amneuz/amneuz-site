const Stripe = require('stripe');
const { requireAdmin, supabaseAdmin, getRequestIp } = require('./_adminAuth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const ALLOWED_STATUS = ['visible', 'hidden', 'upcoming'];
const ALLOWED_CATEGORY = ['remixes', 'originals', 'album'];
const MASTER_BUCKET = 'masters';

const ALLOWED_MASTER_MIME_TYPES = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
  'application/octet-stream': 'wav'
};

function publicAssetUrl(value) {
  const path = String(value || '').trim();

  if (!path) {
    return '';
  }

  if (path.startsWith('https://')) {
    return path;
  }

  if (path.startsWith('http://')) {
    return '';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function formatTitle(track) {
  const artist = track.artist || 'Amneuz';
  const collaborators = track.collaborators || '';
  const title = track.title || 'Untitled Track';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function safeFilename(value) {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();

  return cleaned || 'AMNEUZ Master.wav';
}

function mapTrack(track) {
  return {
    id: track.id,
    legacyId: track.legacy_id,
    catalogCode: track.catalog_code,
    slug: track.slug,
    title: track.title,
    displayTitle: formatTitle(track),
    artist: track.artist,
    collaborators: track.collaborators,
    category: track.category,
    subgenre: track.subgenre,
    key: track.track_key,
    bpm: track.bpm,
    durationSeconds: track.duration_seconds,
    durationLabel: track.duration_label,
    releaseYear: track.release_year,
    releaseDate: track.release_date,
    priceMxn: track.price_mxn,
    status: track.status,
    isFeatured: track.is_featured,
    isLatestRelease: track.is_latest_release,
    sortOrder: track.sort_order,
    coverUrl: publicAssetUrl(track.cover_url),
    rawCoverUrl: track.cover_url,
    previewUrl: publicAssetUrl(track.preview_url),
    rawPreviewUrl: track.preview_url,
    masterPath: track.master_path,
    filename: track.filename,
    stripeProductId: track.stripe_product_id,
    stripePriceId: track.stripe_price_id,
    soundcloudUrl: track.soundcloud_url,
    spotifyUrl: track.spotify_url,
    appleMusicUrl: track.apple_music_url,
    tidalUrl: track.tidal_url,
    youtubeUrl: track.youtube_url,
    beatportUrl: track.beatport_url,
    descriptionShort: track.description_short,
    descriptionLong: track.description_long,
    createdAt: track.created_at,
    updatedAt: track.updated_at
  };
}

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }

  return req.body;
}

function cleanString(value, maxLength) {
  const cleaned = String(value || '').trim();

  if (!cleaned) {
    return null;
  }

  return cleaned.slice(0, maxLength);
}

function cleanUrl(value) {
  const cleaned = String(value || '').trim();

  if (!cleaned) {
    return null;
  }

  if (!cleaned.startsWith('https://')) {
    return null;
  }

  return cleaned.slice(0, 500);
}

function cleanNumber(value, min, max) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  if (number < min || number > max) {
    return null;
  }

  return Math.round(number);
}

function cleanBoolean(value) {
  return value === true;
}

function buildUpdatePayload(body) {
  const title = cleanString(body.title, 160);
  const artist = cleanString(body.artist, 120) || 'Amneuz';
  const collaborators = cleanString(body.collaborators, 180);
  const category = cleanString(body.category, 40);
  const status = cleanString(body.status, 40);
  const bpm = cleanNumber(body.bpm, 1, 300);
  const releaseYear = cleanNumber(body.releaseYear, 1900, 2100);
  const releaseDateRaw = cleanString(body.releaseDate, 40);
  const priceMxn = cleanNumber(body.priceMxn, 1, 100000);
  const sortOrder = cleanNumber(body.sortOrder, 0, 100000);

  if (!title) {
    throw new Error('Title is required');
  }

  if (!category || ALLOWED_CATEGORY.indexOf(category) === -1) {
    throw new Error('Invalid category');
  }

  if (!status || ALLOWED_STATUS.indexOf(status) === -1) {
    throw new Error('Invalid status');
  }

  let releaseDate = null;

  if (releaseDateRaw) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDateRaw)) {
      throw new Error('Invalid release date');
    }

    releaseDate = releaseDateRaw;
  }

  return {
    title,
    artist,
    collaborators,
    category,
    subgenre: cleanString(body.subgenre, 120),
    track_key: cleanString(body.key, 40),
    bpm,
    duration_label: cleanString(body.durationLabel, 40),
    release_year: releaseYear,
    release_date: releaseDate,
    price_mxn: priceMxn,
    status,
    is_featured: cleanBoolean(body.isFeatured),
    is_latest_release: cleanBoolean(body.isLatestRelease),
    sort_order: sortOrder,
    slug: cleanString(body.slug, 180) || slugify(title),
    soundcloud_url: cleanUrl(body.soundcloudUrl),
    spotify_url: cleanUrl(body.spotifyUrl),
    apple_music_url: cleanUrl(body.appleMusicUrl),
    tidal_url: cleanUrl(body.tidalUrl),
    youtube_url: cleanUrl(body.youtubeUrl),
    beatport_url: cleanUrl(body.beatportUrl),
    description_short: cleanString(body.descriptionShort, 240),
    description_long: cleanString(body.descriptionLong, 1200),
    updated_at: new Date().toISOString()
  };
}

async function getTrackById(id) {
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
      category,
      subgenre,
      track_key,
      bpm,
      duration_seconds,
      duration_label,
      release_year,
      release_date,
      price_mxn,
      status,
      is_featured,
      is_latest_release,
      sort_order,
      cover_url,
      preview_url,
      master_path,
      filename,
      stripe_product_id,
      stripe_price_id,
      soundcloud_url,
      spotify_url,
      apple_music_url,
      tidal_url,
      youtube_url,
      beatport_url,
      description_short,
      description_long,
      created_at,
      updated_at
    `)
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function writeAudit(admin, req, action, resourceId, metadata) {
  try {
    await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        actor_user_id: admin && admin.id ? admin.id : null,
        actor_email: admin && admin.email ? admin.email : null,
        action,
        endpoint: '/api/admin-track',
        http_method: req.method,
        ip_address: getRequestIp ? getRequestIp(req) : null,
        user_agent: req.headers['user-agent'] || null,
        status: 'success',
        resource_type: 'track',
        resource_id: resourceId,
        metadata: metadata || {}
      });
  } catch (err) {
    console.error('Admin audit write failed:', err.message || err);
  }
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

    return productId || null;
  } catch (err) {
    console.error('Unable to resolve Stripe product from existing price:', err.message || err);
    return null;
  }
}

async function createStripeProductForTrack(track) {
  const displayName = formatTitle(track);

  const product = await stripe.products.create({
    name: displayName,
    description: track.description_short || 'Official WAV extended mix, direct from AMNEUZ.',
    images: track.cover_url ? [track.cover_url] : [],
    metadata: {
      source: 'amneuz_admin',
      catalog_code: track.catalog_code || '',
      slug: track.slug || '',
      artist: track.artist || '',
      title: track.title || '',
      category: track.category || ''
    }
  });

  return product.id;
}

async function ensureStripeProductId(track) {
  const resolvedProductId = await resolveStripeProductId(track);

  if (resolvedProductId) {
    return {
      productId: resolvedProductId,
      created: false
    };
  }

  const createdProductId = await createStripeProductForTrack(track);

  return {
    productId: createdProductId,
    created: true
  };
}

async function syncStripeProductMetadata(track, productId) {
  if (!productId) {
    return;
  }

  const displayName = formatTitle(track);

  try {
    await stripe.products.update(productId, {
      name: displayName,
      description: track.description_short || 'Official WAV extended mix, direct from AMNEUZ.',
      images: track.cover_url ? [track.cover_url] : undefined,
      metadata: {
        source: 'amneuz_admin',
        catalog_code: track.catalog_code || '',
        slug: track.slug || '',
        artist: track.artist || '',
        title: track.title || '',
        category: track.category || ''
      }
    });
  } catch (err) {
    console.error('Stripe product metadata sync failed:', err.message || err);
  }
}

async function updateStripePriceForTrack(track, newPriceMxn) {
  const oldPriceId = track.stripe_price_id || null;
  const oldPriceMxn = Number(track.price_mxn || 0);

  if (Number(newPriceMxn) === oldPriceMxn) {
    return {
      changed: false,
      stripeProductId: track.stripe_product_id || null,
      stripePriceId: oldPriceId,
      oldPriceId,
      oldPriceMxn,
      newPriceMxn
    };
  }

  const ensured = await ensureStripeProductId(track);
  const productId = ensured.productId;

  if (!productId) {
    throw new Error('Unable to resolve Stripe product');
  }

  const newPrice = await stripe.prices.create({
    product: productId,
    unit_amount: Number(newPriceMxn) * 100,
    currency: 'mxn',
    metadata: {
      source: 'amneuz_admin',
      catalog_code: track.catalog_code || '',
      slug: track.slug || '',
      product_type: 'track',
      payment_type: 'one_time',
      replaces_price_id: oldPriceId || ''
    }
  });

  await stripe.products.update(productId, {
    default_price: newPrice.id
  });

  if (oldPriceId && oldPriceId !== newPrice.id) {
    try {
      await stripe.prices.update(oldPriceId, {
        active: false
      });
    } catch (err) {
      console.error('Unable to deactivate old Stripe price:', err.message || err);
    }
  }

  return {
    changed: true,
    stripeProductId: productId,
    stripeProductCreated: ensured.created,
    stripePriceId: newPrice.id,
    oldPriceId,
    oldPriceMxn,
    newPriceMxn
  };
}

function validateMasterPayload(body) {
  const fileName = safeFilename(body.fileName);
  const mimeType = String(body.mimeType || '').trim().toLowerCase();
  const fileSize = Number(body.fileSize || 0);

  if (!ALLOWED_MASTER_MIME_TYPES[mimeType]) {
    throw new Error('Master must be WAV, FLAC, or AIFF');
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error('Invalid file size');
  }

  return {
    fileName,
    mimeType,
    fileSize,
    extension: ALLOWED_MASTER_MIME_TYPES[mimeType]
  };
}

async function createMasterUpload(admin, req, res, id) {
  let body;

  try {
    body = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  let validated;

  try {
    validated = validateMasterPayload(body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid master file' });
  }

  const track = await getTrackById(id);

  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }

  const baseName = safeName(track.catalog_code || track.slug || track.title || validated.fileName);
  const uploadPath = `${baseName}/master-${Date.now()}.${validated.extension}`;

  const { data, error } = await supabaseAdmin
    .storage
    .from(MASTER_BUCKET)
    .createSignedUploadUrl(uploadPath);

  if (error || !data) {
    console.error('Create signed master upload URL failed:', error && (error.message || error));
    return res.status(500).json({ error: 'Unable to create master upload URL' });
  }

  await writeAudit(admin, req, 'admin.track.master_upload_url_created', id, {
    bucket: MASTER_BUCKET,
    catalog_code: track.catalog_code,
    title: track.title,
    upload_path: uploadPath,
    file_name: validated.fileName,
    file_size: validated.fileSize,
    mime_type: validated.mimeType
  });

  return res.status(200).json({
    ok: true,
    bucket: MASTER_BUCKET,
    path: uploadPath,
    token: data.token,
    signedUrl: data.signedUrl,
    fileName: validated.fileName
  });
}

async function verifyMasterObjectExists(path) {
  const cleanPath = String(path || '').trim();

  if (!cleanPath || cleanPath.startsWith('/') || cleanPath.indexOf('..') > -1) {
    return false;
  }

  const parts = cleanPath.split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');

  const { data, error } = await supabaseAdmin
    .storage
    .from(MASTER_BUCKET)
    .list(folder, {
      search: fileName
    });

  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.some(function(item) {
    return item.name === fileName;
  });
}

async function finalizeMasterUpload(admin, req, res, id) {
  let body;

  try {
    body = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const masterPath = String(body.path || '').trim();
  const filename = safeFilename(body.fileName);

  if (!masterPath || masterPath.length > 500 || masterPath.startsWith('/') || masterPath.indexOf('..') > -1) {
    return res.status(400).json({ error: 'Invalid master path' });
  }

  const track = await getTrackById(id);

  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }

  const exists = await verifyMasterObjectExists(masterPath);

  if (!exists) {
    return res.status(400).json({ error: 'Uploaded master file was not found' });
  }

  const { data, error } = await supabaseAdmin
    .from('tracks')
    .update({
      master_path: masterPath,
      filename,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select(`
      id,
      legacy_id,
      catalog_code,
      slug,
      title,
      artist,
      collaborators,
      category,
      subgenre,
      track_key,
      bpm,
      duration_seconds,
      duration_label,
      release_year,
      release_date,
      price_mxn,
      status,
      is_featured,
      is_latest_release,
      sort_order,
      cover_url,
      preview_url,
      master_path,
      filename,
      stripe_product_id,
      stripe_price_id,
      soundcloud_url,
      spotify_url,
      apple_music_url,
      tidal_url,
      youtube_url,
      beatport_url,
      description_short,
      description_long,
      created_at,
      updated_at
    `)
    .single();

  if (error || !data) {
    console.error('Master path update failed:', error && (error.message || error));
    return res.status(500).json({ error: 'Unable to update track master' });
  }

  await writeAudit(admin, req, 'admin.track.master_uploaded', id, {
    bucket: MASTER_BUCKET,
    catalog_code: data.catalog_code,
    title: data.title,
    master_path: data.master_path,
    filename: data.filename
  });

  return res.status(200).json({
    ok: true,
    masterPath: data.master_path,
    filename: data.filename,
    track: mapTrack(data)
  });
}

async function updateTrack(admin, req, res, id) {
  const existingTrack = await getTrackById(id);

  if (!existingTrack) {
    return res.status(404).json({ error: 'Track not found' });
  }

  let body;

  try {
    body = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  let updatePayload;

  try {
    updatePayload = buildUpdatePayload(body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid track data' });
  }

  let stripePriceChange = {
    changed: false
  };

  try {
    stripePriceChange = await updateStripePriceForTrack(existingTrack, updatePayload.price_mxn);
  } catch (err) {
    console.error('Stripe price update failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to update Stripe price' });
  }

  if (stripePriceChange && stripePriceChange.stripeProductId) {
    updatePayload.stripe_product_id = stripePriceChange.stripeProductId;
  }

  if (stripePriceChange && stripePriceChange.stripePriceId) {
    updatePayload.stripe_price_id = stripePriceChange.stripePriceId;
  }

  const { data, error } = await supabaseAdmin
    .from('tracks')
    .update(updatePayload)
    .eq('id', id)
    .select(`
      id,
      legacy_id,
      catalog_code,
      slug,
      title,
      artist,
      collaborators,
      category,
      subgenre,
      track_key,
      bpm,
      duration_seconds,
      duration_label,
      release_year,
      release_date,
      price_mxn,
      status,
      is_featured,
      is_latest_release,
      sort_order,
      cover_url,
      preview_url,
      master_path,
      filename,
      stripe_product_id,
      stripe_price_id,
      soundcloud_url,
      spotify_url,
      apple_music_url,
      tidal_url,
      youtube_url,
      beatport_url,
      description_short,
      description_long,
      created_at,
      updated_at
    `)
    .single();

  if (error || !data) {
    console.error('Admin track update failed:', error && (error.message || error));
    return res.status(500).json({ error: 'Unable to update track' });
  }

  await syncStripeProductMetadata(data, data.stripe_product_id);

  await writeAudit(admin, req, 'admin.track.updated', id, {
    catalog_code: data.catalog_code,
    title: data.title,
    changed_fields: Object.keys(updatePayload),
    stripe_price_changed: stripePriceChange.changed ? true : false,
    old_price_mxn: stripePriceChange.oldPriceMxn || null,
    new_price_mxn: stripePriceChange.newPriceMxn || null,
    old_stripe_price_id: stripePriceChange.oldPriceId || null,
    new_stripe_price_id: stripePriceChange.stripePriceId || null,
    stripe_product_id: data.stripe_product_id || null
  });

  return res.status(200).json({
    track: mapTrack(data),
    stripePriceChanged: stripePriceChange.changed ? true : false
  });
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) {
    return;
  }

  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';

  if (!id || id.length > 80) {
    return res.status(400).json({ error: 'Invalid track id' });
  }

  try {
    if (req.method === 'GET') {
      const track = await getTrackById(id);

      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      return res.status(200).json({
        track: mapTrack(track)
      });
    }

    if (req.method === 'PATCH') {
      return await updateTrack(admin, req, res, id);
    }

    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';

    if (action === 'create-master-upload') {
      return await createMasterUpload(admin, req, res, id);
    }

    if (action === 'finalize-master-upload') {
      return await finalizeMasterUpload(admin, req, res, id);
    }

    return res.status(400).json({ error: 'Invalid admin track action' });
  } catch (err) {
    console.error('Admin track API failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to process track' });
  }
};