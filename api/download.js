const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MASTER_BUCKET = 'masters';
const LEGACY_BUCKET = 'tracks';

const rateLimitWindowMs = 60 * 1000;
const rateLimitMaxRequests = 12;
const rateLimitMap = new Map();

const duplicateWindowMs = 5 * 1000;
const duplicateDownloadMap = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim() || 'unknown';
  }

  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.startedAt >= rateLimitWindowMs) {
    rateLimitMap.set(ip, { count: 1, startedAt: now });
    return false;
  }

  entry.count += 1;
  return entry.count > rateLimitMaxRequests;
}

function formatTrackTitle(track) {
  const artist = track.artist || 'Amneuz';
  const collaborators = track.collaborators || '';
  const title = track.title || 'Track';

  if (collaborators) {
    return `${artist} & ${collaborators} - ${title}`;
  }

  return `${artist} - ${title}`;
}

function safeFilename(value) {
  const name = String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();

  return name || 'AMNEUZ Track.wav';
}

async function getTrackByTrackId(trackId) {
  const { data, error } = await supabase
    .from('tracks')
    .select(`
      id,
      legacy_id,
      catalog_code,
      title,
      artist,
      collaborators,
      master_path,
      filename,
      status
    `)
    .or(`legacy_id.eq.${trackId},catalog_code.eq.${trackId}`);

  if (error) {
    throw error;
  }

  return data && data.length ? data[0] : null;
}

async function getSignedUrlFromBucket(bucket, path) {
  const { data, error } = await supabase
    .storage
    .from(bucket)
    .createSignedUrl(path, 60);

  if (error || !data || !data.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

async function fetchMasterFile(masterPath) {
  const bucketsToTry = [MASTER_BUCKET, LEGACY_BUCKET];

  for (const bucket of bucketsToTry) {
    const signedUrl = await getSignedUrlFromBucket(bucket, masterPath);

    if (!signedUrl) {
      continue;
    }

    const fileResponse = await fetch(signedUrl);

    if (fileResponse.ok) {
      return {
        bucket,
        fileResponse
      };
    }
  }

  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (isRateLimited(getClientIp(req))) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const trackId = typeof req.query.trackId === 'string' ? req.query.trackId.trim() : '';

  if (!token || token.length < 32 || token.length > 128 || !/^[a-fA-F0-9]+$/.test(token)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  if (!trackId || trackId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(trackId)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    const track = await getTrackByTrackId(trackId);

    if (!track || !track.master_path) {
      return res.status(404).json({ error: 'File not found' });
    }

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

    const duplicateKey = `${item.id}:${trackId}`;
    const duplicateEntry = duplicateDownloadMap.get(duplicateKey);

    if (duplicateEntry && Date.now() - duplicateEntry < duplicateWindowMs) {
      return res.status(429).json({ error: 'Please wait before downloading again' });
    }

    duplicateDownloadMap.set(duplicateKey, Date.now());

    setTimeout(function() {
      duplicateDownloadMap.delete(duplicateKey);
    }, duplicateWindowMs);

    const masterFile = await fetchMasterFile(track.master_path);

    if (!masterFile || !masterFile.fileResponse) {
      return res.status(404).json({ error: 'File not found' });
    }

    const fileBuffer = Buffer.from(await masterFile.fileResponse.arrayBuffer());

    if (!fileBuffer.length) {
      return res.status(500).json({ error: 'Unable to process download' });
    }

    const { data: updatedItems, error: updateError } = await supabase
      .rpc('increment_order_item_download', {
        p_order_item_id: item.id,
        p_max_downloads: order.max_downloads
      });

    if (updateError) {
      console.error('Download increment failed:', updateError.message || updateError);
      return res.status(500).json({ error: 'Unable to process download' });
    }

    if (!updatedItems || updatedItems.length === 0) {
      return res.status(403).json({ error: 'Download limit reached' });
    }

    const filename = safeFilename(track.filename || `${formatTrackTitle(track)}.wav`);

    res.setHeader('Content-Type', masterFile.fileResponse.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).send(fileBuffer);
  } catch (error) {
    console.error('Download API failed:', error.message || error);
    return res.status(500).json({ error: 'Unable to process download' });
  }
};