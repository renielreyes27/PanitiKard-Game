/**
 * PanitiKard V2 — Phase 6.8 End-to-End Integration & Workflow Test Suite
 *
 * Comprehensive integration tests covering:
 *   1. Staff authentication, role verification, and configuration security.
 *   2. Complete Topic lifecycle (draft, update, publish, unpublish, archive).
 *   3. Question creation (draft-first) and explicit publishing.
 *   4. Student gameplay session creation and immutable version snapshotting.
 *   5. Option B question revision creating draft (v2) while v1 remains active for students.
 *   6. Draft preview isolation (staff can preview v2; students cannot see v2).
 *   7. Ongoing game session scoring strictly against snapshotted version (v1).
 *   8. Explicit publishing of v2 and transition for new sessions.
 *   9. Question unpublishing hiding content from public APIs without corrupting existing sessions.
 *  10. Rubric management viewing and role-based access control (RBAC) security enforcement.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp } = require('../src/server');
const { createCatalogService } = require('../src/services/catalogService');
const { createContentService } = require('../src/services/contentService');
const { createGameService } = require('../src/services/gameService');

async function withServer(app, run) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

/**
 * Creates an in-memory database mock simulating Postgres tables and RPCs
 * for PanitiKard V2 catalog, gameplay, and staff management.
 */
function createInMemoryDb() {
  const state = {
    topics: [],
    questions: [],
    question_versions: [],
    question_evaluation_rubrics: [],
    question_choices: [],
    card_categories: [
      { id: 'cat-tula', code: 'tula', label: 'Tula' },
      { id: 'cat-kwento', code: 'kwento', label: 'Maikling Kwento' },
      { id: 'cat-sanaysay', code: 'sanaysay', label: 'Sanaysay' },
      { id: 'cat-dula', code: 'dula', label: 'Dula' }
    ],
    game_sessions: [],
    student_answers: []
  };

  let uuidCounter = 1;
  const nextUuid = (prefix = 'uuid') => `${prefix}-${uuidCounter++}`;

  function createClient(currentUser = null, currentRole = 'student') {
    const isStaff = ['teacher', 'admin'].includes(currentRole);

    return {
      rpc: async (fn, params) => {
        if (fn === 'publish_question_version') {
          if (!isStaff) {
            return { data: null, error: { code: '42501', message: 'Teacher or admin required.' } };
          }
          const q = state.questions.find(item => item.id === params.p_question_id);
          if (!q) return { data: null, error: { code: 'P0002', message: 'Question not found.' } };
          const v = state.question_versions.find(item => item.question_id === q.id && item.version_number === params.p_version_number);
          if (!v) return { data: null, error: { code: '23514', message: 'Version does not exist.' } };
          const r = state.question_evaluation_rubrics.find(item => item.question_version_id === v.id);
          if (!r) return { data: null, error: { code: '23514', message: 'Rubric must exist.' } };

          q.current_version = params.p_version_number;
          q.status = params.p_status;
          q.question_type = v.question_type;
          q.card_category_id = v.card_category_id;
          q.updated_at = new Date().toISOString();
          if (params.p_status === 'archived') q.archived_at = new Date().toISOString();
          else q.archived_at = null;
          return { data: q, error: null };
        }

        if (fn === 'create_game_session') {
          const topic = state.topics.find(t => t.code === params.p_topic_code && t.status === 'published' && !t.archived_at);
          if (!topic) return { data: null, error: { code: 'P0002', message: 'Published topic not found.' } };

          const activeQuestions = state.questions.filter(q => q.topic_id === topic.id && q.status === 'published' && !q.archived_at);
          const versionSnapshot = {};
          activeQuestions.forEach(q => {
            const v = state.question_versions.find(ver => ver.question_id === q.id && ver.version_number === q.current_version);
            if (v) versionSnapshot[q.code] = v.id;
          });

          if (Object.keys(versionSnapshot).length === 0) {
            return { data: null, error: { code: 'P0002', message: 'Topic has no published questions.' } };
          }

          const session = {
            id: nextUuid('session'),
            student_id: currentUser?.id || 'anonymous',
            topic_id: topic.id,
            mode: params.p_mode,
            student_name_snapshot: params.p_student_name || 'Mag-aaral',
            question_versions: versionSnapshot,
            status: 'active',
            main_score: 0,
            reverse_score: 0,
            started_at: new Date().toISOString(),
            completed_at: null
          };
          state.game_sessions.push(session);
          return { data: session, error: null };
        }

        if (fn === 'submit_game_answer') {
          const session = state.game_sessions.find(s => s.id === params.p_session_id);
          if (!session || session.status !== 'active') {
            return { data: null, error: { code: 'P0002', message: 'Active game session not found.' } };
          }
          const snapVersionId = session.question_versions[params.p_question_code];
          if (!snapVersionId) {
            return { data: null, error: { code: 'P0002', message: 'Question not part of session snapshot.' } };
          }
          const existing = state.student_answers.find(a => a.session_id === session.id && a.question_code === params.p_question_code && a.round === params.p_round);
          if (existing) {
            return { data: null, error: { code: '23505', message: 'Answer already recorded.' } };
          }

          const ver = state.question_versions.find(v => v.id === snapVersionId);
          const rubric = state.question_evaluation_rubrics.find(r => r.question_version_id === ver.id);

          const isTimeout = params.p_is_timeout === true;
          let isCorrect = false;
          let points = 0;
          if (!isTimeout && rubric) {
            const cleanResp = String(params.p_response || '').trim().toLowerCase();
            const cleanExp = String(rubric.expected_answer || rubric.answer_key || '').trim().toLowerCase();
            isCorrect = cleanResp === cleanExp || (Array.isArray(rubric.accepted_answers) && rubric.accepted_answers.some(a => String(a).toLowerCase() === cleanResp));
            points = isCorrect ? (ver.points || 1) : 0;
          }

          const answerRow = {
            id: nextUuid('ans'),
            session_id: session.id,
            question_code: params.p_question_code,
            question_version_id: snapVersionId,
            round: params.p_round,
            response: params.p_response,
            is_correct: isCorrect,
            points_awarded: points,
            is_timeout: isTimeout
          };
          state.student_answers.push(answerRow);
          session.main_score += points;

          return {
            data: {
              sessionId: session.id,
              questionCode: params.p_question_code,
              isCorrect,
              pointsAwarded: points,
              totalScore: session.main_score
            },
            error: null
          };
        }

        if (fn === 'finish_game_session') {
          const session = state.game_sessions.find(s => s.id === params.p_session_id);
          if (!session) return { data: null, error: { code: 'P0002', message: 'Session not found.' } };
          session.status = 'completed';
          session.completed_at = new Date().toISOString();
          return { data: session, error: null };
        }

        return { data: null, error: { message: `Unknown RPC ${fn}` } };
      },

      from: (table) => {
        let filters = [];
        let orderField = null;
        let orderAsc = true;
        let limitVal = null;

        const chain = {
          select: () => chain,
          insert: (records) => {
            const rows = Array.isArray(records) ? records : [records];
            const inserted = rows.map(r => {
              const row = { id: r.id || nextUuid(table), ...r, created_at: r.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
              state[table].push(row);
              return row;
            });
            const insertResult = {
              data: Array.isArray(records) ? inserted : inserted[0],
              error: null,
              select: () => ({
                single: async () => ({ data: inserted[0], error: null }),
                maybeSingle: async () => ({ data: inserted[0], error: null })
              }),
              then: (resolve, reject) => Promise.resolve({ data: Array.isArray(records) ? inserted : inserted[0], error: null }).then(resolve, reject)
            };
            return insertResult;
          },
          update: (updates) => ({
            eq: (field, val) => ({
              select: () => ({
                maybeSingle: async () => {
                  const target = state[table].find(item => item[field] === val);
                  if (target) {
                    Object.assign(target, updates, { updated_at: new Date().toISOString() });
                    return { data: { ...target }, error: null };
                  }
                  return { data: null, error: null };
                }
              })
            })
          }),
          eq: (field, val) => {
            filters.push(item => item[field] === val);
            return chain;
          },
          is: (field, val) => {
            filters.push(item => item[field] === val);
            return chain;
          },
          in: (field, values) => {
            filters.push(item => values.includes(item[field]));
            return chain;
          },
          order: (field, opts = {}) => {
            orderField = field;
            orderAsc = opts.ascending !== false;
            return chain;
          },
          limit: (n) => {
            limitVal = n;
            return chain;
          },
          single: async () => {
            let items = state[table] || [];
            filters.forEach(f => { items = items.filter(f); });
            return { data: items[0] || null, error: items[0] ? null : { message: 'Not found' } };
          },
          maybeSingle: async () => {
            let items = state[table] || [];
            filters.forEach(f => { items = items.filter(f); });
            const item = items[0] || null;
            if (item && table === 'questions') {
              const topic = state.topics.find(t => t.id === item.topic_id);
              const category = state.card_categories.find(c => c.id === item.card_category_id);
              return { data: { ...item, topics: topic || null, card_categories: category || null }, error: null };
            }
            return { data: item, error: null };
          },
          then: (resolve, reject) => {
            let items = (state[table] || []).map(x => ({ ...x }));
            filters.forEach(f => { items = items.filter(f); });
            if (orderField) {
              items.sort((a, b) => {
                const av = a[orderField] ?? '';
                const bv = b[orderField] ?? '';
                return orderAsc ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
              });
            }
            if (limitVal) items = items.slice(0, limitVal);

            // Populate joined relations
            if (table === 'questions') {
              items = items.map(q => {
                const topic = state.topics.find(t => t.id === q.topic_id);
                const category = state.card_categories.find(c => c.id === q.card_category_id);
                return { ...q, topics: topic || null, card_categories: category || null };
              });
            }
            if (table === 'question_versions') {
              items = items.map(v => {
                const category = state.card_categories.find(c => c.id === v.card_category_id);
                return { ...v, card_categories: category || null };
              });
            }

            return Promise.resolve({ data: items, error: null }).then(resolve, reject);
          }
        };

        return chain;
      }
    };
  }

  return { state, createClient };
}

/**
 * Builds the complete Express test app with real services wired to in-memory state.
 */
function createE2eTestApp({ role = 'teacher', userId = 'user-staff-1', displayName = 'Guro Test' } = {}) {
  const db = createInMemoryDb();

  const mockAuthenticate = (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader === 'Bearer student-token') {
      req.auth = {
        user: { id: 'user-student-1', email: 'mag-aaral@panitikard.ph' },
        profile: { role: 'student', display_name: 'Mag-aaral Juan' },
        client: db.createClient({ id: 'user-student-1' }, 'student')
      };
      return next();
    }
    if (authHeader === 'Bearer teacher-token') {
      req.auth = {
        user: { id: userId, email: 'guro@panitikard.ph' },
        profile: { role, display_name: displayName },
        client: db.createClient({ id: userId }, role)
      };
      return next();
    }
    return next(Object.assign(new Error('Authentication required.'), { status: 401, code: 'AUTH_REQUIRED' }));
  };

  const catalogService = createCatalogService({
    publicClientFactory: () => db.createClient(null, 'public')
  });
  const contentService = createContentService();
  const gameService = createGameService();

  const app = createApp({
    catalogService,
    contentService,
    gameService,
    authenticate: mockAuthenticate,
    connectivityCheck: async () => ({ reachable: true, state: 'online' })
  });

  return { app, db };
}

// ---------------------------------------------------------------------------
// Comprehensive Phase 6.8 Integration Scenarios
// ---------------------------------------------------------------------------

test('E2E Lifecycle Scenario: Staff Auth -> Topic Management -> Question Draft -> Explicit Publishing -> Student Gameplay -> Revision (Option B) -> Unpublish', async () => {
  const { app, db } = createE2eTestApp({ role: 'teacher' });

  await withServer(app, async base => {
    const teacherHeaders = { 'Authorization': 'Bearer teacher-token', 'Content-Type': 'application/json' };
    const studentHeaders = { 'Authorization': 'Bearer student-token', 'Content-Type': 'application/json' };

    // -------------------------------------------------------------------------
    // Step 1: Authentication & Public Config Verification
    // -------------------------------------------------------------------------
    const meRes = await fetch(`${base}/api/v1/auth/me`, { headers: teacherHeaders });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.data.role, 'teacher');
    assert.equal(meBody.data.displayName, 'Guro Test');

    const configRes = await fetch(`${base}/api/v1/auth/config`);
    assert.equal(configRes.status, 200);
    const configBody = await configRes.json();
    assert.equal(configBody.success, true);
    assert.equal(JSON.stringify(configBody).includes('serviceRoleKey'), false, 'Never expose serviceRoleKey');

    // -------------------------------------------------------------------------
    // Step 2: Topic Creation in Draft Status
    // -------------------------------------------------------------------------
    const createTopicRes = await fetch(`${base}/api/v1/admin/topics`, {
      method: 'POST',
      headers: teacherHeaders,
      body: JSON.stringify({
        code: 'katutubong-panitikan',
        title: 'Katutubong Panitikan ng Pilipinas',
        description: 'Mga kwentong-bayan at epiko bago ang pananakop.',
        competency: 'Nasusuri ang mga elemento ng katutubong panitikan'
      })
    });
    assert.equal(createTopicRes.status, 201);
    const topicBody = await createTopicRes.json();
    assert.equal(topicBody.data.code, 'katutubong-panitikan');
    assert.equal(topicBody.data.status, 'draft');

    // Public /topics endpoint MUST NOT reveal the draft topic to students
    const publicTopics1 = await fetch(`${base}/api/v1/topics`).then(r => r.json());
    assert.ok(!publicTopics1.data.some(t => t.code === 'katutubong-panitikan'), 'Draft topic hidden from students');

    // -------------------------------------------------------------------------
    // Step 3: Publish the Topic
    // -------------------------------------------------------------------------
    const publishTopicRes = await fetch(`${base}/api/v1/admin/topics/katutubong-panitikan`, {
      method: 'PATCH',
      headers: teacherHeaders,
      body: JSON.stringify({ status: 'published' })
    });
    assert.equal(publishTopicRes.status, 200);

    const publicTopics2 = await fetch(`${base}/api/v1/topics`).then(r => r.json());
    assert.ok(publicTopics2.data.some(t => t.code === 'katutubong-panitikan'), 'Published topic visible to students');

    // -------------------------------------------------------------------------
    // Step 4: Create a Question (Draft-First Workflow)
    // -------------------------------------------------------------------------
    const createQRes = await fetch(`${base}/api/v1/admin/topics/katutubong-panitikan/questions`, {
      method: 'POST',
      headers: teacherHeaders,
      body: JSON.stringify({
        code: 'katutubo-q-001',
        questionType: 'multiple_choice',
        title: 'Kwentong Bayan',
        prompt: 'Ano ang tawag sa tradisyunal na salaysay na nagpasalin-salin sa bibig ng mga tao?',
        points: 2,
        choices: [
          { key: 'A', text: 'Kwentong-bayan' },
          { key: 'B', text: 'Maikling Kwento' },
          { key: 'C', text: 'Sanaysay' },
          { key: 'D', text: 'Tula' }
        ],
        answerKey: 'A',
        expectedAnswer: 'Kwentong-bayan'
      })
    });
    assert.equal(createQRes.status, 201);
    const qBody = await createQRes.json();
    assert.equal(qBody.data.status, 'draft');
    assert.equal(qBody.data.version, 1);

    // Public question catalog MUST NOT show the draft question to students
    const publicQ1 = await fetch(`${base}/api/v1/topics/katutubong-panitikan/questions`).then(r => r.json());
    assert.equal(publicQ1.data.questions.length, 0, 'Draft question hidden from public student catalog');

    // -------------------------------------------------------------------------
    // Step 5: Explicit Publishing of Question Version 1
    // -------------------------------------------------------------------------
    const publishQ1Res = await fetch(`${base}/api/v1/admin/questions/katutubo-q-001/publish`, {
      method: 'POST',
      headers: teacherHeaders,
      body: JSON.stringify({ versionNumber: 1 })
    });
    assert.equal(publishQ1Res.status, 200);
    const pubQ1Data = (await publishQ1Res.json()).data;
    assert.equal(pubQ1Data.status, 'published');
    assert.equal(pubQ1Data.currentVersion, 1);

    // Public question catalog now displays the published question (v1)
    const publicQ2 = await fetch(`${base}/api/v1/topics/katutubong-panitikan/questions`).then(r => r.json());
    assert.equal(publicQ2.data.questions.length, 1);
    assert.equal(publicQ2.data.questions[0].code, 'katutubo-q-001');

    // -------------------------------------------------------------------------
    // Step 6: Student Gameplay Session Creation (Snapshotting Version 1)
    // -------------------------------------------------------------------------
    const createSessionRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        topicCode: 'katutubong-panitikan',
        mode: 'deck',
        studentName: 'Juan Dela Cruz'
      })
    });
    assert.equal(createSessionRes.status, 201);
    const session1 = (await createSessionRes.json()).data;
    assert.ok(session1.id);
    assert.ok(session1.question_versions['katutubo-q-001'], 'Session snapshotted question version 1');

    // -------------------------------------------------------------------------
    // Step 7: Teacher Revises Question (Option B Draft Workflow)
    // -------------------------------------------------------------------------
    const reviseRes = await fetch(`${base}/api/v1/admin/questions/katutubo-q-001`, {
      method: 'PUT',
      headers: teacherHeaders,
      body: JSON.stringify({
        questionType: 'multiple_choice',
        title: 'Kwentong Bayan (Nirebisa)',
        prompt: 'Ano ang pangkalahatang tawag sa tradisyunal na kwento mula sa ating mga ninuno?',
        points: 3,
        choices: [
          { key: 'A', text: 'Kwentong-bayan' },
          { key: 'B', text: 'Modernong Nobela' }
        ],
        answerKey: 'A',
        expectedAnswer: 'Kwentong-bayan'
      })
    });
    assert.equal(reviseRes.status, 201);
    const reviseData = (await reviseRes.json()).data;
    assert.equal(reviseData.version, 2, 'New version 2 created');
    assert.equal(reviseData.status, 'draft', 'Version 2 is created in draft status');
    assert.equal(reviseData.currentVersion, 1, 'Active current_version remains 1');
    assert.equal(reviseData.isDraftRevision, true);

    // -------------------------------------------------------------------------
    // Step 8: Verify Draft Isolation
    // -------------------------------------------------------------------------
    // 8a: Public student API still receives Version 1 prompt (not Version 2)
    const publicQ3 = await fetch(`${base}/api/v1/topics/katutubong-panitikan/questions`).then(r => r.json());
    assert.equal(publicQ3.data.questions[0].prompt, 'Ano ang tawag sa tradisyunal na salaysay na nagpasalin-salin sa bibig ng mga tao?');

    // 8b: Staff question detail reports hasDraftRevision: true
    const staffDetailRes = await fetch(`${base}/api/v1/admin/questions/katutubo-q-001`, { headers: teacherHeaders });
    assert.equal(staffDetailRes.status, 200);
    const staffDetail = (await staffDetailRes.json()).data;
    assert.equal(staffDetail.hasDraftRevision, true);
    assert.equal(staffDetail.draftVersionNumber, 2);
    assert.equal(staffDetail.currentVersion, 1);

    // 8c: Staff preview can preview the draft (version 2)
    const draftPreviewRes = await fetch(`${base}/api/v1/admin/questions/katutubo-q-001?previewDraft=true`, { headers: teacherHeaders });
    assert.equal(draftPreviewRes.status, 200);
    const draftDetail = (await draftPreviewRes.json()).data;
    assert.equal(draftDetail.isDraftPreview, true);
    assert.equal(draftDetail.version.versionNumber, 2);
    assert.equal(draftDetail.version.prompt, 'Ano ang pangkalahatang tawag sa tradisyunal na kwento mula sa ating mga ninuno?');

    // -------------------------------------------------------------------------
    // Step 9: Existing Game Session Evaluates against Snapshotted Version 1
    // -------------------------------------------------------------------------
    const answerRes = await fetch(`${base}/api/v1/sessions/${session1.id}/answers`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({
        questionCode: 'katutubo-q-001',
        round: 'main',
        response: 'Kwentong-bayan'
      })
    });
    assert.equal(answerRes.status, 201);
    const answerBody = await answerRes.json();
    assert.equal(answerBody.data.isCorrect, true);
    assert.equal(answerBody.data.pointsAwarded, 2, 'Evaluated against Version 1 points (2 pts, not v2 3 pts)');

    // Duplicate answer rejected
    const dupRes = await fetch(`${base}/api/v1/sessions/${session1.id}/answers`, {
      method: 'POST',
      headers: studentHeaders,
      body: JSON.stringify({ questionCode: 'katutubo-q-001', round: 'main', response: 'Kwentong-bayan' })
    });
    assert.equal(dupRes.status, 409, 'Duplicate submission fails safely');

    // -------------------------------------------------------------------------
    // Step 10: Explicit Publishing of Version 2
    // -------------------------------------------------------------------------
    const publishV2Res = await fetch(`${base}/api/v1/admin/questions/katutubo-q-001/publish`, {
      method: 'POST',
      headers: teacherHeaders,
      body: JSON.stringify({ versionNumber: 2 })
    });
    assert.equal(publishV2Res.status, 200);

    // Now public catalog reflects Version 2
    const publicQ4 = await fetch(`${base}/api/v1/topics/katutubong-panitikan/questions`).then(r => r.json());
    assert.equal(publicQ4.data.questions[0].prompt, 'Ano ang pangkalahatang tawag sa tradisyunal na kwento mula sa ating mga ninuno?');

    // -------------------------------------------------------------------------
    // Step 11: Question Unpublishing & Session Graceful Finish
    // -------------------------------------------------------------------------
    const unpublishRes = await fetch(`${base}/api/v1/admin/questions/katutubo-q-001/unpublish`, {
      method: 'POST',
      headers: teacherHeaders
    });
    assert.equal(unpublishRes.status, 200);
    const unpubData = (await unpublishRes.json()).data;
    assert.equal(unpubData.status, 'draft');

    // Public catalog no longer shows the unpublished question
    const publicQ5 = await fetch(`${base}/api/v1/topics/katutubong-panitikan/questions`).then(r => r.json());
    assert.equal(publicQ5.data.questions.length, 0);

    // Existing student session can still finish cleanly
    const finishRes = await fetch(`${base}/api/v1/sessions/${session1.id}/finish`, {
      method: 'POST',
      headers: studentHeaders
    });
    assert.equal(finishRes.status, 200);

    // -------------------------------------------------------------------------
    // Step 12: Rubric Management & RBAC Security Verification
    // -------------------------------------------------------------------------
    // Staff can list rubrics
    const rubricsRes = await fetch(`${base}/api/v1/admin/rubrics`, { headers: teacherHeaders });
    assert.equal(rubricsRes.status, 200);
    const rubricsBody = await rubricsRes.json();
    assert.ok(Array.isArray(rubricsBody.data));

    // Student MUST be rejected from all staff routes
    const studentBlocked1 = await fetch(`${base}/api/v1/admin/topics`, { method: 'POST', headers: studentHeaders, body: '{}' });
    assert.equal(studentBlocked1.status, 403);

    const studentBlocked2 = await fetch(`${base}/api/v1/admin/rubrics`, { headers: studentHeaders });
    assert.equal(studentBlocked2.status, 403);

    const studentBlocked3 = await fetch(`${base}/api/v1/admin/questions/katutubo-q-001/publish`, { method: 'POST', headers: studentHeaders });
    assert.equal(studentBlocked3.status, 403);

    // Unauthenticated MUST be rejected
    const unauthBlocked = await fetch(`${base}/api/v1/admin/rubrics`);
    assert.equal(unauthBlocked.status, 401);
  });
});
