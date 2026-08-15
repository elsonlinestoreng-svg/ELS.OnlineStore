const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  buyer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    default: '',
    maxlength: 1000
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

// One review per buyer per product
reviewSchema.index({ product_id: 1, buyer_id: 1 }, { unique: true });
reviewSchema.index({ product_id: 1, created_at: -1 });

reviewSchema.pre('save', async function() {
  this.updated_at = new Date();
});

module.exports = mongoose.model('Review', reviewSchema);
