const env = require('../config/env');
const audit = require('./audit');

/**
 * Google reCAPTCHA v2/v3 server-side verification.
 *
 * Talks to Google's siteverify endpoint with the raw token the browser produced.
 * The browser is never trusted to decide whether it passed the captcha — a
 * client-side-only check is trivially skipped by calling the API directly.
 *
 * Failure modes are all explicit, because "the captcha silently did nothing" is
 * the worst possible outcome:
 *
 *   not_configured -> captcha is off. In development this is tolerated so the
 *                     app is usable before keys are added. In production
 *                     config/env.js has already thrown at boot, so this branch
 *                     is unreachable there.
 *   missing_token  -> the browser never solved the widget. Always a rejection.
 *   timeout        -> Google did not answer in time. Treated as a rejection,
 *                     because failing open on an outage hands the attacker the
 *                     one moment they were waiting for.
 *   network_error  -> same reasoning as timeout.
 *   invalid        -> Google said no. Always a rejection.
 *
 * @returns {Promise<{ok: boolean, skipped?: boolean, reason: string, score?: number, hostname?: string, 'error-codes'?: string[]}>}
 */

const REQUEST_TIMEOUT_MS = 5000;

/**
 * True when the captcha is switched off and requests should pass through.
 * Separated out so the middleware and any non-HTTP caller share one answer.
 */
function isCaptchaDisabled() {
  return !env.RECAPTCHA_ENABLED;
}

async function verifyRecaptcha(token, req) {
  if (isCaptchaDisabled()) {
    return { ok: true, skipped: true, reason: 'not_configured' };
  }

  if (!token || typeof token !== 'string' || !token.trim()) {
    return { ok: false, reason: 'missing_token' };
  }

  // Google tokens are single-use and short-lived. Reject anything absurdly long
  // so a caller cannot push a large body into the form encoder.
  const trimmed = token.trim();
  if (trimmed.length > 4000) {
    return { ok: false, reason: 'malformed_token' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body = new URLSearchParams({
      secret: env.RECAPTCHA_SECRET_KEY,
      response: trimmed
    });

    // Google ties a v3 score to the caller's IP, which makes replay of a token
    // captured on another network much harder.
    const ip = audit.clientIp(req);
    if (ip) body.set('remoteip', ip);

    const response = await fetch(env.RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false, reason: 'verifier_unavailable', status: response.status };
    }

    const result = await response.json();

    if (!result || result.success !== true) {
      return {
        ok: false,
        reason: 'rejected',
        'error-codes': Array.isArray(result && result['error-codes']) ? result['error-codes'] : []
      };
    }

    return {
      ok: true,
      reason: 'verified',
      score: typeof result.score === 'number' ? result.score : undefined,
      hostname: typeof result.hostname === 'string' ? result.hostname : undefined
    };
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    return { ok: false, reason: aborted ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  verifyRecaptcha,
  isCaptchaDisabled
};
