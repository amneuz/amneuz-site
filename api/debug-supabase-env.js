module.exports = async (req, res) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const url = process.env.SUPABASE_URL || '';

  let role = null;

  try {
    const payload = JSON.parse(
      Buffer.from(key.split('.')[1], 'base64').toString()
    );
    role = payload.role;
  } catch (err) {
    role = 'not_jwt_or_invalid';
  }

  return res.status(200).json({
    hasUrl: Boolean(url),
    url,
    hasKey: Boolean(key),
    keyStartsWith: key.slice(0, 12),
    keyType: key.startsWith('eyJ') ? 'jwt_legacy_key' : key.startsWith('sb_') ? 'new_secret_key' : 'unknown',
    role
  });
};