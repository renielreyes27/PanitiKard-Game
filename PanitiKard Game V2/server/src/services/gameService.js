const { HttpError } = require('../middleware/httpError');

function sanitizeGameRuleMessage(error) {
  const raw = String(error?.message || '');
  if (raw && !/violates|constraint|relation\s+|pg_catalog/i.test(raw)) return raw;
  return 'The answer violates game rules.';
}

function sanitizeInvalidResponseMessage(error) {
  const raw = String(error?.message || '');
  if (raw && !/violates|constraint|relation\s+|pg_catalog/i.test(raw)) return raw;
  return 'The answer was not accepted.';
}

function dbFailure(error, action) {
  if (!error) return;
  if (error.code === '23505') throw new HttpError(409, 'ANSWER_ALREADY_RECORDED', 'An answer for this question and round is already recorded.');
  if (error.code === 'P0002') {
    const raw = String(error.message || '');
    if (/no published questions/i.test(raw)) {
      throw new HttpError(404, 'TOPIC_HAS_NO_QUESTIONS', 'This topic does not have any published questions for the selected game mode yet.');
    }
    if (/published topic not found|topic not found/i.test(raw)) {
      throw new HttpError(404, 'TOPIC_NOT_FOUND', 'The requested published topic was not found.');
    }
    throw new HttpError(404, 'SESSION_OR_QUESTION_NOT_FOUND', 'The session or published question was not found.');
  }
  if (error.code === '23514') throw new HttpError(409, 'GAME_RULE_REJECTED', sanitizeGameRuleMessage(error));
  if (error.code === '22023') throw new HttpError(400, 'INVALID_RESPONSE', sanitizeInvalidResponseMessage(error));
  if (error.code === '42501') throw new HttpError(403, 'FORBIDDEN', 'This operation is not permitted for this account.');
  console.error(`[Game] ${action} failed:`, error.code || error.message);
  throw new HttpError(503, 'DATABASE_ERROR', `Unable to ${action.toLowerCase()}.`);
}

function normalizeResponse(value, { allowEmpty = false } = {}) {
  if ((typeof value !== 'string' && !(allowEmpty && (value === null || value === undefined))) ||
      (typeof value === 'string' && value.length > 4000) ||
      (!allowEmpty && typeof value === 'string' && value.trim().length === 0)) {
    throw new HttpError(400, 'INVALID_RESPONSE', 'Answer must be a non-empty string up to 4000 characters unless this is a timeout.');
  }
  return typeof value === 'string' ? value.trim() : '';
}

function createGameService() {
  return {
    async createSession(client, user, input) {
      const topicCode = typeof input?.topicCode === 'string' ? input.topicCode : '';
      const mode = input?.mode;
      if (!topicCode || !['deck', 'quiz'].includes(mode)) {
        throw new HttpError(400, 'INVALID_SESSION', 'topicCode and mode (deck or quiz) are required.');
      }
      const { data, error } = await client.rpc('create_game_session', {
        p_topic_code: topicCode,
        p_mode: mode,
        p_student_name: String(input.studentName || user?.profile?.display_name || '').slice(0, 120)
      });
      dbFailure(error, 'Create session');
      return Array.isArray(data) ? data[0] : data;
    },

    async createGuestSession(adminClient, input) {
      const topicCode = typeof input?.topicCode === 'string' ? input.topicCode : '';
      const mode = input?.mode;
      const studentName = typeof input?.studentName === 'string' ? input.studentName.trim() : '';
      if (!studentName || studentName.length < 2 || studentName.length > 120) {
        throw new HttpError(400, 'INVALID_STUDENT_NAME', 'Student name must be between 2 and 120 characters.');
      }
      if (!topicCode || !['deck', 'quiz'].includes(mode)) {
        throw new HttpError(400, 'INVALID_SESSION', 'topicCode and mode (deck or quiz) are required.');
      }
      if (!adminClient || typeof adminClient.rpc !== 'function') {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is required to create a guest session.');
      }
      const { data, error } = await adminClient.rpc('create_guest_game_session', {
        p_topic_code: topicCode,
        p_mode: mode,
        p_student_name: studentName
      });
      dbFailure(error, 'Create guest session');
      return Array.isArray(data) ? data[0] : data;
    },

    async submitAnswer(client, user, sessionId, input) {
      const questionCode = input?.questionCode;
      const round = input?.round || 'main';
      const isTimeout = input?.isTimeout === true;
      const response = normalizeResponse(input?.response, { allowEmpty: isTimeout });
      if (typeof questionCode !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(questionCode)) {
        throw new HttpError(400, 'INVALID_QUESTION_CODE', 'A valid questionCode is required.');
      }
      if (!['main', 'reverse'].includes(round)) throw new HttpError(400, 'INVALID_ROUND', 'round must be main or reverse.');
      const { data, error } = await client.rpc('submit_game_answer', {
        p_session_id: sessionId,
        p_question_code: questionCode,
        p_round: round,
        p_response: response,
        p_is_timeout: isTimeout
      });
      dbFailure(error, 'Record answer');
      return Array.isArray(data) ? data[0] : data;
    },

    async startGuestTimer(adminClient, sessionId, input) {
      const questionCode = input?.questionCode;
      const round = input?.round || 'main';
      if (typeof questionCode !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(questionCode)) {
        throw new HttpError(400, 'INVALID_QUESTION_CODE', 'A valid questionCode is required.');
      }
      if (!['main', 'reverse'].includes(round)) {
        throw new HttpError(400, 'INVALID_ROUND', 'round must be main or reverse.');
      }
      if (!adminClient || typeof adminClient.rpc !== 'function') {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is required to start question timer.');
      }
      const { data, error } = await adminClient.rpc('start_guest_question_timer', {
        p_session_id: sessionId,
        p_question_code: questionCode,
        p_round: round
      });
      dbFailure(error, 'Start question timer');
      return Array.isArray(data) ? data[0] : data;
    },

    async submitGuestAnswer(adminClient, sessionId, input) {
      const questionCode = input?.questionCode;
      const round = input?.round || 'main';
      const isTimeout = input?.isTimeout === true;
      const response = normalizeResponse(input?.response, { allowEmpty: isTimeout });
      if (typeof questionCode !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(questionCode)) {
        throw new HttpError(400, 'INVALID_QUESTION_CODE', 'A valid questionCode is required.');
      }
      if (!['main', 'reverse'].includes(round)) throw new HttpError(400, 'INVALID_ROUND', 'round must be main or reverse.');
      if (!adminClient || typeof adminClient.rpc !== 'function') {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is required to record guest answer.');
      }
      const { data, error } = await adminClient.rpc('submit_guest_game_answer', {
        p_session_id: sessionId,
        p_question_code: questionCode,
        p_round: round,
        p_response: response,
        p_is_timeout: isTimeout
      });
      dbFailure(error, 'Record guest answer');
      return Array.isArray(data) ? data[0] : data;
    },

    async finishSession(client, sessionId) {
      const { data, error } = await client.rpc('finish_game_session', { p_session_id: sessionId });
      dbFailure(error, 'Finish session');
      return Array.isArray(data) ? data[0] : data;
    },

    async finishGuestSession(adminClient, sessionId) {
      if (!adminClient || typeof adminClient.rpc !== 'function') {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is required to finish guest session.');
      }
      const { data, error } = await adminClient.rpc('finish_guest_game_session', { p_session_id: sessionId });
      dbFailure(error, 'Finish guest session');
      return Array.isArray(data) ? data[0] : data;
    },

    async getSession(client, sessionId) {
      const { data: session, error } = await client.from('game_sessions')
        .select('id, topic_id, mode, status, student_name_snapshot, main_score, reverse_score, started_at, completed_at')
        .eq('id', sessionId).maybeSingle();
      dbFailure(error, 'Load session');
      if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found.');
      const { data: answers, error: answersError } = await client.from('student_answers')
        .select('question_id, question_version_id, round, response, is_correct, points_awarded, max_points, evaluation_method, evaluation_record, answered_at')
        .eq('session_id', sessionId).order('answered_at');
      dbFailure(answersError, 'Load session answers');
      return { ...session, answers: answers || [] };
    },

    async getGuestSession(adminClient, sessionId) {
      if (!adminClient || typeof adminClient.from !== 'function') {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is required to load guest session.');
      }
      const { data: session, error } = await adminClient.from('game_sessions')
        .select('id, topic_id, mode, status, student_name_snapshot, main_score, reverse_score, started_at, completed_at')
        .eq('id', sessionId).maybeSingle();
      dbFailure(error, 'Load guest session');
      if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found.');
      const { data: answers, error: answersError } = await adminClient.from('student_answers')
        .select('question_id, question_version_id, round, response, is_correct, points_awarded, max_points, evaluation_method, evaluation_record, answered_at')
        .eq('session_id', sessionId).order('answered_at');
      dbFailure(answersError, 'Load guest session answers');
      return { ...session, answers: answers || [] };
    }
  };
}

module.exports = { createGameService, normalizeResponse };
