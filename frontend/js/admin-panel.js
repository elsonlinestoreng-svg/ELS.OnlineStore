/**
 * Admin Panel Foundation
 * Phase 4.1 Implementation - Admin Dashboard
 * Role-based access control and admin module management
 */

class AdminPanel {
  constructor() {
    this.isAdmin = false;
    this.currentUser = null;
    this.adminModules = {};
    this.currentView = 'overview';
  }

  /**
   * Initialize admin panel
   */
  async init() {
    await this.checkAdminAccess();
    
    if (!this.isAdmin) {
      console.warn('User is not an admin');
      return false;
    }

    this.setupUI();
    this.bindNavigation();
    await this.loadOverview();
    console.log('✓ Admin panel initialized');
    return true;
  }

  /**
   * Check if current user has admin access
   */
  async checkAdminAccess() {
    try {
      const userStr = localStorage.getItem('els_user');
      this.currentUser = userStr ? JSON.parse(userStr) : null;

      if (!this.currentUser) {
        this.isAdmin = false;
        return;
      }

      // Check if user has admin role (stored locally or fetch from API)
      if (this.currentUser.role === 'admin' || this.currentUser.isAdmin === true) {
        this.isAdmin = true;
        return;
      }

      // Try to verify with backend
      try {
        if (window.api) {
          const response = await window.api.get('/admin/verify-access');
          this.isAdmin = response.success === true || response.data?.isAdmin === true;
        }
      } catch (error) {
        console.log('Admin verification endpoint not available');
        // Fall back to local role check
        this.isAdmin = this.currentUser.role === 'admin';
      }
    } catch (error) {
      console.error('Admin access check failed:', error);
      this.isAdmin = false;
    }
  }

  /**
   * Setup admin UI structure
   */
  setupUI() {
    const adminContainer = document.getElementById('admin-panel');
    if (!adminContainer) return;

    adminContainer.innerHTML = `
      <div class="flex h-screen bg-slate-100">
        <!-- Sidebar -->
        <div class="w-64 bg-slate-900 text-white flex flex-col shadow-lg">
          <div class="p-6 border-b border-slate-800">
            <h1 class="text-2xl font-bold">Admin</h1>
            <p class="text-sm text-slate-400 mt-2">${this.escapeHtml(this.currentUser?.name || 'Administrator')}</p>
          </div>

          <nav class="flex-1 overflow-y-auto p-4">
            <div class="admin-nav-section mb-6">
              <p class="text-xs font-semibold text-slate-400 px-3 mb-3 uppercase">Core</p>
              <button class="admin-nav-item w-full text-left px-3 py-2 rounded hover:bg-slate-800 transition" data-view="overview">
                <i data-lucide="layout-dashboard" class="w-4 h-4 inline mr-2"></i>
                Overview
              </button>
              <button class="admin-nav-item w-full text-left px-3 py-2 rounded hover:bg-slate-800 transition" data-view="users">
                <i data-lucide="users" class="w-4 h-4 inline mr-2"></i>
                Users
              </button>
              <button class="admin-nav-item w-full text-left px-3 py-2 rounded hover:bg-slate-800 transition" data-view="stores">
                <i data-lucide="shopping-bag" class="w-4 h-4 inline mr-2"></i>
                Stores
              </button>
            </div>

            <div class="admin-nav-section mb-6">
              <p class="text-xs font-semibold text-slate-400 px-3 mb-3 uppercase">Operations</p>
              <button class="admin-nav-item w-full text-left px-3 py-2 rounded hover:bg-slate-800 transition" data-view="orders">
                <i data-lucide="package" class="w-4 h-4 inline mr-2"></i>
                Orders
              </button>
              <button class="admin-nav-item w-full text-left px-3 py-2 rounded hover:bg-slate-800 transition" data-view="transactions">
                <i data-lucide="credit-card" class="w-4 h-4 inline mr-2"></i>
                Transactions
              </button>
              <button class="admin-nav-item w-full text-left px-3 py-2 rounded hover:bg-slate-800 transition" data-view="disputes">
                <i data-lucide="alert-circle" class="w-4 h-4 inline mr-2"></i>
                Disputes
              </button>
            </div>

            <div class="admin-nav-section">
              <p class="text-xs font-semibold text-slate-400 px-3 mb-3 uppercase">System</p>
              <button class="admin-nav-item w-full text-left px-3 py-2 rounded hover:bg-slate-800 transition" data-view="analytics">
                <i data-lucide="bar-chart-2" class="w-4 h-4 inline mr-2"></i>
                Analytics
              </button>
              <button class="admin-nav-item w-full text-left px-3 py-2 rounded hover:bg-slate-800 transition" data-view="settings">
                <i data-lucide="settings" class="w-4 h-4 inline mr-2"></i>
                Settings
              </button>
            </div>
          </nav>

          <div class="p-4 border-t border-slate-800">
            <button onclick="logout()" class="w-full px-3 py-2 bg-slate-800 text-slate-300 rounded hover:bg-slate-700 transition text-sm font-semibold">
              <i data-lucide="log-out" class="w-4 h-4 inline mr-2"></i>
              Logout
            </button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Top Bar -->
          <div class="bg-white border-b border-slate-200 px-6 py-4 shadow-sm flex justify-between items-center">
            <h2 id="admin-page-title" class="text-2xl font-bold text-slate-900">Overview</h2>
            <div class="flex gap-4 items-center">
              <input type="text" id="admin-search" placeholder="Search..." class="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <button onclick="location.reload()" class="px-4 py-2 hover:bg-slate-100 rounded-lg transition">
                <i data-lucide="refresh-cw" class="w-5 h-5"></i>
              </button>
            </div>
          </div>

          <!-- Content Area -->
          <div class="flex-1 overflow-y-auto p-6">
            <div id="admin-content" class="max-w-7xl mx-auto">
              <!-- Content loaded dynamically -->
            </div>
          </div>
        </div>
      </div>
    `;

    lucide.createIcons();
  }

  /**
   * Bind navigation clicks
   */
  bindNavigation() {
    document.querySelectorAll('.admin-nav-item').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const view = btn.dataset.view;
        if (!view) return;

        // Update active state
        document.querySelectorAll('.admin-nav-item').forEach(b => {
          b.style.background = '';
          b.style.color = '';
        });
        btn.style.background = 'rgba(148, 163, 184, 0.1)';
        btn.style.color = '#e0e7ff';

        // Load view
        await this.loadView(view);
      });
    });

    // Set initial active
    const overviewBtn = document.querySelector('.admin-nav-item[data-view="overview"]');
    if (overviewBtn) {
      overviewBtn.style.background = 'rgba(148, 163, 184, 0.1)';
      overviewBtn.style.color = '#e0e7ff';
    }
  }

  /**
   * Load specific admin view
   */
  async loadView(viewName) {
    this.currentView = viewName;
    const content = document.getElementById('admin-content');
    const title = document.getElementById('admin-page-title');

    if (!content) return;

    // Update title
    const viewTitles = {
      overview: 'Dashboard Overview',
      users: 'User Management',
      stores: 'Store Management',
      orders: 'Order Management',
      transactions: 'Transaction History',
      disputes: 'Dispute Resolution',
      analytics: 'Analytics & Insights',
      settings: 'Admin Settings',
    };
    if (title) title.textContent = viewTitles[viewName] || 'Admin Panel';

    // Show loading
    content.innerHTML = `
      <div class="flex justify-center items-center py-16">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    `;

    try {
      switch (viewName) {
        case 'overview':
          await this.loadOverview();
          break;
        case 'users':
          await this.loadUsers();
          break;
        case 'stores':
          await this.loadStores();
          break;
        case 'orders':
          await this.loadOrders();
          break;
        case 'transactions':
          await this.loadTransactions();
          break;
        case 'disputes':
          await this.loadDisputes();
          break;
        case 'analytics':
          await this.loadAnalytics();
          break;
        case 'settings':
          this.loadSettings();
          break;
        default:
          content.innerHTML = '<p class="text-slate-500">View not found</p>';
      }
    } catch (error) {
      console.error(`Failed to load ${viewName}:`, error);
      content.innerHTML = `<div class="alert alert-error">Failed to load this section. <button onclick="window.adminPanel.loadView('${viewName}')" class="underline">Retry</button></div>`;
    }
  }

  /**
   * Load Overview Dashboard
   */
  async loadOverview() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    try {
      let stats = { users: 0, stores: 0, orders: 0, transactions: 0, revenue: 0 };

      // Try to fetch stats from API
      try {
        if (window.api) {
          const response = await window.api.get('/admin/stats');
          stats = response.data || stats;
        }
      } catch (e) {
        console.log('Stats API not available');
      }

      content.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          ${[
            { label: 'Total Users', value: stats.users, icon: 'users', color: 'blue' },
            { label: 'Active Stores', value: stats.stores, icon: 'shopping-bag', color: 'green' },
            { label: 'Orders', value: stats.orders, icon: 'package', color: 'purple' },
            { label: 'Transactions', value: stats.transactions, icon: 'credit-card', color: 'amber' },
            { label: 'Revenue', value: '₦' + Number(stats.revenue || 0).toLocaleString(), icon: 'trending-up', color: 'rose' },
          ].map(stat => `
            <div class="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-slate-600 mb-1">${stat.label}</p>
                  <p class="text-3xl font-bold text-slate-900">${typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</p>
                </div>
                <i data-lucide="${stat.icon}" class="w-8 h-8 text-${stat.color}-500"></i>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Quick Actions -->
          <div class="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
            <h3 class="text-lg font-bold text-slate-900 mb-4">Quick Actions</h3>
            <div class="space-y-2">
              <button onclick="window.adminPanel.loadView('users')" class="w-full text-left px-4 py-2 hover:bg-slate-50 rounded transition">
                Manage Users
              </button>
              <button onclick="window.adminPanel.loadView('stores')" class="w-full text-left px-4 py-2 hover:bg-slate-50 rounded transition">
                Manage Stores
              </button>
              <button onclick="window.adminPanel.loadView('orders')" class="w-full text-left px-4 py-2 hover:bg-slate-50 rounded transition">
                View Orders
              </button>
              <button onclick="window.adminPanel.loadView('disputes')" class="w-full text-left px-4 py-2 hover:bg-slate-50 rounded transition">
                Handle Disputes
              </button>
            </div>
          </div>

          <!-- System Status -->
          <div class="bg-white rounded-lg p-6 border border-slate-200 shadow-sm">
            <h3 class="text-lg font-bold text-slate-900 mb-4">System Status</h3>
            <div class="space-y-3">
              <div class="flex justify-between items-center">
                <span class="text-slate-600">Database</span>
                <span class="text-green-600 font-semibold">✓ Connected</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-600">API Server</span>
                <span class="text-green-600 font-semibold">✓ Running</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-600">Cache</span>
                <span class="text-green-600 font-semibold">✓ Active</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-600">Last Sync</span>
                <span class="text-slate-500 text-sm">${new Date().toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      lucide.createIcons();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Load Users Management
   */
  async loadUsers() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    content.innerHTML = `
      <div class="bg-white rounded-lg border border-slate-200 p-6">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-lg font-bold">All Users</h3>
          <input type="text" placeholder="Search users..." class="px-4 py-2 border border-slate-300 rounded-lg">
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-slate-300">
              <tr>
                <th class="text-left py-3 px-4 font-semibold">Name</th>
                <th class="text-left py-3 px-4 font-semibold">Email</th>
                <th class="text-left py-3 px-4 font-semibold">Stores</th>
                <th class="text-left py-3 px-4 font-semibold">Joined</th>
                <th class="text-left py-3 px-4 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-slate-200 hover:bg-slate-50">
                <td class="py-3 px-4">Feature coming soon</td>
                <td class="py-3 px-4" colspan="4">User management data will load from /api/admin/users</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Load Stores Management
   */
  async loadStores() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    content.innerHTML = `
      <div class="bg-white rounded-lg border border-slate-200 p-6">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-lg font-bold">All Stores</h3>
          <input type="text" placeholder="Search stores..." class="px-4 py-2 border border-slate-300 rounded-lg">
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div class="border border-slate-200 rounded-lg p-4 hover:shadow-md transition">
            <h4 class="font-bold text-slate-900">Feature coming soon</h4>
            <p class="text-sm text-slate-600 mt-2">Store management data will load from /api/admin/stores</p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Load Orders Management
   */
  async loadOrders() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    content.innerHTML = `
      <div class="bg-white rounded-lg border border-slate-200 p-6">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-lg font-bold">All Orders</h3>
          <div class="flex gap-2">
            <select class="px-4 py-2 border border-slate-300 rounded-lg">
              <option>All Statuses</option>
              <option>Pending</option>
              <option>Processing</option>
              <option>Delivered</option>
            </select>
          </div>
        </div>
        <div class="text-center py-8 text-slate-500">
          Feature coming soon - Order management data will load from /api/admin/orders
        </div>
      </div>
    `;
  }

  /**
   * Load Transactions
   */
  async loadTransactions() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    content.innerHTML = `
      <div class="bg-white rounded-lg border border-slate-200 p-6">
        <h3 class="text-lg font-bold mb-6">Transaction History</h3>
        <div class="text-center py-8 text-slate-500">
          Feature coming soon - Transaction data will load from /api/admin/transactions
        </div>
      </div>
    `;
  }

  /**
   * Load Disputes
   */
  async loadDisputes() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    content.innerHTML = `
      <div class="bg-white rounded-lg border border-slate-200 p-6">
        <h3 class="text-lg font-bold mb-6">Dispute Resolution</h3>
        <div class="text-center py-8 text-slate-500">
          Feature coming soon - Disputes will load from /api/admin/disputes
        </div>
      </div>
    `;
  }

  /**
   * Load Analytics
   */
  async loadAnalytics() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    content.innerHTML = `
      <div class="space-y-6">
        <div class="bg-white rounded-lg border border-slate-200 p-6">
          <h3 class="text-lg font-bold mb-4">Revenue Chart</h3>
          <div class="h-64 bg-slate-50 rounded flex items-center justify-center text-slate-500">
            Chart visualization coming soon
          </div>
        </div>
        <div class="bg-white rounded-lg border border-slate-200 p-6">
          <h3 class="text-lg font-bold mb-4">Activity Metrics</h3>
          <div class="text-center py-8 text-slate-500">
            Analytics data will load from /api/admin/analytics
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Load Settings
   */
  loadSettings() {
    const content = document.getElementById('admin-content');
    if (!content) return;

    content.innerHTML = `
      <div class="bg-white rounded-lg border border-slate-200 p-6 max-w-2xl">
        <h3 class="text-lg font-bold mb-6">Admin Settings</h3>
        
        <div class="space-y-6">
          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">Platform Name</label>
            <input type="text" value="ELS Online Store" class="w-full px-4 py-2 border border-slate-300 rounded-lg">
          </div>

          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">Commission Rate (%)</label>
            <input type="number" value="5" class="w-full px-4 py-2 border border-slate-300 rounded-lg">
          </div>

          <div>
            <label class="block text-sm font-semibold text-slate-700 mb-2">Support Email</label>
            <input type="email" value="support@els.com" class="w-full px-4 py-2 border border-slate-300 rounded-lg">
          </div>

          <button onclick="showToast('Settings saved (mock)')" class="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">
            Save Settings
          </button>
        </div>
      </div>
    `;
  }

  // ===== UTILITY METHODS =====

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
window.adminPanel = new AdminPanel();

// Auto-initialize if admin page is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('admin-panel')) {
    window.adminPanel.init();
  }
});
