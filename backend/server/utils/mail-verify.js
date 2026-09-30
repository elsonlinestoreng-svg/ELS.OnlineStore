/**
 * Live SMTP reachability check.
 *
 * Why this exists: config/env.js decides whether email "is configured" by
 * looking for three non-empty strings. That cannot tell the difference between
 * a working relay and a password that the relay rejects, so a deployment with
 * credentials that were revoked, mistyped or never activated still passed every
 * startup check and reported "Email verification: required" — while every
 * verification email bounced, every new account was stranded unverified, and
 * nobody could sign in. The shop was open and unsellable at the same time.
 *
 * So the presence check stays cheap and the truth comes from the wire:
 * transporter.verify() opens a connection and authenticates. Nothing is sent.
 */

const nodemailer = require('nodemailer');
const env = require('../config/env');

/** Auth failures are permanent misconfiguration; the rest is usually transient. */
const PERMANENT_CODES = new Set([
  'EAUTH', 'EENVELOPE', 'ECONNECTION'
]);

/**
 * Result of the most recent check, so other modules do not each open a
 * connection to the relay.
 *
 * This is what makes the state reported over HTTP honest. `env.smtpConfigured`
 * only says the strings are non-empty; it cannot tell a working relay from a
 * password the provider rejects. Anything that tells a user "email is working"
 * must use this instead.
 */
let lastResult = null;

function getLastResult() {
  return lastResult;
}

function buildTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    // Verification must fail fast: a hung socket would stall startup, and a
    // timeout here is indistinguishable, from the caller's side, from no mail.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
}

/**
 * Authenticate against the configured relay without sending anything.
 *
 * @returns {Promise<{ok: boolean, reason?: string, permanent?: boolean, hint?: string}>}
 */
async function verifySmtp() {
  if (!env.smtpConfigured) {
    return { ok: false, reason: 'not_configured', hint: 'SMTP_HOST / SMTP_USER / SMTP_PASS are unset' };
  }

  try {
    await buildTransport().verify();
    return { ok: true, reachable: true };
  } catch (err) {
    const code = err && err.code ? String(err.code) : '';
    const message = (err && err.message) || 'unknown error';

    // The two mistakes that account for nearly every failure here, spelled out
    // because the raw provider error ("535 5.7.8 Authentication failed") does
    // not tell an operator which one they made.
    let hint;
    if (/auth|535|credentials|username|password/i.test(message)) {
      hint =
        'The relay rejected the credentials. Check SMTP_USER is the verified sender address ' +
        'and SMTP_PASS is the provider-issued SMTP key — not the account password you signed ' +
        'up with. Brevo issues keys under Senders & Domains -> SMTP & API.';
    } else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout/i.test(message)) {
      hint = 'The relay host could not be reached. Check SMTP_HOST and SMTP_PORT and any egress firewall.';
    }

    return {
      ok: false,
      reason: message,
      permanent: PERMANENT_CODES.has(code) || /auth|535/i.test(message),
      hint
    };
  }
}

/**
 * Log the resolved mail state.
 *
 * @param {{strict?: boolean}} options `strict: true` makes an auth failure
 *   fatal, which is what production wants: an unverified account can never sign
 *   in, so a broken relay means the shop cannot sell anything. Development
 *   stays non-fatal so the flow remains testable via the printed code.
 * @returns {Promise<boolean>} whether mail is usable
 */
async function reportSmtpStatus(options = {}) {
  const result = await verifySmtp();
  lastResult = result;

  if (result.ok) {
    console.log(
      `[config] SMTP relay: REACHABLE (${env.SMTP_HOST}:${env.SMTP_PORT}, from ${env.FROM_EMAIL || env.SMTP_USER})`
    );
    return true;
  }

  if (result.reason === 'not_configured') {
    if (env.EMAIL_VERIFICATION_REQUIRED) {
      console.warn(
        '[config] SMTP relay: NOT CONFIGURED while email verification is required. ' +
          'New accounts cannot be activated.'
      );
    } else {
      console.warn('[config] SMTP relay: not configured. Outbound email is disabled.');
    }
    return false;
  }

  console.error(`[config] SMTP relay: UNREACHABLE — ${result.reason}`);
  if (result.hint) console.error(`[config] ${result.hint}`);

  if (options.strict && env.isProd && result.permanent && env.EMAIL_VERIFICATION_REQUIRED) {
    throw new Error(
      '[FATAL] The SMTP relay rejected the configured credentials, but registration requires ' +
        'email verification. Every new account would be created unverified and could never sign ' +
        'in, so this shop could not take a single order. Refusing to start. Fix SMTP_PASS ' +
        '(and SMTP_USER) in .env, or set EMAIL_VERIFICATION_REQUIRED=false to run without it.'
    );
  }

  return false;
}

module.exports = { verifySmtp, reportSmtpStatus, getLastResult };
