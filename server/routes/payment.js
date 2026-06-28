const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const { verifyTransaction } = require('../services/paystack');

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

    // Verify with Paystack API
    const result = await verifyTransaction(transaction.gateway_reference || reference);

    if (result.status && result.data && result.data.status === 'success') {
      transaction.gateway_status = 'success';
      transaction.gateway_reference = result.data.reference || reference;
      await transaction.save();

      await Order.updateMany(
        { parent_transaction_id: reference },
        { $set: { payment_status: 'paid', order_status: 'confirmed' } }
      );

      res.json({
        success: true,
        message: 'Payment verified and orders confirmed',
        transaction_id: reference,
        paystack: result.data
      });
    } else {
      // Paystack says not successful yet
      transaction.gateway_reference = transaction.gateway_reference || reference;
      await transaction.save();

      res.status(202).json({
        success: false,
        message: 'Payment not yet confirmed by gateway. Will be reconciled.',
        transaction_id: reference,
        gateway_status: result.data ? result.data.status : 'unknown'
      });
    }
  } catch (err) {
    console.error('Payment callback error:', err);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

module.exports = router;
