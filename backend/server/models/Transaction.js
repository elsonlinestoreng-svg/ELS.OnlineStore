const mongoose = require('mongoose');

const splitDetailSchema = new mongoose.Schema({
  seller_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  store_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  },
  amount: Number,
  commission: Number,
  payout: Number,
  is_platform: { type: Boolean, default: false }
});

const transactionSchema = new mongoose.Schema({
  parent_transaction_id: {
    type: String,
    required: true,
    unique: true
  },
  buyer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  total_amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'KES'
  },
  gateway: {
    type: String,
    default: 'paystack'
  },
  gateway_reference: String,
  gateway_status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'reversed'],
    default: 'pending'
  },
  split_details: [splitDetailSchema],
  platform_commission_total: {
    type: Number,
    default: 0
  },
  order_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  shipping_address: {
    street: String,
    city: String,
    state: String,
    country: String,
    phone: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
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

transactionSchema.pre('save', async function() {
  this.updated_at = new Date();
});

module.exports = mongoose.model('Transaction', transactionSchema);
