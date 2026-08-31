function renderOrders() {
  const userOrders = allOrders.filter(o => o.buyer === currentUser.name);
  const container = document.getElementById('orders-list');
  if (!userOrders.length) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8">No orders yet. <button onclick="goTo(\'shop\')" class="underline font-semibold" style="color:#e94560;">Start shopping!</button></p>';
    document.getElementById('total-orders').textContent = '0';
    document.getElementById('in-transit-count').textContent = '0';
    document.getElementById('delivered-count').textContent = '0';
    return;
  }
  document.getElementById('total-orders').textContent = userOrders.length;
  const inTransit = userOrders.filter(o => o.order_status === 'In Transit').length;
  const delivered = userOrders.filter(o => o.order_status === 'Delivered').length;
  document.getElementById('in-transit-count').textContent = inTransit;
  document.getElementById('delivered-count').textContent = delivered;
  container.innerHTML = userOrders.map(o => `
    <div class="rounded-xl p-4 border-l-4 transition" style="background:white; border-color: ${o.order_status === 'Delivered' ? '#27ae60' : o.order_status === 'In Transit' ? '#0f3460' : '#e94560'};">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        <div>
          <p class="font-bold" style="color:#1a1a2e;">${o.order_id}</p>
          <p class="text-xs text-gray-500">${new Date(o.created_at).toLocaleDateString()}</p>
        </div>
        <span class="px-3 py-1 rounded-full text-xs font-semibold text-white w-fit" style="background: ${o.order_status === 'Delivered' ? '#27ae60' : o.order_status === 'In Transit' ? '#0f3460' : '#e94560'};">${o.order_status}</span>
      </div>
      <div class="mb-2 text-sm text-gray-600">
        <p>${o.items.map(i => i.name).join(', ')}</p>
        <p class="text-xs text-gray-500 mt-1">Delivery: ${o.delivery_method} | Total: <strong style="color:#e94560;">$${o.total_amount.toFixed(2)}</strong></p>
      </div>
      ${o.tracking_number ? `<p class="text-xs font-mono text-gray-500">Track: ${o.tracking_number}</p>` : '<p class="text-xs text-gray-400">Waiting for logistics assignment...</p>'}
    </div>
  `).join('');
}

function renderLogisticsView() {
  const sellerOrders = allOrders.filter(o => o.items.some(i => i.seller === currentUser.name));
  const pendingOrders = sellerOrders.filter(o => o.order_status === 'Pending Logistics');
  document.getElementById('seller-balance').textContent = '$' + ((Math.random() * 5000).toFixed(2));
  document.getElementById('pending-shipments').textContent = pendingOrders.length;
  document.getElementById('completed-seller-orders').textContent = sellerOrders.filter(o => o.order_status === 'Delivered').length;
  const sellerContainer = document.getElementById('seller-pending-orders');
  if (!pendingOrders.length) {
    sellerContainer.innerHTML = '<p class="text-gray-400 text-center py-8">No pending orders to ship.</p>';
  } else {
    sellerContainer.innerHTML = pendingOrders.map(o => `
      <div class="rounded-lg p-3 border border-gray-200">
        <div class="flex justify-between items-start mb-2">
          <div>
            <p class="font-bold text-sm" style="color:#1a1a2e;">${o.order_id}</p>
            <p class="text-xs text-gray-500">To: ${o.buyer_name}</p>
          </div>
          <button onclick="requestLogisticsPickup('${o.order_id}')" class="px-3 py-1 rounded text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600">Book Logistics</button>
        </div>
        <p class="text-xs text-gray-600">${o.delivery_method} • $${o.total_amount.toFixed(2)}</p>
      </div>
    `).join('');
  }

  const availableOrders = allOrders.filter(o => o.order_status === 'Pending Logistics');
  const activeDeliveries = allOrders.filter(o => o.order_status === 'In Transit' && o.logistics_provider === currentUser.name);
  document.getElementById('logistics-balance').textContent = '$' + ((Math.random() * 8000).toFixed(2));
  document.getElementById('active-shipments').textContent = activeDeliveries.length;
  document.getElementById('completed-deliveries').textContent = allOrders.filter(o => o.order_status === 'Delivered' && o.logistics_provider === currentUser.name).length;
  const availableContainer = document.getElementById('available-shipments');
  if (!availableOrders.length) {
    availableContainer.innerHTML = '<p class="text-gray-400 text-center py-8">No pending shipments available.</p>';
  } else {
    availableContainer.innerHTML = availableOrders.map(o => `
      <div class="rounded-lg p-3 border border-green-200" style="background:#f0fdf4;">
        <div class="flex justify-between items-start mb-2">
          <div>
            <p class="font-bold text-sm" style="color:#1a1a2e;">${o.order_id}</p>
            <p class="text-xs text-gray-600">${o.buyer_name} → ${o.delivery_method}</p>
          </div>
          <button onclick="acceptShipment('${o.order_id}')" class="px-3 py-1 rounded text-xs font-semibold text-white bg-green-500 hover:bg-green-600">Accept</button>
        </div>
        <p class="text-xs font-semibold" style="color:#27ae60;">Earnings: $${o.logistics_fee.toFixed(2)}</p>
      </div>
    `).join('');
  }

  const deliveriesContainer = document.getElementById('active-deliveries');
  if (!activeDeliveries.length) {
    deliveriesContainer.innerHTML = '<p class="text-gray-400 text-center py-8">No active deliveries.</p>';
  } else {
    deliveriesContainer.innerHTML = activeDeliveries.map(o => `
      <div class="rounded-lg p-3 border border-blue-200" style="background:#eff6ff;">
        <div class="flex justify-between items-start mb-2">
          <div>
            <p class="font-bold text-sm" style="color:#1a1a2e;">${o.order_id} - ${o.tracking_number}</p>
            <p class="text-xs text-gray-600">To: ${o.buyer_name}</p>
          </div>
          <button onclick="completeDelivery('${o.order_id}')" class="px-3 py-1 rounded text-xs font-semibold text-white bg-green-600 hover:bg-green-700">Mark Delivered</button>
        </div>
        <p class="text-xs text-gray-600">${o.delivery_method}</p>
      </div>
    `).join('');
  }
}

function toggleLogisticsRole() {
  isLogisticsProvider = !isLogisticsProvider;
  document.getElementById('seller-logistics-view').classList.toggle('hidden');
  document.getElementById('logistics-provider-view').classList.toggle('hidden');
  document.getElementById('logistics-role-btn').textContent = isLogisticsProvider ? 'Switch to Seller View' : 'Switch to Logistics View';
  renderLogisticsView();
}

function requestLogisticsPickup(orderId) {
  const order = allOrders.find(o => o.order_id === orderId);
  if (order) {
    order.order_status = 'Awaiting Pickup';
    showToast('✓ Logistics pickup requested');
    renderLogisticsView();
  }
}

function acceptShipment(orderId) {
  const order = allOrders.find(o => o.order_id === orderId);
  if (order) {
    order.order_status = 'In Transit';
    order.logistics_provider = currentUser.name;
    order.tracking_number = 'TRK-' + Math.random().toString(36).substring(2, 10).toUpperCase();
    order.estimated_delivery = new Date(Date.now() + 3*24*60*60*1000).toLocaleDateString();
    showToast(`✓ Shipment accepted! Earned $${order.logistics_fee.toFixed(2)}`);
    renderLogisticsView();
    renderOrders();
    try {
      const convId = `order-${orderId}`;
      let conv = conversations.find(c => c.id === convId);
      if (!conv) {
        conv = { id: convId, title: `Order ${orderId}`, orderId: orderId, participants: [order.buyer_name, currentUser.name], messages: [] };
        conversations.push(conv);
      }
      conv.messages.push({ sender: currentUser.name, text: `I've accepted this shipment and will deliver it. Tracking: ${order.tracking_number}`, time: new Date().toISOString() });
    } catch (e) { console.warn('order chat create failed', e); }
  }
}

function completeDelivery(orderId) {
  const order = allOrders.find(o => o.order_id === orderId);
  if (order) {
    order.order_status = 'Delivered';
    showToast(`✓ Delivery completed! Payment $${order.logistics_fee.toFixed(2)} + Product sales released to seller`);
    renderLogisticsView();
    renderOrders();
  }
}
// Small utility: toggle password visibility used by several forms
function togglePasswordVisibility(fieldId, btn){
  const f = document.getElementById(fieldId);
  if(!f) return;
  if(f.type === 'password'){ f.type = 'text'; if(btn) btn.setAttribute('aria-pressed','true'); }
  else { f.type = 'password'; if(btn) btn.setAttribute('aria-pressed','false'); }
  try{ lucide && lucide.createIcons && lucide.createIcons(); }catch(e){}
}

// Enhanced features merged from index2.js: payment, logistics simulation, and login enhancements
(function(){
  // Payment system: support QR, simulated card, and split payments
  function calculateTotals(cart){ const subtotal = (cart||[]).reduce((s,i)=>s + (i.price||0)*(i.quantity||1),0); const shipping = 9.99; const tax = (subtotal+shipping)*0.08; const total = +(subtotal+shipping+tax).toFixed(2); return {subtotal,shipping,tax,total}; }

  function openPaymentChooser(){ const items = window.els2App ? window.els2App : null; const cart = window.els2App ? (window.els2App._cart||[]) : []; const totals = calculateTotals(cart); // show modal
    const modal = document.getElementById('qrModal'); if(!modal) return; const amt = document.getElementById('qrModalAmount'); if(amt) amt.textContent = '$'+(totals.total||0).toFixed(2);
    // add options
    let opts = modal.querySelector('.qr-modal-instructions'); if(opts){ opts.innerHTML = opts.innerHTML + `<div class="payment-options" style="display:flex;gap:8px;justify-content:center;margin-top:12px"><button class="btn btn-primary" id="pay-qr">Pay with QR</button><button class="btn btn-secondary" id="pay-card">Pay with Card (Sim)</button><button class="btn btn-secondary" id="pay-split">Split Payment</button></div>`; }
    modal.classList.add('active');
    setTimeout(()=>{ document.getElementById('pay-qr') && document.getElementById('pay-qr').addEventListener('click', ()=>{ window.els2App && window.els2App.openQRModal && window.els2App.openQRModal(); }); document.getElementById('pay-card') && document.getElementById('pay-card').addEventListener('click', ()=>{ alert('Card payment simulated — success'); window.els2App && window.els2App.completeOrder && window.els2App.completeOrder(); }); document.getElementById('pay-split') && document.getElementById('pay-split').addEventListener('click', ()=>{ alert('Split payment flow started (demo)'); window.els2App && window.els2App.completeOrder && window.els2App.completeOrder(); }); },200);
  }

  // Logistics: simulate GPS updates and auto-advance timeline
  function simulateLogistics(orderId){ const steps = ['step-Pending','step-Paid','step-Processing','step-Shipped','step-Delivered']; let i=0; function step(){ if(i>0){ const prev = document.getElementById(steps[i-1]); if(prev){ prev.classList.remove('current'); prev.classList.add('completed'); } } const el = document.getElementById(steps[i]); if(el){ el.classList.add('current'); } // update telemetry
        const speedEl = document.getElementById('tel-speed'); const etaEl = document.getElementById('tel-eta'); if(speedEl) speedEl.textContent = Math.floor(Math.random()*60)+' km/h'; if(etaEl) etaEl.textContent = (30 - i*6)+' mins'; i++; if(i<steps.length) setTimeout(step, 4000); }
    step(); }

  // Improved login: support role selection for regional delivery efficiency
  function handleLoginEnhanced(e){ e && e.preventDefault(); const email = document.getElementById('login-email').value; const pass = document.getElementById('login-pass').value; const region = document.getElementById('login-region') ? document.getElementById('login-region').value : 'global'; // basic validation
    if(!email||!pass){ alert('Enter email and password'); return; }
    // demo: set user region & role
    window.__ELS_USER = { email, region, role:'buyer' };
    // if region indicates delivery operator, set role
    if(region && region.toLowerCase().includes('driver')) window.__ELS_USER.role='delivery';
    // show main app
    document.getElementById('auth-screen') && document.getElementById('auth-screen').classList.add('hidden'); document.getElementById('main-app') && document.getElementById('main-app').classList.remove('hidden');
    // personalize avatar initial
    const initial = (email||'U').charAt(0).toUpperCase(); const avatar = document.getElementById('user-avatar-initial'); if(avatar) avatar.textContent = initial; // if delivery role, navigate to logistics
    if(window.__ELS_USER.role==='delivery'){ if(typeof goTo === 'function') goTo('logistics'); }
  }

  // wire enhanced handlers
  document.addEventListener('DOMContentLoaded', ()=>{
    const loginForm = document.getElementById('login-form'); if(loginForm){ loginForm.removeEventListener('submit', handleLoginEnhanced); loginForm.addEventListener('submit', handleLoginEnhanced); }
    // add a small select near login for region (if not present, create)
    if(!document.getElementById('login-region')){
      const node = document.createElement('select'); node.id='login-region'; node.style.marginTop='8px'; node.className='w-full px-4 py-2 rounded-xl bg-white/5 text-white'; node.innerHTML = `<option value="global">Region: Global</option><option value="lagos">Region: Lagos</option><option value="abuja">Region: Abuja</option><option value="driver-lagos">Role: Driver (Lagos)</option>`; const form = document.getElementById('login-form'); if(form) form.appendChild(node);
    }
    // expose utilities
    window.ELS = window.ELS||{}; window.ELS.calculateTotals = calculateTotals; window.ELS.simulateLogistics = simulateLogistics; window.ELS.openPaymentChooser = openPaymentChooser;
  });
})();

  // --- Logistics add-ons: partner API integration and live map streaming ---
  window.deliveryPartners = window.deliveryPartners || [];
  const DELIVERY_API = (window.API_BASE || 'http://localhost:8001/api') + '/delivery';

  async function renderPartnersList(){
    const listEl = document.getElementById('logisticsPartnersList');
    if(!listEl) return;
    try{
      const res = await fetch(DELIVERY_API);
      if(res.ok){ const data = await res.json(); window.deliveryPartners = data.partners || []; }
    }catch(e){ /* fallback to local */ }
    const partners = window.deliveryPartners || [];
    document.getElementById('availablePartnersCount') && (document.getElementById('availablePartnersCount').textContent = String(partners.length));
    document.getElementById('readyPickupCount') && (document.getElementById('readyPickupCount').textContent = String(partners.filter(p=>p.online).length));
    if(!partners.length){ listEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-8">No partners registered yet.</p>'; return; }
    listEl.innerHTML = partners.map(p=>`
      <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between">
        <div>
          <div class="font-bold text-sm">${p.name} <span class="text-xs text-slate-400">(${p.region||''})</span></div>
          <div class="text-xs text-slate-500">${p.vehicle||'—'} • ${p.phone||''}</div>
        </div>
        <div class="flex flex-col gap-2">
          <button class="px-3 py-1 rounded text-xs bg-emerald-400 text-slate-900" onclick="togglePartnerOnline('${p._id||p.id}')">${p.online? 'Go Offline':'Go Online'}</button>
          <button class="px-3 py-1 rounded text-xs border" onclick="panToPartner('${p._id||p.id}')">Locate</button>
        </div>
      </div>
    `).join('');
  }

  async function handleDeliveryPartnerRegister(e){ e && e.preventDefault(); const name = (document.getElementById('dp-name')||{}).value || ''; const email = (document.getElementById('dp-email')||{}).value || ''; const phone = (document.getElementById('dp-phone')||{}).value || ''; const vehicle = (document.getElementById('dp-vehicle')||{}).value || ''; const license = (document.getElementById('dp-license')||{}).value || ''; const region = (document.getElementById('dp-region')||{}).value || ''; if(!name||!email||!phone){ showToast('Please fill name, email and phone'); return; }
    const payload = { name, email, phone, vehicle, license, region, loc: { lat: 6.5244 + (Math.random()-0.5)*0.1, lng: 3.3792 + (Math.random()-0.5)*0.1 } };
    try{
      const res = await fetch(DELIVERY_API + '/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(res.ok){ const data = await res.json(); showToast('Partner registered'); closeDeliveryPartnerModal(); await renderPartnersList(); return; }
      const err = await res.json().catch(()=>({})); showToast(err.message || 'Registration failed');
    }catch(err){ console.error('register err', err); showToast('Network error'); }
  }

  async function handleDeliveryPartnerLogin(e){ e && e.preventDefault(); const email = (document.getElementById('dp-login-email')||{}).value || ''; const pass = (document.getElementById('dp-login-pass')||{}).value || ''; if(!email||!pass){ showToast('Enter email and password'); return; }
    try{ await renderPartnersList(); const p = (window.deliveryPartners||[]).find(x => (x.email||'').toLowerCase() === email.toLowerCase()); if(!p){ showToast('Partner not found'); return; } currentUser = { name: p.name, role: 'delivery' }; showToast('Welcome, ' + p.name); closeDeliveryPartnerModal(); if(typeof goTo === 'function') goTo('logistics'); }catch(e){ console.error(e); showToast('Login failed'); }
  }

  async function togglePartnerOnline(id){ try{ const res = await fetch(DELIVERY_API + '/' + id + '/online', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ online: true }) }); if(res.ok){ await renderPartnersList(); showToast('Partner online'); return; } }catch(e){ console.warn('toggle err', e); }
    // fallback to local toggle
    const p = (window.deliveryPartners||[]).find(x=> (x._id||x.id)===id); if(p){ p.online = !p.online; renderPartnersList(); showToast(p.online? `${p.name} is online` : `${p.name} is offline`); }
  }

  function panToPartner(id){ const p = (window.deliveryPartners||[]).find(x=> (x._id||x.id)===id); if(!p) return; if(window._logisticsMap && p.loc){ window._logisticsMap.setView([p.loc.lat||p.loc?.lat||6.5244, p.loc.lng||p.loc?.lng||3.3792], 13); if(!window._logisticsMarker) window._logisticsMarker = L.marker([p.loc.lat,p.loc.lng]).addTo(window._logisticsMap); else window._logisticsMarker.setLatLng([p.loc.lat,p.loc.lng]); showToast(`Centered to ${p.name}`); } }

<<<<<<< HEAD
            return `
                <div class="bg-white rounded-xl p-4 border-l-4 ${statusClass.split(' ').pop()} shadow-sm hover:shadow-md transition mb-3">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                        <div>
                            <p class="font-bold text-slate-800 text-sm">${order.order_id}</p>
                            <p class="text-[11px] text-slate-400 font-medium">${orderDate}</p>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${statusClass}">
                            ${order.order_status}
                        </span>
                    </div>
                    <div class="mb-3 text-xs text-slate-600">
                        <p class="font-medium text-slate-700 mb-1">${itemNames}</p>
                        <p class="text-slate-400 font-medium">Method: ${order.delivery_method || 'Standard'} • Total: <span class="font-bold text-rose-500">$${displayTotal}</span></p>
                    </div>
                    <div class="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          ${order.tracking_number 
                              ? `<p class="text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">Track: ${order.tracking_number}</p>` 
                              : `<p class="text-[10px] text-amber-500 font-medium flex items-center gap-1">🕒 Awaiting logistics node routing...</p>`
                          }
                        </div>
                        <button onclick="viewOrderLogistics('${order.order_id}')" class="inline-flex items-center justify-center rounded-xl bg-slate-900 text-white text-xs font-bold px-3 py-2 hover:bg-black transition">
                          View Order Logistic Hub
                        </button>
                    </div>
                </div>`;
        }).join('');
    }

    function setAppreciationMessage(order) {
        const msgEl = document.getElementById('order-appreciation-message');
        if (!msgEl || !order) return;
        const buyerName = order.buyer_name || order.buyer || ((window.currentUser && window.currentUser.name) || 'Valued customer');
        msgEl.textContent = `Thank you ${buyerName}! Your order ${order.order_id} is confirmed and is now being routed through our logistics hub.`;
        msgEl.classList.remove('hidden');
    }

    function updateLogisticsHubPanel(order) {
        if (!order) return;
        const statusText = order.order_status || 'Pending Logistics';
        const statusEl = document.getElementById('logisticsStatus');
        if (statusEl) statusEl.textContent = `Order ${order.order_id} • ${statusText}`;

        const nextStop = document.getElementById('gpsNextStop');
        const distance = document.getElementById('gpsDistance');
        const eta = document.getElementById('gpsEta');
        if (nextStop) {
            nextStop.textContent = statusText === 'Delivered'
                ? 'Delivered to recipient'
                : statusText === 'In Transit'
                    ? 'En route to delivery address'
                    : statusText === 'Pending Logistics'
                        ? 'Awaiting pickup from dispatch hub'
                        : 'Preparing shipment for dispatch';
        }
        if (distance) distance.textContent = statusText === 'In Transit' ? `${Math.floor(Math.random() * 10) + 3} km` : '— km';
        if (eta) eta.textContent = statusText === 'Delivered' ? 'Delivered' : statusText === 'In Transit' ? `${Math.max(5, Math.floor(Math.random() * 35) + 10)} mins` : 'Waiting';

        const partnerCount = document.getElementById('availablePartnersCount');
        const readyCount = document.getElementById('readyPickupCount');
        if (partnerCount) partnerCount.textContent = statusText === 'In Transit' ? '01' : '05';
        if (readyCount) readyCount.textContent = statusText === 'Pending Logistics' ? '01' : '00';

        const list = document.getElementById('logisticsPartnersList');
        if (list) {
            list.innerHTML = `
              <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <p class="text-xs uppercase tracking-wide text-slate-400 mb-2">Order Reference</p>
                <p class="font-bold text-slate-900 mb-1">${order.order_id}</p>
                <p class="text-[11px] text-slate-500">Tracking: ${order.tracking_number || 'Not assigned'}</p>
                <p class="text-[11px] text-slate-500 mt-2">${order.delivery_method || 'Standard delivery'} • ${statusText}</p>
              </div>`;
        }

        if (statusText === 'In Transit' && typeof simulateLogistics === 'function') simulateLogistics(order.order_id);
    }

    function trackOrderInLogistics() {
        const input = document.getElementById('logisticsTrackOrderId');
        if (!input) return;
        const query = input.value.trim();
        if (!query) {
            showToast('Enter order number or tracking code');
            return;
        }
        const order = (window.allOrders || []).find(o => o.order_id === query || o.tracking_number === query);
        if (!order) {
            showToast('Could not find that order.');
            return;
        }
        viewOrderLogistics(order.order_id);
    }

    function viewOrderLogistics(orderId) {
        const order = (window.allOrders || []).find(o => o.order_id === orderId);
        if (!order) {
            showToast('Order not found.');
            return;
        }
        if (typeof goTo === 'function') goTo('logistics');
        setTimeout(() => {
            const input = document.getElementById('logisticsTrackOrderId');
            if (input) input.value = order.tracking_number || order.order_id;
            updateLogisticsHubPanel(order);
        }, 80);
    }

    /**
     * Renders Multi-Tenant Escrow Views (Sellers vs. Courier Providers)
     */
    function renderLogisticsView() {
        const ordersArray = window.allOrders || [];
        const activeUser = window.currentUser || { name: '' };

        // --- PART 1: SELLER PERSPECTIVE CORE ---
        const sellerOrders = ordersArray.filter(o => Array.isArray(o.items) && o.items.some(i => i.seller === activeUser.name));
        const pendingPickups = sellerOrders.filter(o => o.order_status === 'Pending Logistics');
        const completedSells = sellerOrders.filter(o => o.order_status === 'Delivered');

        // Derived Accounting Logic rather than random numbers
        const calculatedSellerBalance = completedSells.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        updateTextContent('seller-balance', `$${calculatedSellerBalance.toFixed(2)}`);
        updateTextContent('pending-shipments', pendingPickups.length);
        updateTextContent('completed-seller-orders', completedSells.length);

        const sellerContainer = document.getElementById('seller-pending-orders');
        if (sellerContainer) {
            if (!pendingPickups.length) {
                sellerContainer.innerHTML = `<p class="text-slate-400 text-center text-xs py-6">No merchant packages awaiting dispatch.</p>`;
            } else {
                sellerContainer.innerHTML = pendingPickups.map(order => `
                    <div class="bg-white rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col justify-between gap-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-bold text-xs text-slate-800">${order.order_id}</p>
                                <p class="text-[10px] text-slate-400 font-medium">To: ${order.buyer_name || 'Verified Buyer'}</p>
                            </div>
                            <button onclick="ELS_Engine.requestLogisticsPickup('${order.order_id}')" class="px-2.5 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition">
                                Book Pickup
                            </button>
                        </div>
                        <p class="text-[10px] font-medium text-slate-500">${order.delivery_method || 'Standard'} • $${(order.total_amount || 0).toFixed(2)}</p>
                    </div>`).join('');
            }
        }

        // --- PART 2: COURIER OPERATIONS PERSPECTIVE ---
        const genericAvailableOrders = ordersArray.filter(o => o.order_status === 'Pending Logistics');
        const courierActiveDeliveries = ordersArray.filter(o => o.order_status === 'In Transit' && o.logistics_provider === activeUser.name);
        const courierCompletedDeliveries = ordersArray.filter(o => o.order_status === 'Delivered' && o.logistics_provider === activeUser.name);

        const calculationLogisticsBalance = courierCompletedDeliveries.reduce((sum, o) => sum + (o.logistics_fee || 0), 0);
        updateTextContent('logistics-balance', `$${calculationLogisticsBalance.toFixed(2)}`);
        updateTextContent('active-shipments', courierActiveDeliveries.length);
        updateTextContent('completed-deliveries', courierCompletedDeliveries.length);

        // Render Available Shipments Pool
        const availableContainer = document.getElementById('available-shipments');
        if (availableContainer) {
            if (!genericAvailableOrders.length) {
                availableContainer.innerHTML = `<p class="text-slate-400 text-center text-xs py-6">All logistics dispatch lanes currently clear.</p>`;
            } else {
                availableContainer.innerHTML = genericAvailableOrders.map(order => `
                    <div class="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3 flex flex-col justify-between gap-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-bold text-xs text-slate-800">${order.order_id}</p>
                                <p class="text-[10px] text-slate-500">${order.buyer_name || 'Client'} → ${order.delivery_method || 'Hub Delivery'}</p>
                            </div>
                            <button onclick="ELS_Engine.acceptShipment('${order.order_id}')" class="px-2.5 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 shadow-sm transition">
                                Accept Route
                            </button>
                        </div>
                        <p class="text-[10px] font-bold text-emerald-600">Logistics Earning: $${(order.logistics_fee || 0).toFixed(2)}</p>
                    </div>`).join('');
            }
        }

        // Render Active Shipments Process Pipeline
        const deliveriesContainer = document.getElementById('active-deliveries');
        if (deliveriesContainer) {
            if (!courierActiveDeliveries.length) {
                deliveriesContainer.innerHTML = `<p class="text-slate-400 text-center text-xs py-6">No transit manifests assigned to your vehicle node.</p>`;
            } else {
                deliveriesContainer.innerHTML = courierActiveDeliveries.map(order => `
                    <div class="bg-indigo-50/40 border border-indigo-200 rounded-xl p-3 flex flex-col justify-between gap-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-bold text-xs text-slate-800">${order.order_id}</p>
                                <p class="text-[10px] font-mono text-indigo-500 font-semibold">${order.tracking_number || 'TRK-GEN'}</p>
                            </div>
                            <button onclick="ELS_Engine.completeDelivery('${order.order_id}')" class="px-2.5 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition">
                                Deliver Package
                            </button>
                        </div>
                        <p class="text-[10px] text-slate-500 font-medium">Recipient Target: ${order.buyer_name || 'Client'} via ${order.delivery_method || 'Priority'}</p>
                    </div>`).join('');
            }
        }
    }

    /**
     * Toggles Interface Scoping Controls Between Merchant Accounts and Dispatch Networks
     */
    function toggleLogisticsRole() {
        isLogisticsProviderMode = !isLogisticsProviderMode;
        
        const sellerViewNode = document.getElementById('seller-logistics-view');
        const providerViewNode = document.getElementById('logistics-provider-view');
        const toggleButton = document.getElementById('logistics-role-btn');

        if (sellerViewNode) sellerViewNode.classList.toggle('hidden', isLogisticsProviderMode);
        if (providerViewNode) providerViewNode.classList.toggle('hidden', !isLogisticsProviderMode);
        
        if (toggleButton) {
            toggleButton.textContent = isLogisticsProviderMode ? 'Switch to Merchant Desk' : 'Switch to Courier Terminal';
        }
        renderLogisticsView();
    }

    /**
     * Triggers Dispatch Route Allocations
     */
    function requestLogisticsPickup(orderId) {
        const targetOrder = (window.allOrders || []).find(o => o.order_id === orderId);
        if (targetOrder) {
            targetOrder.order_status = 'Awaiting Pickup';
            if (typeof window.showToast === 'function') window.showToast('✓ Shipment routing initialized via ELS Escrow Engine.');
            renderLogisticsView();
        }
    }

    /**
     * Locks Transit Contracts to a Delivery Operator
     */
    function acceptShipment(orderId) {
        const targetOrder = (window.allOrders || []).find(o => o.order_id === orderId);
        const activeUser = window.currentUser || { name: 'ELS Courier Node' };

        if (targetOrder) {
            targetOrder.order_status = 'In Transit';
            targetOrder.logistics_provider = activeUser.name;
            targetOrder.tracking_number = `ELS-TRK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
            targetOrder.estimated_delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString();

            if (typeof window.showToast === 'function') {
                window.showToast(`✓ manifest secured. Escrow lock fee active: $${(targetOrder.logistics_fee || 0).toFixed(2)}`);
            }

            // Sync structural arrays downstream safely
            renderLogisticsView();
            renderOrders();

            // Safe dynamic notification thread orchestration channel creation
            try {
                if (window.conversations) {
                    const trackingChannelId = `order-${orderId}`;
                    let channelsObj = window.conversations.find(c => c.id === trackingChannelId);
                    if (!channelsObj) {
                        channelsObj = {
                            id: trackingChannelId,
                            title: `Order Manifest ${orderId}`,
                            orderId: orderId,
                            participants: [targetOrder.buyer_name, activeUser.name],
                            messages: []
                        };
                        window.conversations.push(channelsObj);
                    }
                    channelsObj.messages.push({
                        sender: activeUser.name,
                        text: `Automated System Alert: Manifest secured. Courier transit initiated. Tracking sequence: ${targetOrder.tracking_number}. Expected handover window within 72 hours.`,
                        time: new Date().toISOString()
                    });
                }
            } catch (err) {
                console.warn('Escrow communications pipeline allocation skipped:', err);
            }
        }
    }

    /**
     * Executes Final Escrow Release Clearances Upon Delivery Handover Confirmation
     */
    function completeDelivery(orderId) {
        const targetOrder = (window.allOrders || []).find(o => o.order_id === orderId);
        if (targetOrder) {
            targetOrder.order_status = 'Delivered';
            if (typeof window.showToast === 'function') {
                window.showToast(`✓ Secure handover completed. Escrow payouts released to merchant asset values.`);
            }
            renderLogisticsView();
            renderOrders();
        }
    }

    /**
     * Clean Account Setup Input Visibility Toggler
     */
    function togglePasswordVisibility(fieldId, executionButton) {
        const passwordInputField = document.getElementById(fieldId);
        if (!passwordInputField) return;

        const isCurrentlyHidden = passwordInputField.type === 'password';
        passwordInputField.type = isCurrentlyHidden ? 'text' : 'password';
        
        if (executionButton) {
            executionButton.setAttribute('aria-pressed', isCurrentlyHidden ? 'true' : 'false');
        }
        
        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        } catch (_) {}
    }

    /**
     * Mathematical Total Aggregators
     */
    function calculateTotals(cartArray) {
        const normalizedCart = Array.isArray(cartArray) ? cartArray : [];
        const subtotal = normalizedCart.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);
        const shipping = subtotal > 0 ? CORE_THEME.fallbackShippingFee : 0;
        const tax = (subtotal + shipping) * CORE_THEME.taxMultiplier;
        const total = parseFloat((subtotal + shipping + tax).toFixed(2));

        return { subtotal, shipping, tax, total };
    }

    /**
     * Controls Open Checkout Multi-option Payment Routing Elements Overlay Frames
     */
    function openPaymentChooser() {
        const activeAppInstance = window.els2App || {};
        const activeCartItems = activeAppInstance._cart || [];
        const checkoutTotals = calculateTotals(activeCartItems);

        const modalContainer = document.getElementById('qrModal');
        if (!modalContainer) return;

        const modalAmountLabel = document.getElementById('qrModalAmount');
        if (modalAmountLabel) modalAmountLabel.textContent = `$${checkoutTotals.total.toFixed(2)}`;

        let optionsWrapper = modalContainer.querySelector('.qr-modal-instructions');
        if (optionsWrapper && !optionsWrapper.querySelector('.payment-options-group')) {
            const dynamicButtonsBox = document.createElement('div');
            dynamicButtonsBox.className = "payment-options-group flex flex-wrap gap-2 justify-center mt-4";
            dynamicButtonsBox.innerHTML = `
                <button class="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-rose-600 transition" id="pay-qr-trigger">Scan QR Engine</button>
                <button class="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-900 transition" id="pay-card-trigger">Card Processing</button>
                <button class="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-200 transition" id="pay-split-trigger">Split Escrow Balance</button>
            `;
            optionsWrapper.appendChild(dynamicButtonsBox);
        }

        modalContainer.classList.add('active');

        // Clean Intercept Click Handling Attachments Loop
        setTimeout(() => {
            const qrBtn = document.getElementById('pay-qr-trigger');
            const cardBtn = document.getElementById('pay-card-trigger');
            const splitBtn = document.getElementById('pay-split-trigger');

            if (qrBtn) qrBtn.onclick = () => { if (activeAppInstance.openQRModal) activeAppInstance.openQRModal(); };
            if (cardBtn) cardBtn.onclick = () => { alert('Secure payment simulated successfully.'); if (activeAppInstance.completeOrder) activeAppInstance.completeOrder(); };
            if (splitBtn) splitBtn.onclick = () => { alert('Multi-tenant balance split transaction pipeline configured.'); if (activeAppInstance.completeOrder) activeAppInstance.completeOrder(); };
        }, 150);
    }

    /**
     * Smooth Spatial Timeline Interface Step Advancer Simulation
     */
    function simulateLogistics(orderId) {
        const trackingMilestoneSteps = ['step-Pending', 'step-Paid', 'step-Processing', 'step-Shipped', 'step-Delivered'];
        let currentStepIndex = 0;

        function advancePipelineStep() {
            if (currentStepIndex > 0) {
                const completedNode = document.getElementById(trackingMilestoneSteps[currentStepIndex - 1]);
                if (completedNode) {
                    completedNode.classList.remove('current', 'border-indigo-500');
                    completedNode.classList.add('completed', 'border-emerald-500');
                }
            }

            const activeStepNode = document.getElementById(trackingMilestoneSteps[currentStepIndex]);
            if (activeStepNode) activeStepNode.classList.add('current', 'border-indigo-500');

            // Dynamic Progress Speed Vector Content Generation
            const speedIndicator = document.getElementById('tel-speed');
            const etaIndicator = document.getElementById('tel-eta');
            
            if (speedIndicator) speedIndicator.textContent = `${Math.floor(Math.random() * (55 - 40 + 1)) + 40} km/h`;
            if (etaIndicator) etaIndicator.textContent = `${Math.max(2, 30 - (currentStepIndex * 7))} mins`;

            currentStepIndex++;
            if (currentStepIndex < trackingMilestoneSteps.length) {
                setTimeout(advancePipelineStep, 4000);
            }
        }
        advancePipelineStep();
    }

    /**
     * Enhanced Verification Authentication Submission Gate Handler
     */
    function handleLoginEnhanced(event) {
        if (event) event.preventDefault();

        const emailElement = document.getElementById('login-email');
        const passwordElement = document.getElementById('login-pass');
        const regionElement = document.getElementById('login-region');

        const email = emailElement ? emailElement.value.trim() : '';
        const password = passwordElement ? passwordElement.value : '';
        const region = regionElement ? regionElement.value : 'global';

        if (!email || !password) {
            alert('Security access parameter rejection: Credentials cannot be null.');
            return;
        }

        // Initialize session parameters cleanly
        window.__ELS_USER = {
            email: email,
            region: region,
            role: (region && region.toLowerCase().includes('driver')) ? 'delivery' : 'buyer'
        };

        // UI view swap
        const authScreen = document.getElementById('auth-screen');
        const mainAppScreen = document.getElementById('main-app');
        if (authScreen) authScreen.classList.add('hidden');
        if (mainAppScreen) mainAppScreen.classList.remove('hidden');

        // Dynamic Avatar Component Initial Generation
        const avatarBox = document.getElementById('user-avatar-initial');
        if (avatarBox) avatarBox.textContent = email.charAt(0).toUpperCase();

        // Check if user is a courier driver to route them accordingly
        if (window.__ELS_USER.role === 'delivery' && typeof window.goTo === 'function') {
            window.goTo('logistics');
        }
    }

    // Module Setup Initialization
    document.addEventListener('DOMContentLoaded', () => {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', handleLoginEnhanced);
        }

        // Dynamic Injection of Region/Operational Role Configuration Node Options
        if (!document.getElementById('login-region')) {
            const selectElement = document.createElement('select');
            selectElement.id = 'login-region';
            selectElement.className = 'w-full px-4 py-2.5 mt-2 rounded-xl bg-slate-800 text-white border border-slate-700 text-xs font-semibold focus:outline-none focus:border-rose-500 transition';
            selectElement.innerHTML = `
                <option value="global">Market Area: Global Routing Network</option>
                <option value="lagos">Market Area: West Africa Hub (Lagos)</option>
                <option value="abuja">Market Area: North Central Hub (Abuja)</option>
                <option value="driver-lagos">Courier Node Role: Driver (Lagos Core)</option>
            `;
            if (loginForm) loginForm.appendChild(selectElement);
        }
    });

    // Explicit Context Namespace Binding Export
    window.ELS_Engine = {
        renderOrders,
        renderLogisticsView,
        toggleLogisticsRole,
        requestLogisticsPickup,
        acceptShipment,
        completeDelivery,
        togglePasswordVisibility,
        calculateTotals,
        openPaymentChooser,
        simulateLogistics
    };

    window.renderOrders = renderOrders;
    window.setAppreciationMessage = setAppreciationMessage;
    window.viewOrderLogistics = viewOrderLogistics;
    window.trackOrderInLogistics = trackOrderInLogistics;
    window.updateLogisticsHubPanel = updateLogisticsHubPanel;
})();
=======
  function trackOrderInLogistics(){ const q = (document.getElementById('logisticsTrackOrderId')||{}).value; if(!q){ showToast('Enter an order id'); return; } const order = (window.allOrders||[]).find(o=>o.order_id && o.order_id.toLowerCase()===q.toLowerCase()); if(order){ showToast(`Found ${order.order_id} — status: ${order.order_status}`); if(!order.loc) order.loc = { lat: 6.5244 + (Math.random()-0.5)*0.2, lng: 3.3792 + (Math.random()-0.5)*0.2 }; if(window._logisticsMap){ window._logisticsMap.panTo([order.loc.lat, order.loc.lng]); if(!window._orderMarker) window._orderMarker = L.marker([order.loc.lat, order.loc.lng], { title: order.order_id }).addTo(window._logisticsMap); else window._orderMarker.setLatLng([order.loc.lat, order.loc.lng]); } } else { showToast('Order not found — demo will simulate a location'); if(window._logisticsMap) window._logisticsMap.setView([6.5244,3.3792], 11); } }

  function startDeliveryGuide(){ if(typeof L === 'undefined'){ showToast('Map library not loaded'); return; } if(!window._logisticsMap){ window._logisticsMap = L.map('map',{ attributionControl:false }).setView([6.5244,3.3792], 12); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19 }).addTo(window._logisticsMap); window._logisticsMarker = L.marker([6.5244,3.3792]).addTo(window._logisticsMap).bindPopup('You'); }
    showToast('Live GPS streaming started'); if(window._deliveryStreamInterval) clearInterval(window._deliveryStreamInterval);
    window._deliveryStreamInterval = setInterval(()=>{ if(!window._logisticsMarker) return; const cur = window._logisticsMarker.getLatLng(); const nlat = cur.lat + (Math.random()-0.5)*0.005; const nlng = cur.lng + (Math.random()-0.5)*0.005; window._logisticsMarker.setLatLng([nlat,nlng]); window._logisticsMap.panTo([nlat,nlng]); const speed = Math.floor(20 + Math.random()*60); const eta = Math.max(3, Math.floor(30 - Math.random()*20)); document.getElementById('tel-speed') && (document.getElementById('tel-speed').textContent = speed + ' km/h'); document.getElementById('tel-eta') && (document.getElementById('tel-eta').textContent = eta + ' mins'); document.getElementById('gpsDistance') && (document.getElementById('gpsDistance').textContent = (Math.random()*12).toFixed(1) + ' km'); document.getElementById('gpsNextStop') && (document.getElementById('gpsNextStop').textContent = 'Waypoint ' + Math.floor(Math.random()*10+1)); }, 2500);
    await renderPartnersList(); }

  // attempt initial partners list load
  document.addEventListener('DOMContentLoaded', ()=>{ try{ renderPartnersList(); }catch(e){} });
>>>>>>> zohan-work
