// Payment Page Functions
function selectPaymentMethod(btn) {
  document.querySelectorAll('.payment-method-btn').forEach(b => {
    b.classList.remove('border-emerald-500', 'bg-emerald-50');
  });
  btn.classList.add('border-emerald-500', 'bg-emerald-50');

  const method = btn.getAttribute('data-method');
  document.getElementById('card-payment-form').classList.toggle('hidden', method !== 'card');
  document.getElementById('bank-transfer-info').classList.toggle('hidden', method !== 'bank');
}

function payWithPaystack() {
  // Replace with your real Paystack public key
  const handler = PaystackPop.setup({
    key: 'pk_test_your_key_here', // Change to live key when ready
    email: "customer@email.com",   // Get from logged in user
    amount: window.currentTotal * 100, // Amount in kobo
    currency: "NGN",
    ref: 'ELS-' + Math.floor((Math.random() * 1000000000) + 1),
    callback: function(response) {
      alert('Payment successful! Reference: ' + response.reference);
      // Clear cart, show success page, etc.
      goTo('orders');
    },
    onClose: function() {
      alert('Payment cancelled');
    }
  });
  handler.openIframe();
}

// Make sure this runs after cart is loaded
function loadPaymentPage() {
  // You can call this from goTo('payment')
  const total = document.getElementById('cart-total') ? 
                parseFloat(document.getElementById('cart-total').textContent.replace('₦','').replace(',','')) : 0;
  
  window.currentTotal = total || 15000; // fallback
  document.getElementById('summary-total').textContent = '₦' + window.currentTotal.toLocaleString();
}