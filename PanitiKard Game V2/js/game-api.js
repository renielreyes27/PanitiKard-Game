/** Optional authenticated API integration. The browser only receives the user's access token. */
(function (root) {
  function resolveApiBaseUrl(rawBase, customWindow) {
    const trimmed = (typeof rawBase === 'string') ? rawBase.trim() : '';
    const base = trimmed || '';
    if (!base) return '';

    // If already absolute (http:// or https://), return it directly
    if (/^https?:\/\//i.test(base)) {
      return base.replace(/\/+$/, '');
    }

    // Environment-aware resolution for browser environments
    const win = customWindow || (typeof window !== 'undefined' ? window : null);
    if (win && win.location) {
      const loc = win.location;
      const hostname = (loc.hostname || '').toLowerCase();
      const isLocalHost = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.endsWith('.localhost') ||
        loc.protocol === 'file:';

      const port = loc.port ? String(loc.port) : (loc.protocol === 'https:' ? '443' : (loc.protocol === 'http:' ? '80' : ''));

      // If running on a local development static server on a port other than 3000
      // (e.g. http-server on 8080, Live Server on 5500, or file://),
      // target the local Express backend on http://localhost:3000.
      if (isLocalHost && port !== '3000') {
        const cleanPath = base.startsWith('/') ? base : `/${base}`;
        return `http://localhost:3000${cleanPath}`.replace(/\/+$/, '');
      }
    }

    return base.replace(/\/+$/, '');
  }

  function getBaseUrl() {
    const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="panitikard-api-base-url"]') : null;
    const configuredBase = root.PANITIKARD_API_BASE_URL || (meta && meta.content) || '';
    return resolveApiBaseUrl(configuredBase);
  }

  let guestToken = null;

  function accessToken() {
    if (typeof root.PANITIKARD_GET_ACCESS_TOKEN === 'function') return root.PANITIKARD_GET_ACCESS_TOKEN();
    return root.PANITIKARD_ACCESS_TOKEN || guestToken || root.PANITIKARD_GUEST_TOKEN || null;
  }

  async function request(path, { method = 'GET', body } = {}) {
    const baseUrl = getBaseUrl();
    if (!baseUrl) return null;
    const headers = { Accept: 'application/json' };
    const token = accessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || `PanitiKard API request failed (${response.status}).`);
    return payload?.data ?? null;
  }

  const api = {
    get enabled() { return Boolean(getBaseUrl()); },
    getBaseUrl,
    resolveApiBaseUrl,
    hasAccessToken: () => Boolean(accessToken()),
    hasSessionToken: () => Boolean(guestToken || root.PANITIKARD_GUEST_TOKEN),
    setGuestToken: (token) => { guestToken = token || null; },
    getGuestToken: () => guestToken || root.PANITIKARD_GUEST_TOKEN || null,
    clearGuestToken: () => { guestToken = null; },
    listTopics: () => request('/topics'),
    listQuestions: (topicCode, kind = 'all') => request(`/topics/${encodeURIComponent(topicCode)}/questions?kind=${encodeURIComponent(kind)}`),
    createSession: async (topicCode, mode, studentName) => {
      const data = await request('/sessions', {
        method: 'POST', body: { topicCode, mode, studentName }
      });
      if (data && data.sessionToken) {
        guestToken = data.sessionToken;
      }
      return data;
    },
    startQuestionTimer: (sessionId, questionCode, round = 'main') => request(`/sessions/${encodeURIComponent(sessionId)}/timers`, {
      method: 'POST', body: { questionCode, round }
    }),
    submitAnswer: (sessionId, questionCode, response, round = 'main', options = {}) => request(`/sessions/${encodeURIComponent(sessionId)}/answers`, {
      method: 'POST', body: { questionCode, response: String(response), round, isTimeout: options.isTimeout === true }
    }),
    finishSession: (sessionId) => request(`/sessions/${encodeURIComponent(sessionId)}/finish`, {
      method: 'POST', body: {}
    }),
    getGeminiStatus: () => request('/evaluations/answer/status'),
    getEvaluationStatus: () => request('/evaluations/answer/status'),
    evaluateAnswer: (questionCode, studentAnswer, options = {}) => request('/evaluations/answer', {
      method: 'POST',
      body: {
        questionCode,
        studentAnswer: String(studentAnswer || ''),
        sessionId: options.sessionId || undefined
      }
    }),
    // Backward-compat alias: older code may still call evaluateWithGemini
    evaluateWithGemini: (questionCode, studentAnswer, options = {}) => request('/evaluations/answer', {
      method: 'POST',
      body: {
        questionCode,
        studentAnswer: String(studentAnswer || ''),
        sessionId: options.sessionId || undefined
      }
    })
  };

  root.PANITIKARD_GAME_API = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
