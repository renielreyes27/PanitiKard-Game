/**
 * PanitiKard V2 — Phase 6.1 Admin Endpoint Tests
 *
 * Tests for:
 *   GET /api/v1/admin/topics          — list all topics for authorized staff
 *   GET /api/v1/admin/questions/:code — full question detail (versions + rubric) for authorized staff
 *
 * Uses the same testApp() helper pattern as api.test.js (inline mock of createApp dependencies).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../src/server');

// ---------------------------------------------------------------------------
// Shared test helpers (mirror api.test.js conventions)
// ---------------------------------------------------------------------------

async function withServer(app, run) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

const TOPIC_FIXTURE = {
  id: 'topic-uuid-1',
  code: 'elements',
  title: 'Elemento ng Panitikan',
  description: 'Mga elemento ng kwento at tula.',
  competency: 'Nakakakilala ng mga elemento',
  status: 'published',
  created_by: 'teacher-uuid-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  archived_at: null
};

const DRAFT_TOPIC_FIXTURE = {
  id: 'topic-uuid-2',
  code: 'figurative-language',
  title: 'Matalinhagang Wika',
  description: 'Mga tayutay at pigura ng wika.',
  competency: 'Nakakakilala ng mga tayutay',
  status: 'draft',
  created_by: 'teacher-uuid-1',
  created_at: '2026-07-01T00:00:00Z',
  updated_at: '2026-07-15T00:00:00Z',
  archived_at: null
};

const QUESTION_DETAIL_FIXTURE = {
  id: 'question-uuid-1',
  code: 'elem-q-001',
  topicCode: 'elements',
  topicTitle: 'Elemento ng Panitikan',
  topicStatus: 'published',
  cardCategory: 'tula',
  questionType: 'open_ended',
  status: 'published',
  currentVersion: 1,
  createdBy: 'teacher-uuid-1',
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-01-15T00:00:00Z',
  archivedAt: null,
  version: {
    id: 'version-uuid-1',
    versionNumber: 1,
    title: 'Ano ang tema ng tula?',
    prompt: 'Ipaliwanag ang tema ng tula.',
    explanation: 'Ang tema ay ang pangunahing mensahe.',
    hint: 'Isipin ang layunin ng may-akda.',
    points: 2,
    timeLimitSeconds: 60,
    difficulty: 'medium',
    categoryLabel: 'Tema',
    tag: 'tula',
    choices: [],
    payload: {}
  },
  rubric: {
    expectedAnswer: 'Ang tema ng tula ay pag-asa at katatagan.',
    answerKey: null,
    acceptedAnswers: ['pag-asa', 'katatagan'],
    rubricGroups: [{ criterion: 'Nilalaman', points: 1 }, { criterion: 'Pagpapahayag', points: 1 }]
  },
  versionHistory: [{ id: 'version-uuid-1', versionNumber: 1, createdAt: '2026-01-15T00:00:00Z' }]
};

const RUBRICS_FIXTURE = [
  {
    questionCode: 'elem-q-001',
    topicCode: 'elements',
    topicTitle: 'Elemento ng Panitikan',
    cardCategory: 'question',
    questionStatus: 'published',
    questionArchived: false,
    questionType: 'open_ended',
    versionId: 'version-uuid-1',
    versionNumber: 1,
    versionCreatedAt: '2026-01-15T00:00:00Z',
    prompt: 'Ipaliwanag ang tema ng tula.',
    points: 2,
    hasRubric: true,
    rubric: {
      expectedAnswer: 'Ang tema ng tula ay pag-asa at katatagan.',
      answerKey: null,
      acceptedAnswers: ['pag-asa', 'katatagan'],
      rubricGroups: [['pag-asa', 'asahan'], ['katatagan', 'tibay']],
      createdAt: '2026-01-15T00:00:00Z'
    }
  }
];

function makeCatalogService({ topics = [TOPIC_FIXTURE, DRAFT_TOPIC_FIXTURE], questionDetail = QUESTION_DETAIL_FIXTURE } = {}) {
  return {
    listTopics: async () => [TOPIC_FIXTURE],
    listQuestions: async (code, _client, options) => ({ topic: { code }, questions: [], options }),
    listAllTopics: async (client) => {
      if (!client) return null;
      return topics;
    },
    listRubrics: async (client, options = {}) => {
      if (!client) return null;
      if (options.topicCode) {
        return RUBRICS_FIXTURE.filter(r => r.topicCode === options.topicCode);
      }
      return RUBRICS_FIXTURE;
    },
    getQuestionDetail: async (code, client, options = {}) => {
      if (!client) return null;
      if (code === 'does-not-exist') {
        const { HttpError } = require('../src/middleware/httpError');
        throw new HttpError(404, 'QUESTION_NOT_FOUND', `Question '${code}' was not found.`);
      }
      if (code === questionDetail.code) return { ...questionDetail, options };
      return null;
    }
  };
}

function testApp({ role = 'teacher', authenticated = true, catalogService, contentService, user = { id: 'staff-user-1', email: 'teacher@test.com' }, profile } = {}) {
  const mockAuthenticate = (req, _res, next) => {
    if (!authenticated) {
      return next(Object.assign(new Error('Authentication required.'), { status: 401, code: 'AUTH_REQUIRED' }));
    }
    req.auth = {
      user,
      profile: profile || { role, display_name: 'Test Staff' },
      client: { userClient: true, from: () => ({}) }
    };
    next();
  };

  const app = createApp({
    catalogService: catalogService || makeCatalogService(),
    gameService: {
      createSession: async () => ({ id: 'session-1', status: 'active' }),
      submitAnswer: async () => ({ isCorrect: true, pointsAwarded: 1 }),
      finishSession: async (_, id) => ({ id, status: 'completed' }),
      getSession: async (_, id) => ({ id, answers: [] })
    },
    contentService: contentService || {
      createTopic: async (_client, _userId, body) => ({
        code: body?.code || 'new-topic',
        title: body?.title || 'New Topic',
        description: body?.description || '',
        competency: body?.competency || '',
        status: 'draft'
      }),
      updateTopic: async (_client, code, body) => ({
        code,
        title: body?.title || 'Updated Title',
        description: body?.description || '',
        competency: body?.competency || '',
        status: body?.status || 'published'
      }),
      createQuestion: async () => ({ code: 'new-q', version: 1 }),
      reviseQuestion: async () => ({ code: 'new-q', version: 2, status: 'draft', isDraftRevision: true }),
      publishQuestion: async (_client, code, targetVersion) => ({ code, status: 'published', currentVersion: targetVersion || 2 }),
      unpublishQuestion: async (_client, code) => ({ code, status: 'draft', currentVersion: 1 }),
      archiveQuestion: async () => ({ code: 'new-q', status: 'archived' })
    },
    authenticate: mockAuthenticate,
    connectivityCheck: async () => ({ reachable: true })
  });

  return { app };
}

// ---------------------------------------------------------------------------
// GET /api/v1/admin/topics
// ---------------------------------------------------------------------------

test('GET /admin/topics returns all topics (draft + published) for authenticated teacher', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data.length, 2);
    const codes = body.data.map(t => t.code);
    assert.ok(codes.includes('elements'), 'Published topic included');
    assert.ok(codes.includes('figurative-language'), 'Draft topic included');
  });
});

test('GET /admin/topics returns all topics for authenticated admin', async () => {
  const { app } = testApp({ role: 'admin' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data.length, 2);
  });
});

test('GET /admin/topics returns 401 for unauthenticated request', async () => {
  const { app } = testApp({ authenticated: false });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, 'AUTH_REQUIRED');
  });
});

test('GET /admin/topics returns 403 STAFF_REQUIRED for student role', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics`);
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

test('GET /admin/topics response includes expected topic fields including archived_at and created_by', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics`);
    const body = await response.json();
    assert.equal(response.status, 200);
    const published = body.data.find(t => t.code === 'elements');
    assert.ok(published, 'elements topic present');
    assert.equal(published.status, 'published');
    assert.ok('archived_at' in published, 'archived_at field present');
    assert.ok('created_by' in published, 'created_by field present');
    assert.ok('updated_at' in published, 'updated_at field present');
    const draft = body.data.find(t => t.code === 'figurative-language');
    assert.ok(draft, 'draft topic present');
    assert.equal(draft.status, 'draft');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/admin/questions/:questionCode
// ---------------------------------------------------------------------------

test('GET /admin/questions/:code returns full detail including rubric for authenticated teacher', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    const q = body.data;
    assert.equal(q.code, 'elem-q-001');
    assert.equal(q.topicCode, 'elements');
    assert.equal(q.status, 'published');
    assert.equal(q.currentVersion, 1);
    assert.ok(q.version, 'version present');
    assert.equal(q.version.versionNumber, 1);
    assert.equal(q.version.points, 2);
    assert.ok(q.rubric, 'rubric present');
    assert.ok(q.rubric.expectedAnswer, 'rubric expectedAnswer present');
    assert.ok(Array.isArray(q.rubric.rubricGroups), 'rubricGroups is array');
    assert.ok(Array.isArray(q.versionHistory), 'versionHistory is array');
    assert.equal(q.versionHistory.length, 1);
  });
});

test('GET /admin/questions/:code returns full detail for authenticated admin', async () => {
  const { app } = testApp({ role: 'admin' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.code, 'elem-q-001');
  });
});

test('GET /admin/questions/:code returns 401 for unauthenticated request', async () => {
  const { app } = testApp({ authenticated: false });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, 'AUTH_REQUIRED');
  });
});

test('GET /admin/questions/:code returns 403 STAFF_REQUIRED for student role', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001`);
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

test('GET /admin/questions/:code returns 404 for unknown question code', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/does-not-exist`);
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.error, 'QUESTION_NOT_FOUND');
  });
});

test('GET /admin/questions/:code returns 400 INVALID_QUESTION_CODE for malformed code', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    // Upper-case letters are invalid per route validation regex
    const response = await fetch(`${base}/api/v1/admin/questions/INVALID_CODE`);
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error, 'INVALID_QUESTION_CODE');
  });
});

test('GET /admin/questions/:code returns 400 INVALID_QUESTION_CODE for empty-ish code (single slash)', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    // A code starting with a hyphen is invalid
    const response = await fetch(`${base}/api/v1/admin/questions/-bad-code`);
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error, 'INVALID_QUESTION_CODE');
  });
});

// ---------------------------------------------------------------------------
// Regression: existing routes unaffected
// ---------------------------------------------------------------------------

test('Phase 6.1 regression: public GET /topics still returns published topics only', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/topics`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    // listTopics (public) mock only returns published
    assert.equal(body.data[0].code, 'elements');
  });
});

test('Phase 6.1 regression: GET /admin/topics/:topicCode/questions still requires staff', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements/questions`);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, 'STAFF_REQUIRED');
  });
});

test('Phase 6.1 regression: GET /admin/topics/:topicCode/questions succeeds for teacher', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements/questions`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
  });
});

// ---------------------------------------------------------------------------
// Phase 6.2: Authentication & Profile Identity Tests (/auth/me & /auth/config)
// ---------------------------------------------------------------------------

test('GET /auth/me returns authenticated teacher identity and role', async () => {
  const { app } = testApp({
    role: 'teacher',
    user: { id: 'teacher-101', email: 'guro@paaralan.edu.ph' },
    profile: { role: 'teacher', display_name: 'Guro Maria' }
  });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/auth/me`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.id, 'teacher-101');
    assert.equal(body.data.email, 'guro@paaralan.edu.ph');
    assert.equal(body.data.role, 'teacher');
    assert.equal(body.data.displayName, 'Guro Maria');
  });
});

test('GET /auth/me returns authenticated admin identity and role', async () => {
  const { app } = testApp({
    role: 'admin',
    user: { id: 'admin-001', email: 'admin@panitikard.ph' },
    profile: { role: 'admin', display_name: 'Tagapangasiwa' }
  });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/auth/me`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.id, 'admin-001');
    assert.equal(body.data.role, 'admin');
    assert.equal(body.data.displayName, 'Tagapangasiwa');
  });
});

test('GET /auth/me returns role student for authenticated student (for client-side rejection)', async () => {
  const { app } = testApp({
    role: 'student',
    user: { id: 'student-99', email: 'estudyante@paaralan.edu.ph' },
    profile: { role: 'student', display_name: 'Juan Dela Cruz' }
  });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/auth/me`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.role, 'student');
  });
});

test('GET /auth/me returns 401 AUTH_REQUIRED when unauthenticated', async () => {
  const { app } = testApp({ authenticated: false });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/auth/me`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, 'AUTH_REQUIRED');
  });
});

test('GET /auth/config returns public Supabase config and never reveals serviceRoleKey or secrets', async () => {
  const { app } = testApp();
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/auth/config`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok('supabaseUrl' in body.data, 'supabaseUrl present');
    assert.ok('supabaseAnonKey' in body.data, 'supabaseAnonKey present');
    const rawString = JSON.stringify(body);
    assert.equal(rawString.includes('serviceRoleKey'), false, 'Never leaks serviceRoleKey');
    assert.equal(rawString.includes('service_role'), false, 'Never leaks service_role');
    assert.equal(rawString.includes('apiKey'), false, 'Never leaks Gemini apiKey');
  });
});

// ---------------------------------------------------------------------------
// Phase 6.4: Dynamic Topic Management Tests (Create, Update, Publish, Archive)
// ---------------------------------------------------------------------------

test('POST /admin/topics creates a new topic in draft status for authorized teacher', async () => {
  let createdPayload = null;
  const contentService = {
    createTopic: async (_client, _userId, body) => {
      createdPayload = body;
      return { id: 'topic-99', code: body.code, title: body.title, status: 'draft' };
    }
  };
  const { app } = testApp({ role: 'teacher', contentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'matalinhagang-wika',
        title: 'Matalinhagang Wika at Tayutay',
        description: 'Mga halimbawa ng tayutay.',
        competency: 'Natutukoy ang mga tayutay.'
      })
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.code, 'matalinhagang-wika');
    assert.equal(body.data.status, 'draft');
    assert.equal(createdPayload.code, 'matalinhagang-wika');
  });
});

test('POST /admin/topics rejects student with 403 STAFF_REQUIRED', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'test-topic', title: 'Test' })
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

test('PATCH /admin/topics/:topicCode updates topic title and competency for teacher', async () => {
  let updatedCode = null;
  let updateFields = null;
  const contentService = {
    updateTopic: async (_client, code, body) => {
      updatedCode = code;
      updateFields = body;
      return { code, title: body.title, competency: body.competency, status: 'draft' };
    }
  };
  const { app } = testApp({ role: 'teacher', contentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Binagong Elemento', competency: 'Bagong kasanayan.' })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(updatedCode, 'elements');
    assert.equal(updateFields.title, 'Binagong Elemento');
    assert.equal(body.data.title, 'Binagong Elemento');
  });
});

test('PATCH /admin/topics/:topicCode publishes a topic (status = published)', async () => {
  let statusUpdate = null;
  const contentService = {
    updateTopic: async (_client, code, body) => {
      statusUpdate = body.status;
      return { code, title: 'Elemento', status: body.status };
    }
  };
  const { app } = testApp({ role: 'teacher', contentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'published' })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(statusUpdate, 'published');
    assert.equal(body.data.status, 'published');
  });
});

test('PATCH /admin/topics/:topicCode unpublishes a topic (revert to draft)', async () => {
  let statusUpdate = null;
  const contentService = {
    updateTopic: async (_client, code, body) => {
      statusUpdate = body.status;
      return { code, title: 'Elemento', status: body.status };
    }
  };
  const { app } = testApp({ role: 'teacher', contentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'draft' })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(statusUpdate, 'draft');
    assert.equal(body.data.status, 'draft');
  });
});

test('PATCH /admin/topics/:topicCode archives a topic (status = archived)', async () => {
  let statusUpdate = null;
  const contentService = {
    updateTopic: async (_client, code, body) => {
      statusUpdate = body.status;
      return { code, title: 'Elemento', status: body.status, archived_at: '2026-11-09T00:00:00Z' };
    }
  };
  const { app } = testApp({ role: 'admin', contentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'archived' })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(statusUpdate, 'archived');
    assert.equal(body.data.status, 'archived');
  });
});

test('PATCH /admin/topics/:topicCode rejects invalid topic code with 400 INVALID_TOPIC_CODE', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/INVALID_UPPERCASE_CODE`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Test' })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'INVALID_TOPIC_CODE');
  });
});

test('PATCH /admin/topics/:topicCode rejects student with 403 STAFF_REQUIRED', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Student Attempt' })
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// Phase 6.5: Dynamic Question Management Tests (Create, Revise, Archive)
// ---------------------------------------------------------------------------

test('POST /admin/topics/:topicCode/questions creates a new question for authorized teacher', async () => {
  let passedTopicCode = null;
  let passedUserId = null;
  let passedPayload = null;
  const contentService = {
    createQuestion: async (_client, userId, topicCode, body) => {
      passedUserId = userId;
      passedTopicCode = topicCode;
      passedPayload = body;
      return { code: body.slug ? `${topicCode}-${body.slug}` : 'elements-q-new', version: 1, status: 'draft' };
    }
  };
  const { app } = testApp({ role: 'teacher', user: { id: 'teacher-42', email: 'teacher@school.ph' }, contentService });
  await withServer(app, async base => {
    const questionPayload = {
      slug: 'kasukdulan',
      questionType: 'multiple_choice',
      cardCategory: 'question',
      prompt: 'Ano ang kasukdulan?',
      points: 1,
      choices: [
        { key: 'A', text: 'Pinakamataas na bahagi ng kwento' },
        { key: 'B', text: 'Simula ng kwento' }
      ],
      answerKey: 'A'
    };
    const response = await fetch(`${base}/api/v1/admin/topics/elements/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(questionPayload)
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(passedTopicCode, 'elements');
    assert.equal(passedUserId, 'teacher-42');
    assert.equal(passedPayload.prompt, 'Ano ang kasukdulan?');
    assert.equal(body.data.version, 1);
  });
});

test('POST /admin/topics/:topicCode/questions rejects invalid topic code with 400 INVALID_TOPIC_CODE', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/INVALID_TOPIC_CODE/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Test' })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'INVALID_TOPIC_CODE');
  });
});

test('POST /admin/topics/:topicCode/questions rejects student with 403 STAFF_REQUIRED', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Student Question' })
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

test('POST /admin/topics/:topicCode/questions rejects unauthenticated request with 401 AUTH_REQUIRED', async () => {
  const { app } = testApp({ authenticated: false });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements/questions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Unauthenticated' })
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, 'AUTH_REQUIRED');
  });
});

test('PUT /admin/questions/:questionCode revises question into new version for teacher', async () => {
  let revisedCode = null;
  let revisedUserId = null;
  let revisedPayload = null;
  const contentService = {
    reviseQuestion: async (_client, userId, questionCode, body) => {
      revisedUserId = userId;
      revisedCode = questionCode;
      revisedPayload = body;
      return { code: questionCode, version: 2, status: 'published' };
    }
  };
  const { app } = testApp({ role: 'teacher', user: { id: 'teacher-99', email: 'teacher99@school.ph' }, contentService });
  await withServer(app, async base => {
    const revisionData = {
      prompt: 'Na-update na tanong ukol sa kasukdulan?',
      points: 2,
      expectedAnswer: 'Ang pinakamatinding bahagi ng kwento.'
    };
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(revisionData)
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(revisedCode, 'elem-q-001');
    assert.equal(revisedUserId, 'teacher-99');
    assert.equal(revisedPayload.prompt, 'Na-update na tanong ukol sa kasukdulan?');
    assert.equal(body.data.version, 2);
  });
});

test('PUT /admin/questions/:questionCode rejects malformed code with 400 INVALID_QUESTION_CODE', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/INVALID_UPPERCASE_CODE`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Test' })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'INVALID_QUESTION_CODE');
  });
});

test('PUT /admin/questions/:questionCode rejects student with 403 STAFF_REQUIRED', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hacked question' })
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

test('DELETE /admin/questions/:questionCode archives question for admin or teacher', async () => {
  let archivedCode = null;
  const contentService = {
    archiveQuestion: async (_client, questionCode) => {
      archivedCode = questionCode;
      return { code: questionCode, status: 'archived', archived_at: '2026-11-09T12:00:00Z' };
    }
  };
  const { app } = testApp({ role: 'admin', contentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001`, {
      method: 'DELETE'
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(archivedCode, 'elem-q-001');
    assert.equal(body.data.status, 'archived');
  });
});

test('DELETE /admin/questions/:questionCode rejects student with 403 STAFF_REQUIRED', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001`, {
      method: 'DELETE'
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

test('DELETE /admin/questions/:questionCode rejects malformed question code with 400 INVALID_QUESTION_CODE', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/BAD_CODE_UPPERCASE`, {
      method: 'DELETE'
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'INVALID_QUESTION_CODE');
  });
});

// ---------------------------------------------------------------------------
// Phase 6.6: Rubric Management Endpoints (GET /admin/rubrics)
// ---------------------------------------------------------------------------

test('GET /admin/rubrics returns rubric summaries for authorized teacher', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/rubrics`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(Array.isArray(body.data), true);
    assert.equal(body.data.length, 1);
    const item = body.data[0];
    assert.equal(item.questionCode, 'elem-q-001');
    assert.equal(item.topicCode, 'elements');
    assert.equal(item.versionNumber, 1);
    assert.equal(item.hasRubric, true);
    assert.ok(item.rubric, 'rubric object present');
    assert.equal(item.rubric.expectedAnswer, 'Ang tema ng tula ay pag-asa at katatagan.');
    assert.equal(item.rubric.rubricGroups.length, 2);
  });
});

test('GET /admin/rubrics returns rubric summaries for authorized admin', async () => {
  const { app } = testApp({ role: 'admin' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/rubrics`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.length, 1);
  });
});

test('GET /admin/rubrics supports topicCode filter', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    // Matching topic
    const matchRes = await fetch(`${base}/api/v1/admin/rubrics?topicCode=elements`);
    const matchBody = await matchRes.json();
    assert.equal(matchRes.status, 200);
    assert.equal(matchBody.data.length, 1);

    // Non-matching topic
    const noMatchRes = await fetch(`${base}/api/v1/admin/rubrics?topicCode=other-topic`);
    const noMatchBody = await noMatchRes.json();
    assert.equal(noMatchRes.status, 200);
    assert.equal(noMatchBody.data.length, 0);
  });
});

test('GET /admin/rubrics rejects invalid topic code with 400 INVALID_TOPIC_CODE', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/rubrics?topicCode=INVALID_UPPERCASE`);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'INVALID_TOPIC_CODE');
  });
});

test('GET /admin/rubrics rejects student with 403 STAFF_REQUIRED', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/rubrics`);
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

test('GET /admin/rubrics rejects unauthenticated with 401 AUTH_REQUIRED', async () => {
  const { app } = testApp({ authenticated: false });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/rubrics`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, 'AUTH_REQUIRED');
  });
});

// ---------------------------------------------------------------------------
// Phase 6.7: Draft & Publishing Workflow (Option B) Tests
// ---------------------------------------------------------------------------

test('POST /admin/questions/:questionCode/publish publishes question for teacher', async () => {
  let publishedParams = null;
  const mockContentService = {
    publishQuestion: async (_client, code, version) => {
      publishedParams = { code, version };
      return { id: 'q-1', code, status: 'published', currentVersion: version || 2 };
    }
  };
  const { app } = testApp({ role: 'teacher', contentService: mockContentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionNumber: 2 })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'published');
    assert.equal(body.data.currentVersion, 2);
    assert.deepEqual(publishedParams, { code: 'elem-q-001', version: 2 });
  });
});

test('POST /admin/questions/:questionCode/publish defaults to latest version when versionNumber is omitted', async () => {
  let publishedParams = null;
  const mockContentService = {
    publishQuestion: async (_client, code, version) => {
      publishedParams = { code, version };
      return { id: 'q-1', code, status: 'published', currentVersion: 2 };
    }
  };
  const { app } = testApp({ role: 'admin', contentService: mockContentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'published');
    assert.deepEqual(publishedParams, { code: 'elem-q-001', version: null });
  });
});

test('POST /admin/questions/:questionCode/publish rejects invalid code with 400 INVALID_QUESTION_CODE', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/INVALID_UPPERCASE/publish`, {
      method: 'POST'
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, 'INVALID_QUESTION_CODE');
  });
});

test('POST /admin/questions/:questionCode/publish rejects student with 403 STAFF_REQUIRED', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001/publish`, {
      method: 'POST'
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

test('POST /admin/questions/:questionCode/publish rejects unauthenticated with 401 AUTH_REQUIRED', async () => {
  const { app } = testApp({ authenticated: false });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001/publish`, {
      method: 'POST'
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, 'AUTH_REQUIRED');
  });
});

test('POST /admin/questions/:questionCode/unpublish reverts question to draft for teacher', async () => {
  let unpublishedCode = null;
  const mockContentService = {
    unpublishQuestion: async (_client, code) => {
      unpublishedCode = code;
      return { id: 'q-1', code, status: 'draft', currentVersion: 1 };
    }
  };
  const { app } = testApp({ role: 'teacher', contentService: mockContentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001/unpublish`, {
      method: 'POST'
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'draft');
    assert.equal(unpublishedCode, 'elem-q-001');
  });
});

test('POST /admin/questions/:questionCode/unpublish rejects student with 403 STAFF_REQUIRED', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001/unpublish`, {
      method: 'POST'
    });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

test('GET /admin/questions/:code passes version and previewDraft query parameters', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001?version=2&previewDraft=true`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.options.version, '2');
    assert.equal(body.data.options.previewDraft, true);
  });
});

test('contentService Option B: reviseQuestion creates draft version without advancing current_version', async () => {
  const { createContentService } = require('../src/services/contentService');
  const service = createContentService();

  const rpcCalls = [];
  const inserts = [];
  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'q-uuid-1', code: 'test-q', current_version: 1, status: 'published', card_category_id: null },
                error: null
              })
            })
          })
        };
      }
      if (table === 'question_versions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { version_number: 1 },
                    error: null
                  })
                })
              })
            })
          }),
          insert: (data) => {
            inserts.push({ table, data });
            return {
              select: () => ({
                single: async () => ({ data: { id: 'ver-uuid-2' }, error: null })
              })
            };
          }
        };
      }
      if (table === 'question_evaluation_rubrics') {
        return {
          insert: async (data) => {
            inserts.push({ table, data });
            return { error: null };
          }
        };
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        insert: async () => ({ error: null })
      };
    },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      return { data: true, error: null };
    }
  };

  const revisionInput = {
    questionType: 'open_ended',
    prompt: 'Na-update na prompt',
    points: 2,
    expectedAnswer: 'Sagot'
  };

  const result = await service.reviseQuestion(mockClient, 'teacher-user-1', 'test-q', revisionInput);

  assert.equal(result.code, 'test-q');
  assert.equal(result.status, 'draft');
  assert.equal(result.version, 2);
  assert.equal(result.currentVersion, 1);
  assert.equal(result.isDraftRevision, true);
  // publish_question_version RPC MUST NOT have been called during revision!
  assert.equal(rpcCalls.length, 0, 'publish_question_version must not be called during revision in Option B');
});

test('contentService Option B: publishQuestion explicitly calls publish_question_version RPC', async () => {
  const { createContentService } = require('../src/services/contentService');
  const service = createContentService();

  const rpcCalls = [];
  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'q-uuid-1', code: 'test-q', current_version: 1, status: 'published' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'question_versions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { version_number: 2 },
                    error: null
                  })
                })
              })
            })
          })
        };
      }
      return {};
    },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      return { data: true, error: null };
    }
  };

  const result = await service.publishQuestion(mockClient, 'test-q', 2);
  assert.equal(result.code, 'test-q');
  assert.equal(result.status, 'published');
  assert.equal(result.currentVersion, 2);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'publish_question_version');
  assert.deepEqual(rpcCalls[0].params, {
    p_question_id: 'q-uuid-1',
    p_version_number: 2,
    p_status: 'published'
  });
});

test('contentService Option B: unpublishQuestion calls publish_question_version RPC with draft status', async () => {
  const { createContentService } = require('../src/services/contentService');
  const service = createContentService();

  const rpcCalls = [];
  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'q-uuid-1', code: 'test-q', current_version: 2, status: 'published' },
                error: null
              })
            })
          })
        };
      }
      return {};
    },
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      return { data: true, error: null };
    }
  };

  const result = await service.unpublishQuestion(mockClient, 'test-q');
  assert.equal(result.code, 'test-q');
  assert.equal(result.status, 'draft');
  assert.equal(result.currentVersion, 2);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].fn, 'publish_question_version');
  assert.deepEqual(rpcCalls[0].params, {
    p_question_id: 'q-uuid-1',
    p_version_number: 2,
    p_status: 'draft'
  });
});

// ---------------------------------------------------------------------------
// Regression tests — Phase 6.8 fixes
// Fix 1 (HIGH-1): Public catalog must not expose draft metadata
// Fix 2 (MEDIUM-3): Archived question must reject new draft revisions
// ---------------------------------------------------------------------------

test('Fix 1: catalogService.listQuestions omits draft metadata for public calls and includes it for staff', async () => {
  // This test calls the REAL catalogService.listQuestions() with a fully-wired mock DB client.
  // It verifies that the conditional spread at catalogService.js L113 correctly gates
  // hasDraftRevision, draftVersionNumber, and latestVersionNumber behind includeDrafts.
  //
  // Setup: one published question (current_version: 1) with a pending draft revision (version 2).
  // latestVersionNumber (2) > current_version (1) → hasDraftRevision: true.
  const { createCatalogService } = require('../src/services/catalogService');
  const service = createCatalogService();

  const TOPIC = { id: 'topic-1', code: 'elements', title: 'Elemento ng Panitikan', status: 'published' };
  const QUESTION = { id: 'q-1', code: 'elem-q-001', current_version: 1, status: 'published', card_category_id: null };
  // Two versions: v1 is published (current_version), v2 is an unmerged draft revision.
  const VERSIONS = [
    { id: 'v-1', question_id: 'q-1', version_number: 1, question_type: 'open_ended', card_category_id: null, card_categories: null, title: 'Tanong 1', prompt: 'Ipaliwanag ang tema.', explanation: null, hint: null, points: 2, time_limit_seconds: 60, difficulty: 'medium', category_label: null, tag: null, payload: {}, created_at: '2026-01-15T00:00:00Z' },
    { id: 'v-2', question_id: 'q-1', version_number: 2, question_type: 'open_ended', card_category_id: null, card_categories: null, title: 'Tanong 2 Draft', prompt: 'Bagong prompt.', explanation: null, hint: null, points: 2, time_limit_seconds: 60, difficulty: 'medium', category_label: null, tag: null, payload: {}, created_at: '2026-06-01T00:00:00Z' },
  ];

  // Fluent chainable mock — all selector methods return 'chain'; awaiting resolves { data, error }.
  function makeChainable(resolveData, error = null) {
    const chain = {
      then: (fn) => Promise.resolve({ data: resolveData, error }).then(fn),
      maybeSingle: async () => ({ data: resolveData, error }),
      single: async () => ({ data: resolveData, error }),
    };
    ['select', 'eq', 'is', 'not', 'order', 'in', 'limit'].forEach(m => { chain[m] = () => chain; });
    return chain;
  }

  function makeClient() {
    return {
      from: (table) => {
        if (table === 'topics') return makeChainable(TOPIC);
        if (table === 'questions') return makeChainable([QUESTION]);
        if (table === 'question_versions') return makeChainable(VERSIONS);
        if (table === 'question_choices') return makeChainable([]);
        return makeChainable([]); // question_evaluation_rubrics and any future tables
      }
    };
  }

  // --- Public response: includeDrafts: false (the default for the student-facing route) ---
  const publicResult = await service.listQuestions('elements', makeClient(), { includeDrafts: false });
  assert.equal(publicResult.questions.length, 1, 'Public: one published question returned');
  const publicQ = publicResult.questions[0];
  assert.equal(publicQ.code, 'elem-q-001', 'Public: question code is correct');
  assert.ok('prompt' in publicQ, 'Public: prompt is present (legitimate field)');
  assert.ok('code' in publicQ, 'Public: code is present');
  // These three fields must be absent from the public response — the fix is at L113 of catalogService.js
  assert.ok(!('hasDraftRevision' in publicQ), 'Public: hasDraftRevision must be absent');
  assert.ok(!('draftVersionNumber' in publicQ), 'Public: draftVersionNumber must be absent');
  assert.ok(!('latestVersionNumber' in publicQ), 'Public: latestVersionNumber must be absent');

  // --- Staff response: includeDrafts: true (the authenticated staff route) ---
  const staffResult = await service.listQuestions('elements', makeClient(), { includeDrafts: true });
  assert.equal(staffResult.questions.length, 1, 'Staff: one question returned');
  const staffQ = staffResult.questions[0];
  // These three fields must be present and correctly computed for the staff response
  assert.ok('hasDraftRevision' in staffQ, 'Staff: hasDraftRevision must be present');
  assert.ok('draftVersionNumber' in staffQ, 'Staff: draftVersionNumber must be present');
  assert.ok('latestVersionNumber' in staffQ, 'Staff: latestVersionNumber must be present');
  assert.equal(staffQ.hasDraftRevision, true, 'Staff: hasDraftRevision is true (v2 > current_version 1)');
  assert.equal(staffQ.draftVersionNumber, 2, 'Staff: draftVersionNumber is 2');
  assert.equal(staffQ.latestVersionNumber, 2, 'Staff: latestVersionNumber is 2');
});

test('Fix 1: GET /admin/topics/:topicCode/questions staff route uses includeDrafts: true via catalogService mock', async () => {
  // Verifies that the staff questions route receives includeDrafts: true in options
  // by inspecting what makeCatalogService.listQuestions captures.
  let capturedOptions = null;
  const catalogService = {
    ...makeCatalogService(),
    listQuestions: async (code, _client, options) => {
      capturedOptions = options;
      return { topic: { code }, questions: [] };
    }
  };
  const { app } = testApp({ role: 'teacher', catalogService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/topics/elements/questions`);
    assert.equal(response.status, 200);
    assert.ok(capturedOptions !== null, 'options must have been passed to listQuestions');
    assert.equal(capturedOptions.includeDrafts, true, 'Staff route must pass includeDrafts: true');
  });
});

test('Fix 2: PUT /admin/questions/:questionCode returns 409 QUESTION_ARCHIVED when question is archived', async () => {
  const { HttpError } = require('../src/middleware/httpError');
  const contentService = {
    reviseQuestion: async () => {
      throw new HttpError(409, 'QUESTION_ARCHIVED', 'Cannot revise an archived question. Restore it first.');
    }
  };
  const { app } = testApp({ role: 'teacher', contentService });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Updated prompt', points: 2, expectedAnswer: 'Sagot' })
    });
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error, 'QUESTION_ARCHIVED');
    assert.equal(body.success, false);
  });
});

test('Fix 2: contentService reviseQuestion rejects an archived question with 409 QUESTION_ARCHIVED', async () => {
  const { createContentService } = require('../src/services/contentService');
  const service = createContentService();

  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'q-uuid-arc', code: 'archived-q', current_version: 1, status: 'archived', card_category_id: null },
                error: null
              })
            })
          })
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: async () => ({ error: null })
      };
    },
    rpc: async () => ({ data: true, error: null })
  };

  const revisionInput = {
    questionType: 'open_ended',
    prompt: 'Attempting to revise archived question',
    points: 1,
    expectedAnswer: 'Should be blocked'
  };

  await assert.rejects(
    () => service.reviseQuestion(mockClient, 'teacher-user-1', 'archived-q', revisionInput),
    (err) => {
      assert.equal(err.status, 409, `Expected 409, got ${err.status}`);
      assert.equal(err.code, 'QUESTION_ARCHIVED', `Expected QUESTION_ARCHIVED, got ${err.code}`);
      return true;
    },
    'reviseQuestion must throw HttpError 409 QUESTION_ARCHIVED for archived questions'
  );
});

// ---------------------------------------------------------------------------
// Admin-Only System Status & API Settings Endpoints (requireAdmin)
// ---------------------------------------------------------------------------

test('GET /admin/system-status returns 200 and full system status for authenticated admin', async () => {
  const { app } = testApp({ role: 'admin' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/system-status`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.apiServer.status, 'online');
    assert.equal(body.data.database.status, 'connected');
    assert.equal(body.data.database.label, 'Connected');
    assert.equal(body.data.database.reachable, true);
    assert.equal(body.data.rlsSecurity.status, 'not_verified');
    assert.equal(body.data.rlsSecurity.label, 'Not verified');
    assert.equal(body.data.rlsSecurity.verified, false);
    assert.ok(body.data.evaluator, 'evaluator status present');
    assert.equal(body.data.evaluator.status, 'operational');
    assert.equal(body.data.evaluator.label, 'Operational');
    assert.ok(body.data.apiSettings, 'apiSettings present');
    assert.equal(body.data.apiSettings.rbacProtection, 'RBAC Protected');
  });
});

test('GET /admin/system-status reports disconnected and unconfigured states accurately from connectivityCheck', async () => {
  const disconnectedApp = createApp({
    catalogService: makeCatalogService(),
    gameService: {},
    contentService: {},
    authenticate: (req, _res, next) => {
      req.auth = { user: { id: 'admin-1' }, profile: { role: 'admin' }, client: {} };
      next();
    },
    connectivityCheck: async () => ({ reachable: false, reason: 'query_failed' })
  });

  await withServer(disconnectedApp, async base => {
    const response = await fetch(`${base}/api/v1/admin/system-status`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.database.status, 'disconnected');
    assert.equal(body.data.database.label, 'Disconnected');
    assert.equal(body.data.database.reachable, false);
  });

  const unconfiguredApp = createApp({
    catalogService: makeCatalogService(),
    gameService: {},
    contentService: {},
    authenticate: (req, _res, next) => {
      req.auth = { user: { id: 'admin-1' }, profile: { role: 'admin' }, client: {} };
      next();
    },
    connectivityCheck: async () => ({ reachable: false, reason: 'not_configured' })
  });

  await withServer(unconfiguredApp, async base => {
    const response = await fetch(`${base}/api/v1/admin/system-status`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.database.status, 'unconfigured');
    assert.equal(body.data.database.label, 'Unconfigured');
    assert.equal(body.data.database.reachable, false);
  });
});

test('GET /admin/system-status returns 403 ADMIN_REQUIRED for authenticated teacher', async () => {
  const { app } = testApp({ role: 'teacher' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/system-status`);
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.success, false);
    assert.equal(body.error, 'ADMIN_REQUIRED');
  });
});

test('GET /admin/system-status returns 403 ADMIN_REQUIRED for student role', async () => {
  const { app } = testApp({ role: 'student' });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/system-status`);
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.error, 'ADMIN_REQUIRED');
  });
});

test('GET /admin/system-status returns 401 AUTH_REQUIRED for unauthenticated request', async () => {
  const { app } = testApp({ authenticated: false });
  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/system-status`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error, 'AUTH_REQUIRED');
  });
});

test('GET /admin/api-settings returns 200 for admin and 403 ADMIN_REQUIRED for teacher', async () => {
  const { app: adminApp } = testApp({ role: 'admin' });
  await withServer(adminApp, async base => {
    const response = await fetch(`${base}/api/v1/admin/api-settings`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.basePath, '/api/v1');
    assert.equal(body.data.adminRoleRequired, true);
  });

  const { app: teacherApp } = testApp({ role: 'teacher' });
  await withServer(teacherApp, async base => {
    const response = await fetch(`${base}/api/v1/admin/api-settings`);
    const body = await response.json();
    assert.equal(response.status, 403);
    assert.equal(body.success, false);
    assert.equal(body.error, 'ADMIN_REQUIRED');
  });
});

test('Security Regression: Real Teacher profile processed through createAuthenticator cannot access Admin-only endpoints', async () => {
  const { createAuthenticator } = require('../src/middleware/authenticate');
  const realAuthenticate = createAuthenticator({
    userClientFactory: () => ({
      auth: {
        getUser: async () => ({
          data: { user: { id: 'teacher-real-1', email: 'teacher@paaralan.ph' } },
          error: null
        })
      },
      from: (table) => {
        assert.equal(table, 'profiles');
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'teacher-real-1', display_name: 'Guro Reyes', role: 'teacher' },
                error: null
              })
            })
          })
        };
      }
    })
  });

  const app = createApp({
    catalogService: makeCatalogService(),
    gameService: {},
    contentService: {},
    authenticate: realAuthenticate,
    connectivityCheck: async () => ({ reachable: true })
  });

  await withServer(app, async base => {
    const headers = { authorization: 'Bearer valid-supabase-teacher-jwt' };

    const statusRes = await fetch(`${base}/api/v1/admin/system-status`, { headers });
    const statusBody = await statusRes.json();
    assert.equal(statusRes.status, 403);
    assert.equal(statusBody.success, false);
    assert.equal(statusBody.error, 'ADMIN_REQUIRED');

    const settingsRes = await fetch(`${base}/api/v1/admin/api-settings`, { headers });
    const settingsBody = await settingsRes.json();
    assert.equal(settingsRes.status, 403);
    assert.equal(settingsBody.success, false);
    assert.equal(settingsBody.error, 'ADMIN_REQUIRED');
  });
});

test('Security Regression: Valid guest HMAC token cannot access Admin-only endpoints', async () => {
  const { createAuthenticator } = require('../src/middleware/authenticate');
  const { generateGuestToken } = require('../src/services/guestTokenService');

  const guestToken = generateGuestToken({
    sessionId: '00000000-0000-4000-8000-000000000123',
    studentName: 'Juan Dela Cruz'
  });
  const realAuthenticate = createAuthenticator({
    userClientFactory: () => ({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { message: 'invalid JWT: unable to parse or verify signature' }
        })
      }
    })
  });

  const app = createApp({
    catalogService: makeCatalogService(),
    gameService: {},
    contentService: {},
    authenticate: realAuthenticate,
    connectivityCheck: async () => ({ reachable: true })
  });

  await withServer(app, async base => {
    const headers = {
      authorization: `Bearer ${guestToken}`,
      'x-guest-token': guestToken
    };

    const statusRes = await fetch(`${base}/api/v1/admin/system-status`, { headers });
    const statusBody = await statusRes.json();
    assert.equal(statusRes.status, 401);
    assert.equal(statusBody.success, false);
    assert.equal(statusBody.error, 'INVALID_TOKEN');

    const settingsRes = await fetch(`${base}/api/v1/admin/api-settings`, { headers });
    const settingsBody = await settingsRes.json();
    assert.equal(settingsRes.status, 401);
    assert.equal(settingsBody.success, false);
    assert.equal(settingsBody.error, 'INVALID_TOKEN');
  });
});

test('Security Regression: Admin endpoint responses and public /health do not expose URLs, API keys, service-role keys, or secrets', async () => {
  const { app } = testApp({ role: 'admin' });
  await withServer(app, async base => {
    const healthRes = await fetch(`${base}/health`);
    const healthBody = await healthRes.json();
    const healthRaw = JSON.stringify(healthBody);

    assert.equal(healthRes.status, 200);
    assert.equal(healthBody.success, true);
    assert.equal(healthBody.status, 'healthy');
    assert.equal(healthBody.supabase?.connectivity?.reachable, true);
    assert.equal(healthBody.environment, undefined, '/health must not expose environment');
    assert.equal(healthBody.supabase?.hasServiceRoleKey, undefined, '/health must not expose hasServiceRoleKey');
    assert.equal(healthBody.supabase?.serviceRoleActive, undefined, '/health must not expose serviceRoleActive');
    assert.equal(healthBody.supabase?.hasUrl, undefined, '/health must not expose hasUrl');
    assert.equal(healthBody.supabase?.hasAnonKey, undefined, '/health must not expose hasAnonKey');
    assert.equal(healthBody.supabase?.statusMessage, undefined, '/health must not expose statusMessage');

    const statusRes = await fetch(`${base}/api/v1/admin/system-status`);
    const statusBody = await statusRes.json();
    const statusRaw = JSON.stringify(statusBody);

    const settingsRes = await fetch(`${base}/api/v1/admin/api-settings`);
    const settingsBody = await settingsRes.json();
    const settingsRaw = JSON.stringify(settingsBody);

    for (const raw of [healthRaw, statusRaw, settingsRaw]) {
      assert.equal(/supabase\.co/i.test(raw), false, 'Response must not contain Supabase project URL');
      assert.equal(/service_role|serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY/i.test(raw), false, 'Response must not expose service role key metadata');
      assert.equal(/anonKey|SUPABASE_ANON_KEY/i.test(raw), false, 'Response must not expose anon key metadata');
      assert.equal(/GUEST_SESSION_SECRET/i.test(raw), false, 'Response must not expose guest session secret');
    }
  });
});

// ---------------------------------------------------------------------------
// Regression Tests: Question Publishing Error Mapping (contentService.check)
// ---------------------------------------------------------------------------

test('Regression: Publishing a question under a draft topic (23514) returns a clear 400 CONSTRAINT_VIOLATION error, not generic 503', async () => {
  const { createContentService } = require('../src/services/contentService');
  const service = createContentService();

  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'q-uuid-draft-topic', code: 'draft-topic-q-01', current_version: 1, status: 'draft' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'question_versions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { version_number: 1 },
                    error: null
                  })
                })
              })
            })
          })
        };
      }
      return {};
    },
    rpc: async () => ({
      data: null,
      error: {
        code: '23514',
        message: 'Publish the topic before publishing its question'
      }
    })
  };

  const app = createApp({
    catalogService: makeCatalogService(),
    gameService: {},
    contentService: service,
    authenticate: (req, _res, next) => {
      req.auth = { user: { id: 'teacher-1' }, profile: { role: 'teacher' }, client: mockClient };
      next();
    },
    connectivityCheck: async () => ({ reachable: true })
  });

  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/draft-topic-q-01/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionNumber: 1 })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error, 'CONSTRAINT_VIOLATION');
    assert.equal(body.message, 'Publish the topic before publishing its question.');
    assert.notEqual(body.message, 'A server error occurred.');
  });
});

test('Regression: Publishing a question under a published topic succeeds with 200 OK', async () => {
  const { createContentService } = require('../src/services/contentService');
  const service = createContentService();

  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'q-uuid-pub-topic', code: 'pub-topic-q-01', current_version: 1, status: 'draft' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'question_versions') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { version_number: 1 },
                    error: null
                  })
                })
              })
            })
          })
        };
      }
      return {};
    },
    rpc: async () => ({ data: true, error: null })
  };

  const app = createApp({
    catalogService: makeCatalogService(),
    gameService: {},
    contentService: service,
    authenticate: (req, _res, next) => {
      req.auth = { user: { id: 'teacher-1' }, profile: { role: 'teacher' }, client: mockClient };
      next();
    },
    connectivityCheck: async () => ({ reachable: true })
  });

  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/pub-topic-q-01/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionNumber: 1 })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.code, 'pub-topic-q-01');
    assert.equal(body.data.status, 'published');
    assert.equal(body.data.currentVersion, 1);
  });
});

test('Regression: contentService maps known PostgreSQL codes safely and masks unknown database errors as 503', async () => {
  const { createContentService } = require('../src/services/contentService');
  const service = createContentService();

  function makeFailingPublishClient(pgError) {
    return {
      from: (table) => {
        if (table === 'questions') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: 'q-uuid-1', code: 'elem-q-001', current_version: 1, status: 'draft' },
                  error: null
                })
              })
            })
          };
        }
        return {};
      },
      rpc: async () => ({ data: null, error: pgError })
    };
  }

  // 23505 -> 409 ALREADY_EXISTS
  await assert.rejects(
    () => service.publishQuestion(makeFailingPublishClient({ code: '23505', message: 'duplicate key value violates unique constraint' }), 'elem-q-001', 1),
    (err) => err.status === 409 && err.code === 'ALREADY_EXISTS' && !/unique constraint/i.test(err.message)
  );

  // 23514 (raw SQL check constraint) -> 400 CONSTRAINT_VIOLATION with sanitized message
  await assert.rejects(
    () => service.publishQuestion(makeFailingPublishClient({ code: '23514', message: 'new row for relation "public.questions" violates check constraint "questions_status_check"' }), 'elem-q-001', 1),
    (err) => err.status === 400 && err.code === 'CONSTRAINT_VIOLATION' && !/public\.questions|questions_status_check/i.test(err.message)
  );

  // P0002 -> 404 NOT_FOUND
  await assert.rejects(
    () => service.publishQuestion(makeFailingPublishClient({ code: 'P0002', message: 'Question not found' }), 'elem-q-001', 1),
    (err) => err.status === 404 && err.code === 'NOT_FOUND' && err.message === 'Question not found.'
  );

  // 42501 -> 403 FORBIDDEN
  await assert.rejects(
    () => service.publishQuestion(makeFailingPublishClient({ code: '42501', message: 'Teacher or administrator permission required' }), 'elem-q-001', 1),
    (err) => err.status === 403 && err.code === 'FORBIDDEN'
  );

  // 22023 and 23503 -> 400 INVALID_INPUT
  await assert.rejects(
    () => service.publishQuestion(makeFailingPublishClient({ code: '22023', message: 'invalid parameter value' }), 'elem-q-001', 1),
    (err) => err.status === 400 && err.code === 'INVALID_INPUT'
  );
  await assert.rejects(
    () => service.publishQuestion(makeFailingPublishClient({ code: '23503', message: 'insert or update on table violates foreign key constraint' }), 'elem-q-001', 1),
    (err) => err.status === 400 && err.code === 'INVALID_INPUT' && !/foreign key constraint/i.test(err.message)
  );

  // Unknown database error (e.g. 42P01 or XX000) -> 503 DATABASE_ERROR and masked as "A server error occurred." by Express
  const unknownDbClient = makeFailingPublishClient({
    code: 'XX000',
    message: 'FATAL: internal postgres relation pg_catalog.pg_class corrupted at secret_host'
  });
  const app = createApp({
    catalogService: makeCatalogService(),
    gameService: {},
    contentService: service,
    authenticate: (req, _res, next) => {
      req.auth = { user: { id: 'teacher-1' }, profile: { role: 'teacher' }, client: unknownDbClient };
      next();
    },
    connectivityCheck: async () => ({ reachable: true })
  });

  await withServer(app, async base => {
    const response = await fetch(`${base}/api/v1/admin/questions/elem-q-001/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionNumber: 1 })
    });
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.equal(body.error, 'DATABASE_ERROR');
    assert.equal(body.message, 'A server error occurred.');
    assert.equal(/pg_catalog|secret_host/i.test(JSON.stringify(body)), false);
  });
});
