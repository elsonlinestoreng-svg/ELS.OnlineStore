/**
 * Contact Form Routes
 * Handles customer inquiries and contact form submissions
 */

const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// Email configuration (using environment variables)
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true' || false,
  auth: {
    user: process.env.SMTP_USER || process.env.SMTP_EMAIL,
    pass: process.env.SMTP_PASS || process.env.SMTP_PASSWORD,
  },
};

// Admin contact email
const ADMIN_EMAIL = 'jovalistore@gmail.com';

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
router.post('/', async (req, res) => {
  try {
    const { name, email, message, subject } = req.body;

    // Validation
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, email, message',
      });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format',
      });
    }

    // Message length validation
    if (message.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message must be at least 10 characters long',
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot exceed 1000 characters',
      });
    }

    // Sanitize inputs to prevent injection
    const sanitizedName = String(name).substring(0, 100).replace(/[<>]/g, '');
    const sanitizedEmail = String(email).toLowerCase().trim();
    const sanitizedMessage = String(message).substring(0, 1000);
    const sanitizedSubject = String(subject || 'No subject provided').substring(0, 200).replace(/[<>]/g, '');

    // Try to send email
    const emailSent = await sendContactEmail({
      name: sanitizedName,
      email: sanitizedEmail,
      subject: sanitizedSubject,
      message: sanitizedMessage,
    });

    // Log inquiry (even if email fails)
    logContactInquiry({
      name: sanitizedName,
      email: sanitizedEmail,
      subject: sanitizedSubject,
      message: sanitizedMessage,
      timestamp: new Date().toISOString(),
      emailSent,
    });

    // Return success response
    res.json({
      success: true,
      message: 'Your inquiry has been received. We will respond shortly.',
      data: {
        received_at: new Date().toISOString(),
        reference_id: generateReferenceId(),
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
  try {
    // Initialize transporter if needed
    if (!transporter) {
      transporter = initializeTransporter();
    }

    if (!transporter) {
      console.warn('Email service not available. Inquiry will be logged locally.');
      return false;
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
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #6b7280;">Email:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;"><a href="mailto:${email}">${email}</a></td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #6b7280;">Subject:</td>
                <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #1f2937;">${subject}</td>
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
${message}
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
${message}

---
Action Required: Please respond within 24 hours.
ELS Online Store - Customer Care Portal
    `;

    // Send email to admin
    await transporter.sendMail({
      from: `"ELS Support" <${emailConfig.auth.user}>`,
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
            <p style="color: #1f2937; font-size: 16px; margin-top: 0;">Hi ${name},</p>
            
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
                <td style="padding: 10px; color: #1f2937;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 10px; color: #6b7280; font-weight: bold;">Subject:</td>
                <td style="padding: 10px; color: #1f2937;">${subject}</td>
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
      from: `"ELS Support" <${emailConfig.auth.user}>`,
      to: email,
      subject: 'We Received Your Message - ELS Online Store Support',
      text: customerEmailText,
      html: customerEmailHtml,
    });

    console.log('✓ Contact emails sent successfully to admin and customer');
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    // Return false but don't throw - allow form to succeed even if email fails
    return false;
  }
}

/**
 * Log contact inquiry to file/database
 */
function logContactInquiry(inquiry) {
  try {
    // In production, this would be saved to a database
    // For now, we just log it
    console.log('[Contact Inquiry]', {
      name: inquiry.name,
      email: inquiry.email,
      subject: inquiry.subject,
      timestamp: inquiry.timestamp,
      emailSent: inquiry.emailSent,
    });

    // Optionally: Save to database
    // Example: ContactInquiry.create(inquiry)
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
