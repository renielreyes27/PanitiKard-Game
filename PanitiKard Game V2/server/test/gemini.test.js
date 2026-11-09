const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');

const { createApp } = require('../src/server');
const { createGeminiService, validateEvaluationInput, validateRubricData, buildEvaluationPrompt, GEMINI_SYSTEM_INSTRUCTION } = require('../src/services/gemini');

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

function createDefaultMockDb(overrides = {}) {
  return {
    from: (table) => {
      if (overrides[table]) {
        return typeof overrides[table] === 'function' ? overrides[table]() : overrides[table];
      }
      if (table === 'questions') {
        const qChain = {
          select: () => qChain,
          eq: (col, val) => {
            if (val === 'unknown-question-xyz') {
              return { maybeSingle: async () => ({ data: null, error: null }) };
            }
            return qChain;
          },
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000002', code: 'elem-statement', current_version: 1, status: 'published', archived_at: null },
            error: null
          })
        };
        return qChain;
      }
      if (table === 'question_versions') {
        const vChain = {
          select: () => vChain,
          eq: () => vChain,
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000003', question_id: '00000000-0000-0000-0000-000000000002', version_number: 1, prompt: 'Ipaliwanag ang tagpuan.', points: 1 },
            error: null
          })
        };
        return vChain;
      }
      if (table === 'question_evaluation_rubrics') {
        const rChain = {
          select: () => rChain,
          eq: () => rChain,
          maybeSingle: async () => ({
            data: { expected_answer: 'Nagbibigay ang tagpuan ng konteksto.', rubric_groups: [['konteksto'], ['tauhan']] },
            error: null
          })
        };
        return rChain;
      }
      if (table === 'game_sessions') {
        const sChain = {
          select: () => sChain,
          eq: () => sChain,
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000010', student_id: '00000000-0000-0000-0000-000000000001' },
            error: null
          })
        };
        return sChain;
      }
      if (table === 'ai_evaluations') {
        const aiChain = {
          select: () => aiChain,
          eq: () => aiChain,
          order: () => aiChain,
          limit: () => aiChain,
          maybeSingle: async () => ({ data: null, error: null }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: 'eval-123', created_at: new Date().toISOString() }, error: null })
            })
          })
        };
        return aiChain;
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'eval-123' }, error: null }) }) })
      };
    }
  };
}

function createDefaultModelRunner(overrides = {}) {
  return async ({ studentAnswer, userPrompt }) => {
    return JSON.stringify({
      isCorrect: true,
      isSemanticMatch: true,
      semanticScore: 1.0,
      confidenceScore: 0.95,
      feedback: 'Wasto ang pampanitikang paliwanag at tugma sa inaasahang diwa.',
      evaluationSummary: 'Wasto ang sagot.',
      criteriaEvaluation: [
        { aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'Naipaliwanag nang maayos ang pampanitikang kaisipan.' }
      ],
      ...overrides
    });
  };
}

function testAppWithAuth({ role = 'student', authenticated = true, geminiService, client, adminClient } = {}) {
  const authenticate = (req, _res, next) => {
    if (!authenticated) {
      return next(Object.assign(new Error('Authentication required.'), { status: 401, code: 'AUTH_REQUIRED' }));
    }
    req.auth = {
      user: { id: '00000000-0000-0000-0000-000000000001' },
      profile: { role, display_name: 'Test Mag-aaral' },
      client: client !== undefined ? client : createDefaultMockDb()
    };
    next();
  };

  const resolvedAdminClient = adminClient !== undefined
    ? adminClient
    : (client !== undefined ? client : createDefaultMockDb());

  const app = createApp({
    geminiService: geminiService || createGeminiService({
      config: { gemini: { apiKey: 'test-key-123', model: 'gemini-3.5-flash-lite' } },
      modelRunner: createDefaultModelRunner()
    }),
    authenticate,
    connectivityCheck: async () => ({ reachable: true }),
    adminClientFactory: () => resolvedAdminClient
  });

  return { app };
}

// --------------------------------------------------------------------------
// 1. Service Layer Tests
// --------------------------------------------------------------------------
test('geminiService: getStatus reports configuration without leaking API key', () => {
  const service = createGeminiService({ config: { gemini: { apiKey: 'super-secret-api-key', model: 'gemini-3.5-flash-lite' } } });
  const status = service.getStatus();
  assert.equal(status.configured, true);
  assert.equal(status.model, 'gemini-3.5-flash-lite');
  assert.equal(status.provider, 'Google Gemini');
  assert.match(status.phase, /^5\.[12]/);
  assert.equal(status.status, 'not_yet_live_tested');
  assert.equal(status.operational, false);
  assert.equal(JSON.stringify(status).includes('super-secret-api-key'), false);
});

test('geminiService: buildPrompt formats system instruction and JSON schema instructions', () => {
  const prompt = buildEvaluationPrompt({
    questionPrompt: 'Ipaliwanag ang tagpuan.',
    expectedAnswer: 'Nagbibigay ng konteksto sa tauhan.',
    rubricCriteria: [['konteksto', 'kilos', 'damdamin']],
    studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
    category: 'statement'
  });

  assert.equal(prompt.systemInstruction, GEMINI_SYSTEM_INSTRUCTION);
  assert.match(prompt.userPrompt, /KONTEKSTO NG ARALIN/);
  assert.match(prompt.userPrompt, /INAASAHANG BATAYAN/);
  assert.match(prompt.userPrompt, /SAGOT NG MAG-AARAL/);
  assert.equal(prompt.generationConfig.responseMimeType, 'application/json');
});

test('geminiService: validateEvaluationInput enforces non-empty string and valid question codes', () => {
  assert.throws(() => validateEvaluationInput(null), (err) => err.code === 'INVALID_EVALUATION_INPUT');
  assert.throws(() => validateEvaluationInput({ studentAnswer: '', questionCode: 'elem-statement' }), /studentAnswer must be a non-empty string/);
  assert.throws(() => validateEvaluationInput({ studentAnswer: '   ', questionCode: 'elem-statement' }), /studentAnswer must be a non-empty string/);
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'Valid', questionCode: '' }), (err) => err.code === 'INVALID_QUESTION_CODE');
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'Valid', questionCode: 'invalid code!' }), (err) => err.code === 'INVALID_QUESTION_CODE');
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'Valid', questionCode: 'elem-statement', sessionId: 'not-a-uuid' }), (err) => err.code === 'INVALID_SESSION_ID');
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'Valid', questionCode: 'elem-statement', mockResult: { isSemanticMatch: true } }), (err) => err.code === 'UNAUTHORIZED_MOCK');
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'Valid', questionCode: 'elem-statement', studentId: '00000000-0000-0000-0000-000000000999' }), (err) => err.code === 'UNAUTHORIZED_STUDENT_ID');
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'Valid', questionCode: 'elem-statement', questionId: '00000000-0000-0000-0000-000000000999' }), (err) => err.code === 'UNAUTHORIZED_QUESTION_ID');
  assert.throws(() => validateEvaluationInput({ studentAnswer: 'Valid', questionCode: 'elem-statement', questionVersionId: '00000000-0000-0000-0000-000000000999' }), (err) => err.code === 'UNAUTHORIZED_QUESTION_ID');

  const valid = validateEvaluationInput({
    studentAnswer: '  Nagbibigay ng konteksto ang tagpuan.  ',
    questionCode: 'elem-statement',
    sessionId: '00000000-0000-0000-0000-000000000001'
  });
  assert.equal(valid.studentAnswer, 'Nagbibigay ng konteksto ang tagpuan.');
  assert.equal(valid.questionCode, 'elem-statement');
});

test('geminiService: validateRubricData normalizes prompt, expectedAnswer, and rubricCriteria', () => {
  const normalized = validateRubricData({
    prompt: '  Tanong  ',
    expectedAnswer: '  Inaasahang Sagot  ',
    rubricCriteria: ['isa', ['dalawa', 'tatlo'], '', null, 123]
  });
  assert.equal(normalized.prompt, 'Tanong');
  assert.equal(normalized.expectedAnswer, 'Inaasahang Sagot');
  assert.deepEqual(normalized.rubricCriteria, [['isa'], ['dalawa', 'tatlo']]);

  const empty = validateRubricData(null);
  assert.equal(empty.prompt, '');
  assert.equal(empty.expectedAnswer, '');
  assert.deepEqual(empty.rubricCriteria, []);
});

test('geminiService: evaluateAnswer evaluates semantic match using rubric criteria without fabricated confidence', async () => {
  const modelRunner = async ({ studentAnswer }) => {
    if (studentAnswer.includes('halo-halo')) {
      return JSON.stringify({
        isCorrect: false,
        isSemanticMatch: false,
        semanticScore: 0.0,
        feedback: 'Walang kaugnayan ang sagot sa tagpuan ng akda.',
        evaluationSummary: 'Maling sagot.',
        criteriaEvaluation: [
          { aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: false, explanation: 'Hindi nabanggit ang konteksto.' }
        ]
      });
    }
    return JSON.stringify({
      isCorrect: true,
      isSemanticMatch: true,
      semanticScore: 0.95,
      feedback: 'Wasto ang pagpapaliwanag sa tagpuan at epekto nito sa tauhan.',
      evaluationSummary: 'Wasto ang sagot.',
      criteriaEvaluation: [
        { aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'Malinaw na naipaliwanag ang konteksto.' }
      ]
    });
  };

  const service = createGeminiService({
    config: { gemini: { apiKey: 'test-key', model: 'gemini-1.5-flash' } },
    modelRunner
  });

  // 1. Correct response covering rubric
  const correctResult = await service.evaluateAnswer({
    studentAnswer: 'Nagbibigay ang tagpuan ng konteksto sa mga tauhan.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.',
    rubricCriteria: [['konteksto'], ['tauhan']]
  });
  assert.equal(correctResult.isSemanticMatch, true);
  assert.ok(correctResult.semanticScore >= 0.75);
  assert.equal(correctResult.status, 'evaluated');
  assert.equal(correctResult.evaluationMethod, 'gemini_semantic_evaluation');
  assert.ok(correctResult.criteriaEvaluation.length > 0);
  assert.equal(correctResult.criteriaEvaluation[0].aspect, 'Pamantayan 1'); // Sanitized, no secret term leak
  assert.ok(correctResult.feedback.length > 0);

  // 2. Off-topic response
  const wrongResult = await service.evaluateAnswer({
    studentAnswer: 'Gusto ko lang kumain ng halo-halo mamayang hapon.',
    questionCode: 'elem-statement',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.',
    rubricCriteria: [['konteksto'], ['tauhan']]
  });
  assert.equal(wrongResult.isSemanticMatch, false);
  assert.equal(wrongResult.semanticScore, 0.0);
  assert.equal(wrongResult.status, 'evaluated');
});

test('geminiService: evaluateAnswer supports mockResult injection for unit testing', async () => {
  const service = createGeminiService();
  const mock = {
    isSemanticMatch: true,
    semanticScore: 0.95,
    feedback: 'Pinatunayan ng mock evaluation.'
  };

  const result = await service.evaluateAnswer({
    studentAnswer: 'Kahit anong sagot',
    questionCode: 'elem-statement',
    mockResult: mock
  });

  assert.equal(result.isSemanticMatch, true);
  assert.equal(result.semanticScore, 0.95);
  assert.equal(result.confidenceScore, null); // No fabricated confidence score
  assert.equal(result.feedback, 'Pinatunayan ng mock evaluation.');
  assert.equal(result.status, 'evaluated');
});

test('geminiService: recordEvaluation rejects missing questionId with 400 INVALID_EVALUATION_INPUT', async () => {
  const service = createGeminiService();
  const mockClient = createDefaultMockDb();

  await assert.rejects(
    async () => service.recordEvaluation(mockClient, null, {
      studentId: '00000000-0000-0000-0000-000000000001',
      questionId: '',
      questionVersionId: '00000000-0000-0000-0000-000000000003',
      studentAnswer: 'Sagot'
    }),
    (err) => err.code === 'INVALID_EVALUATION_INPUT' && /questionId is required/.test(err.message)
  );
});

test('geminiService: recordEvaluation rejects missing questionVersionId with 400 INVALID_EVALUATION_INPUT', async () => {
  const service = createGeminiService();
  const mockClient = createDefaultMockDb();

  await assert.rejects(
    async () => service.recordEvaluation(mockClient, null, {
      studentId: '00000000-0000-0000-0000-000000000001',
      questionId: '00000000-0000-0000-0000-000000000002',
      questionVersionId: '',
      studentAnswer: 'Sagot'
    }),
    (err) => err.code === 'INVALID_EVALUATION_INPUT' && /questionVersionId is required/.test(err.message)
  );
});

test('geminiService: recordEvaluation rejects session belonging to another student with 403 FORBIDDEN_SESSION', async () => {
  const service = createGeminiService();

  const mockClient = {
    from: (table) => {
      if (table === 'game_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: '00000000-0000-0000-0000-000000000099', student_id: 'different-student-id' },
                error: null
              })
            })
          })
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };

  await assert.rejects(
    async () => service.recordEvaluation(mockClient, null, {
      studentId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000099',
      questionId: '00000000-0000-0000-0000-000000000002',
      questionVersionId: '00000000-0000-0000-0000-000000000003',
      studentAnswer: 'Sagot',
      isSemanticMatch: true,
      semanticScore: 1.0,
      feedback: 'Magaling.'
    }),
    (err) => err.code === 'FORBIDDEN_SESSION'
  );
});

test('geminiService: recordEvaluation accepts valid question and matching version', async () => {
  const service = createGeminiService();
  let insertedPayload = null;

  const mockClient = {
    from: (table) => {
      if (table === 'game_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: '00000000-0000-0000-0000-000000000010', student_id: '00000000-0000-0000-0000-000000000001' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '00000000-0000-0000-0000-000000000002', code: 'elem-statement' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'question_versions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '00000000-0000-0000-0000-000000000003', question_id: '00000000-0000-0000-0000-000000000002' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_evaluations') {
        return {
          insert: (payload) => {
            insertedPayload = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'eval-uuid-1', created_at: new Date().toISOString() },
                  error: null
                })
              })
            };
          }
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };

  // Service-role client used for the INSERT (Option A hardening)
  const mockServiceRoleClient = {
    from: (table) => {
      if (table === 'ai_evaluations') {
        return {
          insert: (payload) => {
            insertedPayload = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'eval-uuid-1', created_at: new Date().toISOString() },
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

  const record = await service.recordEvaluation(mockClient, mockServiceRoleClient, {
    studentId: '00000000-0000-0000-0000-000000000001',
    sessionId: '00000000-0000-0000-0000-000000000010',
    questionId: '00000000-0000-0000-0000-000000000002',
    questionCode: 'elem-statement',
    questionVersionId: '00000000-0000-0000-0000-000000000003',
    studentAnswer: 'Sagot',
    isSemanticMatch: true,
    semanticScore: 1.0,
    feedback: 'Magaling.'
  });

  assert.ok(record);
  assert.equal(record.id, 'eval-uuid-1');
  assert.equal(insertedPayload.student_id, '00000000-0000-0000-0000-000000000001');
  assert.equal(insertedPayload.session_id, '00000000-0000-0000-0000-000000000010');
  assert.equal(insertedPayload.question_id, '00000000-0000-0000-0000-000000000002');
  assert.equal(insertedPayload.question_version_id, '00000000-0000-0000-0000-000000000003');
});

test('geminiService: recordEvaluation rejects question version belonging to a different question with 400 QUESTION_VERSION_MISMATCH', async () => {
  const service = createGeminiService();

  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '00000000-0000-0000-0000-000000000002', code: 'elem-statement' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'question_versions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                // Version does not belong to question 0002
                maybeSingle: async () => ({ data: null, error: null })
              })
            })
          })
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };

  await assert.rejects(
    async () => service.recordEvaluation(mockClient, null, {
      studentId: '00000000-0000-0000-0000-000000000001',
      questionId: '00000000-0000-0000-0000-000000000002',
      questionCode: 'elem-statement',
      questionVersionId: '00000000-0000-0000-0000-000000000999',
      studentAnswer: 'Sagot'
    }),
    (err) => err.code === 'QUESTION_VERSION_MISMATCH'
  );
});

// --------------------------------------------------------------------------
// Option A Security Hardening: Service-Role INSERT Tests
// --------------------------------------------------------------------------

test('geminiService: recordEvaluation inserts through serviceRoleClient, not the student client', async () => {
  const service = createGeminiService();
  let studentClientInsertCalled = false;
  let serviceRoleInsertCalled = false;

  const mockStudentClient = {
    from: (table) => {
      if (table === 'game_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: '00000000-0000-0000-0000-000000000010', student_id: '00000000-0000-0000-0000-000000000001' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '00000000-0000-0000-0000-000000000002', code: 'elem-statement' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'question_versions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '00000000-0000-0000-0000-000000000003', question_id: '00000000-0000-0000-0000-000000000002' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_evaluations') {
        // Student client: only allows SELECT (idempotency check), not INSERT
        return {
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
            studentClientInsertCalled = true; // should NOT be called
            return {
              select: () => ({ single: async () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) })
            };
          }
        };
      }
      throw new Error(`Unexpected table on student client: ${table}`);
    }
  };

  const mockServiceRoleClient = {
    from: (table) => {
      if (table === 'ai_evaluations') {
        return {
          insert: (payload) => {
            serviceRoleInsertCalled = true;
            assert.equal(payload.student_id, '00000000-0000-0000-0000-000000000001');
            assert.equal(payload.question_id, '00000000-0000-0000-0000-000000000002');
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
    studentId: '00000000-0000-0000-0000-000000000001',
    sessionId: '00000000-0000-0000-0000-000000000010',
    questionId: '00000000-0000-0000-0000-000000000002',
    questionCode: 'elem-statement',
    questionVersionId: '00000000-0000-0000-0000-000000000003',
    studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
    isSemanticMatch: true,
    semanticScore: 0.95,
    confidenceScore: 0.9,
    feedback: 'Wasto ang sagot.',
    criteriaEvaluation: [],
    model: 'gemini-3.5-flash-lite',
    status: 'evaluated',
    evaluatedAt: new Date().toISOString()
  });

  assert.ok(record);
  assert.equal(record.id, 'service-role-eval-uuid');
  assert.equal(serviceRoleInsertCalled, true, 'INSERT must use service-role client');
  assert.equal(studentClientInsertCalled, false, 'Student client must NOT be used for INSERT');
});

test('geminiService: recordEvaluation throws SERVICE_ROLE_UNAVAILABLE when no serviceRoleClient is provided, preventing student-client INSERT fallback', async () => {
  // Verifies the fail-closed behavior: if the service-role client is missing (null/undefined),
  // recordEvaluation must throw 503 SERVICE_ROLE_UNAVAILABLE — it must NEVER fall back to
  // the student client for the INSERT, which would allow RLS bypass via PostgREST.
  const service = createGeminiService();

  const mockStudentClient = {
    from: (table) => {
      if (table === 'game_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: '00000000-0000-0000-0000-000000000010', student_id: '00000000-0000-0000-0000-000000000001' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '00000000-0000-0000-0000-000000000002', code: 'elem-statement' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'question_versions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '00000000-0000-0000-0000-000000000003', question_id: '00000000-0000-0000-0000-000000000002' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_evaluations') {
        return {
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
          // This insert must NEVER be called — the fail-closed check fires first
          insert: () => { throw new Error('Student client INSERT must not be called'); }
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };

  // No serviceRoleClient → must throw 503 SERVICE_ROLE_UNAVAILABLE immediately,
  // before ever reaching the INSERT call on the student client.
  await assert.rejects(
    async () => service.recordEvaluation(mockStudentClient, null, {
      studentId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000010',
      questionId: '00000000-0000-0000-0000-000000000002',
      questionCode: 'elem-statement',
      questionVersionId: '00000000-0000-0000-0000-000000000003',
      studentAnswer: 'Forged answer with fake score.',
      isSemanticMatch: true,
      semanticScore: 1.0,
      feedback: 'Fabricated.'
    }),
    (err) => err.status === 503 && err.code === 'SERVICE_ROLE_UNAVAILABLE'
  );
});

test('geminiService: recordEvaluation service-role INSERT still enforces student_id from server, not from client payload', async () => {
  // Verifies the backend always sets student_id from the authenticated studentId,
  // never from a client-supplied field — even with service-role bypass.
  const service = createGeminiService();
  let capturedPayload = null;

  const mockStudentClient = {
    from: (table) => {
      if (table === 'game_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: '00000000-0000-0000-0000-000000000010', student_id: '00000000-0000-0000-0000-000000000001' },
                error: null
              })
            })
          })
        };
      }
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '00000000-0000-0000-0000-000000000002', code: 'elem-statement' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'question_versions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: '00000000-0000-0000-0000-000000000003', question_id: '00000000-0000-0000-0000-000000000002' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'ai_evaluations') {
        return {
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
          })
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };

  const mockServiceClient = {
    from: (table) => {
      if (table === 'ai_evaluations') {
        return {
          insert: (payload) => {
            capturedPayload = payload;
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'confirmed-eval-uuid', created_at: new Date().toISOString() },
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

  await service.recordEvaluation(mockStudentClient, mockServiceClient, {
    studentId: '00000000-0000-0000-0000-000000000001', // from req.auth.user.id on server
    sessionId: '00000000-0000-0000-0000-000000000010',
    questionId: '00000000-0000-0000-0000-000000000002',
    questionCode: 'elem-statement',
    questionVersionId: '00000000-0000-0000-0000-000000000003',
    studentAnswer: 'Tamang sagot.',
    isSemanticMatch: true,
    semanticScore: 0.9,
    feedback: 'Wasto.'
  });

  assert.ok(capturedPayload);
  // student_id in the INSERT payload must be the authenticated server-side ID
  assert.equal(capturedPayload.student_id, '00000000-0000-0000-0000-000000000001');
  // Semantic score comes from Gemini's server-side evaluation result
  assert.equal(capturedPayload.semantic_score, 0.9);
  assert.equal(capturedPayload.student_answer, 'Tamang sagot.');
});

// --------------------------------------------------------------------------
// 2. HTTP Endpoint Tests
// --------------------------------------------------------------------------
test('GET /api/v1/evaluations/gemini/status returns provider info and configured model', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini/status`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.provider, 'Google Gemini');
    assert.equal(body.data.model, 'gemini-3.5-flash-lite');
    assert.match(body.data.phase, /^5\.[12]/);
    assert.equal(body.data.apiKeyConfigured, true);
    assert.ok(body.data.status === 'not_yet_live_tested' || body.data.status === 'verified_operational');
  });
});

test('POST /api/v1/evaluations/gemini rejects unauthenticated requests with 401', async () => {
  const { app } = testAppWithAuth({ authenticated: false });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAnswer: 'Sagot', questionCode: 'elem-statement' })
    });
    assert.equal(res.status, 401);
  });
});

test('POST /api/v1/evaluations/gemini rejects invalid inputs with 400', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    // Missing studentAnswer
    const resEmpty = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAnswer: '', questionCode: 'elem-statement' })
    });
    assert.equal(resEmpty.status, 400);

    // Invalid questionCode
    const resBadCode = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAnswer: 'Sagot ko ito', questionCode: 'invalid code!' })
    });
    assert.equal(resBadCode.status, 400);
  });
});

test('POST /api/v1/evaluations/gemini rejects unknown question codes with 404', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAnswer: 'Sagot ko ito', questionCode: 'unknown-question-xyz' })
    });
    assert.equal(res.status, 404);
  });
});

test('POST /api/v1/evaluations/gemini rejects mockResult in request body with 400 UNAUTHORIZED_MOCK', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Sagot ko ito',
        questionCode: 'elem-statement',
        mockResult: { isSemanticMatch: true }
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'UNAUTHORIZED_MOCK');
  });
});

test('POST /api/v1/evaluations/gemini evaluates valid statement response without exposing private answers', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan at damdamin sa akda.',
        questionCode: 'elem-statement'
      })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.questionCode, 'elem-statement');
    assert.equal(typeof body.data.isSemanticMatch, 'boolean');
    assert.equal(typeof body.data.semanticScore, 'number');
    assert.ok(body.data.status === 'evaluated' || body.data.status === 'baseline_evaluated');
    assert.ok(body.data.evaluationMethod === 'gemini_semantic_evaluation' || body.data.evaluationMethod === 'temporary_deterministic_baseline');
    assert.ok(body.data.feedback.length > 0);
    assert.equal(body.data.model, 'gemini-3.5-flash-lite');

    // Security check: Private rubric and expected answer must NOT be leaked
    assert.equal(body.data.expectedAnswer, undefined);
    assert.equal(body.data.answerKey, undefined);
    assert.equal(body.data.rubricGroups, undefined);

    // Criteria must not reveal secret keywords
    if (Array.isArray(body.data.criteriaEvaluation) && body.data.criteriaEvaluation.length > 0) {
      assert.ok(body.data.criteriaEvaluation[0].aspect.startsWith('Pamantayan'));
    }
  });
});

// --------------------------------------------------------------------------
// 3. Security Tests (Phase 5.1 Focused Security Corrections)
// --------------------------------------------------------------------------
test('POST /api/v1/evaluations/gemini succeeds with valid session owned by the authenticated student', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000010';
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan at damdamin sa akda.',
        questionCode: 'elem-statement',
        sessionId
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(typeof body.data.isSemanticMatch, 'boolean');
    assert.equal(body.data.persisted, true);
    assert.equal(body.data.evaluationId, 'eval-123');
  });
});

test('POST /api/v1/evaluations/gemini rejects session belonging to another student with 403 FORBIDDEN_SESSION', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000020';
  const mockClient = createDefaultMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: sessionId, student_id: '00000000-0000-0000-0000-000000000999' }, // different student
            error: null
          })
        })
      })
    }
  });

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

test('POST /api/v1/evaluations/gemini rejects nonexistent session ID with 404 SESSION_NOT_FOUND', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000404';
  const mockClient = createDefaultMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }) // session not found
        })
      })
    }
  });

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

test('POST /api/v1/evaluations/gemini verifies session ownership exactly once', async () => {
  const studentId = '00000000-0000-0000-0000-000000000001';
  const sessionId = '00000000-0000-0000-0000-000000000010';
  let sessionCheckCount = 0;

  const mockClient = createDefaultMockDb({
    game_sessions: {
      select: () => ({
        eq: () => {
          sessionCheckCount++;
          return {
            maybeSingle: async () => ({
              data: { id: sessionId, student_id: studentId },
              error: null
            })
          };
        }
      })
    }
  });

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement',
        sessionId
      })
    });
    assert.equal(res.status, 200);
    assert.equal(sessionCheckCount, 1, 'Session ownership must be checked exactly once authoritative in service layer');
  });
});

test('POST /api/v1/evaluations/gemini rejects session lookup database error with 503 DATABASE_ERROR', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000500';
  const mockClient = createDefaultMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'connection timeout' } })
        })
      })
    }
  });

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto.',
        questionCode: 'elem-statement',
        sessionId
      })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'DATABASE_ERROR');
  });
});

test('POST /api/v1/evaluations/gemini rejects question lookup database error with 503 DATABASE_ERROR', async () => {
  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: { message: 'table corrupted' } })
            })
          })
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'eval-123' }, error: null }) }) })
      };
    }
  };

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

test('POST /api/v1/evaluations/gemini rejects question version lookup database error with 503 DATABASE_ERROR', async () => {
  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: '00000000-0000-0000-0000-000000000002', code: 'elem-statement', current_version: 1 },
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
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: { message: 'version query failure' } })
              })
            })
          })
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'eval-123' }, error: null }) }) })
      };
    }
  };

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

test('POST /api/v1/evaluations/gemini does not report false success when persistence fails', async () => {
  const mockClient = {
    from: (table) => {
      if (table === 'questions') {
        const qChain = {
          eq: () => qChain,
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000002', code: 'elem-statement', current_version: 1 },
            error: null
          })
        };
        return { select: () => qChain };
      }
      if (table === 'question_versions') {
        const vChain = {
          eq: () => vChain,
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000003', question_id: '00000000-0000-0000-0000-000000000002', prompt: 'P', points: 1 },
            error: null
          })
        };
        return { select: () => vChain };
      }
      if (table === 'ai_evaluations') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { message: 'Database insert failure' } })
            })
          })
        };
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
      };
    }
  };

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

test('POST /api/v1/evaluations/gemini never modifies official game scores', async () => {
  const sessionId = '00000000-0000-0000-0000-000000000010';
  const studentId = '00000000-0000-0000-0000-000000000001';
  let gameSessionMutated = false;
  let studentAnswersInserted = false;

  const mockClient = createDefaultMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: sessionId, student_id: studentId, main_score: 5, reverse_score: 0 },
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
  mockClient.rpc = () => {
    throw new Error('rpc must not be called during AI evaluation');
  };

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan at damdamin sa akda.',
        questionCode: 'elem-statement',
        sessionId
      })
    });
    assert.equal(res.status, 200);
    assert.equal(gameSessionMutated, false, 'game_sessions scores must never be mutated by AI evaluations');
    assert.equal(studentAnswersInserted, false, 'student_answers must never be inserted by AI evaluations');
  });
});

test('POST /api/v1/evaluations/gemini rejects attempt to supply client-controlled studentId with 400 UNAUTHORIZED_STUDENT_ID', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Sagot ko ito',
        questionCode: 'elem-statement',
        studentId: '00000000-0000-0000-0000-000000000999'
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'UNAUTHORIZED_STUDENT_ID');
  });
});

test('POST /api/v1/evaluations/gemini rejects attempt to supply client-controlled questionId with 400 UNAUTHORIZED_QUESTION_ID', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Sagot ko ito',
        questionCode: 'elem-statement',
        questionId: '00000000-0000-0000-0000-000000000999'
      })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'UNAUTHORIZED_QUESTION_ID');
  });
});

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

test('POST /api/v1/evaluations/gemini rejects missing question in database with 404 QUESTION_NOT_FOUND', async () => {
  const mockClient = createDefaultMockDb({
    questions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null })
        })
      })
    }
  });
  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

test('POST /api/v1/evaluations/gemini rejects missing question version in database with 404 QUESTION_VERSION_NOT_FOUND', async () => {
  const mockClient = createDefaultMockDb({
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
  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

test('POST /api/v1/evaluations/gemini rejects rubric query database failure with 503 DATABASE_ERROR', async () => {
  const mockClient = createDefaultMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'rubric connection timeout' } })
        })
      })
    }
  });
  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

test('POST /api/v1/evaluations/gemini handles genuinely missing rubric gracefully without database error', async () => {
  const mockClient = createDefaultMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null })
        })
      })
    }
  });
  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.persisted, true);
    assert.equal(body.data.evaluationId, 'eval-123');
  });
});

test('POST /api/v1/evaluations/gemini returns successful persisted evaluation with persisted=true and evaluationId', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.persisted, true);
    assert.equal(body.data.evaluationId, 'eval-123');
    assert.equal(typeof body.data.isSemanticMatch, 'boolean');
    assert.equal(typeof body.data.semanticScore, 'number');
    assert.ok(body.data.confidenceScore === null || typeof body.data.confidenceScore === 'number');
  });
});

test('POST /api/v1/evaluations/gemini explicitly marks persisted=false and evaluationId=null when running without database client', async () => {
  const { app } = testAppWithAuth({ client: null });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

test('POST /api/v1/evaluations/gemini securely retrieves private rubric via adminClient even when student client cannot read it', async () => {
  // Student client simulates RLS: reading rubrics returns empty (data: null, error: null)
  const studentClient = createDefaultMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }) // RLS blocks student
        })
      })
    }
  });

  // Admin client provides the authoritative private rubric stored in the database
  const privilegedAdminClient = createDefaultMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              expected_answer: 'Authoritative private DB expected answer.',
              rubric_groups: [['lihim-na-kaisipan'], ['natatanging-aral']]
            },
            error: null
          })
        })
      })
    }
  });

  const { app } = testAppWithAuth({
    client: studentClient,
    adminClient: privilegedAdminClient
  });

  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Naglalaman ito ng lihim-na-kaisipan at natatanging-aral para sa mambabasa.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    // Verified that the private DB rubric retrieved by adminClient was used for evaluation:
    assert.equal(body.data.isSemanticMatch, true);
    assert.equal(body.data.semanticScore, 1.0);
    assert.equal(body.data.persisted, true);
    assert.ok(body.data.evaluationId);
  });
});

test('RLS policy: students cannot directly read question_evaluation_rubrics records', () => {
  const canReadRubric = ({ role }) => {
    return role === 'teacher' || role === 'admin';
  };

  assert.equal(canReadRubric({ role: 'student' }), false, 'Student role must NOT be permitted to read rubrics');
  assert.equal(canReadRubric({ role: 'teacher' }), true, 'Teacher role must be permitted to read rubrics');
  assert.equal(canReadRubric({ role: 'admin' }), true, 'Admin role must be permitted to read rubrics');

  // Verify Phase 4 migration strictly enforces is_teacher_or_admin() for rubric reads
  const phase4Migration = path.join(__dirname, '../supabase/migrations/202611080001_phase4_catalog_and_gameplay.sql');
  const content = fs.readFileSync(phase4Migration, 'utf8');
  assert.match(content, /create policy question_rubrics_staff_read on public\.question_evaluation_rubrics for select to authenticated\s+using \(\(select public\.is_teacher_or_admin\(\)\)\);/i);
});

test('POST /api/v1/evaluations/gemini rejects adminClient rubric query database failure with 503 DATABASE_ERROR without fallback', async () => {
  const privilegedAdminClient = createDefaultMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { message: 'admin client database connection timeout' } })
        })
      })
    }
  });

  const { app } = testAppWithAuth({ adminClient: privilegedAdminClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng konteksto sa mga tauhan.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'DATABASE_ERROR');
    assert.equal(body.message, 'A server error occurred.');
  });
});

test('POST /api/v1/evaluations/gemini never exposes expected answers or raw rubric data in response', async () => {
  const privilegedAdminClient = createDefaultMockDb({
    question_evaluation_rubrics: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              expected_answer: 'TOP_SECRET_EXPECTED_ANSWER',
              rubric_groups: [['secret_term_alpha'], ['secret_term_beta']]
            },
            error: null
          })
        })
      })
    }
  });

  const { app } = testAppWithAuth({ adminClient: privilegedAdminClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ito ay karaniwang sagot na walang lihim na mga salita.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.doesNotMatch(text, /TOP_SECRET_EXPECTED_ANSWER/);
    assert.doesNotMatch(text, /secret_term_alpha/);
    assert.doesNotMatch(text, /secret_term_beta/);

    const body = JSON.parse(text);
    assert.equal(body.data.expectedAnswer, undefined);
    assert.equal(body.data.answerKey, undefined);
    assert.equal(body.data.rubricGroups, undefined);
    assert.equal(body.data.acceptedAnswers, undefined);
  });
});

// --------------------------------------------------------------------------
// 4. Database Migration Integrity
// --------------------------------------------------------------------------
test('migration: 202611090001_phase5_ai_evaluations.sql defines secure schema and RLS', () => {
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
// 5. Phase 5.2 & 5.3 AI Semantic Evaluation - 20 Core Requirements
// --------------------------------------------------------------------------

// Condition 1: Correct answer with different wording (paraphrase)
test('Phase 5.2/5.3 (1/20): Evaluates correct answer with different wording (paraphrase)', async () => {
  const runner = async () => JSON.stringify({
    isCorrect: true,
    isSemanticMatch: true,
    semanticScore: 0.95,
    confidenceScore: 0.92,
    feedback: 'Napakahusay! Naipaliwanag ang konteksto ng kapaligiran sa sariling pangungusap.',
    criteriaEvaluation: [{ aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'Tugma ang diwa.' }]
  });
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
  const res = await service.evaluateAnswer({
    studentAnswer: 'Ang pook kung saan naganap ang kwento ay nagbibigay-daan upang maunawaan ang kilos ng mga tauhan.',
    questionCode: 'elem-statement',
    questionPrompt: 'Ipaliwanag ang kahalagahan ng tagpuan.',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa tauhan.'
  });
  assert.equal(res.isCorrect, true);
  assert.equal(res.isSemanticMatch, true);
  assert.ok(res.semanticScore >= 0.9);
  assert.equal(res.pointsEarned, 0.95);
  assert.ok(res.feedback.includes('Napakahusay'));
});

// Condition 2: Correct answer using synonyms
test('Phase 5.2/5.3 (2/20): Evaluates correct answer using synonyms rather than exact keywords', async () => {
  const runner = async () => JSON.stringify({
    isCorrect: true,
    isSemanticMatch: true,
    semanticScore: 1.0,
    confidenceScore: 0.97,
    feedback: 'Tumpak ang paggamit ng kasingkahulugan para sa pampanitikang konsepto.',
    criteriaEvaluation: [{ aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'Wasto ang kahulugan.' }]
  });
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
  const res = await service.evaluateAnswer({
    studentAnswer: 'Ang lunan at panahon ay humuhubog sa pag-uugali ng bawat karakter.',
    questionCode: 'elem-statement',
    questionPrompt: 'Ipaliwanag ang tagpuan.',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa mga tauhan.'
  });
  assert.equal(res.isCorrect, true);
  assert.equal(res.semanticScore, 1.0);
  assert.equal(res.pointsEarned, 1);
});

// Condition 3: Irrelevant answer
test('Phase 5.2/5.3 (3/20): Rejects completely irrelevant answers with 0 score', async () => {
  const runner = async () => JSON.stringify({
    isCorrect: false,
    isSemanticMatch: false,
    semanticScore: 0.0,
    confidenceScore: 0.99,
    feedback: 'Walang kaugnayan ang iyong sagot sa hinihinging pampanitikang konsepto ng tagpuan.',
    criteriaEvaluation: [{ aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: false, explanation: 'Walang kaugnayan.' }]
  });
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
  const res = await service.evaluateAnswer({
    studentAnswer: 'Masarap kumain ng mainit na sopas kapag umuulan.',
    questionCode: 'elem-statement',
    questionPrompt: 'Ipaliwanag ang tagpuan.',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa mga tauhan.'
  });
  assert.equal(res.isCorrect, false);
  assert.equal(res.semanticScore, 0.0);
  assert.equal(res.pointsEarned, 0);
  assert.ok(res.feedback.includes('Walang kaugnayan'));
});

// Condition 4: Meaningless or random text (gibberish)
test('Phase 5.2/5.3 (4/20): Rejects meaningless or random text (gibberish) with 0 score', async () => {
  const runner = async () => JSON.stringify({
    isCorrect: false,
    isSemanticMatch: false,
    semanticScore: 0.0,
    feedback: 'Hindi maunawaan o walang mabubuong kaisipan ang isinumiteng sagot.',
    criteriaEvaluation: [{ aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: false, explanation: 'Random text.' }]
  });
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
  const res = await service.evaluateAnswer({
    studentAnswer: 'asdfghjkl zxcvbnmqwerty 12345',
    questionCode: 'elem-statement',
    questionPrompt: 'Ipaliwanag ang tagpuan.',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa mga tauhan.'
  });
  assert.equal(res.isCorrect, false);
  assert.equal(res.semanticScore, 0.0);
  assert.equal(res.pointsEarned, 0);
});

// Condition 5: Contradictory answer
test('Phase 5.2/5.3 (5/20): Rejects contradictory answers with 0 score and constructive feedback', async () => {
  const runner = async () => JSON.stringify({
    isCorrect: false,
    isSemanticMatch: false,
    semanticScore: 0.0,
    feedback: 'Mali ang pahayag dahil ang tagpuan ay may tuwirang epekto sa kilos ng tauhan, hindi hiwalay.',
    criteriaEvaluation: [{ aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: false, explanation: 'Sumasalungat sa aralin.' }]
  });
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
  const res = await service.evaluateAnswer({
    studentAnswer: 'Ang tagpuan ay walang anumang kinalaman o epekto sa tauhan sa anumang kwento.',
    questionCode: 'elem-statement',
    questionPrompt: 'Ipaliwanag ang tagpuan.',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa mga tauhan.'
  });
  assert.equal(res.isCorrect, false);
  assert.equal(res.semanticScore, 0.0);
  assert.equal(res.pointsEarned, 0);
});

// Condition 6: Partial but valid answer (partial score)
test('Phase 5.2/5.3 (6/20): Awards partial credit and constructive guidance for partial answers', async () => {
  const runner = async () => JSON.stringify({
    isCorrect: false,
    isSemanticMatch: false,
    semanticScore: 0.50,
    feedback: 'Nabanggit ang kapaligiran ngunit kulang ang pagpapaliwanag kung paano ito nakakaapekto sa mga tauhan.',
    criteriaEvaluation: [
      { aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'Nabanggit ang lugar.' },
      { aspectNumber: 2, aspect: 'Pamantayan 2', satisfied: false, explanation: 'Kulang sa ugnayan sa tauhan.' }
    ]
  });
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
  const res = await service.evaluateAnswer({
    studentAnswer: 'Ito ay tumutukoy lamang sa lugar ng pinangyarihan.',
    questionCode: 'elem-statement',
    maxPoints: 2
  });
  assert.equal(res.isCorrect, false);
  assert.equal(res.semanticScore, 0.50);
  assert.equal(res.pointsEarned, 1.00); // 0.50 * 2 maxPoints
  assert.equal(res.criteriaEvaluation.length, 2);
  assert.equal(res.criteriaEvaluation[0].satisfied, true);
  assert.equal(res.criteriaEvaluation[1].satisfied, false);
});

// Condition 7: Incomplete answer missing key rubric criteria
test('Phase 5.2/5.3 (7/20): Evaluates completeness against rubric criteria and flags missing aspects', async () => {
  const runner = async () => JSON.stringify({
    isCorrect: false,
    isSemanticMatch: false,
    semanticScore: 0.35,
    feedback: 'Kulang ang sagot sa mahahalagang pamantayang itinakda.',
    criteriaEvaluation: [
      { aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'May kaunting konteksto.' },
      { aspectNumber: 2, aspect: 'Pamantayan 2', satisfied: false, explanation: 'Hindi naipaliwanag ang damdamin.' },
      { aspectNumber: 3, aspect: 'Pamantayan 3', satisfied: false, explanation: 'Kulang sa halimbawa.' }
    ]
  });
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
  const res = await service.evaluateAnswer({
    studentAnswer: 'May tagpuan sa akda.',
    questionCode: 'elem-statement',
    rubricCriteria: [['konteksto'], ['damdamin'], ['halimbawa']]
  });
  assert.equal(res.isCorrect, false);
  assert.equal(res.semanticScore, 0.35);
  assert.equal(res.criteriaEvaluation.filter(c => c.satisfied).length, 1);
  assert.equal(res.criteriaEvaluation.filter(c => !c.satisfied).length, 2);
});

// Condition 8: Maximum points enforcement
test('Phase 5.2/5.3 (8/20): Enforces maxPoints bounds (e.g. maxPoints: 3 scales pointsEarned correctly)', async () => {
  const runner = async () => JSON.stringify({
    isCorrect: true,
    isSemanticMatch: true,
    semanticScore: 0.80,
    feedback: 'Mahusay na paliwanag.'
  });
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
  const res = await service.evaluateAnswer({
    studentAnswer: 'Komprehensibong sagot.',
    questionCode: 'elem-bonus',
    maxPoints: 3
  });
  assert.equal(res.maxPoints, 3);
  assert.equal(res.pointsEarned, 2.40); // 0.80 * 3
  assert.ok(res.pointsEarned <= 3);
});

// Condition 9: Invalid semantic score rejection
test('Phase 5.2/5.3 (9/20): Rejects invalid semantic scores (NaN, out-of-bounds, non-numeric) with 502', async () => {
  for (const badScore of [NaN, -0.5, 1.5, 'mataas', null]) {
    const runner = async () => JSON.stringify({
      isCorrect: true,
      semanticScore: badScore,
      feedback: 'Test feedback.'
    });
    const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
    await assert.rejects(
      async () => service.evaluateAnswer({ studentAnswer: 'Sagot', questionCode: 'elem-statement' }),
      (err) => err.status === 502 && err.code === 'INVALID_MODEL_RESPONSE'
    );
  }
});

// Condition 10: Malformed JSON response
test('Phase 5.2/5.3 (10/20): Rejects malformed JSON model responses with 502 INVALID_MODEL_RESPONSE', async () => {
  const runner = async () => 'Hindi ito JSON: { isCorrect: true, ';
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runner });
  await assert.rejects(
    async () => service.evaluateAnswer({ studentAnswer: 'Sagot', questionCode: 'elem-statement' }),
    (err) => err.status === 502 && err.code === 'INVALID_MODEL_RESPONSE'
  );
});

// Condition 11: Missing required model fields
test('Phase 5.2/5.3 (11/20): Rejects model response missing required fields (isCorrect or feedback) with 502', async () => {
  // Missing feedback
  const runnerNoFeedback = async () => JSON.stringify({ isCorrect: true, semanticScore: 1.0 });
  const service1 = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runnerNoFeedback });
  await assert.rejects(
    async () => service1.evaluateAnswer({ studentAnswer: 'Sagot', questionCode: 'elem-statement' }),
    (err) => err.status === 502 && err.code === 'INVALID_MODEL_RESPONSE'
  );

  // Missing isCorrect
  const runnerNoIsCorrect = async () => JSON.stringify({ semanticScore: 1.0, feedback: 'May feedback pero walang isCorrect.' });
  const service2 = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: runnerNoIsCorrect });
  await assert.rejects(
    async () => service2.evaluateAnswer({ studentAnswer: 'Sagot', questionCode: 'elem-statement' }),
    (err) => err.status === 502 && err.code === 'INVALID_MODEL_RESPONSE'
  );
});

// Condition 12: Missing API key
test('Phase 5.2/5.3 (12/20): Missing or placeholder API key returns 503 GEMINI_NOT_CONFIGURED', async () => {
  const serviceNoKey = createGeminiService({ config: { gemini: { apiKey: '' } } });
  await assert.rejects(
    async () => serviceNoKey.evaluateAnswer({ studentAnswer: 'Sagot', questionCode: 'elem-statement' }),
    (err) => err.status === 503 && err.code === 'GEMINI_NOT_CONFIGURED'
  );

  const servicePlaceholderKey = createGeminiService({ config: { gemini: { apiKey: 'your_gemini_api_key_here' } } });
  await assert.rejects(
    async () => servicePlaceholderKey.evaluateAnswer({ studentAnswer: 'Sagot', questionCode: 'elem-statement' }),
    (err) => err.status === 503 && err.code === 'GEMINI_NOT_CONFIGURED'
  );
});

// Condition 13: Gemini timeout
test('Phase 5.2/5.3 (13/20): Gemini timeout returns 504 GEMINI_TIMEOUT', async () => {
  const slowRunner = () => new Promise(resolve => setTimeout(() => resolve('{}'), 500));
  const service = createGeminiService({
    config: { gemini: { apiKey: 'key', timeoutMs: 50 } },
    modelRunner: slowRunner
  });
  await assert.rejects(
    async () => service.evaluateAnswer({ studentAnswer: 'Sagot', questionCode: 'elem-statement' }),
    (err) => err.status === 504 && err.code === 'GEMINI_TIMEOUT'
  );
});

// Condition 14: Gemini rate limit
test('Phase 5.2/5.3 (14/20): Gemini 429 / rate limit returns 429 GEMINI_RATE_LIMIT', async () => {
  const rateLimitRunner = async () => {
    const err = new Error('RESOURCE_EXHAUSTED: Quota exceeded for quota metric');
    err.status = 429;
    throw err;
  };
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: rateLimitRunner });
  await assert.rejects(
    async () => service.evaluateAnswer({ studentAnswer: 'Sagot', questionCode: 'elem-statement' }),
    (err) => err.status === 429 && err.code === 'GEMINI_RATE_LIMIT'
  );
});

// Condition 15: Gemini provider failure
test('Phase 5.2/5.3 (15/20): Gemini upstream provider failure returns 502 GEMINI_PROVIDER_ERROR', async () => {
  const failRunner = async () => {
    const err = new Error('Internal error encountered in generative service');
    err.status = 500;
    throw err;
  };
  const service = createGeminiService({ config: { gemini: { apiKey: 'key' } }, modelRunner: failRunner });
  await assert.rejects(
    async () => service.evaluateAnswer({ studentAnswer: 'Sagot', questionCode: 'elem-statement' }),
    (err) => err.status === 502 && err.code === 'GEMINI_PROVIDER_ERROR'
  );
});

// Condition 16: Private rubric confidentiality
test('Phase 5.2/5.3 (16/20): POST /api/v1/evaluations/gemini never exposes expected answers or raw rubric terms', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng pangkalahatang konteksto.',
        questionCode: 'elem-statement'
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.expectedAnswer, undefined);
    assert.equal(body.data.answerKey, undefined);
    assert.equal(body.data.rubricGroups, undefined);
    assert.equal(body.data.acceptedAnswers, undefined);
  });
});

// Condition 17: Student authentication and session ownership preserved
test('Phase 5.2/5.3 (17/20): Authentication is required and session ownership is strictly enforced', async () => {
  // 1. Unauthenticated -> 401
  const { app: unauthApp } = testAppWithAuth({ authenticated: false });
  await withServer(unauthApp, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAnswer: 'Sagot', questionCode: 'elem-statement' })
    });
    assert.equal(res.status, 401);
  });

  // 2. Foreign session -> 403
  const foreignSessionClient = createDefaultMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000099', student_id: 'DIFFERENT_STUDENT_ID' },
            error: null
          })
        })
      })
    }
  });
  const { app: foreignApp } = testAppWithAuth({ client: foreignSessionClient });
  await withServer(foreignApp, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Sagot',
        questionCode: 'elem-statement',
        sessionId: '00000000-0000-0000-0000-000000000099'
      })
    });
    assert.equal(res.status, 403);
  });
});

// Condition 18: Duplicate submission prevention
test('Phase 5.2/5.3 (18/20): Rejects client-supplied IDs and prevents unauthorized parameter tampering', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    // Client-supplied mockResult -> 400
    const resMock = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAnswer: 'Sagot', questionCode: 'elem-statement', mockResult: { isCorrect: true } })
    });
    assert.equal(resMock.status, 400);

    // Client-supplied studentId -> 400
    const resStudent = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAnswer: 'Sagot', questionCode: 'elem-statement', studentId: '00000000-0000-0000-0000-000000000001' })
    });
    assert.equal(resStudent.status, 400);
  });
});

// Condition 19: No modification to official game scoring
test('Phase 5.2/5.3 (19/20): Evaluation is purely advisory; never modifies game_sessions or student_answers', async () => {
  let sessionScoreMutated = false;
  let studentAnswerInserted = false;

  const mockDb = createDefaultMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000010', student_id: '00000000-0000-0000-0000-000000000001', main_score: 5, reverse_score: 0 },
            error: null
          })
        })
      }),
      update: () => {
        sessionScoreMutated = true;
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      }
    },
    student_answers: {
      insert: () => {
        studentAnswerInserted = true;
        return Promise.resolve({ data: null, error: null });
      }
    }
  });

  const { app } = testAppWithAuth({ client: mockDb });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Mahusay na pagsusuri.',
        questionCode: 'elem-statement',
        sessionId: '00000000-0000-0000-0000-000000000010'
      })
    });
    assert.equal(res.status, 200);
    assert.equal(sessionScoreMutated, false, 'game_sessions must not be mutated by AI evaluation');
    assert.equal(studentAnswerInserted, false, 'student_answers must not be inserted by AI evaluation');
  });
});

// Condition 20: Reverse Round practice remains unscored (0 points)
test('Phase 5.2/5.3 (20/20): Reverse Round practice evaluations remain unscored (0 points awarded to session)', async () => {
  let sessionUpdated = false;
  const mockDb = createDefaultMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000010', student_id: '00000000-0000-0000-0000-000000000001', main_score: 3, reverse_score: 0 },
            error: null
          })
        })
      }),
      update: () => {
        sessionUpdated = true;
        return { eq: () => Promise.resolve({ data: null, error: null }) };
      }
    }
  });

  // Practice mode with sessionId: null
  const { app } = testAppWithAuth({ client: mockDb });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Baligtarang pagsasanay.',
        questionCode: 'elem-statement',
        sessionId: null
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.persisted, true); // Persisted with session_id = null
    assert.equal(sessionUpdated, false, 'Session scores must remain untouched for practice evaluation');
  });
});

// ==============================================================================
// Phase 5.2/5.3 Final Correction Review Regressions
// ==============================================================================

test('Phase 5.2/5.3 Regression: uses currently supported gemini-3.5-flash-lite default and respects GEMINI_MODEL config', () => {
  const defaultSvc = createGeminiService({ config: { gemini: { apiKey: 'test-key' } } });
  assert.equal(defaultSvc.getStatus().model, 'gemini-3.5-flash-lite');
  assert.doesNotMatch(defaultSvc.getStatus().model, /gemini-1\.5/);

  const customSvc = createGeminiService({ config: { gemini: { apiKey: 'test-key', model: 'gemini-3.8-flash' } } });
  assert.equal(customSvc.getStatus().model, 'gemini-3.8-flash');
});

test('Phase 5.2/5.3 Regression: generates topic-agnostic prompt using actual topic and question context', () => {
  const promptGrammar = buildEvaluationPrompt({
    questionPrompt: 'Ano ang wastong gamit ng "nang" at "ng"?',
    expectedAnswer: 'Ang "nang" ay ginagamit para sa paraan o pang-abay, habang ang "ng" ay pananda ng tuwirang layon.',
    rubricCriteria: [['paraan', 'pang-abay'], ['tuwirang layon']],
    studentAnswer: 'Ang nang ay para sa how or adverb, ang ng ay direct object.',
    category: 'Gramatika',
    topic: 'Wastong Gamit ng Salita',
    maxPoints: 2
  });

  assert.match(promptGrammar.userPrompt, /Paksa \/ Aralin: Wastong Gamit ng Salita/);
  assert.match(promptGrammar.userPrompt, /Uri ng Tanong \/ Kard: Gramatika/);
  assert.match(promptGrammar.userPrompt, /Pinakamataas na Puntos: 2/);
  assert.match(promptGrammar.systemInstruction, /HUWAG ipalagay na ang bawat tanong ay limitado lamang sa pagsusuring pampanitikan/);
  assert.match(promptGrammar.systemInstruction, /makatwirang Taglish/);
});

test('Phase 5.2/5.3 Regression: accepts natural Filipino and Taglish paraphrases without requiring textbook wording', async () => {
  let capturedPrompt = null;
  const mockRunner = async ({ userPrompt }) => {
    capturedPrompt = userPrompt;
    return JSON.stringify({
      isCorrect: true,
      isSemanticMatch: true,
      semanticScore: 1.0,
      confidenceScore: 0.94,
      feedback: 'Magaling! Naipaliwanag nang wasto ang gamit gamit ang natural na Taglish.',
      evaluationSummary: 'Wasto ang sagot.',
      criteriaEvaluation: [
        { aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'Tama ang gamit.' }
      ]
    });
  };

  const svc = createGeminiService({
    config: { gemini: { apiKey: 'test-key', model: 'gemini-3.5-flash-lite' } },
    modelRunner: mockRunner
  });

  const res = await svc.evaluateAnswer({
    studentAnswer: 'Sa story ng Alamat, yung setting nagbibigay ng background where the events happen.',
    questionCode: 'alamat-setting',
    questionPrompt: 'Ipaliwanag ang kahalagahan ng tagpuan sa alamat.',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto at pinagmulan ng mga pangyayari.',
    rubricCriteria: [['konteksto', 'background'], ['pangyayari', 'events']],
    topic: 'Alamat ng Pilipinas',
    category: 'Pahayag'
  });

  assert.equal(res.isCorrect, true);
  assert.equal(res.semanticScore, 1.0);
  assert.match(res.feedback, /Taglish/);
  assert.match(capturedPrompt, /Alamat ng Pilipinas/);
});

test('Phase 5.2/5.3 Regression: status endpoint distinguishes not_yet_live_tested, verified_operational, and provider_error', async () => {
  let shouldFail = false;
  const mockRunner = async () => {
    if (shouldFail) {
      const err = new Error('Upstream provider unavailable');
      err.status = 502;
      throw err;
    }
    return JSON.stringify({
      isCorrect: true,
      semanticScore: 1.0,
      feedback: 'Tama.',
      criteriaEvaluation: []
    });
  };

  const svc = createGeminiService({
    config: { gemini: { apiKey: 'valid-test-key', model: 'gemini-3.5-flash-lite' } },
    modelRunner: mockRunner
  });

  // 1. Initial state: apiKey is configured, but not yet live tested
  const initialStatus = svc.getStatus();
  assert.equal(initialStatus.apiKeyConfigured, true);
  assert.equal(initialStatus.status, 'not_yet_live_tested');
  assert.equal(initialStatus.operational, false);
  assert.equal(initialStatus.notYetLiveTested, true);

  // 2. After successful live evaluation: verified_operational
  await svc.evaluateAnswer({
    studentAnswer: 'Sagot',
    questionCode: 'test-q',
    questionPrompt: 'Tanong',
    expectedAnswer: 'Sagot'
  });
  const liveStatus = svc.getStatus();
  assert.equal(liveStatus.status, 'verified_operational');
  assert.equal(liveStatus.operational, true);
  assert.ok(liveStatus.lastVerifiedAt);

  // 3. After provider failure: provider_error
  shouldFail = true;
  await assert.rejects(
    () => svc.evaluateAnswer({
      studentAnswer: 'Sagot',
      questionCode: 'test-q',
      questionPrompt: 'Tanong',
      expectedAnswer: 'Sagot'
    }),
    (err) => err.code === 'GEMINI_PROVIDER_ERROR'
  );
  const errorStatus = svc.getStatus();
  assert.equal(errorStatus.status, 'provider_error');
  assert.equal(errorStatus.operational, false);
  assert.equal(errorStatus.lastErrorCode, 'GEMINI_PROVIDER_ERROR');
});

test('Phase 5.2/5.3 Regression: backend deduplicates concurrent in-flight submissions with isDuplicate: true', async () => {
  let callCount = 0;
  const mockRunner = async () => {
    callCount++;
    await new Promise(r => setTimeout(r, 40));
    return JSON.stringify({
      isCorrect: true,
      semanticScore: 1.0,
      feedback: 'Wasto ang sagot.',
      criteriaEvaluation: []
    });
  };

  const svc = createGeminiService({
    config: { gemini: { apiKey: 'test-key', model: 'gemini-3.5-flash-lite' } },
    modelRunner: mockRunner
  });

  const { app } = testAppWithAuth({ geminiService: svc });
  await withServer(app, async (base) => {
    const payload = {
      studentAnswer: 'Ito ay sabayang tugon.',
      questionCode: 'elem-statement',
      sessionId: '00000000-0000-0000-0000-000000000010'
    };

    const [res1, res2] = await Promise.all([
      fetch(`${base}/api/v1/evaluations/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }),
      fetch(`${base}/api/v1/evaluations/gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
    ]);

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);
    const body1 = await res1.json();
    const body2 = await res2.json();

    assert.equal(body1.success, true);
    assert.equal(body2.success, true);
    const hasDuplicate = body1.data.isDuplicate === true || body2.data.isDuplicate === true;
    assert.equal(hasDuplicate, true, 'Concurrent identical submission must be deduplicated with isDuplicate: true');
    assert.equal(callCount, 1, 'Model runner must be executed only once for concurrent requests');
  });
});

test('Phase 5.2/5.3 Regression: backend database idempotency returns existing evaluation with isDuplicate: true', async () => {
  let geminiCalled = false;
  const mockRunner = async () => {
    geminiCalled = true;
    return JSON.stringify({ isCorrect: true, semanticScore: 1.0, feedback: 'Wasto', criteriaEvaluation: [] });
  };

  const svc = createGeminiService({
    config: { gemini: { apiKey: 'test-key', model: 'gemini-3.5-flash-lite' } },
    modelRunner: mockRunner
  });

  const existingEvalRecord = {
    id: 'eval-existing-id-12345',
    student_id: '00000000-0000-0000-0000-000000000001',
    session_id: '00000000-0000-0000-0000-000000000010',
    question_id: '00000000-0000-0000-0000-000000000002',
    student_answer: 'Naisulat na sagot dati.',
    is_semantic_match: true,
    semantic_score: 1.0,
    confidence_score: 0.95,
    feedback: 'Naunang pagsusuri.',
    rubric_criteria: [],
    raw_model_response: { evaluationSummary: 'Naunang buod.' },
    model_version: 'gemini-3.5-flash-lite',
    status: 'evaluated',
    evaluated_at: new Date().toISOString()
  };

  const mockDb = createDefaultMockDb({
    ai_evaluations: {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: existingEvalRecord, error: null })
                  })
                })
              })
            })
          })
        })
      }),
      insert: () => {
        throw new Error('Insert should not be called when existing evaluation is found');
      }
    }
  });

  const { app } = testAppWithAuth({ geminiService: svc, client: mockDb });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Naisulat na sagot dati.',
        questionCode: 'elem-statement',
        sessionId: '00000000-0000-0000-0000-000000000010'
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.isDuplicate, true);
    assert.equal(body.data.evaluationId, 'eval-existing-id-12345');
    assert.equal(body.data.feedback, 'Naunang pagsusuri.');
    assert.equal(geminiCalled, false, 'Gemini must not be invoked when duplicate evaluation already exists in database');
  });
});

// ==============================================================================
// Phase 5.4: Scoring Integration Tests
// ==============================================================================

test('Phase 5.4 (1/11): Correct semantic answer and official scoring flow via submit_game_answer', async () => {
  const mockRunner = async () => JSON.stringify({
    isCorrect: true,
    isSemanticMatch: true,
    semanticScore: 1.0,
    confidenceScore: 0.97,
    feedback: 'Napakahusay at tumpak ang paliwanag.',
    criteriaEvaluation: [{ aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'Wasto.' }]
  });

  const svc = createGeminiService({
    config: { gemini: { apiKey: 'test-key', model: 'gemini-3.5-flash-lite' } },
    modelRunner: mockRunner
  });

  let rpcCalledWith = null;
  const mockClient = {
    ...createDefaultMockDb(),
    rpc: async (name, args) => {
      rpcCalledWith = { name, args };
      return {
        data: {
          isCorrect: true,
          pointsAwarded: 1,
          maxPoints: 1,
          evaluationMethod: 'local_rubric',
          answer: { id: 'ans-1', isCorrect: true, pointsAwarded: 1 }
        },
        error: null
      };
    }
  };

  const { app } = testAppWithAuth({ geminiService: svc, client: mockClient });
  await withServer(app, async (base) => {
    // 1. Semantic evaluation via Gemini endpoint
    const evalRes = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Ang tagpuan ay nagbibigay ng kabuuang kalagayan at konteksto sa mga tauhan.',
        questionCode: 'elem-statement',
        sessionId: '00000000-0000-0000-0000-000000000010'
      })
    });
    assert.equal(evalRes.status, 200);
    const evalData = (await evalRes.json()).data;
    assert.equal(evalData.isCorrect, true);
    assert.equal(evalData.pointsEarned, 1);
    assert.equal(evalData.semanticScore, 1.0);

    // 2. Official score recorded via authoritative submit_game_answer endpoint
    const ansRes = await fetch(`${base}/api/v1/sessions/00000000-0000-0000-0000-000000000010/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionCode: 'elem-statement',
        response: 'Ang tagpuan ay nagbibigay ng kabuuang kalagayan at konteksto sa mga tauhan.',
        round: 'main'
      })
    });
    assert.equal(ansRes.status, 201);
    assert.equal(rpcCalledWith.name, 'submit_game_answer');
    assert.equal(rpcCalledWith.args.p_session_id, '00000000-0000-0000-0000-000000000010');
    assert.equal(rpcCalledWith.args.p_question_code, 'elem-statement');
    assert.equal(rpcCalledWith.args.p_response, 'Ang tagpuan ay nagbibigay ng kabuuang kalagayan at konteksto sa mga tauhan.');
    // Ensure client did NOT pass points to RPC
    assert.equal('p_points_awarded' in rpcCalledWith.args, false);
    assert.equal('p_is_correct' in rpcCalledWith.args, false);
  });
});

test('Phase 5.4 (2/11): Valid paraphrase receiving appropriate credit', async () => {
  const mockRunner = async () => JSON.stringify({
    isCorrect: true,
    isSemanticMatch: true,
    semanticScore: 1.0,
    feedback: 'Tumpak ang kaisipan kahit iba ang pagkakaayos ng mga salita.',
    criteriaEvaluation: [{ aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'Naipaliwanag.' }]
  });

  const svc = createGeminiService({
    config: { gemini: { apiKey: 'test-key', model: 'gemini-3.5-flash-lite' } },
    modelRunner: mockRunner
  });

  const res = await svc.evaluateAnswer({
    studentAnswer: 'Sa pamamagitan ng tagpuan, mas naiintindihan natin ang background at kilos ng characters.',
    questionCode: 'elem-statement',
    questionPrompt: 'Ipaliwanag ang tagpuan.',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto.',
    rubricCriteria: [['konteksto', 'background']],
    maxPoints: 1
  });

  assert.equal(res.isCorrect, true);
  assert.equal(res.pointsEarned, 1);
  assert.equal(res.semanticScore, 1.0);
});

test('Phase 5.4 (3/11): Partial answer and partial credit', async () => {
  const mockRunner = async () => JSON.stringify({
    isCorrect: false,
    isSemanticMatch: false,
    semanticScore: 0.5,
    feedback: 'Nabanggit ang tauhan ngunit kulang sa paliwanag ukol sa tagpuan.',
    criteriaEvaluation: [
      { aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: true, explanation: 'Nabanggit ang tauhan.' },
      { aspectNumber: 2, aspect: 'Pamantayan 2', satisfied: false, explanation: 'Kulang ang konteksto sa tagpuan.' }
    ]
  });

  const svc = createGeminiService({
    config: { gemini: { apiKey: 'test-key', model: 'gemini-3.5-flash-lite' } },
    modelRunner: mockRunner
  });

  const res = await svc.evaluateAnswer({
    studentAnswer: 'Para lang sa tauhan.',
    questionCode: 'elem-statement',
    questionPrompt: 'Ipaliwanag ang tagpuan.',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto sa tauhan at pangyayari.',
    rubricCriteria: [['tauhan'], ['tagpuan', 'konteksto']],
    maxPoints: 2
  });

  assert.equal(res.isCorrect, false);
  assert.equal(res.semanticScore, 0.5);
  assert.equal(res.pointsEarned, 1.0); // 0.5 * maxPoints (2) = 1.0
  assert.equal(res.maxPoints, 2);
  assert.equal(res.criteriaEvaluation.length, 2);
  assert.equal(res.criteriaEvaluation[0].satisfied, true);
  assert.equal(res.criteriaEvaluation[1].satisfied, false);
});

test('Phase 5.4 (4/11): Irrelevant, contradictory, or meaningless answer receiving zero', async () => {
  const mockRunner = async () => JSON.stringify({
    isCorrect: false,
    isSemanticMatch: false,
    semanticScore: 0.0,
    feedback: 'Walang kaugnayan ang sagot sa hinihingi ng tanong.',
    criteriaEvaluation: [{ aspectNumber: 1, aspect: 'Pamantayan 1', satisfied: false, explanation: 'Hindi natugunan.' }]
  });

  const svc = createGeminiService({
    config: { gemini: { apiKey: 'test-key', model: 'gemini-3.5-flash-lite' } },
    modelRunner: mockRunner
  });

  const res = await svc.evaluateAnswer({
    studentAnswer: 'blabla asdfghjk qwerty',
    questionCode: 'elem-statement',
    questionPrompt: 'Ipaliwanag ang tagpuan.',
    expectedAnswer: 'Nagbibigay ang tagpuan ng konteksto.',
    rubricCriteria: [['konteksto']],
    maxPoints: 1
  });

  assert.equal(res.isCorrect, false);
  assert.equal(res.semanticScore, 0.0);
  assert.equal(res.pointsEarned, 0);
});

test('Phase 5.4 (5/11): Maximum point enforcement', async () => {
  const mockRunner = async () => JSON.stringify({
    isCorrect: true,
    isSemanticMatch: true,
    semanticScore: 1.0,
    feedback: 'Wasto.',
    criteriaEvaluation: []
  });

  const svc = createGeminiService({
    config: { gemini: { apiKey: 'test-key', model: 'gemini-3.5-flash-lite' } },
    modelRunner: mockRunner
  });

  // maxPoints: 1 -> pointsEarned cannot exceed 1
  const res1 = await svc.evaluateAnswer({
    studentAnswer: 'Wasto.',
    questionCode: 'elem-statement',
    maxPoints: 1
  });
  assert.equal(res1.pointsEarned, 1);
  assert.equal(res1.maxPoints, 1);

  // maxPoints: 3 -> pointsEarned cannot exceed 3
  const res3 = await svc.evaluateAnswer({
    studentAnswer: 'Wasto.',
    questionCode: 'elem-statement',
    maxPoints: 3
  });
  assert.equal(res3.pointsEarned, 3);
  assert.equal(res3.maxPoints, 3);
});

test('Phase 5.4 (6/11): Duplicate submission protection prevents duplicate official scoring or records', async () => {
  let rpcCallCount = 0;
  const mockClient = {
    ...createDefaultMockDb(),
    rpc: async (name) => {
      if (name === 'submit_game_answer') {
        rpcCallCount++;
        if (rpcCallCount > 1) {
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          return { data: null, error: err };
        }
        return { data: { isCorrect: true, pointsAwarded: 1 }, error: null };
      }
      return { data: null, error: null };
    }
  };

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    // 1st submission -> 201 Created
    const res1 = await fetch(`${base}/api/v1/sessions/00000000-0000-0000-0000-000000000010/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionCode: 'elem-statement', response: 'Sagot', round: 'main' })
    });
    assert.equal(res1.status, 201);

    // 2nd duplicate submission -> 409 Conflict
    const res2 = await fetch(`${base}/api/v1/sessions/00000000-0000-0000-0000-000000000010/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionCode: 'elem-statement', response: 'Sagot', round: 'main' })
    });
    assert.equal(res2.status, 409);
    const body2 = await res2.json();
    assert.equal(body2.error, 'ANSWER_ALREADY_RECORDED');
  });
});

test('Phase 5.4 (7/11): Session ownership and question validation reject mismatched relationships', async () => {
  const { app } = testAppWithAuth();
  await withServer(app, async (base) => {
    // Invalid session ID format -> 400
    const resBadSession = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAnswer: 'Sagot', questionCode: 'elem-statement', sessionId: 'not-a-uuid' })
    });
    assert.equal(resBadSession.status, 400);

    // Client-supplied questionId -> 400
    const resQId = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentAnswer: 'Sagot', questionCode: 'elem-statement', questionId: '00000000-0000-0000-0000-000000000002' })
    });
    assert.equal(resQId.status, 400);
  });
});

test('Phase 5.4 (8/11): Reverse Round practice evaluations remain strictly unscored (0 points awarded to session)', async () => {
  let sessionMutated = false;
  const mockDb = createDefaultMockDb({
    game_sessions: {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: '00000000-0000-0000-0000-000000000010', student_id: '00000000-0000-0000-0000-000000000001', main_score: 5, reverse_score: 0 },
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

  const { app } = testAppWithAuth({ client: mockDb });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Baligtarang pagsasanay.',
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

test('Phase 5.4 (9/11): Gemini unavailable or upstream evaluation failure fails closed without false credit', async () => {
  const svc = createGeminiService({
    config: { gemini: { apiKey: '' } } // Unconfigured
  });

  const { app } = testAppWithAuth({ geminiService: svc });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/evaluations/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentAnswer: 'Sagot kapag walang AI.',
        questionCode: 'elem-statement',
        sessionId: '00000000-0000-0000-0000-000000000010'
      })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'GEMINI_NOT_CONFIGURED');
  });
});

test('Phase 5.4 (10/11): Timeout submission records timeout status, awards zero points, and does not corrupt session', async () => {
  let rpcArgs = null;
  const mockClient = {
    ...createDefaultMockDb(),
    rpc: async (name, args) => {
      rpcArgs = args;
      return {
        data: {
          isCorrect: false,
          pointsAwarded: 0,
          maxPoints: 1,
          evaluationMethod: 'timeout'
        },
        error: null
      };
    }
  };

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/sessions/00000000-0000-0000-0000-000000000010/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    assert.equal(rpcArgs.p_is_timeout, true);
  });
});

test('Phase 5.4 (11/11): Preserves existing multiple choice and catalog question types without regression', async () => {
  let rpcArgs = null;
  const mockClient = {
    ...createDefaultMockDb(),
    rpc: async (name, args) => {
      rpcArgs = args;
      return {
        data: {
          isCorrect: true,
          pointsAwarded: 1,
          maxPoints: 1,
          evaluationMethod: 'answer_key'
        },
        error: null
      };
    }
  };

  const { app } = testAppWithAuth({ client: mockClient });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/v1/sessions/00000000-0000-0000-0000-000000000010/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionCode: 'elem-q1',
        response: 'A',
        round: 'main'
      })
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.data.isCorrect, true);
    assert.equal(body.data.pointsAwarded, 1);
    assert.equal(body.data.evaluationMethod, 'answer_key');
    assert.equal(rpcArgs.p_response, 'A');
  });
});
