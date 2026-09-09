/**
 * Notifications Service - Real-time notifications with bell icon and dropdown
 * Phase 3.2 Implementation
 */

class NotificationsService {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.pollInterval = 30000; // Poll every 30 seconds
    this.pollTimer = null;
    this.isDropdownOpen = false;
  }

  /**
   * Initialize the notification system
   */
  async init() {
    try {
      await this.loadUnreadCount();
      this.startPolling();
      this.setupBellListener();
      console.log('✓ Notifications service initialized');
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
    }
  }

  /**
   * Get unread notification count
   */
  async loadUnreadCount() {
    try {
      const response = await window.api.get('/notifications/unread-count');
      this.unreadCount = response.data?.count || 0;
      this.updateBadge();
    } catch (error) {
      console.error('Failed to load unread count:', error);
    }
  }

  /**
   * Load notifications list
   */
  async loadNotifications(page = 1, limit = 20) {
    try {
      const response = await window.api.get('/notifications', { page, limit });
      this.notifications = response.data || [];
      this.renderNotificationList();
      return {
        notifications: this.notifications,
        totalCount: response.meta?.totalCount || this.notifications.length,
      };
    } catch (error) {
      console.error('Failed to load notifications:', error);
      return { notifications: [], totalCount: 0 };
    }
  }

  /**
   * Mark single notification as read
   */
  async markAsRead(notificationId) {
    try {
      await window.api.put(`/notifications/${notificationId}/read`);
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.updateBadge();
      await this.loadNotifications();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead() {
    try {
      await window.api.put('/notifications/read-all');
      this.unreadCount = 0;
      this.updateBadge();
      await this.loadNotifications();
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }

  /**
   * Update badge UI with unread count
   */
  updateBadge() {
    const badge = document.getElementById('notification-badge');
    if (badge) {
      if (this.unreadCount > 0) {
        badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  /**
   * Setup bell icon click listener
   */
  setupBellListener() {
    const bell = document.getElementById('notification-bell');
    if (bell) {
      bell.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleDropdown();
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const dropdown = document.getElementById('notification-dropdown');
      if (dropdown && !dropdown.contains(e.target) && e.target.id !== 'notification-bell') {
        this.closeDropdown();
      }
    });
  }

  /**
   * Toggle notification dropdown
   */
  toggleDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;

    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  /**
   * Open dropdown
   */
  async openDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;

    await this.loadNotifications(1, 10);
    dropdown.classList.remove('hidden');
    this.isDropdownOpen = true;
  }

  /**
   * Close dropdown
   */
  closeDropdown() {
    const dropdown = document.getElementById('notification-dropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
    }
    this.isDropdownOpen = false;
  }

  /**
   * Render notification list
   */
  renderNotificationList() {
    const container = document.getElementById('notification-list');
    if (!container) return;

    if (this.notifications.length === 0) {
      container.innerHTML = '<div class="p-4 text-center text-slate-400 text-sm">No notifications</div>';
      return;
    }

    container.innerHTML = this.notifications.map(notif => `
      <div class="notification-item px-3 py-2 border-b hover:bg-slate-100 cursor-pointer transition" 
           onclick="notificationsService.handleNotificationClick('${notif.id}', '${(notif.action?.target || '#').replace(/'/g, "\\'")}')">
        <div class="flex items-start gap-3">
          <div class="mt-1 flex-shrink-0">
            ${this.getNotificationIcon(notif.type)}
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm text-slate-900">${escHtml(notif.title)}</p>
            <p class="text-xs text-slate-600 truncate mt-0.5">${escHtml(notif.message)}</p>
            <p class="text-[10px] text-slate-400 mt-1">${this.getTimeAgo(notif.createdAt)}</p>
          </div>
          ${!notif.read ? '<span class="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1.5"></span>' : ''}
        </div>
      </div>
    `).join('');
  }

  /**
   * Get icon HTML for notification type
   */
  getNotificationIcon(type) {
    const icons = {
      'order': '<i data-lucide="package" class="w-4 h-4 text-emerald-600"></i>',
      'payment': '<i data-lucide="credit-card" class="w-4 h-4 text-blue-600"></i>',
      'message': '<i data-lucide="message-square" class="w-4 h-4 text-indigo-600"></i>',
      'review': '<i data-lucide="star" class="w-4 h-4 text-amber-600"></i>',
      'system': '<i data-lucide="bell" class="w-4 h-4 text-slate-600"></i>',
    };
    return icons[type] || icons['system'];
  }

  /**
   * Get relative time string ("2m ago")
   */
  getTimeAgo(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    
    return date.toLocaleDateString();
  }

  /**
   * Handle notification click
   */
  handleNotificationClick(notificationId, target) {
    this.markAsRead(notificationId);
    this.closeDropdown();
    
    if (target && target !== '#') {
      if (typeof goTo === 'function') {
        goTo(target);
      }
    }
  }

  /**
   * Start polling for new notifications
   */
  startPolling() {
    this.pollTimer = setInterval(() => {
      this.loadUnreadCount();
    }, this.pollInterval);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }

  /**
   * Create a test notification (for development)
   */
  async createTestNotification() {
    const testNotif = {
      id: `test-${Date.now()}`,
      type: 'system',
      title: 'Test Notification',
      message: 'This is a test notification',
      read: false,
      createdAt: new Date().toISOString(),
    };
    
    this.notifications.unshift(testNotif);
    this.unreadCount++;
    this.updateBadge();
    this.renderNotificationList();
  }
}

// Initialize global instance when API client is ready
window.notificationsService = new NotificationsService();

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.notificationsService.init();
    });
  } else {
    window.notificationsService.init();
  }
}
