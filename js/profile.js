// ============================================================================
// MODULE 1: USER PROFILE PERSISTENCE & IDENTITY LAYER
// ============================================================================

/**
 * Loads the persisted user profile from local storage if present.
 */
function loadUserFromLocal() {
  try {
    const raw = localStorage.getItem('els_user');
    if (!raw) return;

    const u = JSON.parse(raw);
    if (u && u.name) {
      currentUser = Object.assign({}, currentUser, u);
      
      // Update header avatar consistently
      try { updateHeaderAvatar(); } catch (e) {}
      
      // Auto-enter the app if we have a persisted user (remembered)
      if ((u.password && u.password.length) || u.__serverId) {
        try { enterApp(); } catch (e) {}
      }
    }
  } catch (e) { 
    console.warn('loadUserFromLocal failed', e); 
  }
}
loadUserFromLocal();

/**
 * Syncs current authentication identities with header avatar DOM elements.
 */
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
    if (avatarInitial && currentUser.name) {
      avatarInitial.textContent = currentUser.name.charAt(0).toUpperCase();
    }
    if (avatarImg) avatarImg.classList.add('hidden');
    if (avatarInitial) avatarInitial.classList.remove('hidden');
  }
}

/**
 * Attempts to pull a specific historical identity node via an email anchor filter.
 * @returns {boolean} True if identity matched and loaded successfully.
 */
function loadUserIfExists(email) {
  try {
    const raw = localStorage.getItem('els_user');
    if (!raw) return false;

    const u = JSON.parse(raw);
    const hasValidEmail = u && u.email;
    const isTargetEmail = String(hasValidEmail ? u.email : '').toLowerCase() === String(email).toLowerCase();

    if (isTargetEmail) {
      currentUser = Object.assign({}, currentUser, u);
      try { updateHeaderAvatar(); } catch (e) {}
      try { renderProfile(); } catch (e) {}
      return true;
    }
  } catch (e) { 
    console.warn('loadUserIfExists failed', e); 
  }
  return false;
}

/**
 * Renders user meta context configuration values into inputs.
 */
function renderProfile() {
  const nameEl = document.getElementById('profile-name');
  const emailEl = document.getElementById('profile-email');
  const bioEl = document.getElementById('profile-bio');

  if (nameEl) nameEl.value = currentUser.name || '';
  if (emailEl) emailEl.value = currentUser.email || '';
  if (bioEl) bioEl.value = currentUser.bio || '';
  
  // Show avatar preview on profile page
  const preview = document.getElementById('profile-avatar-preview-page');
  const placeholder = document.getElementById('profile-avatar-placeholder-page');

  if (preview && placeholder) {
    if (currentUser.avatarDataUrl) { 
      preview.src = currentUser.avatarDataUrl; 
      preview.classList.remove('hidden'); 
      placeholder.classList.add('hidden'); 
    } else { 
      preview.classList.add('hidden'); 
      placeholder.classList.remove('hidden'); 
      placeholder.textContent = (currentUser.name || '').charAt(0).toUpperCase() || 'U'; 
    }
  }
}

/**
 * Serializes mutations to localStorage metadata nodes securely.
 */
async function saveProfile(e) {
  e.preventDefault();
  const name = (document.getElementById('profile-name')?.value || '').trim();
  const email = (document.getElementById('profile-email')?.value || '').trim();
  const bio = (document.getElementById('profile-bio')?.value || '').trim();

  if (!name) return showToast('Please enter a display name');
  currentUser.name = name; 
  currentUser.email = email; 
  currentUser.bio = bio;

  // Check for avatar uploaded on profile page
  try {
    const avatarTemp = document.getElementById('profile-form')?.dataset?.avatarTemp;
    if (avatarTemp) {
      // If cloud upload is configured, attempt to upload and store a remote URL
      const isCloudConfigured = window.cloudImageUploadUrl || 
                                window.CLOUD_IMAGE_UPLOAD_URL || 
                                typeof window.cloudImageUploadHandler === 'function' || 
                                window.FIREBASE_CONFIG;

      if (isCloudConfigured) {
        showToast('Uploading avatar...');
        try {
          const remote = await uploadImageToCloud(avatarTemp);
          currentUser.avatarDataUrl = remote ? remote : avatarTemp;
        } catch (err) {
          console.warn('avatar upload failed', err);
          currentUser.avatarDataUrl = avatarTemp;
          showToast('Avatar upload failed — saved locally');
        }
      } else {
        // No cloud configured — save data URL locally
        currentUser.avatarDataUrl = avatarTemp;
      }
      // Remove temp dataset after consuming
      try { delete document.getElementById('profile-form').dataset.avatarTemp; } catch (e) {}
    }
  } catch (e) { 
    console.warn('avatar check failed', e); 
  }

  try { localStorage.setItem('els_user', JSON.stringify(currentUser)); } catch (e) {}
  try { updateHeaderAvatar(); } catch (e) {}
  try { renderProfile(); } catch (e) {}

  showToast('Profile saved');
  goTo('home');
}

/**
 * Handles profile image file inputs and manages size bounds constraints.
 */
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
      
      // Compress avatar to keep localStorage size reasonable
      try { 
        dataUrl = await compressImageDataUrl(dataUrl, { maxDim: 800, targetBytes: 150 * 1024 }); 
      } catch (err) { /* ignore compression failure - use original */ }

      const preview = document.getElementById('profile-avatar-preview-page');
      const placeholder = document.getElementById('profile-avatar-placeholder-page');

      if (preview && placeholder) { 
        preview.src = dataUrl; 
        preview.classList.remove('hidden'); 
        placeholder.classList.add('hidden'); 
      }

      const form = document.getElementById('profile-form'); 
      if (form) form.dataset.avatarTemp = dataUrl;
    } catch (err) {
      console.error('Avatar processing failed', err);
      showToast('Failed to process avatar');
    }
  };
  reader.readAsDataURL(f);
}

/**
 * Flushes intermediate memory streams and file paths.
 */
function clearProfileAvatarPreviewPage() {
  const preview = document.getElementById('profile-avatar-preview-page'); 
  if (preview) preview.classList.add('hidden');

  const placeholder = document.getElementById('profile-avatar-placeholder-page'); 
  if (placeholder) placeholder.classList.remove('hidden');

  const form = document.getElementById('profile-form'); 
  if (form) delete form.dataset.avatarTemp;
}


// ============================================================================
// MODULE 2: MERCHANT STORE ALLOCATIONS & FORM PIPELINE
// ============================================================================

/**
 * Handles raw multipart binary multi-tenant uploads.
 */
async function uploadFileToServer(file) {
  if (!file) return null;
  try {
    const fd = new FormData(); 
    fd.append('file', file);

    const baseEndpoint = (window.API_BASE || 'http://localhost:8001/api').replace('/api', '');
    const res = await fetch(baseEndpoint + '/upload', { method: 'POST', body: fd });
    if (!res.ok) return null;

    const data = await res.json(); 
    return data.url || null;
  } catch (e) { 
    console.error('upload failed', e); 
    return null; 
  }
}

/**
 * Maps input values to localized store records using a prefix lookup.
 */
function collectStoreFormPayload(prefix = '') {
  const name = (document.getElementById(prefix + 'store-name') || {}).value || '';
  const desc = (document.getElementById(prefix + 'store-description') || {}).value || '';
  
  const bankName = (
    document.getElementById(prefix + 'bank-name') || 
    document.getElementById(prefix + 'open-store-bank-name') || {}
  ).value || '';
  
  const bankAccountName = (
    document.getElementById(prefix + 'bank-account-name') || 
    document.getElementById(prefix + 'open-store-bank-account-name') || {}
  ).value || '';
  
  const bankAccountNumber = (
    document.getElementById(prefix + 'bank-account-number') || 
    document.getElementById(prefix + 'open-store-bank-account-number') || {}
  ).value || '';
  
  const logoFile = (
    document.getElementById(prefix + 'store-logo') || 
    document.getElementById(prefix + 'open-store-logo') || {}
  ).files?.[0] || null;
  
  const bannerFile = (
    document.getElementById(prefix + 'store-banner') || 
    document.getElementById(prefix + 'open-store-banner') || {}
  ).files?.[0] || null;

  return { name, desc, bankName, bankAccountName, bankAccountNumber, logoFile, bannerFile };
}

/**
 * Generates or posts new multi-tenant merchant store registration schema payloads.
 */
async function createStoreRecord(payload, btn) {
  if (!payload.name || !payload.bankName || !payload.bankAccountName || !payload.bankAccountNumber) { 
    showToast('Please fill required fields'); 
    return false; 
  }

  let logoUrl = null;
  let bannerUrl = null;

  try { 
    if (payload.logoFile) logoUrl = await uploadFileToServer(payload.logoFile); 
    if (payload.bannerFile) bannerUrl = await uploadFileToServer(payload.bannerFile); 
  } catch (e) { 
    console.warn('image upload failed', e); 
  }

  const storePayload = { 
    store_name: payload.name, 
    description: payload.desc, 
    bank_account_name: payload.bankAccountName, 
    bank_account_number: payload.bankAccountNumber, 
    bank_name: payload.bankName, 
    logo_url: logoUrl, 
    banner_url: bannerUrl 
  };

  try {
    if (btn) { 
      btn.disabled = true; 
      btn._origHtml = btn._origHtml || btn.innerHTML; 
      btn.innerHTML = 'Saving...'; 
    }

    // Local Sandboxed Storage Strategy Fallback
    if (window.localSdk && window.localSdk.stores) {
      const activeUser = window.currentUser || JSON.parse(localStorage.getItem('els_user') || 'null') || {};
      const store = Object.assign({}, storePayload, { 
        _id: 's-' + Date.now().toString(36), 
        created_at: new Date().toISOString(), 
        owner_email: activeUser?.email || activeUser?.name || 'seller' 
      });

      const stores = JSON.parse(localStorage.getItem('local_stores_v1') || '[]'); 
      stores.push(store); 
      localStorage.setItem('local_stores_v1', JSON.stringify(stores));

      if (btn) { 
        btn.disabled = false; 
        btn.innerHTML = btn._origHtml; 
      }
      showToast('Store created successfully (local)');

      try { 
        localStorage.setItem('els_user', JSON.stringify(Object.assign({}, activeUser, { 
          store_id: store._id, 
          store_name: store.store_name 
        }))); 
      } catch (e) {}

      renderOpenStoreStatus();

      try { 
        goTo('my-store'); 
        if (window.MyStore && typeof window.MyStore.init === 'function') window.MyStore.init(); 
      } catch (e) {}

      return true;
    }

    // Live Server Endpoint Connection Strategy
    const token = localStorage.getItem('els_token') || '';
    const res = await fetch(`${window.API_BASE || 'http://localhost:8001/api'}/stores`, {
      method: 'POST', 
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': token ? `Bearer ${token}` : '' 
      }, 
      body: JSON.stringify(storePayload)
    });

    const data = await res.json();

    if (!res.ok) { 
      if (btn) { 
        btn.disabled = false; 
        btn.innerHTML = btn._origHtml; 
      } 
      showToast(data.message || 'Failed to create store'); 
      console.error('store create failed', data); 
      return false; 
    }

    if (btn) { 
      btn.disabled = false; 
      btn.innerHTML = btn._origHtml; 
    }

    showToast('Store created successfully');
    renderOpenStoreStatus();

    try { 
      goTo('my-store'); 
      if (window.MyStore && typeof window.MyStore.init === 'function') window.MyStore.init(); 
    } catch (e) {}

    return true;
  } catch (e) { 
    console.error('create store error', e); 
    showToast('Connection error while creating store'); 
    if (btn) { 
      btn.disabled = false; 
      btn.innerHTML = btn._origHtml; 
    } 
    return false; 
  }
}

async function submitCreateStore(e) {
  if (e) e.preventDefault();
  const payload = collectStoreFormPayload();
  const btn = document.getElementById('btn-submit-store');
  await createStoreRecord(payload, btn);
}

async function submitOpenStoreCreate(e) {
  if (e) e.preventDefault();
  const payload = collectStoreFormPayload('open-store-');
  const btn = document.getElementById('open-store-submit-btn');
  await createStoreRecord(payload, btn);
}

/**
 * Updates UI layout container segments based on the current registration status.
 */
function renderOpenStoreStatus() {
  const status = document.getElementById('open-store-status');
  if (!status) return;

  const raw = localStorage.getItem('local_stores_v1');
  const stores = raw ? JSON.parse(raw) : [];
  const me = JSON.parse(localStorage.getItem('els_user') || 'null');
  const mine = stores.filter(s => String(s.owner_email || '').toLowerCase() === String((me?.email || me?.name || '').toLowerCase()));

  if (mine.length) {
    const store = mine[mine.length - 1];
    status.innerHTML = `
      <div class="rounded-2xl bg-slate-50 p-4 text-slate-700">
        <p class="font-semibold text-slate-900">${store.store_name}</p>
        <p class="text-sm mt-1">${store.description || 'Your newly created store is ready.'}</p>
        <p class="text-xs text-slate-500 mt-3">Bank: ${store.bank_name} • ${store.bank_account_name}</p>
      </div>
      <div class="rounded-2xl bg-slate-50 p-4 text-slate-700">
        <p class="text-sm font-semibold">Next steps</p>
        <ul class="mt-2 text-slate-600 list-disc list-inside">
          <li>List your first product</li>
          <li>Choose the right product category</li>
          <li>Send orders for delivery</li>
        </ul>
      </div>`;
  } else {
    status.innerHTML = `
      <p>No store created yet. Create your store to start selling directly from this page.</p>
      <div class="rounded-2xl bg-slate-50 p-4">
        <p class="text-slate-500">Store setup is required before listing products. Once your store is live, your products will be grouped into category pages automatically.</p>
      </div>`;
  }
}

// Global Core UI Event Listener Injections
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('create-store-form'); 
  if (form) form.addEventListener('submit', submitCreateStore);

  const openForm = document.getElementById('open-store-create-form'); 
  if (openForm) openForm.addEventListener('submit', submitOpenStoreCreate);

  renderOpenStoreStatus();
});


// ============================================================================
// MODULE 3: MESSAGING INTERFACE ORCHESTRATION
// ============================================================================

/**
 * Writes messages out across dynamic remote communication channels.
 */
async function sendMessage() {
  const input = document.getElementById('message-input');
  const btn = document.getElementById('send-btn');
  if (!input || !btn) return;

  const text = input.value.trim();
  if (!text || !currentConversation) return;

  const msg = { sender: currentUser.name, text: text, time: new Date().toISOString() };

  // Realtime Data Layer Sync Strategy
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

  // Sync timeline streams if sender acts as a courier driver node
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

/**
 * Adjusts structural visual indicators for the thread submission target CTA.
 */
function updateSendButtonState() {
  const input = document.getElementById('message-input');
  const btn = document.getElementById('send-btn');
  if (!btn || !input) return;

  const disabled = !input.value.trim() || !currentConversation;
  btn.disabled = disabled;
  btn.style.opacity = disabled ? '0.6' : '1';
  btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}

/**
 * Isolated contextual input processing configuration execution block.
 */
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