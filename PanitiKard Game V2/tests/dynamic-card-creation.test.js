/**
 * PanitiKard V2 — Dynamic Question/Card Creation System Tests
 *
 * Verifies:
 *   - Category rules and dynamic behavior for all 7 categories + Quiz:
 *       1. Tanong (question): Multiple Choice only, 1 point, untimed.
 *       2. Pahayag (statement): Written only, 1 point, untimed.
 *       3. Pagwawasto (correction): Written only, 1 point, untimed, "Iwasto ang pahayag: ..." placeholder.
 *       4. Bonus (bonus): Multiple Choice or Written, default 2 points (1-100), untimed.
 *       5. Baligtaran (reverse): Multiple Choice or Written, default 0 points in deck (1pt server override in RR), untimed.
 *       6. Gabay (help): Multiple Choice or Written, 1 point, hint required, untimed.
 *       7. Hamon (challenge): Multiple Choice or Written, 1 point, timer required (1-3600s, default 30s).
 *       8. Quiz: Multiple Choice or Written, default 1 point, untimed.
 *   - Accepted alternatives parsing and formatting (parseAcceptedAnswers, formatAcceptedAnswers).
 *   - Dynamic Rubric concept groups editor (addRubricGroupRow, renumberRubricGroups, renderRubricGroupsEditor, getRubricGroupsFromEditor).
 *   - DOM Form validation (validateQuestionForm) for Create and Edit workflows.
 *   - Edit prepopulation from getQuestionDetail() and draft-first immutable revision workflow.
 *   - Parent topic publication guard.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const dashboard = require('../js/dashboard');
const dashboardApi = require('../js/dashboard-api');
const dashboardAuth = require('../js/dashboard-auth');

// ---------------------------------------------------------------------------
// 1. Category Rules & Default Configurations
// ---------------------------------------------------------------------------
test('CATEGORY_RULES: defines correct specifications for all seven card categories and quiz', () => {
  const rules = dashboard.CATEGORY_RULES;
  assert.ok(rules, 'CATEGORY_RULES must be exported');

  // Tanong
  assert.equal(rules.question.defaultPoints, 1);
  assert.equal(rules.question.isTimed, false);
  assert.equal(rules.question.requireHint, false);
  assert.deepEqual(rules.question.allowedTypes, ['multiple_choice']);

  // Pahayag
  assert.equal(rules.statement.defaultPoints, 1);
  assert.equal(rules.statement.isTimed, false);
  assert.equal(rules.statement.requireHint, false);
  assert.ok(!rules.statement.allowedTypes.includes('multiple_choice'), 'Pahayag must not allow multiple_choice');

  // Pagwawasto
  assert.equal(rules.correction.defaultPoints, 1);
  assert.equal(rules.correction.isTimed, false);
  assert.equal(rules.correction.requireHint, false);
  assert.ok(rules.correction.promptPlaceholder.includes('Iwasto ang pahayag'), 'Pagwawasto must have correction placeholder');
  assert.ok(!rules.correction.allowedTypes.includes('multiple_choice'), 'Pagwawasto must not allow multiple_choice');

  // Bonus
  assert.equal(rules.bonus.defaultPoints, 2, 'Bonus card must default to 2 points');
  assert.equal(rules.bonus.isTimed, false);
  assert.ok(rules.bonus.allowedTypes.includes('multiple_choice'));
  assert.ok(rules.bonus.allowedTypes.includes('identification'));

  // Baligtaran (Reverse)
  assert.equal(rules.reverse.defaultPoints, 0, 'Reverse card must default to 0 points in deck');
  assert.equal(rules.reverse.isTimed, false);
  assert.ok(rules.reverse.allowedTypes.includes('multiple_choice'));
  assert.ok(rules.reverse.allowedTypes.includes('identification'));

  // Gabay (Help)
  assert.equal(rules.help.defaultPoints, 1);
  assert.equal(rules.help.isTimed, false);
  assert.equal(rules.help.requireHint, true, 'Gabay card must require hint');

  // Hamon (Challenge)
  assert.equal(rules.challenge.defaultPoints, 1);
  assert.equal(rules.challenge.isTimed, true, 'Hamon card must be timed');
  assert.equal(rules.challenge.defaultTimer, 30, 'Hamon timer default must be 30 seconds');

  // Quiz
  assert.equal(rules.quiz.defaultPoints, 1);
  assert.equal(rules.quiz.isTimed, false);
  assert.equal(rules.quiz.requireHint, false);
});

// ---------------------------------------------------------------------------
// 2. Accepted Alternatives (parseAcceptedAnswers & formatAcceptedAnswers)
// ---------------------------------------------------------------------------
test('parseAcceptedAnswers & formatAcceptedAnswers: splits and rejoins string variations correctly', () => {
  // Parsing empty/null
  assert.deepEqual(dashboard.parseAcceptedAnswers(''), []);
  assert.deepEqual(dashboard.parseAcceptedAnswers(null), []);
  assert.deepEqual(dashboard.parseAcceptedAnswers(undefined), []);

  // Comma-separated
  const parsed1 = dashboard.parseAcceptedAnswers('tagpuan, pook, lugar');
  assert.deepEqual(parsed1, ['tagpuan', 'pook', 'lugar']);

  // Semicolon-separated and newlines
  const parsed2 = dashboard.parseAcceptedAnswers('kasukdulan; rurok\nklimaks');
  assert.deepEqual(parsed2, ['kasukdulan', 'rurok', 'klimaks']);

  // Whitespace trimming and empty filtering
  const parsed3 = dashboard.parseAcceptedAnswers('  salita1  , , salita2 ;   ');
  assert.deepEqual(parsed3, ['salita1', 'salita2']);

  // Array passthrough with trimming
  assert.deepEqual(dashboard.parseAcceptedAnswers([' a ', 'b ']), ['a', 'b']);

  // Formatting back to string
  assert.equal(dashboard.formatAcceptedAnswers(['lugar', 'pook']), 'lugar, pook');
  assert.equal(dashboard.formatAcceptedAnswers([]), '');
  assert.equal(dashboard.formatAcceptedAnswers(null), '');
});

// ---------------------------------------------------------------------------
// 3. Rubric Concept Groups (Editor Serialization & Deserialization)
// ---------------------------------------------------------------------------
test('Rubric Groups: DOM editor helpers serialize to Array<Array<string>> correctly', () => {
  // Mock container DOM element
  const elements = [];
  const container = {
    id: 'test-rubric-container',
    children: elements,
    innerHTML: '',
    appendChild(child) {
      elements.push(child);
    },
    querySelectorAll(selector) {
      if (selector === '.rubric-group-row') return elements;
      return [];
    }
  };

  // Helper to mock a row
  function mockRow(termsString) {
    const input = { value: termsString };
    const badge = { textContent: '' };
    const btn = { addEventListener: () => {} };
    return {
      className: 'rubric-group-row',
      querySelector(sel) {
        if (sel === '.rubric-group-input') return input;
        if (sel === '.rubric-group-badge') return badge;
        if (sel === '.btn-remove-rubric') return btn;
        return null;
      },
      remove() {
        const idx = elements.indexOf(this);
        if (idx !== -1) elements.splice(idx, 1);
      }
    };
  }

  // Add 2 mock rows
  elements.push(mockRow('konteksto, kaligiran'));
  elements.push(mockRow('tauhan, karakter'));
  elements.push(mockRow('   ')); // Empty row, should be omitted

  const groups = dashboard.getRubricGroupsFromEditor(container);
  assert.deepEqual(groups, [
    ['konteksto', 'kaligiran'],
    ['tauhan', 'karakter']
  ]);
});

// ---------------------------------------------------------------------------
// 4. Form Validation: Category Rules Enforced
// ---------------------------------------------------------------------------
test('validateQuestionForm: enforces category-specific requirements and untimed null timers', () => {
  // Set up mock DOM elements
  const mockElements = {
    'create-q-topic': { value: 'elements' },
    'create-q-code': { value: 'elem-test-01' },
    'create-q-category': { value: 'challenge' },
    'create-q-type': { value: 'multiple_choice' },
    'create-q-prompt': { value: 'Subukang sagutin sa loob ng itinakdang oras.' },
    'create-q-title': { value: 'Hamon ng Elemento' },
    'create-q-tag': { value: 'Tunggalian' },
    'create-q-points': { value: '1' },
    'create-q-timelimit': { value: '45' },
    'create-q-explanation': { value: 'Ito ang paliwanag' },
    'create-q-hint': { value: 'Tingnan ang pahiwatig' },
    'create-q-expected-answer': { value: '' },
    'create-q-accepted-answers': { value: '' },
    'create-q-choices-list': {
      querySelectorAll: (sel) => {
        if (sel === '.choice-item-row') {
          return [
            { querySelector: (s) => (s === '.choice-correct-radio' ? { checked: true } : { value: 'Opsyon A' }) },
            { querySelector: (s) => (s === '.choice-correct-radio' ? { checked: false } : { value: 'Opsyon B' }) }
          ];
        }
        return [];
      }
    },
    'create-q-rubric-groups-list': { querySelectorAll: () => [] },
    'create-q-topic-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-code-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-prompt-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-choice-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-expected-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-timelimit-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-hint-error': { classList: { add: () => {}, remove: () => {} } }
  };

  const originalGetElementById = globalThis.document?.getElementById;
  globalThis.document = {
    getElementById: (id) => mockElements[id] || null
  };

  try {
    // 1. Hamon (challenge) with valid 45s timer
    const result1 = dashboard.validateQuestionForm('create', false);
    assert.equal(result1.isValid, true);
    assert.equal(result1.payload.cardCategory, 'challenge');
    assert.equal(result1.payload.timeLimitSeconds, 45);
    assert.equal(result1.payload.tag, 'Tunggalian');

    // 2. Hamon (challenge) missing timer -> must fail validation
    mockElements['create-q-timelimit'].value = '';
    const resultChallengeNoTimer = dashboard.validateQuestionForm('create', false);
    assert.equal(resultChallengeNoTimer.isValid, false);

    // 3. Gabay (help) requires hint
    mockElements['create-q-category'].value = 'help';
    mockElements['create-q-timelimit'].value = '';
    mockElements['create-q-hint'].value = ''; // empty hint
    const resultHelpNoHint = dashboard.validateQuestionForm('create', false);
    assert.equal(resultHelpNoHint.isValid, false, 'Gabay must fail without hint');

    // With hint provided -> succeeds, untimed submits timeLimitSeconds: null
    mockElements['create-q-hint'].value = 'Narito ang gabay na kaisipan';
    const resultHelpWithHint = dashboard.validateQuestionForm('create', false);
    assert.equal(resultHelpWithHint.isValid, true);
    assert.equal(resultHelpWithHint.payload.timeLimitSeconds, null, 'Untimed card must submit null timer');

    // 4. Tanong (question): multiple_choice only, default 1 point
    mockElements['create-q-category'].value = 'question';
    mockElements['create-q-points'].value = '1';
    const resultQuestion = dashboard.validateQuestionForm('create', false);
    assert.equal(resultQuestion.isValid, true);
    assert.equal(resultQuestion.payload.points, 1);
    assert.equal(resultQuestion.payload.timeLimitSeconds, null);

    // 5. Pahayag (statement): written answer with rubric and accepted alternatives
    mockElements['create-q-category'].value = 'statement';
    mockElements['create-q-type'].value = 'identification';
    mockElements['create-q-expected-answer'].value = 'Simbolismo';
    mockElements['create-q-accepted-answers'].value = 'sagisag, tanda';
    mockElements['create-q-rubric-groups-list'] = {
      querySelectorAll: (sel) => {
        if (sel === '.rubric-group-row') {
          return [
            { querySelector: (s) => (s === '.rubric-group-input' ? { value: 'sagisag, tanda' } : null) }
          ];
        }
        return [];
      }
    };

    const resultStatement = dashboard.validateQuestionForm('create', false);
    assert.equal(resultStatement.isValid, true);
    assert.equal(resultStatement.payload.expectedAnswer, 'Simbolismo');
    assert.deepEqual(resultStatement.payload.acceptedAnswers, ['sagisag', 'tanda']);
    assert.deepEqual(resultStatement.payload.rubricGroups, [['sagisag', 'tanda']]);
    assert.equal(resultStatement.payload.choices.length, 0);

    // 6. Bonus Card: 2 points default, untimed
    mockElements['create-q-category'].value = 'bonus';
    mockElements['create-q-points'].value = '2';
    const resultBonus = dashboard.validateQuestionForm('create', false);
    assert.equal(resultBonus.isValid, true);
    assert.equal(resultBonus.payload.points, 2);
    assert.equal(resultBonus.payload.timeLimitSeconds, null);

    // 7. Baligtaran (Reverse): 0 points default in main deck
    mockElements['create-q-category'].value = 'reverse';
    mockElements['create-q-points'].value = '0';
    const resultReverse = dashboard.validateQuestionForm('create', false);
    assert.equal(resultReverse.isValid, true);
    assert.equal(resultReverse.payload.points, 0);
    assert.equal(resultReverse.payload.timeLimitSeconds, null);

  } finally {
    if (originalGetElementById) {
      globalThis.document.getElementById = originalGetElementById;
    }
  }
});

// ---------------------------------------------------------------------------
// 5. Edit Prepopulation & Immutable Draft Revision Workflow
// ---------------------------------------------------------------------------
test('Edit Question: revises existing question into immutable new draft version', async () => {
  let revisedCode = null;
  let revisedPayload = null;

  // Mock dashboardAuth apiRequest
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path, options = {}) => {
    if (path.startsWith('/admin/questions/') && options.method === 'PUT') {
      revisedCode = path.replace('/admin/questions/', '');
      revisedPayload = options.body;
      return {
        id: 'question-uuid-1',
        code: revisedCode,
        status: 'draft',
        version: 2,
        currentVersion: 1,
        isDraftRevision: true
      };
    }
    throw new Error('Unhandled endpoint: ' + path);
  };

  try {
    const editPayload = {
      code: 'elem-bon-001',
      questionType: 'identification',
      cardCategory: 'bonus',
      title: 'Bonus sa Elemento',
      tag: 'Tauhan',
      prompt: 'Sino ang pangunahing tauhan?',
      points: 2,
      timeLimitSeconds: null,
      explanation: 'Paliwanag dito',
      hint: 'Pahiwatig dito',
      expectedAnswer: 'Florante',
      acceptedAnswers: ['florante'],
      rubricGroups: [['florante', 'prinsipe']]
    };

    const res = await dashboardApi.reviseQuestion('elem-bon-001', editPayload);
    assert.equal(revisedCode, 'elem-bon-001');
    assert.equal(res.status, 'draft');
    assert.equal(res.version, 2);
    assert.equal(res.isDraftRevision, true);
    assert.equal(revisedPayload.points, 2);
    assert.deepEqual(revisedPayload.acceptedAnswers, ['florante']);
    assert.deepEqual(revisedPayload.rubricGroups, [['florante', 'prinsipe']]);
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

// ---------------------------------------------------------------------------
// 6. Parent-Topic Publication Guard
// ---------------------------------------------------------------------------
test('promptPublishQuestion: blocks publication when parent topic is still in draft or archived', () => {
  // Set questions and topics in dashboard memory
  dashboard.setTopicsList([
    { code: 'topic-draft-01', title: 'Borador na Paksa', status: 'draft', archived_at: null },
    { code: 'topic-pub-01', title: 'Inilathalang Paksa', status: 'published', archived_at: null }
  ]);
  dashboard.setQuestionsList([
    { code: 'q-in-draft-topic', topicCode: 'topic-draft-01', status: 'draft' },
    { code: 'q-in-pub-topic', topicCode: 'topic-pub-01', status: 'draft' }
  ]);

  const toastToast = { style: {}, className: '' };
  const toastMsg = { textContent: '' };
  const originalGetElementById = globalThis.document?.getElementById;
  globalThis.document = {
    getElementById: (id) => {
      if (id === 'toast-alert') return toastToast;
      if (id === 'toast-message') return toastMsg;
      return null;
    }
  };

  try {
    // Attempt to publish question under draft topic -> MUST be blocked
    const allowedDraftTopic = dashboard.promptPublishQuestion('q-in-draft-topic', 1);
    assert.equal(allowedDraftTopic, false, 'Publishing under draft topic must return false');
    assert.ok(toastMsg.textContent.includes('Kailangan munang i-publish ang paksang'), 'Should show Filipino warning toast');

    // Attempt to publish question under published topic -> MUST be permitted (returns true)
    const allowedPubTopic = dashboard.promptPublishQuestion('q-in-pub-topic', 1);
    assert.equal(allowedPubTopic, true, 'Publishing under published topic must proceed');
  } finally {
    if (originalGetElementById) {
      globalThis.document.getElementById = originalGetElementById;
    }
  }
});

// ---------------------------------------------------------------------------
// 7. Optional Rubric Groups Verification (No Unnecessary Rubrics on Bonus, Reverse, etc.)
// ---------------------------------------------------------------------------
test('Rubric Groups: completely optional for Bonus, Baligtaran, Gabay, Hamon, and Quiz', () => {
  const { validateQuestionInput } = require('../server/src/services/questionValidation');

  const categories = ['bonus', 'reverse', 'help', 'challenge', null];
  categories.forEach(cat => {
    const raw = {
      code: `test-${cat || 'quiz'}-opt-rubric`,
      questionType: 'identification',
      cardCategory: cat,
      title: 'Pagsusuri',
      prompt: 'Magbigay ng kasagutan.',
      expectedAnswer: 'Batayang Sagot',
      points: cat === 'bonus' ? 2 : (cat === 'reverse' ? 0 : 1),
      timeLimitSeconds: cat === 'challenge' ? 30 : null,
      hint: cat === 'help' ? 'Pahiwatig' : null,
      acceptedAnswers: [],
      rubricGroups: [] // empty rubric groups
    };

    const validated = validateQuestionInput(raw);
    assert.deepEqual(validated.rubricGroups, [], `Category ${cat} must permit empty rubricGroups without error`);
  });
});

// ---------------------------------------------------------------------------
// 8. Switching Question Types: Prevents Stale Hidden Values
// ---------------------------------------------------------------------------
test('validateQuestionForm: never submits stale hidden values when switching types', () => {
  const mockElements = {
    'create-q-topic': { value: 'elements' },
    'create-q-code': { value: 'elem-stale-01' },
    'create-q-category': { value: 'bonus' },
    'create-q-type': { value: 'multiple_choice' },
    'create-q-prompt': { value: 'Tanong na may pagpipilian' },
    'create-q-title': { value: '' },
    'create-q-tag': { value: '' },
    'create-q-points': { value: '2' },
    'create-q-timelimit': { value: '' },
    'create-q-explanation': { value: '' },
    'create-q-hint': { value: '' },
    // Hidden written answer inputs containing old text
    'create-q-expected-answer': { value: 'Lumang Nakatagong Sagot' },
    'create-q-accepted-answers': { value: 'luma1, luma2' },
    'create-q-rubric-groups-list': {
      querySelectorAll: (sel) => {
        if (sel === '.rubric-group-row') {
          return [{ querySelector: () => ({ value: 'lumang, grupo' }) }];
        }
        return [];
      }
    },
    // Visible multiple choice inputs
    'create-q-choices-list': {
      querySelectorAll: (sel) => {
        if (sel === '.choice-item-row') {
          return [
            { querySelector: (s) => (s === '.choice-correct-radio' ? { checked: true } : { value: 'Opsyon 1' }) },
            { querySelector: (s) => (s === '.choice-correct-radio' ? { checked: false } : { value: 'Opsyon 2' }) }
          ];
        }
        return [];
      }
    },
    'create-q-topic-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-code-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-prompt-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-choice-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-expected-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-timelimit-error': { classList: { add: () => {}, remove: () => {} } },
    'create-q-hint-error': { classList: { add: () => {}, remove: () => {} } }
  };

  const originalGetElementById = globalThis.document?.getElementById;
  globalThis.document = {
    getElementById: (id) => mockElements[id] || null
  };

  try {
    // When multiple_choice: expectedAnswer, acceptedAnswers, rubricGroups MUST NOT contain stale values
    const mcResult = dashboard.validateQuestionForm('create', false);
    assert.equal(mcResult.isValid, true);
    assert.equal(mcResult.payload.expectedAnswer, null, 'Multiple choice payload must not include stale expectedAnswer');
    assert.deepEqual(mcResult.payload.acceptedAnswers, [], 'Multiple choice payload must not include stale acceptedAnswers');
    assert.deepEqual(mcResult.payload.rubricGroups, [], 'Multiple choice payload must not include stale rubricGroups');
    assert.equal(mcResult.payload.choices.length, 2);

    // Now switch to written identification: choices MUST be empty array, expectedAnswer read from input
    mockElements['create-q-type'].value = 'identification';
    const writtenResult = dashboard.validateQuestionForm('create', false);
    assert.equal(writtenResult.isValid, true);
    assert.deepEqual(writtenResult.payload.choices, [], 'Written payload must not include stale choices');
    assert.equal(writtenResult.payload.expectedAnswer, 'Lumang Nakatagong Sagot');
    assert.deepEqual(writtenResult.payload.acceptedAnswers, ['luma1', 'luma2']);
    assert.deepEqual(writtenResult.payload.rubricGroups, [['lumang', 'grupo']]);
  } finally {
    if (originalGetElementById) {
      globalThis.document.getElementById = originalGetElementById;
    }
  }
});

// ---------------------------------------------------------------------------
// 9. UI Question Types match backend QUESTION_TYPES exactly
// ---------------------------------------------------------------------------
test('UI Question Types: match backend QUESTION_TYPES enum set exactly', () => {
  const { QUESTION_TYPES } = require('../server/src/services/questionValidation');
  const uiTypes = [
    'multiple_choice',
    'identification',
    'true_false',
    'fill_in_blank',
    'situational',
    'open_ended'
  ];

  assert.equal(uiTypes.length, QUESTION_TYPES.size);
  uiTypes.forEach(t => {
    assert.ok(QUESTION_TYPES.has(t), `Type '${t}' must be in backend QUESTION_TYPES`);
  });
});

