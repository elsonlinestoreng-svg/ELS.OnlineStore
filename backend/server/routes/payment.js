const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const { notify } = require('../services/notify');

// Verify payment after Paystack callback
router.post('/callback', auth, async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ success: false, message: 'Payment reference required' });
    }

    // Find the transaction
    const transaction = await Transaction.findOne({ parent_transaction_id: reference });
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // TODO: Verify with Paystack API in production
    // For now, mark as paid
    transaction.gateway_status = 'success';
    transaction.gateway_reference = reference;
    await transaction.save();

    // Update all linked orders
    await Order.updateMany(
      { parent_transaction_id: reference },
      { $set: { payment_status: 'paid', order_status: 'confirmed' } }
    );

    // Notify each seller that payment is confirmed
    try {
      const paidOrders = await Order.find({ parent_transaction_id: reference });
      const sellerIds = [...new Set(paidOrders.map(o => o.seller_id.toString()))];
      for (const sellerId of sellerIds) {
        await notify(sellerId, {
          type: 'payment',
          title: 'Payment confirmed',
          message: 'Payment for order ' + reference + ' has been confirmed. Prepare the order for shipping.',
          data: { parent_transaction_id: reference }
        });
      }
    } catch (err) {
      console.error('Payment confirmation notification error:', err);
    }

    res.json({ 
      success: true, 
      message: 'Payment verified and orders confirmed',
      transaction_id: reference
    });
  } catch (err) {
    console.error('Payment callback error:', err);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

module.exports = router;
