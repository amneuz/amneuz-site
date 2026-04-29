const Stripe = require('stripe');
const { requireAdmin, supabaseAdmin, getRequestIp } = require('./_adminAuth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const ALLOWED_STATUS = ['visible', 'hidden', 'upcoming'];
const ALLOWED_CATEGORY = ['remixes', 'originals', 'album'];

function formatTitle(track) {
  const artist = track.artist || 'Amneuz';
  const collaborators = track.collaborators || '';
  const title = track.title || 'Untitled Track';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
}

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

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
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

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }

  return req.body;
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
    duration: track.duration_label,
    releaseYear: track.release_year,
    releaseDate: track.release_date,
    priceMxn: track.price_mxn,
    status: track.status,
    isFeatured: track.is_featured,
    isLatestRelease: track.is_latest_release,
    sortOrder: track.sort_order,
    coverUrl: publicAssetUrl(track.cover_url),
    previewUrl: publicAssetUrl(track.preview_url),
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

async function slugExists(slug) {
  const { data, error } = await supabaseAdmin
    .from('tracks')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function generateUniqueSlug(title) {
  const base = slugify(title) || `track-${Date.now()}`;

  let candidate = base;
  let index = 2;

  while (await slugExists(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function extractAmzNumber(catalogCode) {
  const match = String(catalogCode || '').trim().match(/^AMZ-(\d{3})$/i);

  if (!match) {
    return null;
  }

  const number = Number(match[1]);

  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }

  return number;
}

async function generateCatalogCode() {
  const { data, error } = await supabaseAdmin
    .from('tracks')
    .select('catalog_code')
    .not('catalog_code', 'is', null);

  if (error) {
    throw error;
  }

  const usedNumbers = new Set();

  (data || []).forEach(function(row) {
    const number = extractAmzNumber(row.catalog_code);

    if (number) {
      usedNumbers.add(number);
    }
  });

  let nextNumber = 1;

  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  return `AMZ-${String(nextNumber).padStart(3, '0')}`;
}

async function getNextSortOrderFromCatalog(catalogCode) {
  const number = extractAmzNumber(catalogCode);

  if (number) {
    return number * 10;
  }

  const { data, error } = await supabaseAdmin
    .from('tracks')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const currentMax = data && data.length ? Number(data[0].sort_order || 0) : 0;
  return currentMax + 10;
}

function buildCreateInput(body) {
  const title = cleanString(body.title, 160);
  const artist = cleanString(body.artist, 120) || 'AMNEUZ';
  const collaborators = cleanString(body.collaborators, 180);
  const category = cleanString(body.category, 40) || 'remixes';
  const status = cleanString(body.status, 40) || 'hidden';
  const priceMxn = cleanNumber(body.priceMxn, 1, 100000);
  const bpm = cleanNumber(body.bpm, 1, 300);
  const releaseYear = cleanNumber(body.releaseYear, 1900, 2100);
  const sortOrder = cleanNumber(body.sortOrder, 0, 100000);
  const releaseDateRaw = cleanString(body.releaseDate, 40);

  if (!title) {
    throw new Error('Title is required');
  }

  if (!priceMxn) {
    throw new Error('Price is required');
  }

  if (ALLOWED_CATEGORY.indexOf(category) === -1) {
    throw new Error('Invalid category');
  }

  if (ALLOWED_STATUS.indexOf(status) === -1) {
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
    status,
    subgenre: cleanString(body.subgenre, 120),
    track_key: cleanString(body.key, 40),
    bpm,
    duration_label: cleanString(body.durationLabel, 40),
    release_year: releaseYear,
    release_date: releaseDate,
    price_mxn: priceMxn,
    sort_order: sortOrder,
    spotify_url: cleanUrl(body.spotifyUrl),
    soundcloud_url: cleanUrl(body.soundcloudUrl),
    apple_music_url: cleanUrl(body.appleMusicUrl),
    tidal_url: cleanUrl(body.tidalUrl),
    youtube_url: cleanUrl(body.youtubeUrl),
    beatport_url: cleanUrl(body.beatportUrl),
    description_short: cleanString(body.descriptionShort, 240),
    description_long: cleanString(body.descriptionLong, 1200)
  };
}

async function writeAudit(admin, req, action, resourceId, metadata) {
  try {
    await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        actor_user_id: admin && admin.id ? admin.id : null,
        actor_email: admin && admin.email ? admin.email : null,
        action,
        endpoint: '/api/admin-tracks',
        http_method: req.method,
        ip_address: getRequestIp ? getRequestIp(req) : null,
        user_agent: req.headers['user-agent'] || null,
        status: 'success',
        resource_type: 'track',
        resource_id: resourceId || null,
        metadata: metadata || {}
      });
  } catch (err) {
    console.error('Admin tracks audit write failed:', err.message || err);
  }
}

async function listTracks(res) {
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
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Admin tracks lookup failed:', error.message || error);
    return res.status(500).json({ error: 'Unable to load tracks' });
  }

  return res.status(200).json({
    tracks: (data || []).map(mapTrack)
  });
}

async function createStripeProductAndPrice(input, slug, catalogCode) {
  const displayName = input.collaborators
    ? `${input.artist} & ${input.collaborators} - ${input.title}`
    : `${input.artist} - ${input.title}`;

  const product = await stripe.products.create({
    name: displayName,
    description: input.description_short || 'Official WAV extended mix, direct from AMNEUZ.',
    metadata: {
      source: 'amneuz_admin',
      catalog_code: catalogCode,
      slug,
      artist: input.artist,
      title: input.title,
      category: input.category
    }
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: input.price_mxn * 100,
    currency: 'mxn',
    metadata: {
      source: 'amneuz_admin',
      catalog_code: catalogCode,
      slug,
      product_type: 'track',
      payment_type: 'one_time'
    }
  });

  await stripe.products.update(product.id, {
    default_price: price.id
  });

  return {
    product,
    price
  };
}

async function createTrack(admin, req, res) {
  let body;

  try {
    body = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  let input;

  try {
    input = buildCreateInput(body || {});
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid track data' });
  }

  try {
    const slug = await generateUniqueSlug(input.title);
    const catalogCode = await generateCatalogCode();
    const sortOrder = input.sort_order === null || typeof input.sort_order === 'undefined'
      ? await getNextSortOrderFromCatalog(catalogCode)
      : input.sort_order;

    const stripeResult = await createStripeProductAndPrice(input, slug, catalogCode);

    const insertPayload = {
      legacy_id: null,
      slug,
      title: input.title,
      artist: input.artist,
      collaborators: input.collaborators,
      category: input.category,
      subgenre: input.subgenre,
      track_key: input.track_key,
      bpm: input.bpm,
      duration_label: input.duration_label,
      release_year: input.release_year,
      release_date: input.release_date,
      price_mxn: input.price_mxn,
      status: input.status || 'hidden',
      is_featured: false,
      is_latest_release: false,
      sort_order: sortOrder,
      spotify_url: input.spotify_url,
      soundcloud_url: input.soundcloud_url,
      apple_music_url: input.apple_music_url,
      tidal_url: input.tidal_url,
      youtube_url: input.youtube_url,
      beatport_url: input.beatport_url,
      stripe_product_id: stripeResult.product.id,
      stripe_price_id: stripeResult.price.id,
      catalog_code: catalogCode,
      description_short: input.description_short,
      description_long: input.description_long
    };

    const { data, error } = await supabaseAdmin
      .from('tracks')
      .insert([insertPayload])
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
      console.error('Admin track insert failed:', error && (error.message || error));

      try {
        await stripe.prices.update(stripeResult.price.id, {
          active: false
        });

        await stripe.products.update(stripeResult.product.id, {
          active: false
        });
      } catch (stripeCleanupError) {
        console.error('Stripe cleanup failed after Supabase insert error:', stripeCleanupError.message || stripeCleanupError);
      }

      return res.status(500).json({ error: 'Unable to create track' });
    }

    await writeAudit(admin, req, 'admin.track.created', data.id, {
      catalog_code: data.catalog_code,
      slug: data.slug,
      title: data.title,
      stripe_product_id: data.stripe_product_id,
      stripe_price_id: data.stripe_price_id,
      price_mxn: data.price_mxn,
      status: data.status
    });

    return res.status(201).json({
      ok: true,
      track: mapTrack(data)
    });
  } catch (err) {
    console.error('Admin create track failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to create track' });
  }
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) {
    return;
  }

  try {
    if (req.method === 'GET') {
      return await listTracks(res);
    }

    if (req.method === 'POST') {
      return await createTrack(admin, req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin tracks API failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to process tracks request' });
  }
};