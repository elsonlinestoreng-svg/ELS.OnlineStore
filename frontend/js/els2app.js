/* js/els2app.js - merged els2 features: product/cart, payment, QR, logistics, login enhancements */
(function(){
  if(!window.els2App){
    window.els2App = (function(){
      const config = { shipping_cost:9.99, payment_upi_id: 'merchant@upi', tax_rate:8 };
      const products = [
        { id:1, name:'Premium Wireless Headphones', price:149.99, emoji:'🎧' },
        { id:2, name:'Smart Watch Pro', price:299.99, emoji:'⌚' },
        { id:3, name:'Portable SSD 1TB', price:129.99, emoji:'💾' }
      ];
      let cart = [];

      function getCart(){ return cart; }
      function renderProducts(){
        const grid = document.getElementById('productsGrid') || document.querySelector('.product-grid');
        if(!grid) return;
        grid.innerHTML = products.map(p=>`<div class="product-card" data-id="${p.id}"><div class="product-image">${p.emoji}</div><div class="product-info"><div class="product-name">${p.name}</div><div class="product-price">$${p.price.toFixed(2)}</div><button class="add-to-cart-btn" data-id="${p.id}">Add to Cart</button></div></div>`).join('');
      }
      function addToCart(id){ const p = products.find(x=>x.id===id); if(!p) return; const ex = cart.find(i=>i.id===id); if(ex) ex.quantity++; else cart.push({...p,quantity:1}); updateCart(); showPage('page-cart'); }
      function updateCart(){
        const container = document.getElementById('cartContainer')||document.getElementById('cart-items');
        if(!container) return;
        if(cart.length===0){ container.innerHTML = '<div class="empty-cart">🛒 Your cart is empty</div>'; return; }
        container.innerHTML = cart.map((item,idx)=>`<div class="cart-item"><span>${item.name} x${item.quantity}</span><span>$${(item.price*item.quantity).toFixed(2)}</span><button onclick="els2App.removeFromCart(${idx})">Remove</button></div>`).join('');
      }
      function removeFromCart(idx){ cart.splice(idx,1); updateCart(); }
      function showPage(pageId){
        document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
        const target = document.getElementById(pageId);
        if(target) target.classList.remove('hidden');
      }

      return { getCart, renderProducts, addToCart, updateCart, removeFromCart, showPage };
    })();
  }
})();
