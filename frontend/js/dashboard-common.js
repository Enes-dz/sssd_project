// Shared helpers for the post-login dashboards (user + admin).
const API = '/api';

// ─── Token storage (session-scoped, never localStorage) ────────────────────────
function getAccessToken() { return sessionStorage.getItem('access_token'); }
function storeAccessToken(t) { sessionStorage.setItem('access_token', t); }
function clearAccessToken() { sessionStorage.removeItem('access_token'); }

// ─── Safe rendering (defends against stored XSS in user-controlled fields) ──────
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function redirectToLogin() {
  clearAccessToken();
  window.location.href = '/front/login.html';
}

// Attempt a single silent refresh using the httpOnly refresh-token cookie.
let _refreshing = null;
async function tryRefresh() {
  if (_refreshing) return _refreshing;
  _refreshing = (async () => {
    try {
      const res = await fetch(`${API}/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return false;
      const data = await res.json();
      if (data.access_token) { storeAccessToken(data.access_token); return true; }
      return false;
    } catch {
      return false;
    } finally {
      _refreshing = null;
    }
  })();
  return _refreshing;
}

/**
 * fetch wrapper that attaches the access token in the "auth" header and
 * transparently refreshes once on a 401 before giving up.
 * Returns { res, data }.
 */
async function apiFetch(path, options = {}, _retried = false) {
  const token = getAccessToken();
  if (!token) { redirectToLogin(); throw new Error('not_authenticated'); }

  const headers = Object.assign({}, options.headers || {}, { 'auth': token });
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });

  if (res.status === 401 && !_retried) {
    const ok = await tryRefresh();
    if (ok) return apiFetch(path, options, true);
    redirectToLogin();
    throw new Error('session_expired');
  }

  let data = {};
  try { data = await res.json(); } catch { /* no body */ }
  return { res, data };
}

async function doLogout() {
  try {
    await fetch(`${API}/logout`, { method: 'POST', credentials: 'include' });
  } catch { /* ignore network errors — we clear local state regardless */ }
  redirectToLogin();
}

// Toast-style flash message into a target element id.
function flash(id, msg, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  const text = Array.isArray(msg) ? msg.join(' ') : (msg && msg.errors ? msg.errors.join(' ') : (msg && msg.message ? msg.message : String(msg)));
  el.textContent = text;
  el.className = `alert alert-${type}`;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 5000);
}
function clearFlash(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

// Loads /me and guards the page. Returns the user object or redirects to login.
async function loadCurrentUser() {
  const { res, data } = await apiFetch('/me');
  if (!res.ok || data.status !== 'success') { redirectToLogin(); throw new Error('unauthorized'); }
  return data;
}
