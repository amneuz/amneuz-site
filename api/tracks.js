const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function formatTitle(item) {
  const artist = item.artist || 'Amneuz';
  const collaborators = item.collaborators || '';
  const title = item.title || 'Untitled';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
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