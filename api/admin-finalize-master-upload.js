const { requireAdmin, supabaseAdmin, getRequestIp } = require('./_adminAuth');

const MASTER_BUCKET = 'tracks';

function parseBody(req) {
  if (!req.body) {
    return {};
  }

  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }

  return req.body;
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
    .select('id, catalog_code, title, master_path, filename')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

async function verifyObjectExists(path) {
  const parts = String(path || '').split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');

  const { data, error } = await supabaseAdmin
    .storage
    .from(MASTER_BUCKET)
    .list(folder, {
      search: fileName
    });

  if (error) {
    throw error;
  }

  return Array.isArray(data) && data.some(function(item) {
    return item.name === fileName;
  });
}

async function writeAudit(admin, req, track, masterPath, filename) {
  try {
    await supabaseAdmin
      .from('admin_audit_logs')
      .insert({
        actor_user_id: admin && admin.id ? admin.id : null,
        actor_email: admin && admin.email ? admin.email : null,
        action: 'admin.track.master_uploaded',
        endpoint: '/api/admin-finalize-master-upload',
        http_method: req.method,
        ip_address: getRequestIp ? getRequestIp(req) : null,
        user_agent: req.headers['user-agent'] || null,
        status: 'success',
        resource_type: 'track',
        resource_id: track.id,
        metadata: {
          catalog_code: track.catalog_code,
          title: track.title,
          master_path: masterPath,
          filename
        }
      });
  } catch (err) {
    console.error('Admin master finalize audit failed:', err.message || err);
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
  const masterPath = String(body.path || '').trim();
  const filename = safeFilename(body.fileName);

  if (!trackId || trackId.length > 80) {
    return res.status(400).json({ error: 'Invalid track id' });
  }

  if (!masterPath || masterPath.length > 500 || masterPath.startsWith('/') || masterPath.indexOf('..') > -1) {
    return res.status(400).json({ error: 'Invalid master path' });
  }

  try {
    const track = await getTrack(trackId);

    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const exists = await verifyObjectExists(masterPath);

    if (!exists) {
      return res.status(400).json({ error: 'Uploaded master file was not found' });
    }

    const { data: updatedTrack, error: updateError } = await supabaseAdmin
      .from('tracks')
      .update({
        master_path: masterPath,
        filename,
        updated_at: new Date().toISOString()
      })
      .eq('id', trackId)
      .select('id, catalog_code, title, master_path, filename')
      .single();

    if (updateError || !updatedTrack) {
      console.error('Master path update failed:', updateError && (updateError.message || updateError));
      return res.status(500).json({ error: 'Unable to update track master' });
    }

    await writeAudit(admin, req, track, masterPath, filename);

    return res.status(200).json({
      ok: true,
      masterPath: updatedTrack.master_path,
      filename: updatedTrack.filename,
      track: updatedTrack
    });
  } catch (err) {
    console.error('Admin finalize master upload failed:', err.message || err);
    return res.status(500).json({ error: 'Unable to finalize master upload' });
  }
};