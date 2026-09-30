const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const ContactInquiry = require('../models/ContactInquiry');
const ActivityLog = require('../models/ActivityLog');
const superAdmin = require('../middleware/superAdmin');
const audit = require('../services/audit');
const { escapeRegex, toObjectId, cleanText } = require('../utils/security');

/**
 * Super admin API.
 *
 * This is the platform-wide control surface: every user, every store, every
 * order, every payment and the full activity trail. There is exactly one
 * elevated role ("super_admin") and the guard is applied per-route, so adding a
 * handler below without the guard is a visible omission rather than a silent
 * hole.
 *
 * Every mutating handler writes to the audit trail. An admin action that leaves
 * no record is indistinguishable from one that never happened, which makes the
 * log worthless for the incident it exists to cover.
 */

const VALID_ROLES = ['buyer', 'seller', 'delivery', 'user', 'super_admin'];
const VALID_USER_STATUSES = ['active', 'suspended'];
const VALID_STORE_STATUSES = ['active', 'suspended', 'pending_review'];
const VALID_INQUIRY_STATUSES = ['new', 'in_progress', 'resolved', 'spam'];

/** Clamp pagination so a caller cannot ask for the whole collection at once. */
function pagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || 25;
  const limit = Math.min(100, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/**
 * GET /api/superadmin/overview
 *
 * One call that fills the whole dashboard. Everything is issued in a single
 * Promise.all so the tiles, the revenue chart and the recent-activity list
 * cannot render from mismatched snapshots.
 */
router.get('/overview', superAdmin, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - 6); // rolling 7 days

    const [
      totalUsers,
      newUsersToday,
      newUsersWeek,
      verifiedUsers,
      unverifiedUsers,
      suspendedUsers,
      superAdmins,
      buyers,
      sellers,
      totalStores,
      pendingStores,
      suspendedStores,
      totalProducts,
      totalOrders,
      ordersToday,
      openOrders,
      cancelledOrders,
      disputedOrders,
      totalTransactions,
      failedTransactions,
      totalInquiries,
      newInquiries,
      revenueAgg,
      commissionAgg,
      revenueByDay,
      recentActivity,
      failedLogins24h,
      failedCaptchas24h,
      topSellers
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ created_at: { $gte: startOfDay } }),
      User.countDocuments({ created_at: { $gte: startOfWeek } }),
      User.countDocuments({ is_verified: true }),
      User.countDocuments({ is_verified: false }),
      User.countDocuments({ status: 'suspended' }),
      User.countDocuments({ role: 'super_admin' }),
      User.countDocuments({ role: 'buyer' }),
      User.countDocuments({ role: 'seller' }),

      Store.countDocuments(),
      Store.countDocuments({ status: 'pending_review' }),
      Store.countDocuments({ status: 'suspended' }),

      Product.countDocuments(),

      Order.countDocuments(),
      Order.countDocuments({ created_at: { $gte: startOfDay } }),
      Order.countDocuments({ order_status: { $in: ['pending', 'confirmed', 'processing'] } }),
      Order.countDocuments({ order_status: 'cancelled' }),
      Order.countDocuments({ order_status: 'disputed' }),

      Transaction.countDocuments(),
      Transaction.countDocuments({ gateway_status: 'failed' }),

      ContactInquiry.countDocuments(),
      ContactInquiry.countDocuments({ status: 'new' }),

      Order.aggregate([
        { $match: { payment_status: 'paid' } },
        { $group: { _id: null, gross: { $sum: '$total' } } }
      ]),
      Order.aggregate([
        { $match: { payment_status: 'paid' } },
        { $group: { _id: null, commission: { $sum: '$commission_amount' } } }
      ]),

      // 7-day revenue series for the dashboard chart.
      Order.aggregate([
        { $match: { payment_status: 'paid', created_at: { $gte: startOfWeek } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
            revenue: { $sum: '$total' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),

      ActivityLog.find()
        .sort({ created_at: -1 })
        .limit(15)
        .lean(),

      // Security signals: these two counters are the reason the audit trail
      // exists. A rising failure count is an attack in progress.
      ActivityLog.countDocuments({
        action: 'auth.login',
        outcome: 'failure',
        created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      ActivityLog.countDocuments({
        action: { $regex: '^.*\\.captcha_failed$' },
        created_at: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),

      Order.aggregate([
        { $match: { payment_status: 'paid' } },
        {
          $group: {
            _id: '$seller_id',
            revenue: { $sum: '$total' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'seller'
          }
        },
        { $unwind: { path: '$seller', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            revenue: 1,
            orders: 1,
            name: { $ifNull: ['$seller.name', 'Unknown seller'] },
            email: { $ifNull: ['$seller.email', ''] }
          }
        }
      ])
    ]);

    const revenue = revenueAgg[0] || { gross: 0 };
    const commission = commissionAgg[0] || { commission: 0 };

    res.json({
      success: true,
      overview: {
        users: {
          total: totalUsers,
          new_today: newUsersToday,
          new_this_week: newUsersWeek,
          verified: verifiedUsers,
          unverified: unverifiedUsers,
          suspended: suspendedUsers,
          buyers,
          sellers,
          super_admins: superAdmins
        },
        stores: {
          total: totalStores,
          pending_review: pendingStores,
          suspended: suspendedStores
        },
        catalogue: { products: totalProducts },
        orders: {
          total: totalOrders,
          today: ordersToday,
          open: openOrders,
          cancelled: cancelledOrders,
          disputed: disputedOrders
        },
        payments: {
          transactions: totalTransactions,
          failed: failedTransactions,
          gross_revenue: revenue.gross || 0,
          platform_commission: commission.commission || 0
        },
        support: {
          total: totalInquiries,
          new: newInquiries
        },
        security: {
          failed_logins_24h: failedLogins24h,
          failed_captchas_24h: failedCaptchas24h
        },
        revenue_by_day: revenueByDay,
        top_sellers: topSellers,
        recent_activity: recentActivity
      }
    });
  } catch (err) {
    console.error('Super admin overview error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to load the overview' });
  }
});

// ---------------------------------------------------------------------------
// Activity trail
// ---------------------------------------------------------------------------

/**
 * GET /api/superadmin/activity
 *
 * The chronological record of everything: who, what, when, from where, and
 * whether it succeeded. Filterable by action prefix ("auth.", "order.",
 * "admin."), by outcome, and by a specific actor.
 */
router.get('/activity', superAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const filter = {};

    if (req.query.action && req.query.action.trim()) {
      // Prefix match, escaped. "auth." returns every auth.* event, which is
      // what the dashboard's category filter needs.
      const prefix = escapeRegex(req.query.action.trim().slice(0, 60).replace(/\*$/, ''));
      filter.action = { $regex: `^${prefix}` };
    }

    if (req.query.outcome && ['success', 'failure', 'denied'].includes(req.query.outcome)) {
      filter.outcome = req.query.outcome;
    }

    if (req.query.actor_id) {
      const actorId = toObjectId(req.query.actor_id);
      if (!actorId) return res.status(400).json({ success: false, message: 'Invalid actor id' });
      filter.actor_id = actorId;
    }

    if (req.query.q && req.query.q.trim()) {
      const term = escapeRegex(req.query.q.trim().slice(0, 100));
      filter.$or = [
        { description: { $regex: term, $options: 'i' } },
        { actor_email: { $regex: term, $options: 'i' } },
        { action: { $regex: term, $options: 'i' } }
      ];
    }

    if (req.query.since) {
      const since = new Date(req.query.since);
      if (!Number.isNaN(since.getTime())) {
        filter.created_at = { $gte: since };
      }
    }

    const [events, total, categories] = await Promise.all([
      ActivityLog.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      ActivityLog.countDocuments(filter),
      // Powers the category dropdown without the client hardcoding action names.
      ActivityLog.aggregate([{ $group: { _id: '$action', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 40 }])
    ]);

    res.json({
      success: true,
      events,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      categories
    });
  } catch (err) {
    console.error('Super admin activity error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to load the activity log' });
  }
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** GET /api/superadmin/users - every account, filterable and searchable. */
router.get('/users', superAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const filter = {};

    if (req.query.role) {
      if (!VALID_ROLES.includes(req.query.role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      filter.role = req.query.role;
    }

    if (req.query.status && VALID_USER_STATUSES.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    if (req.query.verified === 'true') filter.is_verified = true;
    if (req.query.verified === 'false') filter.is_verified = false;

    if (req.query.q && req.query.q.trim()) {
      const term = escapeRegex(req.query.q.trim().slice(0, 100));
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -verification_code_hash')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({ success: true, users, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    console.error('Super admin users error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

/** PUT /api/superadmin/users/:id/role - change a user's role. */
router.put('/users/:id/role', superAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const userId = toObjectId(req.params.id);

    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be one of: ' + VALID_ROLES.join(', ') });
    }

    // Lockout guards. Losing the last super admin, or promoting yourself, are
    // both unrecoverable without direct database access.
    if (userId.toString() === req.user.userId) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role' });
    }

    const target = await User.findById(userId).select('role email');
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    if (role !== 'super_admin' && target.role === 'super_admin') {
      const remaining = await User.countDocuments({ role: 'super_admin', _id: { $ne: userId } });
      if (remaining === 0) {
        return res.status(400).json({ success: false, message: 'At least one super admin must remain' });
      }
    }

    const user = await User.findByIdAndUpdate(userId, { $set: { role } }, { new: true, runValidators: true })
      .select('-password -verification_code_hash');

    audit.record(req, {
      action: 'admin.user_role_changed',
      description: `Role for ${target.email} changed from ${target.role} to ${role}`,
      entityType: 'user',
      entityId: userId.toString(),
      metadata: { from: target.role, to: role, target_email: target.email }
    });

    res.json({ success: true, message: `Role updated to ${role}`, user });
  } catch (err) {
    console.error('Update user role error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

/**
 * PUT /api/superadmin/users/:id/status
 *
 * Suspending takes effect on the user's very next request (the auth middleware
 * re-reads status on every call), so it does not wait for a token to expire.
 */
router.put('/users/:id/status', superAdmin, async (req, res) => {
  try {
    const { status, reason } = req.body;
    const userId = toObjectId(req.params.id);

    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });
    if (!VALID_USER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or suspended' });
    }

    if (userId.toString() === req.user.userId) {
      return res.status(400).json({ success: false, message: 'You cannot change your own status' });
    }

    const target = await User.findById(userId).select('email role status');
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    if (status === 'suspended' && target.role === 'super_admin') {
      const remaining = await User.countDocuments({ role: 'super_admin', status: 'active', _id: { $ne: userId } });
      if (remaining === 0) {
        return res.status(400).json({ success: false, message: 'At least one active super admin must remain' });
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { status, suspended_reason: status === 'suspended' ? cleanText(reason, 300) : '' } },
      { new: true, runValidators: true }
    ).select('-password -verification_code_hash');

    audit.record(req, {
      action: status === 'suspended' ? 'admin.user_suspended' : 'admin.user_reinstated',
      description: `${target.email} ${status === 'suspended' ? 'suspended' : 'reinstated'}`,
      entityType: 'user',
      entityId: userId.toString(),
      metadata: { target_email: target.email, reason: cleanText(reason, 300) }
    });

    res.json({ success: true, message: `Account ${status}`, user });
  } catch (err) {
    console.error('Update user status error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to update the account' });
  }
});

/**
 * PUT /api/superadmin/users/:id/verify
 *
 * Manual verification. The rescue hatch for a customer who cannot receive mail
 * (typo that happens to be deliverable, dead mailbox, filtered relay). Every
 * use is recorded, because this is the one action that can create a verified
 * account without proof of address ownership.
 */
router.put('/users/:id/verify', superAdmin, async (req, res) => {
  try {
    const userId = toObjectId(req.params.id);
    if (!userId) return res.status(400).json({ success: false, message: 'Invalid user id' });

    const target = await User.findById(userId).select('email is_verified');
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    if (target.is_verified) {
      return res.status(400).json({ success: false, message: 'That account is already verified' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { is_verified: true, verification_code_hash: '', verification_expires: null, verification_attempts: 0 } },
      { new: true, runValidators: true }
    ).select('-password -verification_code_hash');

    audit.record(req, {
      action: 'admin.user_manually_verified',
      description: `${target.email} marked verified by a super admin`,
      entityType: 'user',
      entityId: userId.toString(),
      metadata: { target_email: target.email, reason: cleanText(req.body.reason, 300) }
    });

    res.json({ success: true, message: 'Account marked as verified', user });
  } catch (err) {
    console.error('Manual verification error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to verify the account' });
  }
});

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/** GET /api/superadmin/stores - all stores, optional status filter. */
router.get('/stores', superAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      if (!VALID_STORE_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      filter.status = req.query.status;
    }

    const stores = await Store.find(filter)
      .populate('owner_id', 'name email role is_verified status')
      .sort({ created_at: -1 })
      .limit(200)
      .lean();

    res.json({ success: true, stores, count: stores.length });
  } catch (err) {
    console.error('Super admin stores error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stores' });
  }
});

/** PUT /api/superadmin/stores/:id/status - approve or suspend a store. */
router.put('/stores/:id/status', superAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const storeId = toObjectId(req.params.id);

    if (!storeId) return res.status(400).json({ success: false, message: 'Invalid store id' });
    if (!VALID_STORE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be one of: ' + VALID_STORE_STATUSES.join(', ') });
    }

    const store = await Store.findByIdAndUpdate(storeId, { $set: { status } }, { new: true, runValidators: true });
    if (!store) return res.status(404).json({ success: false, message: 'Store not found' });

    audit.record(req, {
      action: 'admin.store_moderated',
      description: `Store "${store.store_name}" set to ${status}`,
      entityType: 'store',
      entityId: storeId.toString(),
      metadata: { store_name: store.store_name, status }
    });

    res.json({ success: true, message: `Store status updated to ${status}`, store });
  } catch (err) {
    console.error('Moderate store error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to update store' });
  }
});

// ---------------------------------------------------------------------------
// Orders and payments
// ---------------------------------------------------------------------------

/** GET /api/superadmin/orders - every order on the platform. */
router.get('/orders', superAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const filter = {};

    if (req.query.status) {
      filter.order_status = String(req.query.status).toLowerCase();
    }
    if (req.query.payment_status) {
      filter.payment_status = String(req.query.payment_status).toLowerCase();
    }
    if (req.query.q && req.query.q.trim()) {
      const term = escapeRegex(req.query.q.trim().slice(0, 100));
      filter.order_reference = { $regex: term, $options: 'i' };
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate('buyer_id', 'name email')
        .populate('seller_id', 'name email')
        .populate('store_id', 'store_name')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter)
    ]);

    res.json({ success: true, orders, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    console.error('Super admin orders error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

/** GET /api/superadmin/payments - the full transaction ledger. */
router.get('/payments', superAdmin, async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const filter = {};

    if (req.query.status) filter.gateway_status = String(req.query.status).toLowerCase();
    if (req.query.method) filter.payment_method = String(req.query.method).toLowerCase();
    if (req.query.q && req.query.q.trim()) {
      filter.parent_transaction_id = { $regex: escapeRegex(req.query.q.trim().slice(0, 100)), $options: 'i' };
    }

    const [transactions, total, totals] = await Promise.all([
      Transaction.find(filter)
        .populate('buyer_id', 'name email')
        // A transaction has no single store: one checkout can settle for
        // several sellers at once, which is exactly what split_details records.
        // Populating a top-level store_id threw StrictPopulateError (the field
        // does not exist) and failed the whole endpoint.
        .populate({ path: 'split_details.store_id', select: 'store_name' })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(filter),
      Transaction.aggregate([
        { $match: { gateway_status: 'success' } },
        { $group: { _id: null, volume: { $sum: '$total_amount' }, commission: { $sum: '$platform_commission_total' } } }
      ])
    ]);

    const sum = totals[0] || { volume: 0, commission: 0 };

    res.json({
      success: true,
      transactions,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      settled_volume: sum.volume || 0,
      settled_commission: sum.commission || 0
    });
  } catch (err) {
    console.error('Super admin payments error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch payments' });
  }
});

/** GET /api/superadmin/earnings/platform - commission breakdown by gateway. */
router.get('/earnings/platform', superAdmin, async (req, res) => {
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
    console.error('Platform earnings error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch platform earnings' });
  }
});

// ---------------------------------------------------------------------------
// Support inbox
// ---------------------------------------------------------------------------

/** GET /api/superadmin/contact-inquiries - support inbox. */
router.get('/contact-inquiries', superAdmin, async (req, res) => {
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

    const inquiries = await ContactInquiry.find(filter).sort({ created_at: -1 }).limit(200).lean();

    res.json({ success: true, count: inquiries.length, inquiries });
  } catch (err) {
    console.error('Contact inquiries error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch contact inquiries' });
  }
});

/** GET /api/superadmin/contact-inquiries/stats - counts by status and mail outcome. */
router.get('/contact-inquiries/stats', superAdmin, async (req, res) => {
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
    console.error('Contact inquiry stats error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch contact inquiry stats' });
  }
});

/** PATCH /api/superadmin/contact-inquiries/:id - move an inquiry along. */
router.patch('/contact-inquiries/:id', superAdmin, async (req, res) => {
  try {
    const inquiryId = toObjectId(req.params.id);
    if (!inquiryId) return res.status(400).json({ success: false, message: 'Invalid inquiry id' });

    const { status } = req.body || {};
    if (!VALID_INQUIRY_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const inquiry = await ContactInquiry.findByIdAndUpdate(
      inquiryId,
      { status, resolved_at: status === 'resolved' ? new Date() : null },
      { new: true }
    );
    if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });

    audit.record(req, {
      action: 'admin.inquiry_updated',
      description: `Inquiry ${inquiry.reference_id} marked ${status}`,
      entityType: 'contact_inquiry',
      entityId: inquiryId.toString(),
      metadata: { reference_id: inquiry.reference_id, status }
    });

    res.json({ success: true, inquiry });
  } catch (err) {
    console.error('Update contact inquiry error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to update contact inquiry' });
  }
});

module.exports = router;
