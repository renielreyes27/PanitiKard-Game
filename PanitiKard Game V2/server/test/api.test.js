const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../src/server');

async function withServer(app, run) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function testApp({ role = 'student', authenticated = true } = {}) {
  const calls = [];
  const authenticate = (req, _res, next) => {
    if (!authenticated) return next(Object.assign(new Error('Authentication required.'), { status: 401, code: 'AUTH_REQUIRED' }));
    req.auth = { user: { id: 'student-1' }, profile: { role }, client: { userClient: true } };
    next();
  };
  const catalogService = {
    listTopics: async () => [{ code: 'elements', title: 'Elemento' }],
    listQuestions: async (code, _client, options) => ({ topic: { code }, questions: [{ code: 'elem-question' }], options })
  };
  const gameService = {
    createSession: async (_client, user, input) => { calls.push(['createSession', user.id, input]); return { id: 'session-1', status: 'active' }; },
    submitAnswer: async (_client, user, id, input) => { calls.push(['submitAnswer', id, input]); return { isCorrect: true, pointsAwarded: 1 }; },
    finishSession: async (_client, id) => ({ id, status: 'completed' }),
    getSession: async (_client, id) => ({ id, answers: [] })
  };
  const contentService = {
    createTopic: async () => ({ code: 'future-topic', status: 'draft' }),
    updateTopic: async () => ({ code: 'elements', status: 'published' }),
    createQuestion: async () => ({ code: 'new-q', version: 1 }),
    reviseQuestion: async () => ({ code: 'new-q', version: 2 }),
    archiveQuestion: async () => ({ code: 'new-q', status: 'archived' })
  };
  return { app: createApp({ catalogService, gameService, contentService, authenticate, connectivityCheck: async () => ({ reachable: true }) }), calls };
}

test('health endpoint reports a real connectivity probe result, without secrets', async () => {
  const { app } = testApp();
  await withServer(app, async base => {
    const response = await fetch(`${base}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.supabase.connectivity.reachable, true);
    assert.equal(JSON.stringify(body).includes('serviceRoleKey'), false);
  });
});

test('public topic and question catalog endpoints return published data', async () => {
  const { app } = testApp();
  await withServer(app, async base => {
    const topics = await fetch(`${base}/api/v1/topics`).then(response => response.json());
    const questions = await fetch(`${base}/api/v1/topics/elements/questions?kind=cards`).then(response => response.json());
    assert.equal(topics.data[0].code, 'elements');
    assert.equal(questions.data.questions[0].code, 'elem-question');
    assert.equal(questions.data.options.kind, 'cards');
  });
});

test('session creation and answer submission require authentication and preserve validated identity', async () => {
  const { app, calls } = testApp();
  await withServer(app, async base => {
    const session = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Test' })
    }).then(response => response.json());
    assert.equal(session.data.id, 'session-1');

    const result = await fetch(`${base}/api/v1/sessions/session-1/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ questionCode: 'elem-question', response: 'B', round: 'main' })
    }).then(response => response.json());
    assert.equal(result.data.isCorrect, true);
    assert.deepEqual(calls.map(call => call[0]), ['createSession', 'submitAnswer']);
  });
  const { app: unauthorized } = testApp({ authenticated: false });
  await withServer(unauthorized, async base => {
    const response = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401);
  });
});

test('staff content routes enforce role checks and invalid routes return consistent errors', async () => {
  const { app: studentApp } = testApp({ role: 'student' });
  await withServer(studentApp, async base => {
    const denied = await fetch(`${base}/api/v1/admin/topics`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, 'STAFF_REQUIRED');
    const missing = await fetch(`${base}/api/v1/no-such-route`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error, 'NOT_FOUND');
  });
  const { app: teacherApp } = testApp({ role: 'teacher' });
  await withServer(teacherApp, async base => {
    const created = await fetch(`${base}/api/v1/admin/topics`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(response => response.json());
    assert.equal(created.data.status, 'draft');
  });
});

test('API rejects malformed JSON with a 400 response', async () => {
  const { app } = testApp();
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'INVALID_JSON');
  });
});
