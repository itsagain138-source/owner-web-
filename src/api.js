const CORE_URL = (import.meta.env.VITE_API_BASE_URL_CORE || import.meta.env.VITE_API_BASE_URL_GATEWAY || 'https://ms-security-gateway.onrender.com').replace(/\/+$/, '');
const OPS_URL = (import.meta.env.VITE_API_BASE_URL_OPERATIONS || import.meta.env.VITE_API_BASE_URL_GATEWAY || 'https://ms-security-gateway.onrender.com').replace(/\/+$/, '');
const REALTIME_URL = (import.meta.env.VITE_API_BASE_URL_REALTIME || import.meta.env.VITE_API_BASE_URL_GATEWAY || 'https://ms-security-gateway.onrender.com').replace(/\/+$/, '');
const MEDIA_URL = (import.meta.env.VITE_API_BASE_URL_MEDIA || import.meta.env.VITE_API_BASE_URL_GATEWAY || 'https://ms-security-gateway.onrender.com').replace(/\/+$/, '');

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
    method: options.method || 'GET',
    body: options.body,
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      detail = data.detail || data.message || detail;
    } catch (_) {}
    throw new Error(detail);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export async function login(email, password) {
  return request(CORE_URL, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export async function loadOwnerData(token) {
  const [
    overview,
    users,
    sites,
    documents,
    attendance,
    controls,
    live,
    grooming,
    overtime,
    alerts,
    fraud,
    activity,
  ] = await Promise.all([
    request(CORE_URL, '/api/v1/owner/overview', { token }),
    request(CORE_URL, '/api/v1/owner/users', { token }),
    request(CORE_URL, '/api/v1/owner/sites', { token }),
    request(CORE_URL, '/api/v1/owner/documents', { token }),
    request(OPS_URL, '/api/v1/attendance/list', { token }),

    request(CORE_URL, '/api/v1/controls', { token }),
    request(REALTIME_URL, '/api/v1/tracking/live', { token }),
    request(OPS_URL, '/api/v1/grooming/list', { token }),
    request(OPS_URL, '/api/v1/overtime/list', { token }),
    request(REALTIME_URL, '/api/v1/alerts/list', { token }),
    request(REALTIME_URL, '/api/v1/owner/fraud', { token }),
    request(REALTIME_URL, '/api/v1/owner/activity', { token }),
  ]);

  return {
    overview,
    users,
    sites,
    documents,
    attendance,
    controls,
    live,
    grooming,
    overtime,
    alerts,
    fraud,
    activity,
  };
}

export async function updateControls(token, payload) {
  return request(CORE_URL, '/api/v1/controls', {
    token,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getStorageStats(token) {
  return request(CORE_URL, '/api/v1/storage/stats', { token });
}

export async function getSystemTelemetry(token) {
  return request(CORE_URL, '/api/v1/owner/telemetry', { token });
}

export async function getOpsTelemetry(token) {
  return request(REALTIME_URL, '/api/v1/owner/ops-telemetry', { token });
}


export async function cleanupStorage(token) {
  return request(OPS_URL, '/api/v1/owner/storage/cleanup', {
    token,
    method: 'POST',
  });
}

export async function reviewDocument(token, documentId, decision, rejectionReason = '') {
  const formData = new FormData();
  formData.append('decision', decision);
  if (rejectionReason) {
    formData.append('rejection_reason', rejectionReason);
  }
  return request(MEDIA_URL, `/api/v1/documents/${documentId}/review`, {
    token,
    method: 'POST',
    body: formData,
  });
}


export async function reviewAttendance(token, attendanceId, decision, notes = '') {
  return request(OPS_URL, `/api/v1/attendance/${attendanceId}/review`, {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, notes }),
  });
}

export async function broadcastNotification(token, payload) {
  return request(REALTIME_URL, '/api/v1/owner/notifications/broadcast', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}


export async function createUser(token, payload) {
  return request(CORE_URL, '/api/v1/owner/users/create', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateUser(token, userId, payload) {
  return request(CORE_URL, `/api/v1/owner/users/${userId}`, {
    token,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(token, userId) {
  return request(CORE_URL, `/api/v1/owner/users/${userId}`, {
    token,
    method: 'DELETE',
  });
}

export async function createSite(token, payload) {
  return request(CORE_URL, '/api/v1/owner/sites/create', {
    token,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateSite(token, siteId, payload) {
  return request(CORE_URL, `/api/v1/owner/sites/${siteId}`, {
    token,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteSite(token, siteId) {
  return request(CORE_URL, `/api/v1/owner/sites/${siteId}`, {
    token,
    method: 'DELETE',
  });
}

export async function getUserLoginHistory(token, userId) {
  return request(CORE_URL, `/api/v1/owner/users/${userId}/login-history`, { token });
}

