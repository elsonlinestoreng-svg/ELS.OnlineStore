// Auth functions are now in ui.js - this file only contains password reset helpers

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
  const API = window.USER_API_URL || 'http://localhost:8001/api/auth';
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
  const API = window.RESET_API_URL || 'http://localhost:8001/api/auth';
  try {
    const res = await fetch(API + '/send-reset', { method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email, resetBase: (location.href.split('#')[0].split('?')[0]), siteName: document.title }) });
    const json = await res.json();
    if (res.ok && json && json.ok) {
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
  const serverUrl = window.RESET_API_URL || 'http://localhost:8001/api/auth/send-reset';
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
  const USER_API = window.USER_API_URL || 'http://localhost:8001/api/auth';
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
  const validateUrl = (window.RESET_API_URL || 'http://localhost:8001/api/auth/validate-reset') + '?token=' + encodeURIComponent(token);
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