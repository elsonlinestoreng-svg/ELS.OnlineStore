const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const DeliveryPartner = require('../models/DeliveryPartner');
const auth = require('../middleware/auth');
const { isValidEmail, toObjectId, cleanText } = require('../utils/security');

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many partner applications. Try again later.' }
});

/**
 * Register a delivery partner.
 *
 * This endpoint was previously completely unauthenticated and unthrottled,
 * which allowed anyone to spam unlimited fake partner records.
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, phone, vehicle, license, region, loc } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'A valid email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await DeliveryPartner.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const p = new DeliveryPartner({
      name: cleanText(name, 120),
      email: normalizedEmail,
      phone: cleanText(phone, 40),
      vehicle: cleanText(vehicle, 60),
      license: cleanText(license, 60),
      region: cleanText(region, 60),
      loc: loc
    });
    await p.save();

    res.status(201).json({ success: true, message: 'Partner registered', partner: p });
  } catch (err) {
    console.error('delivery register err', err && err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * List partners.
 *
 * Restricted to authenticated users, and the document projection excludes
 * fields such as phone numbers and licence details that are not needed to
 * browse the partner list.
 */
router.get('/', auth, async (req, res) => {
  try {
    // Routing only needs identity, region and availability. Returning every
    // partner's email to any signed-in user handed out the full partner
    // contact list, which is personal data with no need-to-know.
    const list = await DeliveryPartner.find()
      .sort({ created_at: -1 })
      .select('name region online created_at')
      .limit(200)
      .lean();
    res.json({ success: true, partners: list });
  } catch (err) {
    console.error('delivery list err', err && err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * Toggle online state.
 *
 * Previously unauthenticated: any visitor could flip any partner's availability
 * by iterating ids.
 */
router.put('/:id/online', auth, async (req, res) => {
  try {
    const partnerId = toObjectId(req.params.id);
    if (!partnerId) {
      return res.status(400).json({ success: false, message: 'Invalid partner id' });
    }

    const partner = await DeliveryPartner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }

    // Only an admin or the partner themselves may change availability.
    const isSelf = partner.email === req.user.email;
    if (req.user.role !== 'admin' && !isSelf) {
      return res.status(403).json({ success: false, message: 'You can only update your own availability' });
    }

    partner.online = Boolean(req.body && req.body.online);
    await partner.save();

    res.json({ success: true, partner });
  } catch (err) {
    console.error('toggle online err', err && err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
