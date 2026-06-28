const express = require('express');
const router = express.Router();
const Store = require('../models/Store');
const auth = require('../middleware/auth');

const PAYMENT_METHODS = ['bank_transfer', 'cash_on_delivery', 'google_pay', 'international_card'];

// Create store
router.post('/', auth, async (req, res) => {
  try {
    // Check if user already has a store
    const existingStore = await Store.findOne({ owner_id: req.user.userId });
    if (existingStore) {
      return res.status(400).json({
        success: false,
        message: 'You already have a store. You can edit it instead.'
      });
    }

    const { store_name, description, bank_account_name, bank_account_number, bank_name, preferred_payment_method } = req.body;

    if (!store_name || !bank_account_name || !bank_account_number || !bank_name) {
      return res.status(400).json({
        success: false,
        message: 'Store name, bank account name, number, and bank name are required'
      });
    }

    if (preferred_payment_method && !PAYMENT_METHODS.includes(preferred_payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Selected payment method is not supported.'
      });
    }

    const store = new Store({
      owner_id: req.user.userId,
      store_name,
      description: description || '',
      bank_account_name,
      bank_account_number,
      bank_name,
      preferred_payment_method: preferred_payment_method || 'bank_transfer',
      logo_url: req.body.logo_url || '',
      banner_url: req.body.banner_url || ''
    });

    await store.save();

    res.status(201).json({
      success: true,
      message: 'Store created successfully',
      store
    });
  } catch (err) {
    console.error('Create store error:', err);
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A store with this name already exists. Choose a different name.'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Failed to create store'
    });
  }
});

// Get seller's own store
router.get('/mine', auth, async (req, res) => {
  try {
    const store = await Store.findOne({ owner_id: req.user.userId });
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'You have not created a store yet'
      });
    }

    res.json({ success: true, store });
  } catch (err) {
    console.error('Get my store error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch store' });
  }
});

// Get store by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const store = await Store.findById(req.params.id)
      .populate('owner_id', 'name email')
      .select('-bank_account_number -bank_account_name -paystack_subaccount_code');

    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    res.json({ success: true, store });
  } catch (err) {
    console.error('Get store error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch store' });
  }
});

// Get store by slug (public)
router.get('/slug/:slug', async (req, res) => {
  try {
    const store = await Store.findOne({ store_slug: req.params.slug })
      .populate('owner_id', 'name email')
      .select('-bank_account_number -bank_account_name -paystack_subaccount_code');

    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    res.json({ success: true, store });
  } catch (err) {
    console.error('Get store by slug error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch store' });
  }
});

// Update store
router.put('/:id', auth, async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    // Only owner can update
    if (store.owner_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'You can only edit your own store' });
    }

    const allowedUpdates = [
      'store_name', 'description', 'logo_url', 'banner_url',
      'bank_account_name', 'bank_account_number', 'bank_name',
      'preferred_payment_method'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        store[field] = req.body[field];
      }
    });

    await store.save();

    res.json({ success: true, message: 'Store updated', store });
  } catch (err) {
    console.error('Update store error:', err);
    res.status(500).json({ success: false, message: 'Failed to update store' });
  }
});

// Get all active stores (public — for browsing)
router.get('/', async (req, res) => {
  try {
    const stores = await Store.find({ status: 'active' })
      .select('store_name store_slug description logo_url created_at')
      .sort({ created_at: -1 });

    res.json({ success: true, stores, count: stores.length });
  } catch (err) {
    console.error('Get stores error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stores' });
  }
});

module.exports = router;
