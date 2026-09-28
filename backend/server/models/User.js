const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['buyer', 'seller', 'delivery', 'user', 'admin'],
    default: 'buyer'
  },
  region: {
    type: String,
    default: 'global'
  },
  avatar: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    default: ''
  },
  logistics_id: {
    type: String,
    default: ''
  },
  provider: {
    type: String,
    default: 'email'
  },
  // Incremented on password change. Tokens issued before the bump stop
  // working, so a password reset logs out every existing session.
  tokenVersion: {
    type: Number,
    default: 0
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare passwords
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

/** Constant-time string comparison used for OTP verification. */
userSchema.methods.matchesOtp = function(candidate) {
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(this.otpCode || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = mongoose.model('User', userSchema);
