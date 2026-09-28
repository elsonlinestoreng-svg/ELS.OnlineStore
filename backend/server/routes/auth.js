const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const auth = require('../middleware/auth');
const { isValidEmail, toObjectId, cleanText } = require('../utils/security');
const { sendOtpEmail, sendPasswordResetEmail } = require('../utils/mailer');

// Self-registration may only ever create a buyer. Elevated roles are granted
// exclusively by an admin or by the ADMIN_EMAIL bootstrap in server.js.
const SELF_REGISTER_ROLES = ['buyer'];

const MAX_OTP_ATTEMPTS = 5;
const otpStore = new Map();

/** Cleanup expired OTP entries so the Map cannot grow without bound. */
function sweepOtpStore() {
  const now = Date.now();
  for (const [key, entry] of otpStore.entries()) {
    if (now > entry.expires) otpStore.delete(key);
  }
}
setInterval(sweepOtpStore, 10 * 60 * 1000).unref();

/** Cryptographically secure 6-digit OTP (no Math.random). */
function generateOTP() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function signToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      tokenVersion: user.tokenVersion || 0
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRE, algorithm: 'HS256' }
  );
}

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts. Try again later.' }
});

function isStrongPassword(password) {
  if (typeof password !== 'string') return false;
  if (password.length < 8) return false;
  if (password.length > 200) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

router.get('/', (req, res) => {
  res.json({ success: true, message: 'Auth route active' });
});

// Register User
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword, region, provider } = req.body;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name must be a non-empty string' });
    }

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and include upper case, lower case and a number'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered. Please login instead.' });
    }

    // Any "role" supplied by the client is ignored. Self-registration always
    // produces a buyer; this closes a privilege-escalation hole where a
    // request body could set role: "admin".
    const requestedRole = typeof req.body.role === 'string' ? req.body.role : null;
    if (requestedRole && !SELF_REGISTER_ROLES.includes(requestedRole)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = new User({
      name: cleanText(name, 120),
      email: normalizedEmail,
      password,
      role: 'buyer',
      region: cleanText(region, 50) || 'global',
      provider: cleanText(provider, 30) || (/@gmail\.com$/i.test(normalizedEmail) ? 'gmail' : 'email')
    });
    await user.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token: signToken(user),
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, region: user.region, provider: user.provider }
    });
  } catch (err) {
    console.error('Register error:', err && err.message);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// Login User
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    if (!isValidEmail(email)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(String(password));
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // role/region/provider are NEVER taken from the request body. The previous
    // implementation let a caller overwrite their own role on every login,
    // which allowed instant self-promotion to admin.
    res.json({
      success: true,
      message: 'Login successful',
      token: signToken(user),
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        region: user.region,
        provider: user.provider
      }
    });
  } catch (err) {
    console.error('Login error:', err && err.message);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

// Verify Token
router.post('/verify', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    res.json({
      success: true,
      message: 'Token valid',
      user: { userId: decoded.userId, email: decoded.email }
    });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
});

// Send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'A valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Respond identically whether or not the address is registered, so this
    // cannot be used to enumerate accounts. Only send when the user exists.
    const genericResponse = () => res.json({
      success: true,
      message: 'If an account exists, a verification code has been sent'
    });

    if (!user) return genericResponse();

    const code = generateOTP();
    otpStore.set(normalizedEmail, {
      code,
      expires: Date.now() + 10 * 60 * 1000,
      attempts: 0,
      userId: user._id.toString()
    });

    // The code is never returned in the response. It has to actually reach
    // the mailbox, otherwise this endpoint is a no-op and OTP sign-in is
    // impossible. The response stays identical whether or not delivery
    // worked so it cannot be used to probe which addresses have accounts.
    const delivery = await sendOtpEmail({ to: user.email, code });
    if (!delivery.delivered && delivery.reason !== 'smtp-not-configured') {
      otpStore.delete(normalizedEmail);
      return res.status(500).json({ success: false, message: 'Could not send the verification code' });
    }

    res.json({ success: true, message: 'If an account exists, a verification code has been sent' });
  } catch (err) {
    console.error('Send OTP error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// Verify OTP
router.post('/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and OTP code are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'A valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const stored = otpStore.get(normalizedEmail);
    if (!stored) {
      return res.status(400).json({ success: false, message: 'No OTP requested or OTP expired' });
    }

    if (Date.now() > stored.expires) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ success: false, message: 'OTP has expired. Request a new one' });
    }

    // Brute-force protection: the OTP is only 6 digits, so without a lockout
    // an attacker could enumerate all one million values.
    if (stored.attempts >= MAX_OTP_ATTEMPTS) {
      otpStore.delete(normalizedEmail);
      return res.status(429).json({ success: false, message: 'Too many incorrect codes. Request a new OTP.' });
    }

    const provided = String(code).trim();
    const a = Buffer.from(provided);
    const b = Buffer.from(String(stored.code));
    const matches = a.length === b.length && crypto.timingSafeEqual(a, b);

    if (!matches) {
      stored.attempts += 1;
      return res.status(400).json({ success: false, message: 'Invalid OTP code' });
    }

    otpStore.delete(normalizedEmail);

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account found with this email' });
    }

    res.json({
      success: true,
      message: 'OTP verified successfully',
      token: signToken(user),
      user: { _id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (err) {
    console.error('Verify OTP error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
});

/**
 * Send Password Reset.
 *
 * The reset token is NEVER returned in the response. Previously the endpoint
 * returned `token` and `resetUrl`, which let anyone take over any account by
 * requesting a reset for a victim's email address.
 *
 * The redirect base URL is taken from the trusted APP_ORIGIN config rather
 * than the request body, preventing an attacker from using this endpoint to
 * generate a legitimate-looking link pointing at a domain they control.
 */
router.post('/send-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'A valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Always respond identically so the endpoint cannot be used to enumerate
    // which email addresses have accounts.
    const genericResponse = res.json({
      success: true,
      ok: true,
      message: 'If an account exists, a reset link has been sent'
    });

    if (!user) return genericResponse;

    const resetToken = jwt.sign(
      {
        userId: user._id.toString(),
        purpose: 'password-reset',
        // Bind the token to the user's current token version. A successful
        // reset increments that version, so this token can never be replayed.
        tokenVersion: user.tokenVersion || 0
      },
      env.JWT_SECRET,
      { expiresIn: '1h', algorithm: 'HS256' }
    );
    const resetUrl = `${env.APP_ORIGIN}/#reset=${resetToken}`;

    // Delivery failure must not change the response: the caller always sees
    // the same generic message so this endpoint cannot enumerate accounts.
    const delivery = await sendPasswordResetEmail({ to: user.email, resetUrl });
    if (!delivery.delivered) {
      console.warn(`[send-reset] delivery not completed for ${user.email}: ${delivery.reason}`);
    }

    return genericResponse;
  } catch (err) {
    console.error('Send reset error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to process reset request' });
  }
});

// Validate Reset Token
router.get('/validate-reset', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({ success: false, message: 'Invalid reset token' });
    }

    const userId = toObjectId(decoded.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid reset token' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // A reset token is bound to the token version it was issued for. Once the
    // password is reset that version moves on, so the link is single-use.
    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(400).json({ success: false, message: 'This reset link has already been used' });
    }

    res.json({ success: true, ok: true, message: 'Token valid' });
  } catch (err) {
    res.status(400).json({ success: false, ok: false, message: 'Invalid or expired reset token' });
  }
});

// Complete Password Reset
router.post('/reset-complete', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters and include upper case, lower case and a number'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Reset link has expired. Request a new one' });
    }

    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({ success: false, message: 'Invalid reset token' });
    }

    const userId = toObjectId(decoded.userId);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid reset token' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(400).json({ success: false, message: 'This reset link has already been used' });
    }

    user.password = newPassword;
    // Invalidate every previously issued token by bumping the token version.
    // This also makes the reset token itself single-use.
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();

    res.json({ success: true, ok: true, message: 'Password reset successful. You can now login.' });
  } catch (err) {
    console.error('Reset complete error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

// Get Profile
// Protected by the shared auth middleware so the token signature, algorithm,
// tokenVersion and a live user lookup are all enforced in one place.
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, user });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// Update Profile
router.put('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // "email" is deliberately not updatable here. Allowing an authenticated
    // user to change their own email without re-verification is a common
    // account-takeover path via the password-reset flow.
    const allowedFields = ['name', 'phone', 'avatar', 'bio', 'logistics_id'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        user[field] = cleanText(req.body[field], field === 'bio' ? 1000 : 300);
      }
    }

    await user.save();

    const safeUser = await User.findById(user._id).select('-password');
    res.json({ success: true, message: 'Profile updated', user: safeUser });
  } catch (err) {
    console.error('Profile update failed:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

module.exports = router;
