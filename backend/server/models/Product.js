const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },

  price: {
    type: Number,
    required: true
  },

  category: {
    type: String,
    default: 'Other'
  },

  description: {
    type: String,
    default: ''
  },

  seller: {
    type: String,
    required: true
  },

  images: {
    type: [String],
    default: []
  },

  primary_image: {
    type: String,
    default: ''
  },

  image_data: {
    type: String,
    default: ''
  },

  public: {
    type: Boolean,
    default: true
  },

  average_rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },

  rating_count: {
    type: Number,
    default: 0
  },

  created_at: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model('Product', ProductSchema);