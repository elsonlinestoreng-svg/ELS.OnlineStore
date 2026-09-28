const mongoose = require('mongoose');

/**
 * Support inquiries submitted through POST /api/contact.
 *
 * These are persisted so a misconfigured or unavailable SMTP relay cannot
 * silently discard a customer's message. The route still attempts delivery
 * and records the outcome in `email_status`, so support staff can see which
 * inquiries never reached the inbox and follow up manually.
 */
const contactInquirySchema = new mongoose.Schema({
  reference_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  subject: {
    type: String,
    default: '',
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  phone: {
    type: String,
    default: '',
    trim: true,
    maxlength: 32
  },
  region: {
    type: String,
    default: 'global',
    trim: true,
    maxlength: 64
  },
  // Signed in visitors are linked to their account; anonymous ones are not.
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  email_status: {
    type: String,
    enum: ['sent', 'failed', 'not_configured'],
    default: 'not_configured'
  },
  email_error: {
    type: String,
    default: '',
    maxlength: 300
  },
  status: {
    type: String,
    enum: ['new', 'in_progress', 'resolved', 'spam'],
    default: 'new',
    index: true
  },
  resolved_at: {
    type: Date,
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Default listing is newest first and filters to an open status, which is how
// the support inbox is read.
contactInquirySchema.index({ status: 1, created_at: -1 });

module.exports = mongoose.model('ContactInquiry', contactInquirySchema);
