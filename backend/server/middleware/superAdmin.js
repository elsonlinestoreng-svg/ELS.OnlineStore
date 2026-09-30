const auth = require('./auth');
const User = require('../models/User');
const { toObjectId } = require('../utils/security');

/**
 * The single elevated role.
 *
 * "super_admin" replaces the old "admin" role outright — there is no second
 * tier, so this guard is the whole privilege boundary for the dashboard. It
 * sees and can act on every user, store, order and payment on the platform.
 *
 * The role is re-read from the database on every request (the auth middleware
 * already loads the live user), so a demotion takes effect on the very next
 * call without needing a fresh login. A client-side "isAdmin" flag is never
 * consulted; hiding a link is presentation, not access control.
 */
module.exports = [auth, async (req, res, next) => {
  try {
    const userId = toObjectId(req.user && req.user.userId);
    if (!userId) {
      return res.status(403).json({ success: false, message: 'Super admin access required' });
    }

    const user = await User.findById(userId).select('role status');
    if (!user || user.role !== 'super_admin' || user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'Super admin access required' });
    }

    req.user.role = user.role;
    next();
  } catch (err) {
    console.error('Super admin middleware error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to authorize' });
  }
}];
