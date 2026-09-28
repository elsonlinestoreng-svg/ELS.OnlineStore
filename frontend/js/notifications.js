/**
 * Notifications panel.
 *
 * Drives the header bell against the real endpoints:
 *   GET  /api/notifications             -> { success, notifications, count }
 *   GET  /api/notifications/unread-count-> { success, count }
 *   PUT  /api/notifications/:id/read
 *   PUT  /api/notifications/read-all
 *
 * The previous version of this file was never loaded and was written against
 * a different contract (`id`/`read`/`createdAt`, responses nested under
 * `data`), so it could not have worked even if it had been included.
 *
 * Notifications are produced by the backend across checkout, orders, payments,
 * logistics and messaging, so this is the only place a customer sees them.
 */

const NOTIFICATION_ICONS = {
  order: { icon: 'package', classes: 'text-emerald-600' },
  payment: { icon: 'credit-card', classes: 'text-blue-600' },
  logistics: { icon: 'truck', classes: 'text-purple-600' },
  message: { icon: 'message-square', classes: 'text-indigo-600' },
  system: { icon: 'bell', classes: 'text-slate-600' },
};

// The backend's `data` payload carries no explicit route, so derive the
// destination from the notification type.
const NOTIFICATION_TARGETS = {
  order: 'orders',
  payment: 'orders',
  logistics: 'shipping',
  message: 'messages',
  system: null,
};

class NotificationsPanel {
  constructor() {
    this.items = [];
    this.unreadCount = 0;
    this.pollTimer = null;
    this.isOpen = false;
    this.pollIntervalMs = 60000;
    this.initialized = false;
  }

  /**
   * Starts polling. Safe to call repeatedly. Requires a signed-in user, since
   * every endpoint is behind auth, so it is invoked after sign-in rather than
   * on DOMContentLoaded.
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.cacheElements();
    this.bindEvents();
    this.loadUnreadCount();
    this.startPolling();

    document.addEventListener('visibilitychange', () => {
      // Refetch when the tab regains focus so a long-idle tab is not stale.
      if (!document.hidden) this.loadUnreadCount();
    });
  }

  cacheElements() {
    this.elements = {
      bell: document.getElementById('notification-bell'),
      badge: document.getElementById('notification-badge'),
      dropdown: document.getElementById('notification-dropdown'),
      list: document.getElementById('notification-list'),
      markAll: document.getElementById('notification-mark-all'),
    };
  }

  bindEvents() {
    const { bell, dropdown, markAll } = this.elements;
    if (!bell || !dropdown) return;

    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // A click anywhere else closes the panel. The listener stays attached
    // across opens, so register it once here rather than per toggle.
    document.addEventListener('click', (e) => {
      if (!this.isOpen) return;
      if (dropdown.contains(e.target) || (bell && bell.contains(e.target))) return;
      this.close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });

    if (markAll) {
      markAll.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.markAllAsRead();
      });
    }
  }

  async apiRequest(endpoint, options = {}) {
    const token = typeof getAuthToken === 'function' ? getAuthToken() : '';
    if (!token) return null;

    const base = window.API_BASE || 'http://localhost:8001/api';
    const res = await fetch(`${base}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    // 401 here means the session died elsewhere; the app's own error handling
    // will redirect, so do not surface a notification error on top of it.
    if (!res.ok) return null;

    try {
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async loadUnreadCount() {
    const payload = await this.apiRequest('/notifications/unread-count');
    if (!payload || payload.success === false) return;
    this.unreadCount = Number(payload.count) || 0;
    this.renderBadge();
  }

  async loadItems() {
    const payload = await this.apiRequest('/notifications?limit=15');
    if (!payload || payload.success === false) return;
    this.items = Array.isArray(payload.notifications) ? payload.notifications : [];
    this.renderList();
  }

  async markAsRead(id) {
    const local = this.items.find((n) => (n._id || n.id) === id);
    if (local && local.is_read) return;

    await this.apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' });
    if (local) local.is_read = true;
    this.unreadCount = Math.max(0, this.unreadCount - 1);
    this.renderBadge();
    this.renderList();
  }

  async markAllAsRead() {
    await this.apiRequest('/notifications/read-all', { method: 'PUT' });
    this.items.forEach((n) => { n.is_read = true; });
    this.unreadCount = 0;
    this.renderBadge();
    this.renderList();
    if (typeof showToast === 'function') showToast('All notifications marked as read');
  }

  renderBadge() {
    const { badge } = this.elements;
    if (!badge) return;
    if (this.unreadCount > 0) {
      badge.textContent = this.unreadCount > 99 ? '99+' : String(this.unreadCount);
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  renderList() {
    const { list } = this.elements;
    if (!list) return;

    if (!this.items.length) {
      list.innerHTML = '<p class="px-4 py-8 text-center text-sm text-slate-500">You have no notifications yet.</p>';
      return;
    }

    list.innerHTML = this.items
      .map((n) => {
        const id = n._id || n.id || '';
        const meta = NOTIFICATION_ICONS[n.type] || NOTIFICATION_ICONS.system;
        const target = NOTIFICATION_TARGETS[n.type] || null;
        // escapeHtml is defined in ui.js; the local fallback keeps this module
        // usable if it is ever loaded without ui.js.
        const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s == null ? '' : s);
        return `
          <button type="button" data-id="${esc(id)}" data-target="${esc(target || '')}"
            class="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${n.is_read ? '' : 'bg-rose-50/40'}">
            <i data-lucide="${meta.icon}" class="mt-0.5 h-4 w-4 shrink-0 ${meta.classes}"></i>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold text-slate-900">${esc(n.title)}</span>
              <span class="mt-0.5 block text-xs leading-relaxed text-slate-600">${esc(n.message)}</span>
              <span class="mt-1 block text-[11px] text-slate-400">${esc(this.timeAgo(n.created_at))}</span>
            </span>
            ${n.is_read ? '' : '<span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-500"></span>'}
          </button>`;
      })
      .join('');

    list.querySelectorAll('button[data-id]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.markAsRead(btn.dataset.id);
        this.close();
        const target = btn.dataset.target;
        if (target && typeof goTo === 'function') goTo(target);
      });
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  async open() {
    const { dropdown } = this.elements;
    if (!dropdown) return;
    dropdown.classList.remove('hidden');
    this.isOpen = true;
    this.renderList();
    await this.loadItems();
  }

  close() {
    const { dropdown } = this.elements;
    if (dropdown) dropdown.classList.add('hidden');
    this.isOpen = false;
  }

  async toggle() {
    if (this.isOpen) this.close();
    else await this.open();
  }

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      // A signed-out or expired session would 401 on every tick; skip it.
      if (typeof getAuthToken === 'function' && !getAuthToken()) return;
      this.loadUnreadCount();
    }, this.pollIntervalMs);
  }

  stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  timeAgo(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
  }
}

window.notificationsPanel = new NotificationsPanel();
