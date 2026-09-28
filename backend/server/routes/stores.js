const express = require('express');
const router = express.Router();
const Store = require('../models/Store');
const auth = require('../middleware/auth');
const { createSubaccount } = require('../services/paystack');
const { toObjectId, cleanText } = require('../utils/security');

const PAYMENT_METHODS = ['bank_transfer', 'cash_on_delivery', 'google_pay', 'international_card'];

/**
 * Fields a store owner is allowed to change themselves.
 *
 * Verification fields are intentionally excluded. Previously a seller could
 * POST their own `bank_verification_status: "verified"`, approving their own
 * payout details, and could set an arbitrary `paystack_subaccount_code` to
 * redirect settlement to a subaccount they do not own.
 */
const SELF_EDITABLE_FIELDS = [
  'store_name', 'description', 'logo_url', 'banner_url',
  'bank_account_name', 'bank_account_number', 'bank_name',
  'preferred_payment_method', 'payment_verification_note',
  'paystack_business_name', 'paystack_contact_email', 'paystack_settlement_bank',
  'paystack_account_number', 'paystack_account_name', 'paystack_percentage_charge'
];

async function maybeCreatePaystackSubaccount(store) {
  if (store.paystack_subaccount_code) return store.paystack_subaccount_code;
  if (!process.env.PAYSTACK_SECRET_KEY) return null;
  if (!store.paystack_business_name || !store.paystack_contact_email || !store.paystack_settlement_bank || !store.paystack_account_number || !store.paystack_account_name) return null;

  try {
    const result = await createSubaccount({
      business_name: store.paystack_business_name,
      settlement_bank: store.paystack_settlement_bank,
      account_number: store.paystack_account_number,
      percentage_charge: store.paystack_percentage_charge || 0,
      primary_contact_name: store.paystack_account_name,
      primary_contact_email: store.paystack_contact_email,
      description: `ELS seller ${store.store_name}`
    });

    if (result && result.status && result.data && result.data.subaccount_code) {
      store.paystack_subaccount_code = result.data.subaccount_code;
      store.paystack_verification_status = 'verified';
      await store.save();
      return store.paystack_subaccount_code;
    }

    return null;
  } catch (err) {
    console.error('Paystack subaccount creation failed:', err);
    return null;
  }
}

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

    const {
      store_name, description, bank_account_name, bank_account_number, bank_name,
      preferred_payment_method, payment_verification_note,
      paystack_business_name, paystack_contact_email, paystack_settlement_bank,
      paystack_account_number, paystack_account_name, paystack_percentage_charge
    } = req.body || {};

    const finalBankAccountName = bank_account_name || paystack_account_name || '';
    const finalBankAccountNumber = bank_account_number || paystack_account_number || '';

    if (!store_name || !finalBankAccountName || !finalBankAccountNumber || !bank_name) {
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
      store_name: cleanText(store_name, 100),
      description: cleanText(description, 500),
      bank_account_name: cleanText(bank_account_name, 120),
      bank_account_number: cleanText(bank_account_number, 40),
      bank_name: cleanText(bank_name, 120),
      preferred_payment_method: preferred_payment_method || 'bank_transfer',
      // Verification state is always assigned by the platform, never by the
      // applicant. The model default is 'pending_verification'.
      payment_verification_note: cleanText(payment_verification_note, 500),
      paystack_business_name: cleanText(paystack_business_name, 120),
      paystack_contact_email: cleanText(paystack_contact_email, 120),
      paystack_settlement_bank: cleanText(paystack_settlement_bank, 120),
      paystack_account_number: cleanText(paystack_account_number, 40),
      paystack_account_name: cleanText(paystack_account_name, 120),
      paystack_percentage_charge: Number(paystack_percentage_charge || 0),
      paystack_verification_status: 'pending_verification',
      logo_url: cleanText(req.body.logo_url, 500),
      banner_url: cleanText(req.body.banner_url, 500)
    });

    await store.save();
    await maybeCreatePaystackSubaccount(store);

    // Do not echo bank details back in the creation response.
    const safe = store.toObject();
    delete safe.bank_account_number;
    delete safe.bank_account_name;
    delete safe.paystack_account_number;
    delete safe.paystack_account_name;
    delete safe.paystack_subaccount_code;
    delete safe.paystack_contact_email;

    res.status(201).json({
      success: true,
      message: 'Store created successfully',
      store: safe
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

    // The owner needs their bank details to render their own settings form,
    // but the subaccount code and contact email are internal.
    const safe = store.toObject();
    delete safe.paystack_subaccount_code;
    delete safe.paystack_contact_email;

    res.json({ success: true, store: safe });
  } catch (err) {
    console.error('Get my store error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch store' });
  }
});

// Get store by slug (public)
// NOTE: must be declared before `/:id`, otherwise Express matches
// "/slug/xyz" against the id parameter and returns 404.
router.get('/slug/:slug', async (req, res) => {
  try {
    const slug = cleanText(req.params.slug, 200).toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ success: false, message: 'Invalid store slug' });
    }

    const store = await Store.findOne({ store_slug: slug })
      .populate('owner_id', 'name email')
      .select('-bank_account_number -bank_account_name -paystack_subaccount_code -paystack_contact_email -paystack_account_number -paystack_account_name');

    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    res.json({ success: true, store });
  } catch (err) {
    console.error('Get store by slug error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch store' });
  }
});

// Get store by ID (public)
router.get('/:id', async (req, res) => {
  try {
    const storeId = toObjectId(req.params.id);
    if (!storeId) {
      return res.status(400).json({ success: false, message: 'Invalid store id' });
    }

    const store = await Store.findById(storeId)
      .populate('owner_id', 'name email')
      .select('-bank_account_number -bank_account_name -paystack_subaccount_code -paystack_contact_email -paystack_account_number -paystack_account_name');

    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    res.json({ success: true, store });
  } catch (err) {
    console.error('Get store error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch store' });
  }
});

// Update store
router.put('/:id', auth, async (req, res) => {
  try {
    const storeId = toObjectId(req.params.id);
    if (!storeId) {
      return res.status(400).json({ success: false, message: 'Invalid store id' });
    }

    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    // Only owner can update
    if (store.owner_id.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'You can only edit your own store' });
    }

    // Reject attempts to self-assign verification/payout state.
    const forbidden = [
      'bank_verification_status', 'paystack_verification_status',
      'paystack_subaccount_code', 'commission_rate', 'status'
    ].filter((field) => req.body[field] !== undefined);

    if (forbidden.length) {
      return res.status(403).json({
        success: false,
        message: 'These fields are managed by the platform: ' + forbidden.join(', ')
      });
    }

    SELF_EDITABLE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) {
        store[field] = typeof req.body[field] === 'string'
          ? cleanText(req.body[field], 500)
          : req.body[field];
      }
    });

    await store.save();
    await maybeCreatePaystackSubaccount(store);

    // Never echo full bank details back to the client.
    const safe = store.toObject();
    delete safe.bank_account_number;
    delete safe.bank_account_name;
    delete safe.paystack_account_number;
    delete safe.paystack_account_name;
    delete safe.paystack_subaccount_code;
    delete safe.paystack_contact_email;

    res.json({ success: true, message: 'Store updated', store: safe });
  } catch (err) {
    console.error('Update store error:', err && err.message);
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
