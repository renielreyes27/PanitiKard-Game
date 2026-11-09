/** Optional authenticated API integration. The browser only receives the user's access token. */
(function (root) {
  const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="panitikard-api-base-url"]') : null;
  const configuredBase = root.PANITIKARD_API_BASE_URL || (meta && meta.content) || '';
  const baseUrl = configuredBase.replace(/\/+$/, '');

  function accessToken() {
    if (typeof root.PANITIKARD_GET_ACCESS_TOKEN === 'function') return root.PANITIKARD_GET_ACCESS_TOKEN();
    return root.PANITIKARD_ACCESS_TOKEN || null;
  }

  async function request(path, { method = 'GET', body } = {}) {
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
    enabled: Boolean(baseUrl),
    hasAccessToken: () => Boolean(accessToken()),
    listTopics: () => request('/topics'),
    listQuestions: (topicCode, kind = 'all') => request(`/topics/${encodeURIComponent(topicCode)}/questions?kind=${encodeURIComponent(kind)}`),
    createSession: (topicCode, mode, studentName) => request('/sessions', {
      method: 'POST', body: { topicCode, mode, studentName }
    }),
    submitAnswer: (sessionId, questionCode, response, round = 'main', options = {}) => request(`/sessions/${encodeURIComponent(sessionId)}/answers`, {
      method: 'POST', body: { questionCode, response: String(response), round, isTimeout: options.isTimeout === true }
    }),
    finishSession: (sessionId) => request(`/sessions/${encodeURIComponent(sessionId)}/finish`, {
      method: 'POST', body: {}
    }),
    getGeminiStatus: () => request('/evaluations/gemini/status'),
    evaluateWithGemini: (questionCode, studentAnswer, options = {}) => request('/evaluations/gemini', {
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
