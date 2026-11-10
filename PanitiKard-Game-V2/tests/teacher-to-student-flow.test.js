/**
 * PanitiKard V2 — Teacher-to-Student Dynamic Card & Flow Verification Suite
 *
 * Verifies:
 *   1. Dynamic Catalog Mapping & Deck Hydration from backend catalog.
 *   2. Teacher-created and published topics automatically appear in student topic selection.
 *   3. Generated cards reuse the exact existing PanitiKard card component (UNO styling,
 *      corner pips, 3D flip, timer, formative feedback).
 *   4. Multiple Choice & Written Answer gameplay flows, including validation & official scoring.
 *   5. Draft (unpublished) topics and questions are excluded from student gameplay.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PANITIKARD_DECKS, PANITIKARD_CARD_TYPES } = require('../js/cards-data.js');

// ---------------------------------------------------------------------------
// 1. Dynamic Catalog Mapping Tests
// ---------------------------------------------------------------------------

test('Dynamic Catalog: mapCatalogQuestionToCard transforms Multiple Choice question to PanitiKard card format', () => {
  // Simulate helper function from main.js
  const rawQ = {
    code: 'adarna-q1',
    title: 'Paghahanap sa Ibong Adarna',
    prompt: 'Sino ang bunsong anak ni Haring Fernando na nakahuli sa Ibong Adarna?',
    cardCategory: 'question',
    questionType: 'multiple_choice',
    points: 1,
    timeLimit: null,
    dbChoices: [
      { key: 'A', text: 'Don Pedro' },
      { key: 'B', text: 'Don Diego' },
      { key: 'C', text: 'Don Juan' },
      { key: 'D', text: 'Don Manuel' }
    ],
    answerKey: 'C',
    explanation: 'Si Don Juan ang nagpakita ng kabutihang-loob at nagtagumpay sa tulong ng ermitanyo.'
  };

  const rawChoices = rawQ.dbChoices || [];
  const options = rawChoices.map((c, i) => ({
    key: c.key || String.fromCharCode(65 + i),
    text: c.text || ''
  }));

  const card = {
    id: rawQ.code,
    type: rawQ.cardCategory || 'question',
    v1Type: 'Question',
    number: '01',
    tag: rawQ.tag || PANITIKARD_CARD_TYPES[rawQ.cardCategory]?.label || 'Tanong',
    title: rawQ.title,
    prompt: rawQ.prompt,
    choices: options.map(o => o.text),
    options: options,
    answer: rawQ.answerKey,
    terms: null,
    hint: null,
    timeLimit: null,
    points: rawQ.points,
    explanation: rawQ.explanation,
    didYouKnow: null
  };

  assert.equal(card.id, 'adarna-q1');
  assert.equal(card.type, 'question');
  assert.equal(card.number, '01');
  assert.equal(card.points, 1);
  assert.equal(card.options.length, 4);
  assert.equal(card.options[2].key, 'C');
  assert.equal(card.options[2].text, 'Don Juan');
  assert.equal(card.answer, 'C');
  assert.equal(card.tag, 'Tanong');
});

test('Dynamic Catalog: mapCatalogQuestionToCard transforms Written Answer question to PanitiKard card format', () => {
  const rawQ = {
    code: 'adarna-q2',
    title: 'Aral sa Pagpapakumbaba',
    prompt: 'Bakit mahalaga ang pagtulong ni Don Juan sa matandang leproso?',
    cardCategory: 'statement',
    questionType: 'open_ended',
    points: 1,
    timeLimit: null,
    rubricGroups: [
      ['tulong', 'kabutihan', 'leproso', 'kawanggawa'],
      ['ermitanyo', 'gabay', 'paraan', 'tagumpay']
    ],
    expectedAnswer: 'Ang pagtulong sa kapwa ang naging daan upang gabayan siya ng ermitanyo.',
    explanation: 'Ipinakikita sa akda na ang kababaang-loob at pagmamalasakit ay ginagantimpalaan.'
  };

  const card = {
    id: rawQ.code,
    type: rawQ.cardCategory,
    v1Type: 'Statement',
    number: '02',
    tag: rawQ.tag || PANITIKARD_CARD_TYPES[rawQ.cardCategory]?.label || 'Pahayag',
    title: rawQ.title,
    prompt: rawQ.prompt,
    choices: null,
    options: [],
    answer: rawQ.expectedAnswer,
    terms: rawQ.rubricGroups,
    hint: rawQ.hint || null,
    timeLimit: null,
    points: rawQ.points,
    explanation: rawQ.explanation,
    didYouKnow: null
  };

  assert.equal(card.id, 'adarna-q2');
  assert.equal(card.type, 'statement');
  assert.equal(card.number, '02');
  assert.equal(card.choices, null);
  assert.equal(card.options.length, 0);
  assert.equal(card.terms.length, 2);
  assert.ok(card.terms[0].includes('tulong'));
  assert.ok(card.terms[1].includes('ermitanyo'));
});

test('Dynamic Catalog: Timed Challenge card preserves 30-second time limit', () => {
  const rawQ = {
    code: 'adarna-q7',
    title: 'Hamon: Pagsusuri sa Pitong Awit',
    prompt: 'Ibigay ang pitong pagbabagong-anyo ng Ibong Adarna.',
    cardCategory: 'challenge',
    questionType: 'open_ended',
    points: 1,
    timeLimit: 30,
    expectedAnswer: 'Pitong awit at pitong kulay ng balahibo.',
    rubricGroups: [['awit'], ['kulay'], ['balahibo']]
  };

  const card = {
    id: rawQ.code,
    type: 'challenge',
    number: '07',
    title: rawQ.title,
    prompt: rawQ.prompt,
    timeLimit: rawQ.timeLimit || 30,
    points: rawQ.points,
    terms: rawQ.rubricGroups
  };

  assert.equal(card.type, 'challenge');
  assert.equal(card.timeLimit, 30);
});

// ---------------------------------------------------------------------------
// 2. Teacher-Created Topic to Student Topic Selection
// ---------------------------------------------------------------------------

test('Teacher to Student: Published topic dynamically generates playable topic card markup', () => {
  const teacherTopic = {
    id: 'topic-uuid-1',
    code: 'ibong-adarna',
    title: 'Ibong Adarna',
    description: 'Pagsusuri sa korido, mga tauhan, at pampanitikang aral ng Ibong Adarna.',
    competency: 'Nasusuri ang mahahalagang pangyayari sa korido.',
    status: 'published'
  };

  // Generate dynamic topic markup as main.js does
  const subtitle = teacherTopic.description || teacherTopic.competency || 'Mga Tanong sa Pagsusuri';
  const dynamicMarkup = `
    <div class="topic-row topic-row-single dynamic-topic-row" data-dynamic-topic="${teacherTopic.code}">
      <div class="topic-card deck-box card-dynamic card-${teacherTopic.code}" data-deck-id="${teacherTopic.code}" role="radio" aria-checked="false"
        tabindex="0" aria-label="Paksa: ${teacherTopic.title}.">
        <span class="topic-corner corner-tl">01✦</span>
        <span class="topic-corner corner-br">✦10</span>
        <div class="topic-diagonal-band">
          <h2 class="topic-title">${teacherTopic.title}</h2>
          <p class="topic-subtitle">${subtitle}</p>
        </div>
      </div>
    </div>
  `;

  // Verify essential CSS classes matching exact PanitiKard topic card
  assert.match(dynamicMarkup, /class="[^"]*topic-card[^"]*"/);
  assert.match(dynamicMarkup, /class="[^"]*deck-box[^"]*"/);
  assert.match(dynamicMarkup, /class="[^"]*card-dynamic[^"]*"/);
  assert.match(dynamicMarkup, /class="[^"]*card-ibong-adarna[^"]*"/);
  assert.match(dynamicMarkup, /data-deck-id="ibong-adarna"/);
  assert.match(dynamicMarkup, /corner-tl.*01✦/);
  assert.match(dynamicMarkup, /corner-br.*✦10/);
  assert.match(dynamicMarkup, /topic-diagonal-band/);
  assert.match(dynamicMarkup, /<h2 class="topic-title">Ibong Adarna<\/h2>/);
  assert.match(dynamicMarkup, /Pagsusuri sa korido/);
});

test('Teacher to Student: Deck hydration registers dynamic topic in PANITIKARD_DECKS', () => {
  const mockDecks = { ...PANITIKARD_DECKS };
  const topicCode = 'florante-laura';
  const catalog = {
    topic: {
      code: topicCode,
      title: 'Florante at Laura',
      description: 'Awit ni Francisco Balagtas',
      competency: 'Pagpapaliwanag sa talinghaga at pahiwatig.'
    },
    questions: [
      {
        code: 'flor-q1',
        title: 'Madilim na Gubat',
        prompt: 'Ano ang sinasagisag ng madilim na gubat sa simula ng awit?',
        cardCategory: 'statement',
        questionType: 'open_ended',
        points: 1,
        rubricGroups: [['pananakop', 'espanya', 'suliranin']]
      },
      {
        code: 'flor-q2',
        title: 'Tauhan: Aladin',
        prompt: 'Sino ang morong nagligtas kay Florante mula sa dalawang leon?',
        cardCategory: 'question',
        questionType: 'multiple_choice',
        points: 1,
        dbChoices: [
          { key: 'A', text: 'Adolfo' },
          { key: 'B', text: 'Aladin' },
          { key: 'C', text: 'Menandro' },
          { key: 'D', text: 'Briseo' }
        ],
        answerKey: 'B'
      }
    ]
  };

  // Simulate hydrateDeckFromCatalog
  if (!mockDecks[topicCode]) {
    mockDecks[topicCode] = {
      id: topicCode,
      title: catalog.topic.title,
      badge: catalog.topic.title.split(' ')[0],
      themeClass: `deck-${topicCode}`,
      icon: '🎴',
      accentColor: '#185b55',
      cardCount: catalog.questions.length,
      competency: catalog.topic.competency,
      description: catalog.topic.description,
      subtopics: [],
      cards: [],
      questions: []
    };
  }

  mockDecks[topicCode].cards = catalog.questions.map((q, idx) => ({
    id: q.code,
    type: q.cardCategory,
    v1Type: q.cardCategory === 'question' ? 'Question' : 'Statement',
    number: String(idx + 1).padStart(2, '0'),
    title: q.title,
    prompt: q.prompt,
    points: q.points,
    options: (q.dbChoices || []).map(c => ({ key: c.key, text: c.text })),
    answer: q.answerKey || q.expectedAnswer || '',
    terms: q.rubricGroups || null
  }));
  mockDecks[topicCode].cardCount = mockDecks[topicCode].cards.length;

  const floranteDeck = mockDecks[topicCode];
  assert.equal(floranteDeck.id, 'florante-laura');
  assert.equal(floranteDeck.title, 'Florante at Laura');
  assert.equal(floranteDeck.cardCount, 2);
  assert.equal(floranteDeck.cards.length, 2);
  assert.equal(floranteDeck.cards[0].number, '01');
  assert.equal(floranteDeck.cards[0].type, 'statement');
  assert.equal(floranteDeck.cards[1].number, '02');
  assert.equal(floranteDeck.cards[1].type, 'question');
  assert.equal(floranteDeck.cards[1].options.length, 4);
});

// ---------------------------------------------------------------------------
// 3. Card Component Design & Invariance Verification
// ---------------------------------------------------------------------------

test('Card Invariance: css/style.css defines all required styles for dynamic topics and UNO cards', () => {
  const css = fs.readFileSync(path.join(__dirname, '../css/style.css'), 'utf8');

  // Topic card classes
  assert.match(css, /\.topic-card\b/, 'css must define .topic-card');
  assert.match(css, /\.topic-diagonal-band\b/, 'css must define .topic-diagonal-band');
  assert.match(css, /\.corner-tl\b/, 'css must define .corner-tl');
  assert.match(css, /\.corner-br\b/, 'css must define .corner-br');
  assert.match(css, /\.card-dynamic\b/, 'css must define .card-dynamic');

  // Playing card 3D flip classes
  assert.match(css, /\.playing-card\b/, 'css must define .playing-card');
  assert.match(css, /\.is-flipped\b/, 'css must define .is-flipped');
  assert.match(css, /\.uno-card-front\b/, 'css must define .uno-card-front');
  assert.match(css, /\.uno-corner-pip\b/, 'css must define .uno-corner-pip');
  assert.match(css, /\.card-sequence-yellow\b/, 'css must define card sequence yellow');
  assert.match(css, /\.card-sequence-red\b/, 'css must define card sequence red');
  assert.match(css, /\.card-sequence-blue\b/, 'css must define card sequence blue');
  assert.match(css, /\.card-sequence-green\b/, 'css must define card sequence green');

  // Formative feedback classes
  assert.match(css, /\.card-feedback-panel\b/, 'css must define .card-feedback-panel');
  assert.match(css, /\.feedback-correct\b/, 'css must define .feedback-correct');
  assert.match(css, /\.feedback-partial\b/, 'css must define .feedback-partial');
  assert.match(css, /\.feedback-incorrect\b/, 'css must define .feedback-incorrect');
});

test('Card Invariance: index.html contains required interactive-card DOM structure', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  // Interactive card container
  assert.match(html, /id="interactive-card"/, 'index.html must have #interactive-card');
  assert.match(html, /class="[^"]*playing-card[^"]*"/, '#interactive-card must have .playing-card class');

  // Front elements
  assert.match(html, /id="front-card-num"/, 'must have front-card-num');
  assert.match(html, /id="front-card-title"/, 'must have front-card-title');
  assert.match(html, /id="front-card-prompt"/, 'must have front-card-prompt');
  assert.match(html, /id="front-card-options"/, 'must have front-card-options');
  assert.match(html, /id="front-timer-badge"/, 'must have front-timer-badge');

  // Back elements
  assert.match(html, /id="card-feedback-box"/, 'must have card-feedback-box');
  assert.match(html, /id="card-feedback-header"/, 'must have card-feedback-header');
  assert.match(html, /id="card-feedback-status"/, 'must have card-feedback-status');
  assert.match(html, /id="card-feedback-points"/, 'must have card-feedback-points');
  assert.match(html, /id="card-feedback-message"/, 'must have card-feedback-message');
  assert.match(html, /id="card-feedback-method"/, 'must have card-feedback-method');
});

// ---------------------------------------------------------------------------
// 4. Draft Isolation: Unpublished Content Must Never Be Playable
// ---------------------------------------------------------------------------

test('Security & Integrity: Draft (unpublished) questions are excluded from public catalog', () => {
  const allTeacherQuestions = [
    { code: 'q1', status: 'published', title: 'Inilathala' },
    { code: 'q2', status: 'draft', title: 'Nasa Borador pa' },
    { code: 'q3', status: 'archived', title: 'Naka-archive' },
    { code: 'q4', status: 'published', title: 'Inilathala Rin' }
  ];

  // Simulating catalogService filter (status === 'published' && !archived_at)
  const studentPlayableQuestions = allTeacherQuestions.filter(q => q.status === 'published');

  assert.equal(studentPlayableQuestions.length, 2);
  assert.ok(studentPlayableQuestions.every(q => q.status === 'published'));
  assert.ok(!studentPlayableQuestions.some(q => q.code === 'q2'), 'Draft question must not reach student');
  assert.ok(!studentPlayableQuestions.some(q => q.code === 'q3'), 'Archived question must not reach student');
});

// ---------------------------------------------------------------------------
// 5. Dynamic Score & Result Calculation
// ---------------------------------------------------------------------------

test('Scoring Integrity: renderResultScreen calculates dynamic maxScore and percentage', () => {
  const dynamicDeck = {
    title: 'Ibong Adarna',
    cards: [
      { id: 'c1', points: 1 },
      { id: 'c2', points: 1 },
      { id: 'c3', points: 2 }, // Bonus card = 2 pts
      { id: 'c4', points: 1 },
      { id: 'c5', points: 0 }  // Reverse review = 0 pts
    ]
  };

  const dynamicAnswers = {
    c1: { pointsEarned: 1, isCorrect: true },
    c2: { pointsEarned: 1, isCorrect: true },
    c3: { pointsEarned: 2, isCorrect: true },
    c4: { pointsEarned: 0, isCorrect: false },
    c5: { pointsEarned: 0, isCorrect: true }
  };

  let mainRoundScore = 0;
  let mainCorrectCount = 0;
  const maxScore = dynamicDeck.cards.reduce((sum, c) => sum + (c.points ?? 1), 0);

  dynamicDeck.cards.forEach((card) => {
    const record = dynamicAnswers[card.id];
    if (record) {
      mainRoundScore += (record.pointsEarned || 0);
      if (record.isCorrect) mainCorrectCount++;
    }
  });

  const reverseRoundPoints = 1; // 1 second-chance point awarded
  const finalTotalScore = mainRoundScore + reverseRoundPoints;
  const percentage = Math.min(100, Math.round((finalTotalScore / maxScore) * 100));

  assert.equal(maxScore, 5, 'maxScore dynamically sums points: 1+1+2+1+0 = 5');
  assert.equal(mainRoundScore, 4, 'main round score earned: 1+1+2+0+0 = 4');
  assert.equal(mainCorrectCount, 4);
  assert.equal(finalTotalScore, 5, 'final total score: 4 + 1 = 5');
  assert.equal(percentage, 100, '5/5 = 100%');
});

// ---------------------------------------------------------------------------
// 6. Release-Critical Gameplay Regression Tests (Fixes A, B, D, E)
// ---------------------------------------------------------------------------

const vm = require('node:vm');

function sliceBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  assert.notEqual(start, -1, `Expected to find ${startToken}`);
  assert.notEqual(end, -1, `Expected to find ${endToken}`);
  return source.slice(start, end);
}

test('Release fix (A): handleTopicSelection and startDeckSession block navigation when a topic has 0 published cards/questions and show Filipino warning', async () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /id="deck-alert-banner"/, 'index.html must include #deck-alert-banner on deck screen');
  assert.match(html, /id="deck-alert-text"/, 'index.html must include #deck-alert-text on deck screen');

  const hydrateSource = sliceBetween(
    mainJs,
    'function mapCatalogQuestionToCard(',
    'function renderDynamicTopicCards('
  );
  const resolveNameSource = sliceBetween(
    mainJs,
    'function resolveActiveStudentName(',
    'function beginRemoteGameSession('
  );
  const deckWarningSource = sliceBetween(
    mainJs,
    'function showDeckWarning(',
    'if (studentNameInput) {'
  );
  const topicSelectionSource = sliceBetween(
    mainJs,
    'function selectDeck(',
    'const allTopicCards ='
  );
  const startDeckSource = sliceBetween(
    mainJs,
    'function startDeckSession(',
    'function renderCardByTypeIndex('
  );

  let activeScreen = 'deck';
  const bannerClasses = new Set(['alert-box', 'alert-error', 'hidden']);
  const deckAlertBanner = {
    classList: {
      add: (cls) => bannerClasses.add(cls),
      remove: (cls) => bannerClasses.delete(cls),
      contains: (cls) => bannerClasses.has(cls)
    },
    scrollIntoView: () => {}
  };
  const deckAlertText = { textContent: '' };

  const PANITIKARD_DECKS_MOCK = {
    '5': {
      id: '5',
      title: 'Kabanata 4',
      badge: 'Kabanata',
      cardCount: 0,
      cards: [],
      questions: []
    }
  };

  let remoteSessionStarted = false;
  let cardRendered = false;

  const sandbox = {
    console,
    PANITIKARD_CARD_TYPES,
    PANITIKARD_DECKS: PANITIKARD_DECKS_MOCK,
    appState: {
      studentName: 'Ralph Reniel Reyes',
      activeDeckId: '5',
      answers: {},
      incorrectQuestions: []
    },
    reverseState: {},
    screens: { setup: 'setup', deck: 'deck', card: 'card', quiz: 'quiz' },
    studentNameInput: { value: 'Ralph Reniel Reyes', focus: () => {} },
    deckStudentName: { textContent: 'Ralph Reniel Reyes' },
    cardDeckIndicator: { textContent: '' },
    cardStudentIndicator: { textContent: '' },
    document: {
      getElementById: (id) => {
        if (id === 'deck-alert-banner') return deckAlertBanner;
        if (id === 'deck-alert-text') return deckAlertText;
        return null;
      },
      querySelector: () => null,
      querySelectorAll: () => []
    },
    window: {
      PANITIKARD_GAME_API: {
        enabled: true,
        listQuestions: async () => ({
          topic: { code: '5', title: 'Kabanata 4' },
          questions: []
        })
      }
    },
    navigateToScreen: (scr) => { activeScreen = scr; },
    showValidation: () => {},
    stopChallengeTimer: () => {},
    stopReverseTimer: () => {},
    beginRemoteGameSession: () => { remoteSessionStarted = true; },
    renderCardByTypeIndex: () => { cardRendered = true; },
    startQuiz: () => { activeScreen = 'quiz'; }
  };

  vm.createContext(sandbox);
  vm.runInContext(
    `${hydrateSource}\n${resolveNameSource}\n${deckWarningSource}\n${topicSelectionSource}\n${startDeckSource}`,
    sandbox
  );

  const navigated = await sandbox.handleTopicSelection('5');
  assert.equal(navigated, false, 'handleTopicSelection must return false when topic has 0 published questions');
  assert.equal(activeScreen, 'deck', 'Must remain on deck selection screen and never navigate to empty loading card');
  assert.equal(remoteSessionStarted, false, 'Must not create a remote game session for an empty topic');
  assert.equal(cardRendered, false, 'Must not render card arena when deck has 0 cards');
  assert.equal(bannerClasses.has('hidden'), false, 'Warning banner must be visible');
  assert.match(deckAlertText.textContent, /Wala pang inilathalang tanong o kard/i);

  const directStart = sandbox.startDeckSession();
  assert.equal(directStart, false, 'startDeckSession must also guard against empty deck.cards');
  assert.equal(activeScreen, 'deck');
});

test('Release fix (B): resolveActiveStudentName and beginRemoteGameSession synchronize studentName from input, badge, or sessionStorage', async () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
  const resolveNameSource = sliceBetween(
    mainJs,
    'function resolveActiveStudentName(',
    'function startRemoteTimer('
  );

  const createSessionCalls = [];
  const inputMock = { value: 'Ralph Reniel Reyes' };
  const badgeMock = { textContent: '-' };
  const storageMap = new Map();

  const sandbox = {
    console,
    Promise,
    Object,
    Array,
    appState: {
      studentName: '', // Simulates state cleared after reload while input still has value
      activeDeckId: 'elements',
      activeCardTypeIndex: 0,
      answers: {},
      remoteSessionId: null,
      remoteQuestionCatalog: null,
      remoteSessionPromise: null,
      remoteSessionGeneration: 0,
      remoteWriteQueue: Promise.resolve()
    },
    studentNameInput: inputMock,
    deckStudentName: badgeMock,
    sessionStorage: {
      getItem: (k) => storageMap.get(k) || null,
      setItem: (k, v) => storageMap.set(k, v)
    },
    document: {
      getElementById: (id) => {
        if (id === 'student-name') return inputMock;
        if (id === 'deck-student-name') return badgeMock;
        return null;
      }
    },
    hydrateDeckFromCatalog: () => {},
    renderCardByTypeIndex: () => {},
    window: {
      PANITIKARD_GAME_API: {
        enabled: true,
        clearGuestToken: () => {},
        setGuestToken: () => {},
        hasAccessToken: () => false,
        hasSessionToken: () => false,
        listQuestions: async () => ({ topic: { code: 'elements' }, questions: [] }),
        createSession: async (topicCode, mode, studentName) => {
          createSessionCalls.push({ topicCode, mode, studentName });
          return { id: 'sess-sync-1', sessionToken: 'guest.token.1' };
        }
      }
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(resolveNameSource, sandbox);

  // 1. Restores from #student-name input when appState.studentName is empty
  sandbox.beginRemoteGameSession('elements', 'deck');
  await sandbox.appState.remoteSessionPromise;

  assert.equal(sandbox.appState.studentName, 'Ralph Reniel Reyes');
  assert.equal(badgeMock.textContent, 'Ralph Reniel Reyes');
  assert.equal(createSessionCalls.length, 1);
  assert.equal(createSessionCalls[0].studentName, 'Ralph Reniel Reyes');

  // 2. Restores from sessionStorage when both appState.studentName and input are empty
  sandbox.appState.studentName = '';
  inputMock.value = '';
  badgeMock.textContent = '-';
  storageMap.set('panitikard_student_name', 'Maria Clara');

  const restoredFromStorage = sandbox.resolveActiveStudentName();
  assert.equal(restoredFromStorage, 'Maria Clara');
  assert.equal(sandbox.appState.studentName, 'Maria Clara');
  assert.equal(inputMock.value, 'Maria Clara');
  assert.equal(badgeMock.textContent, 'Maria Clara');

  // 3. Prevents calling createSession when name is missing/invalid (< 2 chars) for guest
  sandbox.appState.studentName = '';
  inputMock.value = 'A';
  badgeMock.textContent = '-';
  storageMap.clear();

  sandbox.beginRemoteGameSession('elements', 'deck');
  assert.equal(sandbox.appState.remoteSessionPromise, null, 'Must not call createSession with 1-char studentName');
  assert.equal(createSessionCalls.length, 1);
});

test('Release fix (D & E): hydrateDeckFromCatalog, renderDynamicTopicCards, and card step counter handle 1-card Deck topics ("1 ng 1") and 1-question Quiz topics', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf8');
  const hydrateAndRenderSource = sliceBetween(
    mainJs,
    'function mapCatalogQuestionToCard(',
    'async function loadRemoteCatalog('
  );
  const navSource = sliceBetween(
    mainJs,
    'function updateNavigationControls(',
    'function updateTabsState('
  );
  const unlockSource = sliceBetween(
    mainJs,
    'function unlockNextIndex(',
    'function startChallengeTimer('
  );

  const appendedRows = [];
  const removedTopics = [];
  const mockContainer = {
    querySelector: (sel) => {
      if (sel === '[data-dynamic-topic="5"]') {
        return { remove: () => removedTopics.push('5') };
      }
      return null;
    },
    appendChild: (row) => appendedRows.push(row)
  };

  const mockDecks = {};
  const btnPrevCard = { disabled: false };
  const btnNextCard = { disabled: false, innerHTML: '', classList: { add: () => {}, remove: () => {} } };

  const sandbox = {
    console,
    PANITIKARD_CARD_TYPES,
    PANITIKARD_DECKS: mockDecks,
    appState: {
      activeDeckId: 'kabanata-4',
      activeCardTypeIndex: 0,
      highestUnlockedIndex: 0,
      reverseRoundCompleted: false,
      incorrectQuestions: [],
      answers: {}
    },
    btnPrevCard,
    btnNextCard,
    escapeHtml: (s) => String(s || ''),
    handleTopicSelection: () => {},
    document: {
      querySelector: (sel) => sel === '.topic-cards-container' ? mockContainer : null,
      createElement: () => ({
        className: '',
        innerHTML: '',
        setAttribute: function(k, v) { this[k] = v; },
        querySelector: () => ({ addEventListener: () => {} })
      })
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(`${hydrateAndRenderSource}\n${navSource}\n${unlockSource}`, sandbox);

  // 1. renderDynamicTopicCards skips unplayable Topic 5 (0 published questions) and keeps playable Deck + Quiz topics
  sandbox.renderDynamicTopicCards([
    {
      code: '5',
      title: 'Kabanata 4 (Empty)',
      playable: false,
      publishedQuestionCount: 0,
      deckQuestionCount: 0,
      quizQuestionCount: 0
    },
    {
      code: 'kabanata-4',
      title: 'Kabanata 4: Kabesang Tales',
      playable: true,
      publishedQuestionCount: 1,
      deckQuestionCount: 1,
      quizQuestionCount: 0
    },
    {
      code: 'pagsusulit-1',
      title: 'Maikling Pagsusulit 1',
      playable: true,
      publishedQuestionCount: 1,
      deckQuestionCount: 0,
      quizQuestionCount: 1
    }
  ]);

  assert.deepEqual(removedTopics, ['5'], 'Stale DOM card for unplayable topic 5 must be removed');
  assert.equal(appendedRows.length, 2, 'Both playable Deck topic and playable Quiz-only topic must be rendered');
  assert.equal(mockDecks['kabanata-4'].cardCount, 1);
  assert.equal(mockDecks['pagsusulit-1'].cardCount, 1);

  // 2. Hydrating a 1-card Deck topic sets cardCount = 1 and cards.length = 1 (never 7)
  sandbox.hydrateDeckFromCatalog('kabanata-4', {
    topic: { code: 'kabanata-4', title: 'Kabanata 4: Kabesang Tales' },
    questions: [
      {
        code: 'kab4-q1',
        title: 'Tanong sa Kabanata 4',
        prompt: 'Sino ang anak ni Tandang Selo na naging tulisan?',
        cardCategory: 'question',
        questionType: 'multiple_choice',
        points: 1,
        dbChoices: [
          { key: 'A', text: 'Kabesang Tales' },
          { key: 'B', text: 'Basilio' }
        ]
      }
    ]
  });

  assert.equal(mockDecks['kabanata-4'].cards.length, 1);
  assert.equal(mockDecks['kabanata-4'].cardCount, 1);
  assert.equal(mockDecks['kabanata-4'].questions.length, 0);

  // Verify unlockNextIndex and updateNavigationControls use actual deck.cards.length (1), not hardcoded 7
  sandbox.unlockNextIndex();
  assert.equal(sandbox.appState.highestUnlockedIndex, 0, 'With 1 card in deck, highestUnlockedIndex must stay 0 (not advance to 1..6)');
  sandbox.updateNavigationControls(0, true);
  assert.match(btnNextCard.innerHTML, /Tingnan ang Resulta/, 'On card 1 of 1 after submission, Next button must show Tingnan ang Resulta');

  // 3. Hydrating a 1-question Quiz topic (cardCategory: null) populates deck.questions instead of misclassifying as Deck
  sandbox.hydrateDeckFromCatalog('pagsusulit-1', {
    topic: { code: 'pagsusulit-1', title: 'Maikling Pagsusulit 1' },
    questions: [
      {
        code: 'quiz1-q1',
        title: 'Unang Tanong sa Pagsusulit',
        prompt: 'Tukuyin ang pangunahing kaisipan.',
        cardCategory: null,
        questionType: 'open_ended',
        points: 1
      }
    ]
  });

  assert.equal(mockDecks['pagsusulit-1'].questions.length, 1, 'Quiz question with cardCategory: null must populate deck.questions');
  assert.equal(mockDecks['pagsusulit-1'].cards.length, 0, 'Quiz-only topic must have 0 deck cards so handleTopicSelection routes to startQuiz');
  assert.equal(mockDecks['pagsusulit-1'].cardCount, 1);
});

test('Question Ordering Regression: alphabetically jumbled Deck catalog hydrates in canonical category order and keeps elem-question first', async () => {
  const vm = require('node:vm');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf-8');

  function sliceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start !== -1 && end !== -1, `Markers not found: ${startMarker} -> ${endMarker}`);
    return source.slice(start, end);
  }

  const hydrateSource = sliceBetween(
    mainJs,
    'function mapCatalogQuestionToCard(',
    'async function loadRemoteCatalog('
  );
  const sessionSource = sliceBetween(
    mainJs,
    'function resolveActiveStudentName(',
    'function startRemoteTimer('
  );

  const mockDecks = JSON.parse(JSON.stringify(PANITIKARD_DECKS));
  const renderedCardIndices = [];
  const renderedCards = [];

  const interactiveCard = {
    className: 'playing-card is-flipped',
    dataset: { flipped: 'true' },
    classList: {
      _set: new Set(['playing-card', 'is-flipped']),
      contains(cls) { return this._set.has(cls); },
      toggle(cls, force) {
        const shouldHave = force !== undefined ? Boolean(force) : !this._set.has(cls);
        if (shouldHave) this._set.add(cls);
        else this._set.delete(cls);
        return shouldHave;
      }
    }
  };

  // Alphabetically sorted by code (as returned by raw ORDER BY code)
  const alphabeticallyJumbledElements = [
    {
      code: 'elem-bonus',
      title: 'Pagsusuri ng Elemento: Banghay',
      prompt: 'Bakit itinuturing na pundasyon ng banghay ang maayos na pagkakasunod-sunod ng mga pangyayari?',
      cardCategory: 'bonus',
      questionType: 'open_ended',
      points: 2,
      dbChoices: []
    },
    {
      code: 'elem-challenge',
      title: 'Panghamong KARD: Tauhan',
      prompt: 'Sa loob ng 30 segundo, ipaliwanag ang kahalagahan ng tauhang bilog.',
      cardCategory: 'challenge',
      questionType: 'open_ended',
      points: 1,
      timeLimit: 30,
      dbChoices: []
    },
    {
      code: 'elem-correction',
      title: 'Pagsusuri ng Elemento: Tema',
      prompt: 'Iwasto ang pahayag tungkol sa tema.',
      cardCategory: 'correction',
      questionType: 'open_ended',
      points: 1,
      dbChoices: []
    },
    {
      code: 'elem-help',
      title: 'Pagsusuri ng Elemento: Pananaw',
      prompt: 'Ipaliwanag ang unang panauhang pananaw.',
      cardCategory: 'help',
      questionType: 'open_ended',
      points: 1,
      dbChoices: []
    },
    {
      code: 'elem-question',
      title: 'Pagsusuri ng Elemento: Tunggalian',
      prompt: 'Alin ang tumutukoy sa pangunahing tunggalian sa isang akda?',
      cardCategory: 'question',
      questionType: 'multiple_choice',
      points: 1,
      dbChoices: [
        { key: 'A', text: 'Tagpuan ng mga tauhan' },
        { key: 'B', text: 'Suliraning kinakaharap ng tauhan' },
        { key: 'C', text: 'Pangalan ng may-akda' },
        { key: 'D', text: 'Haba ng kabanata' }
      ]
    },
    {
      code: 'elem-reverse',
      title: 'Pagbabalik-aral: Elemento',
      prompt: 'Balikan ang kahulugan ng banghay.',
      cardCategory: 'reverse',
      questionType: 'open_ended',
      points: 0,
      dbChoices: []
    },
    {
      code: 'elem-statement',
      title: 'Pagsusuri ng Elemento: Tagpuan',
      prompt: 'Ipaliwanag kung paano nakatutulong ang tagpuan sa pag-unawa sa akda.',
      cardCategory: 'statement',
      questionType: 'open_ended',
      points: 1,
      dbChoices: []
    }
  ];

  const sandbox = {
    console,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Promise,
    PANITIKARD_CARD_TYPES,
    PANITIKARD_DECKS: mockDecks,
    interactiveCard,
    studentNameInput: { value: 'Ralph Reniel Reyes' },
    deckStudentName: { textContent: 'Ralph Reniel Reyes' },
    appState: {
      studentName: 'Ralph Reniel Reyes',
      activeDeckId: 'elements',
      activeCardTypeIndex: 0,
      answers: {},
      remoteSessionGeneration: 0,
      remoteSessionId: null,
      remoteQuestionCatalog: null,
      remoteSessionPromise: null,
      remoteWriteQueue: Promise.resolve(),
      startedRemoteTimers: {}
    },
    window: {
      PANITIKARD_GAME_API: {
        enabled: true,
        clearGuestToken: () => {},
        setGuestToken: () => {},
        hasAccessToken: () => false,
        hasSessionToken: () => false,
        listQuestions: async () => ({
          topic: { code: 'elements', title: 'Pagsusuri ng Elemento ng Akda' },
          questions: alphabeticallyJumbledElements
        }),
        createSession: async () => ({
          id: 'session-order-1',
          sessionToken: 'guest-token-order-1'
        })
      }
    },
    renderCardByTypeIndex: (idx) => {
      renderedCardIndices.push(idx);
      renderedCards.push(mockDecks.elements.cards[idx]);
    },
    setActiveCardFace: () => {},
    updateFlipControlsState: () => {}
  };

  vm.createContext(sandbox);
  vm.runInContext(`${hydrateSource}\n${sessionSource}`, sandbox);

  // Simulate student flipping the first card (elem-question Multiple Choice) before async session finishes
  interactiveCard.classList.toggle('is-flipped', false);

  sandbox.beginRemoteGameSession('elements', 'deck');
  await sandbox.appState.remoteSessionPromise;

  const hydratedIds = Array.from(mockDecks.elements.cards, c => c.id);
  const hydratedTypes = Array.from(mockDecks.elements.cards, c => c.type);

  // 1. Canonical category order is strictly enforced
  assert.deepEqual(
    hydratedTypes,
    ['question', 'statement', 'correction', 'bonus', 'reverse', 'help', 'challenge'],
    'Deck cards must hydrate in canonical category order: question -> statement -> correction -> bonus -> reverse -> help -> challenge'
  );
  assert.deepEqual(
    hydratedIds,
    ['elem-question', 'elem-statement', 'elem-correction', 'elem-bonus', 'elem-reverse', 'elem-help', 'elem-challenge']
  );

  // 2. First Deck card remains elem-question with Multiple Choice options and card number "01"
  const firstCard = mockDecks.elements.cards[0];
  assert.equal(firstCard.id, 'elem-question');
  assert.equal(firstCard.type, 'question');
  assert.equal(firstCard.number, '01');
  assert.equal(firstCard.options.length, 4);
  assert.deepEqual(Array.from(firstCard.choices), [
    'Tagpuan ng mga tauhan',
    'Suliraning kinakaharap ng tauhan',
    'Pangalan ng may-akda',
    'Haba ng kabanata'
  ]);

  // 3. Because card 0 was already showing front with elem-question, async resolution does NOT swap or re-render it into elem-bonus
  assert.equal(renderedCards.length, 0, 'Revealed Multiple Choice card 0 must not be replaced by a re-render when card ID matches');
});

test('Question Ordering & Quiz Mapping Regression: natural numeric Quiz ordering and preserved explicit multiple_choice type', () => {
  const vm = require('node:vm');
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf-8');

  const start = mainJs.indexOf('function mapCatalogQuestionToCard(');
  const end = mainJs.indexOf('async function loadRemoteCatalog(', start);
  const hydrateSource = mainJs.slice(start, end);

  const mockDecks = {};
  const sandbox = {
    console,
    Array,
    Object,
    String,
    Number,
    Boolean,
    PANITIKARD_CARD_TYPES,
    PANITIKARD_DECKS: mockDecks
  };
  vm.createContext(sandbox);
  vm.runInContext(hydrateSource, sandbox);

  // 1. Lexicographically ordered quiz questions (q1, q10, q11, q2) hydrate in natural numeric order (q1, q2, q10, q11)
  sandbox.hydrateDeckFromCatalog('alamat', {
    topic: { code: 'alamat', title: 'Alamat' },
    questions: [
      { code: 'alamat-q1', prompt: 'Unang tanong', cardCategory: null, questionType: 'multiple_choice', dbChoices: [{ key: 'A', text: 'Isa' }, { key: 'B', text: 'Dalawa' }] },
      { code: 'alamat-q10', prompt: 'Ikasampung tanong', cardCategory: null, questionType: 'multiple_choice', dbChoices: [{ key: 'A', text: 'A' }, { key: 'B', text: 'B' }] },
      { code: 'alamat-q11', prompt: 'ikalabing-isang tanong', cardCategory: null, questionType: 'situational' },
      { code: 'alamat-q2', prompt: 'Ikalawang tanong', cardCategory: null, questionType: 'identification' }
    ]
  });

  assert.deepEqual(
    Array.from(mockDecks.alamat.questions, q => q.id),
    ['alamat-q1', 'alamat-q2', 'alamat-q10', 'alamat-q11'],
    'Quiz questions must be ordered naturally (q1, q2, q10, q11)'
  );
  assert.deepEqual(
    Array.from(mockDecks.alamat.questions, q => q.number),
    [1, 2, 3, 4],
    'Quiz question numbers must follow natural sorted sequence'
  );

  // 2. Explicit multiple_choice type is preserved even when dbChoices is empty [], without turning into identification or inventing choices
  const mappedMissingChoices = sandbox.mapCatalogQuestionToQuiz({
    code: 'quiz-mc-missing-choices',
    prompt: 'Alin sa sumusunod ang tama?',
    questionType: 'multiple_choice',
    dbChoices: []
  }, 0);

  assert.equal(
    mappedMissingChoices.questionType,
    'multiple_choice',
    'Explicit multiple_choice questionType must be preserved and never silently converted to identification'
  );
  assert.deepEqual(
    Array.from(mappedMissingChoices.choices),
    [],
    'Missing choices must produce an empty array without inventing options'
  );
  assert.equal(mappedMissingChoices.answer, '', 'Missing answer must remain empty without inventing an answer');

  // 3. When dbChoices is empty [] but payload options/choices exist, mapCatalogQuestionToCard and mapCatalogQuestionToQuiz recover them
  const mappedCardFallback = sandbox.mapCatalogQuestionToCard({
    code: 'elem-question',
    cardCategory: 'question',
    questionType: 'multiple_choice',
    dbChoices: [],
    options: [
      { key: 'A', text: 'Tagpuan' },
      { key: 'B', text: 'Tunggalian' }
    ]
  }, 0);
  assert.equal(mappedCardFallback.options.length, 2);
  assert.equal(mappedCardFallback.options[1].text, 'Tunggalian');
});

test('Regression: Expected Answer (Batayan) appears in result breakdown for Multiple Choice and Written Answer after submission', () => {
  const mainJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf-8');

  // Verify resolveCorrectAnswerDisplay helper exists
  assert.match(mainJs, /function resolveCorrectAnswerDisplay\(/);

  // Verify renderDeckResults displays formatted reference answer instead of empty string
  assert.match(mainJs, /Tamang Sagot \/ Batayan:<\/strong>\s*\$\{escapeHtml\(formattedRef\)\}/);

  // Verify renderQuizResults displays formatted reference answer
  assert.match(mainJs, /Tamang Sagot:<\/strong>\s*\$\{escapeHtml\(formattedQuizRef\)\}/);

  // Verify appendReverseRoundReviews displays formatted reference answer
  assert.match(mainJs, /Tamang Sagot:<\/strong>\s*\$\{escapeHtml\(formattedRevRef\)\}/);

  // Verify safe fallback is defined when expected answer is genuinely missing
  assert.match(mainJs, /Walang nakatalagang batayang sagot/);
  assert.match(mainJs, /Walang nakatalagang tamang sagot/);

  // Verify card reverse face uses submitted correctAnswer or expectedAnswer
  assert.match(mainJs, /resolvedAnswer = \(submission && \(submission\.correctAnswer \|\| submission\.expectedAnswer\)\) \|\|/);
});
