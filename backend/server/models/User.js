const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    // "admin" was removed: there is a single elevated role, "super_admin".
    // Existing "admin" documents are migrated to "super_admin" on boot by
    // runMigrations() in server.js.
    enum: ['buyer', 'seller', 'delivery', 'user', 'super_admin'],
    default: 'buyer'
  },
  // A user cannot hold a session until this is true. Set by POST
  // /api/auth/verify-email. Legacy accounts are backfilled to true on boot so
  // existing customers are not locked out by the new requirement.
  is_verified: {
    type: Boolean,
    default: false
  },
  // Super-admin kill switch. A suspended account keeps its row and its data but
  // is refused by the auth middleware on every subsequent request, so a still
  // valid JWT cannot be used to keep acting.
  status: {
    type: String,
    enum: ['active', 'suspended'],
    default: 'active'
  },
  suspended_reason: {
    type: String,
    default: ''
  },
  // SHA-256 of the current email verification code. The plaintext code is never
  // stored, so a database leak cannot be replayed against /verify-email.
  verification_code_hash: {
    type: String,
    default: ''
  },
  verification_expires: {
    type: Date,
    default: null
  },
  verification_attempts: {
    type: Number,
    default: 0
  },
  last_login_at: {
    type: Date,
    default: null
  },
  last_login_ip: {
    type: String,
    default: ''
  },
  login_count: {
    type: Number,
    default: 0
  },
  region: {
    type: String,
    default: 'global'
  },
  avatar: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    default: ''
  },
  logistics_id: {
    type: String,
    default: ''
  },
  provider: {
    type: String,
    default: 'email'
  },
  // Incremented on password change. Tokens issued before the bump stop
  // working, so a password reset logs out every existing session.
  tokenVersion: {
    type: Number,
    default: 0
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

/** Constant-time string comparison used for OTP verification. */
userSchema.methods.matchesOtp = function(candidate) {
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(this.otpCode || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

/** Hash a verification code for storage. SHA-256 is correct here: the input is
 *  6 digits of high-entropy output from crypto.randomInt, not a password, so
 *  there is nothing to brute force against a fast hash. */
userSchema.statics.hashVerificationCode = function(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
};

/**
 * Issue a fresh verification code.
 *
 * Only the hash is persisted. The plaintext is returned to the caller so it can
 * be emailed, and — in development only, when no SMTP relay is configured —
 * shown on screen so the flow is testable without a mail account.
 */
userSchema.methods.issueVerificationCode = function(ttlMinutes, maxAttempts) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

  this.verification_code_hash = userSchema.statics.hashVerificationCode(code);
  this.verification_expires = new Date(Date.now() + ttlMinutes * 60 * 1000);
  this.verification_attempts = 0;

  return code;
};

/** True when a code is on file but past its expiry window. */
userSchema.methods.isVerificationExpired = function() {
  if (!this.verification_expires) return true;
  return Date.now() > this.verification_expires.getTime();
};

/** True once the attempt budget is spent, which forces a resend. */
userSchema.methods.isVerificationLockedOut = function(maxAttempts) {
  return (this.verification_attempts || 0) >= maxAttempts;
};

/** Compare a submitted code against the stored hash in constant time. */
userSchema.methods.matchesVerificationCode = function(candidate) {
  if (!this.verification_code_hash) return false;

  const provided = userSchema.statics.hashVerificationCode(candidate);
  const a = Buffer.from(provided, 'hex');
  const b = Buffer.from(this.verification_code_hash, 'hex');

  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
};

/** Mark the address proven and destroy the code so it cannot be replayed. */
userSchema.methods.markEmailVerified = function() {
  this.is_verified = true;
  this.verification_code_hash = '';
  this.verification_expires = null;
  this.verification_attempts = 0;
};

module.exports = mongoose.model('User', userSchema);
