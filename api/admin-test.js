const { requireAdmin } = require('./_adminAuth');

module.exports = async function handler(req, res) {
  const user = await requireAdmin(req, res);

  if (!user) {
    return;
  }

  return res.status(200).json({
    ok: true,
    email: user.email
  });
};