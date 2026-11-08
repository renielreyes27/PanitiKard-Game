const test = require('node:test');
const assert = require('node:assert/strict');
const { PANITIKARD_DECKS } = require('../../js/cards-data');
const { catalogRows, safePayload } = require('../src/scripts/seedCatalog');
const { validateQuestionInput } = require('../src/services/questionValidation');
const { createGameService, normalizeResponse } = require('../src/services/gameService');
const { publicPayload } = require('../src/services/catalogService');
const fs = require('node:fs');
const path = require('node:path');

test('seed catalog covers four topics, all current cards and all quiz questions', () => {
  const rows = catalogRows();
  assert.equal(new Set(rows.map(row => row.topicCode)).size, 4);
  assert.equal(rows.length, 44);
  assert.equal(rows.filter(row => row.cardCategory).length, 14);
  assert.equal(rows.filter(row => !row.cardCategory).length, 30);
  assert.ok(rows.every(row => row.points >= 0 && row.prompt && row.code));
});

test('correct answers and rubrics are stripped recursively from public payloads', () => {
  const sample = { prompt: 'Question', expectedAnswer: 'private', options: [{ key: 'A', text: 'Choice', isCorrect: true }], nested: { answerKey: 'B', visible: true } };
  for (const scrub of [safePayload, publicPayload]) {
    const clean = scrub(sample);
    assert.equal(clean.expectedAnswer, undefined);
    assert.equal(clean.options[0].isCorrect, undefined);
    assert.equal(clean.nested.answerKey, undefined);
    assert.equal(clean.nested.visible, true);
  }
});

test('seed payload excludes the bundled answer and rubric for every question', () => {
  for (const row of catalogRows()) {
    assert.equal(row.payload.answer, undefined, row.code);
    assert.equal(row.payload.acceptedAnswers, undefined, row.code);
    assert.equal(row.payload.terms, undefined, row.code);
    assert.equal(row.expectedAnswer || row.answerKey, PANITIKARD_DECKS[row.topicCode].cards?.find(card => card.id === row.code)?.answer
      ?? PANITIKARD_DECKS[row.topicCode].questions?.find(question => question.id === row.code)?.answer, row.code);
  }
});

test('question input validation enforces categories, points, answer keys and rubric shapes', () => {
  const valid = validateQuestionInput({
    code: 'teacher-added-q1', questionType: 'multiple_choice', cardCategory: 'question',
    prompt: 'Choose the answer', answerKey: 'A', points: 2,
    choices: [{ key: 'A', text: 'Correct' }, { key: 'B', text: 'Other' }]
  });
  assert.equal(valid.answerKey, 'A');
  assert.throws(() => validateQuestionInput({ code: 'bad', questionType: 'multiple_choice', prompt: 'Q', choices: [{ key: 'A', text: 'One' }] }), /answerKey/);
  assert.throws(() => validateQuestionInput({ code: 'bad', questionType: 'open_ended', prompt: 'Q', expectedAnswer: 'A', rubricGroups: ['not a group'] }), /rubricGroups/);
});

test('database RPC is authoritative and API sends raw responses, not client-scored points', async () => {
  let call;
  const game = createGameService();
  const fakeClient = { rpc: async (name, args) => { call = { name, args }; return { data: { isCorrect: false, pointsAwarded: 0 }, error: null }; } };
  const result = await game.submitAnswer(fakeClient, { id: 'student-1' }, 'session-1', {
    questionCode: 'elem-statement', response: 'mas mabilis', round: 'main'
  });
  assert.equal(result.isCorrect, false);
  assert.equal(call.name, 'submit_game_answer');
  assert.equal(call.args.p_response, 'mas mabilis');
  assert.equal('p_is_correct' in call.args, false);
  assert.equal('p_points_awarded' in call.args, false);
});

test('migration stores answer keys privately and enforces RLS and reverse rules', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611080001_phase4_catalog_and_gameplay.sql'), 'utf8');
  assert.match(migration, /create table public\.question_evaluation_rubrics/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /create or replace function public\.submit_game_answer/i);
  assert.match(migration, /rubric_groups/);
  assert.match(migration, /Reverse Round attempt limit reached/);
  assert.match(migration, /question_versions jsonb not null/i);
  assert.match(migration, /student_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /migration_preflight/);
  assert.match(migration, /begin;[\s\S]*commit;/i);
  assert.match(migration, /v_is_timeout boolean := coalesce\(p_is_timeout, false\)/i);
  assert.match(migration, /not v_is_timeout and length\(trim\(coalesce\(p_response, ''\)\)\) = 0/i);
  assert.doesNotMatch(migration, /jsonb_build_object\('correctAnswer'/i);
  assert.doesNotMatch(migration, /jsonb_build_object\('rubricGroups'/i);
  assert.equal((migration.match(/^create table public\./gm) || []).length, 9);
  assert.equal((migration.match(/^create policy /gm) || []).length, 16);
  assert.equal((migration.match(/^create trigger /gm) || []).length, 5);
  assert.equal((migration.match(/create type public\.profile_role/gm) || []).length, 1);
});

test('request response validation rejects empty and oversized answers', () => {
  assert.throws(() => normalizeResponse('  '), /non-empty/);
  assert.throws(() => normalizeResponse('x'.repeat(4001)), /4000/);
  assert.equal(normalizeResponse('  Banghay  '), 'Banghay');
  assert.equal(normalizeResponse('', { allowEmpty: true }), '');
  assert.equal(normalizeResponse(null, { allowEmpty: true }), '');
  assert.throws(() => normalizeResponse(null), /non-empty/);
});

test('timeout API requests pass empty responses only with the timeout flag', async () => {
  let call;
  const game = createGameService();
  const fakeClient = { rpc: async (name, args) => { call = { name, args }; return { data: { isCorrect: false, pointsAwarded: 0 }, error: null }; } };
  await game.submitAnswer(fakeClient, { id: 'student-1' }, 'session-1', {
    questionCode: 'elem-challenge', response: '', round: 'main', isTimeout: true
  });
  assert.equal(call.name, 'submit_game_answer');
  assert.equal(call.args.p_response, '');
  assert.equal(call.args.p_is_timeout, true);
});
