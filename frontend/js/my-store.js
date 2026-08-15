// my-store.js — Seller dashboard interactions: products, orders, earnings
(function(){
  const API = window.API_BASE || 'http://localhost:8001/api';
  function qs(sel, ctx=document){ return ctx.querySelector(sel); }
  function qsa(sel, ctx=document){ return Array.from((ctx||document).querySelectorAll(sel)); }

  async function authFetch(url, opts={}){
    opts.headers = opts.headers || {};
    const token = localStorage.getItem('els_token');
    if(token) opts.headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, opts);
    const text = await res.text();
    try{ return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
    catch(e){ return { ok: res.ok, status: res.status, data: text }; }
  }

  function showLoader(show){ const d = document.getElementById('dash-loader'); if(!d) return; d.classList.toggle('hidden', !show); }

  // TAB NAV
  function bindTabs(){ const tabs = qsa('.dash-tabs-nav li'); tabs.forEach(li=>{ li.addEventListener('click', ()=>{ tabs.forEach(x=>x.classList.remove('active')); li.classList.add('active'); const tab = li.dataset.tab; document.querySelectorAll('.dash-tab-content').forEach(c=>c.classList.add('hidden')); const el = document.getElementById('tab-'+tab); if(el) el.classList.remove('hidden'); // load data for tab
      if(tab==='products') loadSellerProducts(); if(tab==='orders') loadSellerOrders(); if(tab==='earnings') loadSellerEarningsFromApi(); }); }); }

  // PRODUCTS
  async function loadSellerProducts(){ showLoader(true); try{ const container = document.getElementById('seller-products-list'); if(!container) return; container.innerHTML = '';
      // if localSdk available, use it
      let products = [];
      try{
        if(window.localSdk && window.localSdk.products){ const u = JSON.parse(localStorage.getItem('els_user')||'null'); const userEmail = u && u.email ? u.email : (u && u.name ? u.name : ''); products = await window.localSdk.products.sellerMine(userEmail); }
        else {
          const r = await authFetch(`${API}/products/seller/mine`);
          if(!r.ok){ console.error('failed load products', r); container.innerHTML = '<p class="muted">Failed to load products</p>'; return; }
          products = r.data || [];
        }
      }catch(e){ console.error('loadSellerProducts fetch error', e); container.innerHTML = '<p class="muted">Failed to load products</p>'; return; }

      products.forEach(p=>{ const card = document.createElement('div'); card.className='product-card-mini'; card.innerHTML = `<div><strong>${escapeHtml(p.name)}</strong><div class="muted">$${(p.price||0).toFixed(2)}</div></div><div class="actions"><button class="btn-sm edit" data-id="${p._id}">Edit</button><button class="btn-sm del" data-id="${p._id}">Delete</button></div>`; container.appendChild(card); });
      // bind actions
      qsa('#seller-products-list .del').forEach(b=>b.addEventListener('click', async (e)=>{ if(!confirm('Delete this product?')) return; const id=b.dataset.id; try{ if(window.localSdk && window.localSdk.products){ await window.localSdk.products.delete(id); showToast('Product deleted'); loadSellerProducts(); return; } const res = await authFetch(`${API}/products/${id}`, { method:'DELETE' }); if(!res.ok) return alert('Delete failed'); showToast('Product deleted'); loadSellerProducts(); }catch(err){ console.error(err); alert('Delete failed'); } }));
      qsa('#seller-products-list .edit').forEach(b=>b.addEventListener('click', (e)=>{ const id=b.dataset.id; const prod = products.find(x=>x._id===id) || {}; openEditInline(id, prod); }));
    }catch(err){ console.error(err); } finally{ showLoader(false); } }

  // ORDERS
  async function loadSellerOrders(){ showLoader(true); try{ const tbody = document.getElementById('seller-orders-list'); if(!tbody) return; tbody.innerHTML = ''; let orders = [];
      try{
        if(window.localSdk && window.localSdk.orders){ const u = JSON.parse(localStorage.getItem('els_user')||'null'); const userEmail = u && u.email ? u.email : (u && u.name ? u.name : ''); orders = await window.localSdk.orders.listForSeller(userEmail); }
        else {
          const r = await authFetch(`${API}/orders/seller`);
          if(!r.ok){ console.error('failed load orders', r); tbody.innerHTML = '<tr><td colspan="6">Failed to load orders</td></tr>'; return; }
          orders = Array.isArray(r.data) ? r.data : (r.data.orders || []);
        }
      }catch(e){ console.error('loadSellerOrders error', e); tbody.innerHTML = '<tr><td colspan="6">Failed to load orders</td></tr>'; return; }

      orders.forEach(o=>{ const items = (o.items||[]).map(it=>`${escapeHtml(it.name)} x${it.quantity}`).join('<br>'); const tr = document.createElement('tr'); tr.innerHTML = `<td>${escapeHtml(o.order_reference||o._id)}</td><td>${escapeHtml((o.buyer_id&&o.buyer_id.name)||o.buyer_name||'Buyer')}</td><td>${items}</td><td>${formatCurrency(o.seller_payout||o.total||0)}</td><td>${escapeHtml(o.order_status||o.payment_status||'')}</td><td><select class="order-status" data-id="${o._id}"><option value="pending">pending</option><option value="confirmed">confirmed</option><option value="processing">processing</option><option value="shipped">shipped</option><option value="delivered">delivered</option></select><input class="trk" data-id="${o._id}" placeholder="tracking number" style="margin-left:6px;width:120px"/><button class="btn-sm upd" data-id="${o._id}">Save</button></td>`; tbody.appendChild(tr); });
      // bind update
      qsa('#seller-orders-list .upd').forEach(btn=>btn.addEventListener('click', async ()=>{ const id=btn.dataset.id; const sel = document.querySelector(`.order-status[data-id="${id}"]`); const trk = document.querySelector(`.trk[data-id="${id}"]`); const status = sel? sel.value : ''; const tracking_number = trk? trk.value : ''; try{
        if(window.localSdk && window.localSdk.orders){ // update local storage orders
          const key = window.localSdk._lsKeys && window.localSdk._lsKeys.orders ? window.localSdk._lsKeys.orders : 'local_orders_v1'; const list = JSON.parse(localStorage.getItem(key)||'[]'); const idx = list.findIndex(x=> (x._id||x.order_reference)==id); if(idx!==-1){ list[idx].order_status = status; if(tracking_number) list[idx].tracking_number = tracking_number; localStorage.setItem(key, JSON.stringify(list)); showToast('Order updated'); loadSellerOrders(); return; }
        }
        const res = await authFetch(`${API}/orders/${id}/status`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status, tracking_number }) }); if(!res.ok){ alert(res.data && res.data.message || 'Update failed'); } else { showToast('Order updated'); loadSellerOrders(); }
      }catch(err){ console.error(err); alert('Update failed'); } }));
    }catch(err){ console.error(err); } finally{ showLoader(false); } }

  // EARNINGS
  async function loadSellerEarnings(){ showLoader(true); try{ const u = JSON.parse(localStorage.getItem('els_user')||'null'); const userEmail = u && u.email ? u.email : (u && u.name ? u.name : ''); let orders = [];
      try{
        if(window.localSdk && window.localSdk.orders){ orders = await window.localSdk.orders.listForSeller(userEmail); }
        else { const r = await authFetch(`${API}/orders/seller`); if(!r.ok){ console.error('failed load orders for earnings', r); return; } orders = r.data.orders || r.data || []; }
      }catch(e){ console.error('loadSellerEarnings error', e); }

      const paid = orders.filter(o=> (o.payment_status==='paid' || o.order_status==='delivered' || o.payment_status==='paid') );
      const total = paid.reduce((s,o)=>s + (o.seller_payout||o.seller_payout_amount||o.total||0),0);
      const monthly = paid.filter(o=> new Date(o.created_at||o.createdAt||Date.now()) > (new Date(Date.now() - 1000*60*60*24*30))).reduce((s,o)=>s + (o.seller_payout||o.seller_payout_amount||o.total||0),0);
      const pending = orders.filter(o=> (o.payment_status!=='paid' && o.order_status!=='delivered')).reduce((s,o)=>s + (o.seller_payout||o.seller_payout_amount||o.total||0),0);

      document.getElementById('earn-total').textContent = formatCurrency(total);
      document.getElementById('earn-monthly').textContent = formatCurrency(monthly);
      document.getElementById('earn-pending').textContent = formatCurrency(pending);
      const history = document.getElementById('seller-payouts-history'); if(history){ if(Array.isArray(orders) && orders.length){ history.innerHTML = orders.slice(0,10).map(p=>`<div class="payout-row"><strong>${escapeHtml(p.order_reference||p._id||'tx')}</strong> — ${formatCurrency(p.seller_payout||p.total||0)} <span class="muted">(${new Date(p.created_at||p.createdAt||Date.now()).toLocaleString()})</span></div>`).join(''); } else { history.innerHTML = '<p class="muted">No payouts yet.</p>'; } }
    }catch(err){ console.error(err); } finally{ showLoader(false); } }

    // Try earnings endpoint which aggregates on server; fallback to orders aggregation above
    async function loadSellerEarningsFromApi(){ showLoader(true); try{
        const r = await authFetch(`${API}/earnings/seller`);
        if(!r.ok){ console.warn('earnings endpoint unavailable, using orders fallback'); return loadSellerEarnings(); }
        const data = r.data || {};
        document.getElementById('earn-total').textContent = formatCurrency(data.total || 0);
        document.getElementById('earn-monthly').textContent = formatCurrency(data.monthly || 0);
        document.getElementById('earn-pending').textContent = formatCurrency(data.pending || 0);
        const history = document.getElementById('seller-payouts-history'); if(history){ if(Array.isArray(data.payouts) && data.payouts.length){ history.innerHTML = data.payouts.map(p=>`<div class="payout-row"><strong>${escapeHtml(p.parent_transaction_id||'tx')}</strong> — ${formatCurrency(p.payout||p.amount||0)} <span class="muted">(${new Date(p.created_at||Date.now()).toLocaleString()})</span></div>`).join(''); } else { history.innerHTML = '<p class="muted">No payouts yet.</p>'; } }
      }catch(err){ console.error('loadSellerEarningsFromApi error', err); loadSellerEarnings(); } finally{ showLoader(false); } }

  // UTIL
  function formatCurrency(v){ if(!v && v!==0) return '₦0.00'; return '₦'+Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}); }
  function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Inline edit flow: simple prompt-based editor, sends PUT to backend
  async function openEditInline(id, prod){
    try{
      const name = prompt('Product name', prod.name || ''); if(name===null) return;
      const priceStr = prompt('Price (number)', (prod.price||0).toString()); if(priceStr===null) return;
      const price = parseFloat(priceStr) || 0;
      const desc = prompt('Short description', prod.description || '') || '';
      const payload = { name: name.trim(), price, description: desc };
      if(window.localSdk && window.localSdk.products){ const result = await window.localSdk.products.update(id, payload); if(!result || !result.isOk){ return alert('Update failed (local)'); } showToast('Product updated'); loadSellerProducts(); return; }
      const res = await authFetch(`${API}/products/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if(!res.ok) return alert('Update failed: ' + (res.data && res.data.message || res.status));
      showToast('Product updated'); loadSellerProducts();
    }catch(err){ console.error('edit failed', err); alert('Failed to update product'); }
  }

  // expose loaderable entry
  window.MyStore = { init: function(){ bindTabs(); loadSellerProducts(); } };

  document.addEventListener('DOMContentLoaded', ()=>{ try{ if(document.getElementById('page-my-store')) window.MyStore.init(); }catch(e){ console.error(e); } });

})();
