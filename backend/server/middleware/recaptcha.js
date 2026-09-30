const { verifyRecaptcha } = require('../services/recaptcha');
const audit = require('../services/audit');

/**
 * Server-side captcha gate.
 *
 * Accepts the token from any of three places, in priority order:
 *   1. req.body.recaptcha_token  (JSON, the normal case)
 *   2. req.body['g-recaptcha-response']  (the field name Google's own widget
 *      posts when it submits a form natively)
 *   3. req.headers['x-recaptcha-token']  (for callers that cannot post a body)
 *
 * Error messages are deliberately vague about *why* a captcha failed. Telling a
 * caller "your score was too low" or "input-xxx was a bot" hands an attacker a
 * tuning signal. Every failure returns the same 400.
 *
 * The action is recorded in the audit trail because repeated captcha failures
 * against one action are exactly the kind of thing the super admin dashboard
 * needs to show.
 *
 * @param {string} action  Audit action key, e.g. 'auth.register'.
 */
function requireRecaptcha(action) {
  return async function recaptchaGate(req, res, next) {
    const token =
      (req.body && (req.body.recaptcha_token || req.body['g-recaptcha-response'])) ||
      req.headers['x-recaptcha-token'] ||
      '';

    const result = await verifyRecaptcha(token, req);

    if (result.ok) {
      // Surface the v3 score (when present) so callers can record it.
      req.recaptcha = result;
      return next();
    }

    // Fired without await: the audit write must not delay or fail the response.
    audit.record(req, {
      action: action ? `${action}.captcha_failed` : 'security.captcha_failed',
      outcome: 'failure',
      description: `Captcha rejected (${result.reason})`,
      metadata: { reason: result.reason, codes: (result['error-codes'] || []).join(',') }
    });

    // A disabled captcha returns ok:true above, so everything reaching here is a
    // genuine failure. Still distinguish a missing token, because that is a
    // frontend wiring bug the operator needs to see, and it is safe to say so:
    // it tells them nothing an attacker cannot already infer.
    if (result.reason === 'missing_token') {
      return res.status(400).json({
        success: false,
        message: 'Please complete the captcha and try again.',
        captcha: 'missing'
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Captcha verification failed. Please try again.',
      captcha: 'failed'
    });
  };
}

module.exports = requireRecaptcha;
