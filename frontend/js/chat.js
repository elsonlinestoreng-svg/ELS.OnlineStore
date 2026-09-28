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
