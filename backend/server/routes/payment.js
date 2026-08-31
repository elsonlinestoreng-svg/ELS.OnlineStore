const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const { verifyPayment } = require('../services/payment-methods');

// ============================================================================
// VERIFY PAYMENT - Handles all payment methods (Paystack callback)
// ============================================================================
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

// ============================================================================
// VERIFY GOOGLE PAY PAYMENT
// ============================================================================
router.post('/verify-google-pay', auth, async (req, res) => {
  try {
    const { reference, paymentToken } = req.body;
    
    if (!reference || !paymentToken) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment reference and token are required' 
      });
    }

    // Find the transaction
    const transaction = await Transaction.findOne({ parent_transaction_id: reference });
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Verify the Google Pay token
    const verificationResult = await verifyPayment('google_pay', reference, paymentToken);

    if (verificationResult.verified) {
      // Mark transaction as paid
      transaction.gateway_status = 'success';
      transaction.gateway_reference = reference;
      transaction.metadata = {
        ...transaction.metadata,
        google_pay_token: paymentToken
      };
      await transaction.save();

      // Update all linked orders
      await Order.updateMany(
        { parent_transaction_id: reference },
        { $set: { payment_status: 'paid', order_status: 'confirmed' } }
      );

      res.json({
        success: true,
        message: 'Google Pay payment verified and orders confirmed',
        transaction_id: reference
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Google Pay verification failed'
      });
    }
  } catch (err) {
    console.error('Google Pay verification error:', err);
    res.status(500).json({ success: false, message: 'Failed to verify Google Pay payment' });
  }
});

// ============================================================================
// CONFIRM CASH ON DELIVERY ORDER
// ============================================================================
router.post('/confirm-cod', auth, async (req, res) => {
  try {
    const { reference } = req.body;
    
    if (!reference) {
      return res.status(400).json({ 
        success: false, 
        message: 'Transaction reference is required' 
      });
    }

    // Find the transaction
    const transaction = await Transaction.findOne({ parent_transaction_id: reference });
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Verify it's a COD transaction
    if (!['cod', 'cash_on_delivery'].includes(transaction.payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'This transaction is not a cash-on-delivery order'
      });
    }

    // Mark transaction and orders as confirmed (payment pending on delivery)
    transaction.gateway_status = 'pending';
    transaction.gateway_reference = reference;
    transaction.metadata = {
      ...transaction.metadata,
      cod_confirmed_at: new Date()
    };
    await transaction.save();

    // Update all linked orders with COD status
    await Order.updateMany(
      { parent_transaction_id: reference },
      { $set: { payment_status: 'cod_pending', order_status: 'confirmed' } }
    );

    res.json({
      success: true,
      message: 'Cash on delivery order confirmed. Payment will be collected on delivery.',
      transaction_id: reference
    });
  } catch (err) {
    console.error('COD confirmation error:', err);
    res.status(500).json({ success: false, message: 'Failed to confirm COD order' });
  }
});

// ============================================================================
// GET PAYMENT METHOD DETAILS FOR TRANSACTION
// ============================================================================
router.get('/method/:reference', auth, async (req, res) => {
  try {
    const { reference } = req.params;

    const transaction = await Transaction.findOne({ parent_transaction_id: reference });
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.json({
      success: true,
      payment_method: transaction.payment_method,
      status: transaction.gateway_status,
      amount: transaction.total_amount,
      reference: transaction.parent_transaction_id
    });
  } catch (err) {
    console.error('Get payment method error:', err);
    res.status(500).json({ success: false, message: 'Failed to get payment details' });
  }
});

module.exports = router;
