async function addToCart(backendId) {
  const token = localStorage.getItem('els_token');
  if (!token) {
    showToast('Please login first');
    return;
  }

  const prod = allProducts.find(p => p.__backendId === backendId);
  if (!prod) return;

  try {
    const res = await fetch(window.API_BASE + '/cart/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ product_id: backendId })
    });

    const data = await res.json();

    if (data.success) {
      showToast('✓ ' + prod.name + ' added to cart!');
      updateCartBadge();
    } else {
      showToast(data.message || 'Failed to add to cart');
    }
  } catch (err) {
    console.error('Add to cart error:', err);
    showToast('Failed to add to cart');
  }
}

async function removeFromCart(backendId) {
  const token = localStorage.getItem('els_token');
  if (!token) return;

  try {
    const res = await fetch(window.API_BASE + '/cart/item/' + backendId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    const data = await res.json();

    if (data.success) {
      updateCartBadge();
      renderCart();
    } else {
      showToast(data.message || 'Failed to remove item');
    }
  } catch (err) {
    console.error('Remove from cart error:', err);
    showToast('Failed to remove item');
  }
}

async function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  const token = localStorage.getItem('els_token');
  if (!token) {
    if (badge) badge.classList.add('hidden');
    return;
  }

  try {
    const res = await fetch(window.API_BASE + '/cart', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();

    if (data.success && badge) {
      const count = data.count || 0;
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    }
  } catch (err) {
    console.error('Update badge error:', err);
  }
}

async function renderCart() {
  const container = document.getElementById('cart-items');
  const summary = document.getElementById('cart-summary');
  const token = localStorage.getItem('els_token');

  if (!token) {
    container.innerHTML = '<p class="text-gray-400 text-center py-16">Please login to view your cart.</p>';
    if (summary) summary.classList.add('hidden');
    return;
  }

  try {
    const res = await fetch(window.API_BASE + '/cart', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();

    if (!data.success || !data.cart || !data.cart.items || !data.cart.items.length) {
      container.innerHTML = '<p class="text-gray-400 text-center py-16">Your cart is empty. <button onclick="goTo(\'shop\')" class="underline font-semibold" style="color:#e94560;">Start shopping!</button></p>';
      if (summary) summary.classList.add('hidden');
      return;
    }

    if (summary) summary.classList.remove('hidden');
    let total = 0;

    container.innerHTML = data.cart.items.map(c => {
      const sub = c.price * c.quantity;
      total += sub;
      const imgUrl = c.image_url || '';
      return `
      <div class="flex items-center gap-4 rounded-xl p-4" style="background:white;">
        <div class="w-20 h-20 rounded-lg bg-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">${imgUrl ? '<img src="'+imgUrl+'" class="w-full h-full object-cover" alt="'+escHtml(c.name)+'" loading="lazy">' : '<span class="text-3xl">📦</span>'}</div>
        <div class="flex-1 min-w-0">
          <h4 class="font-bold text-sm" style="color:#1a1a2e;">${escHtml(c.name)}</h4>
          <p class="text-sm text-gray-500">$${Number(c.price).toFixed(2)} × ${c.quantity}</p>
        </div>
        <span class="font-bold flex-shrink-0" style="color:#e94560;">$${sub.toFixed(2)}</span>
        <button onclick="removeFromCart('${c.product_id}')" class="text-gray-400 hover:text-red-500 p-1 flex-shrink-0"><i data-lucide="x" class="w-4 h-4"></i></button>
      </div>`;
    }).join('');

    document.getElementById('cart-total').textContent = '$' + total.toFixed(2);
    lucide.createIcons();
  } catch (err) {
    console.error('Render cart error:', err);
    container.innerHTML = '<p class="text-gray-400 text-center py-16">Failed to load cart. <button onclick="renderCart()" class="underline" style="color:#e94560;">Retry</button></p>';
    if (summary) summary.classList.add('hidden');
  }
}

function renderPayment() {
  loadPaymentPage();
}
