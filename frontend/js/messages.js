// ===== MESSAGING =====
window.contactDirectory = window.contactDirectory || [];

// Load contacts from localStorage on page load
function loadContactsFromStorage() {
  try {
    const savedContacts = localStorage.getItem('contactDirectory');
    if (savedContacts) {
      window.contactDirectory = JSON.parse(savedContacts);
    }
    const savedConversations = localStorage.getItem('conversations');
    if (savedConversations) {
      conversations = JSON.parse(savedConversations);
    }
  } catch (e) {
    console.log('Could not load contacts from localStorage:', e);
  }
}

// Initialize contacts on app start
if (typeof document !== 'undefined' && document.readyState !== 'loading') {
  loadContactsFromStorage();
} else if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', loadContactsFromStorage);
}

function toggleContactActionMenu(event) {
  event?.stopPropagation();
  const menu = document.getElementById('contact-action-menu');
  if (menu) menu.classList.toggle('hidden');
}

function closeContactActionMenu() {
  const menu = document.getElementById('contact-action-menu');
  if (menu) menu.classList.add('hidden');
}

function openContactModal() {
  closeContactActionMenu();
  const modal = document.getElementById('contact-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const input = document.getElementById('contact-name');
    if (input) input.focus();
  }
}

function closeContactModal() {
  const modal = document.getElementById('contact-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function submitContactForm(event) {
  event?.preventDefault();
  const name = document.getElementById('contact-name')?.value?.trim();
  const phone = document.getElementById('contact-phone')?.value?.trim();
  const region = document.getElementById('contact-region')?.value?.trim() || 'global';
  if (!name) {
    showToast('Please enter a contact name');
    return;
  }
  const contact = { id: `contact-${Date.now()}`, name, phone, region, role: 'Delivery contact' };
  window.contactDirectory.push(contact);
  const convId = `contact-${contact.id}`;
  let conv = conversations.find(c => c.id === convId);
  if (!conv) {
    conv = {
      id: convId,
      title: `Direct contact • ${name}`,
      participants: [name, currentUser?.name || 'You'],
      region,
      channel: 'direct contact',
      isOnline: true,
      phone,
      messages: []
    };
    conversations.unshift(conv);
  }
  currentConversation = conv;
  closeContactModal();
  goTo('messages');
  renderConversations();
  showToast(`Contact added and chat opened for ${name}`);
  
  // Save to localStorage
  try {
    localStorage.setItem('contactDirectory', JSON.stringify(window.contactDirectory));
    localStorage.setItem('conversations', JSON.stringify(conversations));
  } catch (e) {
    console.log('Could not save contacts to localStorage:', e);
  }
}

function startQuickCall() {
  closeContactActionMenu();
  const phone = currentConversation?.phone || window.contactDirectory[0]?.phone;
  if (!phone) {
    showToast('Add a contact phone number first');
    return;
  }
  window.location.href = `tel:${phone}`;
}

function startQuickChat() {
  closeContactActionMenu();
  openContactModal();
  showToast('Add a contact to start a direct chat');
}

function getConversationParticipantName(conversation) {
  const participants = (conversation?.participants || []).filter(Boolean);
  const currentName = currentUser?.name || 'User';
  return participants.find(p => p !== currentName) || participants[0] || 'Logistics Desk';
}

function getConversationChannelLabel(conversation) {
  const region = conversation?.region || currentUser?.region || 'global';
  const channel = conversation?.channel || (conversation?.orderId ? 'order channel' : 'service channel');
  return `${String(region).toUpperCase()} • ${String(channel).toUpperCase()}`;
}

function getConversationPresence(conversation) {
  return conversation?.isOnline === false ? { label: 'offline', dotClass: 'bg-slate-400' } : { label: 'live', dotClass: 'bg-emerald-400' };
}

function openChat(productId) {
  const product = allProducts.find(p => p.__backendId === productId);
  if (!product) return;
  const convId = `product-${product.__backendId}`;
  let conv = conversations.find(c => c.id === convId);

  if (!conv) {
    conv = {
      id: convId,
      title: `Service chat for ${product.name}`,
      productId: product.__backendId,
      participants: [product.seller, currentUser?.name || 'Buyer'],
      region: currentUser?.region || 'global',
      channel: 'seller service',
      isOnline: true,
      messages: []
    };
    conversations.push(conv);
  }

  currentConversation = conv;
  if (window.FIREBASE_CONFIG) startRealtimeConversationListener(conv.id).catch(()=>{});
  goTo('messages');
  renderConversations();
}

// Open or create a conversation tied to an order (logistics <> buyer)
function openOrderChat(orderId) {
  const order = allOrders.find(o => o.order_id === orderId);
  if (!order) return showToast('Order not found');
  const convId = `order-${orderId}`;
  let conv = conversations.find(c => c.id === convId);
  if (!conv) {
    conv = {
      id: convId,
      title: `Order ${orderId}`,
      orderId: orderId,
      participants: [order.buyer_name, order.logistics_provider || 'Logistics'],
      region: order.region || currentUser?.region || 'global',
      channel: order.delivery_method || 'order channel',
      isOnline: true,
      messages: []
    };
    conversations.push(conv);
  }
  currentConversation = conv;
  if (window.FIREBASE_CONFIG) startRealtimeConversationListener(conv.id).catch(()=>{});
  goTo('messages');
  renderConversations();
}

function renderConversations() {
  const list = document.getElementById('conversations-list');
  const header = document.getElementById('chat-header');
  const inputArea = document.getElementById('chat-input-area');
  const container = document.getElementById('messages-container');

  if (!conversations.length) {
    list.innerHTML = '<div class="rounded-3xl border border-dashed border-slate-700/50 bg-white/10 p-4 text-center text-sm text-slate-400">No live channels yet. Open an order or delivery request to start a logistics chat.</div>';
    header.innerHTML = '<div class="flex flex-col gap-1"><div class="flex items-center gap-2 text-sm font-semibold text-slate-700"><i data-lucide="sparkles" class="w-4 h-4 text-indigo-500"></i> JovAli Delivery Hub</div><p class="text-xs text-slate-500">Use the plus button to add a contact, call directly, or start a new chat.</p></div>';
    inputArea.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  list.innerHTML = conversations.map(c => {
    const participant = getConversationParticipantName(c);
    const presence = getConversationPresence(c);
    const channelLabel = getConversationChannelLabel(c);
    const lastMessage = (c.messages && c.messages.length) ? c.messages[c.messages.length - 1].text : 'No delivery updates yet';
    const active = currentConversation?.id === c.id ? 'active' : '';
    const isDirectContact = c.id.startsWith('contact-');
    const menuBtn = isDirectContact ? `
      <div class="relative">
        <button type="button" onclick="toggleConversationMenu('${c.id}', event)" class="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 p-2 rounded-full hover:bg-slate-600/40 text-slate-300 hover:text-white" title="Options">
          <i data-lucide="more-vertical" class="w-4 h-4"></i>
        </button>
        <div id="menu-${c.id}" class="hidden absolute right-0 top-8 z-30 w-48 rounded-xl border border-slate-600 bg-slate-800 shadow-lg">
          <button type="button" onclick="deleteContact('${c.id}', event)" class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/20">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
            <span>Delete contact</span>
          </button>
        </div>
      </div>
    ` : '';
    
    return `
      <button onclick="selectConversation('${c.id}')" class="conversation-card group ${active} w-full rounded-3xl p-3 text-left text-white">
        <div class="flex items-start gap-2.5">
          <div class="relative mt-0.5">
            <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-slate-700 text-sm font-bold text-white">${escHtml(participant.charAt(0).toUpperCase())}</div>
            <span class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-slate-950 ${presence.dotClass}"></span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="truncate text-sm font-semibold">${escHtml(participant)}</p>
              <div class="flex items-center gap-1 flex-shrink-0">
                <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">${presence.label}</span>
                ${menuBtn}
              </div>
            </div>
            <p class="truncate text-[11px] text-slate-400">${escHtml(channelLabel)}</p>
            <p class="mt-1 truncate text-[11px] text-slate-500">${escHtml(lastMessage)}</p>
          </div>
        </div>
      </button>
    `;
  }).join('');

  if (currentConversation) {
    const participant = getConversationParticipantName(currentConversation);
    const presence = getConversationPresence(currentConversation);
    const channelLabel = getConversationChannelLabel(currentConversation);
    header.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="relative">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-900 text-sm font-semibold text-white">${escHtml(participant.charAt(0).toUpperCase())}</div>
            <span class="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${presence.dotClass}"></span>
          </div>
          <div>
            <p class="text-sm font-semibold text-slate-900">${escHtml(participant)}</p>
            <p class="text-xs text-slate-500">${presence.label} • ${escHtml(channelLabel)}</p>
          </div>
        </div>
        <div class="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">${escHtml(currentConversation.region || currentUser?.region || 'global')}</div>
      </div>
    `;
    inputArea.classList.remove('hidden');
    renderMessages();
  } else {
    header.innerHTML = '<div class="flex flex-col gap-1"><div class="flex items-center gap-2 text-sm font-semibold text-slate-700"><i data-lucide="sparkles" class="w-4 h-4 text-indigo-500"></i> JovAli Delivery Hub</div><p class="text-xs text-slate-500">Choose a contact or use the plus button to add one.</p></div>';
    inputArea.classList.add('hidden');
  }

  const msgInput = document.getElementById('message-input');
  if (msgInput && currentConversation) {
    msgInput.placeholder = `Message ${getConversationParticipantName(currentConversation)}`;
  }
  try { updateSendButtonState(); } catch (e) {}
}

function renderMessages() {
  const container = document.getElementById('messages-container');
  if (!currentConversation) return;
  container.innerHTML = (currentConversation.messages || []).map(msg => {
    const isMine = msg.sender === (currentUser?.name || 'User');
    return `
      <div class="message-bubble ${isMine ? 'message-bubble--mine' : 'message-bubble--other'}">
        <div class="message-bubble__card">
          ${!isMine ? `<p class="message-bubble__meta">${escHtml(msg.sender)}</p>` : ''}
          <p class="message-bubble__text">${escHtml(msg.text || '')}</p>
          <p class="message-bubble__time">${new Date(msg.time || Date.now()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function selectConversation(id) {
  currentConversation = conversations.find(c => c.id === id);
  renderConversations();
}

// Delete a contact from the conversation list
function deleteContact(contactId, event) {
  event?.stopPropagation();
  
  // Find the contact to confirm deletion
  const contact = window.contactDirectory.find(c => `contact-${c.id}` === contactId);
  if (!contact) return;
  
  // Confirm deletion
  if (!confirm(`Are you sure you want to delete contact "${contact.name}"? This action cannot be undone.`)) {
    return;
  }
  
  // Remove contact from directory
  window.contactDirectory = window.contactDirectory.filter(c => `contact-${c.id}` !== contactId);
  
  // Remove conversation
  conversations = conversations.filter(c => c.id !== contactId);
  
  // If deleted contact was selected, clear selection
  if (currentConversation?.id === contactId) {
    currentConversation = null;
  }
  
  // Re-render
  renderConversations();
  showToast(`Contact deleted successfully`);
  
  // Save to localStorage if you have persistence
  try {
    localStorage.setItem('contactDirectory', JSON.stringify(window.contactDirectory));
    localStorage.setItem('conversations', JSON.stringify(conversations));
  } catch (e) {
    console.log('Could not save to localStorage:', e);
  }
}

// Toggle conversation action menu (three-dot menu)
function toggleConversationMenu(conversationId, event) {
  event?.stopPropagation();
  const menu = document.getElementById(`menu-${conversationId}`);
  if (!menu) return;
  
  // Close all other menus
  document.querySelectorAll('[id^="menu-"]').forEach(m => {
    if (m.id !== `menu-${conversationId}`) {
      m.classList.add('hidden');
    }
  });
  
  // Toggle current menu
  menu.classList.toggle('hidden');
}
