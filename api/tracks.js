const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BASE_URL = 'https://www.amneuz.com';
const FALLBACK_IMAGE = `${BASE_URL}/amneuz.jpg`;

function formatTitle(item) {
  const artist = item.artist || 'Amneuz';
  const collaborators = item.collaborators || '';
  const title = item.title || 'Untitled';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function absoluteUrl(value) {
  const clean = String(value || '').trim();

  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }

  if (clean.charAt(0) === '/') {
    return `${BASE_URL}${clean}`;
  }

  return FALLBACK_IMAGE;
}

function imageType(url) {
  const clean = String(url || '').split('?')[0].toLowerCase();

  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';

  return 'image/jpeg';
}

function shareCandidates(track) {
  return [
    track.id,
    track.legacy_id,
    track.catalog_code,
    track.slug,
    slugify(track.title),
    slugify(formatTitle(track))
  ].filter(Boolean).map(function(value) {
    return String(value).toLowerCase();
  });
}

function noindexHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Track not found · AMNEUZ</title>
</head>
<body>
  <p>Track not found.</p>
</body>
</html>`;
}

async function handleShareTrack(req, res, shareParam) {
  const normalizedShare = String(shareParam || '').trim().toLowerCase();

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
      release_date,
      release_year,
      cover_url,
      status,
      is_latest_release,
      description_short
    `)
    .or('status.eq.visible,and(status.eq.upcoming,is_latest_release.eq.true)');

  if (error) {
    throw error;
  }

  const track = (data || []).find(function(item) {
    return shareCandidates(item).indexOf(normalizedShare) > -1;
  });

  if (!track) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(noindexHtml());
  }

  const deepLinkId = track.slug || track.catalog_code || track.legacy_id || track.id;
  const shareUrl = `${BASE_URL}/t/${encodeURIComponent(deepLinkId)}`;
  const redirectPath = `/?track=${encodeURIComponent(deepLinkId)}`;
  const redirectUrl = `${BASE_URL}${redirectPath}`;
  const title = formatTitle(track);
  const description = track.status === 'upcoming' && track.is_latest_release
    ? `Next Release · ${track.subgenre || 'AMNEUZ'}`
    : `Official AMNEUZ release · ${track.subgenre || 'AMNEUZ'}`;
  const image = absoluteUrl(track.cover_url);
  const type = imageType(image);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');

  return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="music.song">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(image)}">

  <meta property="og:image:secure_url" content="${escapeHtml(image)}">

  <meta property="og:image:type" content="${escapeHtml(type)}">

  <meta property="og:image:width" content="1200">

  <meta property="og:image:height" content="1200">

  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta property="og:site_name" content="AMNEUZ">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
   <meta name="twitter:image" content="${escapeHtml(image)}">

  <meta name="twitter:image:alt" content="Track cover artwork">

  <link rel="canonical" href="${escapeHtml(shareUrl)}">
  <meta http-equiv="refresh" content="0;url=${escapeHtml(redirectUrl)}">
  <script>window.location.replace('${escapeHtml(redirectPath)}');</script>
</head>
<body>
  <p><a href="${escapeHtml(redirectPath)}">Open ${escapeHtml(title)}</a></p>
</body>
</html>`);
}

function mapTrack(track) {
  return {
    id: track.legacy_id || track.catalog_code || track.id,
    uuid: track.id,
    albumId: track.album_id,
    trackNumber: track.track_number,
    catalogCode: track.catalog_code,
    slug: track.slug,
    category: track.category,
    title: formatTitle(track),
    rawTitle: track.title,
    artist: track.artist,
    collaborators: track.collaborators,
    genre: track.subgenre,
    key: track.track_key,
    bpm: track.bpm,
    duration: track.duration_label,
    release: track.release_year ? String(track.release_year) : '',
    releaseDate: track.release_date,
    cover: track.cover_url,
    preview: track.preview_url,
    storagePath: track.master_path,
    spotify: track.spotify_url,
    soundcloud: track.soundcloud_url,
    appleMusic: track.apple_music_url,
    tidal: track.tidal_url,
    youtube: track.youtube_url,
    beatport: track.beatport_url,
    stripePriceId: track.stripe_price_id,
    priceMxn: track.price_mxn,
    status: track.status,
    isFeatured: track.is_featured,
    isLatestRelease: track.is_latest_release,
    descriptionShort: track.description_short,
    descriptionLong: track.description_long
  };
}

function mapAlbum(album, albumTracks) {
  return {
    id: album.id,
    slug: album.slug,
    releaseType: 'album',
    title: formatTitle(album),
    rawTitle: album.title,
    artist: album.artist,
    collaborators: album.collaborators,
    release: album.release_year ? String(album.release_year) : '',
    releaseDate: album.release_date,
    cover: album.cover_url,
    spotify: album.spotify_url,
    soundcloud: album.soundcloud_url,
    appleMusic: album.apple_music_url,
    tidal: album.tidal_url,
    youtube: album.youtube_url,
    beatport: album.beatport_url,
    stripePriceId: album.stripe_price_id,
    priceMxn: album.price_mxn,
    status: album.status,
    isFeatured: album.is_featured,
    isLatestRelease: album.is_latest_release,
    descriptionShort: album.description_short,
    descriptionLong: album.description_long,
    tracks: albumTracks || []
  };
}

async function getVisibleTracks() {
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
      cover_url,
      preview_url,
      master_path,
      spotify_url,
      soundcloud_url,
      apple_music_url,
      tidal_url,
      youtube_url,
      beatport_url,
      stripe_price_id,
      status,
      is_featured,
      is_latest_release,
      sort_order,
      description_short,
      description_long,
      album_id,
      track_number
    `)
    .or('status.eq.visible,and(status.eq.upcoming,is_latest_release.eq.true)')
    .order('sort_order', { ascending: true })
    .order('track_number', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(mapTrack);
}

async function getVisibleAlbums() {
  const { data, error } = await supabaseAdmin
    .from('albums')
    .select(`
      id,
      slug,
      title,
      artist,
      collaborators,
      release_year,
      release_date,
      cover_url,
      spotify_url,
      soundcloud_url,
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
      price_mxn
    `)
    .or('status.eq.visible,and(status.eq.upcoming,is_latest_release.eq.true)')
    .order('sort_order', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const shareParam = req.query && req.query.share ? String(req.query.share).trim() : '';

    if (shareParam) {
      return handleShareTrack(req, res, shareParam);
    }

    const tracks = await getVisibleTracks();
    const albumsRaw = await getVisibleAlbums();

    const tracksByAlbumId = new Map();

    tracks.forEach(function(track) {
      if (!track.albumId) {
        return;
      }

      if (!tracksByAlbumId.has(track.albumId)) {
        tracksByAlbumId.set(track.albumId, []);
      }

      tracksByAlbumId.get(track.albumId).push(track);
    });

    const albums = albumsRaw.map(function(album) {
      const albumTracks = tracksByAlbumId.get(album.id) || [];

      albumTracks.sort(function(a, b) {
        return Number(a.trackNumber || 0) - Number(b.trackNumber || 0);
      });

      return mapAlbum(album, albumTracks);
    });

    return res.status(200).json({
      tracks,
      albums
    });
  } catch (err) {
    console.error('Public tracks API failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to load tracks' });
  }
};