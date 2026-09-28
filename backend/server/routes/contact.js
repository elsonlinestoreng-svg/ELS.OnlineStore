/**
 * Contact Form Routes
 * Handles customer inquiries and contact form submissions
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const nodemailer = require('nodemailer');
const { escapeHtml, cleanText, isValidEmail, toObjectId } = require('../utils/security');
const env = require('../config/env');
const ContactInquiry = require('../models/ContactInquiry');
const optionalAuth = require('../middleware/auth').optionalAuth;

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages sent. Please try again later.' }
});

// Email configuration, read through the shared config module so this route
// agrees with the OTP and password-reset senders.
const emailConfig = {
  host: env.SMTP_HOST || 'smtp.gmail.com',
  port: env.SMTP_PORT || 587,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
};

// Where inquiries are delivered. Configurable because the previous hardcoded
// address meant a deployment could not redirect support mail to its own inbox.
const ADMIN_EMAIL = env.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'jovalistore@gmail.com';

// The From header must be a real address. Using a bare login name (for example
// a relay credential of "test") makes the relay reject the message with
// "553 not a valid RFC 5321 address", so prefer an explicit From address.
const FROM_ADDRESS = env.FROM_EMAIL || env.SMTP_USER;

// Initialize transporter (will be created on first use or if configured)
let transporter = null;

/**
 * Initialize email transporter
 */
function initializeTransporter() {
  if (transporter) return transporter;

  // Check if SMTP is configured
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.warn('Email service not configured (SMTP credentials missing)');
    return null;
  }

  try {
    transporter = nodemailer.createTransport(emailConfig);
    console.log('✓ Email transporter initialized');
    return transporter;
  } catch (error) {
    console.error('Failed to initialize email transporter:', error);
    return null;
  }
}

/**
 * POST /api/contact
 * Submit a contact inquiry
 */
router.post('/', contactLimiter, optionalAuth, async (req, res) => {
  try {
    const { name, email, message, subject, phone, region } = req.body || {};

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, email, message',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    if (message.length < 10 || message.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Message must be between 10 and 1000 characters',
      });
    }

    // Strip CR/LF so a crafted name/subject cannot inject extra mail headers
    // (for example a Bcc: line) into the outgoing message.
    const sanitizedName = cleanText(name, 100).replace(/[\r\n]+/g, ' ');
    const sanitizedEmail = cleanText(email, 254).toLowerCase().trim();
    const sanitizedMessage = cleanText(message, 1000);
    const sanitizedSubject = cleanText(subject || 'No subject provided', 200).replace(/[\r\n]+/g, ' ');
    const sanitizedPhone = cleanText(phone || '', 32).replace(/[\r\n]+/g, ' ');
    const sanitizedRegion = cleanText(region || 'global', 64).replace(/[\r\n]+/g, ' ');

    const referenceId = generateReferenceId();

    // Delivery is attempted first, but it is never the only record: if the
    // relay is down or rejects the message, the inquiry is still written to
    // MongoDB below for support staff to pick up manually.
    const emailResult = await sendContactEmail({
      name: sanitizedName,
      email: sanitizedEmail,
      subject: sanitizedSubject,
      message: sanitizedMessage,
    });

    const saved = await saveInquiry({
      reference_id: referenceId,
      name: sanitizedName,
      email: sanitizedEmail,
      subject: sanitizedSubject,
      message: sanitizedMessage,
      phone: sanitizedPhone,
      region: sanitizedRegion,
      user_id: toObjectId(req.user && req.user.userId),
      email_status: emailResult.delivered ? 'sent' : (emailResult.reason === 'smtp-not-configured' ? 'not_configured' : 'failed'),
      email_error: emailResult.delivered ? '' : cleanText(String(emailResult.reason || ''), 300),
    });

    if (!saved) {
      // The message was not stored anywhere. Do not claim success.
      return res.status(503).json({
        success: false,
        message: 'We could not record your message. Please email us directly so nothing is lost.',
      });
    }

    // Mirror to the console log for operators tailing the process.
    logContactInquiry({
      name: sanitizedName,
      email: sanitizedEmail,
      subject: sanitizedSubject,
      reference_id: referenceId,
      timestamp: new Date().toISOString(),
      emailSent: emailResult.delivered,
    });

    res.json({
      success: true,
      // Be honest when the mail relay failed: the message is saved and support
      // will still see it, but the reply will not come by email automatically.
      message: emailResult.delivered
        ? 'Your inquiry has been received. We will respond shortly.'
        : 'Your inquiry has been saved. Our email relay is unavailable right now, so we will follow up by phone or in store.',
      data: {
        received_at: new Date().toISOString(),
        reference_id: referenceId,
        email_sent: emailResult.delivered,
      },
    });
  } catch (error) {
    console.error('Contact form submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process your inquiry. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

/**
 * Send email to admin with contact inquiry
 */
async function sendContactEmail({ name, email, subject, message }) {
  // HTML-escape every interpolated value. Previously the message body was
  // injected raw into the HTML template, so a visitor could inject arbitrary
  // markup/links into the admin's inbox.
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeMessage = escapeHtml(message);

  try {
    // Initialize transporter if needed
    if (!transporter) {
      transporter = initializeTransporter();
    }

    if (!transporter) {
      console.warn('Email service not available. Inquiry will still be stored.');
      return { delivered: false, reason: 'smtp-not-configured' };
    }

    // Prepare email content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #4f46e5; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">New Customer Inquiry</h1>
        </div>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb;">
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #1f2937; margin-top: 0; font-size: 18px;">Customer Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #6b7280; width: 120px;">Name:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${safeName}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #6b7280;">Email:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;"><a href="mailto:${safeEmail}">${safeEmail}</a></td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #6b7280;">Subject:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${safeSubject}</td>
              </tr>
              <tr>
                <td style="padding: 10px; font-weight: bold; color: #6b7280;">Received:</td>
                <td style="padding: 10px; color: #1f2937;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
          </div>

          <div style="background-color: white; padding: 20px; border-radius: 8px;">
            <h2 style="color: #1f2937; margin-top: 0; font-size: 18px;">Message</h2>
            <div style="background-color: #f3f4f6; padding: 15px; border-left: 4px solid #4f46e5; border-radius: 4px; white-space: pre-wrap; line-height: 1.6; color: #374151;">
${safeMessage}
            </div>
          </div>

          <div style="margin-top: 20px; padding: 15px; background-color: #dbeafe; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <p style="margin: 0; color: #1e40af; font-size: 14px;">
              <strong>Action Required:</strong> Please respond to this inquiry within 24 hours to maintain excellent customer service standards.
            </p>
          </div>
        </div>

        <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #9ca3af;">
          <p style="margin: 5px 0;">ELS Online Store - Customer Care Portal</p>
          <p style="margin: 5px 0;">This is an automated email. Please do not reply to this message.</p>
        </div>
      </div>
    `;

    const textContent = `
New Customer Inquiry
====================

Name: ${name}
Email: ${email}
Subject: ${subject}
Received: ${new Date().toLocaleString()}

Message:
--------
${safeMessage}

---
Action Required: Please respond within 24 hours.
ELS Online Store - Customer Care Portal
    `;

    // Send email to admin
    await transporter.sendMail({
      from: `"ELS Support" <${FROM_ADDRESS}>`,
      to: ADMIN_EMAIL,
      replyTo: email,
      subject: `[ELS Inquiry] ${subject}`,
      text: textContent,
      html: htmlContent,
    });

    // Send confirmation email to customer
    const customerEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #10b981; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">✓ Message Received</h1>
        </div>
        
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 0 0 8px 8px; border: 1px solid #bbf7d0;">
          <div style="background-color: white; padding: 20px; border-radius: 8px;">
            <p style="color: #1f2937; font-size: 16px; margin-top: 0;">Hi ${safeName},</p>
            
            <p style="color: #4b5563; line-height: 1.6;">
              Thank you for reaching out to us! We've received your message and appreciate you taking the time to contact ELS Online Store.
            </p>

            <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; border-left: 4px solid #10b981; margin: 20px 0;">
              <p style="margin: 0; color: #065f46;"><strong>What happens next?</strong></p>
              <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #047857;">
                <li>Our support team will review your inquiry carefully</li>
                <li>We'll respond to this email within <strong>24 business hours</strong></li>
                <li>You'll receive a detailed response addressing your concern</li>
              </ul>
            </div>

            <table style="width: 100%; margin: 20px 0; background-color: #f9fafb; border-radius: 8px; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px; color: #6b7280; font-weight: bold;">Your Email:</td>
                <td style="padding: 10px; color: #1f2937;">${safeEmail}</td>
              </tr>
              <tr>
                <td style="padding: 10px; color: #6b7280; font-weight: bold;">Subject:</td>
                <td style="padding: 10px; color: #1f2937;">${safeSubject}</td>
              </tr>
              <tr>
                <td style="padding: 10px; color: #6b7280; font-weight: bold;">Received:</td>
                <td style="padding: 10px; color: #1f2937;">${new Date().toLocaleString()}</td>
              </tr>
            </table>

            <p style="color: #4b5563; line-height: 1.6;">
              We appreciate your patience and look forward to assisting you. If you have any additional information to share, feel free to reply to this email.
            </p>

            <p style="color: #6b7280; font-size: 14px; margin-bottom: 0;">
              <strong>Best regards,</strong><br>
              ELS Online Store Support Team 🎉
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #9ca3af;">
            <p style="margin: 5px 0;">© 2026 ELS Online Store. All rights reserved.</p>
            <p style="margin: 5px 0;">For urgent matters, call us at +234 (902) 505-8674</p>
          </div>
        </div>
      </div>
    `;

    const customerEmailText = `
Hello ${name},

Thank you for reaching out to ELS Online Store! We've received your message.

What happens next:
✓ Our support team will review your inquiry carefully
✓ We'll respond within 24 business hours
✓ You'll receive a detailed response addressing your concern

Your Reference:
Email: ${email}
Subject: ${subject}
Received: ${new Date().toLocaleString()}

We appreciate your patience and look forward to assisting you!

Best regards,
ELS Online Store Support Team

For urgent matters, call us at +234 (902) 505-8674
© 2026 ELS Online Store. All rights reserved.
    `;

    // Send customer confirmation
    await transporter.sendMail({
      from: `"ELS Support" <${FROM_ADDRESS}>`,
      to: email,
      subject: 'We Received Your Message - ELS Online Store Support',
      text: customerEmailText,
      html: customerEmailHtml,
    });

    console.log('✓ Contact emails sent successfully to admin and customer');
    return { delivered: true };
  } catch (error) {
    console.error('Email sending error:', error);
    // Report the failure instead of throwing: the inquiry is still stored, so
    // support can follow up manually.
    return { delivered: false, reason: (error && error.message) || 'send-failed' };
  }
}

/**
 * Stores an inquiry in MongoDB.
 *
 * @returns {Promise<object|null>} the saved document, or null when the write
 *   failed. The caller treats null as a hard failure, because a message that
 *   exists neither in the database nor in an inbox is worse than an error the
 *   customer can act on.
 */
async function saveInquiry(inquiry) {
  try {
    return await ContactInquiry.create(inquiry);
  } catch (error) {
    console.error('Failed to persist contact inquiry:', error && error.message);
    return null;
  }
}

/**
 * Mirror of the stored inquiry for operators tailing the process output.
 * The database is the record of truth; this is only a convenience.
 */
function logContactInquiry(inquiry) {
  try {
    console.log('[Contact Inquiry]', {
      reference_id: inquiry.reference_id,
      name: inquiry.name,
      email: inquiry.email,
      subject: inquiry.subject,
      timestamp: inquiry.timestamp,
      emailSent: inquiry.emailSent,
    });
  } catch (error) {
    console.error('Failed to log contact inquiry:', error);
  }
}

/**
 * Generate a unique reference ID for the inquiry
 */
function generateReferenceId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `INQ-${timestamp}-${random}`;
}

module.exports = router;
