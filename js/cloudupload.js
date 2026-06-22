 let currentTotal = 0;

    function selectPaymentMethod(btn) {
      document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('border-emerald-500', 'bg-emerald-50'));
      btn.classList.add('border-emerald-500', 'bg-emerald-50');

      const method = btn.getAttribute('data-method');
      document.getElementById('card-payment-form').classList.toggle('hidden', method !== 'card');
      document.getElementById('bank-transfer-info').classList.toggle('hidden', method !== 'bank');
    }

    function payWithPaystack() {
      if (currentTotal <= 0) return alert("No amount to pay!");

      const handler = PaystackPop.setup({
        key: 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxx', // ← Replace with your actual Paystack Public Key
        email: "customer@example.com",
        amount: Math.round(currentTotal * 100),
        currency: "NGN",
        ref: 'ELS-' + Math.floor(Math.random() * 1000000000),
        callback: function(response) {
          alert('✅ Payment Successful! Reference: ' + response.reference);
          goTo('orders');
        },
        onClose: function() {
          alert('Payment cancelled');
        }
      });
      handler.openIframe();
    }

    function loadPaymentPage() {
      const cartTotalEl = document.getElementById('cart-total');
      currentTotal = cartTotalEl ? parseFloat(cartTotalEl.textContent.replace(/[^0-9.]/g, '')) || 15000 : 15000;
      document.getElementById('summary-total').textContent = '₦' + currentTotal.toLocaleString();
      document.getElementById('bank-amount').textContent = currentTotal.toLocaleString();
    }

    window.goTo = function(page) {
      document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
      const target = document.getElementById('page-' + page);
      if (target) {
        target.classList.remove('hidden');
        if (page === 'payment') loadPaymentPage();
      }
    };

    document.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();
    });