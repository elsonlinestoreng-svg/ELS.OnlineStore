const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const { toObjectId } = require('../utils/security');

/**
 * Verifies the bearer token and resolves the live user record.
 *
 * The user is re-read from the database on every request so that a deleted or
 * suspended account cannot keep acting with a still-valid token.
 */
module.exports = async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Pin the algorithm so a token signed with "none" or an asymmetric
    // algorithm confusion cannot be accepted.
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256']
    });

    const userId = toObjectId(decoded && decoded.userId);
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
    }

    const user = await User.findById(userId).select('role email name region provider tokenVersion');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Account no longer exists.' });
    }

    // A password reset bumps tokenVersion, invalidating every token issued
    // before the change.
    const tokenVersion = typeof decoded.tokenVersion === 'number' ? decoded.tokenVersion : 0;
    if ((user.tokenVersion || 0) !== tokenVersion) {
      return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
    }

    // Attach the authoritative database values. Never trust role/email from
    // the token payload, which is attacker-controlled until expiry.
    req.user = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
      region: user.region,
      provider: user.provider
    };

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
};
