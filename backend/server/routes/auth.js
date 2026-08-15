const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

router.get('/', (req, res) => {
  res.json({ success: true, message: 'Auth route active' });
});

// Register User
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered. Please login instead.' });
    }

    const user = new User({ name, email: email.toLowerCase(), password });
    await user.save();

    const token = jwt.sign({ userId: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRE });

    res.status(201).json({
      success: true, message: 'User registered successfully', token,
      user: { _id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error during registration' });
  }
});

// Login User
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRE });

    res.json({
      success: true, message: 'Login successful', token,
      user: { _id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: err.message || 'Server error during login' });
  }
});

// Verify Token
router.post('/verify', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, message: 'Token valid', user: { userId: decoded.userId, email: decoded.email } });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Token invalid or expired' });
  }
});

// Send OTP
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: 'No account found with this email' });

    const code = generateOTP();
    otpStore.set(email.toLowerCase(), { code, expires: Date.now() + 10 * 60 * 1000 });

    console.log('📧 OTP for ' + email + ': ' + code);

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, message: 'Email and OTP code are required' });

    const stored = otpStore.get(email.toLowerCase());
    if (!stored) return res.status(400).json({ success: false, message: 'No OTP requested or OTP expired' });

    if (Date.now() > stored.expires) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({ success: false, message: 'OTP has expired. Request a new one' });
    }

    if (stored.code !== code) return res.status(400).json({ success: false, message: 'Invalid OTP code' });

    otpStore.delete(email.toLowerCase());

    const user = await User.findOne({ email: email.toLowerCase() });
    const token = jwt.sign({ userId: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRE });

    res.json({ success: true, message: 'OTP verified successfully', token, user: { _id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to verify OTP' });
  }
});

// Send Password Reset
router.post('/send-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: true, message: 'If an account exists, a reset link has been sent' });

    const resetToken = jwt.sign({ userId: user._id, purpose: 'password-reset' }, JWT_SECRET, { expiresIn: '1h' });

    console.log('🔗 Reset link for ' + email + ': http://localhost:8081/reset-password?token=' + resetToken);

    res.json({ success: true, message: 'If an account exists, a reset link has been sent' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to send reset email' });
  }
});

// Validate Reset Token
router.get('/validate-reset', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Token is required' });

    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.purpose !== 'password-reset') return res.status(400).json({ success: false, message: 'Invalid reset token' });

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, ok: true, message: 'Token valid' });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Token invalid or expired' });
  }
});

// Complete Password Reset
router.post('/reset-complete', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'Token and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Reset link has expired. Request a new one' });
    }

    if (decoded.purpose !== 'password-reset') return res.status(400).json({ success: false, message: 'Invalid reset token' });

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password reset successful. You can now login.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
});

// Get Profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, user });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

// Update Profile
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const { name, phone, avatar } = req.body;

    const updateFields = {};
    if (name) updateFields.name = name;
    if (phone) updateFields.phone = phone;
    if (avatar) updateFields.avatar = avatar;

    const user = await User.findByIdAndUpdate(decoded.userId, { $set: updateFields }, { new: true }).select('-password');

    res.json({ success: true, message: 'Profile updated', user });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;
