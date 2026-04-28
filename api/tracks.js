const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function mapTrack(track) {
  return {
    id: track.legacy_id || track.catalog_code || track.id,
    uuid: track.id,
    catalogCode: track.catalog_code,
    slug: track.slug,
    category: track.category,
    title: track.artist && track.artist !== 'AMNEUZ'
      ? `${track.artist} - ${track.title}`
      : track.collaborators
        ? `${track.artist} & ${track.collaborators} - ${track.title}`
        : `${track.artist} - ${track.title}`,
    artist: track.artist,
    collaborators: track.collaborators,
    genre: track.subgenre,
    key: track.track_key,
    bpm: track.bpm,
    duration: track.duration_label,
    release: track.release_year ? String(track.release_year) : '',
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
    isFeatured: track.is_featured,
    isLatestRelease: track.is_latest_release,
    descriptionShort: track.description_short,
    descriptionLong: track.description_long
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
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
        duration_label,
        release_year,
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
        description_long
      `)
      .eq('status', 'visible')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Public tracks lookup failed:', error.message || error);
      return res.status(500).json({ error: 'Unable to load tracks' });
    }

    return res.status(200).json((data || []).map(mapTrack));
  } catch (err) {
    console.error('Public tracks API failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to load tracks' });
  }
};