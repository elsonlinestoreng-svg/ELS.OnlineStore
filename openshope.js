/**
 * Intercepts inputs dynamically from Store Registration to inject details down to the payment display panel
 */
function syncLiveCheckoutData() {
  const storeNameInput = document.getElementById('open-store-name').value;
  const bankAccountNum = document.getElementById('open-store-bank-account-number').value;
  const bankSelect = document.getElementById('open-store-bank-name').value;

  // Destination badges pointers
  const uiMerchantBadge = document.getElementById('active-checkout-merchant-badge');
  const uiRouteDisplay = document.getElementById('checkout-bank-route-display');

  // Sync logic processing strings instantly
  uiMerchantBadge.innerText = storeNameInput.trim() !== "" ? storeNameInput : "Awaiting Store Input...";
  
  if (bankSelect || bankAccountNum) {
    const hiddenAcc = bankAccountNum.length > 4 ? `•••• ${bankAccountNum.slice(-4)}` : bankAccountNum;
    uiRouteDisplay.innerText = `${bankSelect || 'Unselected Bank'} (${hiddenAcc || 'No Account'})`;
  } else {
    uiRouteDisplay.innerText = "No target active...";
  }
}

/**
 * Validates store and payment processing data in a unified pipeline block
 */
function handleStorePaymentPipeline(event) {
  event.preventDefault();

  // Validate that the checkout form parameters have details ready
  const cardName = document.getElementById('payment-card-name').value.trim();
  const cardNum = document.getElementById('payment-card-number').value.trim();
  const cardExpiry = document.getElementById('payment-card-expiry').value.trim();
  const cardCvv = document.getElementById('payment-card-cvv').value.trim();

  if (!cardName || !cardNum || !cardExpiry || !cardCvv) {
    alert("Please scroll down to the Secure Gateway Clearance box and provide your validation card info.");
    return false;
  }

  const submitBtn = document.getElementById('open-store-submit-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Processing Secure Gateway Handshake...</span>`;

  // Emulating gateway verification loop 
  setTimeout(() => {
    // Upgrading view status panel asynchronously
    const statusBox = document.getElementById('open-store-status');
    const storeName = document.getElementById('open-store-name').value;
    
    statusBox.innerHTML = `
      <div class="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs">
        <strong class="block font-bold mb-1">✓ Store Successfully Activated</strong>
        Your store "${storeName}" is fully loaded on the infrastructure network. Product listing is unlocked.
      </div>
    `;

    // Unlock draft and publish controls for product listing entry forms
    document.getElementById('save-draft-btn').disabled = false;
    document.getElementById('add-product-btn').disabled = false;

    alert("Payment verification cleared! Store setup is initialized.");
    submitBtn.innerHTML = `<span>Store Activated</span>`;
  }, 2500);
}