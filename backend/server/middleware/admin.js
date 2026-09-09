const auth = require('./auth');
const User = require('../models/User');

// Admin-only guard — verifies the DB role on every request so newly promoted
// admins take effect immediately without needing a fresh login token.
module.exports = [auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select('role');
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.user.role = user.role;
    next();
  } catch (err) {
    console.error('Admin middleware error:', err);
    res.status(500).json({ success: false, message: 'Failed to authorize admin' });
  }
}];
