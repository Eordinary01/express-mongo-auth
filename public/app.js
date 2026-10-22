(() => {
  'use strict';

  const ENDPOINTS = [
    { method: 'GET', path: '/api/health', desc: 'API health check' },
    { method: 'POST', path: '/api/auth/register', desc: 'Create an account' },
    { method: 'POST', path: '/api/auth/login', desc: 'Log in, get tokens' },
    { method: 'POST', path: '/api/auth/refresh', desc: 'Rotate refresh token (cookie)' },
    { method: 'GET', path: '/api/auth/me', desc: 'Current user (Bearer)' },
    { method: 'PATCH', path: '/api/auth/password', desc: 'Change password' },
    { method: 'POST', path: '/api/auth/logout', desc: 'Revoke this session' },
    { method: 'POST', path: '/api/auth/logout-all', desc: 'Revoke all sessions' },
    { method: 'GET', path: '/api/users', desc: 'List users (admin)' },
    { method: 'PATCH', path: '/api/users/:id/role', desc: 'Change role (admin)' },
    { method: 'DELETE', path: '/api/users/:id', desc: 'Delete user (admin)' },
  ];

  // Non-sensitive hint so we only try to restore a session when a refresh cookie may exist.
  const SESSION_HINT = 'demo:hasSession';

  const state = { accessToken: null, user: null, page: 1, limit: 5, total: 0 };

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    children.flat().forEach((c) => node.append(c instanceof Node ? c : document.createTextNode(c)));
    return node;
  };

  // ---------- Endpoint catalog ----------
  const endpointKey = (method, path) => {
    const template = path.split('?')[0].replace(/\/[a-f0-9]{24}(?=\/|$)/g, '/:id');
    return `${method} ${template}`;
  };
  const statusEls = {};

  function renderEndpoints() {
    const list = $('#endpoints');
    ENDPOINTS.forEach(({ method, path, desc }) => {
      const status = el('span', { class: 'status' }, '—');
      statusEls[`${method} ${path}`] = status;
      list.append(
        el(
          'li',
          {},
          el('span', { class: `method ${method}` }, method),
          el('span', {}, el('code', {}, path), el('span', { class: 'desc' }, desc)),
          status,
        ),
      );
    });
  }

  function markEndpoint(method, path, code) {
    const status = statusEls[endpointKey(method, path)];
    if (!status) return;
    status.textContent = code || 'ERR';
    status.className = `status s${String(code || 0)[0]}`;
  }

  // ---------- Request log ----------
  function logRequest({ method, path, code, ms, reqBody, resBody }) {
    const log = $('#log');
    log.querySelector('.empty')?.remove();
    const details = el('details', {}, el('summary', {}, 'Request / response'));
    if (reqBody) details.append(el('pre', {}, `// request\n${JSON.stringify(redact(reqBody), null, 2)}`));
    details.append(el('pre', {}, `// response\n${JSON.stringify(resBody, null, 2) ?? '(empty)'}`));

    log.prepend(
      el(
        'li',
        {},
        el(
          'div',
          { class: 'line' },
          el('span', { class: `method ${method}` }, method),
          el('code', {}, path),
          el('span', { class: `status s${String(code || 0)[0]}` }, code || 'ERR'),
          el('span', { class: 'time' }, `${ms} ms · ${new Date().toLocaleTimeString()}`),
        ),
        details,
      ),
    );
  }

  function redact(body) {
    const copy = { ...body };
    ['password', 'currentPassword', 'newPassword'].forEach((k) => {
      if (copy[k]) copy[k] = '••••••••';
    });
    return copy;
  }

  function resetLog() {
    $('#log').replaceChildren(el('li', { class: 'empty' }, 'No requests yet. Interact with the API on the left.'));
  }

  // ---------- API client ----------
  async function api(method, path, body, { retry = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;

    const started = performance.now();
    let res;
    let data = null;
    try {
      res = await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status !== 204) data = await res.json().catch(() => null);
    } catch (err) {
      data = { success: false, message: err.message };
    }
    const code = res?.status ?? 0;
    logRequest({ method, path, code, ms: Math.round(performance.now() - started), reqBody: body, resBody: data });
    markEndpoint(method, path, code);

    // Transparently refresh an expired access token once, then replay the request.
    if (code === 401 && retry && state.accessToken && data?.message === 'Access token expired') {
      if (await refresh({ silent: true })) return api(method, path, body, { retry: false });
    }
    return { ok: res?.ok ?? false, status: code, data };
  }

  // ---------- Session ----------
  function setSession({ accessToken, user }) {
    if (accessToken !== undefined) state.accessToken = accessToken;
    if (user !== undefined) state.user = user;
    localStorage.setItem(SESSION_HINT, '1');
    render();
  }

  function clearSession() {
    state.accessToken = null;
    state.user = null;
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
    state.accessToken = data.accessToken;
    if (!silent) toast('Tokens rotated — new access & refresh token issued', 'ok');
    render();
    return true;
  }

  async function loadMe() {
    const { ok, data } = await api('GET', '/api/auth/me');
    if (ok) setSession({ user: data.user });
    else if (data) toast(data.message, 'err');
    return ok;
  }

  async function loadUsers() {
    const { ok, data } = await api('GET', `/api/users?page=${state.page}&limit=${state.limit}`);
    if (!ok) {
      toast(data?.message || 'Could not load users', 'err');
      return;
    }
    state.total = data.total;
    renderUsers(data.users);
  }

  // ---------- Rendering ----------
  function render() {
    const signedIn = Boolean(state.accessToken && state.user);
    $('#auth-card').classList.toggle('hidden', signedIn);
    $('#profile-card').classList.toggle('hidden', !signedIn);
    $('#password-card').classList.toggle('hidden', !signedIn);
    const isAdmin = signedIn && state.user.role === 'admin';
    $('#admin-card').classList.toggle('hidden', !isAdmin);
    $('#forbidden-card').classList.toggle('hidden', !signedIn || isAdmin);
    if (!signedIn) return;

    const { user } = state;
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
    if (!state.accessToken) return;
    const payload = decodeJwt(state.accessToken);
    const secs = payload ? Math.max(0, Math.round(payload.exp - Date.now() / 1000)) : 0;
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    $('#p-token').textContent = `${state.accessToken.slice(0, 18)}… (expires in ${mm}:${ss})`;
  }

  function renderUsers(users) {
    const body = $('#users-body');
    body.replaceChildren();
    users.forEach((u) => {
      const isSelf = u.id === state.user.id;
      const select = el(
        'select',
        { 'aria-label': `Role for ${u.email}` },
        ...['user', 'admin'].map((r) => {
          const opt = el('option', { value: r }, r);
          if (r === u.role) opt.selected = true;
          return opt;
        }),
      );
      select.disabled = isSelf;
      select.addEventListener('change', () => changeRole(u, select));

      const del = el('button', { class: 'btn small danger' }, 'Delete');
      del.disabled = isSelf;
      del.addEventListener('click', () => deleteUser(u));

      body.append(
        el(
          'tr',
          {},
          el('td', {}, isSelf ? `${u.name} (you)` : u.name),
          el('td', {}, u.email),
          el('td', {}, select),
          el('td', {}, new Date(u.createdAt).toLocaleDateString()),
          el('td', {}, del),
        ),
      );
    });
    const pages = Math.max(1, Math.ceil(state.total / state.limit));
    $('#page-info').textContent = `Page ${state.page} of ${pages} · ${state.total} users`;
    $('#prev-page').disabled = state.page <= 1;
    $('#next-page').disabled = state.page >= pages;
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
    if (!window.confirm(`Delete ${user.email}?`)) return;
    const { ok, data } = await api('DELETE', `/api/users/${user.id}`);
    if (ok) toast(`Deleted ${user.email}`, 'ok');
    else toast(data?.message || 'Delete failed', 'err');
    if (ok && state.page > 1 && state.total - 1 <= (state.page - 1) * state.limit) state.page -= 1;
    loadUsers();
  }

  let toastTimer;
  function toast(message, kind = '') {
    const t = $('#toast');
    t.textContent = message;
    t.className = `toast ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  function formatErrors(data) {
    if (!data) return 'Request failed';
    if (data.errors?.length) return data.errors.map((e) => `${e.field}: ${e.message}`).join(' · ');
    return data.message;
  }

  // ---------- Event wiring ----------
  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function wire() {
    document.querySelectorAll('.tab').forEach((tab) =>
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        document.querySelectorAll('[data-panel]').forEach((p) =>
          p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab),
        );
      }),
    );

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { ok, data } = await api('POST', '/api/auth/login', formData(e.target));
      if (!ok) return toast(formatErrors(data), 'err');
      e.target.reset();
      setSession(data);
      toast(`Welcome back, ${data.user.name}`, 'ok');
      if (data.user.role === 'admin') loadUsers();
    });

    $('#register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { ok, data } = await api('POST', '/api/auth/register', formData(e.target));
      if (!ok) return toast(formatErrors(data), 'err');
      e.target.reset();
      setSession(data);
      toast(`Account created — welcome, ${data.user.name}`, 'ok');
    });

    $('#password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { ok, data } = await api('PATCH', '/api/auth/password', formData(e.target));
      if (!ok) return toast(formatErrors(data), 'err');
      e.target.reset();
      setSession({ accessToken: data.accessToken });
      toast('Password updated — all other sessions were revoked', 'ok');
    });

    $('#btn-me').addEventListener('click', async () => {
      if (await loadMe()) toast('Profile reloaded', 'ok');
    });
    $('#btn-refresh').addEventListener('click', () => refresh());
    $('#btn-logout').addEventListener('click', async () => {
      await api('POST', '/api/auth/logout');
      clearSession();
      toast('Logged out', 'ok');
    });
    $('#btn-logout-all').addEventListener('click', async () => {
      const { ok, data } = await api('POST', '/api/auth/logout-all');
      clearSession();
      toast(ok ? 'All sessions revoked' : data?.message, ok ? 'ok' : 'err');
    });
    $('#btn-try-admin').addEventListener('click', async () => {
      const { status, data } = await api('GET', '/api/users');
      toast(`${status}: ${data?.message}`, status === 403 ? 'ok' : 'err');
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
    const health = $('#health');
    const { ok } = await api('GET', '/api/health');
    health.classList.toggle('ok', ok);
    health.classList.toggle('down', !ok);
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
})();
