const mongoose = require('mongoose');

const trackingEventSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['awaiting_pickup', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'],
    required: true
  },
  note: {
    type: String,
    default: ''
  },
  location: {
    type: String,
    default: ''
  },
  courier_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  courier_name: {
    type: String,
    default: ''
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

const logisticsSchema = new mongoose.Schema({
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true
  },
  store_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  },
  seller_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['awaiting_pickup', 'in_transit', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'awaiting_pickup'
  },
  courier_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  courier_name: {
    type: String,
    default: ''
  },
  tracking_number: {
    type: String,
    unique: true,
    sparse: true
  },
  logistics_fee: {
    type: Number,
    default: 0
  },
  pickup_address: {
    type: String,
    default: ''
  },
  delivery_address: {
    street: String,
    city: String,
    state: String,
    country: String,
    phone: String
  },
  estimated_delivery: Date,
  tracking_events: [trackingEventSchema],
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

logisticsSchema.pre('save', async function() {
  this.updated_at = new Date();
});

module.exports = mongoose.model('Logistics', logisticsSchema);
