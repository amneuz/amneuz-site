const { requireAdmin, supabaseAdmin } = require('./_adminAuth');

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

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) {
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';

  if (!id || id.length > 80) {
    return res.status(400).json({ error: 'Invalid track id' });
  }

  try {
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
      return res.status(404).json({ error: 'Track not found' });
    }

    return res.status(200).json({
      track: mapTrack(data)
    });
  } catch (err) {
    console.error('Admin track API failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to load track' });
  }
};