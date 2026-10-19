/**
 * Centralised environment / secret handling.
 *
 * Rule: never fall back to a hardcoded secret. A hardcoded fallback means that
 * if the deployment forgets to set the variable, every JWT in the system becomes
 * forgeable with a value that is public in the repository.
 */

const crypto = require('crypto');
const path = require('path');

// Load .env here rather than relying on the entrypoint to have done it.
//
// This module is the single place that reads process.env, so it cannot also
// depend on someone else having populated it first. It previously did: only
// server.js and seed.js called dotenv.config(), so any other consumer that
// required this file directly (a script, a migration, a test) saw every
// variable as undefined. That is not a harmless no-op here, because
// requireSecret() cannot tell "not loaded" from "genuinely unset" — in
// production it threw, and in development it silently generated an ephemeral
// JWT secret, making such a tool behave differently from the real server.
//
// dotenv does not overwrite variables that are already set, so a real
// environment (container, systemd, CI) still takes precedence over the file,
// and calling this alongside the entrypoint's own dotenv.config() is a no-op.
try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
} catch (err) {
  // dotenv unavailable or the file missing. Real environment variables still
  // apply, and the checks below decide whether that is acceptable.
}

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

// ---------------------------------------------------------------------------
// Super admin bootstrap
// ---------------------------------------------------------------------------
// There is a single elevated role: "super_admin". It replaces the old "admin"
// role, which is migrated on boot (see server.js runMigrations).
//
// SUPER_ADMIN_EMAIL is the bootstrap: this address is promoted to super_admin
// every time the server starts, which is the recovery path if the role is ever
// lost. ADMIN_EMAIL is still read as a fallback so existing deployments do not
// silently lose their only admin on the next deploy.
const SUPER_ADMIN_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL || ''
).trim().toLowerCase();

// ---------------------------------------------------------------------------
// reCAPTCHA
// ---------------------------------------------------------------------------
// Three-state control so the failure modes are explicit rather than silent:
//
//   unset  -> auto. Enabled when BOTH keys are present, disabled otherwise.
//   true   -> the operator has demanded enforcement. Missing keys is a
//             misconfiguration and is FATAL in production, so a deployment
//             can never quietly run with the captcha silently off.
//   false  -> force off (local development).
const RECAPTCHA_SITE_KEY = (process.env.RECAPTCHA_SITE_KEY || '').trim();
const RECAPTCHA_SECRET_KEY = (process.env.RECAPTCHA_SECRET_KEY || '').trim();

const BOOLEAN_VALUES = ['true', 'false', '1', '0', 'yes', 'no'];

/**
 * Resolve whether captcha enforcement is actually on.
 *
 * The returned value is the single source of truth: services/recaptcha.js
 * branches on env.RECAPTCHA_ENABLED and nothing else. That is why the
 * "requested but unconfigured" branch below must *return* false in development
 * rather than merely warn. Warning and then leaving the flag true produced a
 * process that claimed the captcha was disabled while every register, login and
 * checkout was in fact demanding a token that could never verify, because the
 * secret key was empty.
 */
function resolveRecaptchaEnabled() {
  const raw = (process.env.RECAPTCHA_ENABLED || '').trim().toLowerCase();
  const hasKeys = Boolean(RECAPTCHA_SITE_KEY && RECAPTCHA_SECRET_KEY);

  if (process.env.RECAPTCHA_ENABLED && !BOOLEAN_VALUES.includes(raw)) {
    console.warn('[WARN] RECAPTCHA_ENABLED must be "true" or "false". Falling back to auto-detection.');
  }

  if (raw === 'false' || raw === '0' || raw === 'no') return false;

  const requested = raw === 'true' || raw === '1' || raw === 'yes';

  if (requested && !hasKeys) {
    const message =
      '[FATAL] reCAPTCHA is enabled but RECAPTCHA_SITE_KEY / RECAPTCHA_SECRET_KEY are missing. ' +
      'Set both keys, or set RECAPTCHA_ENABLED=false to run without it.';

    // Failing closed here is the whole point. If enforcement was requested and
    // the keys are absent, booting anyway would leave register/login/payment
    // wide open while the operator believes a captcha is protecting them.
    if (isProd) throw new Error(message);

    console.warn(`[WARN] ${message} Disabling reCAPTCHA for this development process.`);
    return false;
  }

  return requested || hasKeys;
}

const RECAPTCHA_ENABLED = resolveRecaptchaEnabled();

// v3 returns a 0.0–1.0 score on every successful verify. Google's own
// guidance is to start at 0.5 and tune; without a threshold a bot that
// clears Google's default checks would still pass with success:true.
// Unset or malformed -> 0.5. Clamped to [0, 1] so a typo like "5" cannot
// reject every legitimate user.
const RECAPTCHA_MIN_SCORE = (() => {
  const raw = parseFloat(process.env.RECAPTCHA_MIN_SCORE);
  if (!Number.isFinite(raw)) return 0.5;
  return Math.min(1, Math.max(0, raw));
})();

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------
// Mandatory by default: a user must prove they control the address before they
// can hold a session. Set EMAIL_VERIFICATION_REQUIRED=false to opt out.
//
// Verification is only meaningful if the code can actually be delivered. If
// the gate is on but SMTP is unconfigured, nobody could ever verify, so
// production refuses to boot rather than shipping a permanently locked shop.
const EMAIL_VERIFICATION_REQUIRED = !(
  String(process.env.EMAIL_VERIFICATION_REQUIRED || '').trim().toLowerCase() === 'false' ||
  String(process.env.EMAIL_VERIFICATION_REQUIRED || '').trim().toLowerCase() === '0'
);

const EMAIL_VERIFICATION_TTL_MINUTES = Math.max(
  5,
  parseInt(process.env.EMAIL_VERIFICATION_TTL_MINUTES || '15', 10) || 15
);

const MAX_VERIFICATION_ATTEMPTS = Math.max(
  1,
  parseInt(process.env.MAX_VERIFICATION_ATTEMPTS || '5', 10) || 5
);

const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

if (EMAIL_VERIFICATION_REQUIRED && !smtpConfigured) {
  const message =
    '[FATAL] EMAIL_VERIFICATION_REQUIRED is on but SMTP_HOST / SMTP_USER / SMTP_PASS are not set, ' +
    'so no verification code can be delivered and nobody could ever log in. ' +
    'Add the SMTP credentials, or set EMAIL_VERIFICATION_REQUIRED=false.';

  if (isProd) throw new Error(message);
  // Development keeps running so the flow is testable: mailer.js prints the code
  // to the console and the auth routes return it as `dev_code`, clearly marked.
  console.warn(`[WARN] ${message}\n[WARN] Running in development fallback mode: codes are printed to the console and returned in the API response.`);
}

module.exports = {
  isProd,
  JWT_SECRET,
  JWT_EXPIRE,
  CORS_ORIGINS,
  MONGO_URI: process.env.MONGO_URI,
  PORT: process.env.PORT || 8001,
  SUPER_ADMIN_EMAIL,
  // Retained so routes/contact.js keeps routing support mail to the super
  // admin. Same value; the old name is kept only to avoid touching that file.
  ADMIN_EMAIL: SUPER_ADMIN_EMAIL,
  RECAPTCHA_ENABLED,
  RECAPTCHA_SITE_KEY,
  RECAPTCHA_SECRET_KEY,
  RECAPTCHA_MIN_SCORE,
  RECAPTCHA_VERIFY_URL: 'https://www.google.com/recaptcha/api/siteverify',
  EMAIL_VERIFICATION_REQUIRED,
  EMAIL_VERIFICATION_TTL_MINUTES,
  MAX_VERIFICATION_ATTEMPTS,
  smtpConfigured,
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
  APP_ORIGIN: (process.env.APP_ORIGIN || 'http://localhost:8081').replace(/\/+$/, ''),
  // Number of proxy hops in front of the app. Needed for correct client IPs in
  // the audit log and for express-rate-limit not to treat every visitor as one
  // shared client behind a load balancer. 0 = no proxy.
  TRUST_PROXY: (() => {
    const raw = String(process.env.TRUST_PROXY || '').trim();
    if (!raw) return false;
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    return true;
  })()
};
