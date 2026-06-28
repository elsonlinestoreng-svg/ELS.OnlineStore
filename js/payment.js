// payment.js — Bridges Sunday's payment UI with backend checkout
// Loaded after els2app.js, before other scripts

window.currentPaymentTotal = 0;
window.currentTransactionRef = '';

// Override the payWithPaystack function to use real backend data
async function payWithPaystack() {
  const token = localStorage.getItem('els_token');
  if (!token) {
    alert('Please login first');
    goTo('login');
    return;
  }

  // Show loading
  const btn = document.querySelector('#card-payment-form button');
  const originalText = btn.textContent;
  btn.textContent = 'Preparing payment...';
  btn.disabled = true;

  try {
    // Step 1: Call our backend checkout endpoint
    const checkoutRes = await fetch(window.API_BASE + '/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        shipping_address: {
          street: document.getElementById('shipping-street')?.value || '',
          city: document.getElementById('shipping-city')?.value || '',
          state: document.getElementById('shipping-state')?.value || '',
          country: 'Nigeria',
          phone: document.getElementById('shipping-phone')?.value || ''
        }
      })
    });

    const checkoutData = await checkoutRes.json();

    if (!checkoutData.success) {
      alert('Checkout failed: ' + (checkoutData.message || 'Unknown error'));
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }

    // Step 2: Get user email for Paystack
    const userData = JSON.parse(localStorage.getItem('els_user') || '{}');
    const email = userData.email || 'customer@els.store';

    // Step 3: Open Paystack with real transaction data
    const handler = PaystackPop.setup({
      key: 'pk_test_e03176ae4b6a4910ea2bf5cb740923ccd27e877d',
      email: email,
      amount: Math.round(checkoutData.transaction.total_amount * 100), // Convert to kobo
      currency: checkoutData.transaction.currency || 'NGN',
      ref: checkoutData.transaction.parent_transaction_id,
      metadata: {
        transaction_id: checkoutData.transaction.parent_transaction_id
      },
      callback: function(response) {
        // Payment successful — verify on backend
        verifyPayment(response.reference);
      },
      onClose: function() {
        alert('Payment window closed. You can retry from your orders page.');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
    handler.openIframe();
  } catch (err) {
    console.error('Payment error:', err);
    alert('Payment failed. Please try again.');
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// Verify payment with backend after Paystack callback
async function verifyPayment(reference) {
  try {
    const token = localStorage.getItem('els_token');
    const res = await fetch(window.API_BASE + '/payment/callback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ reference: reference })
    });

    const data = await res.json();

    if (data.success) {
      alert('✅ Payment successful! Order confirmed.');
      // Clear cart badge
      const badge = document.getElementById('cart-badge');
      if (badge) badge.classList.add('hidden');
      // Go to orders
      goTo('orders');
    } else {
      alert('⚠️ Payment received but verification pending. Check orders.');
      goTo('orders');
    }
  } catch (err) {
    console.error('Verify error:', err);
    alert('Payment completed. Check your orders for status.');
    goTo('orders');
  }
}

// Override loadPaymentPage to use real cart total from backend
async function loadPaymentPage() {
  const token = localStorage.getItem('els_token');
  
  // Try to get cart total from backend
  if (token) {
    try {
      const res = await fetch(window.API_BASE + '/cart', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      
      if (data.success && data.total > 0) {
        window.currentPaymentTotal = data.total;
        document.getElementById('summary-total').textContent = '₦' + data.total.toLocaleString();
        document.getElementById('summary-subtotal').textContent = '₦' + data.total.toLocaleString();
        if (document.getElementById('bank-amount')) {
          document.getElementById('bank-amount').textContent = data.total.toLocaleString();
        }
        
        // Render cart items in payment summary
        const itemsContainer = document.getElementById('payment-items');
        if (itemsContainer && data.cart.items) {
          itemsContainer.innerHTML = data.cart.items.map(item => 
            `<div class="flex justify-between text-sm">
              <span>${item.name} x${item.quantity}</span>
              <span>₦${(item.price * item.quantity).toLocaleString()}</span>
            </div>`
          ).join('');
        }
        return;
      }
    } catch (err) {
      console.log('Could not fetch cart, using default');
    }
  }
  
  // Fallback
  window.currentPaymentTotal = 15000;
  document.getElementById('summary-total').textContent = '₦15,000';
}
