const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  type: {
    type: String,
    enum: ['product', 'order', 'general'],
    default: 'general'
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  last_message: {
    type: String,
    default: ''
  },
  last_message_at: {
    type: Date,
    default: Date.now
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

conversationSchema.index({ participants: 1 });
conversationSchema.index({ last_message_at: -1 });

conversationSchema.pre('save', async function() {
  this.updated_at = new Date();
});

module.exports = mongoose.model('Conversation', conversationSchema);
