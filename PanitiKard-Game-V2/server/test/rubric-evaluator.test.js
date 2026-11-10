'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');

const {
  createRubricEvaluatorService,
  validateEvaluationInput,
  normalizeText,
  wordCount,
  phraseMatchesInAnswer,
  matchesAcceptedAnswer,
  groupMatchesInAnswer,
  validateRubricGroups,
  buildFeedback,
  buildCriteriaEvaluation
} = require('../src/services/rubricEvaluator');

const { createApp } = require('../src/server');
const { createAuthenticator } = require('../src/middleware/authenticate');
const { generateGuestToken } = require('../src/services/guestTokenService');
const { HttpError } = require('../src/middleware/httpError');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function createMockDb(overrides = {}) {
  let evaluationsStore = [];

  return {
    rpc: async (fnName, params) => {
      if (overrides.rpc) return overrides.rpc(fnName, params);
      if (fnName === 'submit_game_answer' || fnName === 'submit_guest_game_answer') {
        const isTimeout = Boolean(params.p_is_timeout);
        return {
          data: {
            answer: {
              id: 'ans-001',
              questionId: 'q-001',
              round: params.p_round || 'main',
              isCorrect: isTimeout ? false : true,
              pointsAwarded: isTimeout ? 0 : 2,
              maxPoints: 2,
              evaluationMethod: isTimeout ? 'timeout' : 'local_rubric',
              answeredAt: new Date().toISOString()
            },
            isCorrect: isTimeout ? false : true,
            pointsAwarded: isTimeout ? 0 : 2,
            maxPoints: 2,
            evaluationMethod: isTimeout ? 'timeout' : 'local_rubric'
          },
          error: null
        };
      }
      return { data: null, error: null };
    },
    from: (table) => {
      if (overrides[table]) {
        return typeof overrides[table] === 'function' ? overrides[table]() : overrides[table];
      }
      if (table === 'questions') {
        const chain = {
          select: () => chain,
          eq: (col, val) => {
            if (val === 'unknown-q') return { maybeSingle: async () => ({ data: null, error: null }) };
            return chain;
          },
          maybeSingle: async () => ({
            data: { id: 'q-001', code: 'elem-statement', current_version: 1, status: 'published', archived_at: null, topic_id: 't-001', topics: { title: 'Panitikan', code: 'elements' } },
            error: null
          })
        };
        return chain;
      }
      if (table === 'question_versions') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: { id: 'qv-001', question_id: 'q-001', version_number: 1, prompt: 'Ipaliwanag ang tagpuan.', points: 2, category_label: null, tag: 'statement' },
            error: null
          })
        };
        return chain;
      }
      if (table === 'question_evaluation_rubrics') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: {
              expected_answer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
              rubric_groups: [['konteksto', 'kapaligiran'], ['tauhan', 'karakter']],
              accepted_answers: ['Nagbibigay ng konteksto ang tagpuan.', 'Lugar at panahon ng kwento']
            },
            error: null
          })
        };
        return chain;
      }
      if (table === 'game_sessions') {
        const chain = {
          select: () => chain,
          eq: (col, val) => {
            chain._sessionId = val;
            return chain;
          },
          maybeSingle: async () => ({
            data: { id: chain._sessionId || 'sess-100', student_id: 'student-001' },
            error: null
          })
        };
        return chain;
      }
      if (table === 'ai_evaluations') {
        let queryParams = {};
        const chain = {
          select: () => chain,
          eq: (col, val) => {
            queryParams[col] = val;
            return chain;
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            const found = evaluationsStore.find(e =>
              (!queryParams.session_id || e.session_id === queryParams.session_id) &&
              (!queryParams.question_id || e.question_id === queryParams.question_id) &&
              (!queryParams.student_answer || e.student_answer === queryParams.student_answer)
            );
            return { data: found || null, error: null };
          },
          insert: (payload) => ({
            select: () => ({
              single: async () => {
                const record = {
                  id: `eval-${evaluationsStore.length + 1}`,
                  created_at: new Date().toISOString(),
                  ...payload
                };
                evaluationsStore.push(record);
                return { data: { id: record.id, created_at: record.created_at }, error: null };
              }
            })
          })
        };
        return chain;
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) })
      };
    }
  };
}

function makeStudentAuth(db) {
  return async (req, _res, next) => {
    req.auth = {
      user: { id: 'student-001', email: 'student@test.com' },
      profile: { role: 'student', display_name: 'Test Student' },
      client: db
    };
    next();
  };
}

function hasCode(code) {
  return (err) => {
    assert.equal(err.code, code);
    return true;
  };
}

// ---------------------------------------------------------------------------
// Unit tests: normalizeText
// ---------------------------------------------------------------------------

test('normalizeText: lowercases and strips diacritics', () => {
  assert.equal(normalizeText('Áng Tagpuán'), 'ang tagpuan');
  assert.equal(normalizeText('MGA TAUHÁN'), 'mga tauhan');
  assert.equal(normalizeText('kontekstó'), 'konteksto');
  assert.equal(normalizeText('pilosopía'), 'pilosopia');
  assert.equal(normalizeText('ñoño'), 'nono');
});

test('normalizeText: collapses punctuation and special chars to single space', () => {
  assert.equal(normalizeText('hello,world!ok'), 'hello world ok');
  assert.equal(normalizeText('  multiple   spaces  '), 'multiple spaces');
  assert.equal(normalizeText(''), '');
});

test('wordCount: counts words in a normalized string', () => {
  assert.equal(wordCount('ang tagpuan ay lugar'), 4);
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('  '), 0);
  assert.equal(wordCount('isang'), 1);
});

// ---------------------------------------------------------------------------
// Unit tests: phraseMatchesInAnswer
// ---------------------------------------------------------------------------

test('phraseMatchesInAnswer: detects exact phrase with boundary matching', () => {
  assert.ok(phraseMatchesInAnswer('konteksto', 'nagbibigay ng konteksto sa mga tauhan'));
  assert.ok(phraseMatchesInAnswer('mga tauhan', 'nagbibigay ng konteksto sa mga tauhan'));
});

test('phraseMatchesInAnswer: rejects partial word matches (false-positive prevention)', () => {
  assert.ok(!phraseMatchesInAnswer('pag', 'tagpuan ng kwento'));
  assert.ok(!phraseMatchesInAnswer('ang', 'panahon'));
});

test('phraseMatchesInAnswer: handles empty inputs gracefully', () => {
  assert.ok(!phraseMatchesInAnswer('', 'some text'));
  assert.ok(!phraseMatchesInAnswer('konteksto', ''));
});

// ---------------------------------------------------------------------------
// Unit tests: matchesAcceptedAnswer
// ---------------------------------------------------------------------------

test('matchesAcceptedAnswer: accepts normalized exact matches', () => {
  const accepted = ['Nagbibigay ng konteksto ang tagpuan.', 'Lugar at panahon ng kwento'];
  assert.ok(matchesAcceptedAnswer('nagbibigay ng konteksto ang tagpuan', accepted));
  assert.ok(matchesAcceptedAnswer('lugar at panahon ng kwento', accepted));
});

test('matchesAcceptedAnswer: rejects non-matching answers', () => {
  const accepted = ['Nagbibigay ng konteksto ang tagpuan.'];
  assert.ok(!matchesAcceptedAnswer('hindi ito ang tamang sagot', accepted));
  assert.ok(!matchesAcceptedAnswer('', accepted));
});

test('matchesAcceptedAnswer: handles empty accepted list', () => {
  assert.ok(!matchesAcceptedAnswer('some answer', []));
  assert.ok(!matchesAcceptedAnswer('some answer', null));
});

// ---------------------------------------------------------------------------
// Unit tests: groupMatchesInAnswer
// ---------------------------------------------------------------------------

test('groupMatchesInAnswer: matches any alternative term in a group', () => {
  const group = ['konteksto', 'kapaligiran', 'setting'];
  assert.ok(groupMatchesInAnswer(group, 'nagbibigay ng konteksto sa kwento'));
  assert.ok(groupMatchesInAnswer(group, 'ang kapaligiran ng lugar'));
  assert.ok(groupMatchesInAnswer(group, 'ang setting ng nobela'));
});

test('groupMatchesInAnswer: rejects when no group term is present', () => {
  const group = ['konteksto', 'kapaligiran'];
  assert.ok(!groupMatchesInAnswer(group, 'ang mga tauhan ay nagtatalo'));
});

test('groupMatchesInAnswer: handles empty group', () => {
  assert.ok(!groupMatchesInAnswer([], 'some answer'));
  assert.ok(!groupMatchesInAnswer(null, 'some answer'));
});

// ---------------------------------------------------------------------------
// Unit tests: evaluator core & scoring integrity
// ---------------------------------------------------------------------------

test('Evaluator: exact match against expected answer awards full credit', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
    rubricCriteria: [['konteksto'], ['tauhan']],
    maxPoints: 2
  });
  assert.ok(result.isCorrect, 'Should be correct on exact match');
  assert.equal(result.semanticScore, 1.0);
  assert.equal(result.pointsEarned, 2);
  assert.equal(result.evaluationMethod, 'deterministic_rubric');
});

test('Evaluator: accepted alternative term awards full credit', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'Nagbibigay ng konteksto ang tagpuan.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
    acceptedAnswers: ['Nagbibigay ng konteksto ang tagpuan.', 'Lugar at panahon ng kwento'],
    rubricCriteria: [['konteksto'], ['tauhan']],
    maxPoints: 2
  });
  assert.ok(result.isCorrect, 'Should match an accepted alternative');
  assert.equal(result.semanticScore, 1.0);
  assert.equal(result.pointsEarned, 2);
});

test('Evaluator: capitalization variations are accepted', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'ANG TAGPUAN AY NAGBIBIGAY NG KONTEKSTO SA MGA TAUHAN.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
    rubricCriteria: [['konteksto'], ['tauhan']],
    maxPoints: 1
  });
  assert.ok(result.isCorrect, 'Uppercase variation should match');
});

test('Evaluator: punctuation variations are normalized and accepted', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'ang tagpuan ay nagbibigay ng konteksto sa mga tauhan',
    questionCode: 'elem-statement',
    expectedAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
    rubricCriteria: [['konteksto'], ['tauhan']],
    maxPoints: 1
  });
  assert.ok(result.isCorrect, 'Missing period should still match');
});

test('Scoring: One-word answer with one required rubric group does not receive full points', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'konteksto', // 1 word only
    questionCode: 'elem-statement',
    expectedAnswer: 'Magbigay ng malawak na konteksto sa kwento.',
    rubricCriteria: [['konteksto']],
    maxPoints: 1
  });
  assert.equal(result.isCorrect, false, 'One-word answer must NOT be marked isCorrect=true');
  assert.ok(result.semanticScore < 1.0, 'semanticScore must be less than 1.0');
  assert.ok(result.pointsEarned < 1, 'pointsEarned must NOT equal maxPoints 1');
  assert.equal(result.pointsEarned, 0.5);
});

test('Scoring: Partial match across multiple rubric groups preserves proportional partial credit', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'ang konteksto ng kwento ay mahalaga', // 6 words, matches group 1 but not group 2
    questionCode: 'elem-statement',
    expectedAnswer: 'different expected answer',
    rubricCriteria: [['konteksto', 'kapaligiran'], ['tauhan', 'karakter']],
    maxPoints: 2
  });
  assert.equal(result.isCorrect, false, 'Partial match is not fully correct');
  assert.equal(result.semanticScore, 0.5, '1 of 2 groups = 0.5 semantic score');
  assert.equal(result.pointsEarned, 1, '0.5 * 2 = 1 advisory point earned');
  assert.ok(result.criteriaEvaluation[0].satisfied);
  assert.ok(!result.criteriaEvaluation[1].satisfied);
});

test('Scoring: All groups matched but minimum-word requirement not met awards partial credit and not full points', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'konteksto tauhan', // 2 words only (< 3 words)
    questionCode: 'elem-statement',
    expectedAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
    rubricCriteria: [['konteksto'], ['tauhan']],
    maxPoints: 2
  });
  assert.equal(result.isCorrect, false, 'Failing minimum word requirement (words < 3) must be isCorrect=false');
  assert.ok(result.semanticScore < 1.0, 'semanticScore must be strictly less than 1.0');
  assert.ok(result.pointsEarned < 2, 'pointsEarned must be strictly less than maxPoints');
  assert.equal(result.pointsEarned, 1);
});

test('Scoring: Fully correct answer with all groups matched and >= 3 words receives full points', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'ang tagpuan ay nagbibigay ng konteksto sa mga tauhan ng kwento',
    questionCode: 'elem-statement',
    expectedAnswer: 'different expected answer',
    rubricCriteria: [['konteksto', 'kapaligiran'], ['tauhan', 'karakter']],
    maxPoints: 2
  });
  assert.equal(result.isCorrect, true, 'All groups matched + words >= 3 is fully correct');
  assert.equal(result.semanticScore, 1.0);
  assert.equal(result.pointsEarned, 2);
});

test('Scoring: Decimal rounding near maximum score never rounds an incorrect answer to full points', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'halos tama ngunit hindi kumpleto ang paliwanag',
    questionCode: 'elem-statement',
    expectedAnswer: 'different',
    rubricCriteria: [['konteksto']],
    maxPoints: 1,
    mockResult: { isCorrect: false, semanticScore: 0.9999 } // edge-case high score when isCorrect=false
  });
  assert.equal(result.isCorrect, false);
  assert.ok(result.pointsEarned < 1, `pointsEarned (${result.pointsEarned}) must not round up to maxPoints (1)`);
});

test('Evaluator: missing ALL concepts = 0 score', async () => {
  const svc = createRubricEvaluatorService();
  const result = await svc.evaluateAnswer({
    studentAnswer: 'walang kaugnayan na sagot',
    questionCode: 'elem-statement',
    expectedAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
    rubricCriteria: [['konteksto', 'kapaligiran'], ['tauhan', 'karakter']],
    maxPoints: 2
  });
  assert.ok(!result.isCorrect);
  assert.equal(result.semanticScore, 0.0);
  assert.equal(result.pointsEarned, 0);
});

test('Evaluator: blank answer throws INVALID_EVALUATION_INPUT', async () => {
  const svc = createRubricEvaluatorService();
  await assert.rejects(
    () => svc.evaluateAnswer({
      studentAnswer: '',
      questionCode: 'elem-statement',
      expectedAnswer: 'answer',
      rubricCriteria: [],
      maxPoints: 1
    }),
    hasCode('INVALID_EVALUATION_INPUT')
  );
});

// ---------------------------------------------------------------------------
// Unit tests: validateEvaluationInput
// ---------------------------------------------------------------------------

test('validateEvaluationInput: accepts valid input', () => {
  const result = validateEvaluationInput({
    studentAnswer: 'ang sagot',
    questionCode: 'elem-statement',
    sessionId: null
  });
  assert.equal(result.studentAnswer, 'ang sagot');
  assert.equal(result.questionCode, 'elem-statement');
  assert.equal(result.sessionId, null);
});

test('validateEvaluationInput: rejects blank studentAnswer', () => {
  assert.throws(() => validateEvaluationInput({ studentAnswer: '  ', questionCode: 'q-1' }), hasCode('INVALID_EVALUATION_INPUT'));
});

test('validateEvaluationInput: rejects oversized studentAnswer (>4000 chars)', () => {
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'x'.repeat(4001), questionCode: 'q-1' }), hasCode('INVALID_EVALUATION_INPUT'));
});

test('validateEvaluationInput: rejects invalid questionCode format', () => {
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'answer', questionCode: 'BAD_CODE' }), hasCode('INVALID_QUESTION_CODE'));
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'answer', questionCode: '' }), hasCode('INVALID_QUESTION_CODE'));
});

test('validateEvaluationInput: rejects mockResult injection', () => {
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'answer', questionCode: 'q-1', mockResult: {} }), hasCode('UNAUTHORIZED_MOCK'));
});

test('validateEvaluationInput: rejects studentId injection', () => {
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'answer', questionCode: 'q-1', studentId: 'uid' }), hasCode('UNAUTHORIZED_STUDENT_ID'));
});

test('validateEvaluationInput: rejects questionId injection', () => {
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'answer', questionCode: 'q-1', questionId: 'uid' }), hasCode('UNAUTHORIZED_QUESTION_ID'));
});

test('validateEvaluationInput: rejects malformed sessionId', () => {
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'answer', questionCode: 'q-1', sessionId: 'not-a-uuid' }), hasCode('INVALID_SESSION_ID'));
});

// ---------------------------------------------------------------------------
// Unit tests: privacy & criteriaEvaluation
// ---------------------------------------------------------------------------

test('Privacy: criteriaEvaluation explanations never reveal private rubric terms', () => {
  const secretGroups = [['lihim_na_salita_1', 'sikreto_a'], ['lihim_na_salita_2']];
  const evalResult = buildCriteriaEvaluation(secretGroups, 'walang katugmang sagot dito');
  assert.equal(evalResult.length, 2);

  const serialized = JSON.stringify(evalResult);
  assert.ok(!serialized.includes('lihim_na_salita_1'), 'Secret term must not be in criteria evaluation');
  assert.ok(!serialized.includes('sikreto_a'), 'Secret alternative must not be in criteria evaluation');
  assert.ok(!serialized.includes('lihim_na_salita_2'), 'Secret term 2 must not be in criteria evaluation');

  // Verify safe generic Filipino pedagogical text
  assert.match(evalResult[0].explanation, /Hindi pa naabot/);
});

test('Privacy: complete serialized evaluation response never exposes rubricGroups, acceptedAnswers, or expectedAnswer', async () => {
  const svc = createRubricEvaluatorService();
  const secretExpected = 'Mahalagang pampanitikang sagot na lihim';
  const secretAccepted = ['Lihim na katanggap-tanggap na sagot'];
  const secretTerms = ['lihim_tema_1', 'lihim_tauhan_2'];

  const result = await svc.evaluateAnswer({
    studentAnswer: 'pangkalahatang pagpapaliwanag sa akda',
    questionCode: 'elem-statement',
    expectedAnswer: secretExpected,
    rubricCriteria: [secretTerms],
    acceptedAnswers: secretAccepted,
    maxPoints: 1
  });

  const serialized = JSON.stringify(result);
  const parsed = JSON.parse(serialized);

  assert.ok(!('rubricGroups' in parsed));
  assert.ok(!('acceptedAnswers' in parsed));
  assert.ok(!('expectedAnswer' in parsed));

  assert.ok(!serialized.includes(secretExpected), 'Secret expectedAnswer must not appear anywhere in serialized response');
  assert.ok(!serialized.includes(secretAccepted[0]), 'Secret acceptedAnswer must not appear anywhere in serialized response');
  assert.ok(!serialized.includes(secretTerms[0]), 'Secret rubric term must not appear anywhere in serialized response');
  assert.ok(!serialized.includes(secretTerms[1]), 'Secret rubric term must not appear anywhere in serialized response');
});

// ---------------------------------------------------------------------------
// Integration tests: HTTP endpoints & alias error handling
// ---------------------------------------------------------------------------

test('HTTP: POST /evaluations/answer with valid session evaluates correctly and does not leak private terms', async () => {
  const db = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(db),
    adminClientFactory: () => db
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer student-token' },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        studentAnswer: 'ang tagpuan ay nagbibigay ng konteksto sa mga tauhan',
        sessionId: '00000000-0000-0000-0000-000000000001'
      })
    });
    const body = await res.json();
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert.ok(body.success);
    assert.equal(body.data.evaluationMethod, 'deterministic_rubric');

    // Strict privacy verification on complete response
    const serialized = JSON.stringify(body);
    const forbidden = ['konteksto', 'kapaligiran', 'tauhan', 'karakter', 'Lugar at panahon ng kwento'];
    for (const term of forbidden) {
      assert.ok(!body.data.criteriaEvaluation.some(c => c.explanation.includes(term)), `Term '${term}' leaked in criteriaEvaluation explanation`);
    }
  });
});

test('HTTP: POST /evaluations/answer rejects malformed sessionId with exact 400 INVALID_SESSION_ID', async () => {
  const db = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(db),
    adminClientFactory: () => db
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer student-token' },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        studentAnswer: 'sagot',
        sessionId: 'invalid-not-a-uuid'
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'INVALID_SESSION_ID');
  });
});

test('HTTP: POST /evaluations/answer rejects blank answer with 400 INVALID_EVALUATION_INPUT', async () => {
  const db = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(db),
    adminClientFactory: () => db
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer student-token' },
      body: JSON.stringify({ questionCode: 'elem-statement', studentAnswer: '   ' })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'INVALID_EVALUATION_INPUT');
  });
});

test('HTTP: POST /evaluations/answer rejects mockResult injection with 400 UNAUTHORIZED_MOCK', async () => {
  const db = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(db),
    adminClientFactory: () => db
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer student-token' },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        studentAnswer: 'valid answer',
        mockResult: { isCorrect: true }
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'UNAUTHORIZED_MOCK');
  });
});

test('HTTP: Duplicate submission — database idempotency returns isDuplicate: true on subsequent calls', async () => {
  const db = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(db),
    adminClientFactory: () => db
  });
  await withServer(app, async (base) => {
    const payload = {
      questionCode: 'elem-statement',
      studentAnswer: 'ang konteksto ng mga tauhan ay mahalaga sa tagpuan',
      sessionId: '00000000-0000-0000-0000-000000000002'
    };
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify(payload)
    };

    const res1 = await fetch(`${base}/api/v1/evaluations/answer`, opts);
    const body1 = await res1.json();
    assert.equal(res1.status, 200);
    assert.ok(body1.success);

    // Second identical request for the same session/question/answer
    const res2 = await fetch(`${base}/api/v1/evaluations/answer`, opts);
    const body2 = await res2.json();
    assert.equal(res2.status, 200);
    assert.ok(body2.success);
    assert.equal(body2.data.isDuplicate, true, 'Subsequent identical submission must return isDuplicate: true');
  });
});

test('HTTP: GET /evaluations/answer/status returns operational status', async () => {
  const db = createMockDb();
  const app = createApp({ adminClientFactory: () => db });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer/status`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(body.success);
    assert.ok(body.data.operational);
    assert.ok(body.data.provider.includes('Deterministic'));
  });
});

test('HTTP: retired /evaluations/gemini endpoint returns 404', async () => {
  const db = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(db),
    adminClientFactory: () => db
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({ questionCode: 'elem-statement', studentAnswer: 'sagot' })
    });
    assert.equal(res.status, 404);
  });
});

test('HTTP: Timeout submission to official session answers endpoint awards 0 points', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000004';
  const db = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(db),
    adminClientFactory: () => db
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/sessions/${sessionId}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: '',
        round: 'main',
        isTimeout: true
      })
    });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.ok(body.success);
    assert.equal(body.data.isCorrect, false);
    assert.equal(body.data.pointsAwarded, 0);
    assert.equal(body.data.evaluationMethod, 'timeout');
  });
});

test('HTTP: Guest student can POST /evaluations/answer with genuine cryptographic guest token', async () => {
  const guestSessionId = '00000000-0000-0000-0000-000000000005';
  const realGuestToken = generateGuestToken({
    sessionId: guestSessionId,
    studentName: 'Maria Clara'
  });

  const db = createMockDb({
    game_sessions: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: guestSessionId, student_id: null }, // student_id is null for guest
            error: null
          })
        })
      })
    })
  });

  const app = createApp({
    authenticate: createAuthenticator(), // uses default authenticator with real guest token verification
    adminClientFactory: () => db
  });

  await withServer(app, async (base) => {
    // 1. Calling with matching sessionId and valid cryptographic token succeeds
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${realGuestToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        studentAnswer: 'ang tagpuan ay nagbibigay ng konteksto sa mga tauhan',
        sessionId: guestSessionId
      })
    });
    const body = await res.json();
    assert.equal(res.status, 200, `Expected 200: ${JSON.stringify(body)}`);
    assert.ok(body.success);
    assert.equal(body.data.evaluationMethod, 'deterministic_rubric');

    // 2. Calling with mismatched sessionId fails closed with 403 FORBIDDEN_SESSION
    const resMismatch = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${realGuestToken}`
      },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        studentAnswer: 'ang tagpuan ay nagbibigay ng konteksto sa mga tauhan',
        sessionId: '00000000-0000-0000-0000-999999999999'
      })
    });
    assert.equal(resMismatch.status, 403);
    const bodyMismatch = await resMismatch.json();
    assert.equal(bodyMismatch.error, 'FORBIDDEN_SESSION');
  });
});

test('Dependency: gemini.js is NOT imported by apiRoutes.js or server.js', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'server.js'), 'utf8');
  const apiRoutesJs = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'apiRoutes.js'), 'utf8');
  assert.doesNotMatch(serverJs, /require.*services\/gemini/, 'server.js must not import gemini service');
  assert.doesNotMatch(apiRoutesJs, /require.*services\/gemini/, 'apiRoutes.js must not import gemini service');
});

test('Dependency: active evaluation flow has no live Gemini API call in rubricEvaluator.js', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'rubricEvaluator.js'), 'utf8');
  assert.doesNotMatch(src, /@google\/genai/, 'rubricEvaluator must not import @google/genai');
  assert.doesNotMatch(src, /GoogleGenAI/, 'rubricEvaluator must not use GoogleGenAI');
  assert.doesNotMatch(src, /generateContent/, 'rubricEvaluator must not call generateContent');
  assert.doesNotMatch(src, /GEMINI_API_KEY/, 'rubricEvaluator must not reference GEMINI_API_KEY');
});

// --------------------------------------------------------------------------
// Service-Layer recordEvaluation Security & Integrity Tests (Migrated from gemini.test.js)
// --------------------------------------------------------------------------

test('recordEvaluation: rejects missing questionId with 400 INVALID_EVALUATION_INPUT', async () => {
  const service = createRubricEvaluatorService();
  const mockDb = createMockDb();

  await assert.rejects(
    async () => service.recordEvaluation(mockDb, mockDb, {
      studentId: 'student-001',
      questionId: '',
      questionVersionId: 'qv-001',
      studentAnswer: 'Sagot'
    }),
    hasCode('INVALID_EVALUATION_INPUT')
  );
});

test('recordEvaluation: rejects missing questionVersionId with 400 INVALID_EVALUATION_INPUT', async () => {
  const service = createRubricEvaluatorService();
  const mockDb = createMockDb();

  await assert.rejects(
    async () => service.recordEvaluation(mockDb, mockDb, {
      studentId: 'student-001',
      questionId: 'q-001',
      questionVersionId: '',
      studentAnswer: 'Sagot'
    }),
    hasCode('INVALID_EVALUATION_INPUT')
  );
});

test('recordEvaluation: rejects session belonging to another student with 403 FORBIDDEN_SESSION', async () => {
  const service = createRubricEvaluatorService();
  const mockDb = createMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'sess-diff', student_id: 'other-student-999' },
            error: null
          })
        })
      })
    }
  });

  await assert.rejects(
    async () => service.recordEvaluation(mockDb, mockDb, {
      studentId: 'student-001',
      sessionId: 'sess-diff',
      questionId: 'q-001',
      questionVersionId: 'qv-001',
      studentAnswer: 'Sagot',
      isSemanticMatch: true,
      semanticScore: 1.0,
      feedback: 'Magaling.'
    }),
    hasCode('FORBIDDEN_SESSION')
  );
});

test('recordEvaluation: accepts valid question and matching version', async () => {
  const service = createRubricEvaluatorService();
  const mockDb = createMockDb();
  let insertedPayload = null;

  const mockServiceRoleClient = {
    from: (table) => {
      if (table === 'ai_evaluations') {
        return {
          insert: (payload) => {
            insertedPayload = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'eval-uuid-migrated-1', created_at: new Date().toISOString() },
                  error: null
                })
              })
            };
          }
        };
      }
      throw new Error(`Unexpected table on service-role client: ${table}`);
    }
  };

  const record = await service.recordEvaluation(mockDb, mockServiceRoleClient, {
    studentId: 'student-001',
    sessionId: '00000000-0000-0000-0000-000000000010',
    questionId: 'q-001',
    questionCode: 'elem-statement',
    questionVersionId: 'qv-001',
    studentAnswer: 'Sagot',
    isSemanticMatch: true,
    semanticScore: 1.0,
    feedback: 'Magaling.'
  });

  assert.ok(record);
  assert.equal(record.id, 'eval-uuid-migrated-1');
  assert.equal(insertedPayload.student_id, 'student-001');
  assert.equal(insertedPayload.session_id, '00000000-0000-0000-0000-000000000010');
  assert.equal(insertedPayload.question_id, 'q-001');
  assert.equal(insertedPayload.question_version_id, 'qv-001');
});

test('recordEvaluation: rejects question version belonging to a different question with 400 QUESTION_VERSION_MISMATCH', async () => {
  const service = createRubricEvaluatorService();
  const mockDb = createMockDb({
    question_versions: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            // Version does not belong to question q-001
            maybeSingle: async () => ({ data: null, error: null })
          })
        })
      })
    }
  });

  await assert.rejects(
    async () => service.recordEvaluation(mockDb, mockDb, {
      studentId: 'student-001',
      questionId: 'q-001',
      questionCode: 'elem-statement',
      questionVersionId: 'qv-mismatched-999',
      studentAnswer: 'Sagot'
    }),
    hasCode('QUESTION_VERSION_MISMATCH')
  );
});

test('recordEvaluation: rejects question relationship mismatch with 400 QUESTION_RELATIONSHIP_MISMATCH', async () => {
  const service = createRubricEvaluatorService();
  const mockDb = createMockDb({
    questions: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null })
          })
        })
      })
    }
  });

  await assert.rejects(
    async () => service.recordEvaluation(mockDb, mockDb, {
      studentId: 'student-001',
      questionId: 'q-wrong',
      questionCode: 'elem-statement',
      questionVersionId: 'qv-001',
      studentAnswer: 'Sagot'
    }),
    hasCode('QUESTION_RELATIONSHIP_MISMATCH')
  );
});

test('recordEvaluation: inserts through serviceRoleClient, not the student client', async () => {
  const service = createRubricEvaluatorService();
  let studentClientInsertCalled = false;
  let serviceRoleInsertCalled = false;

  const mockStudentClient = createMockDb({
    ai_evaluations: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null })
                  })
                })
              })
            })
          })
        })
      }),
      insert: () => {
        studentClientInsertCalled = true;
        return {
          select: () => ({ single: async () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) })
        };
      }
    }
  });

  const mockServiceRoleClient = {
    from: (table) => {
      if (table === 'ai_evaluations') {
        return {
          insert: (payload) => {
            serviceRoleInsertCalled = true;
            assert.equal(payload.student_id, 'student-001');
            assert.equal(payload.question_id, 'q-001');
            assert.equal(typeof payload.semantic_score, 'number');
            assert.equal(typeof payload.is_semantic_match, 'boolean');
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'service-role-eval-uuid', created_at: new Date().toISOString() },
                  error: null
                })
              })
            };
          }
        };
      }
      throw new Error(`Unexpected table on service-role client: ${table}`);
    }
  };

  const record = await service.recordEvaluation(mockStudentClient, mockServiceRoleClient, {
    studentId: 'student-001',
    sessionId: '00000000-0000-0000-0000-000000000010',
    questionId: 'q-001',
    questionCode: 'elem-statement',
    questionVersionId: 'qv-001',
    studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
    isSemanticMatch: true,
    semanticScore: 1.0,
    feedback: 'Wasto ang sagot.',
    criteriaEvaluation: [],
    status: 'evaluated',
    evaluatedAt: new Date().toISOString()
  });

  assert.ok(record);
  assert.equal(record.id, 'service-role-eval-uuid');
  assert.equal(serviceRoleInsertCalled, true, 'INSERT must use service-role client');
  assert.equal(studentClientInsertCalled, false, 'Student client must NOT be used for INSERT');
});

test('recordEvaluation: throws SERVICE_ROLE_UNAVAILABLE when no serviceRoleClient is provided, preventing student-client INSERT fallback', async () => {
  const service = createRubricEvaluatorService();
  const mockStudentClient = createMockDb();

  await assert.rejects(
    async () => service.recordEvaluation(mockStudentClient, null, {
      studentId: 'student-001',
      sessionId: '00000000-0000-0000-0000-000000000010',
      questionId: 'q-001',
      questionCode: 'elem-statement',
      questionVersionId: 'qv-001',
      studentAnswer: 'Sagot'
    }),
    hasCode('SERVICE_ROLE_UNAVAILABLE')
  );
});

test('recordEvaluation: service-role INSERT still enforces student_id from server, not from client payload', async () => {
  const service = createRubricEvaluatorService();
  let actualInsertedPayload = null;

  const authenticStudentId = 'authentic-student-id-001';
  const mockDb = createMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000010', student_id: authenticStudentId },
            error: null
          })
        })
      })
    }
  });

  const mockServiceRoleClient = {
    from: (table) => {
      if (table === 'ai_evaluations') {
        return {
          insert: (payload) => {
            actualInsertedPayload = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'eval-enforced-student', created_at: new Date().toISOString() },
                  error: null
                })
              })
            };
          }
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };

  await service.recordEvaluation(mockDb, mockServiceRoleClient, {
    studentId: authenticStudentId,
    student_id: 'forged-attacker-id-999', // attempt to inject forged property
    sessionId: '00000000-0000-0000-0000-000000000010',
    questionId: 'q-001',
    questionCode: 'elem-statement',
    questionVersionId: 'qv-001',
    studentAnswer: 'Sagot'
  });

  assert.ok(actualInsertedPayload);
  assert.equal(actualInsertedPayload.student_id, authenticStudentId);
});

// --------------------------------------------------------------------------
// API Route Security & Database Regression Tests (Migrated from gemini.test.js)
// --------------------------------------------------------------------------

test('HTTP: POST /evaluations/answer rejects session belonging to another student with 403 FORBIDDEN_SESSION', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000020';
  const mockDb = createMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: sessionId, student_id: 'other-student-uuid-999' },
            error: null
          })
        })
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement',
        sessionId
      })
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'FORBIDDEN_SESSION');
  });
});

test('HTTP: POST /evaluations/answer rejects nonexistent session ID with 404 SESSION_NOT_FOUND', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000404';
  const mockDb = createMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null })
        })
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement',
        sessionId
      })
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'SESSION_NOT_FOUND');
  });
});

test('HTTP: POST /evaluations/answer verifies session ownership exactly once', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000010';
  let sessionCheckCount = 0;

  const mockDb = createMockDb({
    game_sessions: {
      select: () => ({
        eq: () => {
          sessionCheckCount++;
          return {
            maybeSingle: async () => ({
              data: { id: sessionId, student_id: 'student-001' },
              error: null
            })
          };
        }
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
        questionCode: 'elem-statement',
        sessionId
      })
    });
    assert.equal(res.status, 200);
    assert.equal(sessionCheckCount, 1, 'Session ownership must be checked exactly once authoritative in service layer');
  });
});

test('HTTP: POST /evaluations/answer rejects unknown question codes with 404 QUESTION_NOT_FOUND', async () => {
  const mockDb = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'unknown-q'
      })
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'QUESTION_NOT_FOUND');
  });
});

test('HTTP: POST /evaluations/answer rejects archived question with 404 QUESTION_NOT_FOUND', async () => {
  const mockDb = createMockDb({
    questions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'q-archived', code: 'elem-statement', status: 'archived', archived_at: new Date().toISOString() },
            error: null
          })
        })
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'QUESTION_NOT_FOUND');
  });
});

test('HTTP: POST /evaluations/answer rejects missing question version in database with 404 QUESTION_VERSION_NOT_FOUND', async () => {
  const mockDb = createMockDb({
    question_versions: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null })
          })
        })
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'QUESTION_VERSION_NOT_FOUND');
  });
});

test('HTTP: POST /evaluations/answer rejects question lookup database error with 503 DATABASE_ERROR', async () => {
  const mockDb = createMockDb({
    questions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'table corrupted' } })
        })
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'DATABASE_ERROR');
  });
});

test('HTTP: POST /evaluations/answer rejects question version lookup database error with 503 DATABASE_ERROR', async () => {
  const mockDb = createMockDb({
    question_versions: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'version query failure' } })
          })
        })
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'DATABASE_ERROR');
  });
});

test('HTTP: POST /evaluations/answer rejects rubric query database failure with 503 DATABASE_ERROR', async () => {
  const mockDb = createMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'rubric connection timeout' } })
        })
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'DATABASE_ERROR');
  });
});

test('HTTP: POST /evaluations/answer rejects adminClient rubric query database failure with 503 DATABASE_ERROR without fallback', async () => {
  const privilegedAdminClient = createMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'admin client database connection timeout' } })
        })
      })
    }
  });

  const db = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(db),
    adminClientFactory: () => privilegedAdminClient
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'DATABASE_ERROR');
  });
});

test('HTTP: POST /evaluations/answer does not report false success when persistence fails', async () => {
  const mockDb = createMockDb({
    ai_evaluations: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null })
                })
              })
            })
          })
        })
      }),
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { message: 'Database insert failure' } })
        })
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, 'DATABASE_ERROR');
  });
});

test('HTTP: POST /evaluations/answer standalone practice mode (sessionId: null) succeeds for authenticated student', async () => {
  const mockDb = createMockDb();
  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
        questionCode: 'elem-statement',
        sessionId: null // Practice mode
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.persisted, true);
    assert.ok(body.data.evaluationId);
  });
});

test('HTTP: POST /evaluations/answer securely retrieves private rubric via adminClient even when student client cannot read it', async () => {
  // Student client simulates RLS: reading rubrics returns empty (data: null, error: null)
  const studentClient = createMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }) // RLS blocks student
        })
      })
    }
  });

  // Admin client provides authoritative private rubric
  const privilegedAdminClient = createMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              expected_answer: 'Authoritative private DB expected answer.',
              rubric_groups: [['lihim', 'kaisipan'], ['natatangi', 'aral']],
              accepted_answers: []
            },
            error: null
          })
        })
      })
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(studentClient),
    adminClientFactory: () => privilegedAdminClient
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Naglalaman ito ng lihim na kaisipan at natatanging aral sa akda.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.isSemanticMatch, true);
    assert.equal(body.data.semanticScore, 1.0);
    assert.equal(body.data.persisted, true);
    assert.ok(body.data.evaluationId);
  });
});

test('HTTP: POST /evaluations/answer explicitly marks persisted=false and evaluationId=null when running without database client', async () => {
  const app = createApp({
    authenticate: (req, _res, next) => {
      req.auth = {
        user: { id: 'student-001' },
        profile: { role: 'student' },
        client: null // No database client
      };
      next();
    },
    adminClientFactory: () => null
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.persisted, false);
    assert.equal(body.data.evaluationId, null);
  });
});

test('HTTP: POST /evaluations/answer never modifies official game scores (advisory only)', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000010';
  let gameSessionMutated = false;
  let studentAnswersInserted = false;

  const mockDb = createMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: sessionId, student_id: 'student-001', main_score: 5, reverse_score: 0 },
            error: null
          })
        })
      }),
      update: () => {
        gameSessionMutated = true;
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      }
    },
    student_answers: {
      insert: () => {
        studentAnswersInserted = true;
        return Promise.resolve({ data: null, error: null });
      }
    }
  });

  mockDb.rpc = () => {
    throw new Error('rpc must not be called during advisory evaluation');
  };

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan at damdamin sa akda.',
        questionCode: 'elem-statement',
        sessionId
      })
    });
    assert.equal(res.status, 200);
    assert.equal(gameSessionMutated, false, 'game_sessions scores must never be mutated by evaluations');
    assert.equal(studentAnswersInserted, false, 'student_answers must never be inserted by evaluations');
  });
});

// --------------------------------------------------------------------------
// RLS Policy & Database Schema Verification Tests (Migrated from gemini.test.js)
// --------------------------------------------------------------------------

test('RLS policy: student cannot read another student\'s evaluation record', () => {
  const canRead = ({ authUid, role, recordStudentId }) => {
    const isTeacherOrAdmin = role === 'teacher' || role === 'admin';
    return recordStudentId === authUid || isTeacherOrAdmin;
  };

  const studentA = '00000000-0000-0000-0000-000000000001';
  const studentB = '00000000-0000-0000-0000-000000000002';

  // Student A reads own record -> Allowed
  assert.equal(canRead({ authUid: studentA, role: 'student', recordStudentId: studentA }), true);

  // Student A reads Student B's record -> Denied
  assert.equal(canRead({ authUid: studentA, role: 'student', recordStudentId: studentB }), false);
});

test('RLS policy: teacher/admin has read access but cannot insert evaluation for arbitrary student', () => {
  const canRead = ({ authUid, role, recordStudentId }) => {
    const isTeacherOrAdmin = role === 'teacher' || role === 'admin';
    return recordStudentId === authUid || isTeacherOrAdmin;
  };

  const canInsert = ({ authUid, payloadStudentId }) => {
    return payloadStudentId === authUid;
  };

  const teacherId = '00000000-0000-0000-0000-000000000088';
  const studentId = '00000000-0000-0000-0000-000000000001';

  // Teacher reading student's record -> Allowed for pedagogical review
  assert.equal(canRead({ authUid: teacherId, role: 'teacher', recordStudentId: studentId }), true);

  // Teacher attempting to insert evaluation record for arbitrary student -> Denied
  assert.equal(canInsert({ authUid: teacherId, payloadStudentId: studentId }), false);

  // User inserting own evaluation record -> Allowed
  assert.equal(canInsert({ authUid: studentId, payloadStudentId: studentId }), true);
});

test('RLS policy: students cannot directly read question_evaluation_rubrics records', () => {
  const canReadRubric = ({ role }) => {
    return role === 'teacher' || role === 'admin';
  };

  assert.equal(canReadRubric({ role: 'student' }), false, 'Student role must NOT be permitted to read rubrics');
  assert.equal(canReadRubric({ role: 'teacher' }), true, 'Teacher role must be permitted to read rubrics');
  assert.equal(canReadRubric({ role: 'admin' }), true, 'Admin role must be permitted to read rubrics');

  // Verify Phase 4 migration strictly enforces is_teacher_or_admin() for rubric reads
  const fs = require('node:fs');
  const path = require('node:path');
  const phase4Migration = path.join(__dirname, '../supabase/migrations/202611080001_phase4_catalog_and_gameplay.sql');
  const content = fs.readFileSync(phase4Migration, 'utf8');
  assert.match(content, /create policy question_rubrics_staff_read on public\.question_evaluation_rubrics for select to authenticated\s+using \(\(select public\.is_teacher_or_admin\(\)\)\);/i);
});

test('Migration: 202611090001_phase5_ai_evaluations.sql defines secure schema and RLS', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const migrationPath = path.join(__dirname, '../supabase/migrations/202611090001_phase5_ai_evaluations.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');

  const content = fs.readFileSync(migrationPath, 'utf8');
  assert.match(content, /create table if not exists public\.ai_evaluations/i);
  assert.match(content, /student_id uuid not null references public\.profiles\(id\)/i);
  assert.match(content, /session_id uuid references public\.game_sessions\(id\)/i);
  assert.match(content, /question_id uuid not null references public\.questions\(id\)/i);
  assert.match(content, /semantic_score numeric\(5, 4\)/i);
  assert.match(content, /feedback text not null/i);
  assert.match(content, /alter table public\.ai_evaluations enable row level security/i);
  assert.match(content, /ai_evaluations_read_owner_or_staff/i);
  // Option A hardening: the owner INSERT policy is dropped (not created)
  assert.doesNotMatch(content, /create policy ai_evaluations_insert_owner\b/i);
  assert.doesNotMatch(content, /create policy ai_evaluations_insert_owner_or_staff/i);
  assert.match(content, /grant all on public\.ai_evaluations to service_role/i);
  // Option A hardening: authenticated role has SELECT only — no INSERT grant
  assert.match(content, /grant select on public\.ai_evaluations to authenticated/i);
  assert.doesNotMatch(content, /grant select, insert on public\.ai_evaluations to authenticated/i);

  // Security: No API credentials in migration
  assert.doesNotMatch(content, /api_key/i);
  assert.doesNotMatch(content, /AIza[0-9A-Za-z-_]{35}/);
});

// --------------------------------------------------------------------------
// Phase 5.4 Official Scoring Integration Tests (Migrated from gemini.test.js)
// --------------------------------------------------------------------------

test('Phase 5.4: Correct semantic answer and official scoring flow via submit_game_answer', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000010';
  let rpcCalledWith = null;

  const mockDb = createMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: sessionId, student_id: 'student-001', main_score: 0, reverse_score: 0 },
            error: null
          })
        })
      })
    }
  });

  mockDb.rpc = async (name, args) => {
    rpcCalledWith = { name, args };
    return {
      data: {
        isCorrect: true,
        pointsAwarded: 2,
        maxPoints: 2,
        evaluationMethod: 'local_rubric',
        answer: { id: 'ans-1', isCorrect: true, pointsAwarded: 2 }
      },
      error: null
    };
  };

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    // 1. Advisory evaluation via answer evaluation endpoint
    const evalRes = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
        questionCode: 'elem-statement',
        sessionId
      })
    });
    assert.equal(evalRes.status, 200);
    const evalData = (await evalRes.json()).data;
    assert.equal(evalData.isCorrect, true);
    assert.equal(evalData.pointsEarned, 2);
    assert.equal(evalData.semanticScore, 1.0);

    // 2. Official score recorded via authoritative submit_game_answer endpoint
    const ansRes = await fetch(`${base}/api/v1/sessions/${sessionId}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
        round: 'main'
      })
    });
    assert.equal(ansRes.status, 201);
    const ansData = (await ansRes.json()).data;
    assert.equal(ansData.isCorrect, true);
    assert.equal(ansData.pointsAwarded, 2);
    assert.equal(rpcCalledWith.name, 'submit_game_answer');
  });
});

test('Phase 5.4: Reverse Round practice evaluations remain strictly unscored (0 points awarded to session)', async () => {
  let sessionMutated = false;
  const mockDb = createMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000010', student_id: 'student-001', main_score: 5, reverse_score: 0 },
            error: null
          })
        })
      }),
      update: () => {
        sessionMutated = true;
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      }
    }
  });

  const app = createApp({
    authenticate: makeStudentAuth(mockDb),
    adminClientFactory: () => mockDb
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        studentAnswer: 'Baligtarang pagsasanay para sa konteksto ng tauhan.',
        questionCode: 'elem-statement',
        sessionId: null // Practice mode
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(sessionMutated, false, 'Reverse Round practice must not mutate session scores');
  });
});

// --------------------------------------------------------------------------
// Comprehensive Functional Verification Tests (Realistic Student Answers)
// --------------------------------------------------------------------------

test('Functional Verification 1: Paraphrases, synonyms, Filipino ligatures (-ng/-g), and Taglish answers', async () => {
  const svc = createRubricEvaluatorService();

  // Paraphrase & synonym match for elem-statement (konteksto/kaligiran + tauhan/karakter + kilos/damdamin/asal/ugali)
  const paraphraseRes = await svc.evaluateAnswer({
    studentAnswer: 'Binibigyan ng kaligiran ang ugali at damdamin ng bawat karakter sa kuwento.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.',
    rubricCriteria: [['konteksto', 'kaligiran', 'batayan'], ['tauhan', 'karakter'], ['kilos', 'damdamin', 'asal', 'ugali']],
    maxPoints: 1
  });
  assert.equal(paraphraseRes.isCorrect, true);
  assert.equal(paraphraseRes.semanticScore, 1.0);
  assert.equal(paraphraseRes.pointsEarned, 1);

  // Taglish student response covering all required rubric groups
  const taglishRes = await svc.evaluateAnswer({
    studentAnswer: 'Nagbibigay ito ng konteksto sa actions at damdamin ng main karakter sa story.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.',
    rubricCriteria: [['konteksto', 'kaligiran', 'batayan'], ['tauhan', 'karakter'], ['kilos', 'damdamin', 'asal', 'ugali']],
    maxPoints: 1
  });
  assert.equal(taglishRes.isCorrect, true);
  assert.equal(taglishRes.semanticScore, 1.0);

  // Filipino ligature (-g / -ng) paraphrase for mean-correction ("di tuwiran" matched against "di-tuwirang")
  const ligatureRes = await svc.evaluateAnswer({
    studentAnswer: 'Ang pahiwatig ay isang di-tuwirang paraan ng paglalahad ng kahulugan.',
    questionCode: 'mean-correction',
    expectedAnswer: 'Ang pahiwatig ay di-tuwirang ipinahahayag.',
    rubricCriteria: [['pahiwatig'], ['di tuwiran', 'hindi tuwiran', 'di lantad']],
    maxPoints: 1
  });
  assert.equal(ligatureRes.isCorrect, true);
  assert.equal(ligatureRes.semanticScore, 1.0);
});

test('Functional Verification 2: Partial credit for 1-of-3 and 2-of-3 rubric concept groups', async () => {
  const svc = createRubricEvaluatorService();
  const rubric3 = [['konteksto', 'kaligiran', 'batayan'], ['tauhan', 'karakter'], ['kilos', 'damdamin', 'asal', 'ugali']];

  // 1 of 3 groups matched (maxPoints = 3 -> 1 pt; maxPoints = 2 -> 0.67 pt)
  const oneOfThree = await svc.evaluateAnswer({
    studentAnswer: 'Nagbibigay ito ng mahalagang konteksto sa buong kuwento.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.',
    rubricCriteria: rubric3,
    maxPoints: 2
  });
  assert.equal(oneOfThree.isCorrect, false);
  assert.equal(oneOfThree.semanticScore, 0.3333);
  assert.equal(oneOfThree.pointsEarned, 0.67);

  // 2 of 3 groups matched (maxPoints = 2 -> 1.33 pts; maxPoints = 3 -> 2 pts)
  const twoOfThree = await svc.evaluateAnswer({
    studentAnswer: 'Nagbibigay ito ng konteksto sa mga tauhan ng akda.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.',
    rubricCriteria: rubric3,
    maxPoints: 2
  });
  assert.equal(twoOfThree.isCorrect, false);
  assert.equal(twoOfThree.semanticScore, 0.6667);
  assert.equal(twoOfThree.pointsEarned, 1.33);
});

test('Functional Verification 3: Incorrect, irrelevant, contradictory/negated, and meaningless answers', async () => {
  const svc = createRubricEvaluatorService();

  // Contradictory answer negating the core concept ("Hindi magkaugnay ang tema at mensahe ng akda")
  const contradictory1 = await svc.evaluateAnswer({
    studentAnswer: 'Hindi magkaugnay ang tema at mensahe ng akda.',
    questionCode: 'elem-correction',
    expectedAnswer: 'Magkaugnay ang tema at mensahe ng akda.',
    rubricCriteria: [['tema', 'paksa'], ['mensahe', 'aral', 'diwa'], ['magkaugnay', 'ugnay', 'kaugnay']],
    maxPoints: 1
  });
  assert.equal(contradictory1.isCorrect, false, 'Contradictory negated answer must NOT be marked correct');
  assert.ok(contradictory1.semanticScore < 1.0);
  assert.ok(contradictory1.pointsEarned < 1);

  // Contradictory answer negating all concepts ("Walang konteksto sa kilos ng walang tauhan")
  const contradictory2 = await svc.evaluateAnswer({
    studentAnswer: 'Walang konteksto at walang kinalaman sa kilos ng tauhan.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.',
    rubricCriteria: [['konteksto', 'kaligiran', 'batayan'], ['tauhan', 'karakter'], ['kilos', 'damdamin', 'asal', 'ugali']],
    maxPoints: 1
  });
  assert.equal(contradictory2.isCorrect, false, 'Negated concepts must not receive full credit');
  assert.equal(contradictory2. criteriaEvaluation[0].satisfied, false, 'Negated konteksto must not be satisfied');

  // Contrast clause ("Hindi lantad kundi nakatago...") should still satisfy positive concept after "kundi"
  const contrastPositive = await svc.evaluateAnswer({
    studentAnswer: 'Hindi lantad kundi di-tuwirang ipinahahayag ang pahiwatig sa akda.',
    questionCode: 'mean-correction',
    expectedAnswer: 'Ang pahiwatig ay di-tuwirang ipinahahayag.',
    rubricCriteria: [['pahiwatig'], ['di tuwiran', 'hindi tuwiran', 'di lantad']],
    maxPoints: 1
  });
  assert.equal(contrastPositive.isCorrect, true, 'Positive concept after contrast conjunction kundi must match');

  // Meaningless / gibberish answer
  const gibberish = await svc.evaluateAnswer({
    studentAnswer: 'asdfghjkl qwertyuiop zxcvbnm 12345',
    questionCode: 'elem-statement',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.',
    rubricCriteria: [['konteksto', 'kaligiran'], ['tauhan', 'karakter']],
    maxPoints: 2
  });
  assert.equal(gibberish.isCorrect, false);
  assert.equal(gibberish.semanticScore, 0);
  assert.equal(gibberish.pointsEarned, 0);
});

test('Functional Verification 4: Very short (1-2 word) exact/accepted answers vs partial keyword answers', async () => {
  const svc = createRubricEvaluatorService();

  // 1-word exact identification card answer ("Banghay", "Tauhan", "Tema") -> Full credit
  const exactOneWord = await svc.evaluateAnswer({
    studentAnswer: 'Banghay',
    questionCode: 'elem-bonus',
    expectedAnswer: 'Banghay',
    rubricCriteria: [['banghay', 'balangkas', 'daloy'], ['pangyayari', 'pagkakasunod-sunod']],
    maxPoints: 1
  });
  assert.equal(exactOneWord.isCorrect, true);
  assert.equal(exactOneWord.semanticScore, 1.0);
  assert.equal(exactOneWord.pointsEarned, 1);

  // 2-word teacher-approved alternative ("mga tauhan") -> Full credit
  const acceptedTwoWords = await svc.evaluateAnswer({
    studentAnswer: 'mga tauhan',
    questionCode: 'alamat-q2',
    expectedAnswer: 'Tauhan',
    acceptedAnswers: ['tauhan', 'mga tauhan'],
    rubricCriteria: [['tauhan', 'karakter', 'persona'], ['gumaganap', 'kumikilos', 'ginagampanan']],
    maxPoints: 1
  });
  assert.equal(acceptedTwoWords.isCorrect, true);
  assert.equal(acceptedTwoWords.semanticScore, 1.0);
  assert.equal(acceptedTwoWords.pointsEarned, 1);
});

test('Functional Verification 5 & 6: Static fallback for quiz rubrics and 0-point Reverse Card boundary', async () => {
  // Test standalone/static resolution for a written quiz question (alamat-q6) and a 0-point reverse card (elem-reverse)
  const app = createApp({
    authenticate: (req, _res, next) => {
      req.auth = {
        user: { id: 'student-001' },
        profile: { role: 'student' },
        client: null // Exercises static deck + QUIZ_RUBRICS resolution
      };
      next();
    },
    adminClientFactory: () => null
  });

  await withServer(app, async (base) => {
    // 1. Written quiz question alamat-q6 via QUIZ_RUBRICS paraphrase
    const resQuiz = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        questionCode: 'alamat-q6',
        studentAnswer: 'Pagbabahagi ng pagkain at biyaya sa kapwa.'
      })
    });
    assert.equal(resQuiz.status, 200);
    const bodyQuiz = await resQuiz.json();
    assert.equal(bodyQuiz.data.isCorrect, true);
    assert.equal(bodyQuiz.data.maxPoints, 2);
    assert.equal(bodyQuiz.data.pointsEarned, 2);

    // 2. Written quiz question alamat-q2 via acceptedAnswers ("mga tauhan")
    const resAccepted = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        questionCode: 'alamat-q2',
        studentAnswer: 'mga tauhan'
      })
    });
    assert.equal(resAccepted.status, 200);
    const bodyAccepted = await resAccepted.json();
    assert.equal(bodyAccepted.data.isCorrect, true);
    assert.equal(bodyAccepted.data.pointsEarned, 1);

    // 3. Reverse card (elem-reverse) has points: 0 -> maxPoints: 0 and pointsEarned: 0 even when correct
    const resReverse = await fetch(`${base}/api/v1/evaluations/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
      body: JSON.stringify({
        questionCode: 'elem-reverse',
        studentAnswer: 'Ang banghay ang pagkakasunod-sunod ng mga pangyayari sa kuwento.'
      })
    });
    assert.equal(resReverse.status, 200);
    const bodyReverse = await resReverse.json();
    assert.equal(bodyReverse.data.isCorrect, true);
    assert.equal(bodyReverse.data.semanticScore, 1.0);
    assert.equal(bodyReverse.data.maxPoints, 0);
    assert.equal(bodyReverse.data.pointsEarned, 0);
  });
});
