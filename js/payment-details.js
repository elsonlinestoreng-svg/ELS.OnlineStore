const PAYMENT_DETAILS_FORM = document.getElementById('payment-details-form');
const PAYMENT_RESULT = document.getElementById('payment-result');
const ALLOWED_METHODS = ['bank_transfer', 'cash_on_delivery', 'google_pay', 'international_card'];

async function loadSellerInfo() {
  const storedUser = localStorage.getItem('els_user');
  if (!storedUser) return;
  try {
    const user = JSON.parse(storedUser);
    const name = user.name || user.email || '';
    document.getElementById('store-name').value = name ? `${name}'s Store` : '';
  } catch (err) {
    console.warn('Unable to parse saved seller info', err);
  }
}

async function checkExistingStore() {
  const token = localStorage.getItem('els_token');
  if (!token) return;
  try {
    const res = await fetch((window.API_BASE || 'http://localhost:8001/api') + '/stores/mine', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.store) {
      const msg = document.getElementById('already-store');
      msg.textContent = 'You already have a store. You may update these details, then continue to upload products.';
      document.getElementById('store-name').value = data.store.store_name || '';
      document.getElementById('store-description').value = data.store.description || '';
      document.getElementById('bank-account-name').value = data.store.bank_account_name || '';
      document.getElementById('bank-account-number').value = data.store.bank_account_number || '';
      document.getElementById('bank-name').value = data.store.bank_name || '';
      if (ALLOWED_METHODS.includes(data.store.preferred_payment_method)) {
        document.getElementById('payment-method').value = data.store.preferred_payment_method;
      }
    }
  } catch (err) {
    console.warn('Check store failed', err);
  }
}

function validateDetails() {
  const storeName = document.getElementById('store-name').value.trim();
  const accountName = document.getElementById('bank-account-name').value.trim();
  const accountNumber = document.getElementById('bank-account-number').value.trim();
  const bankName = document.getElementById('bank-name').value.trim();
  const paymentMethod = document.getElementById('payment-method').value;

  if (!storeName || !accountName || !accountNumber || !bankName) {
    PAYMENT_RESULT.textContent = 'Store name and bank details are required.';
    return false;
  }
  if (!ALLOWED_METHODS.includes(paymentMethod)) {
    PAYMENT_RESULT.textContent = 'Please choose a valid payment method.';
    return false;
  }
  PAYMENT_RESULT.textContent = '';
  return true;
}

PAYMENT_DETAILS_FORM?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateDetails()) return;

  const payload = {
    store_name: document.getElementById('store-name').value.trim(),
    description: document.getElementById('store-description').value.trim(),
    bank_account_name: document.getElementById('bank-account-name').value.trim(),
    bank_account_number: document.getElementById('bank-account-number').value.trim(),
    bank_name: document.getElementById('bank-name').value.trim(),
    preferred_payment_method: document.getElementById('payment-method').value
  };

  const token = localStorage.getItem('els_token');
  if (!token) {
    PAYMENT_RESULT.textContent = 'Please login or register first.';
    return;
  }

  try {
    const API = window.API_BASE || 'http://localhost:8001/api';
    const existingStoreRes = await fetch(API + '/stores/mine', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const existingStore = existingStoreRes.ok ? await existingStoreRes.json() : null;

    const url = API + '/stores' + (existingStore && existingStore.success && existingStore.store ? '/' + existingStore.store._id : '');
    const method = existingStore && existingStore.success && existingStore.store ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      PAYMENT_RESULT.textContent = data.message || data.error || 'Failed to save payment details.';
      return;
    }

    localStorage.setItem('seller_store_id', data.store?._id || (existingStore && existingStore.store && existingStore.store._id) || '');
    window.location.href = 'product-upload.html';
  } catch (err) {
    console.error('Save payment details error', err);
    PAYMENT_RESULT.textContent = 'Connection error. Please try again.';
  }
});

loadSellerInfo();
checkExistingStore();
