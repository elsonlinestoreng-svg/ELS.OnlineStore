async function loadFirebaseFirestoreOnce() {
  if (window.__firebaseFirestoreLoaded) return;
  if (!window.FIREBASE_CONFIG) throw new Error('FIREBASE_CONFIG not set');
  window.__firebaseFirestoreLoaded = true;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js';
    s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
  });
  if (!window.firebase) throw new Error('Firebase SDK not loaded');
  if (!window.__firebaseApp) window.__firebaseApp = window.firebase.initializeApp(window.FIREBASE_CONFIG);
  window.__firestore = window.firebase.firestore();
}

window.contactDirectory = window.contactDirectory || [];

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

const __realtimeUnsub = {};
async function startRealtimeConversationListener(convId) {
  if (!window.FIREBASE_CONFIG) return;
  try {
    await loadFirebaseFirestoreOnce();
    if (!window.__firestore) return;
    if (__realtimeUnsub[convId]) __realtimeUnsub[convId]();
    const col = window.__firestore.collection('conversations').doc(convId).collection('messages');
    __realtimeUnsub[convId] = col.orderBy('time').onSnapshot(snap => {
      const msgs = [];
      snap.forEach(d => {
        const data = d.data();
        let time = data.time;
        if (time && typeof time.toDate === 'function') time = time.toDate().toISOString();
        else if (time && time.toDate === undefined) time = (new Date(time)).toISOString();
        else time = new Date().toISOString();
        msgs.push({ sender: data.sender || 'Unknown', text: data.text || '', time });
      });
      const conv = conversations.find(c => c.id === convId);
      if (conv) { conv.messages = msgs; if (currentConversation && currentConversation.id === convId) renderMessages(); renderConversations(); }
    }, err => console.warn('realtime listen failed', err));
  } catch (err) { console.warn('startRealtimeConversationListener error', err); }
}

function stopRealtimeConversationListener(convId) {
  if (__realtimeUnsub[convId]) { try { __realtimeUnsub[convId](); } catch(e){} delete __realtimeUnsub[convId]; }
}

async function writeMessageToFirestore(convId, msg) {
  if (!window.FIREBASE_CONFIG) throw new Error('FIREBASE_CONFIG not set');
  await loadFirebaseFirestoreOnce();
  const colRef = window.__firestore.collection('conversations').doc(convId).collection('messages');
  const payload = { sender: msg.sender, text: msg.text, time: window.firebase.firestore.FieldValue.serverTimestamp() };
  await colRef.add(payload);
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
    return `
      <button onclick="selectConversation('${c.id}')" class="conversation-card ${active} w-full rounded-3xl p-3 text-left text-white">
        <div class="flex items-start gap-2.5">
          <div class="relative mt-0.5">
            <div class="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-slate-700 text-sm font-bold text-white">${escHtml(participant.charAt(0).toUpperCase())}</div>
            <span class="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-slate-950 ${presence.dotClass}"></span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <p class="truncate text-sm font-semibold">${escHtml(participant)}</p>
              <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">${presence.label}</span>
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

async function sendMessage() {
  const input = document.getElementById('message-input');
  const btn = document.getElementById('send-btn');
  if (!input || !btn) return;
  const text = input.value.trim();
  if (!text || !currentConversation) return;

  const msg = { sender: currentUser.name, text: text, time: new Date().toISOString() };

  if (window.FIREBASE_CONFIG) {
    try {
      await writeMessageToFirestore(currentConversation.id, msg);
    } catch (err) {
      console.warn('firestore write failed, falling back to local', err);
      currentConversation.messages.push(msg);
    }
  } else {
    currentConversation.messages.push(msg);
  }

  if (currentConversation.orderId && isLogisticsProvider) {
    const ord = allOrders.find(o => o.order_id === currentConversation.orderId);
    if (ord) {
      ord._timeline = ord._timeline || [];
      ord._timeline.push({ actor: currentUser.name, text: msg.text, time: msg.time });
    }
  }

  input.value = '';
  updateSendButtonState();
  renderMessages();
  renderConversations();
  showToast('✓ Message sent!');
  input.focus();
}

function updateSendButtonState() {
  const input = document.getElementById('message-input');
  const btn = document.getElementById('send-btn');
  if (!btn || !input) return;
  const disabled = !input.value.trim() || !currentConversation;
  btn.disabled = disabled;
  btn.style.opacity = disabled ? '0.6' : '1';
  btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}

(function() {
  const input = document.getElementById('message-input');
  if (!input) return;
  input.addEventListener('input', () => updateSendButtonState());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const btn = document.getElementById('send-btn');
      if (btn && !btn.disabled) sendMessage();
    }
  });
})();
