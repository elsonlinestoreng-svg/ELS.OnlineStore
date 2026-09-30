const express = require('express');
const router = express.Router();
const env = require('../config/env');
const { getLastResult } = require('../utils/mail-verify');

/**
 * Public, non-sensitive runtime configuration.
 *
 * The browser needs two things it cannot hardcode: whether the captcha is on,
 * and the site key. Both are public by design — the site key is rendered into
 * every page that uses the widget and the secret never leaves the server.
 *
 * The important rule is what is NOT in this response. No JWT secret, no SMTP
 * password, no Paystack secret, no Mongo URI, no admin email. Anything added
 * here is served to anonymous callers, so this file is deliberately a short
 * allowlist rather than a filtered dump of `env`.
 */
router.get('/public', (req, res) => {
  const mailStatus = getLastResult();

  res.json({
    success: true,
    config: {
      recaptcha_enabled: env.RECAPTCHA_ENABLED,
      recaptcha_site_key: env.RECAPTCHA_ENABLED ? env.RECAPTCHA_SITE_KEY : '',
      email_verification_required: env.EMAIL_VERIFICATION_REQUIRED,
      // "Configured" only meant three non-empty strings, which is true even when
      // the provider rejects the password. The UI used this to decide whether to
      // promise the customer an email, so it reported that mail was configured
      // while every verification message bounced. Three distinct facts now:
      //   smtp_configured - credentials are present at all
      //   smtp_reachable  - the relay accepted them at the last startup check
      //   smtp_checked    - that check has actually run (null before boot)
      // null rather than false when unknown: "not checked yet" and "checked and
      // broken" are different, and collapsing them hides a misconfiguration.
      smtp_configured: env.smtpConfigured,
      smtp_reachable: mailStatus ? mailStatus.ok : null,
      smtp_checked: Boolean(mailStatus),
      // A category, never the provider's raw error string. This endpoint is
      // unauthenticated, and the raw text can quote the host and the rejection
      // reason. 'auth' is the actionable one: it means the credentials are
      // wrong, not that the network is down.
      smtp_error: !mailStatus || mailStatus.ok
        ? ''
        : (mailStatus.reason === 'not_configured' ? 'not_configured' : (mailStatus.permanent ? 'auth' : 'unreachable'))
    }
  });
});

module.exports = router;
