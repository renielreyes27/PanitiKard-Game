const { getSupabase } = require('./supabase');
const { HttpError } = require('../middleware/httpError');

function throwDbError(error, operation) {
  if (!error) return;
  if (error.code === 'PGRST116') throw new HttpError(404, 'NOT_FOUND', `${operation} was not found.`);
  console.error(`[Catalog] ${operation} failed:`, error.code || error.message);
  throw new HttpError(503, 'DATABASE_ERROR', `Unable to ${operation.toLowerCase()}.`);
}

function publicPayload(payload) {
  const privateKeys = new Set(['answer', 'answerKey', 'expectedAnswer', 'acceptedAnswers', 'terms', 'rubricGroups', 'isCorrect', 'correctAnswer']);
  function scrub(value) {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !privateKeys.has(key))
      .map(([key, child]) => [key, scrub(child)]));
  }
  return scrub(payload || {});
}

function createCatalogService({ publicClientFactory = getSupabase } = {}) {
  return {
    async listTopics(client = publicClientFactory()) {
      if (!client) return null;
      const { data, error } = await client.from('topics')
        .select('id, code, title, description, competency, status')
        .eq('status', 'published').is('archived_at', null).order('title');
      throwDbError(error, 'List topics');
      return data || [];
    },

    async listQuestions(topicCode, client = publicClientFactory(), { includeDrafts = false, kind = 'all' } = {}) {
      if (!client) return null;
      const { data: topic, error: topicError } = await client.from('topics')
        .select('id, code, title, status').eq('code', topicCode).maybeSingle();
      throwDbError(topicError, 'Load topic');
      if (!topic || (!includeDrafts && topic.status !== 'published')) {
        throw new HttpError(404, 'TOPIC_NOT_FOUND', 'The topic is not available.');
      }

      let query = client.from('questions')
        .select('id, code, topic_id, card_category_id, question_type, status, current_version, archived_at, card_categories(code, label)')
        .eq('topic_id', topic.id).is('archived_at', null).order('code');
      if (!includeDrafts) query = query.eq('status', 'published');
      const { data: questions, error: questionsError } = await query;
      throwDbError(questionsError, 'List questions');

      const selected = (questions || []).filter(question => {
        if (kind === 'cards') return Boolean(question.card_category_id);
        if (kind === 'quiz') return !question.card_category_id;
        return true;
      });
      if (!selected.length) return { topic, questions: [] };

      const questionIds = selected.map(question => question.id);
      const { data: versions, error: versionsError } = await client.from('question_versions')
        .select('id, question_id, version_number, question_type, card_category_id, card_categories(code, label), title, prompt, explanation, hint, points, time_limit_seconds, difficulty, category_label, tag, payload, created_at')
        .in('question_id', questionIds);
      throwDbError(versionsError, 'Load question versions');
      const currentVersions = (versions || []).filter(version => {
        const question = selected.find(item => item.id === version.question_id);
        return question && version.version_number === question.current_version;
      });

      const versionIds = currentVersions.map(version => version.id);
      let choices = [];
      if (versionIds.length) {
        const { data, error } = await client.from('question_choices')
          .select('question_version_id, option_key, label, sort_order')
          .in('question_version_id', versionIds).order('sort_order');
        throwDbError(error, 'Load question choices');
        choices = data || [];
      }

      let rubrics = [];
      if (includeDrafts && versionIds.length) {
        const { data, error } = await client.from('question_evaluation_rubrics')
          .select('question_version_id, expected_answer, answer_key, accepted_answers, rubric_groups')
          .in('question_version_id', versionIds);
        throwDbError(error, 'Load staff question rubrics');
        rubrics = data || [];
      }

      const result = selected.flatMap(question => {
        const version = currentVersions.find(item => item.question_id === question.id);
        if (!version) return [];
        const versionChoices = choices.filter(choice => choice.question_version_id === version.id)
          .map(({ option_key, label, sort_order }) => ({ key: option_key, text: label, sortOrder: sort_order }));
        const rubric = includeDrafts ? rubrics.find(item => item.question_version_id === version.id) : null;
        return [{
          code: question.code,
          questionId: question.id,
          questionVersionId: version.id,
          topicCode: topic.code,
          cardCategory: version.card_categories?.code || null,
          questionType: version.question_type,
          points: version.points,
          timeLimit: version.time_limit_seconds,
          dbChoices: versionChoices,
          ...(rubric ? { evaluation: {
            expectedAnswer: rubric.expected_answer,
            answerKey: rubric.answer_key,
            acceptedAnswers: rubric.accepted_answers,
            rubricGroups: rubric.rubric_groups
          } } : {}),
          ...publicPayload(version.payload)
        }];
      });
      return { topic, questions: result };
    }
  };
}

module.exports = { createCatalogService, throwDbError, publicPayload };
