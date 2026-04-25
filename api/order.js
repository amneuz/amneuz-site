const { createClient } = require('@supabase/supabase-js');

const tracks = require('../data/tracks.json');

const supabase = createClient(

  process.env.SUPABASE_URL,

  process.env.SUPABASE_SERVICE_ROLE_KEY

);

module.exports = async function handler(req, res) {

  if (req.method !== 'GET') {

    return res.status(405).json({ error: 'Method not allowed' });

  }

  const sessionId = typeof req.query.session_id === 'string'

    ? req.query.session_id.trim()

    : '';

  if (!sessionId || !sessionId.startsWith('cs_')) {

    return res.status(400).json({ error: 'Invalid request' });

  }

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

    return res.status(500).json({ error: 'Unable to load order' });

  }

  const purchasedTracks = items.map(function(item) {

    const track = tracks.find(function(t) {

      return t.id === item.track_id;

    });

    return {

      id: item.track_id,

      title: track ? track.title : item.track_id,

      cover: track ? track.cover : '',

      genre: track ? track.genre : '',

      key: track ? track.key : '',

      duration: track ? track.duration : '',

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

};