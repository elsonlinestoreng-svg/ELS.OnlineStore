// load persisted user profile if present
function loadUserFromLocal() {
  try {
    const raw = localStorage.getItem('els_user');
    if (!raw) return;
    const u = JSON.parse(raw);
    if (u && u.name) {
      currentUser = Object.assign({}, currentUser, u);
      // update header avatar consistently
      try { updateHeaderAvatar(); } catch (e) {}
      // Auto-enter the app if we have a persisted user (remembered)
      if ((u.password && u.password.length) || u.__serverId) {
        try { enterApp(); } catch(e) {}
      }
    }
  } catch (e) { console.warn('loadUserFromLocal failed', e); }
}
loadUserFromLocal();

function updateHeaderAvatar() {
  const avatarImg = document.getElementById('user-avatar-img');
  const avatarInitial = document.getElementById('user-avatar-initial');
  const avatarBtn = document.getElementById('user-avatar');
  if (!avatarBtn) return;
  if (avatarImg && currentUser.avatarDataUrl) {
    avatarImg.src = currentUser.avatarDataUrl;
    avatarImg.classList.remove('hidden');
    if (avatarInitial) avatarInitial.classList.add('hidden');
  } else {
    if (avatarInitial && currentUser.name) avatarInitial.textContent = currentUser.name.charAt(0).toUpperCase();
    if (avatarImg) avatarImg.classList.add('hidden');
    if (avatarInitial) avatarInitial.classList.remove('hidden');
  }
}

// Try to load a persisted user by email; returns true if loaded
function loadUserIfExists(email) {
  try {
    const raw = localStorage.getItem('els_user');
    if (!raw) return false;
    const u = JSON.parse(raw);
    if (u && u.email && String(u.email).toLowerCase() === String(email).toLowerCase()) {
      currentUser = Object.assign({}, currentUser, u);
      try { updateHeaderAvatar(); } catch(e) {}
      try { renderProfile(); } catch(e) {}
      return true;
    }
  } catch (e) { console.warn('loadUserIfExists failed', e); }
  return false;
}


// ===== PROFILE =====
function renderProfile() {
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');
  const bioEl = document.getElementById('profile-bio');
  if (nameEl) nameEl.value = currentUser.name || '';
  if (emailEl) emailEl.value = currentUser.email || '';
  if (bioEl) bioEl.value = currentUser.bio || '';
  // show avatar preview on profile page
  const preview = document.getElementById('profile-avatar-preview-page');
  const placeholder = document.getElementById('profile-avatar-placeholder-page');
  if (preview && placeholder) {
    if (currentUser.avatarDataUrl) { preview.src = currentUser.avatarDataUrl; preview.classList.remove('hidden'); placeholder.classList.add('hidden'); }
    else { preview.classList.add('hidden'); placeholder.classList.remove('hidden'); placeholder.textContent = (currentUser.name||'').charAt(0).toUpperCase() || 'U'; }
  }
}

async function saveProfile(e) {
  e.preventDefault();
  const name = (document.getElementById('profile-name')?.value || '').trim();
  const email = (document.getElementById('profile-email')?.value || '').trim();
  const bio = (document.getElementById('profile-bio')?.value || '').trim();
  if (!name) return showToast('Please enter a display name');
  currentUser.name = name; currentUser.email = email; currentUser.bio = bio;
  // check for avatar uploaded on profile page
  try {
    const avatarTemp = document.getElementById('profile-form')?.dataset?.avatarTemp;
    if (avatarTemp) {
      // If cloud upload is configured, attempt to upload and store a remote URL
      if (window.cloudImageUploadUrl || window.CLOUD_IMAGE_UPLOAD_URL || typeof window.cloudImageUploadHandler === 'function' || window.FIREBASE_CONFIG) {
        showToast('Uploading avatar...');
        try {
          const remote = await uploadImageToCloud(avatarTemp);
          if (remote) currentUser.avatarDataUrl = remote; else currentUser.avatarDataUrl = avatarTemp;
        } catch (err) {
          console.warn('avatar upload failed', err);
          currentUser.avatarDataUrl = avatarTemp;
          showToast('Avatar upload failed — saved locally');
        }
      } else {
        // no cloud configured — save data URL locally
        currentUser.avatarDataUrl = avatarTemp;
      }
      // remove temp dataset after consuming
      try { delete document.getElementById('profile-form').dataset.avatarTemp; } catch(e){}
    }
  } catch(e) { console.warn('avatar check failed', e); }

  try { localStorage.setItem('els_user', JSON.stringify(currentUser)); } catch(e){ /* ignore */ }
  try { updateHeaderAvatar(); } catch(e) {}
  try { renderProfile(); } catch(e) {}
  showToast('Profile saved');
  goTo('home');
}

// Modal handlers
// profile modal removed — UI uses profile page instead

function handleProfileAvatarInput(ev) {
  const f = ev?.target?.files?.[0];
  if (!f) return;
  if (!f.type.startsWith('image/')) return showToast('Please select an image file');
  const maxSize = 2 * 1024 * 1024; // 2MB
  if (f.size > maxSize) return showToast('Avatar too large — max 2MB');
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      let dataUrl = e.target.result;
      // compress avatar to keep localStorage size reasonable
      try { dataUrl = await compressImageDataUrl(dataUrl, { maxDim: 800, targetBytes: 150 * 1024 }); } catch (err) { /* ignore compression failure - use original */ }
      const preview = document.getElementById('profile-avatar-preview-page');
      const placeholder = document.getElementById('profile-avatar-placeholder-page');
      if (preview && placeholder) { preview.src = dataUrl; preview.classList.remove('hidden'); placeholder.classList.add('hidden'); }
      const form = document.getElementById('profile-form'); if (form) form.dataset.avatarTemp = dataUrl;
    } catch (err) {
      console.error('Avatar processing failed', err);
      showToast('Failed to process avatar');
    }
  };
  reader.readAsDataURL(f);
}

function clearProfileAvatarPreviewPage() {
  const preview = document.getElementById('profile-avatar-preview-page'); if (preview) preview.classList.add('hidden');
  const placeholder = document.getElementById('profile-avatar-placeholder-page'); if (placeholder) placeholder.classList.remove('hidden');
  const form = document.getElementById('profile-form'); if (form) delete form.dataset.avatarTemp;
}

// modal save removed — profile page save handles persistence

async function sendMessage() {
  const input = document.getElementById('message-input');
  const btn = document.getElementById('send-btn');
  if (!input || !btn) return;
  const text = input.value.trim();
  if (!text || !currentConversation) return;

  const msg = { sender: currentUser.name, text: text, time: new Date().toISOString() };

  // If realtime (Firestore) is configured, write to Firestore and let onSnapshot update local state
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

  // If this is an order conversation and the sender is logistics, optionally add a system update
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

// Wire up Enter-to-send and input state handling
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