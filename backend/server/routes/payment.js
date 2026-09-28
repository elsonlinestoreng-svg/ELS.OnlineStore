const express = require('express');
const router = express.Router();
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const { verifyPayment } = require('../services/payment-methods');
const { notify } = require('../services/notify');
const { sameUser, cleanText } = require('../utils/security');

/**
 * Loads a transaction and asserts the caller is allowed to act on it.
 *
 * Without this check, any authenticated user could pass an arbitrary
 * reference and mutate (or read) somebody else's transaction — an IDOR.
 */
async function loadTransactionForUser(reference, req, res) {
  const cleanRef = cleanText(reference, 120);
  if (!cleanRef) {
    res.status(400).json({ success: false, message: 'Payment reference required' });
    return null;
  }

  const transaction = await Transaction.findOne({ parent_transaction_id: cleanRef });
  if (!transaction) {
    res.status(404).json({ success: false, message: 'Transaction not found' });
    return null;
  }

  // Only the buyer who created the transaction may operate on it.
  if (!sameUser(transaction.buyer_id, req.user.userId)) {
    res.status(403).json({ success: false, message: 'Access denied' });
    return null;
  }

  return transaction;
}

// ============================================================================
// VERIFY PAYMENT - Handles all payment methods (Paystack callback)
// ============================================================================
router.post('/callback', auth, async (req, res) => {
  try {
    const transaction = await loadTransactionForUser(req.body && req.body.reference, req, res);
    if (!transaction) return;

    // Idempotency: never re-apply a settled transaction.
    if (transaction.gateway_status === 'success') {
      return res.json({
        success: true,
        message: 'Payment already verified',
        transaction_id: transaction.parent_transaction_id
      });
    }

    // Cash on delivery must never be settled through the gateway callback:
    // there is no provider proof of payment, so allowing it here would let a
    // buyer mark their own COD order paid with a single request. COD is
    // confirmed by the seller via /confirm-cod.
    if (['cod', 'cash_on_delivery'].includes(transaction.payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'Cash on delivery orders are confirmed by the seller on delivery'
      });
    }

    // The previous implementation trusted the client and marked the order
    // paid without ever contacting the payment gateway, which let anyone
    // "buy" anything for free by calling this endpoint.
    if (transaction.payment_method === 'card' || transaction.payment_method === 'bank') {
      const verification = await verifyPayment(transaction.payment_method, transaction.parent_transaction_id);

      if (!verification || verification.status !== true ||
          !verification.data || verification.data.status !== 'success') {
        return res.status(400).json({
          success: false,
          message: 'Payment could not be verified with the payment provider'
        });
      }

      // The gateway amount must match what we recorded, otherwise a valid
      // payment for a cheap item could be replayed to settle an expensive one.
      const gatewayAmount = verification.data.amount;
      if (typeof gatewayAmount === 'number' && Math.round(gatewayAmount) !== Math.round(transaction.total_amount * 100)) {
        return res.status(400).json({ success: false, message: 'Payment amount mismatch' });
      }
    }

    transaction.gateway_status = 'success';
    transaction.gateway_reference = transaction.parent_transaction_id;
    await transaction.save();

    await Order.updateMany(
      { parent_transaction_id: transaction.parent_transaction_id },
      { $set: { payment_status: 'paid', order_status: 'confirmed' } }
    );

    try {
      const paidOrders = await Order.find({ parent_transaction_id: transaction.parent_transaction_id });
      const sellerIds = [...new Set(paidOrders.map((o) => o.seller_id.toString()))];
      for (const sellerId of sellerIds) {
        await notify(sellerId, {
          type: 'payment',
          title: 'Payment confirmed',
          message: 'Payment for order ' + transaction.parent_transaction_id + ' has been confirmed. Prepare the order for shipping.',
          data: { parent_transaction_id: transaction.parent_transaction_id }
        });
      }
    } catch (err) {
      console.error('Payment confirmation notification error:', err && err.message);
    }

    res.json({
      success: true,
      message: 'Payment verified and orders confirmed',
      transaction_id: transaction.parent_transaction_id
    });
  } catch (err) {
    console.error('Payment callback error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

// ============================================================================
// VERIFY GOOGLE PAY PAYMENT
// ============================================================================
router.post('/verify-google-pay', auth, async (req, res) => {
  try {
    const { paymentToken } = req.body || {};
    const transaction = await loadTransactionForUser(req.body && req.body.reference, req, res);
    if (!transaction) return;

    if (!paymentToken || typeof paymentToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Payment reference and token are required'
      });
    }

    if (transaction.gateway_status === 'success') {
      return res.json({
        success: true,
        message: 'Payment already verified',
        transaction_id: transaction.parent_transaction_id
      });
    }

    const verificationResult = await verifyPayment('google_pay', transaction.parent_transaction_id, paymentToken);

    if (verificationResult && verificationResult.verified) {
      transaction.gateway_status = 'success';
      transaction.gateway_reference = transaction.parent_transaction_id;
      transaction.metadata = {
        ...transaction.metadata,
        google_pay_token: paymentToken
      };
      await transaction.save();

      await Order.updateMany(
        { parent_transaction_id: transaction.parent_transaction_id },
        { $set: { payment_status: 'paid', order_status: 'confirmed' } }
      );

      res.json({
        success: true,
        message: 'Google Pay payment verified and orders confirmed',
        transaction_id: transaction.parent_transaction_id
      });
    } else {
      res.status(400).json({ success: false, message: 'Google Pay verification failed' });
    }
  } catch (err) {
    console.error('Google Pay verification error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to verify Google Pay payment' });
  }
});

// ============================================================================
// CONFIRM CASH ON DELIVERY ORDER
// ============================================================================
router.post('/confirm-cod', auth, async (req, res) => {
  try {
    const transaction = await loadTransactionForUser(req.body && req.body.reference, req, res);
    if (!transaction) return;

    if (!['cod', 'cash_on_delivery'].includes(transaction.payment_method)) {
      return res.status(400).json({
        success: false,
        message: 'This transaction is not a cash-on-delivery order'
      });
    }

    if (transaction.gateway_status === 'success') {
      return res.json({
        success: true,
        message: 'Order already confirmed',
        transaction_id: transaction.parent_transaction_id
      });
    }

    transaction.gateway_status = 'pending';
    transaction.gateway_reference = transaction.parent_transaction_id;
    transaction.metadata = {
      ...transaction.metadata,
      cod_confirmed_at: new Date()
    };
    await transaction.save();

    await Order.updateMany(
      { parent_transaction_id: transaction.parent_transaction_id },
      { $set: { payment_status: 'cod_pending', order_status: 'confirmed' } }
    );

    res.json({
      success: true,
      message: 'Cash on delivery order confirmed. Payment will be collected on delivery.',
      transaction_id: transaction.parent_transaction_id
    });
  } catch (err) {
    console.error('COD confirmation error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to confirm COD order' });
  }
});

// ============================================================================
// GET PAYMENT METHOD DETAILS FOR TRANSACTION
// ============================================================================
router.get('/method/:reference', auth, async (req, res) => {
  try {
    const transaction = await loadTransactionForUser(req.params.reference, req, res);
    if (!transaction) return;

    res.json({
      success: true,
      payment_method: transaction.payment_method,
      status: transaction.gateway_status,
      amount: transaction.total_amount,
      reference: transaction.parent_transaction_id
    });
  } catch (err) {
    console.error('Get payment method error:', err && err.message);
    res.status(500).json({ success: false, message: 'Failed to get payment details' });
  }
});

module.exports = router;
