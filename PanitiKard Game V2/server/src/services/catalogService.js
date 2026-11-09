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
        const qVersions = (versions || []).filter(v => v.question_id === question.id);
        const latestVersionNumber = qVersions.length
          ? Math.max(...qVersions.map(v => v.version_number))
          : (question.current_version || 1);
        const hasDraftRevision = Boolean(question.current_version && latestVersionNumber > question.current_version);
        const draftVersionNumber = hasDraftRevision ? latestVersionNumber : null;
        return [{
          code: question.code,
          questionId: question.id,
          questionVersionId: version.id,
          topicCode: topic.code,
          title: version.title || null,
          prompt: version.prompt || null,
          cardCategory: version.card_categories?.code || null,
          questionType: version.question_type,
          status: question.status,
          currentVersion: question.current_version,
          versionNumber: version.version_number,
          // Staff-only draft metadata: omitted from public responses (includeDrafts: false).
          // On live Supabase, anon RLS (question_versions_read_visible) prevents reading draft versions
          // anyway, so these fields would always be false/null for public clients in production.
          ...(includeDrafts ? { latestVersionNumber, hasDraftRevision, draftVersionNumber } : {}),
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
    },

    async listAllTopics(client) {
      if (!client) return null;
      const { data, error } = await client.from('topics')
        .select('id, code, title, description, competency, status, created_by, created_at, updated_at, archived_at')
        .order('updated_at', { ascending: false });
      throwDbError(error, 'List all topics');
      return data || [];
    },

    /**
     * Lists all rubrics across all questions for authorized staff, optionally filtered by topic.
     * Returns a summary suitable for the Rubric Management dashboard view.
     * Each rubric is tied to its associated question code, topic, version number, and rubric criteria.
     * @param {object} client - Authenticated staff Supabase client
     * @param {{ topicCode?: string }} [options={}]
     */
    async listRubrics(client, options = {}) {
      if (!client) return null;

      // 1. Load topics for filter label resolution
      let topicFilter = null;
      if (options.topicCode) {
        const { data: topic, error: topicErr } = await client.from('topics')
          .select('id, code').eq('code', options.topicCode).maybeSingle();
        throwDbError(topicErr, 'Load topic for rubric filter');
        if (!topic) throw new HttpError(404, 'TOPIC_NOT_FOUND', 'Topic not found.');
        topicFilter = topic.id;
      }

      // 2. Load questions (staff sees all statuses via RLS)
      let questionQuery = client.from('questions')
        .select('id, code, status, current_version, archived_at, topics(id, code, title), card_categories(code)');
      if (topicFilter) questionQuery = questionQuery.eq('topic_id', topicFilter);
      const { data: questions, error: questionsErr } = await questionQuery.order('code');
      throwDbError(questionsErr, 'Load questions for rubrics');

      if (!questions || !questions.length) return [];

      // 3. Load current question_versions for each question
      const questionIds = questions.map(q => q.id);
      const { data: versions, error: versionsErr } = await client.from('question_versions')
        .select('id, question_id, version_number, question_type, prompt, points, created_at, created_by')
        .in('question_id', questionIds);
      throwDbError(versionsErr, 'Load question versions for rubrics');

      // Current versions only
      const currentVersions = (versions || []).filter(v => {
        const q = questions.find(item => item.id === v.question_id);
        return q && v.version_number === q.current_version;
      });

      if (!currentVersions.length) return [];

      // 4. Load rubrics for current versions (staff RLS allows this)
      const versionIds = currentVersions.map(v => v.id);
      const { data: rubrics, error: rubricsErr } = await client.from('question_evaluation_rubrics')
        .select('question_version_id, expected_answer, answer_key, accepted_answers, rubric_groups, created_at')
        .in('question_version_id', versionIds);
      throwDbError(rubricsErr, 'Load evaluation rubrics');

      // 5. Assemble response
      return currentVersions.map(version => {
        const question = questions.find(q => q.id === version.question_id);
        const rubric = (rubrics || []).find(r => r.question_version_id === version.id);
        return {
          questionCode: question?.code || null,
          topicCode: question?.topics?.code || null,
          topicTitle: question?.topics?.title || null,
          cardCategory: question?.card_categories?.code || null,
          questionStatus: question?.status || null,
          questionArchived: Boolean(question?.archived_at),
          questionType: version.question_type,
          versionId: version.id,
          versionNumber: version.version_number,
          versionCreatedAt: version.created_at,
          prompt: version.prompt,
          points: version.points,
          hasRubric: Boolean(rubric),
          rubric: rubric ? {
            expectedAnswer: rubric.expected_answer,
            answerKey: rubric.answer_key,
            acceptedAnswers: rubric.accepted_answers || [],
            rubricGroups: rubric.rubric_groups || [],
            createdAt: rubric.created_at
          } : null
        };
      });
    },

    async getQuestionDetail(questionCode, client, options = {}) {
      if (!client) return null;

      // 1. Load question by code (staff RLS allows all statuses)
      const { data: question, error: qErr } = await client.from('questions')
        .select('id, code, topic_id, card_category_id, question_type, status, current_version, created_by, created_at, updated_at, archived_at, topics(id, code, title, status), card_categories(code, label)')
        .eq('code', questionCode).maybeSingle();
      throwDbError(qErr, 'Load question');
      if (!question) throw new HttpError(404, 'QUESTION_NOT_FOUND', `Question '${questionCode}' was not found.`);

      // 2. Load all versions (descending by version_number)
      const { data: versions, error: vErr } = await client.from('question_versions')
        .select('id, version_number, question_type, card_category_id, card_categories(code, label), title, prompt, explanation, hint, points, time_limit_seconds, difficulty, category_label, tag, payload, created_by, created_at')
        .eq('question_id', question.id).order('version_number', { ascending: false });
      throwDbError(vErr, 'Load question versions');

      const versionList = versions || [];
      const latestVersionNumber = versionList.length ? Math.max(...versionList.map(v => v.version_number)) : (question.current_version || 1);
      const hasDraftRevision = Boolean(question.current_version && latestVersionNumber > question.current_version);
      const draftVersionNumber = hasDraftRevision ? latestVersionNumber : null;

      // Determine target version to display
      let targetVersionNum = question.current_version;
      let isDraftPreview = false;

      if (options.version !== undefined && options.version !== null && options.version !== '') {
        const parsed = parseInt(options.version, 10);
        if (!Number.isNaN(parsed)) {
          targetVersionNum = parsed;
          isDraftPreview = targetVersionNum > question.current_version || question.status === 'draft';
        }
      } else if (options.previewDraft) {
        if (hasDraftRevision) {
          targetVersionNum = draftVersionNumber;
          isDraftPreview = true;
        } else if (question.status === 'draft') {
          targetVersionNum = latestVersionNumber;
          isDraftPreview = true;
        }
      }

      const selectedVersion = versionList.find(v => v.version_number === targetVersionNum)
        || versionList.find(v => v.version_number === question.current_version)
        || versionList[0]
        || null;

      // 3. Load rubric for selected version (staff client has RLS access via question_rubrics_staff_read)
      let rubric = null;
      if (selectedVersion) {
        const { data: rData, error: rErr } = await client.from('question_evaluation_rubrics')
          .select('question_version_id, expected_answer, answer_key, accepted_answers, rubric_groups')
          .eq('question_version_id', selectedVersion.id).maybeSingle();
        throwDbError(rErr, 'Load evaluation rubric');
        rubric = rData || null;
      }

      // 4. Load choices for selected version
      let choices = [];
      if (selectedVersion) {
        const { data: cData, error: cErr } = await client.from('question_choices')
          .select('option_key, label, sort_order')
          .eq('question_version_id', selectedVersion.id).order('sort_order');
        throwDbError(cErr, 'Load question choices');
        choices = (cData || []).map(({ option_key, label, sort_order }) => ({ key: option_key, text: label, sortOrder: sort_order }));
      }

      return {
        id: question.id,
        code: question.code,
        topicCode: question.topics?.code || null,
        topicTitle: question.topics?.title || null,
        topicStatus: question.topics?.status || null,
        cardCategory: question.card_categories?.code || null,
        questionType: question.question_type,
        status: question.status,
        currentVersion: question.current_version,
        latestVersionNumber,
        hasDraftRevision,
        draftVersionNumber,
        isDraftPreview,
        selectedVersionNumber: selectedVersion?.version_number || question.current_version,
        createdBy: question.created_by,
        createdAt: question.created_at,
        updatedAt: question.updated_at,
        archivedAt: question.archived_at,
        version: selectedVersion ? {
          id: selectedVersion.id,
          versionNumber: selectedVersion.version_number,
          title: selectedVersion.title,
          prompt: selectedVersion.prompt,
          explanation: selectedVersion.explanation,
          hint: selectedVersion.hint,
          points: selectedVersion.points,
          timeLimitSeconds: selectedVersion.time_limit_seconds,
          difficulty: selectedVersion.difficulty,
          categoryLabel: selectedVersion.category_label,
          tag: selectedVersion.tag,
          choices,
          payload: selectedVersion.payload
        } : null,
        rubric: rubric ? {
          expectedAnswer: rubric.expected_answer,
          answerKey: rubric.answer_key,
          acceptedAnswers: rubric.accepted_answers,
          rubricGroups: rubric.rubric_groups
        } : null,
        versionHistory: versionList.map(v => ({ id: v.id, versionNumber: v.version_number, createdAt: v.created_at }))
      };
    }
  };
}

module.exports = { createCatalogService, throwDbError, publicPayload };
