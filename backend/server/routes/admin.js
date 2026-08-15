const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const admin = require('../middleware/admin');

const VALID_ROLES = ['user', 'admin'];
const VALID_STORE_STATUSES = ['active', 'suspended', 'pending_review'];

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
      const term = req.query.q.trim();
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

    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be one of: ' + VALID_ROLES.join(', ') });
    }

    if (req.params.id === req.user.userId && role !== 'admin') {
      return res.status(400).json({ success: false, message: 'You cannot demote yourself' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { role } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, message: 'Role updated to ' + role, user });
  } catch (err) {
    console.error('Update user role error:', err);
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

module.exports = router;
