const { requireAdmin, supabaseAdmin, getRequestIp } = require('./_adminAuth');

const MASTER_BUCKET = 'tracks';

const ALLOWED_MIME_TYPES = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/aiff': 'aiff',
  'audio/x-aiff': 'aiff',
  'application/octet-stream': 'wav'
};

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }

  return req.body;
}

function safeName(value) {
  return String(value || 'track')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'track';
}

function safeFilename(value) {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim();

  return cleaned || 'AMNEUZ Master.wav';
}

async function getTrack(id) {
  const { data, error } = await supabaseAdmin
    .from('tracks')
    .select('id, catalog_code, slug, title, artist, collaborators')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function writeAudit(admin, req, track, uploadPath, fileName, fileSize) {
  try {
    await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        actor_user_id: admin && admin.id ? admin.id : null,
        actor_email: admin && admin.email ? admin.email : null,
        action: 'admin.track.master_upload_url_created',
        endpoint: '/api/admin-create-master-upload',
        http_method: req.method,
        ip_address: getRequestIp ? getRequestIp(req) : null,
        user_agent: req.headers['user-agent'] || null,
        status: 'success',
        resource_type: 'track',
        resource_id: track.id,
        metadata: {
          catalog_code: track.catalog_code,
          title: track.title,
          upload_path: uploadPath,
          file_name: fileName,
          file_size: fileSize
        }
      });
  } catch (err) {
    console.error('Admin master upload URL audit failed:', err.message || err);
  }
}

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body;

  try {
    body = parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid request payload' });
  }

  const trackId = String(body.trackId || '').trim();
  const fileName = safeFilename(body.fileName);
  const mimeType = String(body.mimeType || '').trim().toLowerCase();
  const fileSize = Number(body.fileSize || 0);

  if (!trackId || trackId.length > 80) {
    return res.status(400).json({ error: 'Invalid track id' });
  }

  if (!ALLOWED_MIME_TYPES[mimeType]) {
    return res.status(400).json({ error: 'Master must be WAV, FLAC, or AIFF' });
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return res.status(400).json({ error: 'Invalid file size' });
  }

  try {
    const track = await getTrack(trackId);

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const extension = ALLOWED_MIME_TYPES[mimeType];
    const baseName = safeName(track.catalog_code || track.slug || track.title || fileName);
    const uploadPath = `${baseName}/master-${Date.now()}.${extension}`;

    const { data, error } = await supabaseAdmin
      .storage
      .from(MASTER_BUCKET)
      .createSignedUploadUrl(uploadPath);

    if (error || !data) {
      console.error('Create signed master upload URL failed:', error && (error.message || error));
      return res.status(500).json({ error: 'Unable to create master upload URL' });
    }

    await writeAudit(admin, req, track, uploadPath, fileName, fileSize);

    return res.status(200).json({
      ok: true,
      bucket: MASTER_BUCKET,
      path: uploadPath,
      token: data.token,
      signedUrl: data.signedUrl,
      fileName
    });
  } catch (err) {
    console.error('Admin create master upload failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to prepare master upload' });
  }
};