// ===== MESSAGING =====
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
  // start realtime listener if configured
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
  // ensure message input placeholder reflects participants
  const msgInput = document.getElementById('message-input');
  if (msgInput && currentConversation) {
    msgInput.placeholder = `Message ${currentConversation.participants && currentConversation.participants.filter(p=>p!==currentUser.name).join(', ') || 'participant'}`;
  }
  // ensure send button reflects current state
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