const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthenticator, requireStaff, requireAdmin } = require('../src/middleware/authenticate');

function mockResponse() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } }; }

function runMiddleware(middleware, req) {
  return new Promise(resolve => middleware(req, mockResponse(), error => resolve(error || null)));
}

test('authentication verifies the supplied bearer token and loads the database role', async () => {
  let receivedToken;
  const client = {
    auth: { getUser: async token => { receivedToken = token; return { data: { user: { id: 'u1' } }, error: null }; } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'u1', role: 'teacher' }, error: null }) }) }) })
  };
  const authenticate = createAuthenticator({ userClientFactory: token => { assert.equal(token, 'jwt-test'); return client; } });
  const req = { get: name => name === 'authorization' ? 'Bearer jwt-test' : null };
  assert.equal(await runMiddleware(authenticate, req), null);
  assert.equal(receivedToken, 'jwt-test');
  assert.equal(req.auth.profile.role, 'teacher');
});

test('missing token and missing profile fail closed', async () => {
  const authenticate = createAuthenticator({ userClientFactory: () => null });
  const missing = await runMiddleware(authenticate, { get: () => '' });
  assert.equal(missing.status, 401);
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u2' } }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) })
  };
  const noProfile = createAuthenticator({ userClientFactory: () => client });
  assert.equal((await runMiddleware(noProfile, { get: () => 'Bearer x' })).status, 403);
});

test('staff and admin gates are based on the verified profile role', async () => {
  const staffReq = { auth: { profile: { role: 'teacher' } } };
  assert.equal(await runMiddleware(requireStaff, staffReq), null);
  assert.equal((await runMiddleware(requireAdmin, staffReq)).status, 403);
  assert.equal(await runMiddleware(requireAdmin, { auth: { profile: { role: 'admin' } } }), null);
});
