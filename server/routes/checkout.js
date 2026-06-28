const express = require('express');
const router = express.Router();
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Product = require('../models/Product');
const Store = require('../models/Store');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { initializeTransaction } = require('../services/paystack');

// Generate unique reference
function generateRef(prefix) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${date}-${random}`;
}

// Checkout
router.post('/', auth, async (req, res) => {
  try {
    const { shipping_address } = req.body;

    // Get cart
    const cart = await Cart.findOne({ buyer_id: req.user.userId });
    if (!cart || !cart.items.length) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Group items by seller
    const sellerGroups = {};
    for (const item of cart.items) {
      const sellerKey = item.seller_id.toString();
      if (!sellerGroups[sellerKey]) {
        const store = await Store.findById(item.store_id);
        sellerGroups[sellerKey] = {
          seller_id: item.seller_id,
          store_id: item.store_id,
          store_name: store ? store.store_name : 'Unknown Store',
          commission_rate: store ? store.commission_rate : 10,
          items: [],
          subtotal: 0
        };
      }
      sellerGroups[sellerKey].items.push(item);
      sellerGroups[sellerKey].subtotal += item.price * item.quantity;
    }

    // Create parent transaction
    const parentTxnId = generateRef('ELS-TXN');
    const totalAmount = Object.values(sellerGroups).reduce((sum, g) => sum + g.subtotal, 0);

    const splitDetails = [];
    const orderIds = [];
    let platformTotal = 0;

    // Create one order per seller
    for (const group of Object.values(sellerGroups)) {
      const commission = Math.round(group.subtotal * group.commission_rate / 100);
      const payout = group.subtotal - commission;
      platformTotal += commission;

      const orderRef = generateRef('ELS-ORD');

      const order = new Order({
        order_reference: orderRef,
        parent_transaction_id: parentTxnId,
        buyer_id: req.user.userId,
        seller_id: group.seller_id,
        store_id: group.store_id,
        items: group.items.map(i => ({
          product_id: i.product_id,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          image_url: i.image_url
        })),
        subtotal: group.subtotal,
        total: group.subtotal,
        commission_rate: group.commission_rate,
        commission_amount: commission,
        seller_payout: payout,
        shipping_address: shipping_address || {},
        payment_status: 'pending',
        order_status: 'pending'
      });

      await order.save();
      orderIds.push(order._id);

      splitDetails.push({
        seller_id: group.seller_id,
        store_id: group.store_id,
        amount: group.subtotal,
        commission: commission,
        payout: payout,
        is_platform: false
      });
    }

    // Add platform commission split
    splitDetails.push({
      amount: platformTotal,
      is_platform: true
    });

    // Create transaction record
    const transaction = new Transaction({
      parent_transaction_id: parentTxnId,
      buyer_id: req.user.userId,
      total_amount: totalAmount,
      split_details: splitDetails,
      platform_commission_total: platformTotal,
      order_ids: orderIds,
      shipping_address: shipping_address || {},
      gateway_status: 'pending'
    });

    await transaction.save();

    // Clear cart
    await Cart.findOneAndDelete({ buyer_id: req.user.userId });

    // Initialize Paystack transaction
    const user = await User.findById(req.user.userId);
    const email = user ? user.email : 'customer@els.store';
    const callbackUrl = (process.env.APP_URL || 'http://localhost:8001') + '/payment-callback.html?trxref=' + parentTxnId;

    const paystackRes = await initializeTransaction({
      email: email,
      amount: Math.round(totalAmount * 100),
      currency: 'NGN',
      reference: parentTxnId,
      callback_url: callbackUrl,
      metadata: {
        buyer_id: req.user.userId,
        transaction_id: parentTxnId,
        order_ids: orderIds
      }
    });

    res.status(201).json({
      success: true,
      message: 'Checkout successful. Proceed to payment.',
      transaction: {
        parent_transaction_id: parentTxnId,
        total_amount: totalAmount,
        currency: 'NGN',
        split_summary: splitDetails.map(s => ({
          seller: s.seller_id || 'Platform',
          amount: s.amount,
          commission: s.commission || 0,
          payout: s.payout || s.amount
        })),
        order_count: orderIds.length,
        orders: orderIds
      },
      payment_url: paystackRes.data ? paystackRes.data.authorization_url : null,
      access_code: paystackRes.data ? paystackRes.data.access_code : null
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ success: false, message: 'Checkout failed' });
  }
});

module.exports = router;
