// Non-destructive catalog importer. Run only after applying the reviewed schema migration.
// Requires SUPABASE_SERVICE_ROLE_KEY in server/.env; never prints or returns credentials.
const crypto = require('node:crypto');
const { PANITIKARD_DECKS, PANITIKARD_CARD_TYPES } = require('../../../js/cards-data');
const evaluator = require('../../../js/answer-evaluator');
const { getSupabaseAdmin } = require('../services/supabase');

function fail(error, operation) {
  if (!error) return;
  throw new Error(`${operation} failed (${error.code || 'database error'}).`);
}

function safePayload(item) {
  const payload = JSON.parse(JSON.stringify(item));
  const privateKeys = new Set(['answer', 'acceptedAnswers', 'terms', 'rubricGroups', 'expectedAnswer', 'answerKey', 'isCorrect', 'correctAnswer', 'didYouKnow']);
  function scrub(value) {
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !privateKeys.has(key))
      .map(([key, child]) => [key, scrub(child)]));
  }
  return scrub(payload);
}

function catalogRows() {
  const rows = [];
  for (const [topicCode, topic] of Object.entries(PANITIKARD_DECKS)) {
    for (const item of topic.cards || []) {
      const options = item.options || [];
      const choices = options.map((option, index) => ({ key: option.key, text: option.text, sortOrder: index }));
      const content = {
        questionType: options.length ? 'multiple_choice' : 'open_ended',
        cardCategory: item.type,
        title: item.title,
        prompt: item.prompt,
        expectedAnswer: item.answer,
        answerKey: options.length ? item.answer : null,
        acceptedAnswers: [],
        rubricGroups: item.terms || [],
        explanation: item.explanation || '',
        hint: item.hint || null,
        points: item.points ?? 1,
        timeLimitSeconds: item.timeLimit || null,
        difficulty: null,
        categoryLabel: null,
        tag: item.tag || null,
        choices,
        payload: safePayload(item)
      };
      rows.push({ code: item.id, topicCode, ...content });
    }

    for (const item of topic.questions || []) {
      const choices = (item.choices || []).map((choice, index) => ({ key: choice.key, text: choice.text, sortOrder: index }));
      const content = {
        questionType: item.questionType,
        cardCategory: null,
        title: `Tanong ${item.number}`,
        prompt: item.question,
        expectedAnswer: item.answer,
        answerKey: ['multiple_choice', 'true_false'].includes(item.questionType) ? item.answer : null,
        acceptedAnswers: item.acceptedAnswers || [],
        rubricGroups: evaluator.quizRubrics[item.id] || [],
        explanation: item.explanation || '',
        hint: null,
        points: item.points || 1,
        timeLimitSeconds: null,
        difficulty: item.difficulty || null,
        categoryLabel: item.category || null,
        tag: null,
        choices,
        payload: safePayload(item)
      };
      rows.push({ code: item.id, topicCode, ...content });
    }
  }
  return rows;
}

function digest(row) {
  const canonical = JSON.stringify({
    topicCode: row.topicCode, questionType: row.questionType, cardCategory: row.cardCategory,
    title: row.title, prompt: row.prompt, expectedAnswer: row.expectedAnswer,
    answerKey: row.answerKey, acceptedAnswers: row.acceptedAnswers, rubricGroups: row.rubricGroups,
    explanation: row.explanation, hint: row.hint, points: row.points,
    timeLimitSeconds: row.timeLimitSeconds, difficulty: row.difficulty,
    categoryLabel: row.categoryLabel, tag: row.tag, choices: row.choices, payload: row.payload
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

async function runSeed({ admin = getSupabaseAdmin(), rows = catalogRows() } = {}) {
  if (!admin) throw new Error('Configured Supabase service-role access is required for catalog import.');

  const { data: topics, error: topicError } = await admin.from('topics').select('id, code');
  fail(topicError, 'Read topics');
  const topicIds = new Map((topics || []).map(topic => [topic.code, topic.id]));
  const { data: categories, error: categoryError } = await admin.from('card_categories').select('id, code');
  fail(categoryError, 'Read card categories');
  const categoryIds = new Map((categories || []).map(category => [category.code, category.id]));

  const report = { imported: 0, revised: 0, unchanged: 0, missingTopics: 0 };
  for (const row of rows) {
    const topicId = topicIds.get(row.topicCode);
    if (!topicId) { report.missingTopics++; continue; }
    const categoryId = row.cardCategory ? categoryIds.get(row.cardCategory) : null;
    if (row.cardCategory && !categoryId) throw new Error(`Unknown card category for question ${row.code}.`);

    let { data: question, error } = await admin.from('questions').select('id, current_version, status')
      .eq('code', row.code).maybeSingle();
    fail(error, `Read question ${row.code}`);
    if (!question) {
      const inserted = await admin.from('questions').insert({
        code: row.code, topic_id: topicId, card_category_id: categoryId,
        question_type: row.questionType, status: 'published', current_version: 1
      }).select('id, current_version, status').single();
      fail(inserted.error, `Create question ${row.code}`);
      question = inserted.data;
    } else if (question.status === 'archived') {
      report.unchanged++;
      continue;
    }

    const versionDigest = digest(row);
    const { data: existingVersion, error: versionReadError } = await admin.from('question_versions')
      .select('id, version_number, version_digest').eq('question_id', question.id)
      .order('version_number', { ascending: false }).limit(1).maybeSingle();
    fail(versionReadError, `Read version for ${row.code}`);
    if (existingVersion?.version_digest === versionDigest) {
      report.unchanged++;
      continue;
    }

    const nextVersion = (existingVersion?.version_number || 0) + 1;
    const insertedVersion = await admin.from('question_versions').insert({
      question_id: question.id,
      version_number: nextVersion,
      question_type: row.questionType,
      card_category_id: categoryId,
      title: row.title,
      prompt: row.prompt,
      explanation: row.explanation,
      hint: row.hint,
      points: row.points,
      time_limit_seconds: row.timeLimitSeconds,
      difficulty: row.difficulty,
      category_label: row.categoryLabel,
      tag: row.tag,
      version_digest: versionDigest,
      payload: row.payload
    }).select('id').single();
    fail(insertedVersion.error, `Create version for ${row.code}`);

    const rubricInsert = await admin.from('question_evaluation_rubrics').insert({
      question_version_id: insertedVersion.data.id,
      expected_answer: row.expectedAnswer,
      answer_key: row.answerKey,
      accepted_answers: row.acceptedAnswers,
      rubric_groups: row.rubricGroups
    });
    fail(rubricInsert.error, `Store private rubric for ${row.code}`);

    if (row.choices.length) {
      const choicesInsert = await admin.from('question_choices').insert(row.choices.map(choice => ({
        question_version_id: insertedVersion.data.id,
        option_key: choice.key,
        label: choice.text,
        sort_order: choice.sortOrder
      })));
      fail(choicesInsert.error, `Store choices for ${row.code}`);
    }

    const publish = await admin.from('questions').update({
      topic_id: topicId,
      card_category_id: categoryId,
      question_type: row.questionType,
      current_version: nextVersion,
      status: 'published',
      archived_at: null
    }).eq('id', question.id);
    fail(publish.error, `Publish version for ${row.code}`);
    if (existingVersion) report.revised++;
    else report.imported++;
  }
  return report;
}

if (require.main === module) {
  runSeed().then(report => console.log('[Catalog seed complete]', JSON.stringify(report)))
    .catch(error => { console.error('[Catalog seed failed]', error.message); process.exitCode = 1; });
}

module.exports = { catalogRows, digest, runSeed, safePayload };
