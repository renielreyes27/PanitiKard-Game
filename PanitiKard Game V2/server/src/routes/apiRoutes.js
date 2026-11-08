const express = require('express');
const { createAuthenticator, requireStaff, requireAdmin } = require('../middleware/authenticate');
const { HttpError } = require('../middleware/httpError');

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
}

function createApiRouter({ catalogService, gameService, contentService, authenticate = createAuthenticator() }) {
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

  return router;
}

module.exports = { createApiRouter, asyncRoute };
