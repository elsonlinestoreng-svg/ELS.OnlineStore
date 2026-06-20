document.getElementById('seller-register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = (document.getElementById('name')?.value || '').trim();
  const email = (document.getElementById('email')?.value || '').trim();
  const password = (document.getElementById('password')?.value || '');
  const resultEl = document.getElementById('result');
  resultEl.textContent = '';
  if (!name || !email || !password) return resultEl.textContent = 'Please fill all fields';

  try {
    const API = window.USER_API_URL || 'http://localhost:8001/api/auth';
    const res = await fetch(API + '/register', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name, email, password, confirmPassword: password })
    });
    const json = await res.json();
    if (res.ok && json && json.success) {
      // store token and redirect to payment details
      if (json.token) localStorage.setItem('els_token', json.token);
      try { localStorage.setItem('els_user', JSON.stringify({ name: json.user?.name || name, email: json.user?.email || email })); } catch(e){}
      window.location.href = 'payment-details.html';
      return;
    }
    resultEl.textContent = (json && json.message) ? json.message : 'Registration failed';
  } catch (err) {
    console.error(err);
    resultEl.textContent = 'Server error during registration';
  }
});
