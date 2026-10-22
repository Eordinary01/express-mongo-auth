import { $, el } from './dom.js';

export const ENDPOINTS = [
  { group: 'Public', method: 'GET', path: '/api/health', desc: 'API health check' },
  { group: 'Public', method: 'POST', path: '/api/auth/register', desc: 'Create an account' },
  { group: 'Public', method: 'POST', path: '/api/auth/login', desc: 'Log in and receive tokens' },
  { group: 'Session', method: 'POST', path: '/api/auth/refresh', desc: 'Rotate refresh token (cookie)' },
  { group: 'Session', method: 'GET', path: '/api/auth/me', desc: 'Current user (Bearer)' },
  { group: 'Session', method: 'PATCH', path: '/api/auth/password', desc: 'Change password' },
  { group: 'Session', method: 'POST', path: '/api/auth/logout', desc: 'Revoke this session' },
  { group: 'Session', method: 'POST', path: '/api/auth/logout-all', desc: 'Revoke all sessions' },
  { group: 'Admin', method: 'GET', path: '/api/users', desc: 'List users (paginated)' },
  { group: 'Admin', method: 'GET', path: '/api/users/:id', desc: 'Get one user' },
  { group: 'Admin', method: 'PATCH', path: '/api/users/:id/role', desc: 'Change a user’s role' },
  { group: 'Admin', method: 'DELETE', path: '/api/users/:id', desc: 'Delete a user' },
];

const statusEls = {};
let logCount = 0;

// Map a concrete request path back to its route template, e.g. /api/users/<ObjectId> -> /api/users/:id.
const endpointKey = (method, path) =>
  `${method} ${path.split('?')[0].replace(/\/[a-f0-9]{24}(?=\/|$)/g, '/:id')}`;

const statusClass = (code) => `status s${String(code || 0)[0]}`;

export function renderEndpoints() {
  const root = $('#endpoints');
  const groups = [...new Set(ENDPOINTS.map((e) => e.group))];
  groups.forEach((group) => {
    const list = el('ul', { class: 'endpoints' });
    ENDPOINTS.filter((e) => e.group === group).forEach(({ method, path, desc }) => {
      const status = el('span', { class: 'status', title: 'Last status code' }, '—');
      statusEls[`${method} ${path}`] = status;
      list.append(
        el(
          'li',
          {},
          el('span', { class: `method ${method}` }, method),
          el('span', { class: 'endpoint-text' }, el('code', {}, path), el('span', { class: 'desc' }, desc)),
          status,
        ),
      );
    });
    root.append(el('section', { class: 'endpoint-group' }, el('h3', {}, group), list));
  });
  $('#endpoint-count').textContent = ENDPOINTS.length;
}

export function markEndpoint(method, path, code) {
  const status = statusEls[endpointKey(method, path)];
  if (!status) return;
  status.textContent = code || 'ERR';
  status.className = statusClass(code);
}

// Never render secrets: passwords are masked and tokens truncated.
export function redact(body) {
  if (!body || typeof body !== 'object') return body;
  const copy = { ...body };
  ['password', 'currentPassword', 'newPassword'].forEach((key) => {
    if (copy[key]) copy[key] = '••••••••';
  });
  ['accessToken', 'refreshToken'].forEach((key) => {
    if (typeof copy[key] === 'string') copy[key] = `${copy[key].slice(0, 12)}…[redacted]`;
  });
  return copy;
}

const pretty = (value) => JSON.stringify(redact(value), null, 2) ?? '(empty)';

export function logRequest({ method, path, code, ms, reqBody, resBody }) {
  const log = $('#log');
  log.querySelector('.empty')?.remove();

  const details = el('details', {}, el('summary', {}, 'Request & response'));
  if (reqBody) details.append(el('pre', {}, `// request\n${pretty(reqBody)}`));
  details.append(el('pre', {}, `// response\n${pretty(resBody)}`));

  log.prepend(
    el(
      'li',
      {},
      el(
        'div',
        { class: 'line' },
        el('span', { class: `method ${method}` }, method),
        el('code', { class: 'line-path' }, path),
        el('span', { class: statusClass(code) }, code || 'ERR'),
      ),
      el('div', { class: 'line-meta' }, `${ms} ms · ${new Date().toLocaleTimeString()}`),
      details,
    ),
  );
  logCount += 1;
  $('#log-count').textContent = logCount;
}

export function resetLog() {
  logCount = 0;
  $('#log-count').textContent = '0';
  $('#log').replaceChildren(el('li', { class: 'empty' }, 'No requests yet. Interact with the API to see traffic here.'));
}
