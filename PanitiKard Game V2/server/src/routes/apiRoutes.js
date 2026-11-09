const express = require('express');
const { createAuthenticator, createGuestOrUserAuthenticator, requireStaff, requireAdmin } = require('../middleware/authenticate');
const { createRubricEvaluatorService, validateEvaluationInput } = require('../services/rubricEvaluator');
const { generateGuestToken, isGuestToken } = require('../services/guestTokenService');
const { getSupabaseAdmin } = require('../services/supabase');
const { PANITIKARD_DECKS } = require('../../../js/cards-data');
const { quizRubrics } = require('../../../js/answer-evaluator');
const { HttpError } = require('../middleware/httpError');
const config = require('../config/environment');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
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
            rubricCriteria: card.terms || card.rubricGroups || [],
            acceptedAnswers: Array.isArray(card.acceptedAnswers) ? card.acceptedAnswers : [],
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
            rubricCriteria: q.rubricGroups || (quizRubrics && quizRubrics[questionCode]) || [],
            acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
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
    .select('expected_answer, rubric_groups, accepted_answers')
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
    : (staticCard?.terms || staticCard?.rubricGroups || (quizRubrics && quizRubrics[questionCode]) || []);
  const acceptedAnswers = (Array.isArray(dbR?.accepted_answers) && dbR.accepted_answers.length > 0)
    ? dbR.accepted_answers
    : (Array.isArray(staticCard?.acceptedAnswers) ? staticCard.acceptedAnswers : []);

  const prompt = dbV.prompt || staticCard?.prompt || staticCard?.question || '';
  const points = typeof dbV.points === 'number' ? dbV.points : (staticCard?.points ?? 1);
  const category = dbV.category_label || dbV.tag || staticCard?.type || staticCard?.tag || 'statement';
  const topicTitle = dbQ.topics?.title || staticTopic || 'Panitikan at Wika';
  const topicCode = dbQ.topics?.code || staticTopicKey || null;

  return {
    prompt,
    expectedAnswer,
    rubricCriteria,
    acceptedAnswers,
    category,
    topic: topicTitle,
    topicCode,
    points,
    dbQuestionId: dbQ.id,
    dbQuestionVersionId: dbV.id
  };
}

function createApiRouter({ catalogService, gameService, contentService, evaluatorService = createRubricEvaluatorService(), authenticate = createAuthenticator(), adminClientFactory = getSupabaseAdmin }) {
  const evaluator = evaluatorService;
  const router = express.Router();
  const guestOrUserAuth = createGuestOrUserAuthenticator({ userAuthenticator: authenticate });
  const topicCodeParam = (req) => {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(req.params.topicCode || '')) throw new HttpError(400, 'INVALID_TOPIC_CODE', 'Invalid topic code.');
    return req.params.topicCode;
  };

  // --------------------------------------------------------------------------
  // Authentication identity & public config endpoints
  // --------------------------------------------------------------------------
  router.get('/auth/config', (_req, res) => {
    res.json({
      success: true,
      data: {
        configured: Boolean(config.supabase?.url && config.supabase?.anonKey && !config.supabase.anonKey.includes('your_supabase_')),
        supabaseUrl: config.supabase?.url || '',
        supabaseAnonKey: config.supabase?.anonKey || ''
      }
    });
  });

  router.get('/auth/me', authenticate, asyncRoute(async (req, res) => {
    res.json({
      success: true,
      data: {
        id: req.auth.user.id,
        email: req.auth.user.email || null,
        role: req.auth.profile.role,
        displayName: req.auth.profile.display_name || null
      }
    });
  }));

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

  router.get('/admin/topics', guestOrUserAuth, requireStaff, asyncRoute(async (req, res) => {
    const topics = await catalogService.listAllTopics(req.auth.client);
    res.json({ success: true, data: topics });
  }));

  router.get('/admin/topics/:topicCode/questions', guestOrUserAuth, requireStaff, asyncRoute(async (req, res) => {
    const result = await catalogService.listQuestions(topicCodeParam(req), req.auth.client, { includeDrafts: true });
    res.json({ success: true, data: result });
  }));

  router.get('/admin/questions/:questionCode', guestOrUserAuth, requireStaff, asyncRoute(async (req, res) => {
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(req.params.questionCode || '')) throw new HttpError(400, 'INVALID_QUESTION_CODE', 'Invalid question code.');
    const options = {};
    if (req.query.version !== undefined && req.query.version !== null) options.version = req.query.version;
    if (req.query.previewDraft === 'true') options.previewDraft = true;
    const detail = await catalogService.getQuestionDetail(req.params.questionCode, req.auth.client, options);
    res.json({ success: true, data: detail });
  }));

  router.post('/sessions', asyncRoute(async (req, res) => {
    const adminClient = typeof adminClientFactory === 'function' ? adminClientFactory() : adminClientFactory;
    const header = req.get('authorization') || '';
    const match = header.match(/^Bearer\s+([^\s]+)$/i);
    const rawToken = match ? match[1] : '';

    // If an authorization token was provided and it is a guest token, that is invalid for creating a new session
    if (rawToken && isGuestToken(rawToken)) {
      throw new HttpError(400, 'INVALID_SESSION_REQUEST', 'Cannot use an existing guest token to create a session.');
    }

    // Try user authentication first if a token or a test-authenticator is present
    let authError = null;
    let isAuthenticatedUser = false;
    await new Promise((resolve) => {
      authenticate(req, res, (err) => {
        if (err) {
          authError = err;
        } else if (req.auth?.user) {
          isAuthenticatedUser = true;
        }
        resolve();
      });
    });

    if (isAuthenticatedUser) {
      const session = await gameService.createSession(req.auth.client, req.auth, req.body);
      return res.status(201).json({ success: true, data: session });
    }

    // Unauthenticated: Check if this is a valid guest session creation request
    const studentName = typeof req.body?.studentName === 'string' ? req.body.studentName.trim() : '';
    if (!studentName || studentName.length < 2 || studentName.length > 120) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'studentName')) {
        throw new HttpError(400, 'INVALID_STUDENT_NAME', 'Student name must be between 2 and 120 characters.');
      }
      // If neither authenticated nor a valid guest name, rethrow authError or 401
      throw authError || new HttpError(401, 'AUTH_REQUIRED', 'A valid student name or access token is required.');
    }

    const session = await gameService.createGuestSession(adminClient, req.body);
    const sessionToken = generateGuestToken({
      sessionId: session.id,
      studentName: session.student_name_snapshot || studentName
    });

    res.status(201).json({
      success: true,
      data: {
        ...session,
        sessionToken
      }
    });
  }));

  router.get('/sessions/:sessionId', guestOrUserAuth, asyncRoute(async (req, res) => {
    const adminClient = typeof adminClientFactory === 'function' ? adminClientFactory() : adminClientFactory;
    if (req.auth?.isGuest) {
      if (req.auth.guestSession?.sessionId !== req.params.sessionId) {
        throw new HttpError(403, 'FORBIDDEN_SESSION', 'Cannot access another guest session.');
      }
      const session = await gameService.getGuestSession(adminClient, req.params.sessionId);
      return res.json({ success: true, data: session });
    }
    const session = await gameService.getSession(req.auth.client, req.params.sessionId);
    res.json({ success: true, data: session });
  }));

  router.post('/sessions/:sessionId/timers', guestOrUserAuth, asyncRoute(async (req, res) => {
    const adminClient = typeof adminClientFactory === 'function' ? adminClientFactory() : adminClientFactory;
    const sessionId = req.params.sessionId;

    if (req.auth?.isGuest) {
      if (req.auth.guestSession?.sessionId !== sessionId) {
        throw new HttpError(403, 'FORBIDDEN_SESSION', 'Cannot access timers for another session.');
      }
    } else if (!req.auth?.user) {
      throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication or valid guest token required.');
    }

    const questionCode = req.body?.questionCode;
    const round = req.body?.round || 'main';
    if (!questionCode || typeof questionCode !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(questionCode)) {
      throw new HttpError(400, 'INVALID_QUESTION_CODE', 'A valid questionCode is required.');
    }
    if (!['main', 'reverse'].includes(round)) {
      throw new HttpError(400, 'INVALID_ROUND', 'round must be main or reverse.');
    }

    const result = await gameService.startGuestTimer(adminClient, sessionId, { questionCode, round });

    res.status(200).json({
      success: true,
      data: result
    });
  }));

  router.post('/sessions/:sessionId/answers', guestOrUserAuth, asyncRoute(async (req, res) => {
    const adminClient = typeof adminClientFactory === 'function' ? adminClientFactory() : adminClientFactory;
    if (req.auth?.isGuest) {
      if (req.auth.guestSession?.sessionId !== req.params.sessionId) {
        throw new HttpError(403, 'FORBIDDEN_SESSION', 'Cannot submit answers for another session.');
      }
      const result = await gameService.submitGuestAnswer(adminClient, req.params.sessionId, req.body);
      return res.status(201).json({ success: true, data: result });
    }
    const result = await gameService.submitAnswer(req.auth.client, req.auth, req.params.sessionId, req.body);
    res.status(201).json({ success: true, data: result });
  }));

  router.post('/sessions/:sessionId/finish', guestOrUserAuth, asyncRoute(async (req, res) => {
    const adminClient = typeof adminClientFactory === 'function' ? adminClientFactory() : adminClientFactory;
    if (req.auth?.isGuest) {
      if (req.auth.guestSession?.sessionId !== req.params.sessionId) {
        throw new HttpError(403, 'FORBIDDEN_SESSION', 'Cannot finish another session.');
      }
      const session = await gameService.finishGuestSession(adminClient, req.params.sessionId);
      return res.json({ success: true, data: session });
    }
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

  router.post('/admin/questions/:questionCode/publish', authenticate, requireStaff, asyncRoute(async (req, res) => {
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(req.params.questionCode || '')) throw new HttpError(400, 'INVALID_QUESTION_CODE', 'Invalid question code.');
    const targetVersion = req.body?.versionNumber ? parseInt(req.body.versionNumber, 10) : null;
    const result = await contentService.publishQuestion(req.auth.client, req.params.questionCode, targetVersion);
    res.json({ success: true, data: result });
  }));

  router.post('/admin/questions/:questionCode/unpublish', authenticate, requireStaff, asyncRoute(async (req, res) => {
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(req.params.questionCode || '')) throw new HttpError(400, 'INVALID_QUESTION_CODE', 'Invalid question code.');
    const result = await contentService.unpublishQuestion(req.auth.client, req.params.questionCode);
    res.json({ success: true, data: result });
  }));

  router.delete('/admin/questions/:questionCode', authenticate, requireStaff, asyncRoute(async (req, res) => {
    if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(req.params.questionCode || '')) throw new HttpError(400, 'INVALID_QUESTION_CODE', 'Invalid question code.');
    const question = await contentService.archiveQuestion(req.auth.client, req.params.questionCode);
    res.json({ success: true, data: question });
  }));

  // --------------------------------------------------------------------------
  // Phase 6.6: Rubric Management Endpoints (staff-only read-aggregated views)
  // --------------------------------------------------------------------------

  // GET /admin/rubrics — list rubric summaries across all questions for authorized staff
  // GET /admin/rubrics?topicCode=xyz — same, filtered by topic
  // Rubrics are always tied to a question version; this is an aggregated read-only view.
  // "Editing" a rubric is done via PUT /admin/questions/:code (which creates a new immutable version+rubric).
  router.get('/admin/rubrics', authenticate, requireStaff, asyncRoute(async (req, res) => {
    const topicCode = req.query.topicCode
      ? String(req.query.topicCode).trim()
      : null;
    if (topicCode && !/^[a-z0-9][a-z0-9-]{0,79}$/.test(topicCode)) {
      throw new HttpError(400, 'INVALID_TOPIC_CODE', 'Invalid topic code format.');
    }
    const rubrics = await catalogService.listRubrics(req.auth.client, topicCode ? { topicCode } : {});
    res.json({ success: true, data: rubrics });
  }));

  // Reserved for a future, explicitly authorized administration workflow.
  router.put('/admin/profiles/:userId/role', authenticate, requireAdmin, (_req, _res, next) => {
    next(new HttpError(501, 'ROLE_PROVISIONING_NOT_IMPLEMENTED', 'Assign elevated roles through a trusted Supabase admin workflow.'));
  });

  // --------------------------------------------------------------------------
  // Deterministic Rubric-Based Evaluation Endpoints
  // (Backend-only deterministic rubric evaluator — no external AI API required)
  // --------------------------------------------------------------------------
  const activeEvaluations = new Map();

  router.get('/evaluations/answer/status', asyncRoute(async (_req, res) => {
    res.json({ success: true, data: evaluator.getStatus() });
  }));

  const handleAnswerEvaluation = asyncRoute(async (req, res) => {
    const validated = validateEvaluationInput(req.body);
    const isGuest = Boolean(req.auth?.isGuest);
    let studentId = null;

    if (isGuest) {
      if (!validated.sessionId) {
        throw new HttpError(400, 'SESSION_REQUIRED', 'sessionId is required for guest evaluation.');
      }
      if (validated.sessionId !== req.auth.guestSession?.sessionId) {
        throw new HttpError(403, 'FORBIDDEN_SESSION', 'Guest token does not match the requested session.');
      }
    } else {
      studentId = req.auth?.user?.id;
      if (!studentId) {
        throw new HttpError(401, 'AUTH_REQUIRED', 'Authentication required.');
      }

      // Standalone / Practice Mode: If sessionId is null/omitted, evaluation is permitted
      // as an unattached formative practice check (persisted with session_id = null).
      if (validated.sessionId && (!req.auth?.client || typeof req.auth.client.from !== 'function')) {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database client is required to verify session.');
      }
    }

    const lockKey = isGuest
      ? `guest:${req.auth.guestSession.sessionId}:${validated.questionCode}:${validated.studentAnswer.trim()}`
      : `${studentId}:${validated.sessionId || 'standalone'}:${validated.questionCode}:${validated.studentAnswer.trim()}`;

    // Backend In-Flight Deduplication: identical concurrent evaluations share the same task.
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
      // Server-side retrieval of question context and private rubric.
      // Private rubric (expected_answer, rubric_groups, accepted_answers) is retrieved via adminClient
      // to bypass the student-scoped RLS on question_evaluation_rubrics.
      const adminClient = typeof adminClientFactory === 'function' ? adminClientFactory() : adminClientFactory;
      const queryClient = req.auth?.client || adminClient;
      const context = await resolveQuestionContext(validated.questionCode, queryClient, {
        adminClient,
        callerRole: req.auth?.profile?.role || (isGuest ? 'guest' : 'student')
      });

      const acceptedAnswers = Array.isArray(context.acceptedAnswers) ? context.acceptedAnswers : [];

      // Safe Database Idempotency Check:
      // If this exact answer was already evaluated and persisted for this session, return it.
      const aiTable = queryClient && typeof queryClient.from === 'function'
        ? queryClient.from('ai_evaluations')
        : null;

      if (validated.sessionId && aiTable && typeof aiTable.select === 'function') {
        let idempotencyQuery = aiTable
          .select('id, is_semantic_match, semantic_score, confidence_score, feedback, rubric_criteria, raw_model_response, model_version, status, evaluated_at')
          .eq('session_id', validated.sessionId)
          .eq('question_id', context.dbQuestionId)
          .eq('student_answer', validated.studentAnswer);

        if (!isGuest && studentId) {
          idempotencyQuery = idempotencyQuery.eq('student_id', studentId);
        }

        const { data: existingRecord } = await idempotencyQuery
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingRecord) {
          const maxPoints = typeof context.points === 'number' ? context.points : 1;
          let pointsEarned = existingRecord.is_semantic_match
            ? maxPoints
            : parseFloat(((parseFloat(existingRecord.semantic_score) || 0) * maxPoints).toFixed(2));
          if (!existingRecord.is_semantic_match && maxPoints > 0 && pointsEarned >= maxPoints) {
            pointsEarned = Math.max(0, parseFloat((maxPoints - 0.01).toFixed(2)));
          }
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
            maxPoints,
            model: existingRecord.model_version,
            status: existingRecord.status,
            evaluationMethod: 'deterministic_rubric',
            evaluatedAt: existingRecord.evaluated_at,
            persisted: true,
            evaluationId: existingRecord.id,
            isDuplicate: true
          };
        }
      }

      // Deterministic rubric evaluation — no external AI call.
      const evaluation = await evaluator.evaluateAnswer({
        studentAnswer: validated.studentAnswer,
        questionCode: validated.questionCode,
        questionPrompt: context.prompt,
        expectedAnswer: context.expectedAnswer,
        rubricCriteria: context.rubricCriteria,
        acceptedAnswers,
        category: context.category,
        topic: context.topic,
        topicCode: context.topicCode,
        maxPoints: context.points
      });

      // Persist the evaluation record.
      // Reads use queryClient (RLS-scoped); INSERT uses adminClient (service-role) only.
      let persisted = false;
      let evaluationId = null;

      if (queryClient && typeof queryClient.from === 'function') {
        const record = await evaluator.recordEvaluation(req.auth?.client, adminClient, {
          isGuest,
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
          evaluationSummary: evaluation.evaluationSummary,
          model: evaluation.model,
          status: evaluation.status,
          evaluatedAt: evaluation.evaluatedAt,
          evaluationMethod: evaluation.evaluationMethod
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
  });

  router.post('/evaluations/answer', guestOrUserAuth, handleAnswerEvaluation);

  return router;
}

module.exports = { createApiRouter, asyncRoute };
