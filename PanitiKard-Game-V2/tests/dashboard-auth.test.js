/**
 * PanitiKard V2 — Phase 6.2 Frontend Dashboard Auth Tests
 *
 * Tests for:
 *   js/dashboard-auth.js
 *
 * Verifies:
 *   - Configuration and initialization
 *   - Teacher/Admin sign-in and session restoration
 *   - Authoritative backend role verification
 *   - Strict student rejection (fail-closed)
 *   - Sign-out and session revocation
 *   - Authenticated API request helper
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const dashboardAuth = require('../js/dashboard-auth');

function createMockSupabaseClient({
  session = null,
  getSessionError = null,
  signInSession = null,
  signInError = null
} = {}) {
  let currentSession = session;
  let signOutCalls = 0;
  const signInCalls = [];
  let authStateCallback = null;

  return {
    auth: {
      async getSession() {
        return { data: { session: currentSession }, error: getSessionError };
      },
      async signInWithPassword({ email, password }) {
        signInCalls.push({ email, password });
        if (signInError) {
          return { data: { session: null }, error: signInError };
        }
        currentSession = signInSession;
        return { data: { session: signInSession }, error: null };
      },
      async signOut() {
        signOutCalls++;
        currentSession = null;
        if (authStateCallback) authStateCallback('SIGNED_OUT', null);
        return { error: null };
      },
      onAuthStateChange(cb) {
        authStateCallback = cb;
        return { data: { subscription: { unsubscribe() {} } } };
      }
    },
    _state: {
      get signOutCalls() { return signOutCalls; },
      get signInCalls() { return signInCalls; },
      setSession(s) { currentSession = s; }
    }
  };
}

function createMockFetch(handlers = {}) {
  const calls = [];
  const mockFetch = async (url, options = {}) => {
    calls.push({ url, options });
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return handler(url, options);
      }
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({ success: false, error: 'NOT_FOUND', message: 'Not found' })
    };
  };
  mockFetch.calls = calls;
  return mockFetch;
}

test('dashboardAuth: exports required methods', () => {
  assert.equal(typeof dashboardAuth.init, 'function');
  assert.equal(typeof dashboardAuth.signIn, 'function');
  assert.equal(typeof dashboardAuth.signOut, 'function');
  assert.equal(typeof dashboardAuth.getProfile, 'function');
  assert.equal(typeof dashboardAuth.isAuthenticated, 'function');
  assert.equal(typeof dashboardAuth.getAccessToken, 'function');
  assert.equal(typeof dashboardAuth.apiRequest, 'function');
  assert.equal(typeof dashboardAuth.configure, 'function');
  assert.equal(typeof dashboardAuth.reset, 'function');
  assert.equal(typeof dashboardAuth.resolveApiBaseUrl, 'function');
});

test('dashboardAuth: init() returns null when Supabase client cannot be resolved', async () => {
  dashboardAuth.reset();
  dashboardAuth.configure({ supabaseUrl: '', supabaseAnonKey: '', apiBaseUrl: 'http://localhost:3000/api/v1' });
  const profile = await dashboardAuth.init();
  assert.equal(profile, null);
  assert.equal(dashboardAuth.isAuthenticated(), false);
  assert.equal(dashboardAuth.getProfile(), null);
  assert.equal(dashboardAuth.getAccessToken(), null);
});

test('dashboardAuth: init() restores session when valid teacher token is verified by backend', async () => {
  dashboardAuth.reset();
  const mockClient = createMockSupabaseClient({
    session: { access_token: 'teacher-jwt-token-123', user: { id: 't-1' } }
  });
  const mockFetch = createMockFetch({
    '/auth/me': () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 't-1', email: 'guro@paaralan.ph', role: 'teacher', displayName: 'Guro Maria' }
      })
    })
  });

  dashboardAuth.configure({
    supabaseClient: mockClient,
    fetch: mockFetch,
    apiBaseUrl: 'http://localhost:3000/api/v1'
  });

  const profile = await dashboardAuth.init();
  assert.ok(profile !== null);
  assert.equal(profile.id, 't-1');
  assert.equal(profile.role, 'teacher');
  assert.equal(profile.displayName, 'Guro Maria');
  assert.equal(dashboardAuth.isAuthenticated(), true);
  assert.equal(dashboardAuth.getAccessToken(), 'teacher-jwt-token-123');
  assert.equal(dashboardAuth.getProfile().role, 'teacher');
});

test('dashboardAuth: init() rejects student session, revokes it, and fails closed', async () => {
  dashboardAuth.reset();
  const mockClient = createMockSupabaseClient({
    session: { access_token: 'student-jwt-token-456', user: { id: 's-1' } }
  });
  const mockFetch = createMockFetch({
    '/auth/me': () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 's-1', email: 'mag-aaral@paaralan.ph', role: 'student', displayName: 'Juan' }
      })
    })
  });

  dashboardAuth.configure({
    supabaseClient: mockClient,
    fetch: mockFetch,
    apiBaseUrl: 'http://localhost:3000/api/v1'
  });

  const profile = await dashboardAuth.init();
  assert.equal(profile, null);
  assert.equal(dashboardAuth.isAuthenticated(), false);
  assert.equal(dashboardAuth.getProfile(), null);
  assert.equal(dashboardAuth.getAccessToken(), null);
  // Verify client signOut was invoked to clear the invalid session
  assert.equal(mockClient._state.signOutCalls, 1);
});

test('dashboardAuth: signIn() validates empty email and password before contacting backend', async () => {
  dashboardAuth.reset();
  await assert.rejects(
    () => dashboardAuth.signIn('', 'password123'),
    /Pakilagay ang email at password/
  );
  await assert.rejects(
    () => dashboardAuth.signIn('guro@paaralan.ph', ''),
    /Pakilagay ang email at password/
  );
});

test('dashboardAuth: signIn() succeeds for authorized teacher and stores verified profile', async () => {
  dashboardAuth.reset();
  const mockClient = createMockSupabaseClient({
    signInSession: { access_token: 'valid-staff-token', user: { id: 'staff-9' } }
  });
  const mockFetch = createMockFetch({
    '/auth/me': () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 'staff-9', email: 'guro@paaralan.ph', role: 'teacher', displayName: 'Bb. Santos' }
      })
    })
  });

  dashboardAuth.configure({
    supabaseClient: mockClient,
    fetch: mockFetch,
    apiBaseUrl: 'http://localhost:3000/api/v1'
  });

  const profile = await dashboardAuth.signIn('guro@paaralan.ph', 'SecretPass123!');
  assert.equal(profile.id, 'staff-9');
  assert.equal(profile.role, 'teacher');
  assert.equal(profile.displayName, 'Bb. Santos');
  assert.equal(dashboardAuth.isAuthenticated(), true);
  assert.equal(dashboardAuth.getAccessToken(), 'valid-staff-token');
});

test('dashboardAuth: signIn() strictly rejects student credentials and signs out immediately', async () => {
  dashboardAuth.reset();
  const mockClient = createMockSupabaseClient({
    signInSession: { access_token: 'student-valid-supabase-token', user: { id: 'student-22' } }
  });
  const mockFetch = createMockFetch({
    '/auth/me': () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 'student-22', email: 'estudyante@paaralan.ph', role: 'student', displayName: 'Pedro' }
      })
    })
  });

  dashboardAuth.configure({
    supabaseClient: mockClient,
    fetch: mockFetch,
    apiBaseUrl: 'http://localhost:3000/api/v1'
  });

  await assert.rejects(
    () => dashboardAuth.signIn('estudyante@paaralan.ph', 'studentpass'),
    /dashboard ay para lamang sa guro at administrador/
  );

  // Student session must be completely revoked
  assert.equal(mockClient._state.signOutCalls, 1);
  assert.equal(dashboardAuth.isAuthenticated(), false);
  assert.equal(dashboardAuth.getProfile(), null);
  assert.equal(dashboardAuth.getAccessToken(), null);
});

test('dashboardAuth: signIn() maps Supabase invalid login errors to user-friendly Filipino message', async () => {
  dashboardAuth.reset();
  const mockClient = createMockSupabaseClient({
    signInError: new Error('Invalid login credentials')
  });

  dashboardAuth.configure({
    supabaseClient: mockClient,
    fetch: createMockFetch(),
    apiBaseUrl: 'http://localhost:3000/api/v1'
  });

  await assert.rejects(
    () => dashboardAuth.signIn('wrong@email.com', 'badpass'),
    /Maling email o password/
  );
});

test('dashboardAuth: signOut() revokes session and clears all authenticated state', async () => {
  dashboardAuth.reset();
  const mockClient = createMockSupabaseClient({
    session: { access_token: 'active-token', user: { id: 't-1' } }
  });
  const mockFetch = createMockFetch({
    '/auth/me': () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { id: 't-1', email: 'guro@ph.edu', role: 'admin', displayName: 'Admin Boss' }
      })
    })
  });

  dashboardAuth.configure({
    supabaseClient: mockClient,
    fetch: mockFetch,
    apiBaseUrl: 'http://localhost:3000/api/v1'
  });

  await dashboardAuth.init();
  assert.equal(dashboardAuth.isAuthenticated(), true);

  await dashboardAuth.signOut();
  assert.equal(mockClient._state.signOutCalls, 1);
  assert.equal(dashboardAuth.isAuthenticated(), false);
  assert.equal(dashboardAuth.getProfile(), null);
  assert.equal(dashboardAuth.getAccessToken(), null);
});

test('dashboardAuth: apiRequest() attaches Bearer token, sets headers, and parses payload', async () => {
  dashboardAuth.reset();
  const mockClient = createMockSupabaseClient({
    session: { access_token: 'staff-secret-bearer-jwt', user: { id: 'admin-1' } }
  });
  let capturedHeaders = null;
  let capturedBody = null;

  const mockFetch = createMockFetch({
    '/auth/me': () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { id: 'admin-1', role: 'admin' } })
    }),
    '/admin/topics': (_url, options) => {
      capturedHeaders = options.headers;
      capturedBody = options.body;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [{ id: 'topic-1', code: 'elements', title: 'Elemento' }]
        })
      };
    }
  });

  dashboardAuth.configure({
    supabaseClient: mockClient,
    fetch: mockFetch,
    apiBaseUrl: 'http://localhost:3000/api/v1'
  });

  await dashboardAuth.init();
  const topics = await dashboardAuth.apiRequest('/admin/topics', {
    method: 'POST',
    body: { code: 'new-topic', title: 'Bagong Paksa' }
  });

  assert.equal(topics.length, 1);
  assert.equal(topics[0].code, 'elements');
  assert.equal(capturedHeaders.Authorization, 'Bearer staff-secret-bearer-jwt');
  assert.equal(capturedHeaders['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(capturedBody), { code: 'new-topic', title: 'Bagong Paksa' });
});

test('dashboardAuth: apiRequest() throws informative error on non-OK status', async () => {
  dashboardAuth.reset();
  const mockFetch = createMockFetch({
    '/admin/forbidden': () => ({
      ok: false,
      status: 403,
      json: async () => ({ success: false, message: 'Teacher or administrator permission is required.' })
    })
  });

  dashboardAuth.configure({
    fetch: mockFetch,
    apiBaseUrl: 'http://localhost:3000/api/v1'
  });

  await assert.rejects(
    () => dashboardAuth.apiRequest('/admin/forbidden'),
    /Teacher or administrator permission is required/
  );
});
