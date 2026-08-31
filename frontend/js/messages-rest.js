/**
 * Messaging Service - REST API Integration (replaces Firebase)
 * Phase 3.1 Implementation
 */

class MessagingService {
  constructor() {
    this.conversations = [];
    this.currentConversation = null;
    this.messageCache = {};
    this.pollInterval = 5000; // Poll every 5 seconds
    this.pollTimer = null;
    this.isLoading = false;
  }

  /**
   * Initialize messaging system
   */
  async init() {
    try {
      await this.loadConversations();
      this.startPolling();
      console.log('✓ Messaging service initialized');
    } catch (error) {
      console.error('Failed to initialize messaging:', error);
    }
  }

  /**
   * Load all conversations for user
   */
  async loadConversations() {
    if (this.isLoading) return;
    
    try {
      this.isLoading = true;
      const response = await window.api.get('/messages/conversations');
      this.conversations = response.data || [];
      this.renderConversations();
    } catch (error) {
      console.error('Failed to load conversations:', error);
      // Show user-friendly error
      if (error.status === 404) {
        // API endpoint doesn't exist yet - show message
        console.log('Messaging API not yet available. Using demo mode.');
      }
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load messages for a specific conversation
   */
  async loadMessages(conversationId, page = 1, limit = 50) {
    if (!conversationId) return;

    try {
      const response = await window.api.get(
        `/messages/conversations/${conversationId}/messages`,
        { page, limit }
      );
      
      this.messageCache[conversationId] = response.data || [];
      this.renderMessages(conversationId);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }

  /**
   * Send a message
   */
  async sendMessage(conversationId, text) {
    if (!text.trim() || !conversationId) return false;

    try {
      const response = await window.api.post(
        `/messages/conversations/${conversationId}/messages`,
        { text: text.trim() }
      );

      // Add message to cache immediately
      if (!this.messageCache[conversationId]) {
        this.messageCache[conversationId] = [];
      }
      this.messageCache[conversationId].push(response.data);
      this.renderMessages(conversationId);
      
      // Clear input
      const input = document.getElementById('message-input');
      if (input) {
        input.value = '';
        if (typeof updateSendButtonState === 'function') {
          updateSendButtonState();
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      showToast('Failed to send message');
      return false;
    }
  }

  /**
   * Mark conversation as read
   */
  async markAsRead(conversationId) {
    if (!conversationId) return;

    try {
      await window.api.put(`/messages/conversations/${conversationId}/read`);
      
      // Update unread badge
      const conv = this.conversations.find(c => c.id === conversationId);
      if (conv) {
        conv.unreadCount = 0;
      }
      this.renderConversations();
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  }

  /**
   * Create new conversation
   */
  async createConversation(participantId, title) {
    if (!participantId || !title) return null;

    try {
      const response = await window.api.post('/messages/conversations', {
        participantId,
        title,
      });
      
      this.conversations.unshift(response.data);
      this.currentConversation = response.data;
      this.renderConversations();
      
      showToast(`Conversation created: ${title}`);
      return response.data;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      showToast('Failed to create conversation');
      return null;
    }
  }

  /**
   * Delete/Archive a conversation
   */
  async deleteConversation(conversationId) {
    if (!conversationId) return false;

    try {
      await window.api.delete(`/messages/conversations/${conversationId}`);
      
      this.conversations = this.conversations.filter(c => c.id !== conversationId);
      if (this.currentConversation?.id === conversationId) {
        this.currentConversation = null;
      }
      
      this.renderConversations();
      showToast('Conversation deleted');
      return true;
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      showToast('Failed to delete conversation');
      return false;
    }
  }

  /**
   * Poll for new messages periodically
   */
  startPolling() {
    this.pollTimer = setInterval(async () => {
      if (this.currentConversation) {
        await this.loadMessages(this.currentConversation.id);
      }
      await this.loadConversations();
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
   * Render conversations list
   */
  renderConversations() {
    const list = document.getElementById('conversations-list');
    if (!list) return;

    if (this.conversations.length === 0) {
      list.innerHTML = `
        <div class="rounded-3xl border border-dashed border-slate-700/50 bg-white/10 p-4 text-center text-sm text-slate-400">
          No conversations yet. Start a new one to begin chatting.
        </div>
      `;
      return;
    }

    list.innerHTML = this.conversations.map(conv => {
      const isActive = this.currentConversation?.id === conv.id;
      const activeClass = isActive ? 'active' : '';
      const unreadBadge = conv.unreadCount > 0 ? `<span class="ml-auto bg-blue-600 text-white text-xs px-2 py-1 rounded-full">${conv.unreadCount}</span>` : '';
      
      return `
        <div class="conversation-card group ${activeClass} w-full rounded-xl border border-slate-200/50 bg-white hover:border-slate-300 hover:shadow-md transition-all relative">
          <button onclick="messagingService.selectConversation('${conv.id}')" 
                  class="w-full rounded-xl p-4 text-left hover:bg-slate-50/50 transition">
            <div class="flex items-start gap-2.5 justify-between">
              <div class="flex-1 min-w-0">
                <p class="truncate text-sm font-semibold text-slate-900">${escHtml(conv.title || 'Conversation')}</p>
                <p class="text-xs text-slate-500 truncate mt-1">${escHtml(conv.lastMessage || 'No messages yet')}</p>
                <p class="text-[10px] text-slate-400 mt-0.5">${conv.lastMessageTime ? this.getTimeAgo(conv.lastMessageTime) : ''}</p>
              </div>
              ${unreadBadge}
            </div>
          </button>
          
          <!-- Three-Dot Menu for Delete -->
          <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button type="button" 
                    onclick="toggleConversationMenu(event, '${conv.id}')" 
                    class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition"
                    title="Conversation menu">
              <i data-lucide="more-vertical" class="w-4 h-4"></i>
            </button>
            <div class="conversation-menu hidden absolute right-0 top-10 z-30 min-w-max rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <button type="button" 
                      onclick="deleteConversationConfirm('${conv.id}')"
                      class="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50/80 transition font-medium">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
                <span>Delete Conversation</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Render messages in current conversation
   */
  renderMessages(conversationId) {
    const container = document.getElementById('messages-container');
    if (!container) return;

    const messages = this.messageCache[conversationId] || [];
    
    if (messages.length === 0) {
      container.innerHTML = '<div class="text-center py-8 text-slate-400 text-sm">No messages yet. Start the conversation!</div>';
      return;
    }

    container.innerHTML = messages.map(msg => {
      const isMine = msg.senderId === (window.currentUser?.id || localStorage.getItem('user_id'));
      return `
        <div class="message-bubble ${isMine ? 'message-bubble--mine' : 'message-bubble--other'}">
          <div class="message-bubble__card">
            ${!isMine ? `<p class="message-bubble__meta">${escHtml(msg.senderName || 'Unknown')}</p>` : ''}
            <p class="message-bubble__text">${escHtml(msg.text || '')}</p>
            <p class="message-bubble__time">${new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
          </div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  /**
   * Select a conversation
   */
  selectConversation(conversationId) {
    this.currentConversation = this.conversations.find(c => c.id === conversationId);
    if (this.currentConversation) {
      this.loadMessages(conversationId);
      this.markAsRead(conversationId);
      this.renderConversations();
    }
  }

  /**
   * Get relative time ("2m ago")
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
   * Get unread message count
   */
  getUnreadCount() {
    return this.conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
  }

  /**
   * Send message from input field (called from UI)
   */
  async sendFromInput() {
    const input = document.getElementById('message-input');
    if (!input || !this.currentConversation) return;

    const text = input.value.trim();
    if (text) {
      const success = await this.sendMessage(this.currentConversation.id, text);
      if (success) {
        input.value = '';
      }
    }
  }
}

// Helper Functions for Conversation Menu

/**
 * Toggle conversation menu visibility
 */
function toggleConversationMenu(event, conversationId) {
  event.stopPropagation();
  
  // Close all other menus
  document.querySelectorAll('.conversation-menu').forEach(menu => {
    menu.classList.add('hidden');
  });
  
  // Find and toggle the current menu
  const menu = event.currentTarget.nextElementSibling;
  if (menu && menu.classList.contains('conversation-menu')) {
    menu.classList.toggle('hidden');
  }
}

/**
 * Confirm and delete conversation
 */
function deleteConversationConfirm(conversationId) {
  if (!conversationId) return;
  
  // Create confirmation dialog
  const confirmed = confirm('Are you sure you want to delete this conversation? This action cannot be undone.');
  
  if (confirmed) {
    messagingService.deleteConversation(conversationId);
  }
}

// Close menu when clicking outside
document.addEventListener('click', function(event) {
  if (!event.target.closest('.conversation-card')) {
    document.querySelectorAll('.conversation-menu').forEach(menu => {
      menu.classList.add('hidden');
    });
  }
});

// Initialize global instance
window.messagingService = new MessagingService();

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Only initialize if messaging page exists
      if (document.getElementById('conversations-list')) {
        window.messagingService.init();
      }
    });
  } else {
    if (document.getElementById('conversations-list')) {
      window.messagingService.init();
    }
  }
}
