const { HttpError } = require('../middleware/httpError');
const { validateQuestionInput, requireText } = require('./questionValidation');

function sanitizeConstraintMessage(error, action) {
  const raw = String(error?.message || '');
  if (/publish the topic before publishing/i.test(raw)) {
    return 'Publish the topic before publishing its question.';
  }
  if (/version and scoring rubric must exist/i.test(raw)) {
    return 'Question version and scoring rubric must exist before publishing.';
  }
  return `${action} violates content validation constraints.`;
}

function sanitizeNotFoundMessage(error, action) {
  const raw = String(error?.message || '');
  if (/question not found/i.test(raw)) return 'Question not found.';
  if (/topic not found/i.test(raw)) return 'Topic not found.';
  return `${action} target was not found.`;
}

function sanitizeInvalidInputMessage(error, action) {
  const raw = String(error?.message || '');
  if (/question code is required/i.test(raw)) return 'Question code is required.';
  return `Invalid input for ${action.toLowerCase()}.`;
}

function check(error, action) {
  if (!error) return;
  console.error(`[Content] ${action} failed:`, error.code || error.message);
  if (error.code === '23505') {
    throw new HttpError(409, 'ALREADY_EXISTS', `${action} conflicts with existing content.`);
  }
  if (error.code === '23514') {
    throw new HttpError(400, 'CONSTRAINT_VIOLATION', sanitizeConstraintMessage(error, action));
  }
  if (error.code === 'P0002') {
    throw new HttpError(404, 'NOT_FOUND', sanitizeNotFoundMessage(error, action));
  }
  if (error.code === '42501') {
    throw new HttpError(403, 'FORBIDDEN', 'Teacher or administrator permission required.');
  }
  if (error.code === '22023' || error.code === '23503') {
    throw new HttpError(400, 'INVALID_INPUT', sanitizeInvalidInputMessage(error, action));
  }
  throw new HttpError(503, 'DATABASE_ERROR', `Unable to ${action.toLowerCase()}.`);
}

function safePayload(payload) {
  const privateKeys = new Set(['answer', 'answerKey', 'expectedAnswer', 'acceptedAnswers', 'terms', 'rubricGroups', 'isCorrect', 'correctAnswer']);
  function scrub(value) {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !privateKeys.has(key))
      .map(([key, child]) => [key, scrub(child)]));
  }
  return scrub(payload);
}

function createContentService() {
  return {
    async createTopic(client, userId, body) {
      const code = requireText(body?.code, 'code', 80);
      if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(code)) throw new HttpError(400, 'INVALID_CODE', 'Topic code must use lowercase letters, digits, or hyphens.');
      const title = requireText(body?.title, 'title', 200);
      const { data, error } = await client.from('topics').insert({
        code, title,
        description: requireText(body.description || '', 'description', 2000, true),
        competency: requireText(body.competency || '', 'competency', 2000, true),
        status: 'draft', created_by: userId
      }).select('id, code, title, description, competency, status').single();
      check(error, 'Create topic');
      return data;
    },

    async updateTopic(client, code, body) {
      const allowed = {};
      if (body.title !== undefined) allowed.title = requireText(body.title, 'title', 200);
      if (body.description !== undefined) allowed.description = requireText(body.description, 'description', 2000, true);
      if (body.competency !== undefined) allowed.competency = requireText(body.competency, 'competency', 2000, true);
      if (body.status !== undefined) {
        if (!['draft', 'published', 'archived'].includes(body.status)) throw new HttpError(400, 'INVALID_STATUS', 'Topic status is invalid.');
        allowed.status = body.status;
        allowed.archived_at = body.status === 'archived' ? new Date().toISOString() : null;
      }
      if (!Object.keys(allowed).length) throw new HttpError(400, 'EMPTY_UPDATE', 'No supported topic fields supplied.');
      const { data, error } = await client.from('topics').update(allowed).eq('code', code)
        .select('id, code, title, description, competency, status').maybeSingle();
      check(error, 'Update topic');
      if (!data) throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic not found.');
      return data;
    },

    async createQuestion(client, userId, topicCode, rawQuestion) {
      const input = validateQuestionInput(rawQuestion);
      const { data: topic, error: topicError } = await client.from('topics').select('id').eq('code', topicCode).maybeSingle();
      check(topicError, 'Load topic');
      if (!topic) throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic not found.');

      const { data: category, error: categoryError } = input.cardCategory
        ? await client.from('card_categories').select('id').eq('code', input.cardCategory).single()
        : { data: null, error: null };
      check(categoryError, 'Load card category');
      const { data: question, error } = await client.from('questions').insert({
        code: input.code,
        topic_id: topic.id,
        card_category_id: category?.id || null,
        question_type: input.questionType,
        status: 'draft',
        current_version: 1,
        created_by: userId
      }).select('id, code').single();
      check(error, 'Create question');
      await this.addVersion(client, userId, question, input, 1, 'draft');
      return { id: question.id, code: question.code, status: 'draft', version: 1 };
    },

    async addVersion(client, userId, question, rawInput, versionNumber, publishStatus = null) {
      const input = validateQuestionInput({ ...rawInput, code: question.code });
      const { data: category, error: categoryError } = input.cardCategory
        ? await client.from('card_categories').select('id').eq('code', input.cardCategory).single()
        : { data: null, error: null };
      check(categoryError, 'Load card category');
      const { data: inserted, error } = await client.from('question_versions').insert({
        question_id: question.id,
        version_number: versionNumber,
        question_type: input.questionType,
        card_category_id: category?.id || null,
        title: input.title,
        prompt: input.prompt,
        explanation: input.explanation,
        hint: input.hint,
        points: input.points,
        time_limit_seconds: input.timeLimitSeconds,
        difficulty: input.difficulty,
        category_label: input.categoryLabel,
        tag: input.tag,
        payload: safePayload(input.payload),
        created_by: userId
      }).select('id').single();
      check(error, 'Create question version');

      const evaluation = {
        question_version_id: inserted.id,
        expected_answer: input.expectedAnswer,
        answer_key: input.answerKey,
        accepted_answers: input.acceptedAnswers,
        rubric_groups: input.rubricGroups
      };
      const { error: rubricError } = await client.from('question_evaluation_rubrics').insert(evaluation);
      check(rubricError, 'Create evaluation rubric');

      if (input.choices.length) {
        const choiceRows = input.choices.map((choice, index) => ({
          question_version_id: inserted.id,
          option_key: choice.key,
          label: choice.text.trim(),
          sort_order: Number.isInteger(choice.sortOrder) ? choice.sortOrder : index
        }));
        const { error: choicesError } = await client.from('question_choices').insert(choiceRows);
        check(choicesError, 'Create question choices');
      }

      if (publishStatus) {
        const { error: questionError } = await client.rpc('publish_question_version', {
          p_question_id: question.id,
          p_version_number: versionNumber,
          p_status: publishStatus
        });
        check(questionError, 'Publish question version');
      }
      return inserted;
    },

    async reviseQuestion(client, userId, questionCode, rawQuestion) {
      const { data: question, error } = await client.from('questions')
        .select('id, code, current_version, status').eq('code', questionCode).maybeSingle();
      check(error, 'Load question');
      if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', 'Question not found.');
      if (question.status === 'archived') throw new HttpError(409, 'QUESTION_ARCHIVED', 'Cannot revise an archived question. Restore it first.');
      const input = validateQuestionInput({ ...rawQuestion, code: questionCode });

      // Option B: Find highest version number to avoid duplicate keys when revising multiple times
      const { data: versions, error: vErr } = await client.from('question_versions')
        .select('version_number').eq('question_id', question.id)
        .order('version_number', { ascending: false }).limit(1);
      check(vErr, 'Load versions');
      const latestVersionNum = (versions && versions.length) ? versions[0].version_number : question.current_version;
      const nextVersion = latestVersionNum + 1;

      // Option B: Create new version as draft without immediately publishing
      // Passing publishStatus = null leaves questions.current_version and status untouched
      await this.addVersion(client, userId, question, input, nextVersion, null);
      return {
        id: question.id,
        code: question.code,
        status: 'draft',
        version: nextVersion,
        currentVersion: question.current_version,
        isDraftRevision: true
      };
    },

    async publishQuestion(client, questionCode, targetVersion = null) {
      const { data: question, error } = await client.from('questions')
        .select('id, code, current_version, status').eq('code', questionCode).maybeSingle();
      check(error, 'Load question');
      if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', 'Question not found.');

      let versionToPublish = targetVersion;
      if (!versionToPublish) {
        const { data: versions, error: vErr } = await client.from('question_versions')
          .select('version_number').eq('question_id', question.id)
          .order('version_number', { ascending: false }).limit(1);
        check(vErr, 'Load versions');
        versionToPublish = (versions && versions.length) ? versions[0].version_number : question.current_version;
      }

      const { data, error: pubErr } = await client.rpc('publish_question_version', {
        p_question_id: question.id,
        p_version_number: versionToPublish,
        p_status: 'published'
      });
      check(pubErr, 'Publish question version');
      return {
        id: question.id,
        code: question.code,
        status: 'published',
        currentVersion: versionToPublish
      };
    },

    async unpublishQuestion(client, questionCode) {
      const { data: question, error } = await client.from('questions')
        .select('id, code, current_version, status').eq('code', questionCode).maybeSingle();
      check(error, 'Load question');
      if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', 'Question not found.');

      const { data, error: unpubErr } = await client.rpc('publish_question_version', {
        p_question_id: question.id,
        p_version_number: question.current_version,
        p_status: 'draft'
      });
      check(unpubErr, 'Unpublish question version');
      return {
        id: question.id,
        code: question.code,
        status: 'draft',
        currentVersion: question.current_version
      };
    },

    async archiveQuestion(client, questionCode) {
      const { data: question, error } = await client.from('questions')
        .select('id, code, current_version').eq('code', questionCode).maybeSingle();
      check(error, 'Load question');
      if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', 'Question not found.');
      const { data, error: archiveError } = await client.rpc('publish_question_version', {
        p_question_id: question.id,
        p_version_number: question.current_version,
        p_status: 'archived'
      });
      check(archiveError, 'Archive question');
      return Array.isArray(data) ? data[0] : data;
    }
  };
}

module.exports = { createContentService, safePayload };
