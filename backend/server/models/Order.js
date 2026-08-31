const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: String,
  price: Number,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  image_url: String
});

const orderSchema = new mongoose.Schema({
  order_reference: {
    type: String,
    required: true,
    unique: true
  },
  parent_transaction_id: {
    type: String,
    required: true
  },
  buyer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  seller_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  store_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  items: [orderItemSchema],
  subtotal: {
    type: Number,
    required: true
  },
  shipping_fee: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  commission_rate: {
    type: Number,
    default: 10
  },
  commission_amount: {
    type: Number,
    required: true
  },
  seller_payout: {
    type: Number,
    required: true
  },
  payment_status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  payment_reference: String,
  payment_method: {
    type: String,
    default: 'paystack'
  },
  order_status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'disputed'],
    default: 'pending'
  },
  tracking_number: String,
  shipping_address: {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: 'Kenya' },
    phone: String
  },
  buyer_notes: String,
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

orderSchema.pre('save', async function() {
  this.updated_at = new Date();
});

module.exports = mongoose.model('Order', orderSchema);
