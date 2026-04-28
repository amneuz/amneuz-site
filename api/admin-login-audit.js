const { supabaseAdmin, getRequestIp } = require('./_adminAuth');

const ALLOWED_ACTIONS = [
  'admin.login.success',
  'admin.login.failed',
  'admin.logout.manual',
  'admin.logout.timeout'
];

function getEndpoint(req) {
  return req.url || '/api/admin-login-audit';
}

async function getUserFromToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';

  if (!token) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data || !data.user) {
    return null;
  }

  return data.user;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = {};

  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  } catch (err) {
    body = {};
  }

  const action = String(body.action || '').trim();
  const attemptedEmail = String(body.email || '').toLowerCase().trim();

  if (ALLOWED_ACTIONS.indexOf(action) === -1) {
    return res.status(400).json({ error: 'Invalid audit action' });
  }

  const user = await getUserFromToken(req);
  const userAgent = req.headers['user-agent'] || null;
  const ipAddress = getRequestIp(req);
  const status = action === 'admin.login.failed' ? 'failed' : 'success';

  const payload = {
    actor_user_id: user ? user.id : null,
    actor_email: user ? user.email : attemptedEmail || null,
    action,
    endpoint: getEndpoint(req),
    http_method: req.method,
    ip_address: ipAddress,
    user_agent: userAgent,
    status,
    resource_type: 'admin_auth',
    metadata: {
      attempted_email: attemptedEmail || null
    }
  };

  const { error } = await supabaseAdmin
    .from('admin_audit_logs')
    .insert([payload]);

  if (error) {
    console.error('Admin login audit insert failed:', error.message || error);

    return res.status(500).json({
      ok: false,
      error: 'Unable to write audit log'
    });
  }

  return res.status(200).json({ ok: true });
};