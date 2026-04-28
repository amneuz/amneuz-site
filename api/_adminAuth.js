const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';

  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data || !data.user) {
    res.status(401).json({ error: 'Invalid authorization token' });
    return null;
  }

  const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const userEmail = String(data.user.email || '').toLowerCase().trim();

  if (!adminEmail || userEmail !== adminEmail) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }

  return data.user;
}

module.exports = {
  requireAdmin,
  supabaseAdmin
};