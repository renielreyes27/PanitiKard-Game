/**
 * PanitiKard V2 — Phase 6.5 Question Management Interface Tests
 *
 * Tests for:
 *   - js/dashboard-api.js question CRUD methods (getQuestions, getAllQuestions, getQuestionDetail, createQuestion, reviseQuestion, archiveQuestion)
 *   - js/dashboard.js question filtering by topic, category, search query
 *   - js/dashboard.js multiple-choice choices extraction helper (getChoicesFromEditor)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardAuth = require('../js/dashboard-auth');
const dashboardApi = require('../js/dashboard-api');
const dashboard = require('../js/dashboard');

const SAMPLE_QUESTIONS = [
  {
    id: 'q-1',
    code: 'elem-q-001',
    topicCode: 'elemento-kwento',
    topicTitle: 'Mga Elemento ng Maikling Kwento',
    cardCategory: 'question',
    questionType: 'multiple_choice',
    prompt: 'Sino ang pangunahing tauhan sa kwento?',
    title: 'Pangunahing Tauhan',
    tag: 'tauhan',
    status: 'published',
    versionNumber: 1
  },
  {
    id: 'q-2',
    code: 'elem-q-002',
    topicCode: 'elemento-kwento',
    topicTitle: 'Mga Elemento ng Maikling Kwento',
    cardCategory: 'statement',
    questionType: 'true_false',
    prompt: 'Ang tagpuan ay tumutukoy lamang sa lugar ng pinangyarihan.',
    title: 'Tagpuan Katotohanan',
    tag: 'tagpuan',
    status: 'published',
    versionNumber: 2
  },
  {
    id: 'q-3',
    code: 'tayutay-q-001',
    topicCode: 'matalinhagang-pahayag',
    topicTitle: 'Matalinhagang Pahayag at Tayutay',
    cardCategory: 'challenge',
    questionType: 'open_ended',
    prompt: 'Sumulat ng isang halimbawa ng pagwawangis tungkol sa ina.',
    title: 'Halimbawa ng Pagwawangis',
    tag: 'pagwawangis',
    status: 'published',
    versionNumber: 1
  },
  {
    id: 'q-4',
    code: 'tayutay-quiz-001',
    topicCode: 'matalinhagang-pahayag',
    topicTitle: 'Matalinhagang Pahayag at Tayutay',
    cardCategory: null, // Quiz question (no card category)
    questionType: 'identification',
    prompt: 'Anong uri ng tayutay ang gumagamit ng mga salitang tulad ng, animo, at kawangis?',
    title: 'Pagtukoy ng Pagtutulad',
    tag: 'pagtutulad',
    status: 'published',
    versionNumber: 1
  }
];

// ---------------------------------------------------------------------------
// 1. dashboardApi Question Methods
// ---------------------------------------------------------------------------

test('dashboardApi: getQuestions() sends GET /admin/topics/:topicCode/questions with kind parameter', async () => {
  let capturedPath = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path) => {
    capturedPath = path;
    return { questions: SAMPLE_QUESTIONS.slice(0, 2) };
  };

  try {
    const res = await dashboardApi.getQuestions('elemento-kwento', { kind: 'cards' });
    assert.equal(capturedPath, '/admin/topics/elemento-kwento/questions?kind=cards');
    assert.equal(res.questions.length, 2);

    // Default kind = 'all'
    await dashboardApi.getQuestions('elemento-kwento');
    assert.equal(capturedPath, '/admin/topics/elemento-kwento/questions?kind=all');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: getAllQuestions() aggregates questions across topics with metadata', async () => {
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path) => {
    if (path.includes('elemento-kwento')) {
      return { questions: [SAMPLE_QUESTIONS[0], SAMPLE_QUESTIONS[1]] };
    }
    if (path.includes('matalinhagang-pahayag')) {
      return { questions: [SAMPLE_QUESTIONS[2], SAMPLE_QUESTIONS[3]] };
    }
    throw new Error('Unknown path: ' + path);
  };

  try {
    const topics = [
      { code: 'elemento-kwento', title: 'Mga Elemento ng Maikling Kwento' },
      { code: 'matalinhagang-pahayag', title: 'Matalinhagang Pahayag at Tayutay' }
    ];
    const all = await dashboardApi.getAllQuestions(topics);
    assert.equal(all.length, 4);
    assert.equal(all[0].topicCode, 'elemento-kwento');
    assert.equal(all[0].topicTitle, 'Mga Elemento ng Maikling Kwento');
    assert.equal(all[2].topicCode, 'matalinhagang-pahayag');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: getQuestionDetail() and getQuestion() send GET /admin/questions/:code', async () => {
  const calls = [];
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path) => {
    calls.push(path);
    return { code: 'elem-q-001', prompt: 'Subok na tanong' };
  };

  try {
    const detail = await dashboardApi.getQuestionDetail('elem-q-001');
    const aliasDetail = await dashboardApi.getQuestion('elem-q-001');

    assert.equal(calls.length, 2);
    assert.equal(calls[0], '/admin/questions/elem-q-001');
    assert.equal(calls[1], '/admin/questions/elem-q-001');
    assert.equal(detail.code, 'elem-q-001');
    assert.equal(aliasDetail.code, 'elem-q-001');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: createQuestion() sends POST /admin/topics/:topicCode/questions with payload', async () => {
  let capturedPath = null;
  let capturedOptions = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path, options) => {
    capturedPath = path;
    capturedOptions = options;
    return { code: 'elemento-kwento-bagong-tanong', version: 1 };
  };

  try {
    const payload = {
      slug: 'bagong-tanong',
      questionType: 'multiple_choice',
      cardCategory: 'question',
      prompt: 'Ano ang banghay?',
      points: 1,
      choices: [{ key: 'A', text: 'Pagkakasunod-sunod' }],
      answerKey: 'A'
    };
    const res = await dashboardApi.createQuestion('elemento-kwento', payload);

    assert.equal(capturedPath, '/admin/topics/elemento-kwento/questions');
    assert.equal(capturedOptions.method, 'POST');
    assert.equal(capturedOptions.body.slug, 'bagong-tanong');
    assert.equal(res.version, 1);
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: reviseQuestion() sends PUT /admin/questions/:code with revision payload', async () => {
  let capturedPath = null;
  let capturedOptions = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path, options) => {
    capturedPath = path;
    capturedOptions = options;
    return { code: 'elem-q-001', version: 2, status: 'published' };
  };

  try {
    const revision = {
      prompt: 'Na-update na prompt para sa tauhan?',
      points: 2
    };
    const res = await dashboardApi.reviseQuestion('elem-q-001', revision);

    assert.equal(capturedPath, '/admin/questions/elem-q-001');
    assert.equal(capturedOptions.method, 'PUT');
    assert.equal(capturedOptions.body.prompt, 'Na-update na prompt para sa tauhan?');
    assert.equal(res.version, 2);
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: archiveQuestion() sends DELETE /admin/questions/:code', async () => {
  let capturedPath = null;
  let capturedOptions = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path, options) => {
    capturedPath = path;
    capturedOptions = options;
    return { code: 'elem-q-001', status: 'archived' };
  };

  try {
    const res = await dashboardApi.archiveQuestion('elem-q-001');
    assert.equal(capturedPath, '/admin/questions/elem-q-001');
    assert.equal(capturedOptions.method, 'DELETE');
    assert.equal(res.status, 'archived');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

// ---------------------------------------------------------------------------
// 2. Question Filtering Logic
// ---------------------------------------------------------------------------

test('dashboard.filterQuestions: filters correctly by topic code', () => {
  const filtered = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'elemento-kwento', 'all', '');
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every(q => q.topicCode === 'elemento-kwento'));

  const tayutay = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'matalinhagang-pahayag', 'all', '');
  assert.equal(tayutay.length, 2);
  assert.ok(tayutay.every(q => q.topicCode === 'matalinhagang-pahayag'));
});

test('dashboard.filterQuestions: filters correctly by card category', () => {
  const questionsOnly = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'all', 'question', '');
  assert.equal(questionsOnly.length, 1);
  assert.equal(questionsOnly[0].code, 'elem-q-001');

  const statementsOnly = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'all', 'statement', '');
  assert.equal(statementsOnly.length, 1);
  assert.equal(statementsOnly[0].code, 'elem-q-002');

  const challengesOnly = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'all', 'challenge', '');
  assert.equal(challengesOnly.length, 1);
  assert.equal(challengesOnly[0].code, 'tayutay-q-001');
});

test('dashboard.filterQuestions: filters quiz questions (cardCategory === null)', () => {
  const quizOnly = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'all', 'quiz', '');
  assert.equal(quizOnly.length, 1);
  assert.equal(quizOnly[0].code, 'tayutay-quiz-001');
  assert.equal(quizOnly[0].cardCategory, null);
});

test('dashboard.filterQuestions: searches by prompt text, code, title, and tag', () => {
  // Search by prompt text
  const matchPrompt = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'all', 'all', 'tungkol sa ina');
  assert.equal(matchPrompt.length, 1);
  assert.equal(matchPrompt[0].code, 'tayutay-q-001');

  // Search by code
  const matchCode = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'all', 'all', 'elem-q-002');
  assert.equal(matchCode.length, 1);
  assert.equal(matchCode[0].code, 'elem-q-002');

  // Search by title
  const matchTitle = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'all', 'all', 'tagpuan');
  assert.equal(matchTitle.length, 1);
  assert.equal(matchTitle[0].code, 'elem-q-002');

  // Search by tag
  const matchTag = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'all', 'all', 'pagtutulad');
  assert.equal(matchTag.length, 1);
  assert.equal(matchTag[0].code, 'tayutay-quiz-001');

  // No match
  const noMatch = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'all', 'all', 'walang-katulad-na-salita');
  assert.equal(noMatch.length, 0);
});

test('dashboard.filterQuestions: combines topic, category, and search criteria', () => {
  // Specific topic + specific category
  const res = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'matalinhagang-pahayag', 'challenge', 'pagwawangis');
  assert.equal(res.length, 1);
  assert.equal(res[0].code, 'tayutay-q-001');

  // Specific topic + non-matching category
  const empty = dashboard.filterQuestions(SAMPLE_QUESTIONS, 'matalinhagang-pahayag', 'question', '');
  assert.equal(empty.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Choices Editor Extraction Helper
// ---------------------------------------------------------------------------

test('dashboard.getChoicesFromEditor: safely handles null or missing container', () => {
  const result = dashboard.getChoicesFromEditor(null);
  assert.deepEqual(result, { choices: [], answerKey: null });
});

test('dashboard.getChoicesFromEditor: extracts choices array and selected answerKey from mock DOM rows', () => {
  // Construct a minimal DOM-like container
  const mockRows = [
    {
      querySelector: (selector) => {
        if (selector === '.choice-correct-radio') return { checked: false };
        if (selector === '.choice-text-input') return { value: ' Unang Pagpipilian  ' };
        return null;
      }
    },
    {
      querySelector: (selector) => {
        if (selector === '.choice-correct-radio') return { checked: true };
        if (selector === '.choice-text-input') return { value: 'Ikalawang Pagpipilian (Tama)' };
        return null;
      }
    },
    {
      querySelector: (selector) => {
        if (selector === '.choice-correct-radio') return { checked: false };
        if (selector === '.choice-text-input') return { value: 'Ikatlong Pagpipilian' };
        return null;
      }
    },
    {
      querySelector: (selector) => {
        if (selector === '.choice-correct-radio') return { checked: false };
        if (selector === '.choice-text-input') return { value: '   ' }; // Empty text should be ignored
        return null;
      }
    }
  ];

  const mockContainer = {
    querySelectorAll: (selector) => {
      if (selector === '.choice-item-row') return mockRows;
      return [];
    }
  };

  const parsed = dashboard.getChoicesFromEditor(mockContainer);
  assert.equal(parsed.choices.length, 3); // 3 non-empty choices
  assert.equal(parsed.choices[0].key, 'A');
  assert.equal(parsed.choices[0].text, 'Unang Pagpipilian');
  assert.equal(parsed.choices[1].key, 'B');
  assert.equal(parsed.choices[1].text, 'Ikalawang Pagpipilian (Tama)');
  assert.equal(parsed.choices[2].key, 'C');
  assert.equal(parsed.choices[2].text, 'Ikatlong Pagpipilian');
  assert.equal(parsed.answerKey, 'B');
});
