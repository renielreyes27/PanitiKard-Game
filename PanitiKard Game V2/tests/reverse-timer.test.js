const test = require("node:test");
const assert = require("node:assert/strict");

// Mock a lightweight DOM environment for timer testing
function createMockElement() {
  const classes = new Set();
  return {
    textContent: "",
    disabled: false,
    classList: {
      add: (...c) => c.forEach(x => classes.add(x)),
      remove: (...c) => c.forEach(x => classes.delete(x)),
      toggle: (c, force) => {
        if (force === true) classes.add(c);
        else if (force === false) classes.delete(c);
        else if (classes.has(c)) classes.delete(c);
        else classes.add(c);
      },
      contains: (c) => classes.has(c)
    }
  };
}

function setupReverseTimerHarness() {
  const reverseTimerBadge = null;
  const reverseTimerSeconds = null;
  const reverseHeaderTimerBadge = createMockElement();
  const reverseHeaderTimerSeconds = createMockElement();
  const reverseCard = createMockElement();
  const reverseFeedbackStatus = createMockElement();
  const reverseFeedbackPoints = createMockElement();

  const reverseState = {
    selectedQuestions: [],
    maxAttempts: 3,
    attemptsRemaining: 3,
    currentIndex: 0,
    pointsEarned: 0,
    answers: {},
    selectedOption: null,
    isSubmitted: false,
    timerId: null,
    secondsRemaining: 0
  };

  function getQuestionTimeLimit(q) {
    if (!q) return null;
    const limit = q.timeLimit ?? q.timeLimitSeconds ?? q.originalCard?.timeLimit ?? q.originalCard?.timeLimitSeconds ?? null;
    return typeof limit === "number" && limit > 0 ? limit : null;
  }

  function updateReverseTimerDisplay(seconds, isWarning = false) {
    const secStr = String(Math.max(0, seconds));
    if (reverseTimerSeconds) reverseTimerSeconds.textContent = secStr;
    if (reverseHeaderTimerSeconds) reverseHeaderTimerSeconds.textContent = secStr;
    if (reverseTimerBadge) reverseTimerBadge.classList.toggle("timer-warning", isWarning);
    if (reverseHeaderTimerBadge) reverseHeaderTimerBadge.classList.toggle("timer-warning", isWarning);
  }

  function setReverseTimerVisible(visible) {
    if (reverseTimerBadge) {
      reverseTimerBadge.classList.toggle("hidden", !visible);
      if (!visible) reverseTimerBadge.classList.remove("timer-warning");
    }
    if (reverseHeaderTimerBadge) {
      reverseHeaderTimerBadge.classList.toggle("hidden", !visible);
      if (!visible) reverseHeaderTimerBadge.classList.remove("timer-warning");
    }
  }

  function stopReverseTimer() {
    if (reverseState.timerId) {
      clearInterval(reverseState.timerId);
      reverseState.timerId = null;
    }
    if (reverseTimerBadge) reverseTimerBadge.classList.remove("timer-warning");
    if (reverseHeaderTimerBadge) reverseHeaderTimerBadge.classList.remove("timer-warning");
  }

  function startReverseTimer(q, preserveRemaining = false) {
    stopReverseTimer();
    const timeLimit = getQuestionTimeLimit(q);
    if (!timeLimit || reverseState.isSubmitted) {
      setReverseTimerVisible(false);
      return;
    }

    if (!preserveRemaining || reverseState.secondsRemaining <= 0) {
      reverseState.secondsRemaining = timeLimit;
    }

    setReverseTimerVisible(true);
    updateReverseTimerDisplay(reverseState.secondsRemaining, reverseState.secondsRemaining <= 10);

    reverseState.timerId = setInterval(() => {
      reverseState.secondsRemaining--;
      const remaining = reverseState.secondsRemaining;
      updateReverseTimerDisplay(remaining, remaining <= 10);

      if (remaining <= 0) {
        stopReverseTimer();
        handleReverseTimeout(q);
      }
    }, 1000);
  }

  function handleReverseTimeout(q) {
    if (reverseState.isSubmitted) return;
    const currentQ = q || reverseState.selectedQuestions[reverseState.currentIndex];
    handleReverseSubmit(true, "(Naubos ang 30 segundo / Walang naisulat)");
  }

  function handleReverseSubmit(isTimeout = false, forcedInput = null) {
    stopReverseTimer();
    if (reverseState.isSubmitted) return;
    if (reverseState.attemptsRemaining <= 0) return;

    const q = reverseState.selectedQuestions[reverseState.currentIndex];
    if (!q) return;

    reverseState.isSubmitted = true;
    reverseState.attemptsRemaining = Math.max(0, reverseState.attemptsRemaining - 1);

    const isCorrect = isTimeout ? false : true;
    const points = isCorrect ? (q.points || 1) : 0;
    reverseState.pointsEarned += points;

    reverseState.answers[q.id] = {
      userAnswer: isTimeout ? forcedInput : "Test Answer",
      isCorrect,
      pointsEarned: points,
      isTimeout: isTimeout === true,
      evaluationMethod: isTimeout ? "timeout" : "answer_key"
    };

    if (isTimeout) {
      reverseFeedbackStatus.textContent = "NAUBOS ANG ORAS!";
      reverseFeedbackPoints.textContent = "0 Punto";
    }
  }

  function toggleReverseCardFlip() {
    if (!reverseCard || reverseState.isSubmitted) return;
    reverseCard.classList.toggle("is-flipped");
    const isNowFlipped = reverseCard.classList.contains("is-flipped");

    const q = reverseState.selectedQuestions[reverseState.currentIndex];
    const timeLimit = getQuestionTimeLimit(q);
    if (timeLimit && !reverseState.isSubmitted) {
      if (isNowFlipped) {
        stopReverseTimer();
      } else {
        startReverseTimer(q, true);
      }
    }
  }

  function renderReverseCard() {
    stopReverseTimer();
    const q = reverseState.selectedQuestions[reverseState.currentIndex];
    if (!q) return;

    reverseState.isSubmitted = false;
    const timeLimit = getQuestionTimeLimit(q);
    if (timeLimit) {
      reverseState.secondsRemaining = timeLimit;
      updateReverseTimerDisplay(timeLimit, false);
      setReverseTimerVisible(true);
    } else {
      reverseState.secondsRemaining = 0;
      setReverseTimerVisible(false);
    }

    reverseCard.classList.add("is-flipped");
  }

  return {
    reverseTimerBadge,
    reverseTimerSeconds,
    reverseHeaderTimerBadge,
    reverseHeaderTimerSeconds,
    reverseCard,
    reverseFeedbackStatus,
    reverseFeedbackPoints,
    reverseState,
    getQuestionTimeLimit,
    setReverseTimerVisible,
    updateReverseTimerDisplay,
    startReverseTimer,
    stopReverseTimer,
    handleReverseSubmit,
    handleReverseTimeout,
    toggleReverseCardFlip,
    renderReverseCard
  };
}

test("getQuestionTimeLimit returns time limit only for timed questions", () => {
  const h = setupReverseTimerHarness();
  assert.equal(h.getQuestionTimeLimit({ id: "elem-q1", timeLimit: null }), null);
  assert.equal(h.getQuestionTimeLimit({ id: "elem-challenge", timeLimit: 30 }), 30);
  assert.equal(h.getQuestionTimeLimit({ id: "elem-q7", originalCard: { timeLimit: 30 } }), 30);
  assert.equal(h.getQuestionTimeLimit({ id: "quiz-q1" }), null);
});

test("timed Reverse question initializes with visible timer badges on card render", () => {
  const h = setupReverseTimerHarness();
  h.reverseState.selectedQuestions = [{ id: "elem-challenge", timeLimit: 30, points: 1 }];
  h.renderReverseCard();

  assert.equal(h.reverseHeaderTimerSeconds.textContent, "30");
  assert.equal(h.reverseHeaderTimerBadge.classList.contains("hidden"), false);
  assert.equal(h.reverseTimerBadge, null);
  assert.equal(h.reverseState.timerId, null); // Not ticking yet because card is still facing back
});

test("untimed Reverse question keeps timer hidden and does not start timer", () => {
  const h = setupReverseTimerHarness();
  h.reverseState.selectedQuestions = [{ id: "elem-question", timeLimit: null, points: 1 }];
  h.renderReverseCard();

  assert.equal(h.reverseHeaderTimerBadge.classList.contains("hidden"), true);
  assert.equal(h.reverseTimerBadge, null);
  assert.equal(h.reverseState.timerId, null);

  // Flipping card still does not start timer for untimed question
  h.toggleReverseCardFlip();
  assert.equal(h.reverseState.timerId, null);
  assert.equal(h.reverseHeaderTimerBadge.classList.contains("hidden"), true);
});

test("flipping timed Reverse card to front starts visible countdown and flipping back pauses it", () => {
  const h = setupReverseTimerHarness();
  const q = { id: "elem-challenge", timeLimit: 30, points: 1 };
  h.reverseState.selectedQuestions = [q];
  h.renderReverseCard();

  // Flip to front (reveal question)
  h.toggleReverseCardFlip();
  assert.ok(h.reverseState.timerId !== null);
  assert.equal(h.reverseState.secondsRemaining, 30);

  // Flip back to green back (pause timer)
  h.toggleReverseCardFlip();
  assert.equal(h.reverseState.timerId, null);

  // Flip back to front (resume countdown)
  h.toggleReverseCardFlip();
  assert.ok(h.reverseState.timerId !== null);

  h.stopReverseTimer();
});

test("submitting an answer stops timer immediately", () => {
  const h = setupReverseTimerHarness();
  const q = { id: "elem-challenge", timeLimit: 30, points: 1 };
  h.reverseState.selectedQuestions = [q];
  h.renderReverseCard();
  h.toggleReverseCardFlip(); // starts timer
  assert.ok(h.reverseState.timerId !== null);

  h.handleReverseSubmit(false); // student submits
  assert.equal(h.reverseState.timerId, null);
  assert.equal(h.reverseState.isSubmitted, true);
  assert.equal(h.reverseState.answers["elem-challenge"].isCorrect, true);
});

test("timeout auto-submits zero points and records timeout status", () => {
  const h = setupReverseTimerHarness();
  const q = { id: "elem-challenge", timeLimit: 30, points: 1 };
  h.reverseState.selectedQuestions = [q];
  h.renderReverseCard();
  h.toggleReverseCardFlip(); // starts timer

  h.handleReverseTimeout(q);
  assert.equal(h.reverseState.timerId, null);
  assert.equal(h.reverseState.isSubmitted, true);
  assert.equal(h.reverseState.attemptsRemaining, 2);
  assert.equal(h.reverseState.pointsEarned, 0);
  assert.equal(h.reverseState.answers["elem-challenge"].isTimeout, true);
  assert.equal(h.reverseState.answers["elem-challenge"].isCorrect, false);
  assert.equal(h.reverseFeedbackStatus.textContent, "NAUBOS ANG ORAS!");
});

test("consecutive Reverse questions transition cleanly between timed and untimed", () => {
  const h = setupReverseTimerHarness();
  const qTimed = { id: "elem-challenge", timeLimit: 30, points: 1 };
  const qUntimed = { id: "elem-question", timeLimit: null, points: 1 };
  h.reverseState.selectedQuestions = [qTimed, qUntimed];

  // Question 1: Timed
  h.renderReverseCard();
  h.toggleReverseCardFlip();
  const firstTimerId = h.reverseState.timerId;
  assert.ok(firstTimerId !== null);

  h.handleReverseSubmit(false);
  assert.equal(h.reverseState.timerId, null);

  // Transition to Question 2: Untimed
  h.reverseState.currentIndex = 1;
  h.renderReverseCard();
  assert.equal(h.reverseHeaderTimerBadge.classList.contains("hidden"), true);
  assert.equal(h.reverseState.timerId, null);

  h.toggleReverseCardFlip();
  assert.equal(h.reverseState.timerId, null); // Still untimed
  h.handleReverseSubmit(false);
  assert.equal(h.reverseState.answers["elem-question"].isCorrect, true);
});

test("two consecutive timed Reverse questions reset and start fresh timers", () => {
  const h = setupReverseTimerHarness();
  const q1 = { id: "elem-challenge-1", timeLimit: 30, points: 1 };
  const q2 = { id: "elem-challenge-2", timeLimit: 30, points: 1 };
  h.reverseState.selectedQuestions = [q1, q2];

  // Question 1
  h.renderReverseCard();
  h.toggleReverseCardFlip();
  assert.ok(h.reverseState.timerId !== null);
  h.reverseState.secondsRemaining = 12; // elapsed
  h.handleReverseSubmit(false);
  assert.equal(h.reverseState.timerId, null);

  // Question 2
  h.reverseState.currentIndex = 1;
  h.renderReverseCard();
  assert.equal(h.reverseState.secondsRemaining, 30); // reset to fresh 30s
  assert.equal(h.reverseHeaderTimerSeconds.textContent, "30");
  assert.equal(h.reverseState.timerId, null); // paused on card back

  h.toggleReverseCardFlip();
  assert.ok(h.reverseState.timerId !== null);
  assert.equal(h.reverseState.secondsRemaining, 30);
  h.stopReverseTimer();
});

test("rapid repeated flip toggles never spawn multiple intervals", () => {
  const h = setupReverseTimerHarness();
  const q = { id: "elem-challenge", timeLimit: 30, points: 1 };
  h.reverseState.selectedQuestions = [q];
  h.renderReverseCard();

  // Rapidly toggle 5 times
  h.toggleReverseCardFlip(); // front (timer running)
  const id1 = h.reverseState.timerId;
  assert.ok(id1 !== null);

  h.toggleReverseCardFlip(); // back (paused)
  assert.equal(h.reverseState.timerId, null);

  h.toggleReverseCardFlip(); // front (timer running)
  const id2 = h.reverseState.timerId;
  assert.ok(id2 !== null);

  h.stopReverseTimer();
  assert.equal(h.reverseState.timerId, null);
});

test("leaving round or screen explicitly terminates active timer", () => {
  const h = setupReverseTimerHarness();
  const q = { id: "elem-challenge", timeLimit: 30, points: 1 };
  h.reverseState.selectedQuestions = [q];
  h.renderReverseCard();
  h.toggleReverseCardFlip();
  assert.ok(h.reverseState.timerId !== null);

  // Simulate user clicking "Mga Paksa" or header back button
  h.stopReverseTimer();
  assert.equal(h.reverseState.timerId, null);
  assert.equal(h.reverseHeaderTimerBadge.classList.contains("timer-warning"), false);
});

// ---------------------------------------------------------------------------
// Official Question Timer Initialization & Synchronization Regression Tests
// (Executes actual js/main.js functions inside an isolated VM context)
// ---------------------------------------------------------------------------

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PANITIKARD_CARD_TYPES } = require("../js/cards-data.js");

function sliceMainJs(mainJs, startMarker, endMarker) {
  const start = mainJs.indexOf(startMarker);
  assert.notEqual(start, -1, `Expected to find ${startMarker} in js/main.js`);
  const end = mainJs.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Expected to find ${endMarker} after ${startMarker} in js/main.js`);
  return mainJs.slice(start, end);
}

function createOfficialTimerTestHarness(customApiOverrides = {}) {
  const mainJs = fs.readFileSync(path.join(__dirname, "../js/main.js"), "utf8");

  const catalogMapSrc = sliceMainJs(
    mainJs,
    "function mapCatalogQuestionToCard(",
    "function renderDynamicTopicCards("
  );
  const remoteSessionSrc = sliceMainJs(
    mainJs,
    "function resolveActiveStudentName(",
    "function finishRemoteGameSession("
  );
  const submitAnswersSrc = sliceMainJs(
    mainJs,
    "function submitMultipleChoiceAnswer(",
    "function unlockNextIndex("
  );
  const challengeTimerSrc = sliceMainJs(
    mainJs,
    "function startChallengeTimer(",
    "if (btnFlipCard) {"
  );
  const quizSrc = sliceMainJs(
    mainJs,
    "function renderQuizQuestion(",
    "if (btnQuizSubmit) {"
  );
  const reverseTimerSrc = sliceMainJs(
    mainJs,
    "function getQuestionTimeLimit(",
    "function handleReverseNext("
  );

  const timerStartCalls = [];
  const submitAnswerCalls = [];
  const evaluateCalls = [];
  const callSequence = [];
  let guestToken = null;

  const interactiveCard = createMockElement();
  interactiveCard.dataset = { flipped: "true" };
  interactiveCard.classList.add("is-flipped");

  const reverseCard = createMockElement();
  reverseCard.dataset = { flipped: "true" };
  reverseCard.classList.add("is-flipped");

  const frontTimerBadge = createMockElement();
  const timerSeconds = createMockElement();
  const reverseTimerBadge = null;
  const reverseTimerSeconds = null;
  const reverseHeaderTimerBadge = createMockElement();
  const reverseHeaderTimerSeconds = createMockElement();
  const reverseSubmitWrap = createMockElement();
  const reverseAlertBox = createMockElement();
  const reverseAlertText = createMockElement();
  const reverseFeedbackBox = createMockElement();
  const reverseFeedbackHeader = createMockElement();
  const reverseFeedbackIcon = createMockElement();
  const reverseFeedbackStatus = createMockElement();
  const reverseFeedbackPoints = createMockElement();
  const reverseFeedbackMessage = createMockElement();
  const reverseFeedbackStudentAnswer = createMockElement();
  const reverseFeedbackAnswer = createMockElement();
  const reverseFeedbackExplanation = createMockElement();
  const reverseFeedbackTerms = createMockElement();
  const reverseFeedbackTermsText = createMockElement();
  const reverseNextBtnText = createMockElement();
  const reverseCardBackBrandContent = createMockElement();
  const reverseAttemptText = createMockElement();
  const reverseAttemptDots = { innerHTML: "", appendChild: () => {} };
  const reverseScoreText = createMockElement();
  const reverseCardNum = createMockElement();
  const reverseCardCategoryBadge = createMockElement();
  const reverseCardTitle = createMockElement();
  const reverseCardPrompt = createMockElement();
  const reverseCardOptions = {
    innerHTML: "",
    className: "",
    appendChild: () => {},
    querySelectorAll: () => []
  };
  const btnReverseSubmit = createMockElement();

  const quizAlertText = createMockElement();
  const quizAlertBox = {
    ...createMockElement(),
    querySelector: (sel) => (sel === "#quiz-alert-text" ? quizAlertText : null)
  };
  const quizFeedbackBox = {
    ...createMockElement(),
    scrollIntoView: () => {}
  };
  const quizFeedbackHeader = createMockElement();
  const quizFeedbackIcon = createMockElement();
  const quizFeedbackStatus = createMockElement();
  const quizFeedbackPoints = createMockElement();
  const quizFeedbackCorrectAnswer = createMockElement();
  const quizFeedbackExplanation = createMockElement();
  const quizFeedbackKeywordsWrap = createMockElement();
  const quizFeedbackKeywords = createMockElement();
  const quizNextBtnText = createMockElement();
  const quizSubmitWrapper = createMockElement();
  const btnQuizSubmit = createMockElement();
  const quizQuestionCounter = createMockElement();
  const quizProgressBarFill = { style: { width: "0%" } };
  const quizDifficultyBadge = createMockElement();
  const quizCategoryBadge = createMockElement();
  const quizTypeBadge = createMockElement();
  const quizQuestionText = createMockElement();
  const quizCurrentScore = createMockElement();
  const quizInputContainer = {
    innerHTML: "",
    appendChild: () => {},
    querySelectorAll: () => []
  };

  const openErrorBox = {
    ...createMockElement(),
    style: {},
    innerHTML: ""
  };
  const submitOpenBtn = { disabled: false, innerHTML: "Ipasa" };
  const openTextarea = { disabled: false, value: "Tamang paliwanag tungkol sa tugma." };
  const reverseTextInput = { value: "Tamang sagot sa reverse." };
  const quizTextInput = { value: "Tamang sagot sa quiz." };

  const PANITIKARD_DECKS = {
    elements: {
      id: "elements",
      title: "Mga Elemento ng Tula",
      badge: "Elemento",
      cardCount: 3,
      cards: [
        {
          id: "elem-mc-timed",
          type: "question",
          number: "01",
          tag: "Tanong",
          title: "Tanong na May Oras",
          prompt: "Ilan ang pantig sa lalabindalawahin?",
          questionType: "multiple_choice",
          points: 1,
          timeLimit: 20,
          options: [
            { key: "A", text: "12" },
            { key: "B", text: "14" }
          ],
          answer: "A",
          terms: null,
          explanation: "12 pantig bawat taludtod."
        },
        {
          id: "elem-untimed",
          type: "statement",
          number: "02",
          tag: "Pahayag",
          title: "Pahayag na Walang Oras",
          prompt: "Ano ang sukat?",
          questionType: "open_ended",
          points: 1,
          timeLimit: null,
          options: [],
          answer: "Bilang ng pantig sa bawat taludtod.",
          terms: [["sukat"], ["bilang", "pantig"]],
          explanation: "Bilang ng pantig."
        },
        {
          id: "elem-challenge",
          type: "challenge",
          number: "03",
          tag: "Hamon",
          title: "Hamon sa Tugma",
          prompt: "Ipaliwanag ang tugma sa loob ng 30 segundo.",
          questionType: "open_ended",
          points: 1,
          timeLimit: 30,
          options: [],
          answer: "Pagkakapareho ng tunog sa dulo ng taludtod.",
          terms: [["tugma"], ["tunog"], ["taludtod"]],
          explanation: "Ang tugma ay pagkakapareho ng dulong tunog."
        }
      ],
      questions: []
    },
    "timed-quiz": {
      id: "timed-quiz",
      title: "Pagsusulit na May Palugit",
      badge: "Pagsusulit",
      cardCount: 2,
      cards: [],
      questions: []
    }
  };

  const defaultCatalogByTopic = {
    elements: {
      topic: { code: "elements", title: "Mga Elemento ng Tula" },
      questions: [
        {
          code: "elem-challenge",
          id: "elem-challenge",
          title: "Hamon sa Tugma",
          prompt: "Ipaliwanag ang tugma sa loob ng 30 segundo.",
          cardCategory: "challenge",
          questionType: "open_ended",
          points: 1,
          timeLimit: 30
        },
        {
          code: "elem-mc-timed",
          id: "elem-mc-timed",
          title: "Tanong na May Oras",
          prompt: "Ilan ang pantig sa lalabindalawahin?",
          cardCategory: "question",
          questionType: "multiple_choice",
          points: 1,
          timeLimit: 20,
          dbChoices: [
            { key: "A", text: "12" },
            { key: "B", text: "14" }
          ],
          answerKey: "A"
        },
        {
          code: "elem-untimed",
          id: "elem-untimed",
          title: "Pahayag na Walang Oras",
          prompt: "Ano ang sukat?",
          cardCategory: "statement",
          questionType: "open_ended",
          points: 1,
          timeLimit: null
        }
      ]
    },
    "timed-quiz": {
      topic: { code: "timed-quiz", title: "Pagsusulit na May Palugit" },
      questions: [
        {
          code: "quiz-timed-1",
          id: "quiz-timed-1",
          prompt: "Tukuyin ang elemento ng tula na may 30s timer.",
          cardCategory: null,
          questionType: "identification",
          points: 2,
          timeLimitSeconds: 30,
          expectedAnswer: "Sukat"
        },
        {
          code: "quiz-untimed-2",
          id: "quiz-untimed-2",
          prompt: "Tukuyin ang elemento ng tula na walang timer.",
          cardCategory: null,
          questionType: "identification",
          points: 1,
          timeLimitSeconds: null,
          expectedAnswer: "Tugma"
        }
      ]
    }
  };

  const gameApi = {
    enabled: true,
    hasSessionToken: () => Boolean(guestToken),
    hasAccessToken: () => Boolean(guestToken),
    setGuestToken: (tok) => { guestToken = tok || null; },
    getGuestToken: () => guestToken,
    clearGuestToken: () => { guestToken = null; },
    listQuestions: async (topicCode) => defaultCatalogByTopic[topicCode] || { topic: { code: topicCode }, questions: [] },
    createSession: async (topicCode, mode, studentName) => {
      guestToken = "guest-tok-official-1";
      return { id: "sess-official-1", sessionToken: guestToken, topicCode, mode, studentName };
    },
    startQuestionTimer: async (sessionId, questionCode, round = "main") => {
      const entry = { sessionId, questionCode, round };
      timerStartCalls.push(entry);
      callSequence.push(`timer:${round}:${questionCode}`);
      return { sessionId, questionCode, round, startedAt: new Date().toISOString(), timeLimitSeconds: 30 };
    },
    submitAnswer: async (sessionId, questionCode, response, round = "main", options = {}) => {
      const entry = { sessionId, questionCode, response, round, options };
      submitAnswerCalls.push(entry);
      callSequence.push(`answer:${round}:${questionCode}`);
      return {
        isCorrect: !options.isTimeout,
        pointsAwarded: options.isTimeout ? 0 : 1,
        maxPoints: 1,
        evaluationMethod: options.isTimeout ? "timeout" : "deterministic_rubric"
      };
    },
    ...customApiOverrides
  };

  const sandbox = {
    console,
    Promise,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Math,
    Date,
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: (fn) => ({ fn }),
    clearInterval: () => {},
    PANITIKARD_CARD_TYPES,
    PANITIKARD_DECKS,
    PANITIKARD_ANSWER_EVALUATOR: {
      quizRubrics: {},
      evaluateWrittenAnswer: () => ({ isCorrect: true, matchedGroups: 1, requiredGroups: 1, method: "local_rubric" })
    },
    PANITIKARD_API_CLIENT: {
      evaluateWrittenAnswer: async (opts) => {
        evaluateCalls.push(opts);
        callSequence.push(`eval:main:${opts.questionCode}`);
        return {
          success: true,
          available: true,
          isCorrect: true,
          pointsEarned: opts.cardData?.points || 1,
          maxPoints: opts.cardData?.points || 1,
          feedback: "Tama!",
          evaluationMethod: "deterministic_rubric",
          criteriaEvaluation: []
        };
      }
    },
    appState: {
      studentName: "Ralph Reniel Reyes",
      activeDeckId: "elements",
      activeCardTypeIndex: 0,
      highestUnlockedIndex: 0,
      lastPlayedMode: "deck",
      answers: {},
      incorrectQuestions: [],
      reverseRoundCompleted: false,
      isEvaluatingAnswer: false,
      remoteSessionId: null,
      remoteSessionGeneration: 0,
      remoteSessionPromise: null,
      remoteWriteQueue: Promise.resolve(),
      startedRemoteTimers: {},
      challengeTimerId: null,
      challengeSecondsRemaining: 30
    },
    quizState: {
      activeQuizId: "timed-quiz",
      questions: [],
      currentIndex: 0,
      currentScore: 0,
      maxScore: 3,
      userAnswers: {},
      selectedOption: null,
      isSubmitted: false
    },
    reverseState: {
      selectedQuestions: [],
      maxAttempts: 3,
      attemptsRemaining: 3,
      currentIndex: 0,
      pointsEarned: 0,
      answers: {},
      selectedOption: null,
      isSubmitted: false,
      timerId: null,
      secondsRemaining: 0
    },
    interactiveCard,
    reverseCard,
    frontTimerBadge,
    timerSeconds,
    reverseTimerBadge,
    reverseTimerSeconds,
    reverseHeaderTimerBadge,
    reverseHeaderTimerSeconds,
    reverseSubmitWrap,
    reverseAlertBox,
    reverseAlertText,
    reverseFeedbackBox,
    reverseFeedbackHeader,
    reverseFeedbackIcon,
    reverseFeedbackStatus,
    reverseFeedbackPoints,
    reverseFeedbackMessage,
    reverseFeedbackStudentAnswer,
    reverseFeedbackAnswer,
    reverseFeedbackExplanation,
    reverseFeedbackTerms,
    reverseFeedbackTermsText,
    reverseNextBtnText,
    reverseCardBackBrandContent,
    reverseAttemptText,
    reverseAttemptDots,
    reverseScoreText,
    reverseCardNum,
    reverseCardCategoryBadge,
    reverseCardTitle,
    reverseCardPrompt,
    reverseCardOptions,
    btnReverseSubmit,
    quizAlertBox,
    quizFeedbackBox,
    quizFeedbackHeader,
    quizFeedbackIcon,
    quizFeedbackStatus,
    quizFeedbackPoints,
    quizFeedbackCorrectAnswer,
    quizFeedbackExplanation,
    quizFeedbackKeywordsWrap,
    quizFeedbackKeywords,
    quizNextBtnText,
    quizSubmitWrapper,
    btnQuizSubmit,
    quizQuestionCounter,
    quizProgressBarFill,
    quizDifficultyBadge,
    quizCategoryBadge,
    quizTypeBadge,
    quizQuestionText,
    quizCurrentScore,
    quizInputContainer,
    studentNameInput: { value: "Ralph Reniel Reyes" },
    deckStudentName: { textContent: "Ralph Reniel Reyes" },
    escapeHtml: (s) => String(s || ""),
    setActiveCardFace: () => {},
    updateFlipControlsState: () => {},
    updateReverseAttemptUI: () => {},
    finishReverseRound: () => {},
    checkQuizAnswer: () => true,
    unlockNextIndex: () => {},
    renderCardByTypeIndex: (idx) => {
      const deck = PANITIKARD_DECKS[sandbox.appState.activeDeckId];
      const card = deck?.cards?.[idx];
      if (!card) return;
      sandbox.stopChallengeTimer();
      sandbox.appState.activeCardTypeIndex = idx;
      const isSub = Boolean(sandbox.appState.answers[card.id]);
      interactiveCard.classList.toggle("is-flipped", true);
      interactiveCard.dataset.flipped = "true";
      if (card.timeLimit && !isSub) {
        // Pre-populates challengeSecondsRemaining on render (exact behavior of main.js line 1243)
        sandbox.appState.challengeSecondsRemaining = card.timeLimit;
        timerSeconds.textContent = String(card.timeLimit);
      }
    },
    window: {
      PANITIKARD_GAME_API: gameApi
    },
    document: {
      getElementById: (id) => {
        if (id === "btn-submit-open") return submitOpenBtn;
        if (id === "open-answer-input") return openTextarea;
        if (id === "open-error-container") return openErrorBox;
        if (id === "reverse-text-answer") return reverseTextInput;
        if (id === "quiz-text-answer") return quizTextInput;
        return null;
      },
      querySelector: (sel) => {
        if (sel === ".open-card-form") {
          return {
            querySelector: () => null,
            insertBefore: () => {},
            appendChild: () => {}
          };
        }
        return null;
      },
      createElement: () => ({
        className: "",
        style: {},
        innerHTML: "",
        dataset: {},
        classList: createMockElement().classList,
        addEventListener: () => {},
        appendChild: () => {},
        querySelector: () => ({ addEventListener: () => {}, focus: () => {} }),
        querySelectorAll: () => []
      })
    }
  };

  vm.createContext(sandbox);
  vm.runInContext(
    `${catalogMapSrc}\n${remoteSessionSrc}\n${submitAnswersSrc}\n${challengeTimerSrc}\n${quizSrc}\n${reverseTimerSrc}`,
    sandbox
  );

  return {
    sandbox,
    timerStartCalls,
    submitAnswerCalls,
    evaluateCalls,
    callSequence,
    openErrorBox,
    reverseAlertBox,
    reverseAlertText,
    quizAlertBox,
    quizAlertText
  };
}

test("Regression 1, 2 & 3 (Main Deck Timer): pre-populated challengeSecondsRemaining starts official remote timer on first flip and deduplicates repeated flips", async () => {
  const h = createOfficialTimerTestHarness();
  const { sandbox } = h;

  sandbox.beginRemoteGameSession("elements", "deck");
  await sandbox.appState.remoteSessionPromise;

  // Render card 2 (elem-challenge, timeLimit: 30) -> pre-populates challengeSecondsRemaining = 30 while on green back
  sandbox.renderCardByTypeIndex(2);
  assert.equal(sandbox.appState.challengeSecondsRemaining, 30);
  assert.equal(sandbox.interactiveCard.classList.contains("is-flipped"), true);
  assert.equal(h.timerStartCalls.length, 0, "Timer must not start while card is still face-down");

  // First flip to front -> must start official remote timer even though challengeSecondsRemaining was already 30
  sandbox.toggleCardFlip();
  assert.equal(sandbox.interactiveCard.classList.contains("is-flipped"), false);
  await sandbox.appState.remoteWriteQueue;

  assert.equal(h.timerStartCalls.length, 1, "First flip must start official remote timer");
  assert.deepEqual(h.timerStartCalls[0], {
    sessionId: "sess-official-1",
    questionCode: "elem-challenge",
    round: "main"
  });

  // Flip back to green back (pauses local countdown) and flip to front again multiple times
  sandbox.toggleCardFlip(); // back
  sandbox.toggleCardFlip(); // front
  sandbox.toggleCardFlip(); // back
  sandbox.toggleCardFlip(); // front
  await sandbox.appState.remoteWriteQueue;

  assert.equal(h.timerStartCalls.length, 1, "Repeated flips must not send duplicate timer-start requests for the same question and round");
});

test("Regression 4 (Remote Request Synchronization): answer submission waits for pending official timer-start request to finish before submitting answer", async () => {
  let resolveTimerStart;
  const h = createOfficialTimerTestHarness({
    startQuestionTimer: (sessionId, questionCode, round = "main") =>
      new Promise((resolve) => {
        resolveTimerStart = () => {
          h.timerStartCalls.push({ sessionId, questionCode, round });
          h.callSequence.push(`timer:${round}:${questionCode}`);
          resolve({ sessionId, questionCode, round, startedAt: new Date().toISOString(), timeLimitSeconds: 30 });
        };
      })
  });
  const { sandbox } = h;

  sandbox.beginRemoteGameSession("elements", "deck");
  await sandbox.appState.remoteSessionPromise;

  sandbox.renderCardByTypeIndex(2);
  sandbox.toggleCardFlip(); // Triggers startRemoteTimer("elem-challenge", "main") which remains pending

  const cardData = sandbox.PANITIKARD_DECKS.elements.cards[2];
  const submitPromise = sandbox.submitOpenEndedAnswer("Ang tugma ay pagkakapareho ng dulong tunog.", cardData, false);

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.submitAnswerCalls.length, 0, "submitAnswer must NOT be called before startQuestionTimer finishes");

  // Now resolve the timer start request
  resolveTimerStart();
  await submitPromise;

  assert.equal(h.timerStartCalls.length, 1);
  assert.equal(h.submitAnswerCalls.length, 1);
  assert.deepEqual(
    h.callSequence,
    ["timer:main:elem-challenge", "eval:main:elem-challenge", "answer:main:elem-challenge"],
    "Timer initialization must complete strictly before evaluation and official answer submission"
  );
  assert.ok(sandbox.appState.answers["elem-challenge"], "Official answer must be recorded after timer and submission succeed");
});

test("Regression 5 (Safe Failure Handling): timer initialization failure blocks official scoring and never calls submitAnswer", async () => {
  const h = createOfficialTimerTestHarness({
    startQuestionTimer: async () => {
      throw new Error("Server timer RPC unavailable");
    }
  });
  const { sandbox } = h;

  sandbox.beginRemoteGameSession("elements", "deck");
  await sandbox.appState.remoteSessionPromise;

  // 1. Open-ended timed card (index 2: elem-challenge)
  sandbox.renderCardByTypeIndex(2);
  sandbox.toggleCardFlip();
  await sandbox.appState.remoteWriteQueue;

  assert.equal(sandbox.appState.startedRemoteTimers["main:elem-challenge"].status, "failed");

  const cardData = sandbox.PANITIKARD_DECKS.elements.cards[2];
  await sandbox.submitOpenEndedAnswer("Ang tugma ay pagkakapareho ng dulong tunog.", cardData, false);

  assert.equal(h.submitAnswerCalls.length, 0, "submitAnswer must NEVER be called when timer initialization failed");
  assert.equal(sandbox.appState.answers["elem-challenge"], undefined, "Card must not be officially scored when timer initialization failed");
  assert.match(h.openErrorBox.innerHTML, /Hindi nasimulan ang opisyal na timer/i);

  // 2. Timed Multiple-Choice card (index 0: elem-mc-timed) when timer initialization fails
  sandbox.renderCardByTypeIndex(0);
  sandbox.toggleCardFlip();
  await sandbox.appState.remoteWriteQueue;

  const mcCard = sandbox.PANITIKARD_DECKS.elements.cards[0];
  sandbox.submitMultipleChoiceAnswer("A", mcCard);
  assert.equal(h.submitAnswerCalls.length, 0, "Timed multiple-choice must not call submitAnswer when timer failed");
  assert.equal(sandbox.appState.answers["elem-mc-timed"], undefined, "Timed multiple-choice must not record score when timer failed");
});

test("Regression 4b (Session Initialization Race): beginRemoteGameSession preserves front flip state and initializes timer if student flipped card before session resolved", async () => {
  let resolveSessionInit;
  const h = createOfficialTimerTestHarness({
    createSession: () =>
      new Promise((resolve) => {
        resolveSessionInit = () => {
          h.sandbox.window.PANITIKARD_GAME_API.setGuestToken("guest-tok-race");
          resolve({ id: "sess-race-1", sessionToken: "guest-tok-race" });
        };
      })
  });
  const { sandbox } = h;

  // Start session (in flight) and render card 0 (elem-mc-timed, timeLimit: 20) on green back
  sandbox.beginRemoteGameSession("elements", "deck");
  sandbox.renderCardByTypeIndex(0);
  assert.equal(sandbox.interactiveCard.classList.contains("is-flipped"), true);

  // Student flips card to front BEFORE createSession resolves
  sandbox.toggleCardFlip();
  assert.equal(sandbox.interactiveCard.classList.contains("is-flipped"), false);
  sandbox.appState.challengeSecondsRemaining = 14; // 6 seconds elapsed locally

  // Now resolve session creation & catalog hydration
  resolveSessionInit();
  await sandbox.appState.remoteSessionPromise;
  await sandbox.appState.remoteWriteQueue;

  assert.equal(
    sandbox.interactiveCard.classList.contains("is-flipped"),
    false,
    "beginRemoteGameSession must preserve the student's front flip state and not flip card back"
  );
  assert.equal(
    sandbox.appState.challengeSecondsRemaining,
    14,
    "beginRemoteGameSession must preserve remaining countdown instead of resetting to 20"
  );
  assert.equal(h.timerStartCalls.length, 1, "Official remote timer must be started once session resolves");
  assert.equal(h.timerStartCalls[0].sessionId, "sess-race-1");
});

test("Regression 6 (Reverse Round Timer): first flip in Reverse Round starts official reverse timer and deduplicates repeated flips", async () => {
  const h = createOfficialTimerTestHarness();
  const { sandbox } = h;

  sandbox.beginRemoteGameSession("elements", "deck");
  await sandbox.appState.remoteSessionPromise;

  const revQ = {
    id: "elem-challenge",
    title: "Hamon sa Tugma",
    question: "Ipaliwanag ang tugma.",
    questionType: "open_ended",
    points: 1,
    timeLimit: 30,
    answer: "Pagkakapareho ng dulong tunog.",
    terms: [["tugma"]]
  };
  sandbox.reverseState.selectedQuestions = [revQ];
  sandbox.reverseState.currentIndex = 0;

  // Render reverse card -> pre-populates reverseState.secondsRemaining = 30 on green back
  sandbox.renderReverseCard();
  assert.equal(sandbox.reverseState.secondsRemaining, 30);
  assert.equal(sandbox.reverseCard.classList.contains("is-flipped"), true);
  assert.equal(h.timerStartCalls.length, 0);

  // Flip reverse card to front -> starts official reverse timer
  sandbox.toggleReverseCardFlip();
  assert.equal(sandbox.reverseCard.classList.contains("is-flipped"), false);
  await sandbox.appState.remoteWriteQueue;

  assert.equal(h.timerStartCalls.length, 1);
  assert.deepEqual(h.timerStartCalls[0], {
    sessionId: "sess-official-1",
    questionCode: "elem-challenge",
    round: "reverse"
  });

  // Flip back and forth -> no duplicate reverse timer calls
  sandbox.toggleReverseCardFlip(); // back
  sandbox.toggleReverseCardFlip(); // front
  await sandbox.appState.remoteWriteQueue;
  assert.equal(h.timerStartCalls.length, 1);

  // Submit reverse answer -> succeeds after reverse timer was started
  sandbox.handleReverseSubmit(false);
  await sandbox.appState.remoteWriteQueue;
  assert.equal(h.submitAnswerCalls.length, 1);
  assert.equal(h.submitAnswerCalls[0].round, "reverse");
  assert.equal(h.submitAnswerCalls[0].questionCode, "elem-challenge");
});

test("Regression 7, 8 & 9 (Timed Quiz, Timed Multiple Choice, and Untimed Questions):", async () => {
  const h = createOfficialTimerTestHarness();
  const { sandbox } = h;

  // 7. Timed Quiz question maps timeLimit and starts official timer when rendered
  const catalog = await sandbox.window.PANITIKARD_GAME_API.listQuestions("timed-quiz", "quiz");
  sandbox.hydrateDeckFromCatalog("timed-quiz", catalog);

  const hydratedQuizQuestions = sandbox.PANITIKARD_DECKS["timed-quiz"].questions;
  assert.equal(hydratedQuizQuestions.length, 2);
  assert.equal(hydratedQuizQuestions[0].timeLimit, 30, "mapCatalogQuestionToQuiz must preserve timeLimit");
  assert.equal(hydratedQuizQuestions[1].timeLimit, null, "Untimed quiz question must keep timeLimit: null");

  sandbox.quizState.activeQuizId = "timed-quiz";
  sandbox.quizState.questions = hydratedQuizQuestions;
  sandbox.quizState.currentIndex = 0;

  sandbox.beginRemoteGameSession("timed-quiz", "quiz");
  await sandbox.appState.remoteSessionPromise;

  sandbox.renderQuizQuestion();
  await sandbox.appState.remoteWriteQueue;

  assert.equal(h.timerStartCalls.length, 1, "Rendering timed quiz question must start official remote timer");
  assert.deepEqual(h.timerStartCalls[0], {
    sessionId: "sess-official-1",
    questionCode: "quiz-timed-1",
    round: "main"
  });

  sandbox.handleQuizSubmission();
  await sandbox.appState.remoteWriteQueue;
  assert.equal(h.submitAnswerCalls.length, 1);
  assert.equal(h.submitAnswerCalls[0].questionCode, "quiz-timed-1");

  // 9a. Untimed Quiz question (index 1) does NOT start a remote timer and submits cleanly
  sandbox.quizState.currentIndex = 1;
  sandbox.renderQuizQuestion();
  await sandbox.appState.remoteWriteQueue;
  assert.equal(h.timerStartCalls.length, 1, "Untimed quiz question must not start a remote timer");

  sandbox.handleQuizSubmission();
  await sandbox.appState.remoteWriteQueue;
  assert.equal(h.submitAnswerCalls.length, 2);
  assert.equal(h.submitAnswerCalls[1].questionCode, "quiz-untimed-2");

  // 8. Timed Multiple Choice card in Deck mode (index 0: elem-mc-timed, timeLimit: 20) starts timer on flip and stops local timer on submission
  sandbox.appState.activeDeckId = "elements";
  sandbox.beginRemoteGameSession("elements", "deck");
  await sandbox.appState.remoteSessionPromise;

  sandbox.renderCardByTypeIndex(0); // elem-mc-timed (timeLimit: 20)
  sandbox.toggleCardFlip();
  assert.ok(sandbox.appState.challengeTimerId !== null, "Local countdown timer must be active after flipping timed MC card");
  await sandbox.appState.remoteWriteQueue;

  assert.equal(h.timerStartCalls.length, 2);
  assert.equal(h.timerStartCalls[1].questionCode, "elem-mc-timed");

  sandbox.submitMultipleChoiceAnswer("A", sandbox.PANITIKARD_DECKS.elements.cards[0]);
  assert.equal(sandbox.appState.challengeTimerId, null, "submitMultipleChoiceAnswer must stop active challenge timer immediately");
  await sandbox.appState.remoteWriteQueue;
  assert.equal(h.submitAnswerCalls.length, 3);
  assert.equal(h.submitAnswerCalls[2].questionCode, "elem-mc-timed");

  // 9b. Untimed Deck card (index 1: elem-untimed) does not start timer and submits cleanly
  sandbox.renderCardByTypeIndex(1);
  sandbox.toggleCardFlip();
  assert.equal(sandbox.appState.challengeTimerId, null);
  assert.equal(h.timerStartCalls.length, 2, "Untimed deck card must not call startQuestionTimer");

  await sandbox.submitOpenEndedAnswer("Bilang ng pantig sa taludtod.", sandbox.PANITIKARD_DECKS.elements.cards[1], false);
  assert.equal(h.submitAnswerCalls.length, 4);
  assert.equal(h.submitAnswerCalls[3].questionCode, "elem-untimed");
});

test("Regression 10 (Timeout & Duplicate-Answer Protections): timeout waits for started timer and duplicate submissions are blocked", async () => {
  const h = createOfficialTimerTestHarness();
  const { sandbox } = h;

  sandbox.beginRemoteGameSession("elements", "deck");
  await sandbox.appState.remoteSessionPromise;

  sandbox.renderCardByTypeIndex(2);
  sandbox.toggleCardFlip(); // Starts official timer for elem-challenge
  await sandbox.appState.remoteWriteQueue;

  const cardData = sandbox.PANITIKARD_DECKS.elements.cards[2];

  // Trigger timeout submission
  await sandbox.submitOpenEndedAnswer("(Naubos ang 30 segundo / Walang naisulat)", cardData, true);
  assert.equal(h.submitAnswerCalls.length, 1);
  assert.equal(h.submitAnswerCalls[0].options.isTimeout, true);
  assert.equal(sandbox.appState.answers["elem-challenge"].isTimeout, true);
  assert.equal(sandbox.appState.answers["elem-challenge"].pointsEarned, 0);

  // Attempt duplicate submission on already-answered card -> blocked
  await sandbox.submitOpenEndedAnswer("Pangalawang sagot", cardData, false);
  assert.equal(h.submitAnswerCalls.length, 1, "Duplicate answer submission on already-answered card must be blocked");
});

test("Reverse timer DOM: upper timer exists and duplicate middle timer is removed from index.html", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.match(html, /id="reverse-header-timer-badge"/, "Upper reverse header timer must exist in index.html");
  assert.match(html, /id="reverse-header-timer-seconds"/, "Upper reverse header timer seconds span must exist in index.html");
  assert.doesNotMatch(html, /id="reverse-timer-badge"/, "Duplicate middle reverse timer badge must be removed from index.html");
  assert.doesNotMatch(html, /id="reverse-timer-seconds"/, "Duplicate middle reverse timer seconds span must be removed from index.html");
});
