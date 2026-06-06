// ── MS Security Owner Web – API Client ──
// Features: Retry with backoff, timeout, graceful degradation, debug logging

const CORE_URL = (import.meta.env.VITE_API_BASE_URL_CORE || import.meta.env.VITE_API_BASE_URL_GATEWAY || 'https://ms-security-gateway.onrender.com').replace(/\/+$/, '');
const OPS_URL = (import.meta.env.VITE_API_BASE_URL_OPERATIONS || import.meta.env.VITE_API_BASE_URL_GATEWAY || 'https://ms-security-gateway.onrender.com').replace(/\/+$/, '');

// ── Debug Log Store ──
const MAX_DEBUG_LOGS = 200;
let _debugLogs = [];
let _debugListeners = [];

export function getDebugLogs() { return _debugLogs; }
export function clearDebugLogs() { _debugLogs = []; _notifyDebug(); }
export function onDebugUpdate(fn) {
  _debugListeners.push(fn);
  return () => { _debugListeners = _debugListeners.filter(f => f !== fn); };
}
function _notifyDebug() { _debugListeners.forEach(fn => fn([..._debugLogs])); }

function addDebugLog(entry) {
  _debugLogs.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (_debugLogs.length > MAX_DEBUG_LOGS) _debugLogs.length = MAX_DEBUG_LOGS;
  _notifyDebug();
}

// ── Fetch with Retry, Timeout, and Debug Logging ──
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1500; // 1.5s, then 3s, then 4.5s

async function fetchWithTimeout(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return resp;
  } catch (e) {
    clearTimeout(id);
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw e;
  }
}

async function request(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const method = options.method || 'GET';
  const startTime = performance.now();
  let lastError = null;
  let attempt = 0;

  for (attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          Accept: 'application/json',
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
          ...(options.headers || {}),
        },
        method,
        body: options.body,
      });

      const elapsed = Math.round(performance.now() - startTime);
      const payloadSize = parseInt(response.headers.get('content-length') || '0', 10);
      const backendService = response.headers.get('x-backend-service') || 'unknown';
      const backendTime = response.headers.get('x-response-time') || '';

      if (!response.ok) {
        let detail = `Request failed (${response.status})`;
        try {
          const data = await response.json();
          detail = data.detail || data.message || detail;
        } catch (_) {}

        // Don't retry 4xx client errors
        if (response.status >= 400 && response.status < 500) {
          addDebugLog({
            api: `${method} ${path}`, status: response.status, time_ms: elapsed,
            payload_bytes: payloadSize, indicator: 'red', backend: backendService,
            backend_time: backendTime, attempt, error: detail,
          });
          throw new Error(detail);
        }

        // Retry 5xx server errors
        lastError = new Error(detail);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt));
          continue;
        }

        addDebugLog({
          api: `${method} ${path}`, status: response.status, time_ms: elapsed,
          payload_bytes: payloadSize, indicator: 'red', backend: backendService,
          backend_time: backendTime, attempt, error: detail,
        });
        throw lastError;
      }

      // Success
      const indicator = elapsed > 5000 ? 'yellow' : 'green';
      if (response.status === 204) {
        addDebugLog({
          api: `${method} ${path}`, status: 204, time_ms: elapsed,
          payload_bytes: 0, indicator, backend: backendService,
          backend_time: backendTime, attempt,
        });
        return null;
      }

      const data = await response.json();
      const actualSize = JSON.stringify(data).length;

      addDebugLog({
        api: `${method} ${path}`, status: response.status, time_ms: elapsed,
        payload_bytes: actualSize, indicator, backend: backendService,
        backend_time: backendTime, attempt,
      });

      return data;
    } catch (e) {
      lastError = e;
      const elapsed = Math.round(performance.now() - startTime);

      // Don't retry on non-network errors (e.g., JSON parse, 4xx already thrown above)
      if (e.message && !e.message.includes('timed out') && !e.message.includes('Failed to fetch') && !e.message.includes('NetworkError') && !e.message.includes('fetch')) {
        addDebugLog({
          api: `${method} ${path}`, status: 'ERR', time_ms: elapsed,
          payload_bytes: 0, indicator: 'red', backend: 'unknown',
          backend_time: '', attempt, error: e.message,
        });
        throw e;
      }

      if (attempt < MAX_RETRIES) {
        addDebugLog({
          api: `${method} ${path}`, status: 'RETRY', time_ms: elapsed,
          payload_bytes: 0, indicator: 'yellow', backend: 'unknown',
          backend_time: '', attempt, error: `Retrying... (${e.message})`,
        });
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt));
        continue;
      }

      addDebugLog({
        api: `${method} ${path}`, status: 'ERR', time_ms: elapsed,
        payload_bytes: 0, indicator: 'red', backend: 'unknown',
        backend_time: '', attempt, error: e.message,
      });
      throw e;
    }
  }

  throw lastError || new Error('Request failed after retries');
}

// ── Warmup (wake sleeping Render services) ──
export async function warmupBackends() {
  const start = performance.now();
  try {
    const resp = await fetchWithTimeout(`${CORE_URL}/api/v1/warmup`, {
      headers: { Accept: 'application/json' },
    }, 20000);
    const data = await resp.json();
    addDebugLog({
      api: 'GET /api/v1/warmup', status: resp.status,
      time_ms: Math.round(performance.now() - start),
      payload_bytes: JSON.stringify(data).length, indicator: 'green',
      backend: 'gateway', backend_time: '', attempt: 1,
    });
    return data;
  } catch (e) {
    addDebugLog({
      api: 'GET /api/v1/warmup', status: 'ERR',
      time_ms: Math.round(performance.now() - start),
      payload_bytes: 0, indicator: 'yellow',
      backend: 'gateway', backend_time: '', attempt: 1,
      error: e.message,
    });
    return null;
  }
}

// ── Auth ──
export async function login(email, password) {
  return request(CORE_URL, '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

// ── Dashboard Data (Graceful Degradation) ──
export async function loadOwnerData(token) {
  // Use Promise.allSettled so one failure doesn't kill the entire dashboard
  const calls = [
    { key: 'overview',   fn: () => request(CORE_URL, '/api/v1/owner/overview', { token }) },
    { key: 'users',      fn: () => request(CORE_URL, '/api/v1/owner/users', { token }) },
    { key: 'sites',      fn: () => request(CORE_URL, '/api/v1/owner/sites', { token }) },
    { key: 'documents',  fn: () => request(CORE_URL, '/api/v1/owner/documents', { token }) },
    { key: 'attendance', fn: () => request(OPS_URL, '/api/v1/attendance/list', { token }) },
    { key: 'controls',   fn: () => request(CORE_URL, '/api/v1/controls', { token }) },
    { key: 'live',       fn: () => request(OPS_URL, '/api/v1/tracking/live', { token }) },
    { key: 'grooming',   fn: () => request(OPS_URL, '/api/v1/grooming/list', { token }) },
    { key: 'overtime',   fn: () => request(OPS_URL, '/api/v1/overtime/list', { token }) },
    { key: 'alerts',     fn: () => request(OPS_URL, '/api/v1/alerts/list', { token }) },
    { key: 'fraud',      fn: () => request(OPS_URL, '/api/v1/owner/fraud', { token }) },
    { key: 'activity',   fn: () => request(OPS_URL, '/api/v1/owner/activity', { token }) },
  ];

  const results = await Promise.allSettled(calls.map(c => c.fn()));
  const data = {};
  let failCount = 0;

  calls.forEach((c, i) => {
    if (results[i].status === 'fulfilled') {
      data[c.key] = results[i].value;
    } else {
      data[c.key] = c.key === 'overview' ? {} : [];
      failCount++;
      console.warn(`[API] ${c.key} failed:`, results[i].reason?.message);
    }
  });

  // Attach metadata so the UI can show partial load warnings
  data._meta = {
    totalCalls: calls.length,
    failedCalls: failCount,
    loadedAt: new Date().toISOString(),
  };

  return data;
}

// ── CRUD Operations ──
export async function updateControls(token, payload) {
  return request(CORE_URL, '/api/v1/controls', {
    token, method: 'PUT',
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
  return request(OPS_URL, '/api/v1/owner/ops-telemetry', { token });
}

export async function cleanupStorage(token) {
  return request(OPS_URL, '/api/v1/owner/storage/cleanup', { token, method: 'POST' });
}

export async function reviewDocument(token, documentId, decision, rejectionReason = '') {
  const formData = new FormData();
  formData.append('decision', decision);
  if (rejectionReason) formData.append('rejection_reason', rejectionReason);
  return request(CORE_URL, `/api/v1/documents/${documentId}/review`, {
    token, method: 'POST', body: formData,
  });
}

export async function reviewAttendance(token, attendanceId, decision, notes = '') {
  return request(OPS_URL, `/api/v1/attendance/${attendanceId}/review`, {
    token, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, notes }),
  });
}

export async function broadcastNotification(token, payload) {
  return request(OPS_URL, '/api/v1/owner/notifications/broadcast', {
    token, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function createUser(token, payload) {
  return request(CORE_URL, '/api/v1/owner/users/create', {
    token, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateUser(token, userId, payload) {
  return request(CORE_URL, `/api/v1/owner/users/${userId}`, {
    token, method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(token, userId) {
  return request(CORE_URL, `/api/v1/owner/users/${userId}`, { token, method: 'DELETE' });
}

export async function createSite(token, payload) {
  return request(CORE_URL, '/api/v1/owner/sites/create', {
    token, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateSite(token, siteId, payload) {
  return request(CORE_URL, `/api/v1/owner/sites/${siteId}`, {
    token, method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteSite(token, siteId) {
  return request(CORE_URL, `/api/v1/owner/sites/${siteId}`, { token, method: 'DELETE' });
}

export async function getUserLoginHistory(token, userId) {
  return request(CORE_URL, `/api/v1/owner/users/${userId}/login-history`, { token });
}

export async function getTrackingHistory(token, userId, date = '') {
  const path = `/api/v1/tracking/history/${userId}${date ? `?date=${date}` : ''}`;
  return request(OPS_URL, path, { token });
}

export async function getMediaStats(token) {
  return request(CORE_URL, '/api/v1/owner/media/stats', { token });
}

export async function getMediaList(token, bucket) {
  return request(CORE_URL, `/api/v1/owner/media/list/${bucket}`, { token });
}

export async function getMediaGallery(token, limit = 500) {
  return request(CORE_URL, `/api/v1/owner/media/gallery?limit=${limit}`, { token });
}

export async function deleteMedia(token, bucket, keys) {
  return request(CORE_URL, `/api/v1/owner/media/delete/${bucket}`, {
    token, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: keys }),
  });
}

export async function fetchMediaManagerData(token) {
  return request(OPS_URL, '/api/v1/media-manager/all', { token });
}

export async function deleteMediaManagerFiles(token, items) {
  return request(OPS_URL, '/api/v1/media-manager/delete', {
    token, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}
