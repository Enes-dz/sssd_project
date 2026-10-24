// Admin dashboard: users + blocking, audit logs (filter/paginate), reserved usernames CRUD.

let adminUser = null;
const pageState = { users: 1, logs: 1, reserved: 1 };
let logFiltersPopulated = false;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    adminUser = await loadCurrentUser();
  } catch {
    return;
  }
  if (adminUser.role !== 'admin') {
    // Non-admins do not belong here.
    window.location.href = '/dashboard';
    return;
  }
  document.getElementById('greeting-title').textContent = `Welcome, ${adminUser.name || adminUser.username}.`;

  // Wire up delegated handlers for dynamically rendered controls.
  document.getElementById('users-tbody').addEventListener('click', onUsersClick);
  document.getElementById('reserved-list').addEventListener('click', onReservedClick);

  loadUsers(1);
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  ['users', 'logs', 'reserved'].forEach((t) => {
    document.getElementById(`tab-${t}`).style.display = t === name ? '' : 'none';
  });
  if (name === 'logs' && pageState.logs === 1 && !logFiltersPopulated) loadLogs(1);
  if (name === 'reserved' && document.getElementById('reserved-list').childElementCount === 0) loadReserved(1);
}

// ─── Pagination renderer ──────────────────────────────────────────────────────
function renderPagination(containerId, pagination, onGo) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if (!pagination) return;
  const { page, total_pages, total } = pagination;

  const prev = document.createElement('button');
  prev.className = 'btn-sm secondary';
  prev.textContent = 'Prev';
  prev.disabled = page <= 1;
  prev.onclick = () => onGo(page - 1);

  const next = document.createElement('button');
  next.className = 'btn-sm secondary';
  next.textContent = 'Next';
  next.disabled = page >= total_pages;
  next.onclick = () => onGo(page + 1);

  const label = document.createElement('span');
  label.textContent = `Page ${page} of ${total_pages} · ${total} total`;

  el.appendChild(prev);
  el.appendChild(label);
  el.appendChild(next);
}

// ═══ USERS ═══════════════════════════════════════════════════════════════════
async function loadUsers(page) {
  clearFlash('users-alert');
  pageState.users = page;
  const search = encodeURIComponent(document.getElementById('users-search').value.trim());
  const { res, data } = await apiFetch(`/admin/users?page=${page}&limit=20&search=${search}`);
  if (!res.ok) { flash('users-alert', data, 'error'); return; }

  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';
  if (!data.users.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">No users found.</td></tr>';
  } else {
    data.users.forEach((u) => {
      const tr = document.createElement('tr');
      const tf = u.two_factor || {};
      const methods = ['email', 'sms', 'totp'].filter((m) => tf[m]).join(', ') || 'none';
      const statusBadge = u.is_blocked
        ? '<span class="badge blocked">Blocked</span>'
        : '<span class="badge on">Active</span>';
      const roleBadge = `<span class="badge ${u.role === 'admin' ? 'role' : 'off'}">${escapeHtml(u.role)}</span>`;
      const actionBtn = u.is_blocked
        ? `<button class="btn-sm" data-action="unblock" data-id="${u.id}">Unblock</button>`
        : `<button class="btn-sm danger" data-action="block" data-id="${u.id}">Block</button>`;
      tr.innerHTML =
        `<td>${u.id}</td>` +
        `<td>${escapeHtml(u.name)}</td>` +
        `<td>${escapeHtml(u.username)}</td>` +
        `<td class="truncate">${escapeHtml(u.email)}</td>` +
        `<td>${roleBadge}</td>` +
        `<td>${escapeHtml(methods)}</td>` +
        `<td>${statusBadge}</td>` +
        `<td>${actionBtn}</td>`;
      tbody.appendChild(tr);
    });
  }
  renderPagination('users-pagination', data.pagination, loadUsers);
}

async function onUsersClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action; // block | unblock
  if (action === 'block' && !confirm('Block this user? They will be signed out and unable to log in.')) return;

  btn.disabled = true;
  const { res, data } = await apiFetch(`/admin/users/${id}/${action}`, { method: 'POST' });
  if (!res.ok) { flash('users-alert', data, 'error'); btn.disabled = false; return; }
  flash('users-alert', data.message, 'success');
  loadUsers(pageState.users);
}

// ═══ AUDIT LOGS ══════════════════════════════════════════════════════════════
async function loadLogs(page) {
  clearFlash('logs-alert');
  pageState.logs = page;

  const params = new URLSearchParams();
  params.set('page', page);
  params.set('limit', '25');
  const map = {
    event_type: 'f-event', action: 'f-action', status: 'f-status',
    user_id: 'f-userid', user_role: 'f-role', ip_address: 'f-ip',
    date_from: 'f-from', date_to: 'f-to',
  };
  Object.entries(map).forEach(([key, id]) => {
    const v = document.getElementById(id).value.trim();
    if (v) params.set(key, v);
  });

  const { res, data } = await apiFetch(`/admin/logs?${params.toString()}`);
  if (!res.ok) { flash('logs-alert', data, 'error'); return; }

  if (!logFiltersPopulated && data.filter_options) {
    populateSelect('f-event', data.filter_options.event_types);
    populateSelect('f-action', data.filter_options.actions);
    logFiltersPopulated = true;
  }

  const tbody = document.getElementById('logs-tbody');
  tbody.innerHTML = '';
  if (!data.logs.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row">No log entries match.</td></tr>';
  } else {
    data.logs.forEach((l) => {
      const tr = document.createElement('tr');
      const statusOk = String(l.status || '').toLowerCase().startsWith('success');
      tr.innerHTML =
        `<td>${l.id}</td>` +
        `<td class="mono">${escapeHtml(l.time_formatted || l.time)}</td>` +
        `<td>${l.user_id == null ? '—' : escapeHtml(l.user_id)}</td>` +
        `<td>${escapeHtml(l.user_role || '—')}</td>` +
        `<td>${escapeHtml(l.event_type || '—')}</td>` +
        `<td>${escapeHtml(l.action || '—')}</td>` +
        `<td><span class="badge ${statusOk ? 'on' : 'blocked'}">${escapeHtml(l.status || '—')}</span></td>` +
        `<td class="mono">${escapeHtml(l.ip_address || '—')}</td>` +
        `<td class="truncate" title="${escapeHtml(l.user_agent || '')}">${escapeHtml(l.user_agent || '—')}</td>`;
      tbody.appendChild(tr);
    });
  }
  renderPagination('logs-pagination', data.pagination, loadLogs);
}

function populateSelect(id, values) {
  const sel = document.getElementById(id);
  (values || []).forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

function resetLogFilters() {
  ['f-event', 'f-action', 'f-status', 'f-userid', 'f-role', 'f-ip', 'f-from', 'f-to']
    .forEach((id) => { document.getElementById(id).value = ''; });
  loadLogs(1);
}

// ═══ RESERVED USERNAMES ══════════════════════════════════════════════════════
async function loadReserved(page) {
  clearFlash('reserved-alert');
  pageState.reserved = page;
  const search = encodeURIComponent(document.getElementById('reserved-search').value.trim());
  const { res, data } = await apiFetch(`/admin/reserved-usernames?page=${page}&limit=20&search=${search}`);
  if (!res.ok) { flash('reserved-alert', data, 'error'); return; }

  const list = document.getElementById('reserved-list');
  list.innerHTML = '';
  if (!data.reserved_usernames.length) {
    list.innerHTML = '<div class="empty-row">No reserved usernames.</div>';
  } else {
    data.reserved_usernames.forEach((name) => {
      const item = document.createElement('div');
      item.className = 'reserved-item';
      item.innerHTML =
        `<span class="uname">${escapeHtml(name)}</span>` +
        `<span class="actions">` +
        `<button class="btn-sm secondary" data-action="edit" data-username="${escapeHtml(name)}">Rename</button>` +
        `<button class="btn-sm danger" data-action="delete" data-username="${escapeHtml(name)}">Delete</button>` +
        `</span>`;
      list.appendChild(item);
    });
  }
  renderPagination('reserved-pagination', data.pagination, loadReserved);
}

async function addReserved() {
  clearFlash('reserved-alert');
  const input = document.getElementById('reserved-new');
  const username = input.value.trim();
  if (!username) { flash('reserved-alert', 'Enter a username to reserve.', 'error'); return; }

  const { res, data } = await apiFetch('/admin/reserved-usernames', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
  if (!res.ok) { flash('reserved-alert', data, 'error'); return; }
  input.value = '';
  flash('reserved-alert', data.message, 'success');
  loadReserved(pageState.reserved);
}

async function onReservedClick(e) {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const username = btn.dataset.username;
  const action = btn.dataset.action;

  if (action === 'delete') {
    if (!confirm(`Delete reserved username "${username}"?`)) return;
    const { res, data } = await apiFetch(`/admin/reserved-usernames/${encodeURIComponent(username)}`, { method: 'DELETE' });
    if (!res.ok) { flash('reserved-alert', data, 'error'); return; }
    flash('reserved-alert', data.message, 'success');
    loadReserved(pageState.reserved);
  } else if (action === 'edit') {
    const next = prompt(`Rename reserved username "${username}" to:`, username);
    if (next == null) return;
    const newUsername = next.trim();
    if (!newUsername || newUsername === username) return;
    const { res, data } = await apiFetch(`/admin/reserved-usernames/${encodeURIComponent(username)}`, {
      method: 'PUT',
      body: JSON.stringify({ username: newUsername }),
    });
    if (!res.ok) { flash('reserved-alert', data, 'error'); return; }
    flash('reserved-alert', data.message, 'success');
    loadReserved(pageState.reserved);
  }
}
