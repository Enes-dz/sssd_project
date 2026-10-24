// User dashboard: greeting, account info, 2FA management, change password.

let currentUser = null;
const setupTokens = { email: null, sms: null };

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    currentUser = await loadCurrentUser();
  } catch {
    return; // loadCurrentUser already redirected
  }
  renderUser();
}

function renderUser() {
  const u = currentUser;
  document.getElementById('greeting-title').textContent = `Welcome, ${u.name || u.username}.`;
  document.getElementById('info-name').textContent = u.name || '—';
  document.getElementById('info-username').textContent = u.username || '—';
  document.getElementById('info-email').textContent = u.email || '—';
  document.getElementById('info-phone').textContent = u.phone_number || '—';
  document.getElementById('info-role').textContent = u.role || 'user';

  if (u.role === 'admin') {
    document.getElementById('admin-link').style.display = '';
  }
  renderTwoFactor();
}

function renderTwoFactor() {
  const tf = currentUser.two_factor || {};
  ['email', 'sms', 'totp'].forEach((m) => {
    const on = !!tf[m];
    const badge = document.getElementById(`badge-${m}`);
    badge.textContent = on ? 'Enabled' : 'Disabled';
    badge.className = `badge ${on ? 'on' : 'off'}`;
    document.getElementById(`btn-${m}-enable`).style.display = on ? 'none' : '';
    document.getElementById(`btn-${m}-disable`).style.display = on ? '' : 'none';
  });
}

// ─── Enable flows ───────────────────────────────────────────────────────────────
async function startEnable(method) {
  clearFlash('twofa-alert');
  if (method === 'totp') return startTotp();

  const { res, data } = await apiFetch(`/dashboard/2fa/${method}/init`, { method: 'POST' });
  if (!res.ok) { flash('twofa-alert', data, 'error'); return; }
  setupTokens[method] = data.setup_token;
  document.getElementById(`setup-${method}`).style.display = '';
  flash('twofa-alert', data.message || 'Code sent.', 'info');
}

async function startTotp() {
  const { res, data } = await apiFetch('/dashboard/2fa/totp/init', { method: 'POST' });
  if (!res.ok) { flash('twofa-alert', data, 'error'); return; }
  document.getElementById('totp-qr').src = data.qr_code;
  document.getElementById('totp-uri').textContent = data.otpauth_uri;
  document.getElementById('setup-totp').style.display = '';
}

async function confirmCode(method) {
  clearFlash('twofa-alert');
  const code = document.getElementById(`${method}-code`).value.trim();
  if (!code) { flash('twofa-alert', 'Enter the verification code.', 'error'); return; }

  const { res, data } = await apiFetch(`/dashboard/2fa/${method}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ setup_token: setupTokens[method], code }),
  });
  if (!res.ok) { flash('twofa-alert', data, 'error'); return; }

  finishEnable(method, data);
}

async function confirmTotp() {
  clearFlash('twofa-alert');
  const code = document.getElementById('totp-code').value.trim();
  if (!code) { flash('twofa-alert', 'Enter the authenticator code.', 'error'); return; }

  const { res, data } = await apiFetch('/dashboard/2fa/totp/confirm', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  if (!res.ok) { flash('twofa-alert', data, 'error'); return; }

  finishEnable('totp', data);
}

function finishEnable(method, data) {
  cancelSetup(method);
  currentUser.two_factor[method] = true;
  renderTwoFactor();
  flash('twofa-alert', data.message || 'Enabled.', 'success');
  if (data.recovery_code) {
    const note = document.getElementById('recovery-note');
    note.textContent = `Save your recovery code somewhere safe — it will not be shown again: ${data.recovery_code}`;
    note.style.display = 'block';
  }
}

function cancelSetup(method) {
  const box = document.getElementById(`setup-${method}`);
  if (box) box.style.display = 'none';
  const input = document.getElementById(`${method}-code`);
  if (input) input.value = '';
}

async function disableMethod(method) {
  clearFlash('twofa-alert');
  const enabledCount = ['email', 'sms', 'totp'].filter((m) => currentUser.two_factor[m]).length;
  if (enabledCount <= 1) {
    flash('twofa-alert', 'At least one 2FA method must remain enabled.', 'error');
    return;
  }
  if (!confirm(`Disable ${method.toUpperCase()} two-factor authentication?`)) return;

  const { res, data } = await apiFetch('/dashboard/2fa/disable', {
    method: 'POST',
    body: JSON.stringify({ method }),
  });
  if (!res.ok) { flash('twofa-alert', data, 'error'); return; }
  currentUser.two_factor[method] = false;
  renderTwoFactor();
  flash('twofa-alert', data.message || 'Disabled.', 'success');
}

// ─── Change password ─────────────────────────────────────────────────────────────
async function changePassword() {
  clearFlash('password-alert');
  const current = document.getElementById('current-password').value;
  const next = document.getElementById('new-password').value;
  const confirmNext = document.getElementById('confirm-new-password').value;
  const btn = document.getElementById('change-password-btn');

  if (!current || !next || !confirmNext) { flash('password-alert', 'Please fill in all fields.', 'error'); return; }
  if (next !== confirmNext) { flash('password-alert', 'New passwords do not match.', 'error'); return; }

  btn.disabled = true;
  try {
    const { res, data } = await apiFetch('/dashboard/password/change', {
      method: 'POST',
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    if (!res.ok) { flash('password-alert', data, 'error'); btn.disabled = false; return; }
    flash('password-alert', (data.message || 'Password changed.') + ' Redirecting to login…', 'success');
    setTimeout(() => { clearAccessToken(); window.location.href = '/front/login.html'; }, 2200);
  } catch {
    flash('password-alert', 'Something went wrong.', 'error');
    btn.disabled = false;
  }
}
