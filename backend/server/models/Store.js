const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  owner_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  store_name: {
    type: String,
    required: [true, 'Store name is required'],
    trim: true,
    maxlength: 100
  },
  store_slug: {
    type: String,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    default: '',
    maxlength: 500
  },
  logo_url: {
    type: String,
    default: ''
  },
  banner_url: {
    type: String,
    default: ''
  },
  bank_account_name: {
    type: String,
    required: [true, 'Bank account name is required'],
    trim: true
  },
  bank_account_number: {
    type: String,
    required: [true, 'Bank account number is required'],
    trim: true
  },
  bank_name: {
    type: String,
    required: [true, 'Bank name is required'],
    trim: true
  },
  bank_verification_status: {
    type: String,
    enum: ['pending_verification', 'verified', 'rejected'],
    default: 'pending_verification'
  },
  payment_verification_note: {
    type: String,
    default: ''
  },
  paystack_business_name: {
    type: String,
    trim: true,
    default: ''
  },
  paystack_contact_email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  paystack_settlement_bank: {
    type: String,
    trim: true,
    default: ''
  },
  paystack_account_number: {
    type: String,
    trim: true,
    default: ''
  },
  paystack_account_name: {
    type: String,
    trim: true,
    default: ''
  },
  paystack_percentage_charge: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  paystack_verification_status: {
    type: String,
    enum: ['pending_verification', 'verified', 'rejected'],
    default: 'pending_verification'
  },
  paystack_subaccount_code: {
    type: String,
    default: ''
  },
  preferred_payment_method: {
    type: String,
    enum: ['bank_transfer', 'cash_on_delivery', 'google_pay', 'international_card'],
    default: 'bank_transfer'
  },
  commission_rate: {
    type: Number,
    default: 10,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'pending_review'],
    default: 'active'
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Auto-generate slug before saving
storeSchema.pre('save', async function() {
  if (this.isModified('store_name')) {
    this.store_slug = this.store_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
  }
  this.updated_at = new Date();
});

module.exports = mongoose.model('Store', storeSchema);
