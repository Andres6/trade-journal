// BASE_URL comes from vite.config.js's `base` option (e.g. "/journal/").
// Using it here means API calls stay correct no matter what path this app
// is served under.
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '') + '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  // auth
  login: (password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  session: () => request('/auth/session'),

  // positions
  listPositions: (status) => request(`/positions${status ? `?status=${status}` : ''}`),
  getPosition: (id) => request(`/positions/${id}`),
  createPosition: (data) => request('/positions', { method: 'POST', body: JSON.stringify(data) }),
  updatePosition: (id, data) => request(`/positions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePosition: (id) => request(`/positions/${id}`, { method: 'DELETE' }),
  summary: () => request('/positions/summary'),

  // trades
  parseOrderText: (text) => request('/trades/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  createTrade: (data) => request('/trades', { method: 'POST', body: JSON.stringify(data) }),
  updateTrade: (id, data) => request(`/trades/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTrade: (id) => request(`/trades/${id}`, { method: 'DELETE' }),

  // notes
  listNotes: () => request('/notes'),
  createNote: (data) => request('/notes', { method: 'POST', body: JSON.stringify(data) }),
  updateNote: (id, data) => request(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteNote: (id) => request(`/notes/${id}`, { method: 'DELETE' }),

  // schwab
  schwabStatus: () => request('/schwab/status'),
  schwabAuthUrl: () => request('/schwab/auth-url'),
  schwabTransactions: (days) => request(`/schwab/transactions?days=${days}`),
};

export function fmtMoney(n) {
  const v = Number(n || 0);
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
