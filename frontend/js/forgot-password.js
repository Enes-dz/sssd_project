
const API = '/api';

let resetState = {
  email: '',
  jwt_captcha: null,
};

// ─── Helpers (duplicated from main.js so this page is self-contained) ─────────
function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  const text = Array.isArray(msg) ? msg.join(' ') : (msg.message || msg);
  el.textContent = text;
  el.className = `alert alert-${type}`;
  el.style.display = 'block';
}
function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
function showStep(name) {
  ['request', 'captcha', 'new-password'].forEach(s => {
    const el = document.getElementById(`step-${s}`);
    if (el) el.style.display = s === name ? '' : 'none';
  });
}
function setLoading(btn, loading) {
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
}

// ─── On load: detect if arriving via reset link ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');
  const email  = params.get('email');

  if (token && email) {
    // Store for the verify step
    resetState.resetToken = token;
    resetState.email      = email;
    showStep('new-password');
  } else {
    showStep('request');
  }
});

// ─── REQUEST RESET ────────────────────────────────────────────────────────────
async function handlePasswordReset() {
  hideAlert('request-error');
  hideAlert('request-success');

  const emailVal = document.getElementById('email')?.value.trim();
  if (!emailVal) {
    showAlert('request-error', 'Please enter your email address.');
    return;
  }

  resetState.email = emailVal;

  const btn = document.querySelector('#step-request .btn');
  setLoading(btn, true);

  try {
    const body = { email: emailVal };
    if (resetState.jwt_captcha) body.jwt_captcha_token = resetState.jwt_captcha;

    const res  = await fetch(`${API}/password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (res.ok) {
      showAlert('request-success',
        data.message || 'Reset email sent! Please check your inbox.',
        'success');
      btn.disabled = true;
      return;
    }

    if (res.status === 403 && data.status === 'captcha_required') {
      resetState.jwt_captcha = data.jwt_captcha;
      showStep('captcha');
      return;
    }

    showAlert('request-error', data.message || 'Something went wrong.');

  } catch (err) {
    showAlert('request-error', 'Network error. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}

// ─── CAPTCHA (password reset flow) ────────────────────────────────────────────
async function submitResetCaptcha() {
  hideAlert('captcha-error');

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
        jwt_captcha: resetState.jwt_captcha,
        'h-captcha-response': hCaptchaResponse,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      showAlert('captcha-error', data.message || 'Captcha failed.');
      return;
    }

    // Retry password reset with verified captcha token
    resetState.jwt_captcha = data.jwt_token;
    showStep('request');
    await handlePasswordReset();

  } catch (err) {
    showAlert('captcha-error', 'Network error. Please try again.');
  }
}

// ─── VERIFY RESET TOKEN + SET NEW PASSWORD ─────────────────────────────────────
async function handlePasswordResetVerify() {
  hideAlert('reset-error');
  hideAlert('reset-success');

  const newPassword     = document.getElementById('new-password')?.value;
  const confirmPassword = document.getElementById('confirm-new-password')?.value;

  if (!newPassword || !confirmPassword) {
    showAlert('reset-error', 'Please fill in both password fields.');
    return;
  }
  if (newPassword !== confirmPassword) {
    showAlert('reset-error', 'Passwords do not match.');
    return;
  }
  if (!resetState.resetToken || !resetState.email) {
    showAlert('reset-error', 'Invalid reset link. Please request a new one.');
    return;
  }

  const btn = document.querySelector('#step-new-password .btn');
  setLoading(btn, true);

  try {
    const res  = await fetch(`${API}/password-reset/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token:        resetState.resetToken,
        email:        resetState.email,
        new_password: newPassword,
      }),
    });
    const data = await res.json();

    if (res.ok) {
      showAlert('reset-success',
        data.message || 'Password reset successful! You can now log in.',
        'success');
      btn.disabled = true;
      setTimeout(() => { window.location.href = 'login.html'; }, 2500);
      return;
    }

    showAlert('reset-error', data.message || 'Reset failed. The link may have expired.');

  } catch (err) {
    showAlert('reset-error', 'Network error. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}