const { verifyTransaction } = require('./paystack');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');

const INTERVAL = 30 * 60 * 1000;
const ABANDON_TIMEOUT = 2 * 60 * 60 * 1000;

async function reconcile() {
  try {
    const pending = await Transaction.find({ gateway_status: 'pending' });
    let processed = 0;

    for (const txn of pending) {
      try {
        if (txn.gateway_reference) {
          const result = await verifyTransaction(txn.gateway_reference);

          if (result.status && result.data && result.data.status === 'success') {
            txn.gateway_status = 'success';
            await txn.save();
            await Order.updateMany(
              { parent_transaction_id: txn.parent_transaction_id },
              { $set: { payment_status: 'paid', order_status: 'confirmed' } }
            );
            processed++;
          } else if (result.data && result.data.status === 'failed') {
            txn.gateway_status = 'failed';
            await txn.save();
            await Order.updateMany(
              { parent_transaction_id: txn.parent_transaction_id },
              { $set: { payment_status: 'failed', order_status: 'cancelled' } }
            );
            processed++;
          }
        } else {
          const age = Date.now() - new Date(txn.created_at).getTime();
          if (age > ABANDON_TIMEOUT) {
            txn.gateway_status = 'failed';
            await txn.save();
            await Order.updateMany(
              { parent_transaction_id: txn.parent_transaction_id },
              { $set: { payment_status: 'failed', order_status: 'cancelled' } }
            );
            processed++;
          }
        }
      } catch (err) {
        console.error('Recon error for ' + txn.parent_transaction_id + ':', err.message);
      }
    }

    if (pending.length > 0) {
      console.log('Reconciliation: ' + processed + '/' + pending.length + ' resolved');
    }
  } catch (err) {
    console.error('Reconciliation error:', err);
  }
}

function start() {
  console.log('Payment reconciliation cron started (30min interval)');
  reconcile();
  setInterval(reconcile, INTERVAL);
}

module.exports = { start, reconcile };
