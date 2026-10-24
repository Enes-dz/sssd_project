// Renders the TOTP setup page reached from the "Set Up TOTP 2FA" email link.
// It calls GET /api/2fa/totp?token=<setupToken>, which returns:
//   { message, totp_secret (otpauth:// URI), qrCode (data URL) }
// The endpoint enables TOTP and consumes the one-time token, so the result is
// cached in sessionStorage to survive an accidental page reload.

const API = '/api';

function showAlert(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  const text = Array.isArray(msg)
    ? msg.join('\n')
    : (msg && msg.errors ? msg.errors.join('\n') : (msg && msg.message ? msg.message : String(msg)));
  el.textContent = text;
  el.className = `alert alert-${type}`;
  el.style.display = 'block';
}

function show(id, display = '') {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

// Pull the base32 secret out of an otpauth:// URI for manual entry.
function extractSecret(otpauthUri) {
  if (!otpauthUri) return '';
  try {
    return new URL(otpauthUri).searchParams.get('secret') || '';
  } catch {
    const m = /[?&]secret=([^&]+)/i.exec(otpauthUri);
    return m ? decodeURIComponent(m[1]) : '';
  }
}

function renderSetup(data) {
  const qr = document.getElementById('totp-qr');
  if (qr && data.qrCode) qr.src = data.qrCode;

  const keyEl = document.getElementById('totp-key');
  if (keyEl) keyEl.textContent = extractSecret(data.totp_secret) || data.totp_secret || '';

  // The message carries the recovery code the first time 2FA is set up.
  if (data.message) {
    const note = document.getElementById('recovery-note');
    if (note) { note.textContent = data.message; note.style.display = 'block'; }
  }

  show('setup-content', '');
}

async function loadTotpSetup() {
  const token = new URLSearchParams(window.location.search).get('token');

  if (!token) {
    show('loading', 'none');
    showAlert('totp-error', 'Missing setup token. Please use the link from your 2FA setup email.');
    show('back-link', '');
    return;
  }

  // The setup token is single-use; re-render from cache instead of re-calling.
  const cacheKey = `totpSetup:${token}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    show('loading', 'none');
    try { renderSetup(JSON.parse(cached)); return; } catch { /* fall through to fetch */ }
  }

  try {
    const res = await fetch(`${API}/2fa/totp?token=${encodeURIComponent(token)}`);
    const data = await res.json();
    show('loading', 'none');

    if (!res.ok) {
      showAlert('totp-error', data.errors || data.message || 'Could not start TOTP setup. The link may have expired.');
      show('back-link', '');
      return;
    }

    sessionStorage.setItem(cacheKey, JSON.stringify(data));
    renderSetup(data);
  } catch {
    show('loading', 'none');
    showAlert('totp-error', 'Network error. Please try again.');
    show('back-link', '');
  }
}

function copyKey() {
  const keyEl = document.getElementById('totp-key');
  if (!keyEl || !navigator.clipboard) return;
  navigator.clipboard.writeText(keyEl.textContent.trim()).then(() => {
    const btn = document.getElementById('copy-btn');
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

document.addEventListener('DOMContentLoaded', loadTotpSetup);
