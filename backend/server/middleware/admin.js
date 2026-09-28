const auth = require('./auth');
const User = require('../models/User');
const { toObjectId } = require('../utils/security');

// Admin-only guard. The role is read from the database on every request (auth
// middleware also loads the live user), so promotion and demotion take effect
// immediately without needing a fresh login.
module.exports = [auth, async (req, res, next) => {
  try {
    const userId = toObjectId(req.user && req.user.userId);
    if (!userId) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const user = await User.findById(userId).select('role');
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    req.user.role = user.role;
    next();
  } catch (err) {
    console.error('Admin middleware error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to authorize admin' });
  }
}];
