const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');

// GET /api/earnings/seller
router.get('/seller', auth, async (req, res) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(req.user.userId);
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);

    const totalAgg = await Order.aggregate([
      { $match: { seller_id: sellerId, payment_status: 'paid' } },
      { $group: { _id: null, total: { $sum: '$seller_payout' } } }
    ]);
    const monthlyAgg = await Order.aggregate([
      { $match: { seller_id: sellerId, payment_status: 'paid', created_at: { $gte: monthAgo } } },
      { $group: { _id: null, total: { $sum: '$seller_payout' } } }
    ]);
    const pendingAgg = await Order.aggregate([
      { $match: { seller_id: sellerId, payment_status: { $ne: 'paid' } } },
      { $group: { _id: null, total: { $sum: '$seller_payout' } } }
    ]);

    const total = (totalAgg[0] && totalAgg[0].total) || 0;
    const monthly = (monthlyAgg[0] && monthlyAgg[0].total) || 0;
    const pending = (pendingAgg[0] && pendingAgg[0].total) || 0;

    // recent payout history from transactions
    const payouts = await Transaction.aggregate([
      { $match: { gateway_status: 'success', 'split_details.seller_id': sellerId } },
      { $unwind: '$split_details' },
      { $match: { 'split_details.seller_id': sellerId } },
      { $project: { parent_transaction_id: 1, amount: '$split_details.amount', payout: '$split_details.payout', commission: '$split_details.commission', created_at: 1 } },
      { $sort: { created_at: -1 } },
      { $limit: 20 }
    ]);

    res.json({ success: true, total, monthly, pending, payouts });
  } catch (err) {
    console.error('Earnings error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute earnings' });
  }
});

module.exports = router;
