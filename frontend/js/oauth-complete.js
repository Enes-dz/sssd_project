
const API = '/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  const text = Array.isArray(msg) ? msg.join('\n') : (msg.message || String(msg));
  el.textContent = text;
  el.className = `alert alert-${type}`;
  el.style.display = 'block';
}
function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
function setLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const jwt      = sessionStorage.getItem('oauthJwt');
  const provider = sessionStorage.getItem('oauthProvider') || 'google';

  if (!jwt) {
    // No OAuth session — redirect back
    window.location.href = 'login.html';
    return;
  }

  // Personalise subtitle
  const sub = document.getElementById('oauth-subtitle');
  if (sub) {
    const providerName = provider === 'github' ? 'GitHub' : 'Google';
    sub.textContent = `Your ${providerName} account is verified. Choose a username, password, and phone number to finish.`;
  }
});

// ─── Submit ───────────────────────────────────────────────────────────────────
async function handleOAuthComplete() {
  hideAlert('oauth-error');
  hideAlert('oauth-success');

  const username        = document.getElementById('username')?.value.trim();
  const phoneNumber     = document.getElementById('phone-number')?.value.trim();
  const password        = document.getElementById('password')?.value;
  const confirmPassword = document.getElementById('confirm-password')?.value;
  const btn             = document.getElementById('complete-btn');

  if (!username || !phoneNumber || !password || !confirmPassword) {
    showAlert('oauth-error', 'Please fill in all fields.');
    return;
  }
  if (password !== confirmPassword) {
    showAlert('oauth-error', 'Passwords do not match.');
    return;
  }

  const jwt      = sessionStorage.getItem('oauthJwt');
  const provider = sessionStorage.getItem('oauthProvider') || 'google';

  if (!jwt) {
    showAlert('oauth-error', 'Session expired. Please sign in again.');
    setTimeout(() => { window.location.href = 'login.html'; }, 2000);
    return;
  }

  // Pick endpoint and method based on provider.
  // Both routes use singleSignOnJWTMiddleware which reads Authorization: Bearer <token>.
  // verify-github-register is declared as GET in the router but reads req.body,
  // so we POST to it — adjust if your server strictly enforces GET.
  const endpoint = provider === 'github'
    ? `${API}/verify-github-register`
    : `${API}/verify-google-register`;

  setLoading(btn, true);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        username,
        password,
        phone_number: phoneNumber,
      }),
    });
    const data = await res.json();

    if (res.ok) {
      showAlert('oauth-success',
        data.message || 'Account created! Redirecting to login…',
        'success');
      sessionStorage.removeItem('oauthJwt');
      sessionStorage.removeItem('oauthEmail');
      sessionStorage.removeItem('oauthProvider');
      btn.disabled = true;
      setTimeout(() => { window.location.href = 'login.html'; }, 2200);
      return;
    }

    const msg = data.message || (data.errors && data.errors.join(' ')) || 'Registration failed.';
    showAlert('oauth-error', msg);
  } catch {
    showAlert('oauth-error', 'Network error. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}