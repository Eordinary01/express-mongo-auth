import './styles.css';
import { $, $$, el, toast, initials } from './dom.js';
import { renderEndpoints, resetLog } from './console.js';
import { api, getAccessToken, setAccessToken, handleTokenExpired } from './api.js';

// Non-sensitive hint so we only try to restore a session when a refresh cookie may exist.
const SESSION_HINT = 'demo:hasSession';
const PAGE_SIZE = 5;

const state = { user: null, page: 1, total: 0 };

const PASSWORD_RULES = {
  length: (v) => v.length >= 8,
  upper: (v) => /[A-Z]/.test(v),
  lower: (v) => /[a-z]/.test(v),
  number: (v) => /\d/.test(v),
};

// ---------- Session ----------
function setSession({ accessToken, user }) {
  if (accessToken !== undefined) setAccessToken(accessToken);
  if (user !== undefined) state.user = user;
  localStorage.setItem(SESSION_HINT, '1');
  render();
}

function clearSession() {
  setAccessToken(null);
  state.user = null;
  state.page = 1;
  localStorage.removeItem(SESSION_HINT);
  render();
}

async function refresh({ silent = false } = {}) {
  const { ok, data } = await api('POST', '/api/auth/refresh', null, { retry: false });
  if (!ok) {
    if (!silent) toast(data?.message || 'Refresh failed', 'err');
    clearSession();
    return false;
  }
  setAccessToken(data.accessToken);
  if (!silent) toast('Tokens rotated: new access and refresh token issued', 'ok');
  render();
  return true;
}
handleTokenExpired(() => refresh({ silent: true }));

async function loadMe() {
  const { ok, data } = await api('GET', '/api/auth/me');
  if (ok) setSession({ user: data.user });
  else if (data) toast(data.message, 'err');
  return ok;
}

async function logout(path, message) {
  const { ok, data } = await api('POST', path);
  clearSession();
  toast(ok ? message : data?.message || 'Logged out locally', ok ? 'ok' : 'err');
}

// ---------- Rendering ----------
function render() {
  const { user } = state;
  const signedIn = Boolean(getAccessToken() && user);
  const isAdmin = signedIn && user.role === 'admin';

  $('#signed-out').classList.toggle('hidden', signedIn);
  $('#signed-in').classList.toggle('hidden', !signedIn);
  $('#nav-user').classList.toggle('hidden', !signedIn);
  $('#admin-card').classList.toggle('hidden', !isAdmin);
  $('#forbidden-card').classList.toggle('hidden', !signedIn || isAdmin);
  if (!signedIn) return;

  $('#nav-avatar').textContent = initials(user.name);
  $('#nav-name').textContent = user.name;
  $('#p-avatar').textContent = initials(user.name);
  $('#p-name').textContent = user.name;
  $('#p-email').textContent = user.email;
  $('#p-id').textContent = user.id;
  $('#p-created').textContent = new Date(user.createdAt).toLocaleString();
  const badge = $('#role-badge');
  badge.textContent = user.role;
  badge.className = `badge ${user.role}`;
  renderTokenInfo();
}

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function renderTokenInfo() {
  const token = getAccessToken();
  if (!token || !state.user) return;
  const payload = decodeJwt(token);
  const now = Date.now() / 1000;
  const left = payload ? Math.max(0, Math.round(payload.exp - now)) : 0;
  const lifetime = payload ? payload.exp - payload.iat : 1;
  const mm = String(Math.floor(left / 60)).padStart(2, '0');
  const ss = String(left % 60).padStart(2, '0');

  $('#token-exp').textContent = left ? `expires in ${mm}:${ss}` : 'expired';
  $('#p-token').textContent = `${token.slice(0, 24)}…`;
  const bar = $('#token-bar');
  bar.style.width = `${Math.min(100, (left / lifetime) * 100)}%`;
  bar.classList.toggle('low', left < 60);
}

// ---------- Admin ----------
async function loadUsers() {
  const { ok, data } = await api('GET', `/api/users?page=${state.page}&limit=${PAGE_SIZE}`);
  if (!ok) return toast(data?.message || 'Could not load users', 'err');
  state.total = data.total;
  renderUsers(data.users);
}

function renderUsers(users) {
  const body = $('#users-body');
  body.replaceChildren();
  users.forEach((u) => {
    const isSelf = u.id === state.user.id;
    const select = el(
      'select',
      { class: 'select', 'aria-label': `Role for ${u.email}`, disabled: isSelf },
      ['user', 'admin'].map((role) => el('option', { value: role, selected: role === u.role }, role)),
    );
    select.addEventListener('change', () => changeRole(u, select));

    body.append(
      el(
        'tr',
        {},
        el(
          'td',
          {},
          el(
            'div',
            { class: 'user-cell' },
            el('span', { class: 'avatar sm' }, initials(u.name)),
            el(
              'span',
              {},
              el('span', { class: 'user-name' }, u.name, isSelf ? el('span', { class: 'you' }, 'you') : null),
              el('span', { class: 'user-email' }, u.email),
            ),
          ),
        ),
        el('td', {}, select),
        el('td', { class: 'subtle' }, new Date(u.createdAt).toLocaleDateString()),
        el(
          'td',
          { class: 'right' },
          el(
            'div',
            { class: 'row-actions' },
            el('button', { class: 'btn ghost sm', type: 'button', onclick: () => viewUser(u) }, 'View'),
            el(
              'button',
              { class: 'btn danger sm', type: 'button', disabled: isSelf, onclick: () => deleteUser(u) },
              'Delete',
            ),
          ),
        ),
      ),
    );
  });

  const pages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  $('#page-info').textContent = `${state.total} user${state.total === 1 ? '' : 's'} · page ${state.page} of ${pages}`;
  $('#prev-page').disabled = state.page <= 1;
  $('#next-page').disabled = state.page >= pages;
}

async function viewUser(user) {
  const { ok, data } = await api('GET', `/api/users/${user.id}`);
  const panel = $('#user-detail');
  if (!ok) {
    panel.classList.add('hidden');
    return toast(data?.message || 'Could not load user', 'err');
  }
  const u = data.user;
  panel.replaceChildren(
    el(
      'div',
      { class: 'detail-head' },
      el('span', { class: 'endpoint-hint' }, el('span', { class: 'method GET' }, 'GET'), el('code', {}, `/api/users/${u.id}`)),
      el('button', { class: 'btn ghost sm', type: 'button', onclick: () => panel.classList.add('hidden') }, 'Close'),
    ),
    el(
      'dl',
      { class: 'meta' },
      [
        ['Name', u.name],
        ['Email', u.email],
        ['Role', u.role],
        ['User ID', u.id],
        ['Created', new Date(u.createdAt).toLocaleString()],
        ['Updated', new Date(u.updatedAt).toLocaleString()],
      ].map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))),
    ),
  );
  panel.classList.remove('hidden');
}

async function changeRole(user, select) {
  const { ok, data } = await api('PATCH', `/api/users/${user.id}/role`, { role: select.value });
  if (ok) toast(`${user.email} is now ${data.user.role}`, 'ok');
  else {
    toast(data?.message || 'Role change failed', 'err');
    select.value = user.role;
  }
  loadUsers();
}

async function deleteUser(user) {
  if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return;
  const { ok, data } = await api('DELETE', `/api/users/${user.id}`);
  if (ok) toast(`Deleted ${user.email}`, 'ok');
  else toast(data?.message || 'Delete failed', 'err');
  if (ok && state.page > 1 && state.total - 1 <= (state.page - 1) * PAGE_SIZE) state.page -= 1;
  $('#user-detail').classList.add('hidden');
  loadUsers();
}

// ---------- Forms ----------
const formData = (form) => Object.fromEntries(new FormData(form).entries());

function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach((n) => n.remove());
  form.querySelectorAll('.invalid').forEach((n) => n.classList.remove('invalid'));
}

// Show zod validation errors next to their inputs; fall back to a toast.
function showErrors(form, data) {
  clearFieldErrors(form);
  const errors = data?.errors || [];
  let placed = 0;
  errors.forEach(({ field, message }) => {
    const input = form.querySelector(`[name="${field}"]`);
    if (!input) return;
    input.classList.add('invalid');
    input.closest('.field').append(el('p', { class: 'field-error' }, message));
    placed += 1;
  });
  if (!placed) toast(data?.message || 'Request failed', 'err');
}

function onSubmit(selector, handler) {
  const form = $(selector);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await handler(form);
    } finally {
      button.disabled = false;
    }
  });
}

function selectTab(name) {
  $$('[data-tab]').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
    t.setAttribute('aria-selected', String(t.dataset.tab === name));
  });
  $$('[data-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
  const login = name === 'login';
  $('#auth-title').textContent = login ? 'Sign in to your account' : 'Create an account';
  $('#auth-subtitle').textContent = login
    ? 'Use your email and password to get an access token.'
    : 'New accounts always start with the user role.';
}

function selectConsole(name) {
  $$('[data-console]').forEach((t) => {
    t.classList.toggle('active', t.dataset.console === name);
    t.setAttribute('aria-selected', String(t.dataset.console === name));
  });
  $$('[data-console-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.consolePanel !== name));
}

function wire() {
  $$('[data-tab]').forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
  $$('[data-console]').forEach((tab) => tab.addEventListener('click', () => selectConsole(tab.dataset.console)));

  $$('[data-reveal]').forEach((button) =>
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.reveal);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      button.textContent = show ? 'Hide' : 'Show';
    }),
  );

  $('#register-password').addEventListener('input', (e) => {
    $$('#pw-rules [data-rule]').forEach((li) => li.classList.toggle('met', PASSWORD_RULES[li.dataset.rule](e.target.value)));
  });

  onSubmit('#login-form', async (form) => {
    const { ok, data } = await api('POST', '/api/auth/login', formData(form));
    if (!ok) return showErrors(form, data);
    clearFieldErrors(form);
    form.reset();
    setSession(data);
    toast(`Welcome back, ${data.user.name}`, 'ok');
    if (data.user.role === 'admin') loadUsers();
  });

  onSubmit('#register-form', async (form) => {
    const { ok, data } = await api('POST', '/api/auth/register', formData(form));
    if (!ok) return showErrors(form, data);
    clearFieldErrors(form);
    form.reset();
    $$('#pw-rules [data-rule]').forEach((li) => li.classList.remove('met'));
    setSession(data);
    toast(`Account created. Welcome, ${data.user.name}`, 'ok');
  });

  onSubmit('#password-form', async (form) => {
    const { ok, data } = await api('PATCH', '/api/auth/password', formData(form));
    if (!ok) return showErrors(form, data);
    clearFieldErrors(form);
    form.reset();
    setSession({ accessToken: data.accessToken });
    toast('Password updated. All other sessions were revoked', 'ok');
  });

  $('#btn-me').addEventListener('click', async () => {
    if (await loadMe()) toast('Profile reloaded', 'ok');
  });
  $('#btn-refresh').addEventListener('click', () => refresh());
  $('#btn-logout').addEventListener('click', () => logout('/api/auth/logout', 'Logged out'));
  $('#nav-logout').addEventListener('click', () => logout('/api/auth/logout', 'Logged out'));
  $('#btn-logout-all').addEventListener('click', () => logout('/api/auth/logout-all', 'All sessions revoked'));
  $('#btn-try-admin').addEventListener('click', async () => {
    const { status, data } = await api('GET', '/api/users');
    toast(`${status} ${data?.message || ''}`.trim(), status === 403 ? 'ok' : 'err');
  });

  $('#btn-users').addEventListener('click', loadUsers);
  $('#prev-page').addEventListener('click', () => {
    state.page -= 1;
    loadUsers();
  });
  $('#next-page').addEventListener('click', () => {
    state.page += 1;
    loadUsers();
  });
  $('#btn-clear-log').addEventListener('click', resetLog);
}

async function checkHealth() {
  const { ok } = await api('GET', '/api/health');
  const pill = $('#health');
  pill.classList.toggle('ok', ok);
  pill.classList.toggle('down', !ok);
  $('#health-text').textContent = ok ? 'API online' : 'API unreachable';
}

async function init() {
  renderEndpoints();
  resetLog();
  wire();
  render();
  setInterval(renderTokenInfo, 1000);
  await checkHealth();
  // Restore a session from the httpOnly refresh cookie, if there is one.
  if (localStorage.getItem(SESSION_HINT) && (await refresh({ silent: true }))) {
    await loadMe();
    if (state.user?.role === 'admin') loadUsers();
  }
}

init();
