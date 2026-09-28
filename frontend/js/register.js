// Auth functions (switchAuthTab / handleLogin / handleRegister) live in ui.js.
// This file only contains the password reset helpers.

// Password reset helpers
function openResetRequestModal() {
  document.getElementById('reset-password-modal').classList.remove('hidden');
}
function closeResetRequestModal() {
  document.getElementById('reset-password-modal').classList.add('hidden');
  document.getElementById('reset-request-result').innerHTML = '';
}
function openResetSetModal() {
  const el = document.getElementById('reset-set-modal');
  if (!el) return false;
  el.classList.remove('hidden');
  return true;
}
function closeResetSetModal() {
  const el = document.getElementById('reset-set-modal');
  if (el) el.classList.add('hidden');
  const out = document.getElementById('reset-set-result');
  if (out) out.textContent = '';
}
function openResetOtpModal() {
  const el = document.getElementById('reset-otp-modal');
  if (!el) return false;
  el.classList.remove('hidden');
  return true;
}
function closeResetOtpModal() {
  const el = document.getElementById('reset-otp-modal');
  if (el) el.classList.add('hidden');
  const out = document.getElementById('reset-otp-result');
  if (out) out.textContent = '';
  const input = document.getElementById('reset-otp-code');
  if (input) input.value = '';
}

function getResetTokenFromLocation() {
  const hash = location.hash || '';
  const hashMatch = hash.match(/#reset=([A-Za-z0-9_-]+)/);
  if (hashMatch) return hashMatch[1];
  const params = new URLSearchParams(location.search || '');
  return params.get('token') || params.get('reset') || '';
}

/**
 * Passwordless sign-in.
 *
 * The server contract is { email, code } against /auth/verify-otp, which
 * returns a normal session token on success. The previous version of this
 * function posted { token, otp } to the root endpoint, which is a different
 * (reset) flow and could never succeed from this modal.
 */
async function startOtpLogin() {
  const emailField = document.getElementById('login-email');
  const out = document.getElementById('reset-otp-result');
  const email = (emailField ? emailField.value : '').trim()
    || (document.getElementById('reset-otp-email') || {}).value;
  const address = (email || '').trim();

  if (!address) {
    if (out) out.textContent = 'Enter your email address first, then choose "Sign in with a code".';
    else showToast('Enter your email address first');
    return;
  }

  if (!openResetOtpModal()) return;
  const emailInput = document.getElementById('reset-otp-email');
  if (emailInput) emailInput.value = address;

  await sendOtpCode(address);
}

async function sendOtpCode(email) {
  const out = document.getElementById('reset-otp-result');
  if (out) out.textContent = 'Sending code...';
  const API = window.USER_API_URL || (window.API_BASE || 'http://localhost:8001/api') + '/auth';
  try {
    const res = await fetch(API + '/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const json = await res.json().catch(() => ({}));
    if (out) out.textContent = (json && (json.message || json.error))
      || 'If that email is registered, a verification code has been sent.';
  } catch (err) {
    if (out) out.textContent = 'Could not reach the server. Try again later.';
  }
}

async function verifyOtp(e) {
  if (e) e.preventDefault();
  const email = ((document.getElementById('reset-otp-email') || {}).value || '').trim();
  const code = ((document.getElementById('reset-otp-code') || {}).value || '').trim();
  const out = document.getElementById('reset-otp-result');

  if (!email) { if (out) out.textContent = 'Email is required'; return; }
  if (!/^\d{6}$/.test(code)) { if (out) out.textContent = 'Enter the six-digit code'; return; }

  const API = window.USER_API_URL || (window.API_BASE || 'http://localhost:8001/api') + '/auth';
  try {
    const res = await fetch(API + '/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok || !json || !json.success) {
      if (out) out.textContent = (json && (json.message || json.error)) || 'That code is not valid.';
      return;
    }

    // The verified code mints a full session, exactly like a password login.
    const remember = !!(document.getElementById('remember-login') || {}).checked;
    if (typeof persistAuthSession === 'function') {
      persistAuthSession(json.user, json.token, remember);
    } else {
      localStorage.setItem('els_token', json.token);
      localStorage.setItem('els_user', JSON.stringify(json.user || {}));
    }
    closeResetOtpModal();
    showToast('Signed in', 'success');
    if (typeof enterApp === 'function') enterApp();
  } catch (err) {
    if (out) out.textContent = 'Could not reach the server. Try again later.';
  }
}

async function resendResetCode() {
  const btn = document.getElementById('resend-reset-code-btn');
  const email = ((document.getElementById('reset-otp-email') || {}).value || '').trim();
  if (!email) {
    if (btn) { btn.disabled = false; btn.textContent = 'Resend code'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Resending...'; }
  await sendOtpCode(email);
  startResendCountdown();
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

function sendPasswordResetRequest(e) {
  e.preventDefault();
  const email = (document.getElementById('reset-email')?.value || '').trim();
  const result = document.getElementById('reset-request-result');
  if (!result) return;
  if (!email) { result.textContent = 'Please enter your registered email'; return; }

  // Only the server may issue a reset token. The previous client-side token
  // (Math.random() in localStorage) let anyone with devtools reset any account
  // they were signed in as, and the mailto/Gmail fallback rendered a
  // self-generated link that looked authentic but granted nothing.
  const API = window.USER_API_URL || (window.API_BASE || 'http://localhost:8001/api') + '/auth';
  fetch(API + '/send-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // No resetBase/siteName: the link origin is a server-side setting, so a
    // caller cannot redirect a genuine reset mail to their own domain.
    body: JSON.stringify({ email })
  }).then(r => r.json().catch(() => ({}))).then(json => {
    if (json && (json.ok || json.success)) {
      result.textContent = json.message || 'If that email is registered, a reset link is on its way.';
      return;
    }
    result.textContent = (json && (json.error || json.message)) || 'Could not start password reset. Try again later.';
  }).catch(() => {
    result.textContent = 'Could not reach the server. Try again later.';
  });
}

function completePasswordReset(e) {
  e.preventDefault();
  const result = document.getElementById('reset-set-result');
  if (!result) return;
  const token = getResetTokenFromLocation();
  if (!token) { result.textContent = 'Reset token not found'; return; }

  const pass = (document.getElementById('reset-new-pass')?.value || '');
  const pass2 = (document.getElementById('reset-new-pass-confirm') || {}).value || '';
  // Mirror the server policy (8+ chars, upper, lower, digit) so the user is
  // told immediately instead of after a round trip.
  if (pass.length < 8) { result.textContent = 'Password must be at least 8 characters'; return; }
  if (!/[a-z]/.test(pass) || !/[A-Z]/.test(pass) || !/[0-9]/.test(pass)) {
    result.textContent = 'Password needs upper case, lower case and a number';
    return;
  }
  if (pass !== pass2) { result.textContent = 'Passwords do not match'; return; }

  const API = window.USER_API_URL || (window.API_BASE || 'http://localhost:8001/api') + '/auth';
  fetch(API + '/reset-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword: pass })
  }).then(r => r.json().catch(() => ({}))).then(json => {
    if (json && (json.ok || json.success)) {
      result.textContent = 'Password reset — you can now sign in.';
      // Drop any stale local session; the server has rotated the token version.
      try {
        localStorage.removeItem('els_token'); localStorage.removeItem('els_user');
        sessionStorage.removeItem('els_token'); sessionStorage.removeItem('els_user');
        localStorage.removeItem('els_password_resets');
      } catch (err) { /* ignore */ }
      setTimeout(() => { closeResetSetModal(); location.hash = ''; }, 1200);
      return;
    }
    // No local fallback: a "local" reset cannot change the server password, so
    // reporting success here would only mislead the user.
    result.textContent = (json && (json.error || json.message)) || 'Reset failed. Request a new link.';
  }).catch(() => {
    result.textContent = 'Could not reach the server. Try again later.';
  });
}

// On load, detect reset token and show set-password modal
function checkForResetTokenOnLoad() {
  const token = getResetTokenFromLocation();
  if (!token) return;
  const validateUrl = (window.USER_API_URL || (window.API_BASE || 'http://localhost:8001/api') + '/auth') + '/validate-reset?token=' + encodeURIComponent(token);
  // Server is the only authority on whether a reset token is real. The old
  // localStorage fallback opened the set-password modal for a token the server
  // had never issued.
  fetch(validateUrl).then(r => r.json()).then(json => {
    if (json && (json.ok || json.success)) {
      if (openResetSetModal()) { /* set-password modal present */ }
      else { showToast('Reset link verified, but this build has no set-password form.'); }
    } else {
      showToast('This reset link is invalid or has expired. Request a new one.');
    }
  }).catch(() => {
    showToast('Could not verify the reset link. Try again later.');
  });
}

// run check on startup
try { window.addEventListener('load', checkForResetTokenOnLoad); } catch(e){}