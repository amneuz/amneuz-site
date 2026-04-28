const { requireAdmin, supabaseAdmin } = require('./_adminAuth');

const ALLOWED_STATUS = ['visible', 'hidden', 'upcoming'];
const ALLOWED_CATEGORY = ['remixes', 'originals', 'album'];

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

  return number;
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
  const priceMxn = cleanNumber(body.priceMxn, 0, 100000);
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
      price_mxn,
      status,
      is_featured,
      is_latest_release,
      sort_order,
      cover_url,
      preview_url,
      master_path,
      filename,
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
        resource_type: 'track',
        resource_id: resourceId,
        metadata: metadata || {}
      });
  } catch (err) {
    console.error('Admin audit write failed:', err.message || err);
  }
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) {
    return;
  }

  if (req.method !== 'GET' && req.method !== 'PATCH') {
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
        price_mxn,
        status,
        is_featured,
        is_latest_release,
        sort_order,
        cover_url,
        preview_url,
        master_path,
        filename,
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

    await writeAudit(admin, req, 'admin.track.updated', id, {
      catalog_code: data.catalog_code,
      title: data.title,
      changed_fields: Object.keys(updatePayload)
    });

    return res.status(200).json({
      track: mapTrack(data)
    });
  } catch (err) {
    console.error('Admin track API failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to process track' });
  }
};