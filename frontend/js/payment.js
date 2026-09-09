// payment.js — Multi-method payment system
// Supports: Card (Paystack), Bank Transfer, Google Pay, Cash on Delivery

window.currentPaymentTotal = 0;
window.currentTransactionRef = '';
window.currentPaymentMethod = 'card';

// ============================================================================
// PAYMENT METHOD SELECTION
// ============================================================================

function selectPaymentMethod(btn, method) {
  // Update UI - highlight selected button
  document.querySelectorAll('.payment-method-btn').forEach(b => {
    b.classList.remove('border-emerald-600', 'bg-emerald-50');
    b.classList.add('border-slate-200', 'bg-white');
  });
  
  if (btn && btn.classList) {
    btn.classList.remove('border-slate-200', 'bg-white');
    btn.classList.add('border-emerald-600', 'bg-emerald-50');
  }
  
  // Store selection
  window.currentPaymentMethod = method;
  
  // Hide all payment forms
  document.getElementById('card-payment-form')?.classList.add('hidden');
  document.getElementById('bank-transfer-info')?.classList.add('hidden');
  document.getElementById('google-pay-form')?.classList.add('hidden');
  document.getElementById('cod-confirmation')?.classList.add('hidden');
  
  // Show selected method form
  switch (method) {
    case 'card':
      document.getElementById('card-payment-form')?.classList.remove('hidden');
      // Keep alternatives visible if they were shown before (user coming back from alternatives)
      break;
    case 'bank':
      document.getElementById('bank-transfer-info')?.classList.remove('hidden');
      break;
    case 'google_pay':
      document.getElementById('google-pay-form')?.classList.remove('hidden');
      break;
    case 'cod':
      document.getElementById('cod-confirmation')?.classList.remove('hidden');
      break;
  }
}

// Go back to Paystack payment form (keeping alternatives visible)
function backToPaystack() {
  document.getElementById('google-pay-form')?.classList.add('hidden');
  document.getElementById('cod-confirmation')?.classList.add('hidden');
  document.getElementById('card-payment-form')?.classList.remove('hidden');
}

// ============================================================================
// CARD PAYMENT (PAYSTACK)
// ============================================================================

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

  // Show alternative payment methods
  const altMethods = document.getElementById('alternative-payment-methods');
  altMethods?.classList.remove('hidden');

  try {
    // Step 1: Call checkout with card payment method
    const checkoutRes = await fetch((window.API_BASE || 'http://localhost:8001/api') + '/checkout', {
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
        },
        payment_method: 'card'
      })
    });

    const checkoutData = await checkoutRes.json();

    if (!checkoutData.success) {
      alert('Checkout failed: ' + (checkoutData.message || 'Unknown error'));
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }

    window.currentTransactionRef = checkoutData.transaction.parent_transaction_id;

    // Step 2: Get user email for Paystack
    const userData = JSON.parse(localStorage.getItem('els_user') || '{}');
    const email = userData.email || 'customer@els.store';

    // Step 3: Redirect to Paystack if payment_url is available
    if (checkoutData.payment_data?.data?.authorization_url) {
      window.location.href = checkoutData.payment_data.data.authorization_url;
      return;
    }

    // Step 4: Fallback to Paystack popup
    const handler = PaystackPop.setup({
      key: window.PAYSTACK_PUBLIC_KEY || 'pk_test_e03176ae4b6a4910ea2bf5cb740923ccd27e877d',
      email: email,
      amount: Math.round(checkoutData.transaction.total_amount * 100),
      currency: checkoutData.transaction.currency || 'NGN',
      ref: checkoutData.transaction.parent_transaction_id,
      metadata: {
        transaction_id: checkoutData.transaction.parent_transaction_id
      },
      callback: function(response) {
        verifyPayment('paystack', response.reference);
      },
      onClose: function() {
        alert('Payment window closed. You can retry or use alternative methods.');
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
    handler.openIframe();
  } catch (err) {
    console.error('Payment error:', err);
    alert('Payment failed. Please try again or use alternative methods.');
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ============================================================================
// GOOGLE PAY PAYMENT
// ============================================================================

async function initializeGooglePay() {
  const token = localStorage.getItem('els_token');
  if (!token) {
    alert('Please login first');
    goTo('login');
    return;
  }

  try {
    // Step 1: Checkout with Google Pay method
    const checkoutRes = await fetch((window.API_BASE || 'http://localhost:8001/api') + '/checkout', {
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
        },
        payment_method: 'google_pay'
      })
    });

    const checkoutData = await checkoutRes.json();

    if (!checkoutData.success) {
      alert('Checkout failed: ' + (checkoutData.message || 'Unknown error'));
      return;
    }

    window.currentTransactionRef = checkoutData.transaction.parent_transaction_id;

    // Step 2: Check if Google Pay is available
    if (!window.google?.payments?.api) {
      alert('Google Pay is not available on this device');
      return;
    }

    const googlePayConfig = checkoutData.payment_data?.data || {
      merchantId: '12345678901234567890',
      merchantName: 'ELS Online Store'
    };

    const client = new window.google.payments.api.PaymentsClient({
      environment: 'TEST' // Change to PRODUCTION in production
    });

    // Create payment data request
    const paymentDataRequest = {
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [{
        type: 'CARD',
        parameters: {
          allowedCardNetworks: ['MASTERCARD', 'VISA'],
          allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS']
        },
        tokenizationSpecification: {
          type: 'PAYMENT_GATEWAY',
          parameters: {
            gateway: 'paystack',
            gatewayMerchantId: window.PAYSTACK_PUBLIC_KEY || 'pk_test_e03176ae4b6a4910ea2bf5cb740923ccd27e877d'
          }
        }
      }],
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPrice: (checkoutData.transaction.total_amount / 100).toFixed(2),
        currencyCode: checkoutData.transaction.currency || 'NGN'
      },
      merchantInfo: {
        merchantId: googlePayConfig.merchantId,
        merchantName: googlePayConfig.merchantName
      }
    };

    // Request payment
    client.requestPaymentData(paymentDataRequest)
      .then(paymentData => processGooglePayment(paymentData, checkoutData.transaction.parent_transaction_id))
      .catch(err => {
        console.error('Google Pay error:', err);
        alert('Google Pay transaction cancelled');
      });

  } catch (err) {
    console.error('Google Pay initialization error:', err);
    alert('Failed to initialize Google Pay');
  }
}

async function processGooglePayment(paymentData, reference) {
  try {
    const token = localStorage.getItem('els_token');
    
    // Verify Google Pay payment on backend
    const verifyRes = await fetch((window.API_BASE || 'http://localhost:8001/api') + '/payment/verify-google-pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        reference: reference,
        paymentToken: JSON.stringify(paymentData)
      })
    });

    const verifyData = await verifyRes.json();

    if (verifyData.success) {
      alert('✅ Google Pay payment successful! Order confirmed.');
      const badge = document.getElementById('cart-badge');
      if (badge) badge.classList.add('hidden');
      goTo('orders');
    } else {
      alert('⚠️ Payment verification failed: ' + verifyData.message);
    }
  } catch (err) {
    console.error('Google Pay verification error:', err);
    alert('Payment processing error. Please contact support.');
  }
}

// ============================================================================
// CASH ON DELIVERY (COD)
// ============================================================================

async function confirmCashOnDelivery() {
  const token = localStorage.getItem('els_token');
  if (!token) {
    alert('Please login first');
    goTo('login');
    return;
  }

  const btn = document.querySelector('#cod-confirmation button');
  const originalText = btn.textContent;
  btn.textContent = 'Processing...';
  btn.disabled = true;

  try {
    // Step 1: Checkout with COD method
    const checkoutRes = await fetch((window.API_BASE || 'http://localhost:8001/api') + '/checkout', {
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
        },
        payment_method: 'cod'
      })
    });

    const checkoutData = await checkoutRes.json();

    if (!checkoutData.success) {
      alert('Checkout failed: ' + (checkoutData.message || 'Unknown error'));
      btn.textContent = originalText;
      btn.disabled = false;
      return;
    }

    const reference = checkoutData.transaction.parent_transaction_id;

    // Step 2: Confirm COD on backend
    const confirmRes = await fetch((window.API_BASE || 'http://localhost:8001/api') + '/payment/confirm-cod', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ reference: reference })
    });

    const confirmData = await confirmRes.json();

    if (confirmData.success) {
      alert('✅ Order confirmed! Payment will be collected on delivery.');
      const badge = document.getElementById('cart-badge');
      if (badge) badge.classList.add('hidden');
      goTo('orders');
    } else {
      alert('⚠️ Failed to confirm order: ' + confirmData.message);
      btn.textContent = originalText;
      btn.disabled = false;
    }
  } catch (err) {
    console.error('COD confirmation error:', err);
    alert('Failed to confirm order. Please try again.');
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ============================================================================
// PAYMENT VERIFICATION (Paystack callback)
// ============================================================================

async function verifyPayment(method, reference) {
  try {
    const token = localStorage.getItem('els_token');
    const res = await fetch((window.API_BASE || 'http://localhost:8001/api') + '/payment/callback', {
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
      const badge = document.getElementById('cart-badge');
      if (badge) badge.classList.add('hidden');
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

// ============================================================================
// LOAD PAYMENT PAGE
// ============================================================================

async function loadPaymentPage() {
  const token = localStorage.getItem('els_token');
  
  if (token) {
    try {
      const res = await fetch((window.API_BASE || 'http://localhost:8001/api') + '/cart', {
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
        if (document.getElementById('cod-amount')) {
          document.getElementById('cod-amount').textContent = data.total.toLocaleString();
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
        
        // Auto-select card payment by default
        const cardButton = document.querySelector('.payment-method-btn[data-method="card"], .payment-method-btn:first-child');
        if (cardButton && !document.getElementById('card-payment-form').classList.contains('hidden')) {
          // Already visible, no need to select again
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
  if (document.getElementById('bank-amount')) {
    document.getElementById('bank-amount').textContent = '15,000';
  }
  if (document.getElementById('cod-amount')) {
    document.getElementById('cod-amount').textContent = '15,000';
  }
}
