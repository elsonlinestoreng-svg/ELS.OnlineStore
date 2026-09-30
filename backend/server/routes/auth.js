const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const auth = require('../middleware/auth');
const requireRecaptcha = require('../middleware/recaptcha');
const audit = require('../services/audit');
const { isValidEmail, toObjectId, cleanText } = require('../utils/security');
const {
  sendOtpEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail
} = require('../utils/mailer');
const { getLastResult } = require('../utils/mail-verify');

// Self-registration may only ever create a buyer. Elevated roles are granted
// exclusively by a super admin or by the SUPER_ADMIN_EMAIL bootstrap in
// server.js.
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

// Resending is deliberately far more restricted than verifying. Verification is
// cheap to rate limit by attempt count; sending costs a real outbound SMTP
// connection, so an unthrottled resend endpoint is a way to make the server
// send mail to an arbitrary address on request.
const resendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many codes requested. Try again in a few minutes.' }
});

/** The public shape of a user. Never includes the password or code hash. */
function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    region: user.region,
    provider: user.provider,
    is_verified: Boolean(user.is_verified)
  };
}

/**
 * Development-only escape hatch.
 *
 * With no SMTP relay configured there is no way to deliver a code, so a
 * mandatory verification gate would make the app unusable. config/env.js
 * already refuses to boot in production under these conditions, so this can
 * only ever return a value on a developer machine. The `dev_code` key is
 * explicitly namespaced so no frontend would ever surface it by accident, and
 * the console warning makes the state impossible to miss.
 */
function devCodeFallback(code) {
  if (env.isProd || env.smtpConfigured) return undefined;
  console.warn(
    `\n[auth] SMTP is not configured, so the verification email was not sent.\n` +
      `[auth] Development-only code for this account: ${code}\n` +
      `[auth] Set SMTP_HOST / SMTP_USER / SMTP_PASS / FROM_EMAIL in .env to send real email.\n`
  );
  return code;
}

/** Shared guard applied on every path that mints a session. */
function assertCanHoldSession(user) {
  if (user.status === 'suspended') {
    return {
      code: 403,
      body: {
        success: false,
        message: 'This account has been suspended. Contact support if you think this is a mistake.',
        suspended: true
      }
    };
  }

  if (env.EMAIL_VERIFICATION_REQUIRED && !user.is_verified) {
    // Nothing is sent from here, so there is no per-request delivery result.
    // The startup reachability check is still the right signal: when the relay
    // rejected its credentials, the code the modal asks for is not coming, and
    // the customer must be told rather than left waiting on a message that
    // cannot be sent. Sourced from the same cached check that backs
    // /config/public, so it reveals nothing new to an anonymous caller.
    const mail = getLastResult();
    const relayBroken = Boolean(mail) && !mail.ok && mail.reason !== 'not_configured';

    return {
      code: 403,
      body: {
        success: false,
        message: 'Please verify your email address before signing in.',
        requires_verification: true,
        email: user.email,
        ...(relayBroken ? { email_delivered: false } : {})
      }
    };
  }

  return null;
}

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
//
// The response no longer contains a token. Registration now proves the address
// first: a user who cannot read the email never receives a session, so a typo,
// a typo-squatter domain or a throwaway address cannot be used to squat on an
// account or to grief the support inbox.
router.post('/register', requireRecaptcha('auth.register'), async (req, res) => {
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
      audit.record(req, {
        action: 'auth.register',
        outcome: 'failure',
        description: `Registration refused: ${normalizedEmail} already registered`,
        actor: { email: normalizedEmail },
        metadata: { reason: 'email_taken' }
      });
      return res.status(400).json({ success: false, message: 'Email already registered. Please login instead.' });
    }

    // Any "role" supplied by the client is ignored. Self-registration always
    // produces a buyer; this closes a privilege-escalation hole where a
    // request body could set role: "super_admin".
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
      provider: cleanText(provider, 30) || (/@gmail\.com$/i.test(normalizedEmail) ? 'gmail' : 'email'),
      is_verified: false,
      status: 'active'
    });

    const code = user.issueVerificationCode(
      env.EMAIL_VERIFICATION_TTL_MINUTES,
      env.MAX_VERIFICATION_ATTEMPTS
    );

    await user.save();

    audit.record(req, {
      action: 'auth.register',
      outcome: 'success',
      description: `Account created for ${user.email}, awaiting email verification`,
      actor: { userId: user._id, email: user.email, role: user.role },
      entityType: 'user',
      entityId: user._id.toString(),
      metadata: { region: user.region, provider: user.provider }
    });

    // Delivery is best-effort. The account row already exists, so a mail outage
    // must not lose the registration — the user can request a new code, and
    // the resend endpoint is rate limited.
    const delivery = await sendVerificationEmail({
      to: user.email,
      name: user.name,
      code,
      ttlMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES
    });

    if (!delivery.delivered) {
      console.warn(
        `[register] verification email not delivered for ${user.email}: ${delivery.reason}`
      );
    }

    const payload = {
      success: true,
      message: 'Account created. Check your email for the verification code.',
      requires_verification: true,
      email: user.email,
      // How the client should behave. With no relay the code is surfaced in
      // development only, so the UI can explain why no mail arrived.
      email_delivered: Boolean(delivery.delivered)
    };

    const devCode = devCodeFallback(code);
    if (devCode) payload.dev_code = devCode;

    res.status(201).json(payload);
  } catch (err) {
    console.error('Register error:', err && err.message);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

/**
 * POST /api/auth/verify-email
 *
 * Exchanges the emailed code for a session, so a correctly registered user
 * never has to type their password twice.
 */
router.post('/verify-email', otpLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email and code are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'A valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Uniform response for unknown address, wrong code and exhausted attempts.
    // Differentiating them would let an attacker confirm which addresses have
    // accounts.
    const genericFailure = (detail) => {
      audit.record(req, {
        action: 'auth.verify_email',
        outcome: 'failure',
        description: `Email verification failed for ${normalizedEmail}`,
        actor: { userId: user && user._id, email: normalizedEmail, role: user && user.role },
        metadata: { reason: detail }
      });
      return res.status(400).json({ success: false, message: 'That code is not valid. Request a new one and try again.' });
    };

    if (!user) return genericFailure('unknown_account');
    if (user.is_verified) {
      return res.json({
        success: true,
        already_verified: true,
        message: 'This address is already verified. Please sign in.',
        token: signToken(user),
        user: publicUser(user)
      });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ success: false, message: 'This account has been suspended.' });
    }

    if (user.isVerificationLockedOut(env.MAX_VERIFICATION_ATTEMPTS)) {
      return res.status(429).json({
        success: false,
        message: 'Too many incorrect codes. Request a new one to continue.'
      });
    }

    if (user.isVerificationExpired()) {
      return res.status(400).json({
        success: false,
        message: 'That code has expired. Request a new one.',
        code_expired: true
      });
    }

    if (!user.matchesVerificationCode(String(code).trim())) {
      user.verification_attempts = (user.verification_attempts || 0) + 1;
      await user.save();
      return genericFailure('invalid_code');
    }

    user.markEmailVerified();
    user.last_login_at = new Date();
    user.last_login_ip = audit.clientIp(req).slice(0, 64);
    user.login_count = (user.login_count || 0) + 1;
    await user.save();

    audit.record(req, {
      action: 'auth.verify_email',
      outcome: 'success',
      description: `Email verified for ${user.email}`,
      actor: { userId: user._id, email: user.email, role: user.role },
      entityType: 'user',
      entityId: user._id.toString()
    });

    // Fires without awaiting the response so a mail relay stall cannot delay
    // the newly verified customer from getting their session.
    sendWelcomeEmail({ to: user.email, name: user.name }).catch((err) => {
      console.warn('[verify-email] welcome email failed:', err && err.message);
    });

    res.json({
      success: true,
      message: 'Email verified. Welcome aboard!',
      token: signToken(user),
      user: publicUser(user)
    });
  } catch (err) {
    console.error('Verify email error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to verify the code' });
  }
});

/**
 * POST /api/auth/resend-verification
 *
 * Rate limited harder than verification because each call costs an outbound
 * SMTP connection.
 */
router.post('/resend-verification', resendLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'A valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // One response builder, used by every branch, because the previous version
    // had two shapes: the branches that returned early omitted `email_delivered`,
    // while the branch that actually sent mail included it. Byte-for-byte
    // comparing the two responses told an anonymous caller which addresses have
    // an unverified account — the exact thing the generic message exists to
    // prevent. `delivered: false` is also the truthful value on every early
    // return, since no message was sent.
    const respond = (delivery) =>
      res.json({
        success: true,
        message: 'If the account needs verifying, a new code has been sent.',
        email_delivered: Boolean(delivery && delivery.delivered),
        // Development-only, and therefore a real (if minor) enumeration side
        // channel: a dev_code is only ever present for an address that has an
        // unverified account. It cannot exist for the early returns, so the
        // response shape still differs there. Acceptable because the field is
        // unreachable in production, where devCodeFallback() returns undefined;
        // the alternative would be issuing a decoy code that appears valid and
        // is not, which is worse.
        ...(delivery && delivery.dev_code ? { dev_code: delivery.dev_code } : {})
      });

    if (!user) return respond(null);
    if (user.is_verified) return respond(null);
    if (user.status === 'suspended') return respond(null);

    const code = user.issueVerificationCode(
      env.EMAIL_VERIFICATION_TTL_MINUTES,
      env.MAX_VERIFICATION_ATTEMPTS
    );
    await user.save();

    audit.record(req, {
      action: 'auth.resend_verification',
      outcome: 'success',
      description: `New verification code issued for ${user.email}`,
      actor: { userId: user._id, email: user.email, role: user.role },
      entityType: 'user',
      entityId: user._id.toString()
    });

    const delivery = await sendVerificationEmail({
      to: user.email,
      name: user.name,
      code,
      ttlMinutes: env.EMAIL_VERIFICATION_TTL_MINUTES
    });

    if (!delivery.delivered) {
      console.warn(`[resend-verification] not delivered for ${user.email}: ${delivery.reason}`);
    }

    const devCode = devCodeFallback(code);

    return respond(Object.assign({ delivered: true }, delivery, {
      ...(devCode ? { dev_code: devCode } : {})
    }));
  } catch (err) {
    console.error('Resend verification error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to send a new code' });
  }
});

// Login User
router.post('/login', requireRecaptcha('auth.login'), async (req, res) => {
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
      audit.record(req, {
        action: 'auth.login',
        outcome: 'failure',
        description: `Failed sign-in for unknown address ${email.trim().toLowerCase()}`,
        actor: { email: email.trim().toLowerCase() },
        metadata: { reason: 'unknown_account' }
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(String(password));
    if (!isMatch) {
      audit.record(req, {
        action: 'auth.login',
        outcome: 'failure',
        description: `Failed sign-in for ${user.email} (wrong password)`,
        actor: { userId: user._id, email: user.email, role: user.role },
        entityType: 'user',
        entityId: user._id.toString(),
        metadata: { reason: 'bad_password' }
      });
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Correct password, but the account may still be unable to hold a session.
    const blocked = assertCanHoldSession(user);
    if (blocked) {
      audit.record(req, {
        action: 'auth.login',
        outcome: 'denied',
        description: blocked.body.suspended
          ? `Sign-in denied for suspended account ${user.email}`
          : `Sign-in blocked pending email verification for ${user.email}`,
        actor: { userId: user._id, email: user.email, role: user.role },
        entityType: 'user',
        entityId: user._id.toString(),
        metadata: { reason: blocked.body.suspended ? 'suspended' : 'unverified_email' }
      });
      return res.status(blocked.code).json(blocked.body);
    }

    user.last_login_at = new Date();
    user.last_login_ip = audit.clientIp(req).slice(0, 64);
    user.login_count = (user.login_count || 0) + 1;
    await user.save();

    audit.record(req, {
      action: 'auth.login',
      outcome: 'success',
      description: `${user.email} signed in as ${user.role}`,
      actor: { userId: user._id, email: user.email, role: user.role },
      entityType: 'user',
      entityId: user._id.toString()
    });

    // role/region/provider are NEVER taken from the request body. The previous
    // implementation let a caller overwrite their own role on every login,
    // which allowed instant self-promotion to super_admin.
    res.json({
      success: true,
      message: 'Login successful',
      token: signToken(user),
      user: publicUser(user)
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

    // A suspended account is not emailed a code. The response stays generic so
    // this still cannot be used to probe which addresses exist.
    if (user.status === 'suspended') return genericResponse();

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

    // This path mints a session too, so it needs the same gate as password
    // login. Without it, verifying an email code would become a way around a
    // suspension or around the email-verification requirement.
    const blocked = assertCanHoldSession(user);
    if (blocked) {
      audit.record(req, {
        action: 'auth.verify_otp',
        outcome: 'denied',
        description: `OTP sign-in denied for ${user.email}`,
        actor: { userId: user._id, email: user.email, role: user.role },
        entityType: 'user',
        entityId: user._id.toString(),
        metadata: { reason: blocked.body.suspended ? 'suspended' : 'unverified_email' }
      });
      return res.status(blocked.code).json(blocked.body);
    }

    user.last_login_at = new Date();
    user.last_login_ip = audit.clientIp(req).slice(0, 64);
    user.login_count = (user.login_count || 0) + 1;
    await user.save();

    audit.record(req, {
      action: 'auth.verify_otp',
      outcome: 'success',
      description: `${user.email} signed in with a one-time code`,
      actor: { userId: user._id, email: user.email, role: user.role },
      entityType: 'user',
      entityId: user._id.toString()
    });

    res.json({
      success: true,
      message: 'OTP verified successfully',
      token: signToken(user),
      user: publicUser(user)
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
