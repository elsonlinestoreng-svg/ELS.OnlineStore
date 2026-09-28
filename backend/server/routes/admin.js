const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const ContactInquiry = require('../models/ContactInquiry');
const admin = require('../middleware/admin');
const { escapeRegex, toObjectId } = require('../utils/security');

const VALID_ROLES = ['user', 'admin'];
const VALID_STORE_STATUSES = ['active', 'suspended', 'pending_review'];
const VALID_INQUIRY_STATUSES = ['new', 'in_progress', 'resolved', 'spam'];

// GET /api/admin/stats — platform overview
router.get('/stats', admin, async (req, res) => {
  try {
    const [users, stores, products, orders, transactions, pendingStores] = await Promise.all([
      User.countDocuments(),
      Store.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Transaction.countDocuments(),
      Store.countDocuments({ status: 'pending_review' })
    ]);

    const revenueAgg = await Order.aggregate([
      { $match: { payment_status: 'paid' } },
      { $group: { _id: null, gross: { $sum: '$total' }, commission: { $sum: '$commission_amount' } } }
    ]);
    const revenue = revenueAgg[0] || { gross: 0, commission: 0 };

    res.json({
      success: true,
      stats: {
        users,
        stores,
        products,
        orders,
        transactions,
        pending_stores: pendingStores,
        gross_revenue: revenue.gross,
        platform_commission: revenue.commission
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// GET /api/admin/stores — list all stores, optional status filter
router.get('/stores', admin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      if (!VALID_STORE_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      filter.status = req.query.status;
    }

    const stores = await Store.find(filter)
      .populate('owner_id', 'name email')
      .sort({ created_at: -1 })
      .limit(100);

    res.json({ success: true, stores, count: stores.length });
  } catch (err) {
    console.error('Admin stores error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stores' });
  }
});

// PUT /api/admin/stores/:id/status — moderate store (approve/suspend)
router.put('/stores/:id/status', admin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!VALID_STORE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be one of: ' + VALID_STORE_STATUSES.join(', ') });
    }

    const store = await Store.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true, runValidators: true }
    );

    if (!store) {
      return res.status(404).json({ success: false, message: 'Store not found' });
    }

    res.json({ success: true, message: 'Store status updated to ' + status, store });
  } catch (err) {
    console.error('Moderate store error:', err);
    res.status(500).json({ success: false, message: 'Failed to update store' });
  }
});

// GET /api/admin/users — list users, optional search/role filter
router.get('/users', admin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) {
      if (!VALID_ROLES.includes(req.query.role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      filter.role = req.query.role;
    }
    if (req.query.q && req.query.q.trim()) {
      // Escaped before use in $regex to prevent ReDoS via a crafted pattern.
      const term = escapeRegex(req.query.q.trim().slice(0, 100));
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ created_at: -1 })
      .limit(100);

    res.json({ success: true, users, count: users.length });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:id/role — set a user's role (promote/demote admin)
router.put('/users/:id/role', admin, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = toObjectId(req.params.id);

    if (!userId) {
      return res.status(400).json({ success: false, message: 'Invalid user id' });
    }

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be one of: ' + VALID_ROLES.join(', ') });
    }

    // Guard against an admin locking the platform out by demoting the last
    // remaining admin, and against self-demotion.
    if (userId.toString() === req.user.userId) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role' });
    }

    if (role !== 'admin') {
      const remainingAdmins = await User.countDocuments({ role: 'admin', _id: { $ne: userId } });
      if (remainingAdmins === 0) {
        return res.status(400).json({ success: false, message: 'At least one admin must remain' });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { role } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'Role updated to ' + role, user });
  } catch (err) {
    console.error('Update user role error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

// GET /api/admin/orders — all orders, optional status filter
router.get('/orders', admin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.order_status = req.query.status.toLowerCase();
    }
    if (req.query.payment_status) {
      filter.payment_status = req.query.payment_status.toLowerCase();
    }

    const orders = await Order.find(filter)
      .populate('buyer_id', 'name email')
      .populate('store_id', 'store_name')
      .sort({ created_at: -1 })
      .limit(100);

    res.json({ success: true, orders, count: orders.length });
  } catch (err) {
    console.error('Admin orders error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

// GET /api/admin/earnings/platform — platform commission breakdown
router.get('/earnings/platform', admin, async (req, res) => {
  try {
    const agg = await Transaction.aggregate([
      { $group: { _id: null, total_amount: { $sum: '$total_amount' }, commission: { $sum: '$platform_commission_total' } } }
    ]);
    const result = agg[0] || { total_amount: 0, commission: 0 };

    const byGateway = await Transaction.aggregate([
      { $group: { _id: '$gateway_status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      total_processed: result.total_amount,
      platform_commission: result.commission,
      transactions_by_status: byGateway
    });
  } catch (err) {
    console.error('Platform earnings error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch platform earnings' });
  }
});

/**
 * GET /api/admin/contact-inquiries
 * Support inbox. Newest first, optionally filtered by status, and searchable.
 */
router.get('/contact-inquiries', admin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      if (!VALID_INQUIRY_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      filter.status = req.query.status;
    }
    if (req.query.q && req.query.q.trim()) {
      const term = escapeRegex(req.query.q.trim().slice(0, 100));
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { reference_id: { $regex: term, $options: 'i' } }
      ];
    }

    const inquiries = await ContactInquiry.find(filter).sort({ created_at: -1 }).limit(100);
    res.json({ success: true, count: inquiries.length, inquiries });
  } catch (err) {
    console.error('Contact inquiries error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch contact inquiries' });
  }
});

/** GET /api/admin/contact-inquiries/stats - counts by status and mail outcome. */
router.get('/contact-inquiries/stats', admin, async (req, res) => {
  try {
    const [byStatus, byEmail] = await Promise.all([
      ContactInquiry.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      ContactInquiry.aggregate([{ $group: { _id: '$email_status', count: { $sum: 1 } } }])
    ]);
    res.json({
      success: true,
      by_status: byStatus.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {}),
      by_email_status: byEmail.reduce((acc, r) => ({ ...acc, [r._id]: r.count }), {})
    });
  } catch (err) {
    console.error('Contact inquiry stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch contact inquiry stats' });
  }
});

/** PATCH /api/admin/contact-inquiries/:id - move an inquiry through the workflow. */
router.patch('/contact-inquiries/:id', admin, async (req, res) => {
  try {
    const inquiryId = toObjectId(req.params.id);
    if (!inquiryId) {
      return res.status(400).json({ success: false, message: 'Invalid inquiry id' });
    }
    const { status } = req.body || {};
    if (!VALID_INQUIRY_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const inquiry = await ContactInquiry.findByIdAndUpdate(
      inquiryId,
      { status, resolved_at: status === 'resolved' ? new Date() : null },
      { new: true }
    );
    if (!inquiry) {
      return res.status(404).json({ success: false, message: 'Inquiry not found' });
    }
    res.json({ success: true, inquiry });
  } catch (err) {
    console.error('Update contact inquiry error:', err);
    res.status(500).json({ success: false, message: 'Failed to update contact inquiry' });
  }
});

module.exports = router;
