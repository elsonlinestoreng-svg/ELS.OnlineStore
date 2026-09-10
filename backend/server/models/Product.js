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

  region: {
    type: String,
    default: 'global',
    lowercase: true,
    trim: true
  },
  continent: { type: String, default: 'global', lowercase: true, trim: true },
  country: { type: String, default: 'global', lowercase: true, trim: true },
  state: { type: String, default: 'global', lowercase: true, trim: true },
  local_region: { type: String, default: 'global', lowercase: true, trim: true },

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

  created_at: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model('Product', ProductSchema);