const { createClient } = require('@supabase/supabase-js');
const tracks = require('../data/tracks.json');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, trackId } = req.query;

  if (!token || !trackId) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // 1. Buscar orden por token
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('download_token', token)
    .single();

  if (orderError || !order) {
    return res.status(400).json({ error: 'Invalid download link' });
  }

  // 2. Validar que el track pertenece a la orden
  const { data: item, error: itemError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id)
    .eq('track_id', trackId)
    .single();

  if (itemError || !item) {
    return res.status(403).json({ error: 'Track not purchased' });
  }

  // 3. Obtener info del track
  const track = tracks.find(t => t.id === trackId);

  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }

  // 4. Generar signed URL (válido por 60s)
  const { data: signedUrlData, error: urlError } = await supabase
    .storage
    .from('tracks')
    .createSignedUrl(track.storagePath, 60);

  if (urlError) {
    return res.status(500).json({ error: 'File access error' });
  }

  // 5. Redirigir con nombre de archivo correcto
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${track.filename}"`
  );

  const fileResponse = await fetch(signedUrlData.signedUrl);

if (!fileResponse.ok) {
  return res.status(500).json({ error: 'Unable to retrieve file' });
}

const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

res.setHeader('Content-Type', fileResponse.headers.get('content-type') || 'application/octet-stream');
res.setHeader('Content-Disposition', `attachment; filename="${track.filename}"`);
res.setHeader('Content-Length', fileBuffer.length);

return res.status(200).send(fileBuffer);

};