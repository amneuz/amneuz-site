const Stripe = require('stripe');
const { requireAdmin, supabaseAdmin, getRequestIp } = require('./_adminAuth');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const ALLOWED_STATUS = ['visible', 'hidden', 'upcoming'];
const ALLOWED_CATEGORY = ['remixes', 'originals', 'album'];
const ALLOWED_RELEASE_TYPE = ['album', 'ep'];

function formatTitle(track) {
  const artist = track.artist || 'Amneuz';
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

function cleanBoolean(value) {
  return value === true;
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
    albumId: track.album_id,
    trackNumber: track.track_number,
    createdAt: track.created_at,
    updatedAt: track.updated_at
  };
}

function mapAlbum(album) {
  return {
    id: album.id,
    slug: album.slug,
    title: album.title,
    displayTitle: formatAlbumTitle(album),
    artist: album.artist,
    collaborators: album.collaborators,
    releaseType: album.release_type || 'album',
    releaseYear: album.release_year,
    releaseDate: album.release_date,
    coverUrl: publicAssetUrl(album.cover_url),
    rawCoverUrl: album.cover_url,
    descriptionShort: album.description_short,
    descriptionLong: album.description_long,
    status: album.status,
    isFeatured: album.is_featured,
    isLatestRelease: album.is_latest_release,
    sortOrder: album.sort_order,
    stripeProductId: album.stripe_product_id,
    stripePriceId: album.stripe_price_id,
    priceMxn: album.price_mxn,
    createdAt: album.created_at,
    updatedAt: album.updated_at
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

async function albumSlugExists(slug, excludeId) {
  let query = supabaseAdmin
    .from('albums')
    .select('id')
    .eq('slug', slug);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query.maybeSingle();

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

async function generateUniqueAlbumSlug(title) {
  const base = slugify(title) || `release-${Date.now()}`;

  let candidate = base;
  let index = 2;

  while (await albumSlugExists(candidate)) {
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

async function getNextAlbumSortOrder() {
  const { data, error } = await supabaseAdmin
    .from('albums')
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

function buildAlbumInput(body, isUpdate) {
  const title = cleanString(body.title, 160);
  const artist = cleanString(body.artist, 120) || 'AMNEUZ';
  const collaborators = cleanString(body.collaborators, 180);
  const releaseType = cleanString(body.releaseType, 40) || 'album';
  const status = cleanString(body.status, 40) || 'hidden';
  const priceMxn = cleanNumber(body.priceMxn, 1, 100000);
  const releaseYear = cleanNumber(body.releaseYear, 1900, 2100);
  const sortOrder = cleanNumber(body.sortOrder, 0, 100000);
  const releaseDateRaw = cleanString(body.releaseDate, 40);
  const slug = cleanString(body.slug, 180);

  if (!title) {
    throw new Error('Title is required');
  }

  if (!priceMxn) {
    throw new Error('Price is required');
  }

  if (ALLOWED_RELEASE_TYPE.indexOf(releaseType) === -1) {
    throw new Error('Invalid release type');
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
    slug,
    title,
    artist,
    collaborators,
    release_type: releaseType,
    release_year: releaseYear,
    release_date: releaseDate,
    price_mxn: priceMxn,
    status,
    is_featured: cleanBoolean(body.isFeatured),
    is_latest_release: cleanBoolean(body.isLatestRelease),
    sort_order: sortOrder,
    description_short: cleanString(body.descriptionShort, 240),
    description_long: cleanString(body.descriptionLong, 1200),
    updated_at: isUpdate ? new Date().toISOString() : undefined
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
        resource_type: metadata && metadata.resource_type ? metadata.resource_type : 'track',
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
      album_id,
      track_number,
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

async function listAlbums(res) {
  const { data, error } = await supabaseAdmin
    .from('albums')
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
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Admin albums lookup failed:', error.message || error);
    return res.status(500).json({ error: 'Unable to load albums' });
  }

  return res.status(200).json({
    albums: (data || []).map(mapAlbum)
  });
}

async function getAlbumById(id) {
  const { data, error } = await supabaseAdmin
    .from('albums')
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
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
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
      category: input.category,
      product_type: 'track'
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

async function createStripeAlbumProductAndPrice(input, slug) {
  const displayName = input.collaborators
    ? `${input.artist} & ${input.collaborators} - ${input.title}`
    : `${input.artist} - ${input.title}`;

  const product = await stripe.products.create({
    name: displayName,
    description: input.description_short || 'Official release by AMNEUZ.',
    metadata: {
      source: 'amneuz_admin',
      slug,
      artist: input.artist,
      title: input.title,
      release_type: input.release_type,
      product_type: 'album'
    }
  });

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: input.price_mxn * 100,
    currency: 'mxn',
    metadata: {
      source: 'amneuz_admin',
      slug,
      product_type: 'album',
      release_type: input.release_type,
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

async function updateStripeAlbumPrice(album, newPriceMxn) {
  const oldPriceId = album.stripe_price_id || null;
  const oldPriceMxn = Number(album.price_mxn || 0);

  if (Number(newPriceMxn) === oldPriceMxn) {
    return {
      changed: false,
      stripeProductId: album.stripe_product_id || null,
      stripePriceId: oldPriceId,
      oldPriceId,
      oldPriceMxn,
      newPriceMxn
    };
  }

  let productId = album.stripe_product_id;

  if (!productId) {
    const created = await createStripeAlbumProductAndPrice({
      title: album.title,
      artist: album.artist,
      collaborators: album.collaborators,
      release_type: album.release_type || 'album',
      price_mxn: newPriceMxn,
      description_short: album.description_short
    }, album.slug);

    return {
      changed: true,
      stripeProductId: created.product.id,
      stripePriceId: created.price.id,
      oldPriceId,
      oldPriceMxn,
      newPriceMxn
    };
  }

  const newPrice = await stripe.prices.create({
    product: productId,
    unit_amount: Number(newPriceMxn) * 100,
    currency: 'mxn',
    metadata: {
      source: 'amneuz_admin',
      slug: album.slug || '',
      product_type: 'album',
      release_type: album.release_type || 'album',
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
      console.error('Unable to deactivate old album Stripe price:', err.message || err);
    }
  }

  return {
    changed: true,
    stripeProductId: productId,
    stripePriceId: newPrice.id,
    oldPriceId,
    oldPriceMxn,
    newPriceMxn
  };
}

async function syncStripeAlbumMetadata(album, productId) {
  if (!productId) {
    return;
  }

  try {
    await stripe.products.update(productId, {
      name: formatAlbumTitle(album),
      description: album.description_short || 'Official release by AMNEUZ.',
      images: album.cover_url ? [album.cover_url] : undefined,
      metadata: {
        source: 'amneuz_admin',
        slug: album.slug || '',
        artist: album.artist || '',
        title: album.title || '',
        release_type: album.release_type || 'album',
        product_type: 'album'
      }
    });
  } catch (err) {
    console.error('Stripe album metadata sync failed:', err.message || err);
  }
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
        album_id,
        track_number,
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
      resource_type: 'track',
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

async function createAlbum(admin, req, res) {
  let body;

  try {
    body = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  let input;

  try {
    input = buildAlbumInput(body || {}, false);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid album data' });
  }

  try {
    const slug = input.slug || await generateUniqueAlbumSlug(input.title);
    const sortOrder = input.sort_order === null || typeof input.sort_order === 'undefined'
      ? await getNextAlbumSortOrder()
      : input.sort_order;

    const stripeResult = await createStripeAlbumProductAndPrice(input, slug);

    const insertPayload = {
      slug,
      title: input.title,
      artist: input.artist,
      collaborators: input.collaborators,
      release_type: input.release_type,
      release_year: input.release_year,
      release_date: input.release_date,
      price_mxn: input.price_mxn,
      status: input.status || 'hidden',
      is_featured: input.is_featured,
      is_latest_release: input.is_latest_release,
      sort_order: sortOrder,
      description_short: input.description_short,
      description_long: input.description_long,
      stripe_product_id: stripeResult.product.id,
      stripe_price_id: stripeResult.price.id
    };

    const { data, error } = await supabaseAdmin
      .from('albums')
      .insert([insertPayload])
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

    if (error || !data) {
      console.error('Admin album insert failed:', error && (error.message || error));

      try {
        await stripe.prices.update(stripeResult.price.id, {
          active: false
        });

        await stripe.products.update(stripeResult.product.id, {
          active: false
        });
      } catch (stripeCleanupError) {
        console.error('Stripe cleanup failed after album insert error:', stripeCleanupError.message || stripeCleanupError);
      }

      return res.status(500).json({ error: 'Unable to create album' });
    }

    await writeAudit(admin, req, 'admin.album.created', data.id, {
      resource_type: 'album',
      slug: data.slug,
      title: data.title,
      release_type: data.release_type,
      stripe_product_id: data.stripe_product_id,
      stripe_price_id: data.stripe_price_id,
      price_mxn: data.price_mxn,
      status: data.status
    });

    return res.status(201).json({
      ok: true,
      album: mapAlbum(data)
    });
  } catch (err) {
    console.error('Admin create album failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to create album' });
  }
}

async function updateAlbum(admin, req, res, id) {
  const existingAlbum = await getAlbumById(id);

  if (!existingAlbum) {
    return res.status(404).json({ error: 'Album not found' });
  }

  let body;

  try {
    body = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  let input;

  try {
    input = buildAlbumInput(body || {}, true);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Invalid album data' });
  }

  const slug = input.slug || existingAlbum.slug || slugify(input.title);

  if (slug !== existingAlbum.slug && await albumSlugExists(slug, id)) {
    return res.status(400).json({ error: 'Album slug already exists' });
  }

  let stripePriceChange = {
    changed: false
  };

  try {
    stripePriceChange = await updateStripeAlbumPrice(existingAlbum, input.price_mxn);
  } catch (err) {
    console.error('Stripe album price update failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to update album Stripe price' });
  }

  const updatePayload = {
    slug,
    title: input.title,
    artist: input.artist,
    collaborators: input.collaborators,
    release_type: input.release_type,
    release_year: input.release_year,
    release_date: input.release_date,
    price_mxn: input.price_mxn,
    status: input.status,
    is_featured: input.is_featured,
    is_latest_release: input.is_latest_release,
    sort_order: input.sort_order,
    description_short: input.description_short,
    description_long: input.description_long,
    updated_at: new Date().toISOString()
  };

  if (stripePriceChange && stripePriceChange.stripeProductId) {
    updatePayload.stripe_product_id = stripePriceChange.stripeProductId;
  }

  if (stripePriceChange && stripePriceChange.stripePriceId) {
    updatePayload.stripe_price_id = stripePriceChange.stripePriceId;
  }

  const { data, error } = await supabaseAdmin
    .from('albums')
    .update(updatePayload)
    .eq('id', id)
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

  if (error || !data) {
    console.error('Admin album update failed:', error && (error.message || error));
    return res.status(500).json({ error: 'Unable to update album' });
  }

  await syncStripeAlbumMetadata(data, data.stripe_product_id);

  await writeAudit(admin, req, 'admin.album.updated', id, {
    resource_type: 'album',
    slug: data.slug,
    title: data.title,
    release_type: data.release_type,
    changed_fields: Object.keys(updatePayload),
    stripe_price_changed: stripePriceChange.changed ? true : false,
    old_price_mxn: stripePriceChange.oldPriceMxn || null,
    new_price_mxn: stripePriceChange.newPriceMxn || null,
    old_stripe_price_id: stripePriceChange.oldPriceId || null,
    new_stripe_price_id: stripePriceChange.stripePriceId || null,
    stripe_product_id: data.stripe_product_id || null
  });

  return res.status(200).json({
    ok: true,
    album: mapAlbum(data),
    stripePriceChanged: stripePriceChange.changed ? true : false
  });
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) {
    return;
  }

  const resource = typeof req.query.resource === 'string' ? req.query.resource.trim() : 'tracks';

  try {
    if (resource === 'albums') {
      if (req.method === 'GET') {
        return await listAlbums(res);
      }

      if (req.method === 'POST') {
        return await createAlbum(admin, req, res);
      }

      if (req.method === 'PATCH') {
        const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';

        if (!id || id.length > 80) {
          return res.status(400).json({ error: 'Invalid album id' });
        }

        return await updateAlbum(admin, req, res, id);
      }

      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (req.method === 'GET') {
      return await listTracks(res);
    }

    if (req.method === 'POST') {
      return await createTrack(admin, req, res);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin tracks API failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to process request' });
  }
};