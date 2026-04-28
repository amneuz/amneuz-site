const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getRequestIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return (req.socket && req.socket.remoteAddress) || null;
}

function getRequestEndpoint(req) {
  return req.url || null;
}

async function writeAdminAuditLog(params) {
  try {
    const payload = {
      actor_user_id: params.actor_user_id || null,
      actor_email: params.actor_email || null,
      action: params.action,
      endpoint: params.endpoint || null,
      http_method: params.http_method || null,
      resource_type: params.resource_type || null,
      resource_id: params.resource_id || null,
      ip_address: params.ip_address || null,
      user_agent: params.user_agent || null,
      status: params.status || 'success',
      error_message: params.error_message || null,
      metadata: params.metadata || {}
    };

    await supabaseAdmin
      .from('admin_audit_logs')
      .insert([payload]);
  } catch (err) {
    console.error('Admin audit log failed:', err.message || err);
  }
}

async function requireAdmin(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';

  const endpoint = getRequestEndpoint(req);
  const httpMethod = req.method || null;
  const ipAddress = getRequestIp(req);
  const userAgent = req.headers['user-agent'] || null;

  if (!token) {
    await writeAdminAuditLog({
      action: 'admin.auth.missing_token',
      endpoint,
      http_method: httpMethod,
      ip_address: ipAddress,
      user_agent: userAgent,
      status: 'blocked',
      resource_type: 'admin_api'
    });

    res.status(401).json({ error: 'Missing authorization token' });
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data || !data.user) {
    await writeAdminAuditLog({
      action: 'admin.auth.invalid_token',
      endpoint,
      http_method: httpMethod,
      ip_address: ipAddress,
      user_agent: userAgent,
      status: 'blocked',
      resource_type: 'admin_api',
      error_message: error ? error.message : 'Invalid user token'
    });

    res.status(401).json({ error: 'Invalid authorization token' });
    return null;
  }

  const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const userEmail = String(data.user.email || '').toLowerCase().trim();

  if (!adminEmail || userEmail !== adminEmail) {
    await writeAdminAuditLog({
      actor_user_id: data.user.id,
      actor_email: data.user.email,
      action: 'admin.auth.forbidden',
      endpoint,
      http_method: httpMethod,
      ip_address: ipAddress,
      user_agent: userAgent,
      status: 'blocked',
      resource_type: 'admin_api',
      metadata: {
        expected_admin_configured: Boolean(adminEmail)
      }
    });

    res.status(403).json({ error: 'Admin access required' });
    return null;
  }

  await writeAdminAuditLog({
    actor_user_id: data.user.id,
    actor_email: data.user.email,
    action: 'admin.auth.verified',
    endpoint,
    http_method: httpMethod,
    ip_address: ipAddress,
    user_agent: userAgent,
    status: 'success',
    resource_type: 'admin_api'
  });

  return data.user;
}

module.exports = {
  requireAdmin,
  supabaseAdmin,
  writeAdminAuditLog,
  getRequestIp,
  getRequestEndpoint
};