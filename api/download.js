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

  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const trackId = typeof req.query.trackId === 'string' ? req.query.trackId.trim() : '';

  if (!token || token.length < 32 || token.length > 128 || !/^[a-fA-F0-9]+$/.test(token)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  if (!trackId || trackId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(trackId)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const track = tracks.find(function(item) {
    return item.id === trackId;
  });

  if (!track || !track.storagePath || !track.filename) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, max_downloads, expires_at')
      .eq('download_token', token)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Invalid download link' });
    }

    if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
      return res.status(403).json({ error: 'Download link expired' });
    }

    const { data: item, error: itemError } = await supabase
      .from('order_items')
      .select('id, downloads')
      .eq('order_id', order.id)
      .eq('track_id', trackId)
      .single();

    if (itemError || !item) {
      return res.status(403).json({ error: 'Track not available for this order' });
    }

    if (item.downloads >= order.max_downloads) {
      return res.status(403).json({ error: 'Download limit reached' });
    }

    const { error: updateError } = await supabase
      .from('order_items')
      .update({ downloads: item.downloads + 1 })
      .eq('id', item.id);

    if (updateError) {
      return res.status(500).json({ error: 'Unable to process download' });
    }

    const { data: signedUrlData, error: urlError } = await supabase
      .storage
      .from('tracks')
      .createSignedUrl(track.storagePath, 60);

    if (urlError || !signedUrlData || !signedUrlData.signedUrl) {
      return res.status(500).json({ error: 'Unable to process download' });
    }

    const fileResponse = await fetch(signedUrlData.signedUrl);

    if (!fileResponse.ok) {
      return res.status(500).json({ error: 'Unable to process download' });
    }

    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

    res.setHeader('Content-Type', fileResponse.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${track.filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);

    return res.status(200).send(fileBuffer);
  } catch (error) {
    return res.status(500).json({ error: 'Unable to process download' });
  }
};
