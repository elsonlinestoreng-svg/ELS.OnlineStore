(function() {
  const API = window.API_BASE || 'http://localhost:8001/api';

  async function authFetch(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    const token = localStorage.getItem('els_token');
    if (token) opts.headers.Authorization = 'Bearer ' + token;
    const res = await fetch(url, opts);
    const text = await res.text();
    try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
    catch (e) { return { ok: res.ok, status: res.status, data: text }; }
  }

  function statusColor(s) {
    s = (s || '').toLowerCase();
    if (s === 'delivered' || s === 'paid') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (s === 'shipped' || s === 'processing') return 'text-indigo-600 bg-indigo-50 border-indigo-200';
    if (s === 'confirmed') return 'text-blue-600 bg-blue-50 border-blue-200';
    if (s === 'cancelled' || s === 'failed') return 'text-red-600 bg-red-50 border-red-200';
    return 'text-amber-600 bg-amber-50 border-amber-200';
  }

  async function loadBuyerOrders() {
    const container = document.getElementById('orders-list');
    const token = localStorage.getItem('els_token');

    if (!token) {
      container.innerHTML = '<p class="text-center text-gray-400 py-16">Please login to view your orders.</p>';
      return;
    }

    try {
      const r = await authFetch(API + '/orders/buyer');

      if (!r.ok || !r.data.success) {
        container.innerHTML = '<p class="text-center text-gray-400 py-16">Failed to load orders.</p>';
        return;
      }

      const orders = r.data.orders || [];

      document.getElementById('total-orders').textContent = orders.length;
      document.getElementById('in-transit-count').textContent = orders.filter(o => (o.order_status || '').toLowerCase() === 'shipped' || (o.order_status || '').toLowerCase() === 'processing').length;
      document.getElementById('delivered-count').textContent = orders.filter(o => (o.order_status || '').toLowerCase() === 'delivered').length;

      if (!orders.length) {
        container.innerHTML = '<div class="text-center py-16 max-w-sm mx-auto">' +
          '<div class="inline-flex p-4 rounded-full bg-slate-50 border border-slate-100 text-slate-400 mb-4 shadow-inner">' +
          '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-8 h-8">' +
          '<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1,0-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />' +
          '</svg></div>' +
          '<p class="text-slate-800 font-bold text-lg tracking-tight">No active orders found</p>' +
          '<p class="text-slate-400 text-sm mt-1 mb-6">You haven\'t placed any orders yet.</p>' +
          '<button onclick="goTo(\'shop\')" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/10 text-xs">Start Shopping</button>' +
          '</div>';
        return;
      }

      container.innerHTML = orders.map(o => {
        const items = (o.items || []).map(i => escHtml(i.name) + ' x' + i.quantity).join(', ');
        const storeName = (o.store_id && o.store_id.store_name) || 'Store';
        const status = o.order_status || 'pending';
        const date = new Date(o.created_at || Date.now()).toLocaleDateString();
        const color = statusColor(status);
        return '<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition">' +
          '<div class="flex-1 min-w-0">' +
          '<div class="flex items-center gap-2 mb-1">' +
          '<span class="text-xs font-semibold text-slate-400 uppercase">' + escHtml(o.order_reference || o._id) + '</span>' +
          '<span class="text-xs text-slate-300">|</span>' +
          '<span class="text-xs text-slate-400">' + date + '</span>' +
          '</div>' +
          '<p class="font-semibold text-slate-900 text-sm truncate">' + escHtml(items) + '</p>' +
          '<p class="text-xs text-slate-500 mt-0.5">from <span class="font-medium text-slate-700">' + escHtml(storeName) + '</span></p>' +
          '</div>' +
          '<div class="flex items-center gap-3 flex-shrink-0">' +
          '<span class="text-sm font-bold text-slate-800">$' + Number(o.total || 0).toFixed(2) + '</span>' +
          '<span class="inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ' + color + '">' + escHtml(status) + '</span>' +
          '</div>' +
          '</div>';
      }).join('');
    } catch (err) {
      console.error('Load orders error:', err);
      document.getElementById('orders-list').innerHTML = '<p class="text-center text-gray-400 py-16">Failed to load orders. <button onclick="loadBuyerOrders()" class="underline" style="color:#e94560;">Retry</button></p>';
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('page-orders')) {
      loadBuyerOrders();
    }
  });

  window.loadBuyerOrders = loadBuyerOrders;
})();
