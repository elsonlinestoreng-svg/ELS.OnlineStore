function addToCart(backendId) {
  const prod = allProducts.find(p => p.__backendId === backendId);
  if (!prod) return;
  const existing = cart.find(c => c.__backendId === backendId);
  if (existing) existing.qty++;
  else cart.push({ ...prod, qty: 1 });
  updateCartBadge();
  showToast(`✓ ${prod.name} added to cart!`);
}

function removeFromCart(backendId) {
  cart = cart.filter(c => c.__backendId !== backendId);
  updateCartBadge();
  renderCart();
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  const total = cart.reduce((s, c) => s + c.qty, 0);
  badge.textContent = total;
  badge.classList.toggle('hidden', total === 0);
}

function renderCart() {
  const container = document.getElementById('cart-items');
  const summary = document.getElementById('cart-summary');
  if (!cart.length) {
    container.innerHTML = '<p class="text-gray-400 text-center py-16">Your cart is empty. <button onclick="goTo(\'shop\')" class="underline font-semibold" style="color:#e94560;">Start shopping!</button></p>';
    summary.classList.add('hidden');
    return;
  }
  summary.classList.remove('hidden');
  let total = 0;
  container.innerHTML = cart.map(c => {
    const sub = c.qty * c.price;
    total += sub;
    return `
    <div class="flex items-center gap-4 rounded-xl p-4" style="background:white;">
      <div class="w-20 h-20 rounded-lg bg-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">${c.image_data ? `<img src="${c.image_data}" class="w-full h-full object-cover" alt="${escHtml(c.name)}" loading="lazy">` : '<span class="text-3xl">📦</span>'}</div>
      <div class="flex-1 min-w-0">
        <h4 class="font-bold text-sm" style="color:#1a1a2e;">${escHtml(c.name)}</h4>
        <p class="text-sm text-gray-500">$${Number(c.price).toFixed(2)} × ${c.qty}</p>
      </div>
      <span class="font-bold flex-shrink-0" style="color:#e94560;">$${sub.toFixed(2)}</span>
      <button onclick="removeFromCart('${c.__backendId}')" class="text-gray-400 hover:text-red-500 p-1 flex-shrink-0"><i data-lucide="x" class="w-4 h-4"></i></button>
    </div>`;
  }).join('');
  document.getElementById('cart-total').textContent = '$' + total.toFixed(2);
  lucide.createIcons();
}

function renderPayment() {
  const itemsEl = document.getElementById('payment-items');
  let total = 0;
  itemsEl.innerHTML = cart.map(c => { const sub = c.qty * c.price; total += sub; return `<div class="flex justify-between"><span>${escHtml(c.name)} ×${c.qty}</span><span>$${sub.toFixed(2)}</span></div>`; }).join('');
  document.getElementById('payment-total').textContent = '$' + total.toFixed(2);
}

function handlePayment(e) {
  e.preventDefault();
  const method = document.getElementById('delivery-method').value;
  const buyerName = (window.currentUser && window.currentUser.name) || (typeof currentUser !== 'undefined' && currentUser.name) || 'Valued Customer';
  const subtotal = cart.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
  const orderId = `ORD-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  const trackingNumber = `TRK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const order = {
    order_id: orderId,
    buyer: buyerName,
    buyer_name: buyerName,
    items: cart.map(item => ({ name: item.name, price: item.price, qty: item.qty || 1 })),
    total_amount: parseFloat(subtotal.toFixed(2)),
    delivery_method: method || 'Standard',
    order_status: 'Pending Logistics',
    tracking_number: trackingNumber,
    created_at: new Date().toISOString()
  };

  allOrders.push(order);
  cart = [];
  updateCartBadge();

  if (typeof setAppreciationMessage === 'function') {
    setAppreciationMessage(order);
  }
  if (typeof renderOrders === 'function') {
    renderOrders();
  }

  showToast(`Thank you ${buyerName}! Your order ${orderId} is confirmed.`);
  goTo('orders');
}
