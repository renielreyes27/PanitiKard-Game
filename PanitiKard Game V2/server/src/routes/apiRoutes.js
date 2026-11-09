const express = require('express');
const { createAuthenticator, requireStaff, requireAdmin } = require('../middleware/authenticate');
const { createGeminiService, validateEvaluationInput } = require('../services/gemini');
const { getSupabaseAdmin } = require('../services/supabase');
const { PANITIKARD_DECKS } = require('../../../js/cards-data');
const { HttpError } = require('../middleware/httpError');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

async function resolveQuestionContext(questionCode, client, options = {}) {
  const adminClient = (options && typeof options.from === 'function')
    ? options
    : (options?.adminClient || null);
  const callerRole = options?.callerRole || 'student';

  // If no database client is provided, support standalone offline fallback from static deck
  if (!client || typeof client.from !== 'function') {
    let staticMatched = null;
    for (const topicKey of Object.keys(PANITIKARD_DECKS || {})) {
      const topic = PANITIKARD_DECKS[topicKey];
      if (Array.isArray(topic.cards)) {
        const card = topic.cards.find(c => c.id === questionCode);
        if (card) {
          staticMatched = {
            prompt: card.prompt,
            expectedAnswer: card.answer,
            rubricCriteria: card.terms || [],
            category: card.type || card.tag || 'statement',
            topic: topic.title || topicKey,
            topicCode: topicKey,
            points: card.points ?? 1,
            dbQuestionId: null,
            dbQuestionVersionId: null
          };
          break;
        }
      }
      if (Array.isArray(topic.questions)) {
        const q = topic.questions.find(item => item.id === questionCode);
        if (q) {
          staticMatched = {
            prompt: q.question,
            expectedAnswer: q.answer,
            rubricCriteria: q.rubricGroups || [],
            category: q.category || 'quiz',
            topic: topic.title || topicKey,
            topicCode: topicKey,
            points: q.points ?? 1,
            dbQuestionId: null,
            dbQuestionVersionId: null
          };
          break;
        }
      }
    }
    if (!staticMatched) {
      throw new HttpError(404, 'QUESTION_NOT_FOUND', `Question '${questionCode}' was not found.`);
    }
    return staticMatched;
  }

  // Database client is provided: strict database validation without silent fallback
  // 1. Verify question existence and active status in questions table
  const { data: dbQ, error: qErr } = await client
    .from('questions')
    .select('id, code, current_version, status, archived_at, topic_id, topics(title, code)')
    .eq('code', questionCode)
    .maybeSingle();

  if (qErr) {
    throw new HttpError(503, 'DATABASE_ERROR', `Failed to verify question: ${qErr.message}`);
  }
  if (!dbQ) {
    throw new HttpError(404, 'QUESTION_NOT_FOUND', `Question '${questionCode}' was not found in the database.`);
  }
  if (dbQ.status === 'archived' || dbQ.archived_at) {
    throw new HttpError(404, 'QUESTION_NOT_FOUND', `Question '${questionCode}' is archived.`);
  }

  // 2. Verify current question version existence in question_versions table
  const { data: dbV, error: vErr } = await client
    .from('question_versions')
    .select('id, prompt, points, question_id, version_number, category_label, tag')
    .eq('question_id', dbQ.id)
    .eq('version_number', dbQ.current_version)
    .maybeSingle();

  if (vErr) {
    throw new HttpError(503, 'DATABASE_ERROR', `Failed to verify question version: ${vErr.message}`);
  }
  if (!dbV) {
    throw new HttpError(404, 'QUESTION_VERSION_NOT_FOUND', `Current version (${dbQ.current_version}) for question '${questionCode}' was not found.`);
  }
  if (dbV.question_id && dbV.question_id !== dbQ.id) {
    throw new HttpError(400, 'QUESTION_VERSION_MISMATCH', 'Resolved question version does not belong to the question.');
  }

  // 3. Query Rubric from question_evaluation_rubrics table
  // SECURITY REQUIREMENT:
  // question_evaluation_rubrics has a staff-only SELECT RLS policy:
  //   create policy question_rubrics_staff_read on question_evaluation_rubrics for select to authenticated using (is_teacher_or_admin());
  // When an authenticated student calls the evaluation endpoint, querying with the student's client
  // would be filtered by RLS and return empty results (data: null).
  // To avoid misinterpreting an RLS restriction as a genuinely missing rubric:
  // After authenticating the student and validating question/version existence with the caller's client,
  // we retrieve the rubric using the trusted server-side adminClient (service_role), strictly scoped to dbV.id.
  // If no adminClient is configured (e.g. staff caller or offline mode), it falls back to the caller's client.
  const rubricClient = (adminClient && typeof adminClient.from === 'function')
    ? adminClient
    : client;

  const { data: dbR, error: rErr } = await rubricClient
    .from('question_evaluation_rubrics')
    .select('expected_answer, rubric_groups')
    .eq('question_version_id', dbV.id)
    .maybeSingle();

  if (rErr) {
    throw new HttpError(503, 'DATABASE_ERROR', `Failed to verify question rubric: ${rErr.message}`);
  }

  // 4. Resolve fallback metadata from static decks if rubric is genuinely missing in DB
  let staticCard = null;
  let staticTopic = null;
  let staticTopicKey = null;
  for (const topicKey of Object.keys(PANITIKARD_DECKS || {})) {
    const topic = PANITIKARD_DECKS[topicKey];
    if (Array.isArray(topic.cards)) {
      const c = topic.cards.find(item => item.id === questionCode);
      if (c) { staticCard = c; staticTopic = topic.title || topicKey; staticTopicKey = topicKey; break; }
    }
    if (Array.isArray(topic.questions)) {
      const q = topic.questions.find(item => item.id === questionCode);
      if (q) { staticCard = q; staticTopic = topic.title || topicKey; staticTopicKey = topicKey; break; }
    }
  }

  const expectedAnswer = dbR?.expected_answer || staticCard?.answer || '';
  const rubricCriteria = (Array.isArray(dbR?.rubric_groups) && dbR.rubric_groups.length > 0)
    ? dbR.rubric_groups
    : (staticCard?.terms || staticCard?.rubricGroups || []);

  const prompt = dbV.prompt || staticCard?.prompt || staticCard?.question || '';
  const points = typeof dbV.points === 'number' ? dbV.points : (staticCard?.points ?? 1);
  const category = dbV.category_label || dbV.tag || staticCard?.type || staticCard?.tag || 'statement';
  const topicTitle = dbQ.topics?.title || staticTopic || 'Panitikan at Wika';
  const topicCode = dbQ.topics?.code || staticTopicKey || null;

  return {
    prompt,
    expectedAnswer,
    rubricCriteria,
    category,
    topic: topicTitle,
    topicCode,
    points,
    dbQuestionId: dbQ.id,
    dbQuestionVersionId: dbV.id
  };
}

function createApiRouter({ catalogService, gameService, contentService, geminiService = createGeminiService(), authenticate = createAuthenticator(), adminClientFactory = getSupabaseAdmin }) {
  const router = express.Router();
  const topicCodeParam = (req) => {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(req.params.topicCode || '')) throw new HttpError(400, 'INVALID_TOPIC_CODE', 'Invalid topic code.');
    return req.params.topicCode;
  };

  router.get('/topics', asyncRoute(async (_req, res) => {
    const topics = await catalogService.listTopics();
    if (topics === null) return res.json({ success: true, source: 'bundled-fallback', data: null });
    res.json({ success: true, data: topics });
  }));

  router.get('/topics/:topicCode/questions', asyncRoute(async (req, res) => {
    const code = topicCodeParam(req);
    const kind = req.query.kind || 'all';
    if (!['all', 'cards', 'quiz'].includes(kind)) throw new HttpError(400, 'INVALID_KIND', 'kind must be all, cards, or quiz.');
    const result = await catalogService.listQuestions(code, undefined, { kind });
    if (result === null) return res.json({ success: true, source: 'bundled-fallback', data: null });
    res.json({ success: true, data: result });
  }));

  router.get('/admin/topics/:topicCode/questions', authenticate, requireStaff, asyncRoute(async (req, res) => {
    const result = await catalogService.listQuestions(topicCodeParam(req), req.auth.client, { includeDrafts: true });
    res.json({ success: true, data: result });
  }));

  router.post('/sessions', authenticate, asyncRoute(async (req, res) => {
    const session = await gameService.createSession(req.auth.client, req.auth, req.body);
    res.status(201).json({ success: true, data: session });
  }));

  router.get('/sessions/:sessionId', authenticate, asyncRoute(async (req, res) => {
    const session = await gameService.getSession(req.auth.client, req.params.sessionId);
    res.json({ success: true, data: session });
  }));

  router.post('/sessions/:sessionId/answers', authenticate, asyncRoute(async (req, res) => {
    const result = await gameService.submitAnswer(req.auth.client, req.auth, req.params.sessionId, req.body);
    res.status(201).json({ success: true, data: result });
  }));

  router.post('/sessions/:sessionId/finish', authenticate, asyncRoute(async (req, res) => {
    const session = await gameService.finishSession(req.auth.client, req.params.sessionId);
    res.json({ success: true, data: session });
  }));

  router.post('/admin/topics', authenticate, requireStaff, asyncRoute(async (req, res) => {
    const topic = await contentService.createTopic(req.auth.client, req.auth.user.id, req.body);
    res.status(201).json({ success: true, data: topic });
  }));

  router.patch('/admin/topics/:topicCode', authenticate, requireStaff, asyncRoute(async (req, res) => {
    const topic = await contentService.updateTopic(req.auth.client, topicCodeParam(req), req.body);
    res.json({ success: true, data: topic });
  }));

  router.post('/admin/topics/:topicCode/questions', authenticate, requireStaff, asyncRoute(async (req, res) => {
    const question = await contentService.createQuestion(req.auth.client, req.auth.user.id, topicCodeParam(req), req.body);
    res.status(201).json({ success: true, data: question });
  }));

  router.put('/admin/questions/:questionCode', authenticate, requireStaff, asyncRoute(async (req, res) => {
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(req.params.questionCode || '')) throw new HttpError(400, 'INVALID_QUESTION_CODE', 'Invalid question code.');
    const question = await contentService.reviseQuestion(req.auth.client, req.auth.user.id, req.params.questionCode, req.body);
    res.status(201).json({ success: true, data: question });
  }));

  router.delete('/admin/questions/:questionCode', authenticate, requireStaff, asyncRoute(async (req, res) => {
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(req.params.questionCode || '')) throw new HttpError(400, 'INVALID_QUESTION_CODE', 'Invalid question code.');
    const question = await contentService.archiveQuestion(req.auth.client, req.params.questionCode);
    res.json({ success: true, data: question });
  }));

  // Reserved for a future, explicitly authorized administration workflow.
  router.put('/admin/profiles/:userId/role', authenticate, requireAdmin, (_req, _res, next) => {
    next(new HttpError(501, 'ROLE_PROVISIONING_NOT_IMPLEMENTED', 'Assign elevated roles through a trusted Supabase admin workflow.'));
  });

  // --------------------------------------------------------------------------
  // Phase 5: Gemini AI Semantic Evaluation Endpoints
  // --------------------------------------------------------------------------
  const activeEvaluations = new Map();

  router.get('/evaluations/gemini/status', asyncRoute(async (_req, res) => {
    res.json({ success: true, data: geminiService.getStatus() });
  }));

  router.post('/evaluations/gemini', authenticate, asyncRoute(async (req, res) => {
    const validated = validateEvaluationInput(req.body);
    const studentId = req.auth?.user?.id;
    if (!studentId) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required.');
    }

    // Standalone / Practice Mode: If sessionId is null/omitted, evaluation is permitted
    // as an unattached formative practice check (persisted with session_id = null).
    if (validated.sessionId && (!req.auth?.client || typeof req.auth.client.from !== 'function')) {
      throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database client is required to verify session.');
    }

    const lockKey = `${studentId}:${validated.sessionId || 'standalone'}:${validated.questionCode}:${validated.studentAnswer.trim()}`;

    // Backend In-Flight Deduplication: If an identical evaluation is actively processing,
    // await that execution instead of initiating duplicate concurrent Gemini evaluations.
    if (activeEvaluations.has(lockKey)) {
      const inFlight = activeEvaluations.get(lockKey);
      const duplicateData = await inFlight;
      return res.status(200).json({
        success: true,
        data: {
          ...duplicateData,
          isDuplicate: true
        }
      });
    }

    const evaluationTask = (async () => {
      // Server-side retrieval of question context and private rubric:
      // Catalog validation uses student's client; private rubric is retrieved using adminClient.
      const adminClient = typeof adminClientFactory === 'function' ? adminClientFactory() : adminClientFactory;
      const context = await resolveQuestionContext(validated.questionCode, req.auth?.client, {
        adminClient,
        callerRole: req.auth?.profile?.role || 'student'
      });

      // Safe Database Idempotency Check:
      // If this exact answer was already evaluated and persisted for this session, return it
      const aiTable = req.auth?.client ? req.auth.client.from('ai_evaluations') : null;
      if (validated.sessionId && aiTable && typeof aiTable.select === 'function') {
        const { data: existingRecord } = await aiTable
          .select('id, is_semantic_match, semantic_score, confidence_score, feedback, rubric_criteria, raw_model_response, model_version, status, evaluated_at')
          .eq('student_id', studentId)
          .eq('session_id', validated.sessionId)
          .eq('question_id', context.dbQuestionId)
          .eq('student_answer', validated.studentAnswer)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingRecord) {
          const pointsEarned = parseFloat(((parseFloat(existingRecord.semantic_score) || 0) * (context.points || 1)).toFixed(2));
          return {
            questionCode: validated.questionCode,
            studentAnswer: validated.studentAnswer,
            isCorrect: existingRecord.is_semantic_match,
            isSemanticMatch: existingRecord.is_semantic_match,
            semanticScore: parseFloat(existingRecord.semantic_score),
            confidenceScore: existingRecord.confidence_score !== null ? parseFloat(existingRecord.confidence_score) : null,
            feedback: existingRecord.feedback,
            evaluationSummary: existingRecord.raw_model_response?.evaluationSummary || '',
            criteriaEvaluation: Array.isArray(existingRecord.rubric_criteria) ? existingRecord.rubric_criteria : [],
            pointsEarned,
            maxPoints: context.points || 1,
            model: existingRecord.model_version,
            status: existingRecord.status,
            evaluationMethod: 'gemini_semantic_evaluation',
            evaluatedAt: existingRecord.evaluated_at,
            persisted: true,
            evaluationId: existingRecord.id,
            isDuplicate: true
          };
        }
      }

      const evaluation = await geminiService.evaluateAnswer({
        studentAnswer: validated.studentAnswer,
        questionCode: validated.questionCode,
        questionPrompt: context.prompt,
        expectedAnswer: context.expectedAnswer,
        rubricCriteria: context.rubricCriteria,
        category: context.category,
        topic: context.topic,
        topicCode: context.topicCode,
        maxPoints: context.points
      });

      // Authoritative session ownership, question relationship verification, and persistence
      // occur in geminiService.recordEvaluation(). Reads use the student's RLS-scoped client;
      // the INSERT uses adminClient (service role) to prevent authenticated direct-forge attacks.
      let persisted = false;
      let evaluationId = null;

      if (req.auth?.client && typeof req.auth.client.from === 'function') {
        const record = await geminiService.recordEvaluation(req.auth.client, adminClient, {
          studentId,
          sessionId: validated.sessionId,
          questionId: context.dbQuestionId,
          questionCode: validated.questionCode,
          questionVersionId: context.dbQuestionVersionId,
          studentAnswer: validated.studentAnswer,
          isSemanticMatch: evaluation.isSemanticMatch,
          semanticScore: evaluation.semanticScore,
          confidenceScore: evaluation.confidenceScore,
          feedback: evaluation.feedback,
          criteriaEvaluation: evaluation.criteriaEvaluation,
          model: evaluation.model,
          status: evaluation.status,
          evaluatedAt: evaluation.evaluatedAt
        });

        if (!record || !record.id) {
          throw new HttpError(503, 'PERSISTENCE_FAILED', 'Failed to persist evaluation record.');
        }
        persisted = true;
        evaluationId = record.id;
      }

      return {
        ...evaluation,
        persisted,
        evaluationId
      };
    })();

    activeEvaluations.set(lockKey, evaluationTask);
    try {
      const evaluationData = await evaluationTask;
      res.status(200).json({
        success: true,
        data: evaluationData
      });
    } finally {
      activeEvaluations.delete(lockKey);
    }
  }));

  return router;
}

module.exports = { createApiRouter, asyncRoute };
