const express = require('express');
const router = express.Router();
const DeliveryPartner = require('../models/DeliveryPartner');

// Register a delivery partner
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, vehicle, license, region, loc } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, message: 'Name and email required' });
    const existing = await DeliveryPartner.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });
    const p = new DeliveryPartner({ name, email: email.toLowerCase(), phone, vehicle, license, region, loc });
    await p.save();
    res.status(201).json({ success: true, message: 'Partner registered', partner: p });
  } catch (err) { console.error('delivery register err', err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// List partners
router.get('/', async (req, res) => {
  try { const list = await DeliveryPartner.find().sort({ created_at: -1 }).lean(); res.json({ success: true, partners: list }); }
  catch (err) { console.error('delivery list err', err); res.status(500).json({ success: false, message: 'Server error' }); }
});

// Toggle online state
router.put('/:id/online', async (req, res) => {
  try {
    const { id } = req.params; const { online } = req.body;
    const p = await DeliveryPartner.findByIdAndUpdate(id, { $set: { online: !!online } }, { new: true }).lean();
    if (!p) return res.status(404).json({ success: false, message: 'Partner not found' });
    res.json({ success: true, partner: p });
  } catch (err) { console.error('toggle online err', err); res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;
