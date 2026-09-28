/**
 * Centralised environment / secret handling.
 *
 * Rule: never fall back to a hardcoded secret. A hardcoded fallback means that
 * if the deployment forgets to set the variable, every JWT in the system becomes
 * forgeable with a value that is public in the repository.
 */

const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

function requireSecret(name) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    if (isProd) {
      throw new Error(
        `[FATAL] ${name} is not set. Refusing to start with an insecure default.`
      );
    }
    // Development only: generate a random, per-process secret. Tokens do not
    // survive a restart, which is the correct trade-off for dev.
    const ephemeral = crypto.randomBytes(48).toString('hex');
    console.warn(
      `[WARN] ${name} is not set. Using a random ephemeral secret. ` +
        'All tokens will be invalidated on restart.'
    );
    return ephemeral;
  }

  if (isProd && value.length < 32) {
    throw new Error(
      `[FATAL] ${name} is too short for production (min 32 characters).`
    );
  }

  return value;
}

const JWT_SECRET = requireSecret('JWT_SECRET');
const JWT_EXPIRE = process.env.JWT_EXPIRE || '1d';

// Comma-separated allowlist. Falls back to same-origin only in production.
function buildCorsAllowlist() {
  const raw = process.env.CORS_ORIGINS;
  if (!raw || !raw.trim()) {
    if (isProd) {
      console.warn(
        '[WARN] CORS_ORIGINS is not set. Only same-origin requests will be allowed.'
      );
    }
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

const CORS_ORIGINS = buildCorsAllowlist();

module.exports = {
  isProd,
  JWT_SECRET,
  JWT_EXPIRE,
  CORS_ORIGINS,
  MONGO_URI: process.env.MONGO_URI,
  PORT: process.env.PORT || 8001,
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  FROM_EMAIL: process.env.FROM_EMAIL,
  // Used to build password-reset links server-side instead of trusting the
  // client-supplied origin (which would allow a phishing redirect).
  APP_ORIGIN: (process.env.APP_ORIGIN || 'http://localhost:8081').replace(/\/+$/, '')
};
