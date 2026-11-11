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
    },

    async restoreQuestion(client, questionCode) {
      const { data: question, error } = await client.from('questions')
        .select('id, code, current_version, status').eq('code', questionCode).maybeSingle();
      check(error, 'Load question');
      if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', 'Question not found.');
      if (question.status !== 'archived') {
        throw new HttpError(400, 'QUESTION_NOT_ARCHIVED', 'Only archived questions can be restored.');
      }
      const { data, error: restoreError } = await client.rpc('publish_question_version', {
        p_question_id: question.id,
        p_version_number: question.current_version,
        p_status: 'draft'
      });
      check(restoreError, 'Restore question');
      return {
        id: question.id,
        code: question.code,
        status: 'draft',
        currentVersion: question.current_version
      };
    },

    async discardDraftRevision(client, questionCode, { adminClient } = {}) {
      const db = adminClient || client;
      const { data: question, error } = await client.from('questions')
        .select('id, code, current_version, status').eq('code', questionCode).maybeSingle();
      check(error, 'Load question');
      if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', 'Question not found.');

      const { data: maxVersionRow, error: maxErr } = await client.from('question_versions')
        .select('id, version_number').eq('question_id', question.id)
        .order('version_number', { ascending: false }).limit(1).maybeSingle();
      check(maxErr, 'Check question versions');

      if (!maxVersionRow || maxVersionRow.version_number <= question.current_version) {
        throw new HttpError(400, 'NO_DRAFT_REVISION', 'No unpublished draft revision exists for this question.');
      }

      const draftVersionId = maxVersionRow.id;
      const draftVersionNum = maxVersionRow.version_number;

      // Dependency check: verify this draft version was never answered or evaluated
      const { count: ansCount, error: ansErr } = await db.from('student_answers')
        .select('id', { count: 'exact', head: true }).eq('question_version_id', draftVersionId);
      check(ansErr, 'Check answer dependencies');
      if (ansCount && ansCount > 0) {
        throw new HttpError(409, 'DRAFT_HAS_DEPENDENCIES', 'Cannot discard draft revision because it has existing gameplay records.');
      }

      const { count: evalCount, error: evalErr } = await db.from('ai_evaluations')
        .select('id', { count: 'exact', head: true }).eq('question_version_id', draftVersionId);
      check(evalErr, 'Check evaluation dependencies');
      if (evalCount && evalCount > 0) {
        throw new HttpError(409, 'DRAFT_HAS_DEPENDENCIES', 'Cannot discard draft revision because it has existing evaluation records.');
      }

      // Safe deletion of unreferenced draft version child rows
      const { error: choicesErr } = await db.from('question_choices')
        .delete().eq('question_version_id', draftVersionId);
      check(choicesErr, 'Delete draft choices');

      const { error: rubricErr } = await db.from('question_evaluation_rubrics')
        .delete().eq('question_version_id', draftVersionId);
      check(rubricErr, 'Delete draft rubric');

      const { error: versionErr } = await db.from('question_versions')
        .delete().eq('id', draftVersionId);
      check(versionErr, 'Delete draft version');

      return {
        id: question.id,
        code: question.code,
        discardedVersion: draftVersionNum,
        currentVersion: question.current_version
      };
    },

    async deletePermanentTopic(client, code, { adminClient } = {}) {
      const db = client || adminClient;
      if (!db || typeof db.rpc !== 'function') {
        throw new HttpError(503, 'DATABASE_ERROR', 'Database client is not available.');
      }

      const { data, error } = await db.rpc('delete_topic_permanent_cascade', {
        p_topic_code: code
      });

      if (error) {
        const detail = String(error.details || error.detail || '');
        const sqlCode = String(error.code || '');
        const message = String(error.message || '');

        if (detail === 'TOPIC_NOT_FOUND' || sqlCode === 'P0002' || /topic not found/i.test(message)) {
          throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic not found.');
        }
        if (detail === 'FORBIDDEN' || sqlCode === '42501' || /permission required/i.test(message)) {
          throw new HttpError(403, 'FORBIDDEN', 'Teacher or administrator permission required.');
        }
        if (detail === 'CANNOT_DELETE_ACTIVE_TOPIC' || /published topics cannot be permanently deleted/i.test(message)) {
          throw new HttpError(400, 'CANNOT_DELETE_ACTIVE_TOPIC', 'Published topics cannot be permanently deleted. Archive the topic first.');
        }
        if (detail === 'CANNOT_DELETE_NON_DRAFT' || /only unreferenced draft or archived/i.test(message)) {
          throw new HttpError(400, 'CANNOT_DELETE_NON_DRAFT', 'Only unreferenced draft or archived topics can be permanently deleted.');
        }
        if (detail === 'TOPIC_HAS_PUBLISHED_QUESTIONS' || /cannot delete topic containing published questions/i.test(message)) {
          throw new HttpError(400, 'TOPIC_HAS_PUBLISHED_QUESTIONS', 'Cannot delete topic containing published questions. Archive or unpublish them first.');
        }
        if (detail === 'TOPIC_HAS_SESSIONS' || /historical gameplay sessions/i.test(message)) {
          throw new HttpError(409, 'TOPIC_HAS_SESSIONS', 'Cannot permanently delete topic with historical gameplay sessions.');
        }
        if (detail === 'TOPIC_QUESTIONS_HAVE_ANSWERS' || /historical student answers/i.test(message)) {
          throw new HttpError(409, 'TOPIC_QUESTIONS_HAVE_ANSWERS', 'Cannot permanently delete topic because its questions contain historical student answers. Archive it instead.');
        }
        if (detail === 'TOPIC_QUESTIONS_HAVE_EVALUATIONS' || /historical ai evaluations/i.test(message)) {
          throw new HttpError(409, 'TOPIC_QUESTIONS_HAVE_EVALUATIONS', 'Cannot permanently delete topic because its questions contain historical AI evaluations. Archive it instead.');
        }

        console.error('[Content] delete_topic_permanent_cascade error:', sqlCode, detail || message);
        throw new HttpError(503, 'DATABASE_ERROR', 'Unable to delete topic permanently due to an internal database error.');
      }

      return {
        success: true,
        deletedCode: data?.deletedCode || code,
        deletedQuestionsCount: typeof data?.deletedQuestionsCount === 'number' ? data.deletedQuestionsCount : 0
      };
    },

    async deletePermanentQuestion(client, questionCode, { adminClient } = {}) {
      const db = adminClient || client;
      const { data: question, error } = await client.from('questions')
        .select('id, code, status, current_version').eq('code', questionCode).maybeSingle();
      check(error, 'Load question');
      if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', 'Question not found.');
      if (question.status === 'published') {
        throw new HttpError(400, 'CANNOT_DELETE_ACTIVE_QUESTION', 'Published questions cannot be permanently deleted. Archive the question first.');
      }
      if (!['draft', 'archived'].includes(question.status)) {
        throw new HttpError(400, 'CANNOT_DELETE_NON_DRAFT', 'Only unreferenced draft or archived questions can be permanently deleted.');
      }

      // Dependency check: check student_answers
      const { count: ansCount, error: ansErr } = await db.from('student_answers')
        .select('id', { count: 'exact', head: true }).eq('question_id', question.id);
      check(ansErr, 'Check answer dependencies');
      if (ansCount && ansCount > 0) {
        throw new HttpError(409, 'QUESTION_HAS_ANSWERS', 'Cannot permanently delete question with historical student answers. Archive it instead.');
      }

      // Dependency check: check ai_evaluations
      const { count: evalCount, error: evalErr } = await db.from('ai_evaluations')
        .select('id', { count: 'exact', head: true }).eq('question_id', question.id);
      check(evalErr, 'Check evaluation dependencies');
      if (evalCount && evalCount > 0) {
        throw new HttpError(409, 'QUESTION_HAS_EVALUATIONS', 'Cannot permanently delete question with historical evaluations. Archive it instead.');
      }

      // Get all version IDs for this draft question
      const { data: versions, error: vErr } = await db.from('question_versions')
        .select('id').eq('question_id', question.id);
      check(vErr, 'Load question versions');

      const versionIds = (versions || []).map(v => v.id);
      if (versionIds.length > 0) {
        const { error: choicesErr } = await db.from('question_choices')
          .delete().in('question_version_id', versionIds);
        check(choicesErr, 'Delete question choices');

        const { error: rubricErr } = await db.from('question_evaluation_rubrics')
          .delete().in('question_version_id', versionIds);
        check(rubricErr, 'Delete question rubrics');

        const { error: versionsErr } = await db.from('question_versions')
          .delete().eq('question_id', question.id);
        check(versionsErr, 'Delete question versions');
      }

      const { error: qDelErr } = await db.from('questions').delete().eq('id', question.id);
      check(qDelErr, 'Delete question permanently');
      return { success: true, deletedCode: questionCode };
    }
  };
}

module.exports = { createContentService, safePayload };
