const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function formatTrackTitle(track) {
  const artist = track.artist || 'Amneuz';
  const collaborators = track.collaborators || '';
  const title = track.title || 'Untitled Track';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
}

function mapTrackByLegacyId(tracks) {
  const map = new Map();

  tracks.forEach(function(track) {
    if (track.legacy_id) {
      map.set(String(track.legacy_id), track);
    }

    if (track.catalog_code) {
      map.set(String(track.catalog_code), track);
    }

    if (track.id) {
      map.set(String(track.id), track);
    }
  });

  return map;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = typeof req.query.session_id === 'string'
    ? req.query.session_id.trim()
    : '';

  if (!sessionId || !sessionId.startsWith('cs_') || sessionId.length > 255) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, download_token, max_downloads, email')
      .eq('session_id', sessionId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('track_id, downloads')
      .eq('order_id', order.id);

    if (itemsError) {
      console.error('Order items lookup failed:', itemsError.message || itemsError);
      return res.status(500).json({ error: 'Unable to load order' });
    }

    const trackIds = (items || [])
      .map(function(item) {
        return String(item.track_id || '').trim();
      })
      .filter(Boolean);

    if (!trackIds.length) {
      return res.status(200).json({
        email: order.email,
        tracks: []
      });
    }

    const { data: trackRows, error: tracksError } = await supabase
      .from('tracks')
      .select(`
        id,
        legacy_id,
        catalog_code,
        title,
        artist,
        collaborators,
        subgenre,
        track_key,
        bpm,
        duration_label,
        cover_url,
        status
      `)
      .or(
        [
          `legacy_id.in.(${trackIds.join(',')})`,
          `catalog_code.in.(${trackIds.join(',')})`
        ].join(',')
      );

    if (tracksError) {
      console.error('Order tracks lookup failed:', tracksError.message || tracksError);
      return res.status(500).json({ error: 'Unable to load order' });
    }

    const trackMap = mapTrackByLegacyId(trackRows || []);

    const purchasedTracks = items.map(function(item) {
      const track = trackMap.get(String(item.track_id));

      return {
        id: item.track_id,
        title: track ? formatTrackTitle(track) : item.track_id,
        cover: track ? track.cover_url || '' : '',
        genre: track ? track.subgenre || '' : '',
        key: track ? track.track_key || '' : '',
        bpm: track ? track.bpm || '' : '',
        duration: track ? track.duration_label || '' : '',
        downloads: item.downloads,
        maxDownloads: order.max_downloads,
        downloadsRemaining: Math.max(order.max_downloads - item.downloads, 0),
        downloadUrl: `/api/download?token=${order.download_token}&trackId=${item.track_id}`
      };
    });

    return res.status(200).json({
      email: order.email,
      tracks: purchasedTracks
    });
  } catch (error) {
    console.error('Order API failed:', error.message || error);
    return res.status(500).json({ error: 'Unable to load order' });
  }
};