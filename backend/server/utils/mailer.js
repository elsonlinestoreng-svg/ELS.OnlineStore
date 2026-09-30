const nodemailer = require('nodemailer');
const env = require('../config/env');
const { escapeHtml } = require('./security');

/**
 * Shared outbound email helper.
 *
 * Previously each caller built its own nodemailer transport inline
 * (auth.js, server.js, contact.js). That meant three different config
 * readings, and a misconfigured relay failed silently at the call site
 * instead of being reported in one place.
 *
 * sendMail() returns { delivered: false, reason } when SMTP is not
 * configured, so callers can decide what to do instead of assuming the
 * message went out.
 */

let transporter = null;
let transporterChecked = false;

/** True when the minimum credentials for an SMTP relay are present. */
function isConfigured() {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function getTransporter() {
  if (transporterChecked) return transporter;
  transporterChecked = true;

  if (!isConfigured()) {
    console.warn(
      '[mailer] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS). ' +
      'Emails will be logged to the server console instead of being sent.'
    );
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    });
  } catch (err) {
    console.error('[mailer] failed to create transporter:', err && err.message);
    transporter = null;
  }

  return transporter;
}

/**
 * Sends a message.
 *
 * @returns {Promise<{delivered: boolean, reason?: string, info?: object}>}
 */
async function sendMail({ to, subject, text, html }) {
  if (!to) return { delivered: false, reason: 'no-recipient' };

  const from = env.FROM_EMAIL || env.SMTP_USER;
  const tx = getTransporter();

  if (!tx) {
    // Development affordance only. The body is printed so a developer can
    // complete a flow locally; this must never be the behaviour in
    // production, where a code silently printed to a log is a real risk.
    if (env.isProd) {
      return { delivered: false, reason: 'smtp-not-configured' };
    }
    console.warn(`[mailer] SMTP not configured - would send "${subject}" to ${to}:\n${text || ''}`);
    return { delivered: false, reason: 'smtp-not-configured' };
  }

  try {
    const info = await tx.sendMail({ from, to, subject, text, html });
    return { delivered: true, info };
  } catch (err) {
    console.error(`[mailer] send to ${to} failed:`, err && err.message);
    return { delivered: false, reason: err && err.message };
  }
}

/** Password-reset message using the server-configured APP_ORIGIN. */
async function sendPasswordResetEmail({ to, resetUrl, code }) {
  const lines = [
    'We received a request to reset the password for your ELS Online Store account.',
    '',
    'Use this link to choose a new password:',
    resetUrl,
    ''
  ];
  if (code) {
    lines.push('Or enter this one-time verification code in the app:', code, '');
  }
  lines.push('The link expires in 1 hour and can only be used once.');
  lines.push('If you did not request this, you can safely ignore this email - your password will not change.');

  return sendMail({
    to,
    subject: 'Password reset request',
    text: lines.join('\n')
  });
}

/** OTP delivery for passwordless sign-in. */
async function sendOtpEmail({ to, code }) {
  return sendMail({
    to,
    subject: 'Your ELS verification code',
    text: [
      'Your verification code is:',
      '',
      code,
      '',
      'It expires in 10 minutes.',
      'If you did not try to sign in, you can ignore this email.'
    ].join('\n')
  });
}

/**
 * Address-ownership proof sent at sign-up.
 *
 * This is the gate that makes a registration mean something: until the address
 * is proven, the account cannot obtain a session at all.
 *
 * The name is interpolated into HTML, so it is escaped — an unescaped display
 * name would otherwise be an HTML injection into the recipient's mail client.
 * `to` is the recipient address and is not interpolated into the body at all.
 */
async function sendVerificationEmail({ to, name, code, ttlMinutes }) {
  const safeName = escapeHtml(name || 'there');
  const minutes = Number(ttlMinutes) > 0 ? Number(ttlMinutes) : 15;

  return sendMail({
    to,
    subject: 'Verify your ELS Online Store email address',
    text: [
      `Hi ${name || 'there'},`,
      '',
      'Welcome to ELS Online Store. Confirm this email address to activate your account:',
      '',
      code,
      '',
      `The code expires in ${minutes} minutes.`,
      'If you did not create an ELS account, you can safely ignore this email.'
    ].join('\n'),
    html: [
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">',
      `<p style="font-size:20px;font-weight:700;margin:0 0 16px">ELS Online Store</p>`,
      `<p style="margin:0 0 12px">Hi ${safeName},</p>`,
      '<p style="margin:0 0 16px">Welcome. Confirm this email address to activate your account.</p>',
      `<p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f4f7fb;border-radius:12px;padding:18px;text-align:center;margin:0 0 16px">${escapeHtml(code)}</p>`,
      `<p style="margin:0 0 16px;color:#64748b;font-size:14px">The code expires in ${minutes} minutes.</p>`,
      '<p style="margin:0;color:#64748b;font-size:14px">If you did not create an ELS account, you can safely ignore this email.</p>',
      '</div>'
    ].join('')
  });
}

/** Sent once an address is proven, so verification visibly completed. */
async function sendWelcomeEmail({ to, name }) {
  const safeName = escapeHtml(name || 'there');

  return sendMail({
    to,
    subject: 'Your ELS Online Store account is active',
    text: [
      `Hi ${name || 'there'},`,
      '',
      'Your email address is confirmed and your account is now active.',
      'You can sign in and start shopping on ELS Online Store.'
    ].join('\n'),
    html: [
      '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">',
      '<p style="font-size:20px;font-weight:700;margin:0 0 16px">ELS Online Store</p>',
      `<p style="margin:0 0 12px">Hi ${safeName},</p>`,
      '<p style="margin:0 0 16px">Your email address is confirmed and your account is now active.</p>',
      '<p style="margin:0;color:#64748b;font-size:14px">You can sign in and start shopping on ELS Online Store.</p>',
      '</div>'
    ].join('')
  });
}

module.exports = {
  isConfigured,
  sendMail,
  sendPasswordResetEmail,
  sendOtpEmail,
  sendVerificationEmail,
  sendWelcomeEmail
};
