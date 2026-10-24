
const API = '/api';

// ─── Shared helpers ────────────────────────────────────────────────────────────

function setLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  const text = Array.isArray(msg) ? msg.join('\n') : (msg.errors ? msg.errors.join('\n') : (msg.message || String(msg)));
  el.textContent = text;
  el.className = `alert alert-${type}`;
  el.style.display = 'block';
}

function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showStep(name) {
  ['login', 'captcha', '2fa'].forEach(s => {
    const el = document.getElementById(`step-${s}`);
    if (el) el.style.display = s === name ? '' : 'none';
  });
}

// ─── State shared across login steps ──────────────────────────────────────────
let loginState = {
  identity: '',
  password: '',
  jwt_captcha: null,
  jwt_2fa: null,
  twofa_method: null,
};

function saveState() { sessionStorage.setItem('loginState', JSON.stringify(loginState)); }
function loadState() {
  const s = sessionStorage.getItem('loginState');
  if (s) loginState = { ...loginState, ...JSON.parse(s) };
}

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadState();

  const pwd  = document.getElementById('password');
  const id   = document.getElementById('identity');
  const code = document.getElementById('twofa-code');

  if (pwd)  pwd.addEventListener('keydown',  e => { if (e.key === 'Enter') handleLogin(); });
  if (id)   id.addEventListener('keydown',   e => { if (e.key === 'Enter') handleLogin(); });
  if (code) code.addEventListener('keydown', e => { if (e.key === 'Enter') handle2FAVerify(); });
});

// ─── CREDENTIALS LOGIN ────────────────────────────────────────────────────────

async function handleLogin() {
  hideAlert('login-error');
  hideAlert('login-info');

  const identity  = document.getElementById('identity')?.value.trim();
  const password  = document.getElementById('password')?.value;
  const trustBox  = document.getElementById('trusted-device');
  const btn       = document.getElementById('login-btn');

  if (!identity || !password) {
    showAlert('login-error', 'Please enter your email/username and password.');
    return;
  }

  loginState.identity = identity;
  loginState.password = password;

  const body = { identity, password };
  if (trustBox?.checked) body.trusted_device_token = true;

  setLoading(btn, true);
  try {
    const res  = await fetch(`${API}/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    handleLoginResponse(res.status, data, 'login-error');
  } catch {
    showAlert('login-error', 'Network error. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}

// ─── OAUTH LOGIN (Google / GitHub) ────────────────────────────────────────────

async function handleOAuthLogin(provider) {
  const btnId = provider === 'google' ? 'google-btn' : 'github-btn';
  const btn   = document.getElementById(btnId);
  hideAlert('login-error');

  setLoading(btn, true);
  try {
    const res  = await fetch(`${API}/${provider}-login`, { credentials: 'include' });
    const data = await res.json();

    if (!res.ok || !data.authUrl) {
      showAlert('login-error', data.message || `${provider} login failed. Please try again.`);
      return;
    }

    // Redirect the browser to the OAuth provider's consent screen.
    // The callback route on the server handles the rest and will redirect
    // the browser to /oauth-callback (see below).
    window.location.href = data.authUrl;

  } catch {
    showAlert('login-error', 'Network error. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}

/**
 * Called by the server-side callback redirect target.
 * Your backend's /v1/google-callback and /v1/github-callback should
 * redirect the browser to:
 *
 *   /oauth-callback?result=<base64-encoded-JSON>
 *
 * where the JSON is the loginWithOauth() response body.
 *
 * This function reads that query param and routes accordingly.
 */
function handleOAuthCallbackRedirect() {
  const params = new URLSearchParams(window.location.search);
  const raw    = params.get('result');
  if (!raw) return;

  let data;
  try { data = JSON.parse(atob(raw)); } catch { return; }

  // New user — needs to complete registration
  if (data.jwt && data.email) {
    sessionStorage.setItem('oauthJwt',      data.jwt);
    sessionStorage.setItem('oauthEmail',    data.email);
    sessionStorage.setItem('oauthProvider', params.get('provider') || 'google');
    window.location.href = 'oauth-complete.html';
    return;
  }

  // Existing user — 2FA required
  if (data.status === '2fa_required') {
    loginState.jwt_2fa      = data.jwt_2fa;
    loginState.twofa_method = data.method === 'google' ? 'totp' : data.method;
    saveState();
    setup2FAStep(loginState.twofa_method);
    showStep('2fa');
    return;
  }

  // Error
  if (data.message) showAlert('login-error', data.message);
}

// ─── CAPTCHA ──────────────────────────────────────────────────────────────────
function onCaptchaSuccess(token) {
    window.hcaptchaToken = token;
}

async function submitCaptcha() {
  hideAlert('captcha-error');

  // hCaptcha integration point:
  //   1. Render widget:  <div class="h-captcha" data-sitekey="YOUR_SITE_KEY"></div>
  //   2. In your hCaptcha success callback set: window.hcaptchaToken = token
  const hCaptchaResponse = window.hcaptchaToken || null;
  if (!hCaptchaResponse) {
    showAlert('captcha-error', 'Please complete the captcha first.');
    return;
  }

  try {
    const res  = await fetch(`${API}/captcha/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt_captcha: loginState.jwt_captcha,
        'h-captcha-response': hCaptchaResponse,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      showAlert('captcha-error', data.message || 'Captcha failed. Please try again.');
      return;
    }

    loginState.jwt_captcha = data.jwt_token;
    saveState();
    await retryLoginWithCaptcha(data.jwt_token);
  } catch {
    showAlert('captcha-error', 'Network error. Please try again.');
  }
}

async function retryLoginWithCaptcha(jwtToken) {
  try {
    const res  = await fetch(`${API}/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity:  loginState.identity,
        password:  loginState.password,
        jwt_token: jwtToken,
      }),
    });
    const data = await res.json();
    handleLoginResponse(res.status, data, 'captcha-error');
  } catch {
    showStep('login');
    showAlert('login-error', 'Network error. Please try again.');
  }
}

// ─── Shared response router ───────────────────────────────────────────────────

function handleLoginResponse(status, data, errorAlertId) {
  // Fully authenticated
  if (data.access_token) {
    storeAccessToken(data.access_token);
    sessionStorage.removeItem('loginState');
    window.location.href = '/dashboard';
    return;
  }

  // Captcha required
  if (status === 403 && data.status === 'captcha_required') {
    loginState.jwt_captcha = data.jwt_captcha;
    saveState();
    showStep('captcha');
    return;
  }

  // 2FA required
  if (data.status === '2fa_required') {
    loginState.jwt_2fa      = data.jwt_2fa;
    // OAuth returns method:"google" meaning the user's actual 2FA method is whichever they enabled
    loginState.twofa_method = (data.method === 'google' || data.method === 'github') ? 'totp' : data.method;
    saveState();
    setup2FAStep(loginState.twofa_method);
    showStep('2fa');
    return;
  }

  const msg = (data.errors && data.errors.join(' ')) || data.message || 'Login failed.';
  showAlert(errorAlertId, msg);
}

// ─── 2FA ──────────────────────────────────────────────────────────────────────

function setup2FAStep(method) {
  const subtitles = {
    email: 'Enter the 6-digit code sent to your email.',
    sms:   'Enter the 6-digit code sent to your phone.',
    totp:  'Enter the 6-digit code from your authenticator app.',
  };
  const sub = document.getElementById('twofa-subtitle');
  if (sub) sub.textContent = subtitles[method] || 'Enter your verification code.';
  const input = document.getElementById('twofa-code');
  if (input) { input.value = ''; input.focus(); }
}

async function handle2FAVerify() {
  hideAlert('twofa-error');

  const code   = document.getElementById('twofa-code')?.value.trim();
  const method = loginState.twofa_method;
  const jwt2fa = loginState.jwt_2fa;

  if (!code || code.length < 6) {
    showAlert('twofa-error', 'Please enter a valid 6-digit code.');
    return;
  }
  if (!method || !jwt2fa) {
    showAlert('twofa-error', 'Session expired. Please log in again.');
    showStep('login');
    return;
  }

  const endpoints = {
    email: `${API}/2fa/email/verify`,
    sms:   `${API}/2fa/sms/verify`,
    totp:  `${API}/2fa/totp/verify`,
  };
  const endpoint = endpoints[method] || `${API}/2fa/totp/verify`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'auth': jwt2fa,   // backend reads from req.headers["auth"]
      },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();

    if (res.ok && data.access_token) {
      storeAccessToken(data.access_token);
      sessionStorage.removeItem('loginState');
      window.location.href = '/dashboard';
      return;
    }

    const msg = (data.errors && data.errors.join(' ')) || data.message || 'Verification failed.';
    showAlert('twofa-error', msg);
  } catch {
    showAlert('twofa-error', 'Network error. Please try again.');
  }
}

// ─── REGISTRATION ─────────────────────────────────────────────────────────────

async function handleRegister() {
  hideAlert('register-error');
  hideAlert('register-success');

  const fullName        = document.getElementById('full-name')?.value.trim();
  const username        = document.getElementById('username')?.value.trim();
  const email           = document.getElementById('email')?.value.trim();
  const phoneNumber     = document.getElementById('phone-number')?.value.trim();
  const password        = document.getElementById('password')?.value;
  const confirmPassword = document.getElementById('confirm-password')?.value;
  const terms           = document.getElementById('terms')?.checked;
  const btn             = document.getElementById('register-btn');

  if (!fullName || !username || !email || !phoneNumber || !password || !confirmPassword) {
    showAlert('register-error', 'Please fill in all fields.');
    return;
  }
  if (password !== confirmPassword) {
    showAlert('register-error', 'Passwords do not match.');
    return;
  }
  if (!terms) {
    showAlert('register-error', 'You must agree to the Terms of Service.');
    return;
  }

  setLoading(btn, true);
  try {
    const res  = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name:    fullName,
        username,
        email,
        phone_number: phoneNumber,
        password,
      }),
    });
    const data = await res.json();

    if (res.ok) {
      showAlert('register-success',
        data.message || 'Registration successful! Please check your email to verify your account.',
        'success');
      btn.disabled = true;
      return;
    }

    const errors = data.errors || [data.message] || ['Registration failed.'];
    showAlert('register-error', errors.join('\n'));
  } catch {
    showAlert('register-error', 'Network error. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}

// ─── Token storage ────────────────────────────────────────────────────────────

function storeAccessToken(token) {
  // sessionStorage keeps the token for the browser tab only.
  // Do NOT use localStorage for access tokens.
  sessionStorage.setItem('access_token', token);
}
function getAccessToken() { return sessionStorage.getItem('access_token'); }

window.authHelpers = { getAccessToken, storeAccessToken };