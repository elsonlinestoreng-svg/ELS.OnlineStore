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

function openChat(productId) {
  const product = allProducts.find(p => p.__backendId === productId);
  if (!product) return;
  const convId = `product-${product.__backendId}`;
  let conv = conversations.find(c => c.id === convId);

  if (!conv) {
    conv = {
      id: convId,
      title: `Chat about "${product.name}"`,
      productId: product.__backendId,
      participants: [product.seller, currentUser.name],
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
      title: `Order ${orderId} - ${order.tracking_number || ''}`,
      orderId: orderId,
      participants: [order.buyer_name, order.logistics_provider || 'Logistics'],
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
    list.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">No conversations yet. Click a product to message the seller!</p>';
    header.innerHTML = '<p class="text-gray-400 text-center">Select a conversation to start chatting</p>';
    inputArea.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  list.innerHTML = conversations.map(c => `
    <button onclick="selectConversation('${c.id}')" class="w-full text-left px-3 py-2 rounded-lg transition ${currentConversation?.id === c.id ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}" style="${currentConversation?.id === c.id ? 'background:#e94560;' : ''}">
      <p class="font-semibold text-sm">${escHtml(c.title || (c.product || c.seller || 'Conversation'))}</p>
      <p class="text-xs text-gray-500">Participants: ${escHtml((c.participants||[]).join(', '))}</p>
    </button>
  `).join('');

  if (currentConversation) {
    header.innerHTML = `<p class="font-bold" style="color:#1a1a2e;">💬 ${escHtml(currentConversation.title || 'Conversation')}</p>`;
    inputArea.classList.remove('hidden');
    renderMessages();
  }
  const msgInput = document.getElementById('message-input');
  if (msgInput && currentConversation) {
    msgInput.placeholder = `Message ${currentConversation.participants && currentConversation.participants.filter(p=>p!==currentUser.name).join(', ') || 'participant'}`;
  }
  try { updateSendButtonState(); } catch (e) {}
}

function renderMessages() {
  const container = document.getElementById('messages-container');
  if (!currentConversation) return;
  container.innerHTML = currentConversation.messages.map(msg => `
    <div class="message-bubble ${msg.sender === currentUser.name ? 'sent' : 'received'}">
      <div class="px-4 py-2 rounded-xl inline-block max-w-xs break-words">
        ${msg.sender !== currentUser.name ? `<div class="text-xs text-gray-500 mb-1">${escHtml(msg.sender)}</div>` : ''}
        <p class="text-sm">${escHtml(msg.text)}</p>
        <p class="text-xs mt-1 opacity-70">${new Date(msg.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
      </div>
    </div>
  `).join('');
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
