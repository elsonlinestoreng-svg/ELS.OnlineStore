// ===== STATE =====
let allProducts = [];
let currentCategory = 'All';
let currentUser = { name: 'User', email: '' };
let selectedImages = []; // array of data URLs
let primaryImageIndex = 0;
let conversations = [];
let currentConversation = null;
let allOrders = [];
let isLogisticsProvider = false;
let logisticsFees = { 'Standard': 5, 'Express': 12, 'Overnight': 25, 'Pickup': 0 };
window.activeUploads = [];

// Ensure `window.API_BASE` is available early so session restore works
if (!window.API_BASE) {
  try {
    if (location && location.protocol === 'file:') {
      window.API_BASE = 'http://localhost:8001/api';
    } else if (location && location.protocol && location.hostname) {
      const port = location.port ? `:${location.port}` : '';
      window.API_BASE = `${location.protocol}//${location.hostname}${port}/api`;
    } else {
      window.API_BASE = 'http://localhost:8001/api';
    }
  } catch (e) {
    window.API_BASE = 'http://localhost:8001/api';
  }
}

const defaultConfig = {
  site_name: 'JovA Marketplace',
  tagline: 'Shop. Sell. Thrive.',
  hero_heading: 'Discover What You Love',
  bg_color: '#f8f6f3',
  surface_color: '#ffffff',
  text_color: '#1a1a2e',
  primary_color: '#e94560',
  secondary_color: '#0f3460',
  font_family: 'Outfit',
  font_size: 16
};

try {
  if (location && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.cloudImageUploadUrl = window.cloudImageUploadUrl || (location.protocol + '//' + location.hostname + ':8001/upload');
    console.info('Defaulting cloudImageUploadUrl to', window.cloudImageUploadUrl);
  }
} catch (e) {}

if (window.elementSdk) {
window.elementSdk.init({
  defaultConfig,
  onConfigChange: async (config) => {
    const bg = config.bg_color || defaultConfig.bg_color;
    const surface = config.surface_color || defaultConfig.surface_color;
    const txt = config.text_color || defaultConfig.text_color;
    const primary = config.primary_color || defaultConfig.primary_color;
    const secondary = config.secondary_color || defaultConfig.secondary_color;
    const font = config.font_family || defaultConfig.font_family;
    const fs = config.font_size || defaultConfig.font_size;
    const siteName = config.site_name || defaultConfig.site_name;
    const tagline = config.tagline || defaultConfig.tagline;
    const heroH = config.hero_heading || defaultConfig.hero_heading;

    document.getElementById('app').style.background = bg;
    document.querySelectorAll('[style*="background:white"], [style*="background: white"]').forEach(el => el.style.background = surface);
    document.querySelectorAll('h2, h3, h4, label, .font-bold').forEach(el => { if (!el.closest('#auth-screen') && !el.closest('#topnav') && !el.closest('#sidebar')) el.style.color = txt; });
    document.querySelectorAll('[style*="background:#e94560"]').forEach(el => el.style.background = primary);
    document.querySelectorAll('[style*="color:#e94560"]').forEach(el => el.style.color = primary);
    document.getElementById('topnav').style.background = secondary;
    document.getElementById('sidebar').style.background = secondary;

    document.body.style.fontFamily = `${font}, Outfit, sans-serif`;
    document.body.style.fontSize = `${fs}px`;

    const authName = document.getElementById('auth-site-name');
    const navName = document.getElementById('nav-site-name');
    const authTag = document.getElementById('auth-tagline');
    const heroEl = document.getElementById('hero-heading');
    if (authName) authName.textContent = siteName;
    if (navName) navName.textContent = siteName;
    if (authTag) authTag.textContent = tagline;
    if (heroEl) heroEl.textContent = heroH;
  },
  mapToCapabilities: (config) => ({
    recolorables: [
      { get: () => config.bg_color || defaultConfig.bg_color, set: (v) => { config.bg_color = v; window.elementSdk.setConfig({ bg_color: v }); } },
      { get: () => config.surface_color || defaultConfig.surface_color, set: (v) => { config.surface_color = v; window.elementSdk.setConfig({ surface_color: v }); } },
      { get: () => config.text_color || defaultConfig.text_color, set: (v) => { config.text_color = v; window.elementSdk.setConfig({ text_color: v }); } },
      { get: () => config.primary_color || defaultConfig.primary_color, set: (v) => { config.primary_color = v; window.elementSdk.setConfig({ primary_color: v }); } },
      { get: () => config.secondary_color || defaultConfig.secondary_color, set: (v) => { config.secondary_color = v; window.elementSdk.setConfig({ secondary_color: v }); } }
    ],
    borderables: [],
    fontEditable: { get: () => config.font_family || defaultConfig.font_family, set: (v) => { config.font_family = v; window.elementSdk.setConfig({ font_family: v }); } },
    fontSizeable: { get: () => config.font_size || defaultConfig.font_size, set: (v) => { config.font_size = v; window.elementSdk.setConfig({ font_size: v }); } }
  }),
  mapToEditPanelValues: (config) => new Map([
    ['site_name', config.site_name || defaultConfig.site_name],
    ['tagline', config.tagline || defaultConfig.tagline],
    ['hero_heading', config.hero_heading || defaultConfig.hero_heading]
  ])
});
}
const dataHandler = {
  onDataChanged(data) {
    allProducts = data.filter(d => d.name && d.price);
    if (typeof renderShop === 'function') renderShop();
    if (typeof renderHomeProducts === 'function') renderHomeProducts();
    if (typeof renderMyProducts === 'function') renderMyProducts();
    try { saveProductsToLocal(); } catch (e) { }
  }
};

function setupHomeCarousel(keywords) {
  try {
    const container = document.getElementById('home-bg-carousel');
    if (!container) return;
    container.innerHTML = '';
    const track = document.createElement('div');
    track.className = 'bg-track';

    const kws = Array.isArray(keywords) && keywords.length ? keywords : ['ecommerce','shopping','storefront','marketplace','products','fashion','electronics','online store'];
    const images = kws.map(k => `https://source.unsplash.com/1600x900/?${encodeURIComponent(k)}`);
    const items = images.concat(images);
    items.forEach(url => {
      const d = document.createElement('div');
      d.className = 'bg-carousel-item';
      d.style.backgroundImage = `linear-gradient(rgba(15,23,42,0.45), rgba(15,23,42,0.45)), url(${url})`;
      track.appendChild(d);
    });
    container.appendChild(track);

    const duration = Math.max(30, images.length * 8);
    track.style.animationDuration = duration + 's';
  } catch (e) {
    console.warn('Carousel init failed', e);
  }
}

window.addEventListener('load', () => {
  setupHomeCarousel();
  try { bindButtonTouchResponses(); } catch (e) { }
  try { initAccessibility(); } catch (e) { }
});

function initAccessibility() {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
  }

  const loader = document.getElementById('loading-overlay');
  if (loader) {
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-live', 'polite');
  }

  document.querySelectorAll('form').forEach((form) => {
    if (!form.hasAttribute('novalidate')) form.setAttribute('novalidate', 'true');
  });

  const passEl = document.getElementById('reg-pass');
  const confirmEl = document.getElementById('reg-confirm-pass');
  if (passEl && confirmEl) {
    passEl.addEventListener('input', updatePasswordStrengthUI);
    confirmEl.addEventListener('input', updatePasswordStrengthUI);
  }

  updatePasswordStrengthUI();
}

function updatePasswordStrengthUI() {
  const passEl = document.getElementById('reg-pass');
  const labelEl = document.getElementById('password-strength-label');
  const meterEl = document.getElementById('password-strength')?.querySelector('div');
  if (!passEl || !labelEl || !meterEl) return;

  const password = passEl.value || '';
  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  const width = Math.min(100, score * 20);
  const [label, color] = score >= 4 ? ['Strong', '#10b981'] : score >= 3 ? ['Good', '#f59e0b'] : score >= 2 ? ['Fair', '#f97316'] : ['Weak', '#ef4444'];

  meterEl.style.width = `${width}%`;
  meterEl.style.backgroundColor = color;
  labelEl.textContent = label;
  labelEl.style.color = color;
}

function setAppLoading(loading, label = 'Loading...') {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  const textEl = overlay.querySelector('[data-loading-text]');
  if (textEl) textEl.textContent = label;
  overlay.classList.toggle('hidden', !loading);
  overlay.classList.toggle('flex', loading);
}

function showUploadModal(count) {
  const modal = document.getElementById('upload-modal');
  if (!modal) return;
  document.getElementById('upload-list').innerHTML = '';
  modal.classList.remove('hidden');
  document.getElementById('upload-cancel-btn').classList.remove('hidden');
  document.getElementById('upload-close-btn').classList.add('hidden');
}

function hideUploadModal() {
  const modal = document.getElementById('upload-modal');
  if (!modal) return;
  document.getElementById('upload-cancel-btn').classList.add('hidden');
  document.getElementById('upload-close-btn').classList.remove('hidden');
  setTimeout(() => { modal.classList.add('hidden'); document.getElementById('upload-list').innerHTML = ''; }, 1400);
}

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'upload-cancel-btn') {
    window.__uploadProgressHandler = null;
    window.activeUploads.forEach(x => {
      try { x.abort(); } catch(e){}
    });

    window.activeUploads = [];
    hideUploadModal();
    showToast('Upload cancelled');
  }
  if (e.target && e.target.id === 'upload-close-btn') {
    document.getElementById('upload-modal').classList.add('hidden');
  }
});

function bindButtonTouchResponses() {
  const selector = '.auth-cta, .hero-cta, .cat-btn, .side-link, .nav-link, .image-upload-area button, .product-card button';
  const nodes = Array.from(document.querySelectorAll(selector));
  nodes.forEach(el => {
    if (el._touchBound) return;
    el._touchBound = true;
    const trigger = (e) => {
      el.classList.remove('button-touch-anim');
      void el.offsetWidth;
      el.classList.add('button-touch-anim');
      if (e.type === 'touchstart') el.focus();
    };
    el.addEventListener('mouseenter', trigger, { passive: true });
    el.addEventListener('touchstart', trigger, { passive: true });
  });
}

function saveProductsToLocal() {
  try {
    localStorage.setItem('els_products', JSON.stringify(allProducts));
  } catch (e) { console.error('saveProductsToLocal failed', e); }
}

function loadProductsFromLocal() {
  try {
    const raw = localStorage.getItem('els_products');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      allProducts = parsed;
      renderShop(); renderHomeProducts(); renderMyProducts();
    }
  } catch (e) { console.error('loadProductsFromLocal failed', e); }
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.remove('hidden');
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.classList.add('hidden');
}

function validateOpenStoreForm() {
  let ok = true;
  const name = document.getElementById('prod-name').value.trim();
  const price = document.getElementById('prod-price').value.trim();
  const category = document.getElementById('prod-category').value.trim();
  const desc = document.getElementById('prod-desc').value.trim();

  if (!name) { showFieldError('err-prod-name', 'Please enter a product name'); ok = false; } else clearFieldError('err-prod-name');
  if (!price || isNaN(Number(price)) || Number(price) <= 0) { showFieldError('err-prod-price', 'Enter a valid price'); ok = false; } else clearFieldError('err-prod-price');
  if (!category) { showFieldError('err-prod-category', 'Select a category'); ok = false; } else clearFieldError('err-prod-category');
  if (!desc || desc.length < 10) { showFieldError('err-prod-desc', 'Description must be at least 10 characters'); ok = false; } else clearFieldError('err-prod-desc');

  return ok;
}

function getSuggestedCategoryText() {
  const name = (document.getElementById('prod-name')||{}).value.toLowerCase();
  const desc = (document.getElementById('prod-desc')||{}).value.toLowerCase();
  const text = `${name} ${desc}`;
  const suggestions = [
    { cat: 'Electronics', keywords: ['phone','headphone','speaker','camera','charger','laptop','smartwatch','wireless','usb','tablet'] },
    { cat: 'Fashion', keywords: ['shirt','dress','shoes','jacket','fashion','accessory','bag','sneaker','jewelry','style'] },
    { cat: 'Home', keywords: ['mug','sofa','pillow','kitchen','home','decor','furniture','lamp','bedding','plate'] },
    { cat: 'Sports', keywords: ['bike','ball','fitness','yoga','exercise','sports','trainer','running','gym','outdoor'] }
  ];
  for (const suggestion of suggestions) {
    if (suggestion.keywords.some(keyword => text.includes(keyword))) return suggestion.cat;
  }
  return '';
}

function updateCategorySuggestion() {
  const suggestionEl = document.getElementById('prod-category-suggestion');
  const categoryEl = document.getElementById('prod-category');
  if (!suggestionEl || !categoryEl) return;
  const currentCategory = categoryEl.value.trim();
  const suggestion = getSuggestedCategoryText();
  if (suggestion && !currentCategory) {
    suggestionEl.classList.remove('hidden');
    suggestionEl.innerHTML = `Suggested category: <button type="button" onclick="acceptSuggestedCategory()" class="font-semibold underline">${suggestion}</button>`;
  } else {
    suggestionEl.classList.add('hidden');
    suggestionEl.innerHTML = 'Suggested category: <button type="button" onclick="acceptSuggestedCategory()" class="font-semibold underline">Use this category</button>';
  }
}

function acceptSuggestedCategory() {
  const suggestion = getSuggestedCategoryText();
  const categoryEl = document.getElementById('prod-category');
  if (categoryEl && suggestion) {
    categoryEl.value = suggestion;
    updateAddProductButtonState();
    updateCategorySuggestion();
  }
}

function updateAddProductButtonState() {
<<<<<<< HEAD:frontend/js/ui.js
  const btn = document.getElementById('add-product-btn');
  const draftBtn = document.getElementById('save-draft-btn');
  const statusEl = document.getElementById('product-publish-status');
  if (!btn) return;
  const valid = validateOpenStoreForm();
  btn.disabled = !valid;
  btn.style.opacity = valid ? '1' : '0.6';
  if (draftBtn) {
    draftBtn.disabled = !valid;
    draftBtn.style.opacity = valid ? '1' : '0.6';
  }
  if (statusEl) {
    const payoutReady = localStorage.getItem('els_payout_ready') === 'true';
    statusEl.textContent = payoutReady
      ? 'Seller payout details are ready. You can save as draft or publish instantly.'
      : 'Add payout details in store setup to enable direct publishing.';
    statusEl.className = payoutReady ? 'text-xs text-emerald-600 mt-3' : 'text-xs text-slate-500 mt-3';
  }
=======
  const saveDraftBtn = document.getElementById('save-draft-btn');
  const publishBtn = document.getElementById('publish-product-btn');
  const valid = validateOpenStoreForm();
  if (saveDraftBtn) { saveDraftBtn.disabled = !valid; saveDraftBtn.style.opacity = valid ? '1' : '0.6'; }
  if (publishBtn) { publishBtn.disabled = !valid; publishBtn.style.opacity = valid ? '1' : '0.6'; }
>>>>>>> zohan-work:js/ui.js
}

// Toggle button loading state: adds small spinner and disables button
function setButtonLoading(btn, loading, label) {
  if(!btn) return;
  if(loading) {
    btn.disabled = true;
    btn._origText = btn._origText || btn.innerHTML;
    const spinner = '<span class="btn-spinner" style="display:inline-block;width:14px;height:14px;margin-right:8px;border:2px solid rgba(0,0,0,0.12);border-top-color:rgba(0,0,0,0.6);border-radius:50%;animation:spin 0.8s linear infinite"></span>';
    btn.innerHTML = (label ? label : '') + spinner + (btn._origText || '');
  } else {
    btn.disabled = false;
    if(btn._origText) btn.innerHTML = btn._origText;
  }
}

// small keyframes for spinner if not already present
try{
  if(!document.getElementById('els-spinner-style')){
    const s = document.createElement('style'); s.id='els-spinner-style'; s.innerHTML='@keyframes spin{to{transform:rotate(360deg)}} .btn-spinner{vertical-align:middle}'; document.head.appendChild(s);
  }
}catch(e){}

(function wireOpenStoreValidation(){
  const ids = ['prod-name','prod-price','prod-category','prod-desc'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      updateAddProductButtonState();
      updateCategorySuggestion();
    });
    el.addEventListener('change', () => {
      updateAddProductButtonState();
      updateCategorySuggestion();
    });
  });
  setTimeout(() => {
    updateAddProductButtonState();
    updateCategorySuggestion();
  }, 200);
})();

function switchAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const regLogo = document.getElementById('register-logo');
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');

  if (tab === 'login') {
    loginForm.classList.remove('hidden'); loginForm.setAttribute('aria-hidden', 'false');
    registerForm.classList.add('hidden'); registerForm.setAttribute('aria-hidden', 'true');
    regLogo.classList.add('hidden');
    loginTab.classList.add('text-white'); loginTab.classList.remove('text-gray-400'); loginTab.setAttribute('aria-pressed','true');
    registerTab.classList.remove('text-white'); registerTab.classList.add('text-gray-400'); registerTab.setAttribute('aria-pressed','false');
    setTimeout(()=>document.getElementById('login-email')?.focus(), 80);
  } else {
    loginForm.classList.add('hidden'); loginForm.setAttribute('aria-hidden', 'true');
    registerForm.classList.remove('hidden'); registerForm.setAttribute('aria-hidden', 'false');
    regLogo.classList.remove('hidden');
    registerTab.classList.add('text-white'); registerTab.classList.remove('text-gray-400'); registerTab.setAttribute('aria-pressed','true');
    loginTab.classList.remove('text-white'); loginTab.classList.add('text-gray-400'); loginTab.setAttribute('aria-pressed','false');
    setTimeout(()=>document.getElementById('reg-name')?.focus(), 80);
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const role = document.getElementById('login-role')?.value || 'buyer';
  const region = document.getElementById('login-region')?.value || 'global';
  const rememberMe = Boolean(document.getElementById('remember-login')?.checked);

  if (!email || !password) {
    showToast('Please enter email and password');
    return;
  }

  try {
    setAppLoading(true, 'Signing you in...');
    setButtonLoading(document.querySelector('#login-form button[type="submit"]'), true, 'Signing in');
    showToast('Logging in...', 'loading');
    const response = await fetch(window.API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        role,
        region,
        provider: /@gmail\.com$/i.test(email) ? 'gmail' : 'email'
      })
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      showToast(`Login failed: ${response.status} ${text}`, 'error');
      return;
    }

    if (!data.success) {
      showToast(data.message || 'Login failed', 'error');
      return;
    }

    const userPayload = {
      ...(data.user || {}),
      role: (data.user && data.user.role) || role,
      region: (data.user && data.user.region) || region,
      provider: (data.user && data.user.provider) || (/@gmail\.com$/i.test(email) ? 'gmail' : 'email')
    };

    persistAuthSession(userPayload, data.token, rememberMe);
    enterApp();
  } catch (err) {
    console.error('Login error:', err);
    const attempted = window.API_BASE || 'http://localhost:8001/api';
    showToast(`Connection error to ${attempted}. Is the backend running?`, 'error');
  } finally {
    setAppLoading(false);
    setButtonLoading(document.querySelector('#login-form button[type="submit"]'), false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-pass').value;
  const confirmPassword = document.getElementById('reg-confirm-pass').value;
  const rememberMe = Boolean(document.getElementById('remember-register')?.checked);
  const role = 'buyer';
  const region = 'global';
  const provider = /@gmail\.com$/i.test(email) ? 'gmail' : 'email';

  if (!name || !email || !password || !confirmPassword) {
    showToast('Please fill all fields');
    return;
  }

  if (password !== confirmPassword) {
    showToast('Passwords do not match');
    return;
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters');
    return;
  }

  try {
    setAppLoading(true, 'Creating your account...');
    setButtonLoading(document.querySelector('#register-form button[type="submit"]'), true, 'Creating account');
    showToast('Creating account...', 'loading');
    const response = await fetch(window.API_BASE + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, confirmPassword, role, region, provider })
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      showToast(`Registration failed: ${response.status} ${text}`, 'error');
      return;
    }

    if (!data.success) {
      showToast(data.message || 'Registration failed', 'error');
      return;
    }

    const userPayload = {
      ...(data.user || {}),
      role: (data.user && data.user.role) || role,
      region: (data.user && data.user.region) || region,
      provider: (data.user && data.user.provider) || provider
    };

    persistAuthSession(userPayload, data.token, rememberMe);
    showToast('Account created successfully!', 'success');
    enterApp();
  } catch (err) {
    console.error('Register error:', err);
    const attempted = window.API_BASE || 'http://localhost:8001/api';
    showToast(`Connection error to ${attempted}. Is the backend running?`, 'error');
  } finally {
    setAppLoading(false);
    setButtonLoading(document.querySelector('#register-form button[type="submit"]'), false);
  }
}

function enterApp(targetPage = 'home') {
  const authScreen = document.getElementById('auth-screen');
  const mainApp = document.getElementById('main-app');
  if (authScreen) authScreen.classList.add('hidden');
  if (mainApp) mainApp.classList.remove('hidden');
  const avatar = document.getElementById('user-avatar');
  if (avatar) avatar.textContent = (currentUser.name || currentUser.email || 'U').charAt(0).toUpperCase();
  lucide.createIcons();
  loadProductsFromBackend();
  updateCartBadge();
  const role = (currentUser.role || 'buyer').toLowerCase();
  if (role === 'seller') {
    goTo('open-store');
  } else {
    goTo(targetPage);
  }
  showToast('Welcome, ' + (currentUser.name || currentUser.email) + '!');
}

function handleLogout() {
  localStorage.removeItem('els_token');
  localStorage.removeItem('els_user');
  sessionStorage.removeItem('els_token');
  sessionStorage.removeItem('els_user');
  currentUser = { name: 'User', email: '' };
  window.currentUser = currentUser;
  
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  toggleSidebar();
  conversations = [];
  currentConversation = null;
  
  const badge = document.getElementById('cart-badge');
  if (badge) badge.classList.add('hidden');
  
  document.getElementById('login-form').reset();
  document.getElementById('register-form').reset();
  switchAuthTab('login');
  goTo('home');
  showToast('Logged out successfully');
}

function goTo(page) {
  if (page === 'open-store') page = 'merchant';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.nav === page);
    l.style.color = l.dataset.nav === page ? 'white' : '#d1d5db';
  });
  document.querySelectorAll('.side-link').forEach(l => {
    l.classList.toggle('active', l.dataset.nav === page);
    l.style.color = l.dataset.nav === page ? 'white' : '#d1d5db';
  });

  const mobileSidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (mobileSidebar) mobileSidebar.classList.remove('open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('open');

  if (page === 'cart') renderCart();
  if (page === 'payment') renderPayment();
  if (page === 'shop') renderShop();
  if (page === 'messages') renderConversations();
<<<<<<< HEAD:frontend/js/ui.js
  if (page === 'my-store') { if (window.MyStore) window.MyStore.init(); }
  if (page === 'orders') { if (typeof loadBuyerOrders === 'function') loadBuyerOrders(); }
  window.scrollTo(0, 0);
=======
  window.scrollTo({ top: 0, behavior: 'smooth' });
>>>>>>> zohan-work:js/ui.js
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;
  const isOpen = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  overlay.classList.toggle('open', !isOpen);
}

<<<<<<< HEAD:frontend/js/ui.js
function showToast(msg, type = 'info', duration = 2600) {
=======
document.addEventListener('DOMContentLoaded', () => {
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (sidebarToggle) sidebarToggle.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSidebar();
  });
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);
  document.addEventListener('click', (event) => {
    const sidebar = document.getElementById('sidebar');
    const isOpen = sidebar && sidebar.classList.contains('open');
    if (!isOpen) return;
    const insideSidebar = sidebar.contains(event.target);
    const toggleButton = document.getElementById('sidebar-toggle');
    if (toggleButton && toggleButton.contains(event.target)) return;
    if (!insideSidebar) toggleSidebar();
  });
});

function showToast(msg) {
>>>>>>> zohan-work:js/ui.js
  const t = document.getElementById('toast');
  if (!t) return;
  const normalizedType = ['success', 'error', 'loading', 'info'].includes(type) ? type : 'info';
  t.className = `toast-msg ${normalizedType}`;
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.add('hidden'), duration);
}

function persistAuthSession(user, token, rememberMe = true) {
  const safeUser = { ...(user || {}), role: user?.role || 'buyer', region: user?.region || 'global', provider: user?.provider || 'email' };
  if (rememberMe) {
    localStorage.setItem('els_token', token);
    localStorage.setItem('els_user', JSON.stringify(safeUser));
  } else {
    sessionStorage.setItem('els_token', token);
    sessionStorage.setItem('els_user', JSON.stringify(safeUser));
    localStorage.removeItem('els_token');
    localStorage.removeItem('els_user');
  }
  currentUser = safeUser;
  window.currentUser = safeUser;
}

function escHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

function initHomeCarousel(images = [], speedPerImage = 6) {
  const container = document.getElementById('home-bg-carousel');
  if (!container) return;
  const imgs = (window.HOME_CAROUSEL_IMAGES && window.HOME_CAROUSEL_IMAGES.length) ? window.HOME_CAROUSEL_IMAGES : (images.length ? images : [
    'https://source.unsplash.com/1600x900/?ecommerce,shopping',
    'https://source.unsplash.com/1600x900/?store,products',
    'https://source.unsplash.com/1600x900/?marketplace,shop',
    'https://source.unsplash.com/1600x900/?retail,storefront',
    'https://source.unsplash.com/1600x900/?shopping,online',
    'https://source.unsplash.com/1600x900/?product,display'
  ]);

  container.innerHTML = '';
  const track = document.createElement('div'); track.className = 'bg-track';
  const all = imgs.concat(imgs);
  all.forEach(src => {
    const it = document.createElement('div'); it.className = 'bg-carousel-item';
    it.style.backgroundImage = `url('${src}')`;
    track.appendChild(it);
  });
  container.appendChild(track);

  const duration = Math.max(8, imgs.length * speedPerImage);
  track.style.animationDuration = duration + 's';
}

// Restore session from localStorage on page load
async function restoreSession() {

<<<<<<< HEAD:frontend/js/ui.js
  const token = localStorage.getItem('els_token') || sessionStorage.getItem('els_token');
  const savedUser = localStorage.getItem('els_user') || sessionStorage.getItem('els_user');
=======
  const token = localStorage.getItem('els_token');
  const userData = localStorage.getItem('els_user');
  const apiBase = window.API_BASE || 'http://localhost:8001/api';
>>>>>>> zohan-work:js/ui.js

  if (!token || !savedUser) return false;

  try {

    const response = await fetch(`${apiBase}/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });

    const data = await response.json();

    if (!data.success) {
      localStorage.removeItem('els_token');
      localStorage.removeItem('els_user');
      sessionStorage.removeItem('els_token');
      sessionStorage.removeItem('els_user');
      return false;
    }

    const parsedUser = JSON.parse(savedUser);
    currentUser = parsedUser;
    window.currentUser = parsedUser;

    enterApp();

    return true;

  } catch (err) {

    console.error('Session restore failed:', err);

    localStorage.removeItem('els_token');
    localStorage.removeItem('els_user');
    sessionStorage.removeItem('els_token');
    sessionStorage.removeItem('els_user');

    return false;

  }

}

document.addEventListener('DOMContentLoaded', async () => {

  initHomeCarousel();

  try {

    const sessionRestored = await restoreSession();

    if (sessionRestored) {
      loadProductsFromLocal();
    }

  } catch (e) {

    console.error('Failed loading products:', e);

  }

});

(async () => {
  if (!window.dataSdk) {
    console.warn('dataSdk not found');
    return;
  }

  const r = await window.dataSdk.init(dataHandler);

  if (!r.isOk) {
    console.error('Data SDK init failed');
  }
})();

// Contact Form Handler
function handleContact(e) {
  e.preventDefault();
  const form = document.getElementById('contact-form');
  const success = document.getElementById('contact-success');
  const nameInput = document.getElementById('contact-name');
  const emailInput = document.getElementById('contact-email');
  const messageInput = document.getElementById('contact-msg');

  if (!form || !nameInput || !emailInput || !messageInput) return;

  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const message = messageInput.value.trim();

  if (!name || !email || !message) {
    showToast('Please fill all fields');
    return;
  }

  const alertPayload = {
    id: `contact-${Date.now()}`,
    name,
    email,
    subject: 'Carrier logistics notification',
    message,
    createdAt: new Date().toISOString(),
    source: 'contact'
  };

  try {
    const existingAlerts = JSON.parse(localStorage.getItem('els_logistics_alerts') || '[]');
    existingAlerts.unshift(alertPayload);
    localStorage.setItem('els_logistics_alerts', JSON.stringify(existingAlerts.slice(0, 20)));
    localStorage.setItem('els_latest_logistics_alert', JSON.stringify(alertPayload));

    if (typeof window.dispatchContactToLogistics === 'function') {
      window.dispatchContactToLogistics(alertPayload);
    } else if (typeof window.startLogisticsLiveStream === 'function') {
      window.startLogisticsLiveStream(alertPayload);
    }

    form.style.display = 'none';
    if (success) success.classList.remove('hidden');
    form.reset();
    showToast('Carrier alert sent to logistics');

    if (typeof goTo === 'function') {
      setTimeout(() => goTo('logistics'), 250);
    }
  } catch (err) {
    console.error('Failed to dispatch logistics alert', err);
    showToast('Could not send alert right now');
  }
}

// Logistics Role Toggle
function toggleLogisticsRole() {
  const btn = document.querySelector('[onclick="toggleLogisticsRole()"]');
  if (!btn) return;
  
  const currentRole = btn.textContent.includes('Buyer') ? 'buyer' : 'seller';
  const newRole = currentRole === 'buyer' ? 'seller' : 'buyer';
  
  btn.textContent = newRole === 'buyer' ? 'Switch to Seller' : 'Switch to Buyer';
  showToast(`Switched to ${newRole} mode`);
  console.log(`Current logistics role: ${newRole}`);
}

// Send Message Handler
function sendMessage() {
  const input = document.getElementById('msg-input');
  if (!input || !input.value.trim()) {
    showToast('Message cannot be empty');
    return;
  }

  const msg = input.value.trim();
  
  if (!currentConversation) {
    showToast('Select a conversation first');
    return;
  }

  // Add message to current conversation
  if (!currentConversation.messages) {
    currentConversation.messages = [];
  }

  currentConversation.messages.push({
    sender: currentUser.name,
    text: msg,
    timestamp: new Date().toLocaleTimeString()
  });

  input.value = '';
  
  // Re-render messages
  if (typeof renderMessageContent === 'function') {
    renderMessageContent();
  }
  
  showToast('Message sent');
}

