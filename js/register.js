// ===== AUTH =====
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
    // focus first input
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
function handleLogin(e) {
  e.preventDefault();
  const email = (document.getElementById('login-email')?.value || '').trim();
  const pass = (document.getElementById('login-pass')?.value || '');
  if (!email) return showToast('Please enter your email');
  if (!pass) return showToast('Please enter your password');
  const USER_API = window.USER_API_URL || 'http://localhost:8001';
  const remember = !!document.getElementById('remember-login')?.checked;
  // try server login first
  try {
    return fetch(USER_API + '/login', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, password: pass })
    }).then(r => r.json()).then(json => {
      if (json && json.ok && json.user) {
        currentUser.name = json.user.name;
        currentUser.email = json.user.email;
        currentUser.__serverId = json.user.id;
        try { localStorage.setItem('els_user', JSON.stringify({ name: currentUser.name, email: currentUser.email, __serverId: currentUser.__serverId, password: remember ? btoa(pass) : '', remember })); } catch(e){}
        enterApp();
      } else {
        // server responded but not OK -> fallback to local check
        const loaded = loadUserIfExists(email);
        if (!loaded) {
          if (remember) try { localStorage.setItem('els_user', JSON.stringify({ name: email.split('@')[0], email: email, password: btoa(pass), remember: true })); } catch(e){}
          currentUser.email = email; currentUser.name = email.split('@')[0]; enterApp(); return;
        }
        // verify stored local password if present
        if (currentUser.password) {
          try { if (currentUser.password === btoa(pass)) { enterApp(); return; } } catch(e){}
        }
        showToast((json && json.error) ? json.error : 'Invalid credentials');
      }
    }).catch(err => {
      // server unreachable — fallback to local
      const loaded = loadUserIfExists(email);
      if (!loaded) {
        if (remember) try { localStorage.setItem('els_user', JSON.stringify({ name: email.split('@')[0], email: email, password: btoa(pass), remember: true })); } catch(e){}
        currentUser.email = email; currentUser.name = email.split('@')[0]; enterApp(); return;
      }
      if (currentUser.password) {
        try { if (currentUser.password === btoa(pass)) { enterApp(); return; } } catch(e){}
      }
      showToast('Incorrect password. Click "Forgot password?" to reset.');
    });
  } catch (e) {
    // fall back to local behavior
    const loaded = loadUserIfExists(email);
    if (!loaded) { if (remember) try { localStorage.setItem('els_user', JSON.stringify({ name: email.split('@')[0], email: email, password: btoa(pass), remember: true })); } catch(e){}; currentUser.email = email; currentUser.name = email.split('@')[0]; enterApp(); return; }
    if (currentUser.password) { try { if (currentUser.password === btoa(pass)) { enterApp(); return; } } catch(e){} }
    showToast('Incorrect password. Click "Forgot password?" to reset.');
  }
}
function handleRegister(e) {
  e.preventDefault();
  const name = (document.getElementById('reg-name')?.value || '').trim();
  const email = (document.getElementById('reg-email')?.value || '').trim();
  const pass = (document.getElementById('reg-pass')?.value || '');
  if (!email || !name || !pass) return showToast('Please enter name, email and password to register');
  const USER_API = window.USER_API_URL || 'http://localhost:8001';
  // try server register
  try {
    return fetch(USER_API + '/register', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, password: pass })
    }).then(r => r.json()).then(json => {
      if (json && json.ok && json.user) {
        currentUser.name = json.user.name; currentUser.email = json.user.email; currentUser.__serverId = json.user.id;
        try { const remember = !!document.getElementById('remember-register')?.checked; localStorage.setItem('els_user', JSON.stringify({ name: currentUser.name, email: currentUser.email, __serverId: currentUser.__serverId, password: remember ? btoa(pass) : '', remember })); } catch(e){}
        enterApp();
      } else if (json && json.error && json.error === 'User exists') {
        showToast('Account already exists — please login');
      } else {
        // fallback to local registration
        const loaded = loadUserIfExists(email);
        if (!loaded) {
          const remember = !!document.getElementById('remember-register')?.checked;
          currentUser.name = name; currentUser.email = email; try { currentUser.password = remember ? btoa(pass) : ''; } catch(e){ currentUser.password = pass; }
          try { localStorage.setItem('els_user', JSON.stringify(Object.assign({}, currentUser, { remember }))); } catch(e){}
        }
        enterApp();
      }
    }).catch(err => {
      // server unreachable - fallback
      const loaded = loadUserIfExists(email);
      if (!loaded) {
        const remember = !!document.getElementById('remember-register')?.checked;
        currentUser.name = name; currentUser.email = email; try { currentUser.password = remember ? btoa(pass) : ''; } catch(e){ currentUser.password = pass; }
        try { localStorage.setItem('els_user', JSON.stringify(Object.assign({}, currentUser, { remember }))); } catch(e){}
      }
      enterApp();
    });
  } catch (e) {
    const loaded = loadUserIfExists(email);
    if (!loaded) { const remember = !!document.getElementById('remember-register')?.checked; currentUser.name = name; currentUser.email = email; try { currentUser.password = remember ? btoa(pass) : ''; } catch(e){ currentUser.password = pass; } try { localStorage.setItem('els_user', JSON.stringify(Object.assign({}, currentUser, { remember }))); } catch(e){} }
    enterApp();
  }
}

// Password reset helpers
function openResetRequestModal() {
  document.getElementById('reset-password-modal').classList.remove('hidden');
}
function closeResetRequestModal() {
  document.getElementById('reset-password-modal').classList.add('hidden');
  document.getElementById('reset-request-result').innerHTML = '';
}
function openResetSetModal() {
  document.getElementById('reset-set-modal').classList.remove('hidden');
}
function closeResetSetModal() {
  document.getElementById('reset-set-modal').classList.add('hidden');
  document.getElementById('reset-set-result').innerHTML = '';
}
function openResetOtpModal() { document.getElementById('reset-otp-modal').classList.remove('hidden'); }
function closeResetOtpModal() { document.getElementById('reset-otp-modal').classList.add('hidden'); document.getElementById('reset-otp-result').innerHTML = ''; document.getElementById('reset-otp-code').value=''; }

async function verifyOtp(e) {
  e.preventDefault();
  const hash = location.hash || '';
  const m = hash.match(/#reset=([A-Za-z0-9_-]+)/);
  if (!m) return showToast('Reset token not found');
  const token = m[1];
  const code = (document.getElementById('reset-otp-code')?.value || '').trim();
  if (!code) return showToast('Enter the verification code');
  const API = window.USER_API_URL || 'http://localhost:8001';
  try {
    const res = await fetch(API + '/verify-otp', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token, otp: code }) });
    const json = await res.json();
    if (res.ok && json && json.ok) {
      // verified — show set password modal
      closeResetOtpModal();
      openResetSetModal();
    } else {
      document.getElementById('reset-otp-result').textContent = (json && json.error) ? json.error : 'Invalid code';
    }
  } catch (err) {
    document.getElementById('reset-otp-result').textContent = 'Verification failed — try again.';
  }
}

async function resendResetCode() {
  const btn = document.getElementById('resend-reset-code-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Resending...'; }
  const hash = location.hash || '';
  const m = hash.match(/#reset=([A-Za-z0-9_-]+)/);
  let email = '';
  if (m) {
    const token = m[1];
    try {
      const resets = JSON.parse(localStorage.getItem('els_password_resets') || '{}');
      if (resets && resets[token] && resets[token].email) email = resets[token].email;
    } catch (e) { }
  }
  if (!email) {
    // as a fallback ask the user for their email
    email = prompt('Enter your email to resend the verification code');
    if (!email) {
      if (btn) { btn.disabled = false; btn.textContent = 'Resend code'; }
      return;
    }
  }
  const API = window.RESET_API_URL || 'http://localhost:8001';
  try {
    const res = await fetch(API + '/send-reset', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, resetBase: (location.href.split('#')[0].split('?')[0]), siteName: document.title }) });
    const json = await res.json();
    if (res.ok && json && json.ok) {sss
      document.getElementById('reset-otp-result').textContent = 'Verification code resent — check your email.';
      startResendCountdown(30);
      // store returned token locally if provided
      if (json.token) {
        try {
          const resets = JSON.parse(localStorage.getItem('els_password_resets') || '{}');
          resets[json.token] = { email: email, expires: Date.now() + (60*60*1000) };
          localStorage.setItem('els_password_resets', JSON.stringify(resets));
          // update location hash to new token so flow continues
          location.hash = 'reset=' + json.token;
        } catch(e){}
      }
    } else {
      document.getElementById('reset-otp-result').textContent = (json && json.error) ? json.error : 'Failed to resend code';
    }
  } catch (err) {
    document.getElementById('reset-otp-result').textContent = 'Unable to contact server — try again later.';
    startResendCountdown(30);
  }
  // Start countdown/disable even if server fails to avoid spam
}

function startResendCountdown(seconds) {
  const btn = document.getElementById('resend-reset-code-btn');
  if (!btn) return;
  let remaining = typeof seconds === 'number' ? Math.max(0, seconds) : 30;
  btn.disabled = true;
  btn.dataset.countdown = '1';
  const originalText = 'Resend code';
  btn.textContent = `${originalText} (${remaining}s)`;
  const iv = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(iv);
      btn.disabled = false;
      btn.textContent = originalText;
      delete btn.dataset.countdown;
      return;
    }
    btn.textContent = `${originalText} (${remaining}s)`;
  }, 1000);
}

// Toggle show/hide password for inputs. btn will display 'Show'/'Hide' and reflect aria-pressed.
function togglePasswordVisibility(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const iconShow = '<i data-lucide="eye" class="w-4 h-4"></i>';
  const iconHide = '<i data-lucide="eye-off" class="w-4 h-4"></i>';
  if (el.type === 'password') {
    el.type = 'text';
    if (btn) { btn.innerHTML = iconHide; btn.setAttribute('aria-pressed', 'true'); }
  } else {
    el.type = 'password';
    if (btn) { btn.innerHTML = iconShow; btn.setAttribute('aria-pressed', 'false'); }
  }
  try { if (window.lucide && typeof lucide.createIcons === 'function') lucide.createIcons(); } catch(e) {}
}

function generateResetToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sendPasswordResetRequest(e) {
  e.preventDefault();
  const email = (document.getElementById('reset-email')?.value || '').trim();
  if (!email) return showToast('Please enter your registered email');
  // check stored user
  let user = null;
  try {
    const raw = localStorage.getItem('els_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (u && u.email && String(u.email).toLowerCase() === String(email).toLowerCase()) user = u;
    }
  } catch (e) { /* ignore */ }

  const token = generateResetToken();
  const expires = Date.now() + (60 * 60 * 1000); // 1 hour
  let resets = {};
  try { resets = JSON.parse(localStorage.getItem('els_password_resets') || '{}'); } catch(e) { resets = {}; }
  resets[token] = { email: email, expires };
  try { localStorage.setItem('els_password_resets', JSON.stringify(resets)); } catch(e){}

  const resetUrl = (location.href.split('#')[0].split('?')[0]) + '#reset=' + token;

  // Prefer server-side email sending if configured
  const serverUrl = window.RESET_API_URL || 'http://localhost:8001/send-reset';
  // send reset request to server which will generate token and email the user
  fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, resetBase: (location.href.split('#')[0].split('?')[0]), siteName: document.title })
  }).then(res => res.json()).then(json => {
    if (json && json.ok) {
      document.getElementById('reset-request-result').textContent = 'Reset email sent — check your inbox.';
      return;
    }
    // fallback behavior: construct a clear subject/body with the reset link so Gmail/mail clients show it
    const token = (json && json.token) ? json.token : '';
    const resetUrl = (location.href.split('#')[0].split('?')[0]) + '#reset=' + token;
    const subject = 'Password reset';
    const body = 'Please click the link below to change your password for ' + (document.title || 'the site') + ':\n\n' + resetUrl + '\n\nIf you did not request this, please ignore.';
    const mailto = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    const gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(email) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    const header = (json && json.error && json.error === 'SMTP not configured on server') ? 'Server cannot send email. Use one of these to send the reset link:' : 'Reset link created. Use your email to send it, or open Gmail compose:';
    document.getElementById('reset-request-result').innerHTML = '<div>' + header + '</div><div class="mt-2"><a target="_blank" href="' + gmail + '" class="underline text-indigo-600 mr-2">Open Gmail</a><a href="' + mailto + '" class="underline mr-2">Open mail client</a><button onclick="navigator.clipboard && navigator.clipboard.writeText(\'' + resetUrl + '\')?showToast(\'Link copied\'):null" class="ml-2 px-2 py-1 bg-gray-100 rounded">Copy link</button></div>';
  }).catch(err => {
    // server not reachable — fallback to Gmail/mailto links with empty token
    const resetUrl = (location.href.split('#')[0].split('?')[0]) + '#reset=';
    const subject = 'Password reset';
    const body = 'Please click the link below to change your password for ' + (document.title || 'the site') + ':\n\n' + resetUrl + '\n\nIf you did not request this, please ignore.';
    const mailto = 'mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    const gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(email) + '&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    document.getElementById('reset-request-result').innerHTML = '<div>Reset link created. Use your email to send it, or open Gmail compose:</div><div class="mt-2"><a target="_blank" href="' + gmail + '" class="underline text-indigo-600 mr-2">Open Gmail</a><a href="' + mailto + '" class="underline mr-2">Open mail client</a><button onclick="navigator.clipboard && navigator.clipboard.writeText(\'' + resetUrl + '\')?showToast(\'Link copied\'):null" class="ml-2 px-2 py-1 bg-gray-100 rounded">Copy link</button></div>';
  });
}

function completePasswordReset(e) {
  e.preventDefault();
  // token should be in location.hash
  const hash = location.hash || '';
  const m = hash.match(/#reset=([A-Za-z0-9_-]+)/);
  if (!m) return showToast('Reset token not found');
  const token = m[1];
  let resets = {};
  try { resets = JSON.parse(localStorage.getItem('els_password_resets') || '{}'); } catch(e){ resets = {}; }
  const info = resets[token];
  if (!info) return showToast('Invalid or expired reset token');
  if (Date.now() > info.expires) return showToast('Reset token expired');
  const pass = (document.getElementById('reset-new-pass')?.value || '');
  const pass2 = (document.getElementById('reset-new-pass-confirm')?.value || '');
  if (!pass || pass.length < 6) return showToast('Password must be at least 6 characters');
  if (pass !== pass2) return showToast('Passwords do not match');
  const USER_API = window.USER_API_URL || 'http://localhost:8001';
  // try server-side reset complete
  try {
    return fetch(USER_API + '/reset-complete', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token, newPassword: pass }) })
      .then(r => r.json()).then(json => {
        if (json && json.ok) {
          document.getElementById('reset-set-result').textContent = 'Password reset — you can now sign in.';
          setTimeout(() => { closeResetSetModal(); location.hash = ''; }, 1200);
        } else {
          // fallback to local storage method
          try {
            const raw = localStorage.getItem('els_user');
            if (raw) {
              const u = JSON.parse(raw);
              if (u && u.email && String(u.email).toLowerCase() === String(info.email).toLowerCase()) {
                try { u.password = btoa(pass); } catch(e){ u.password = pass; }
                localStorage.setItem('els_user', JSON.stringify(u));
                document.getElementById('reset-set-result').textContent = 'Password reset — you can now sign in.';
                delete resets[token];
                try { localStorage.setItem('els_password_resets', JSON.stringify(resets)); } catch(e){}
                setTimeout(() => { closeResetSetModal(); location.hash = ''; }, 1200);
                return;
              }
            }
          } catch(e){}
          showToast((json && json.error) ? json.error : 'Account not found for that email');
        }
      }).catch(err => {
        // server unreachable, fallback to local
        try {
          const raw = localStorage.getItem('els_user');
          if (raw) {
            const u = JSON.parse(raw);
            if (u && u.email && String(u.email).toLowerCase() === String(info.email).toLowerCase()) {
              try { u.password = btoa(pass); } catch(e){ u.password = pass; }
              localStorage.setItem('els_user', JSON.stringify(u));
              document.getElementById('reset-set-result').textContent = 'Password reset — you can now sign in.';
              delete resets[token];
              try { localStorage.setItem('els_password_resets', JSON.stringify(resets)); } catch(e){}
              setTimeout(() => { closeResetSetModal(); location.hash = ''; }, 1200);
              return;
            }
          }
        } catch(e){}
        showToast('Account not found for that email');
      });
  } catch(e) {
    showToast('Failed to reset — try again');
  }
}

// On load, detect reset token and show set-password modal
function checkForResetTokenOnLoad() {
  const hash = location.hash || '';
  const m = hash.match(/#reset=([A-Za-z0-9_-]+)/);
  if (!m) return;
  const token = m[1];
  // validate token with server if available; then show OTP verify modal
  const validateUrl = (window.RESET_API_URL || 'http://localhost:8001/validate-reset') + '?token=' + encodeURIComponent(token);
  fetch(validateUrl).then(r => r.json()).then(json => {
    if (json && json.ok) {
      openResetOtpModal();
    }
  }).catch(() => {
    // fallback: check localStorage token generated earlier (best-effort) and open set modal directly
    let resets = {};
    try { resets = JSON.parse(localStorage.getItem('els_password_resets') || '{}'); } catch(e){ resets = {}; }
    const info = resets[token];
    if (!info) return;
    if (Date.now() > info.expires) return;
    openResetSetModal();
  });
}

// run check on startup
try { window.addEventListener('load', checkForResetTokenOnLoad); } catch(e){}
function enterApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  try { updateHeaderAvatar(); } catch (e) {}
  lucide.createIcons();
  showToast('Welcome, ' + currentUser.name + '!');
}
function handleLogout() {
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  toggleSidebar();
  cart = [];
  conversations = [];
  currentConversation = null;
  // Respect 'remember' flag: if the persisted user did not opt to be remembered, clear stored credentials
  try {
    const raw = localStorage.getItem('els_user');
    if (raw) {
      const u = JSON.parse(raw);
      if (!u.remember) {
        localStorage.removeItem('els_user');
      }
    }
  } catch(e) {}
  goTo('home');
}