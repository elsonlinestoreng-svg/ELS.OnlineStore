/**
 * Enhanced Seller Dashboard Service
 * Phase 3.4 Implementation - Seller Dashboard
 * Integrates with API client for products, orders, earnings
 */

class SellerDashboard {
  constructor() {
    this.currentTab = 'products';
    this.productsData = [];
    this.ordersData = [];
    this.earningsData = {};
    this.isLoading = false;
  }

  /**
   * Initialize dashboard
   */
  async init() {
    this.bindTabNavigation();
    await this.loadProductsTab();
    console.log('✓ Seller dashboard initialized');
  }

  /**
   * Bind tab navigation
   */
  bindTabNavigation() {
    const tabButtons = document.querySelectorAll('.dash-tabs-nav li, .seller-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = btn.dataset.tab || btn.getAttribute('data-tab');
        if (!tabName) return;

        // Update active state
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Hide all tabs
        document.querySelectorAll('.dash-tab-content, .seller-tab-content').forEach(tab => {
          tab.classList.add('hidden');
        });

        // Show selected tab
        const tabEl = document.getElementById(`tab-${tabName}`) || document.getElementById(`seller-tab-${tabName}`);
        if (tabEl) {
          tabEl.classList.remove('hidden');
        }

        // Load tab data
        this.loadTabData(tabName);
      });
    });
  }

  /**
   * Load data for specific tab
   */
  async loadTabData(tabName) {
    switch (tabName) {
      case 'products':
        await this.loadProductsTab();
        break;
      case 'orders':
        await this.loadOrdersTab();
        break;
      case 'earnings':
        await this.loadEarningsTab();
        break;
      case 'settings':
        this.loadSettingsTab();
        break;
    }
  }

  /**
   * Load Products Tab
   */
  async loadProductsTab() {
    const container = document.getElementById('seller-products-list') || document.getElementById('tab-products');
    if (!container) return;

    this.showLoading(container, true);

    try {
      // Try API client first
      try {
        if (window.api) {
          const response = await window.api.get('/products', { seller: 'me' });
          this.productsData = response.data || [];
        } else {
          throw new Error('API client not available');
        }
      } catch (apiError) {
        console.warn('API not available, using fallback');
        // Fallback: filter local products
        this.productsData = (window.allProducts || []).filter(p => 
          p.seller === (window.currentUser?.name || localStorage.getItem('els_user_name'))
        );
      }

      this.renderProductsTab(container);
    } catch (error) {
      console.error('Failed to load products:', error);
      container.innerHTML = `<div class="alert alert-error">Failed to load products. <button onclick="window.sellerDashboard.loadProductsTab()" class="underline">Retry</button></div>`;
    } finally {
      this.showLoading(container, false);
    }
  }

  /**
   * Render Products Tab UI
   */
  renderProductsTab(container) {
    if (!this.productsData || this.productsData.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="text-5xl mb-4">📦</div>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">No Products Yet</h3>
          <p class="text-slate-600 mb-6">Start selling by adding your first product</p>
          <button onclick="goTo('open-store')" class="px-6 py-2 bg-rose-500 text-white rounded-lg font-semibold hover:bg-rose-600">
            Add Product
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${this.productsData.map(p => `
          <div class="bg-white rounded-lg border border-slate-200 p-4 shadow-sm hover:shadow-md transition">
            <div class="flex items-start justify-between mb-3">
              <div>
                <h4 class="font-bold text-slate-900">${this.escapeHtml(p.name)}</h4>
                <p class="text-xs text-slate-500 mt-1">${this.escapeHtml(p.category || 'Other')}</p>
              </div>
              <span class="text-lg font-bold text-rose-600">₦${Number(p.price || 0).toLocaleString()}</span>
            </div>
            <p class="text-sm text-slate-600 mb-3 line-clamp-2">${this.escapeHtml(p.description || '')}</p>
            <div class="flex gap-2 flex-wrap">
              <button onclick="window.sellerDashboard.editProduct('${p._id || p.__backendId}')" class="px-3 py-1 bg-blue-500 text-white text-xs rounded font-semibold hover:bg-blue-600">
                Edit
              </button>
              <button onclick="window.sellerDashboard.deleteProduct('${p._id || p.__backendId}')" class="px-3 py-1 bg-red-500 text-white text-xs rounded font-semibold hover:bg-red-600">
                Delete
              </button>
              <button onclick="window.sellerDashboard.togglePublish('${p._id || p.__backendId}', ${p.public !== false})" class="px-3 py-1 ${p.public === false ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600'} text-white text-xs rounded font-semibold">
                ${p.public === false ? 'Publish' : 'Unpublish'}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Load Orders Tab
   */
  async loadOrdersTab() {
    const container = document.getElementById('seller-orders-list') || document.getElementById('tab-orders');
    if (!container) return;

    this.showLoading(container, true);

    try {
      try {
        if (window.api) {
          const response = await window.api.get('/orders/seller');
          this.ordersData = response.data || [];
        } else {
          throw new Error('API client not available');
        }
      } catch (apiError) {
        console.warn('API not available, using fallback');
        // Fallback
        this.ordersData = [];
      }

      this.renderOrdersTab(container);
    } catch (error) {
      console.error('Failed to load orders:', error);
      container.innerHTML = `<div class="alert alert-error">Failed to load orders. <button onclick="window.sellerDashboard.loadOrdersTab()" class="underline">Retry</button></div>`;
    } finally {
      this.showLoading(container, false);
    }
  }

  /**
   * Render Orders Tab UI
   */
  renderOrdersTab(container) {
    if (!this.ordersData || this.ordersData.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="text-5xl mb-4">📋</div>
          <h3 class="text-lg font-semibold text-slate-900 mb-2">No Orders Yet</h3>
          <p class="text-slate-600">Your first customer order will appear here</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead class="bg-slate-100">
            <tr>
              <th class="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Order ID</th>
              <th class="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Buyer</th>
              <th class="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Items</th>
              <th class="border border-slate-300 px-4 py-2 text-right text-sm font-semibold">Amount</th>
              <th class="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Status</th>
              <th class="border border-slate-300 px-4 py-2 text-left text-sm font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            ${this.ordersData.map(order => `
              <tr class="hover:bg-slate-50">
                <td class="border border-slate-300 px-4 py-2 text-sm font-mono">${this.escapeHtml(order.order_reference || order._id)}</td>
                <td class="border border-slate-300 px-4 py-2 text-sm">${this.escapeHtml(order.buyer_name || 'N/A')}</td>
                <td class="border border-slate-300 px-4 py-2 text-sm">${order.items?.length || 0} item(s)</td>
                <td class="border border-slate-300 px-4 py-2 text-sm text-right font-semibold text-rose-600">₦${Number(order.seller_payout || order.total || 0).toLocaleString()}</td>
                <td class="border border-slate-300 px-4 py-2 text-sm">
                  <span class="px-2 py-1 rounded text-xs font-semibold ${this.getStatusBadgeClass(order.order_status)}">
                    ${this.escapeHtml(order.order_status || 'pending')}
                  </span>
                </td>
                <td class="border border-slate-300 px-4 py-2 text-sm">
                  <button onclick="window.sellerDashboard.updateOrderStatus('${order._id}')" class="text-blue-600 hover:underline font-semibold text-xs">
                    Update
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Load Earnings Tab
   */
  async loadEarningsTab() {
    const container = document.getElementById('tab-earnings');
    if (!container) return;

    this.showLoading(container, true);

    try {
      try {
        if (window.api) {
          const response = await window.api.get('/earnings/seller');
          this.earningsData = response.data || {};
        } else {
          throw new Error('API not available');
        }
      } catch (apiError) {
        console.warn('Earnings API not available');
        this.earningsData = { total: 0, monthly: 0, pending: 0, payouts: [] };
      }

      this.renderEarningsTab(container);
    } catch (error) {
      console.error('Failed to load earnings:', error);
      container.innerHTML = `<div class="alert alert-error">Failed to load earnings</div>`;
    } finally {
      this.showLoading(container, false);
    }
  }

  /**
   * Render Earnings Tab UI
   */
  renderEarningsTab(container) {
    const data = this.earningsData || {};
    const total = Number(data.total || 0);
    const monthly = Number(data.monthly || 0);
    const pending = Number(data.pending || 0);
    const payouts = Array.isArray(data.payouts) ? data.payouts : [];

    container.innerHTML = `
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div class="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
          <p class="text-sm text-green-700 font-semibold mb-2">Total Earnings</p>
          <p class="text-3xl font-bold text-green-900">₦${total.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
        </div>
        <div class="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
          <p class="text-sm text-blue-700 font-semibold mb-2">This Month</p>
          <p class="text-3xl font-bold text-blue-900">₦${monthly.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
        </div>
        <div class="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-6 border border-amber-200">
          <p class="text-sm text-amber-700 font-semibold mb-2">Pending</p>
          <p class="text-3xl font-bold text-amber-900">₦${pending.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
        </div>
      </div>

      <!-- Payout History -->
      <div class="bg-white rounded-lg border border-slate-200 p-6">
        <h3 class="text-lg font-bold text-slate-900 mb-4">Recent Payouts</h3>
        ${payouts.length === 0 ? `
          <p class="text-center text-slate-500 py-8">No payouts yet</p>
        ` : `
          <div class="space-y-3">
            ${payouts.slice(0, 10).map(p => `
              <div class="flex justify-between items-center p-3 bg-slate-50 rounded border border-slate-200">
                <div>
                  <p class="font-semibold text-slate-900">${this.escapeHtml(p.parent_transaction_id || 'Transaction')}</p>
                  <p class="text-xs text-slate-500">${new Date(p.created_at || Date.now()).toLocaleString()}</p>
                </div>
                <p class="font-bold text-green-600">+₦${Number(p.payout || p.amount || 0).toLocaleString()}</p>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  /**
   * Load Settings Tab
   */
  loadSettingsTab() {
    const container = document.getElementById('tab-settings');
    if (!container) return;

    container.innerHTML = `
      <div class="max-w-2xl">
        <h3 class="text-xl font-bold text-slate-900 mb-6">Store Settings</h3>
        
        <!-- Store Name -->
        <div class="mb-6">
          <label class="block text-sm font-semibold text-slate-700 mb-2">Store Name</label>
          <input type="text" id="store-name-input" placeholder="Your store name" value="${this.escapeHtml(window.currentUser?.name || '')}" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500">
        </div>

        <!-- Store Description -->
        <div class="mb-6">
          <label class="block text-sm font-semibold text-slate-700 mb-2">Store Description</label>
          <textarea id="store-desc-input" placeholder="Tell customers about your store" rows="4" class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-500"></textarea>
        </div>

        <!-- Save Button -->
        <button onclick="window.sellerDashboard.saveStoreSettings()" class="px-6 py-2 bg-rose-500 text-white rounded-lg font-semibold hover:bg-rose-600">
          Save Settings
        </button>
      </div>
    `;
  }

  /**
   * Edit Product
   */
  async editProduct(productId) {
    const product = this.productsData.find(p => p._id === productId || p.__backendId === productId);
    if (!product) return;

    const name = prompt('Product name', product.name || '');
    if (name === null) return;

    const priceStr = prompt('Price', String(product.price || 0));
    if (priceStr === null) return;

    const price = parseFloat(priceStr) || 0;
    const description = prompt('Description', product.description || '');
    if (description === null) return;

    try {
      if (window.api) {
        await window.api.put(`/products/${productId}`, { name, price, description });
      }
      showToast('✓ Product updated');
      await this.loadProductsTab();
    } catch (error) {
      console.error('Update failed:', error);
      showToast('Failed to update product');
    }
  }

  /**
   * Delete Product
   */
  async deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      if (window.api) {
        await window.api.delete(`/products/${productId}`);
      }
      showToast('✓ Product deleted');
      await this.loadProductsTab();
    } catch (error) {
      console.error('Delete failed:', error);
      showToast('Failed to delete product');
    }
  }

  /**
   * Toggle Product Publish
   */
  async togglePublish(productId, currentStatus) {
    try {
      if (window.api) {
        await window.api.put(`/products/${productId}`, { public: !currentStatus });
      }
      showToast(`✓ Product ${!currentStatus ? 'published' : 'unpublished'}`);
      await this.loadProductsTab();
    } catch (error) {
      console.error('Toggle failed:', error);
      showToast('Failed to update product');
    }
  }

  /**
   * Update Order Status
   */
  async updateOrderStatus(orderId) {
    const statuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];
    const statusStr = prompt(`Order statuses:\n${statuses.join(', ')}\n\nEnter new status:`);
    if (!statusStr || !statuses.includes(statusStr)) return;

    const trackingNumber = prompt('Tracking number (optional):', '');

    try {
      if (window.api) {
        await window.api.put(`/orders/${orderId}/status`, {
          status: statusStr,
          tracking_number: trackingNumber || undefined,
        });
      }
      showToast('✓ Order updated');
      await this.loadOrdersTab();
    } catch (error) {
      console.error('Update failed:', error);
      showToast('Failed to update order');
    }
  }

  /**
   * Save Store Settings
   */
  async saveStoreSettings() {
    const name = document.getElementById('store-name-input')?.value;
    const description = document.getElementById('store-desc-input')?.value;

    if (!name?.trim()) {
      showToast('Store name is required');
      return;
    }

    try {
      if (window.api) {
        await window.api.put('/stores/mine', { name, description });
      }
      showToast('✓ Store settings saved');
    } catch (error) {
      console.error('Save failed:', error);
      showToast('Failed to save settings');
    }
  }

  // ===== UTILITY METHODS =====

  showLoading(container, show) {
    if (show) {
      container.innerHTML = `
        <div class="flex justify-center items-center py-16">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
        </div>
      `;
    }
  }

  getStatusBadgeClass(status) {
    const classes = {
      'pending': 'bg-amber-100 text-amber-800',
      'confirmed': 'bg-blue-100 text-blue-800',
      'processing': 'bg-purple-100 text-purple-800',
      'shipped': 'bg-cyan-100 text-cyan-800',
      'delivered': 'bg-green-100 text-green-800',
    };
    return classes[status] || 'bg-slate-100 text-slate-800';
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return String(text || '').replace(/[&<>"']/g, c => map[c]);
  }
}

// Initialize global instance
window.sellerDashboard = new SellerDashboard();

// Auto-initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('page-my-store') || document.getElementById('tab-products')) {
    window.sellerDashboard.init();
  }
});

// Legacy compatibility
window.MyStore = {
  init: () => window.sellerDashboard.init(),
};
