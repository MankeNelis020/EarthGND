const BASE = '/api';

function getToken() {
  return sessionStorage.getItem('acltrack_token');
}

export function setToken(token) {
  sessionStorage.setItem('acltrack_token', token);
}

export function clearToken() {
  sessionStorage.removeItem('acltrack_token');
  sessionStorage.removeItem('acltrack_user');
}

export function getUser() {
  const raw = sessionStorage.getItem('acltrack_user');
  return raw ? JSON.parse(raw) : null;
}

export function setUser(user) {
  sessionStorage.setItem('acltrack_user', JSON.stringify(user));
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Sessie verlopen');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  login: (email, wachtwoord) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, wachtwoord }) }),

  me: () => request('/auth/me'),

  wachtwoordWijzigen: (huidig, nieuw) =>
    request('/auth/wachtwoord', { method: 'POST', body: JSON.stringify({ huidig, nieuw }) }),

  gebruikers: () => request('/auth/gebruikers'),
  gebruikerAanmaken: (data) =>
    request('/auth/gebruikers', { method: 'POST', body: JSON.stringify(data) }),
  gebruikerBijwerken: (id, data) =>
    request(`/auth/gebruikers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  patienten: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/patienten${q ? '?' + q : ''}`);
  },
  patientAanmaken: (data) =>
    request('/patienten', { method: 'POST', body: JSON.stringify(data) }),
  patient: (id) => request(`/patienten/${id}`),
  patientBijwerken: (id, data) =>
    request(`/patienten/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  patientVerwijderen: (id) =>
    request(`/patienten/${id}`, { method: 'DELETE' }),

  meetpuntToevoegen: (patientId, data) =>
    request(`/patienten/${patientId}/meetpunten`, { method: 'POST', body: JSON.stringify(data) }),
  meetpuntBijwerken: (patientId, mid, data) =>
    request(`/patienten/${patientId}/meetpunten/${mid}`, { method: 'PATCH', body: JSON.stringify(data) }),
  meetpuntVerwijderen: (patientId, mid) =>
    request(`/patienten/${patientId}/meetpunten/${mid}`, { method: 'DELETE' }),

  statistieken: () => request('/statistieken')
};
