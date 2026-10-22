import { logRequest, markEndpoint } from './console.js';

// Empty = same origin (Vite dev proxy, or the Express server serving client/dist).
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

let accessToken = null;
let onTokenExpired = async () => false;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => {
  accessToken = token;
};
export const handleTokenExpired = (handler) => {
  onTokenExpired = handler;
};

export async function api(method, path, body, { retry = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const started = performance.now();
  let res;
  let data = null;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status !== 204) data = await res.json().catch(() => null);
  } catch (err) {
    data = { success: false, message: err.message };
  }

  const status = res?.status ?? 0;
  logRequest({ method, path, code: status, ms: Math.round(performance.now() - started), reqBody: body, resBody: data });
  markEndpoint(method, path, status);

  // Refresh an expired access token once, then replay the original request.
  if (status === 401 && retry && accessToken && data?.message === 'Access token expired') {
    if (await onTokenExpired()) return api(method, path, body, { retry: false });
  }
  return { ok: res?.ok ?? false, status, data };
}
