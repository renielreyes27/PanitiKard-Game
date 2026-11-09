const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { createApp } = require('../src/server');
const { createRubricEvaluatorService } = require('../src/services/rubricEvaluator');
const { generateGuestToken, verifyGuestToken, isGuestToken, getSecret, DEV_DEFAULT_SECRET } = require('../src/services/guestTokenService');
const config = require('../src/config/environment');

async function withServer(app, run) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function createMockGuestDb() {
  const sessions = new Map();
  const answers = [];
  const evaluations = [];

  const questionsMap = {
    'elem-statement': {
      id: '00000000-0000-0000-0000-000000000001',
      code: 'elem-statement',
      current_version: 1,
      status: 'published',
      archived_at: null,
      topic_id: '00000000-0000-0000-0000-000000000099',
      topics: { title: 'Mga Elemento ng Tula', code: 'elements' }
    },
    'elem-challenge': {
      id: '00000000-0000-0000-0000-000000000003',
      code: 'elem-challenge',
      current_version: 1,
      status: 'published',
      archived_at: null,
      topic_id: '00000000-0000-0000-0000-000000000099',
      topics: { title: 'Mga Elemento ng Tula', code: 'elements' }
    },
    'elem-bonus': {
      id: '00000000-0000-0000-0000-000000000005',
      code: 'elem-bonus',
      current_version: 1,
      status: 'published',
      archived_at: null,
      topic_id: '00000000-0000-0000-0000-000000000099',
      topics: { title: 'Mga Elemento ng Tula', code: 'elements' }
    },
    'elem-question': {
      id: '00000000-0000-0000-0000-000000000007',
      code: 'elem-question',
      current_version: 1,
      status: 'published',
      archived_at: null,
      topic_id: '00000000-0000-0000-0000-000000000099',
      topics: { title: 'Mga Elemento ng Tula', code: 'elements' }
    }
  };

  const versionsMap = {
    '00000000-0000-0000-0000-000000000001': {
      id: '00000000-0000-0000-0000-000000000002',
      question_id: '00000000-0000-0000-0000-000000000001',
      prompt: 'Ano ang sukat sa tula?',
      points: 1,
      time_limit_seconds: null,
      version_number: 1,
      category_label: 'Pahayag'
    },
    '00000000-0000-0000-0000-000000000003': {
      id: '00000000-0000-0000-0000-000000000004',
      question_id: '00000000-0000-0000-0000-000000000003',
      prompt: 'Hamon: Ipaliwanag ang tugma sa loob ng 30 segundo.',
      points: 1,
      time_limit_seconds: 30,
      version_number: 1,
      category_label: 'Hamon'
    },
    '00000000-0000-0000-0000-000000000005': {
      id: '00000000-0000-0000-0000-000000000006',
      question_id: '00000000-0000-0000-0000-000000000005',
      prompt: 'Bonus kard tungkol sa taludtod.',
      points: 0,
      time_limit_seconds: null,
      version_number: 1,
      category_label: 'Bonus'
    },
    '00000000-0000-0000-0000-000000000007': {
      id: '00000000-0000-0000-0000-000000000008',
      question_id: '00000000-0000-0000-0000-000000000007',
      prompt: 'Ano ang talinghaga?',
      points: 1,
      time_limit_seconds: null,
      version_number: 1,
      category_label: 'Tanong'
    }
  };

  const db = {
    sessions,
    answers,
    evaluations,
    from(table) {
      if (table === 'questions') {
        return {
          select() {
            return {
              eq(col, val) {
                if (col === 'code') {
                  const q = questionsMap[val];
                  return {
                    maybeSingle: async () => ({
                      data: q || null,
                      error: null
                    })
                  };
                }
                if (col === 'id') {
                  return {
                    eq(col2, val2) {
                      const q = Object.values(questionsMap).find(item => item.id === val && item.code === val2);
                      return {
                        maybeSingle: async () => ({
                          data: q ? { id: q.id, code: q.code } : null,
                          error: null
                        })
                      };
                    }
                  };
                }
                return { maybeSingle: async () => ({ data: null, error: null }) };
              }
            };
          }
        };
      }

      if (table === 'question_versions') {
        return {
          select() {
            return {
              eq(_col, val) {
                const ver = versionsMap[val] || Object.values(versionsMap).find(v => v.id === val);
                return {
                  eq(_col2, _val2) {
                    return {
                      maybeSingle: async () => ({
                        data: ver || null,
                        error: null
                      })
                    };
                  },
                  maybeSingle: async () => ({
                    data: ver || null,
                    error: null
                  })
                };
              }
            };
          }
        };
      }

      if (table === 'question_evaluation_rubrics') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: {
                      expected_answer: 'Ang sukat ay bilang ng pantig sa bawat taludtod.',
                      rubric_groups: [['sukat'], ['bilang', 'pantig'], ['taludtod']]
                    },
                    error: null
                  })
                };
              }
            };
          }
        };
      }

      if (table === 'game_sessions') {
        return {
          select() {
            return {
              eq(col, val) {
                return {
                  maybeSingle: async () => {
                    const s = sessions.get(val);
                    return { data: s || null, error: null };
                  }
                };
              }
            };
          }
        };
      }

      if (table === 'student_answers') {
        return {
          select() {
            return {
              eq(col, val) {
                return {
                  order() {
                    return {
                      data: answers.filter(a => a.session_id === val),
                      error: null
                    };
                  }
                };
              }
            };
          }
        };
      }

      if (table === 'ai_evaluations') {
        return {
          select() {
            const filters = {};
            const queryBuilder = {
              eq(col, val) {
                filters[col] = val;
                return queryBuilder;
              },
              order() {
                return queryBuilder;
              },
              limit() {
                return queryBuilder;
              },
              maybeSingle: async () => {
                const match = evaluations.find(e =>
                  (!filters.session_id || e.session_id === filters.session_id) &&
                  (!filters.question_id || e.question_id === filters.question_id) &&
                  (!filters.student_answer || e.student_answer === filters.student_answer)
                );
                return { data: match || null, error: null };
              }
            };
            return queryBuilder;
          },
          insert(payload) {
            const row = {
              id: `00000000-0000-0000-0000-${String(evaluations.length + 1).padStart(12, '0')}`,
              created_at: new Date().toISOString(),
              ...payload
            };
            evaluations.push(row);
            return {
              select() {
                return {
                  single: async () => ({ data: { id: row.id, created_at: row.created_at }, error: null })
                };
              }
            };
          }
        };
      }

      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
      };
    },
    rpc(fnName, args) {
      if (fnName === 'create_guest_game_session') {
        if (!args.p_student_name || args.p_student_name.trim().length < 2) {
          const err = new Error('A valid student name is required');
          err.code = '22023';
          return Promise.resolve({ data: null, error: err });
        }
        if (args.p_topic_code !== 'elements') {
          const err = new Error('Topic not found');
          err.code = 'P0002';
          return Promise.resolve({ data: null, error: err });
        }
        const session = {
          id: `00000000-0000-0000-0000-${String(sessions.size + 100).padStart(12, '0')}`,
          student_id: null,
          topic_id: '00000000-0000-0000-0000-000000000099',
          mode: args.p_mode,
          status: 'active',
          student_name_snapshot: args.p_student_name.trim(),
          main_score: 0,
          reverse_score: 0,
          started_at: new Date().toISOString(),
          completed_at: null,
          metadata: { question_timers: {} }
        };
        sessions.set(session.id, session);
        return Promise.resolve({ data: session, error: null });
      }

      if (fnName === 'start_guest_question_timer') {
        const s = sessions.get(args.p_session_id);
        if (!s || s.status !== 'active') {
          const err = new Error('Active guest session not found');
          err.code = 'P0002';
          return Promise.resolve({ data: null, error: err });
        }
        const q = questionsMap[args.p_question_code];
        if (!q) {
          const err = new Error('Published question not found');
          err.code = 'P0002';
          return Promise.resolve({ data: null, error: err });
        }
        const ver = versionsMap[q.id];
        if (!ver || ver.time_limit_seconds === null || ver.time_limit_seconds <= 0) {
          const err = new Error('Question does not have a time limit');
          err.code = '22023';
          return Promise.resolve({ data: null, error: err });
        }
        const round = args.p_round || 'main';
        const timerKey = `${round}:${args.p_question_code}`;
        s.metadata = s.metadata || { question_timers: {} };
        s.metadata.question_timers = s.metadata.question_timers || {};
        if (!s.metadata.question_timers[timerKey]) {
          s.metadata.question_timers[timerKey] = new Date().toISOString();
        }
        return Promise.resolve({
          data: {
            sessionId: s.id,
            questionCode: args.p_question_code,
            round,
            startedAt: s.metadata.question_timers[timerKey],
            timeLimitSeconds: ver.time_limit_seconds
          },
          error: null
        });
      }

      if (fnName === 'submit_guest_game_answer') {
        const s = sessions.get(args.p_session_id);
        if (!s || s.status !== 'active') {
          const err = new Error('Active guest session not found');
          err.code = 'P0002';
          return Promise.resolve({ data: null, error: err });
        }

        const q = questionsMap[args.p_question_code];
        if (!q) {
          const err = new Error('Published question not found');
          err.code = 'P0002';
          return Promise.resolve({ data: null, error: err });
        }
        const ver = versionsMap[q.id];

        // 1. Atomic duplicate answer check
        const existing = answers.find(a => a.session_id === args.p_session_id && a.question_code === args.p_question_code && a.round === args.p_round);
        if (existing) {
          const err = new Error('An answer for this question and round has already been recorded');
          err.code = '23505';
          return Promise.resolve({ data: null, error: err });
        }

        // 2. Server-authoritative timer validation for timed questions (mirrors SQL RPC logic)
        // Rules apply to ALL submissions (normal and timeout) for timed questions.
        const isTimeout = args.p_is_timeout === true;
        if (ver && ver.time_limit_seconds !== null && ver.time_limit_seconds > 0) {
          // Timed question
          const round = args.p_round || 'main';
          const timerKey = `${round}:${args.p_question_code}`;
          const timerStartStr = s.metadata?.question_timers?.[timerKey];

          if (!timerStartStr) {
            const err = new Error('Question timer has not been started');
            err.code = '22023';
            return Promise.resolve({ data: null, error: err });
          }

          const timerStart = new Date(timerStartStr).getTime();
          const elapsedSeconds = (Date.now() - timerStart) / 1000;

          if (isTimeout) {
            if (elapsedSeconds < ver.time_limit_seconds) {
              const err = new Error('Premature timeout submission: time limit has not elapsed');
              err.code = '22023';
              return Promise.resolve({ data: null, error: err });
            }
          } else {
            // Normal answer: rejected if time limit has already elapsed
            if (elapsedSeconds >= ver.time_limit_seconds) {
              const err = new Error('Time limit has elapsed; submit as a timeout instead');
              err.code = '22023';
              return Promise.resolve({ data: null, error: err });
            }
          }
        } else {
          // Untimed question: reject timeout submission
          if (isTimeout) {
            const err = new Error('Timeout is only permitted on timed questions');
            err.code = '22023';
            return Promise.resolve({ data: null, error: err });
          }
        }

        // 3. Reverse Round validation
        if (args.p_round === 'reverse') {
          const reverseAttempts = answers.filter(a => a.session_id === args.p_session_id && a.round === 'reverse').length;
          if (reverseAttempts >= 3) {
            const err = new Error('Reverse Round attempt limit reached');
            err.code = '23514';
            return Promise.resolve({ data: null, error: err });
          }
          const missedInMain = answers.some(a => a.session_id === args.p_session_id && a.question_code === args.p_question_code && a.round === 'main' && a.is_correct === false);
          if (!missedInMain) {
            const err = new Error('Reverse Round accepts only questions missed in the main round');
            err.code = '23514';
            return Promise.resolve({ data: null, error: err });
          }
        }

        let isCorrect = false;
        let points = 0;
        let evalMethod = 'local_rubric';

        if (isTimeout) {
          isCorrect = false;
          points = 0;
          evalMethod = 'timeout';
        } else {
          isCorrect = typeof args.p_response === 'string' &&
            (args.p_response.includes('sukat') || args.p_response.includes('pantig') || args.p_response.toLowerCase().includes('tugma') || args.p_response.toLowerCase().includes('talinghaga') || args.p_response.toLowerCase().includes('taludtod'));
          const maxPoints = (args.p_round === 'reverse' && ver.points === 0) ? 1 : (ver.points || 1);
          points = isCorrect ? maxPoints : 0;
        }

        if (args.p_round === 'reverse') {
          s.reverse_score += points;
        } else {
          s.main_score += points;
        }

        const answer = {
          id: `answer-${answers.length + 1}`,
          session_id: args.p_session_id,
          question_code: args.p_question_code,
          round: args.p_round,
          response: args.p_response,
          is_correct: isCorrect,
          points_awarded: points,
          max_points: (args.p_round === 'reverse' && ver.points === 0) ? 1 : (ver.points || 1),
          evaluation_method: evalMethod,
          answered_at: new Date().toISOString()
        };
        answers.push(answer);

        return Promise.resolve({
          data: {
            answer: {
              id: answer.id,
              questionId: q.id,
              round: answer.round,
              isCorrect: answer.is_correct,
              pointsAwarded: answer.points_awarded,
              maxPoints: answer.max_points,
              evaluationMethod: answer.evaluation_method,
              answeredAt: answer.answered_at
            },
            isCorrect,
            pointsAwarded: points,
            maxPoints: answer.max_points,
            evaluationMethod: evalMethod
          },
          error: null
        });
      }

      if (fnName === 'finish_guest_game_session') {
        const s = sessions.get(args.p_session_id);
        if (!s || s.status !== 'active') {
          const err = new Error('Active guest session not found');
          err.code = 'P0002';
          return Promise.resolve({ data: null, error: err });
        }
        s.status = 'completed';
        s.completed_at = new Date().toISOString();
        return Promise.resolve({ data: s, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    }
  };

  return db;
}

function testGuestApp() {
  const mockDb = createMockGuestDb();

  const app = createApp({
    evaluatorService: createRubricEvaluatorService(),
    connectivityCheck: async () => ({ reachable: true }),
    adminClientFactory: () => mockDb
  });

  return { app, mockDb };
}

// --------------------------------------------------------------------------
// 1. Guest Session Creation Tests
// --------------------------------------------------------------------------
test('Guest flow: POST /sessions creates an active guest session and returns sessionToken', async () => {
  const { app, mockDb } = testGuestApp();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicCode: 'elements',
        mode: 'deck',
        studentName: 'Maria Clara de los Santos'
      })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.id, 'Session must have an id');
    assert.equal(body.data.student_name_snapshot, 'Maria Clara de los Santos');
    assert.equal(body.data.mode, 'deck');
    assert.equal(body.data.status, 'active');
    assert.ok(body.data.sessionToken, 'Response must include cryptographic sessionToken');

    // Token must be verifiable
    const verified = verifyGuestToken(body.data.sessionToken);
    assert.equal(verified.sessionId, body.data.id);
    assert.equal(verified.studentName, 'Maria Clara de los Santos');
    assert.equal(verified.role, 'guest');
  });
});

test('Guest flow: rejects session creation with invalid or empty studentName', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    // 1. Empty string name -> 400
    const resEmpty = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: '' })
    });
    assert.equal(resEmpty.status, 400);
    const bodyEmpty = await resEmpty.json();
    assert.equal(bodyEmpty.error, 'INVALID_STUDENT_NAME');

    // 2. Single char name -> 400
    const resShort = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'A' })
    });
    assert.equal(resShort.status, 400);

    // 3. Name > 120 chars -> 400
    const resLong = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'X'.repeat(121) })
    });
    assert.equal(resLong.status, 400);
  });
});

// --------------------------------------------------------------------------
// 2. Cryptographic Guest Token Security Tests
// --------------------------------------------------------------------------
test('Guest security: token tampering is strictly rejected with 401', () => {
  const token = generateGuestToken({ sessionId: 'session-uuid-1', studentName: 'Juan' });
  const [payloadB64, sigB64] = token.split('.');

  // Tamper signature — must throw HttpError with code INVALID_GUEST_TOKEN
  let tamperSigErr;
  try { verifyGuestToken(`${payloadB64}.tamperedsignature`); } catch (e) { tamperSigErr = e; }
  assert.ok(tamperSigErr, 'Expected error for tampered signature');
  assert.equal(tamperSigErr.code, 'INVALID_GUEST_TOKEN', `Expected INVALID_GUEST_TOKEN, got ${tamperSigErr.code}`);
  assert.equal(tamperSigErr.status, 401);

  // Tamper payload — must also throw INVALID_GUEST_TOKEN
  const tamperedPayload = Buffer.from(JSON.stringify({ sessionId: 'other-session', studentName: 'Hacker', role: 'guest', exp: Date.now() + 100000 })).toString('base64url');
  let tamperPayloadErr;
  try { verifyGuestToken(`${tamperedPayload}.${sigB64}`); } catch (e) { tamperPayloadErr = e; }
  assert.ok(tamperPayloadErr, 'Expected error for tampered payload');
  assert.equal(tamperPayloadErr.code, 'INVALID_GUEST_TOKEN', `Expected INVALID_GUEST_TOKEN, got ${tamperPayloadErr.code}`);
});

test('Guest security: expired guest token is rejected with 401', () => {
  // Token expired 1 second ago
  const expiredToken = generateGuestToken({
    sessionId: 'session-uuid-1',
    studentName: 'Juan',
    expiresInMs: -1000
  });
  let expiredErr;
  try { verifyGuestToken(expiredToken); } catch (e) { expiredErr = e; }
  assert.ok(expiredErr, 'Expected error for expired token');
  assert.equal(expiredErr.code, 'EXPIRED_GUEST_TOKEN', `Expected EXPIRED_GUEST_TOKEN, got ${expiredErr.code}`);
  assert.equal(expiredErr.status, 401);
});

test('Guest security: guest tokens cannot access staff routes (STAFF_REQUIRED 403)', async () => {
  const { app } = testGuestApp();
  const guestToken = generateGuestToken({ sessionId: 'session-uuid-1', studentName: 'Juan' });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/admin/topics`, {
      headers: { Authorization: `Bearer ${guestToken}` }
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'STAFF_REQUIRED');
  });
});

// --------------------------------------------------------------------------
// 3. Guest Gemini Semantic Evaluation Tests
// --------------------------------------------------------------------------
test('Guest evaluation: POST /evaluations/gemini evaluates and persists with student_id = null', async () => {
  const { app, mockDb } = testGuestApp();
  await withServer(app, async (base) => {
    // 1. Create guest session
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Florante' })
    });
    const { data: session } = await createRes.json();

    // 2. Submit written paraphrase to evaluation with guest token
    const evalRes = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        studentAnswer: 'Ang sukat ay tumutukoy sa bilang ng pantig sa bawat taludtod o linya.',
        sessionId: session.id
      })
    });

    assert.equal(evalRes.status, 200);
    const evalBody = await evalRes.json();
    assert.equal(evalBody.success, true);
    assert.equal(evalBody.data.isCorrect, true);
    assert.equal(evalBody.data.persisted, true);
    assert.ok(evalBody.data.evaluationId);
    assert.equal(evalBody.data.pointsEarned, 1);

    // Verify persisted in database with student_id = null and correct session_id
    const recorded = mockDb.evaluations.find(e => e.id === evalBody.data.evaluationId);
    assert.ok(recorded, 'Evaluation must exist in database');
    assert.equal(recorded.student_id, null, 'Guest student_id must be null');
    assert.equal(recorded.session_id, session.id);
  });
});

test('Guest evaluation: rejects cross-session token tampering with 403', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    // Session A
    const resA = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Student A' })
    });
    const sessionA = (await resA.json()).data;

    // Session B
    const resB = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Student B' })
    });
    const sessionB = (await resB.json()).data;

    // Use token from Session A to evaluate on Session B -> 403
    const attackRes = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionA.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        studentAnswer: 'Ang sukat ay bilang ng pantig.',
        sessionId: sessionB.id
      })
    });
    assert.equal(attackRes.status, 403);
    const attackBody = await attackRes.json();
    assert.equal(attackBody.error, 'FORBIDDEN_SESSION');
  });
});

// --------------------------------------------------------------------------
// 4. Guest Official Scoring & Session Completion Tests
// --------------------------------------------------------------------------
test('Guest scoring: POST /sessions/:id/answers records answer and increments score', async () => {
  const { app, mockDb } = testGuestApp();
  await withServer(app, async (base) => {
    // 1. Create session
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Laura' })
    });
    const session = (await createRes.json()).data;

    // 2. Submit answer via official RPC
    const ansRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Bilang ng pantig sa taludtod.',
        round: 'main'
      })
    });

    assert.equal(ansRes.status, 201);
    const ansBody = await ansRes.json();
    assert.equal(ansBody.success, true);
    assert.equal(ansBody.data.isCorrect, true);
    assert.equal(ansBody.data.pointsAwarded, 1);

    // Verify session score updated in database
    const dbSession = mockDb.sessions.get(session.id);
    assert.equal(dbSession.main_score, 1);

    // 3. Duplicate submission -> 409
    const dupRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Bilang ng pantig.',
        round: 'main'
      })
    });
    assert.equal(dupRes.status, 409);

    // 4. Finish session
    const finishRes = await fetch(`${base}/api/v1/sessions/${session.id}/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      }
    });
    assert.equal(finishRes.status, 200);
    const finishBody = await finishRes.json();
    assert.equal(finishBody.data.status, 'completed');
    assert.ok(finishBody.data.completed_at);
  });
});


// --------------------------------------------------------------------------
// 5. Cross-Session Answer Tampering
// --------------------------------------------------------------------------
test('Guest security: cannot submit answers to another session with own token', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    // Session A
    const resA = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Session A Student' })
    });
    const sessionA = (await resA.json()).data;

    // Session B
    const resB = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Session B Student' })
    });
    const sessionB = (await resB.json()).data;

    // Use token from A to submit answers to B -> 403
    const attackRes = await fetch(`${base}/api/v1/sessions/${sessionB.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionA.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Ang sukat ay bilang ng pantig.',
        round: 'main'
      })
    });
    assert.equal(attackRes.status, 403);
    assert.equal((await attackRes.json()).error, 'FORBIDDEN_SESSION');
  });
});

// --------------------------------------------------------------------------
// 6. Guest Token Utility Tests
// --------------------------------------------------------------------------
test('Guest token: isGuestToken correctly identifies guest vs regular tokens', () => {
  const guestToken = generateGuestToken({ sessionId: 'sess-123', studentName: 'Test' });
  assert.equal(isGuestToken(guestToken), true, 'Valid guest token must be detected as guest');
  assert.equal(isGuestToken('regular-supabase-jwt.payload.signature'), false, 'Non-guest token with 3 parts must not be detected as guest');
  assert.equal(isGuestToken(''), false, 'Empty string must not be detected as guest');
  assert.equal(isGuestToken(null), false, 'Null must not be detected as guest');
  assert.equal(isGuestToken('no-dot'), false, 'Token without dot must not be detected as guest');
});

test('Guest token: verifyGuestToken returns correct payload fields', () => {
  const sessionId = '12345678-1234-1234-1234-123456789012';
  const studentName = 'María Clara de los Santos';
  const token = generateGuestToken({ sessionId, studentName, expiresInMs: 60000 });
  const payload = verifyGuestToken(token);

  assert.equal(payload.sessionId, sessionId);
  assert.equal(payload.studentName, studentName);
  assert.equal(payload.role, 'guest');
  assert.ok(typeof payload.iat === 'number', 'iat must be a number');
  assert.ok(typeof payload.exp === 'number', 'exp must be a number');
  assert.ok(payload.exp > payload.iat, 'exp must be after iat');
});

test('Guest token: tokens signed with different secrets are mutually invalid', () => {
  const token = generateGuestToken({ sessionId: 'sess-1', studentName: 'Juan' }, 'secret-A');
  let err;
  try { verifyGuestToken(token, 'secret-B'); } catch (e) { err = e; }
  assert.ok(err, 'Cross-secret verification must throw');
  assert.equal(err.code, 'INVALID_GUEST_TOKEN');
});

// --------------------------------------------------------------------------
// 7. Guest Session with Unauthenticated No-Name Request (401 Path)
// --------------------------------------------------------------------------
test('Guest flow: POST /sessions without studentName and without auth returns 401', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    // No auth, no studentName
    const res = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck' })
    });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, 'AUTH_REQUIRED');
  });
});

// --------------------------------------------------------------------------
// 8. guestTokenService Unit Tests
// --------------------------------------------------------------------------
test('guestTokenService: rejects token with no dot separator', () => {
  let err;
  try { verifyGuestToken('nodottoken'); } catch (e) { err = e; }
  assert.ok(err);
  assert.equal(err.code, 'INVALID_GUEST_TOKEN');
});

test('guestTokenService: rejects token with 3 segments (not a guest token)', () => {
  let err;
  try { verifyGuestToken('part1.part2.part3'); } catch (e) { err = e; }
  assert.ok(err);
  assert.equal(err.code, 'INVALID_GUEST_TOKEN');
});

test('guestTokenService: rejects non-guest role in token payload', () => {
  // Build a valid-looking 2-segment token but with role !== 'guest'
  const payload = Buffer.from(JSON.stringify({
    sessionId: 'sess-1',
    studentName: 'Juan',
    role: 'admin',  // Not guest
    iat: Date.now(),
    exp: Date.now() + 100000
  })).toString('base64url');
  const secret = 'panitikard-guest-secret-dev-key';
  const crypto = require('crypto');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  let err;
  try { verifyGuestToken(`${payload}.${sig}`); } catch (e) { err = e; }
  assert.ok(err);
  assert.equal(err.code, 'INVALID_GUEST_TOKEN');
});

// --------------------------------------------------------------------------
// 9. Evaluator failure fails closed for guest (formative, no false credit)
// --------------------------------------------------------------------------
test('Guest evaluation: Evaluator failure fails closed, no silent fallback for guest session', async () => {
  const { createApp } = require('../src/server');
  const { HttpError } = require('../src/middleware/httpError');
  const mockDb = createMockGuestDb();

  // Evaluator service that always throws 503
  const failingEvaluator = {
    isConfigured: () => false,
    getStatus: () => ({ configured: false, operational: false }),
    evaluateAnswer: async () => {
      throw new HttpError(503, 'EVALUATOR_UNAVAILABLE', 'Rubric evaluator is temporarily unavailable.');
    }
  };

  const app = createApp({
    evaluatorService: failingEvaluator,
    connectivityCheck: async () => ({ reachable: true }),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    // Create session
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Jose' })
    });
    const session = (await createRes.json()).data;

    // Evaluate with failing evaluator -> 503
    const evalRes = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        studentAnswer: 'Ang sukat ay bilang ng pantig.',
        sessionId: session.id
      })
    });
    assert.equal(evalRes.status, 503);
    const evalBody = await evalRes.json();
    // Must never award points when evaluator fails
    assert.ok(!evalBody.data, 'Must not return evaluation data when evaluator fails');
  });
});

// --------------------------------------------------------------------------
// 10. Dashboard Compatibility — student_name_snapshot exposure
// --------------------------------------------------------------------------
test('Dashboard compatibility: guest sessions expose student_name_snapshot for teacher dashboard', async () => {
  const { app, mockDb } = testGuestApp();
  await withServer(app, async (base) => {
    // Create session
    const res = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topicCode: 'elements',
        mode: 'deck',
        studentName: 'Gabriela Silang'
      })
    });
    const session = (await res.json()).data;

    // The session stored in db must have student_name_snapshot
    const dbSession = mockDb.sessions.get(session.id);
    assert.equal(dbSession.student_name_snapshot, 'Gabriela Silang');
    assert.equal(dbSession.student_id, null, 'Guest student_id must be null in DB');

    // Response must expose student_name_snapshot
    assert.equal(session.student_name_snapshot, 'Gabriela Silang');
  });
});

// --------------------------------------------------------------------------
// 11. Atomic Duplicate Answer Prevention Tests
// --------------------------------------------------------------------------
test('Guest security: duplicate answer submission in same session, question, and round returns 409 ANSWER_ALREADY_RECORDED', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Emilio Jacinto' })
    });
    const session = (await createRes.json()).data;

    // First submission succeeds
    const firstRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Bilang ng pantig.',
        round: 'main'
      })
    });
    assert.equal(firstRes.status, 201);

    // Duplicate submission in the same round fails with 409 ANSWER_ALREADY_RECORDED
    const dupRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Bilang ng pantig sa taludtod.',
        round: 'main'
      })
    });
    assert.equal(dupRes.status, 409);
    const dupBody = await dupRes.json();
    assert.equal(dupBody.error, 'ANSWER_ALREADY_RECORDED');
  });
});

// --------------------------------------------------------------------------
// 12. Server-Authoritative Timeout Validation Tests
// --------------------------------------------------------------------------
test('Guest timeout: untimed question cannot be activated with timer or submitted as a timeout (400 INVALID_RESPONSE)', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Apolinario Mabini' })
    });
    const session = (await createRes.json()).data;

    // 1. Activating timer for untimed question must fail
    const timerRes = await fetch(`${base}/api/v1/sessions/${session.id}/timers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        round: 'main'
      })
    });
    assert.equal(timerRes.status, 400);
    const timerBody = await timerRes.json();
    assert.equal(timerBody.error, 'INVALID_RESPONSE');

    // 2. Submitting elem-statement (untimed) with isTimeout: true must be rejected
    const ansRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: '',
        round: 'main',
        isTimeout: true
      })
    });
    assert.equal(ansRes.status, 400);
    const ansBody = await ansRes.json();
    assert.equal(ansBody.error, 'INVALID_RESPONSE');
  });
});

test('Guest timeout: timed question rejects timeout if timer was never started (400 INVALID_RESPONSE)', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Emilio Jacinto' })
    });
    const session = (await createRes.json()).data;

    // Submitting timed question as timeout without starting timer first must fail
    const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: '',
        round: 'main',
        isTimeout: true
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_RESPONSE');
  });
});

test('Guest timeout: timed question rejects NORMAL answer if timer was never started (400 INVALID_RESPONSE)', async () => {
  // Verifies that the server-authoritative timer requirement applies to ALL submissions,
  // not just timeout submissions. A normal (non-timeout) answer to a timed question must
  // also be rejected if no timer has been started for that session/question/round.
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Juan Luna' })
    });
    const session = (await createRes.json()).data;

    // Submitting a normal answer to a timed question WITHOUT starting the timer first must fail
    const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: 'Pagtutugma ng dulo ng mga salita sa tula.',
        round: 'main',
        isTimeout: false
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_RESPONSE');
  });
});

test('Guest timeout: early forged timeout is rejected when submitted before time limit has elapsed (400 INVALID_RESPONSE)', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Antonio Luna' })
    });
    const session = (await createRes.json()).data;

    // 1. Start timer (time limit is 30s)
    const timerRes = await fetch(`${base}/api/v1/sessions/${session.id}/timers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        round: 'main'
      })
    });
    assert.equal(timerRes.status, 200);

    // 2. Submit timeout immediately (elapsed < 30 seconds) -> MUST BE REJECTED
    const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: '',
        round: 'main',
        isTimeout: true
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_RESPONSE');
  });
});

test('Guest timeout: client timestamp manipulation (fake clientTimestamp or elapsedSeconds) cannot bypass server validation (400 INVALID_RESPONSE)', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Juan Luna' })
    });
    const session = (await createRes.json()).data;

    // Start timer (30s)
    await fetch(`${base}/api/v1/sessions/${session.id}/timers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        round: 'main'
      })
    });

    // Client passes manipulated timestamp parameters attempting to fool server
    const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: '',
        round: 'main',
        isTimeout: true,
        clientTimestamp: Date.now() - 100000,
        elapsedSeconds: 9999
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_RESPONSE');
  });
});

test('Guest timeout: valid elapsed timeout after actual allowed time has elapsed is accepted with 0 points and timeout status (201)', async () => {
  const { app, mockDb } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Melchora Aquino' })
    });
    const session = (await createRes.json()).data;

    // 1. Start timer
    await fetch(`${base}/api/v1/sessions/${session.id}/timers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        round: 'main'
      })
    });

    // 2. Simulate server elapsed time by backdating the recorded timer in session metadata (> 30s)
    mockDb.sessions.get(session.id).metadata.question_timers['main:elem-challenge'] = new Date(Date.now() - 35000).toISOString();

    // 3. Submitting with isTimeout: true must succeed with 0 points
    const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: '',
        round: 'main',
        isTimeout: true
      })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.isCorrect, false);
    assert.equal(body.data.pointsAwarded, 0);
    assert.equal(body.data.evaluationMethod, 'timeout');

    // Session score must remain 0
    const dbSession = mockDb.sessions.get(session.id);
    assert.equal(dbSession.main_score, 0);
  });
});

test('Guest timeout: timed question with empty answer and isTimeout=false is rejected with 400 INVALID_RESPONSE', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Gregorio del Pilar' })
    });
    const session = (await createRes.json()).data;

    // Blank response without isTimeout: true must be rejected
    const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: '   ',
        round: 'main',
        isTimeout: false
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_RESPONSE');
  });
});

test('Guest timeout: normal answer submitted before time limit expires is accepted and scored normally (201)', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Diego Silang' })
    });
    const session = (await createRes.json()).data;

    // 1. Start timer
    await fetch(`${base}/api/v1/sessions/${session.id}/timers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        round: 'main'
      })
    });

    // 2. Submit legitimate response before timeout
    const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: 'May sukat at pantig ang bawat linya.',
        round: 'main',
        isTimeout: false
      })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.isCorrect, true);
    assert.equal(body.data.pointsAwarded, 1);
  });
});

test('Guest timeout: normal answer submitted AFTER time limit has elapsed is rejected (400 INVALID_RESPONSE)', async () => {
  const { app, mockDb } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Melchora Aquino' })
    });
    const session = (await createRes.json()).data;

    // 1. Start timer (time limit is 30s)
    await fetch(`${base}/api/v1/sessions/${session.id}/timers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        round: 'main'
      })
    });

    // 2. Simulate server elapsed time past deadline (> 30s)
    mockDb.sessions.get(session.id).metadata.question_timers['main:elem-challenge'] = new Date(Date.now() - 35000).toISOString();

    // 3. Normal answer submitted after deadline must be rejected with 400 INVALID_RESPONSE
    const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: 'Pagtutugma ng mga salita sa tula.',
        round: 'main',
        isTimeout: false
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_RESPONSE');
    assert.match(body.message, /Time limit has elapsed; submit as a timeout instead/i);
  });
});

test('Guest timeout: normal answer for untimed question succeeds without timer requirement (201)', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Apolinario Mabini' })
    });
    const session = (await createRes.json()).data;

    // elem-statement has time_limit_seconds: null (untimed).
    // Submitting a normal answer without starting a timer must succeed.
    const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Bilang ng pantig sa bawat taludtod ng tula.',
        round: 'main',
        isTimeout: false
      })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.isCorrect, true);
    assert.equal(body.data.pointsAwarded, 1);
  });
});

test('Guest timeout: Reverse Round timed question enforces same server-authoritative timer validation', async () => {
  const { app, mockDb } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Gabriela Silang' })
    });
    const session = (await createRes.json()).data;

    // 1. Miss question in main round
    mockDb.answers.push({
      id: 'ans-m-1',
      session_id: session.id,
      question_code: 'elem-challenge',
      round: 'main',
      response: 'maling sagot',
      is_correct: false,
      points_awarded: 0,
      evaluation_method: 'local_rubric',
      answered_at: new Date().toISOString()
    });

    // 2. In reverse round: timeout without timer start must be rejected
    const noTimerRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: '',
        round: 'reverse',
        isTimeout: true
      })
    });
    assert.equal(noTimerRes.status, 400);

    // 3. Start reverse timer
    await fetch(`${base}/api/v1/sessions/${session.id}/timers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        round: 'reverse'
      })
    });

    // 4. Premature timeout must be rejected
    const prematureRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: '',
        round: 'reverse',
        isTimeout: true
      })
    });
    assert.equal(prematureRes.status, 400);

    // 5. Backdate reverse timer (> 30s)
    mockDb.sessions.get(session.id).metadata.question_timers['reverse:elem-challenge'] = new Date(Date.now() - 35000).toISOString();

    // 6. Valid elapsed timeout accepted
    const validRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-challenge',
        response: '',
        round: 'reverse',
        isTimeout: true
      })
    });
    assert.equal(validRes.status, 201);
    const validBody = await validRes.json();
    assert.equal(validBody.data.isCorrect, false);
    assert.equal(validBody.data.pointsAwarded, 0);
    assert.equal(validBody.data.evaluationMethod, 'timeout');
  });
});

// --------------------------------------------------------------------------
// 13. Hardened Reverse Round Validation Tests
// --------------------------------------------------------------------------
test('Guest reverse: answering a question in Reverse Round that was already answered correctly in Main Round returns 409 GAME_RULE_REJECTED', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Marcelo H. del Pilar' })
    });
    const session = (await createRes.json()).data;

    // Answer correctly in main round
    const mainRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Ang sukat ay bilang ng pantig sa taludtod.',
        round: 'main'
      })
    });
    assert.equal(mainRes.status, 201);
    assert.equal((await mainRes.json()).data.isCorrect, true);

    // Attempting the same question in reverse round must be rejected
    const revRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Bilang ng pantig.',
        round: 'reverse'
      })
    });
    assert.equal(revRes.status, 409);
    const revBody = await revRes.json();
    assert.equal(revBody.error, 'GAME_RULE_REJECTED');
  });
});

test('Guest reverse: answering a question in Reverse Round that was not attempted in Main Round returns 409 GAME_RULE_REJECTED', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Antonio Luna' })
    });
    const session = (await createRes.json()).data;

    // Never attempted elem-statement in main round -> Reverse round rejected
    const revRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Bilang ng pantig.',
        round: 'reverse'
      })
    });
    assert.equal(revRes.status, 409);
    const revBody = await revRes.json();
    assert.equal(revBody.error, 'GAME_RULE_REJECTED');
  });
});

test('Guest reverse: correct answer in Reverse Round updates reverse_score and leaves main_score intact', async () => {
  const { app, mockDb } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Diego Silang' })
    });
    const session = (await createRes.json()).data;

    // 1. Answer incorrectly in main round
    const mainRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Maling sagot para sa main round.',
        round: 'main'
      })
    });
    assert.equal(mainRes.status, 201);
    assert.equal((await mainRes.json()).data.isCorrect, false);

    // Main score must be 0
    let dbSession = mockDb.sessions.get(session.id);
    assert.equal(dbSession.main_score, 0);
    assert.equal(dbSession.reverse_score, 0);

    // 2. Answer correctly in Reverse Round
    const revRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Ang sukat ay bilang ng pantig sa taludtod.',
        round: 'reverse'
      })
    });
    assert.equal(revRes.status, 201);
    const revBody = await revRes.json();
    assert.equal(revBody.data.isCorrect, true);
    assert.equal(revBody.data.pointsAwarded, 1);

    // reverse_score must be 1, main_score must remain 0
    dbSession = mockDb.sessions.get(session.id);
    assert.equal(dbSession.reverse_score, 1);
    assert.equal(dbSession.main_score, 0);

    // 3. Duplicate submission of the same question in Reverse Round must be rejected with 409
    const dupRevRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Ulit na sagot sa reverse.',
        round: 'reverse'
      })
    });
    assert.equal(dupRevRes.status, 409);
    assert.equal((await dupRevRes.json()).error, 'ANSWER_ALREADY_RECORDED');
  });
});

test('Guest reverse: exceeding 3 Reverse Round attempts is rejected with 409 GAME_RULE_REJECTED', async () => {
  const { app } = testGuestApp();
  await withServer(app, async (base) => {
    const createRes = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Tandang Sora' })
    });
    const session = (await createRes.json()).data;

    // Fail 4 different questions in Main Round
    // elem-challenge is timed (time_limit_seconds: 30); must start timer before submitting.
    const qCodes = ['elem-statement', 'elem-challenge', 'elem-bonus', 'elem-question'];
    const timedCodes = new Set(['elem-challenge']);
    for (const code of qCodes) {
      if (timedCodes.has(code)) {
        await fetch(`${base}/api/v1/sessions/${session.id}/timers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.sessionToken}` },
          body: JSON.stringify({ questionCode: code, round: 'main' })
        });
      }
      const res = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.sessionToken}`
        },
        body: JSON.stringify({
          questionCode: code,
          response: 'Maling sagot para sa bawat isa.',
          round: 'main'
        })
      });
      assert.equal(res.status, 201);
    }

    // Submit 3 Reverse Round attempts (allowed max)
    // elem-challenge (qCodes[1]) is timed; must start timer for the reverse round before submitting.
    for (let i = 0; i < 3; i++) {
      if (timedCodes.has(qCodes[i])) {
        await fetch(`${base}/api/v1/sessions/${session.id}/timers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.sessionToken}` },
          body: JSON.stringify({ questionCode: qCodes[i], round: 'reverse' })
        });
      }
      const revRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.sessionToken}`
        },
        body: JSON.stringify({
          questionCode: qCodes[i],
          response: 'Wastong pagtutugma sukat pantig tugma talinghaga taludtod.',
          round: 'reverse'
        })
      });
      assert.equal(revRes.status, 201);
    }

    // 4th Reverse Round attempt must be rejected
    const fourthRes = await fetch(`${base}/api/v1/sessions/${session.id}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.sessionToken}`
      },
      body: JSON.stringify({
        questionCode: qCodes[3],
        response: 'Ika-apat na attempt sa reverse.',
        round: 'reverse'
      })
    });
    assert.equal(fourthRes.status, 409);
    const fourthBody = await fourthRes.json();
    assert.equal(fourthBody.error, 'GAME_RULE_REJECTED');
  });
});

// --------------------------------------------------------------------------
// 14. Production Configuration Fail-Closed Tests
// --------------------------------------------------------------------------
test('Guest security: production environment fails closed if GUEST_SESSION_SECRET is missing, empty, or too short', () => {
  const origEnv = process.env.NODE_ENV;
  const origConfigEnv = config.nodeEnv;
  const origSecret = config.guestSessionSecret;

  try {
    process.env.NODE_ENV = 'production';
    config.nodeEnv = 'production';

    // 1. Missing / empty secret
    config.guestSessionSecret = '';
    assert.throws(
      () => getSecret(),
      (err) => err.status === 500 && err.code === 'CONFIGURATION_ERROR',
      'Must throw 500 CONFIGURATION_ERROR when secret is empty in production'
    );

    // 2. Secret too short (< 16 chars)
    config.guestSessionSecret = 'short-secret';
    assert.throws(
      () => getSecret(),
      (err) => err.status === 500 && err.code === 'CONFIGURATION_ERROR',
      'Must throw 500 CONFIGURATION_ERROR when secret is too short in production'
    );
  } finally {
    process.env.NODE_ENV = origEnv;
    config.nodeEnv = origConfigEnv;
    config.guestSessionSecret = origSecret;
  }
});

test('Guest security: production environment fails closed if GUEST_SESSION_SECRET uses development default key', () => {
  const origEnv = process.env.NODE_ENV;
  const origConfigEnv = config.nodeEnv;
  const origSecret = config.guestSessionSecret;

  try {
    process.env.NODE_ENV = 'production';
    config.nodeEnv = 'production';
    config.guestSessionSecret = DEV_DEFAULT_SECRET;

    assert.throws(
      () => getSecret(),
      (err) => err.status === 500 && err.code === 'CONFIGURATION_ERROR',
      'Must throw 500 CONFIGURATION_ERROR when secret matches development default key in production'
    );

    // generateGuestToken should also fail closed
    assert.throws(
      () => generateGuestToken({ sessionId: 'session-uuid', studentName: 'Test' }),
      (err) => err.status === 500 && err.code === 'CONFIGURATION_ERROR',
      'generateGuestToken must fail closed when production secret is default'
    );
  } finally {
    process.env.NODE_ENV = origEnv;
    config.nodeEnv = origConfigEnv;
    config.guestSessionSecret = origSecret;
  }
});

test('Guest security: production environment succeeds with a strong custom secret (>= 16 characters)', () => {
  const origEnv = process.env.NODE_ENV;
  const origConfigEnv = config.nodeEnv;
  const origSecret = config.guestSessionSecret;

  try {
    process.env.NODE_ENV = 'production';
    config.nodeEnv = 'production';
    config.guestSessionSecret = 'a-very-secure-32-byte-production-secret-token!';

    const secret = getSecret();
    assert.equal(secret, 'a-very-secure-32-byte-production-secret-token!');

    // Token generation and verification must succeed
    const token = generateGuestToken({ sessionId: 'test-sess-prod', studentName: 'Prod Student' });
    const verified = verifyGuestToken(token);
    assert.equal(verified.sessionId, 'test-sess-prod');
    assert.equal(verified.studentName, 'Prod Student');
  } finally {
    process.env.NODE_ENV = origEnv;
    config.nodeEnv = origConfigEnv;
    config.guestSessionSecret = origSecret;
  }
});

// --------------------------------------------------------------------------
// 15. Migration File Security Contract Verification Tests
// --------------------------------------------------------------------------
test('Migration 202611090002: verifies atomic transaction begin/commit wrapper and preflight checks', () => {
  const migrationPath = path.join(__dirname, '../supabase/migrations/202611090002_phase5_6_guest_students.sql');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  assert.match(migration, /^begin;/m, 'Migration must start with begin;');
  assert.match(migration, /^commit;/m, 'Migration must end with commit;');
  assert.match(migration, /migration_preflight/, 'Migration must include preflight checks');
  assert.match(migration, /alter table public\.game_sessions\s+alter column student_id drop not null;/i);
  assert.match(migration, /alter table public\.student_answers\s+alter column student_id drop not null;/i);
  assert.match(migration, /alter table public\.ai_evaluations\s+alter column student_id drop not null;/i);
});

test('Migration 202611090002: explicitly revokes execute on guest RPCs from PUBLIC, anon, and authenticated, granting only to service_role', () => {
  const migrationPath = path.join(__dirname, '../supabase/migrations/202611090002_phase5_6_guest_students.sql');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  // Verify revocation from public, anon, authenticated
  assert.match(migration, /revoke all on function public\.create_guest_game_session\([^)]+\) from public, anon, authenticated;/i);
  assert.match(migration, /revoke all on function public\.submit_guest_game_answer\([^)]+\) from public, anon, authenticated;/i);
  assert.match(migration, /revoke all on function public\.finish_guest_game_session\([^)]+\) from public, anon, authenticated;/i);

  // Verify grants only to service_role
  assert.match(migration, /grant execute on function public\.create_guest_game_session\([^)]+\) to service_role;/i);
  assert.match(migration, /grant execute on function public\.submit_guest_game_answer\([^)]+\) to service_role;/i);
  assert.match(migration, /grant execute on function public\.finish_guest_game_session\([^)]+\) to service_role;/i);
});

test('Migration 202611090002: enforces SECURITY DEFINER, search_path, duplicate answer check, timeout validation, and Reverse Round rules', () => {
  const migrationPath = path.join(__dirname, '../supabase/migrations/202611090002_phase5_6_guest_students.sql');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  // Security definer & search_path
  const secDefinerMatches = migration.match(/language plpgsql security definer/g) || [];
  assert.equal(secDefinerMatches.length, 4, 'All 4 guest functions must be SECURITY DEFINER');

  const searchPathMatches = migration.match(/set search_path = public, pg_temp/g) || [];
  assert.equal(searchPathMatches.length, 4, 'All 4 guest functions must pin search_path to public, pg_temp');

  // Duplicate answer check (23505)
  assert.match(migration, /round = p_round/);
  assert.match(migration, /errcode = '23505'/);

  // Server-side timeout validation
  assert.match(migration, /v_version\.time_limit_seconds is null or v_version\.time_limit_seconds <= 0/);
  assert.match(migration, /Timeout is only permitted on timed questions/);
  assert.match(migration, /Question timer has not been started/);
  assert.match(migration, /Time limit has elapsed; submit as a timeout instead/);

  // Reverse round attempt limit (23514) and missed check
  assert.match(migration, /Reverse Round attempt limit reached/);
  assert.match(migration, /Reverse Round accepts only questions missed in the main round/);

  // Guest indexes
  assert.match(migration, /create index if not exists game_sessions_guest_started_idx/i);
  assert.match(migration, /create index if not exists student_answers_guest_idx/i);
});
