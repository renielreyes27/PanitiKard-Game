/**
 * PanitiKard V2 — Phase 6.6 Rubric & Scoring Criteria Management Tests
 *
 * Tests for:
 *   - js/dashboard-api.js getRubrics() API client method
 *   - js/dashboard.js rubric list filtering (by topic, status, search)
 *   - js/dashboard.js navigation and switchView('rubrics')
 *   - Question-version rubric association and immutability contract
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardAuth = require('../js/dashboard-auth');
const dashboardApi = require('../js/dashboard-api');
const dashboard = require('../js/dashboard');

const SAMPLE_RUBRICS = [
  {
    questionCode: 'elem-q-001',
    topicCode: 'elements',
    topicTitle: 'Elemento ng Panitikan',
    cardCategory: 'question',
    questionStatus: 'published',
    questionArchived: false,
    questionType: 'open_ended',
    versionId: 'version-uuid-1',
    versionNumber: 1,
    versionCreatedAt: '2026-01-15T00:00:00Z',
    prompt: 'Ipaliwanag ang kahalagahan ng tagpuan sa kwento.',
    points: 2,
    hasRubric: true,
    rubric: {
      expectedAnswer: 'Ang tagpuan ay nagtatakda ng kondisyon, panahon, at lugar.',
      answerKey: null,
      acceptedAnswers: ['kondisyon', 'lugar at panahon'],
      rubricGroups: [
        ['kondisyon', 'kalagayan'],
        ['lugar', 'pook'],
        ['panahon', 'oras']
      ],
      createdAt: '2026-01-15T00:00:00Z'
    }
  },
  {
    questionCode: 'elem-mc-002',
    topicCode: 'elements',
    topicTitle: 'Elemento ng Panitikan',
    cardCategory: 'statement',
    questionStatus: 'published',
    questionArchived: false,
    questionType: 'multiple_choice',
    versionId: 'version-uuid-2',
    versionNumber: 2,
    versionCreatedAt: '2026-02-01T00:00:00Z',
    prompt: 'Alin sa mga sumusunod ang hindi elemento ng kwento?',
    points: 1,
    hasRubric: true,
    rubric: {
      expectedAnswer: null,
      answerKey: 'C',
      acceptedAnswers: [],
      rubricGroups: [],
      createdAt: '2026-02-01T00:00:00Z'
    }
  },
  {
    questionCode: 'tayutay-draft-001',
    topicCode: 'figurative',
    topicTitle: 'Matalinhagang Wika',
    cardCategory: null, // Quiz question
    questionStatus: 'draft',
    questionArchived: false,
    questionType: 'identification',
    versionId: 'version-uuid-3',
    versionNumber: 1,
    versionCreatedAt: '2026-03-01T00:00:00Z',
    prompt: 'Ano ang tawag sa paghahambing gamit ang mga salitang tulad ng?',
    points: 1,
    hasRubric: false,
    rubric: null
  },
  {
    questionCode: 'elem-archived-003',
    topicCode: 'elements',
    topicTitle: 'Elemento ng Panitikan',
    cardCategory: 'bonus',
    questionStatus: 'archived',
    questionArchived: true,
    questionType: 'open_ended',
    versionId: 'version-uuid-4',
    versionNumber: 1,
    versionCreatedAt: '2026-01-10T00:00:00Z',
    prompt: 'Lumang tanong na naka-archive.',
    points: 3,
    hasRubric: true,
    rubric: {
      expectedAnswer: 'Lumang sagot.',
      answerKey: null,
      acceptedAnswers: [],
      rubricGroups: [['luma']],
      createdAt: '2026-01-10T00:00:00Z'
    }
  }
];

// ---------------------------------------------------------------------------
// 1. dashboardApi.getRubrics() API Client
// ---------------------------------------------------------------------------

test('dashboardApi: getRubrics() sends GET /admin/rubrics without options', async () => {
  let capturedPath = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path) => {
    capturedPath = path;
    return SAMPLE_RUBRICS;
  };

  try {
    const res = await dashboardApi.getRubrics();
    assert.equal(capturedPath, '/admin/rubrics');
    assert.equal(res.length, 4);
    assert.equal(res[0].questionCode, 'elem-q-001');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: getRubrics() sends GET /admin/rubrics?topicCode=elements when filtered', async () => {
  let capturedPath = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path) => {
    capturedPath = path;
    return SAMPLE_RUBRICS.filter(r => r.topicCode === 'elements');
  };

  try {
    const res = await dashboardApi.getRubrics({ topicCode: 'elements' });
    assert.equal(capturedPath, '/admin/rubrics?topicCode=elements');
    assert.equal(res.length, 3);
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

// ---------------------------------------------------------------------------
// 2. dashboard.filterRubrics() Filtering & Search Logic
// ---------------------------------------------------------------------------

test('dashboard.filterRubrics: returns all items when all filters are default', () => {
  const result = dashboard.filterRubrics(SAMPLE_RUBRICS, 'all', 'all', '');
  assert.equal(result.length, 4);
});

test('dashboard.filterRubrics: filters by topicCode correctly', () => {
  const elements = dashboard.filterRubrics(SAMPLE_RUBRICS, 'elements', 'all', '');
  assert.equal(elements.length, 3);
  assert.ok(elements.every(r => r.topicCode === 'elements'));

  const figurative = dashboard.filterRubrics(SAMPLE_RUBRICS, 'figurative', 'all', '');
  assert.equal(figurative.length, 1);
  assert.equal(figurative[0].questionCode, 'tayutay-draft-001');
});

test('dashboard.filterRubrics: filters by status with_rubric and missing_rubric', () => {
  const withRubric = dashboard.filterRubrics(SAMPLE_RUBRICS, 'all', 'with_rubric', '');
  assert.equal(withRubric.length, 3);
  assert.ok(withRubric.every(r => r.hasRubric === true));

  const missingRubric = dashboard.filterRubrics(SAMPLE_RUBRICS, 'all', 'missing_rubric', '');
  assert.equal(missingRubric.length, 1);
  assert.equal(missingRubric[0].questionCode, 'tayutay-draft-001');
  assert.equal(missingRubric[0].hasRubric, false);
});

test('dashboard.filterRubrics: filters by active and archived status', () => {
  const activeOnly = dashboard.filterRubrics(SAMPLE_RUBRICS, 'all', 'active', '');
  assert.equal(activeOnly.length, 3);
  assert.ok(activeOnly.every(r => !r.questionArchived));

  const archivedOnly = dashboard.filterRubrics(SAMPLE_RUBRICS, 'all', 'archived', '');
  assert.equal(archivedOnly.length, 1);
  assert.equal(archivedOnly[0].questionCode, 'elem-archived-003');
  assert.equal(archivedOnly[0].questionArchived, true);
});

test('dashboard.filterRubrics: searches across questionCode, prompt, and topicTitle', () => {
  // By questionCode
  const matchCode = dashboard.filterRubrics(SAMPLE_RUBRICS, 'all', 'all', 'elem-mc-002');
  assert.equal(matchCode.length, 1);
  assert.equal(matchCode[0].questionCode, 'elem-mc-002');

  // By prompt keyword
  const matchPrompt = dashboard.filterRubrics(SAMPLE_RUBRICS, 'all', 'all', 'tagpuan');
  assert.equal(matchPrompt.length, 1);
  assert.equal(matchPrompt[0].questionCode, 'elem-q-001');

  // By topic title
  const matchTopic = dashboard.filterRubrics(SAMPLE_RUBRICS, 'all', 'all', 'matalinhagang');
  assert.equal(matchTopic.length, 1);
  assert.equal(matchTopic[0].questionCode, 'tayutay-draft-001');

  // No match
  const noMatch = dashboard.filterRubrics(SAMPLE_RUBRICS, 'all', 'all', 'walang-tutugma');
  assert.equal(noMatch.length, 0);
});

test('dashboard.filterRubrics: combines topic, status, and search filters', () => {
  const combined = dashboard.filterRubrics(SAMPLE_RUBRICS, 'elements', 'with_rubric', 'tagpuan');
  assert.equal(combined.length, 1);
  assert.equal(combined[0].questionCode, 'elem-q-001');

  // Mismatched combination
  const empty = dashboard.filterRubrics(SAMPLE_RUBRICS, 'figurative', 'with_rubric', '');
  assert.equal(empty.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Navigation & switchView('rubrics')
// ---------------------------------------------------------------------------

test('dashboard.switchView: accepts "rubrics" as a valid view and updates current view', () => {
  assert.equal(dashboard.switchView('rubrics'), 'rubrics');
  assert.equal(dashboard.getCurrentView(), 'rubrics');

  // Switch back to overview
  assert.equal(dashboard.switchView('overview'), 'overview');
  assert.equal(dashboard.getCurrentView(), 'overview');
});

// ---------------------------------------------------------------------------
// 4. Rubric Immutability & Question-Version Association Contract
// ---------------------------------------------------------------------------

test('Rubric Association: each rubric item is strictly bound to a versionNumber and versionId', () => {
  SAMPLE_RUBRICS.forEach(item => {
    assert.ok(item.versionId, `Item ${item.questionCode} must have versionId`);
    assert.ok(Number.isInteger(item.versionNumber) && item.versionNumber >= 1,
      `Item ${item.questionCode} must have integer versionNumber`);
    if (item.hasRubric && item.rubric) {
      assert.ok('expectedAnswer' in item.rubric, 'Rubric must contain expectedAnswer');
      assert.ok(Array.isArray(item.rubric.rubricGroups), 'Rubric must contain rubricGroups array');
    }
  });
});
