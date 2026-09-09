const mongoose = require('mongoose');

const DeliveryPartnerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String },
  vehicle: { type: String },
  license: { type: String },
  region: { type: String },
  online: { type: Boolean, default: false },
  loc: { lat: Number, lng: Number },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DeliveryPartner', DeliveryPartnerSchema);
