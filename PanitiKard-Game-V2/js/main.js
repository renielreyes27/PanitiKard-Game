/**
 * ==========================================================================
 * PanitiKard V2 - Main JavaScript (Core Gameplay Controller)
 * ==========================================================================
 * 
 * Features:
 * 1. Multi-Screen Flow:
 *    Welcome -> Student Setup -> Topic Deck Selection -> Card Arena / Quiz ->
 *    Reverse Round (Second Chance Phase) -> Final Results.
 * 2. Active Student Identity handling with session state.
 * 3. UNO-Inspired Card Design with 4 Category Colors:
 *    - RED: Challenge Cards
 *    - YELLOW: Bonus Cards
 *    - BLUE: Analysis Cards (Statement & Correction)
 *    - GREEN: Knowledge & Definition Cards (Question, Help, Reverse Review)
 * 4. Exactly ONE Shared Uniform Card-Back Design across all cards:
 *    Dark-green background, gold decorative border, PanitiKard script,
 *    and open-book literary emblem. Zero leaked front information.
 * 5. Realistic 3D Card-Flip Animation:
 *    Smooth 180° Y-axis rotation (450ms, cubic-bezier(0.4, 0, 0.2, 1)).
 * 6. Reverse Round Mechanic:
 *    - Automatically tracks incorrectly answered questions from the main round.
 *    - Skips automatically if 0 incorrect answers.
 *    - Up to three (3) second-chance attempts using Special Red Reverse Card.
 *    - Evaluates answers using existing checking logic; awards second-chance points.
 *    - Preserves original main-round answers and records without overwriting.
 * 7. System & Score Integration:
 *    Main Round Score + Reverse Round Points = Updated Final Total Score.
 * 8. Comprehensive Final Results Screen with score breakdown and card review.
 * 
 * Pure vanilla JavaScript with zero external libraries.
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("PanitiKard V2: Core Gameplay Controller initialized.");

  // ------------------------------------------------------------------------
  // 1. Application & Gameplay State
  // ------------------------------------------------------------------------
  const appState = {
    studentName: "",
    activeDeckId: "elements", // Default to 'elements'
    activeCardTypeIndex: 0,   // Index 0-6 (7 card types)
    highestUnlockedIndex: 0,  // Sequential card progression lock
    lastPlayedMode: "deck",   // 'deck' or 'quiz'
    
    // Keyed by cardData.id:
    // { cardId, type, number, tag, prompt, userAnswer, correctAnswer, isCorrect, pointsEarned, maxPoints, explanation, terms, submittedAt }
    answers: {},

    // Tracking incorrectly answered questions for Reverse Round
    incorrectQuestions: [],
    reverseRoundCompleted: false,
    isEvaluatingAnswer: false,
    remoteSessionId: null,
    remoteSessionGeneration: 0,
    remoteSessionPromise: null,
    remoteWriteQueue: Promise.resolve(),
    startedRemoteTimers: {},

    // 30-Second Challenge Timer State
    challengeTimerId: null,
    challengeSecondsRemaining: 30
  };

  // State for 15-Question Interactive Quizzes (Alamat & Maikling Kuwento)
  const quizState = {
    activeQuizId: "alamat",
    questions: [],
    currentIndex: 0,
    currentScore: 0,
    maxScore: 28,
    userAnswers: {},
    selectedOption: null,
    isSubmitted: false
  };

  // State for Reverse Round (Second Chance Phase)
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

  // ------------------------------------------------------------------------
  // 2. Element References
  // ------------------------------------------------------------------------
  // Screens (8 Total: Welcome, Setup, Deck, Card Arena, Quiz, Reverse Intro, Reverse Arena, Results)
  const screens = {
    welcome: document.getElementById("welcome-screen"),
    setup: document.getElementById("setup-screen"),
    deck: document.getElementById("deck-screen"),
    card: document.getElementById("card-screen"),
    quiz: document.getElementById("quiz-screen"),
    reverseIntro: document.getElementById("reverse-intro-screen"),
    reverse: document.getElementById("reverse-screen"),
    result: document.getElementById("result-screen")
  };

  // Header & Drawer Elements
  const headerMenuBtn = document.getElementById("header-menu-btn");
  const headerBackBtn = document.getElementById("header-back-btn");
  const sideDrawer = document.getElementById("side-drawer");
  const drawerCloseBtn = document.getElementById("drawer-close-btn");
  const drawerOverlay = document.getElementById("drawer-overlay");
  const navLinkWelcome = document.getElementById("nav-link-welcome");
  const navLinkSetup = document.getElementById("nav-link-setup");
  const navLinkDecks = document.getElementById("nav-link-decks");

  // Screen 1: Welcome Elements
  const btnWelcomeStudent = document.getElementById("btn-welcome-student");
  const btnWelcomeTeacher = document.getElementById("btn-welcome-teacher");
  const teacherModal = document.getElementById("teacher-modal");
  const btnCloseTeacherModal = document.getElementById("btn-close-teacher-modal");
  const btnTeacherModalCancel = document.getElementById("btn-teacher-modal-cancel");
  const teacherLoginForm = document.getElementById("teacher-login-form");
  const teacherEmailInput = document.getElementById("teacher-login-email");
  const teacherPasswordInput = document.getElementById("teacher-login-password");
  const btnTeacherLoginSubmit = document.getElementById("btn-teacher-login-submit");
  const teacherModalAlert = document.getElementById("teacher-modal-alert");

  // Screen 2: Student Setup Elements
  const setupForm = document.getElementById("setup-form");
  const studentNameInput = document.getElementById("student-name");
  const validationBanner = document.getElementById("validation-banner");
  const validationText = document.getElementById("validation-text");

  // Screen 3: Deck Elements
  const deckStudentName = document.getElementById("deck-student-name");
  const deckBoxes = document.querySelectorAll(".deck-box, .topic-card");
  const btnBackToSetup = document.getElementById("btn-back-to-setup");
  const btnEditStudentName = document.getElementById("btn-edit-student-name");
  const btnEnterDeck = document.getElementById("btn-enter-deck");

  // Screen 3.5: Quiz Screen Elements
  const btnQuizBackDecks = document.getElementById("btn-quiz-back-decks");
  const quizStudentName = document.getElementById("quiz-student-name");
  const quizCurrentScore = document.getElementById("quiz-current-score");
  const quizMaxScore = document.getElementById("quiz-max-score");
  const quizLessonBadge = document.getElementById("quiz-lesson-badge");
  const quizQuestionCounter = document.getElementById("quiz-question-counter");
  const quizDifficultyBadge = document.getElementById("quiz-difficulty-badge");
  const quizProgressBarFill = document.getElementById("quiz-progress-bar-fill");
  const quizCategoryBadge = document.getElementById("quiz-category-badge");
  const quizTypeBadge = document.getElementById("quiz-type-badge");
  const quizQuestionText = document.getElementById("quiz-question-text");
  const quizInputContainer = document.getElementById("quiz-input-container");
  const quizAlertBox = document.getElementById("quiz-alert-box");
  const quizAlertText = document.getElementById("quiz-alert-text");
  const quizSubmitWrapper = document.getElementById("quiz-submit-wrapper");
  const btnQuizSubmit = document.getElementById("btn-quiz-submit");
  const quizFeedbackBox = document.getElementById("quiz-feedback-box");
  const quizFeedbackHeader = document.getElementById("quiz-feedback-header");
  const quizFeedbackIcon = document.getElementById("quiz-feedback-icon");
  const quizFeedbackStatus = document.getElementById("quiz-feedback-status");
  const quizFeedbackPoints = document.getElementById("quiz-feedback-points");
  const quizFeedbackCorrectAnswer = document.getElementById("quiz-feedback-correct-answer");
  const quizFeedbackExplanation = document.getElementById("quiz-feedback-explanation");
  const quizFeedbackKeywordsWrap = document.getElementById("quiz-feedback-keywords-wrap");
  const quizFeedbackKeywords = document.getElementById("quiz-feedback-keywords");
  const btnQuizNext = document.getElementById("btn-quiz-next");
  const quizNextBtnText = document.getElementById("quiz-next-btn-text");

  // Screen 4: Card Arena Elements
  const btnCrumbDeck = document.getElementById("btn-crumb-deck");
  const btnBackToDeck = document.getElementById("btn-back-to-deck");
  const cardDeckIndicator = document.getElementById("card-deck-indicator");
  const cardStudentIndicator = document.getElementById("card-student-indicator");
  const cardTypeTabs = document.querySelectorAll(".type-tab");
  const interactiveCard = document.getElementById("interactive-card");
  const cardBackBrandContent = document.getElementById("card-back-brand-content");
  const cardBackFlipPill = document.getElementById("card-back-flip-pill");
  const btnFlipCard = document.getElementById("btn-flip-card");
  const btnPrevCard = document.getElementById("btn-prev-card");
  const btnNextCard = document.getElementById("btn-next-card");

  // Front Face Elements (UNO Style)
  const frontCardNum = document.getElementById("front-card-num");
  const frontCardNumBottom = document.getElementById("front-card-num-bottom");
  const frontPipIcon = document.getElementById("front-card-pip-icon");
  const frontPipIconBottom = document.getElementById("front-card-pip-icon-bottom");
  const frontCardTypeBadge = document.getElementById("front-card-type-badge");
  const frontDeckBadge = document.getElementById("front-deck-badge");
  const frontCardIcon = document.getElementById("front-card-icon");
  const frontCardTitle = document.getElementById("front-card-title");
  const frontCardPrompt = document.getElementById("front-card-prompt");
  const frontCardOptions = document.getElementById("front-card-options");
  const frontTimerBadge = document.getElementById("front-timer-badge");
  const timerSeconds = document.getElementById("timer-seconds");
  const frontFlipPill = document.getElementById("front-flip-pill");
  const frontFlipIcon = document.getElementById("front-flip-icon");
  const frontFlipPillText = document.getElementById("front-flip-pill-text");

  // Formative Feedback Panel for Cards (keeps uniform card back uncompromised)
  const cardFeedbackBox = document.getElementById("card-feedback-box");
  const cardFeedbackHeader = document.getElementById("card-feedback-header");
  const cardFeedbackIcon = document.getElementById("card-feedback-icon");
  const cardFeedbackStatus = document.getElementById("card-feedback-status");
  const cardFeedbackPoints = document.getElementById("card-feedback-points");
  const cardFeedbackMessage = document.getElementById("card-feedback-message");
  const backStudentAnswer = document.getElementById("back-student-answer");
  const backAnswerHighlight = document.getElementById("back-answer-highlight");
  const backExplanationText = document.getElementById("back-explanation-text");
  const backTriviaWrap = document.getElementById("back-trivia-wrap");
  const backTriviaText = document.getElementById("back-trivia-text");
  const backTermsBox = document.getElementById("back-terms-box");
  const backTermsText = document.getElementById("back-terms-text");

  // Screen 3.7: Reverse Round Intro Elements
  const btnStartReverseRound = document.getElementById("btn-start-reverse-round");
  const btnSkipReverseRound = document.getElementById("btn-skip-reverse-round");
  const reverseEligibleCount = document.getElementById("reverse-eligible-count");
  const reverseAttemptLimitLabel = document.getElementById("reverse-attempt-limit-label");

  // Screen 3.8: Reverse Round Arena Elements (Special Red Reverse Card)
  const btnReverseBackDecks = document.getElementById("btn-reverse-back-decks");
  const reverseAttemptText = document.getElementById("reverse-attempt-text");
  const reverseAttemptDots = document.getElementById("reverse-attempt-dots");
  const reverseScoreText = document.getElementById("reverse-score-text");
  const reverseCard = document.getElementById("reverse-card");
  const reverseCardBackBrandContent = document.getElementById("reverse-card-back-brand-content");
  const reverseCardNum = document.getElementById("reverse-card-num");
  const reverseCardCategoryBadge = document.getElementById("reverse-card-category-badge");
  const reverseCardTitle = document.getElementById("reverse-card-title");
  const reverseCardPrompt = document.getElementById("reverse-card-prompt");
  const reverseCardOptions = document.getElementById("reverse-card-options");
  const reverseFlipPill = document.getElementById("reverse-flip-pill");
  const btnReverseFlipCard = document.getElementById("btn-reverse-flip-card");
  const btnReverseSubmit = document.getElementById("btn-reverse-submit");
  const reverseSubmitWrap = document.getElementById("reverse-submit-wrap");
  const reverseAlertBox = document.getElementById("reverse-alert-box");
  const reverseAlertText = document.getElementById("reverse-alert-text");
  const reverseFeedbackBox = document.getElementById("reverse-feedback-box");
  const reverseFeedbackHeader = document.getElementById("reverse-feedback-header");
  const reverseFeedbackIcon = document.getElementById("reverse-feedback-icon");
  const reverseFeedbackStatus = document.getElementById("reverse-feedback-status");
  const reverseFeedbackPoints = document.getElementById("reverse-feedback-points");
  const reverseFeedbackMessage = document.getElementById("reverse-feedback-message");
  const reverseFeedbackStudentAnswer = document.getElementById("reverse-feedback-student-answer");
  const reverseFeedbackAnswer = document.getElementById("reverse-feedback-answer");
  const reverseFeedbackExplanation = document.getElementById("reverse-feedback-explanation");
  const reverseFeedbackTerms = document.getElementById("reverse-feedback-terms");
  const reverseFeedbackTermsText = document.getElementById("reverse-feedback-terms-text");
  const btnReverseNext = document.getElementById("btn-reverse-next");
  const reverseNextBtnText = document.getElementById("reverse-next-btn-text");
  const reverseTimerBadge = document.getElementById("reverse-timer-badge");
  const reverseTimerSeconds = document.getElementById("reverse-timer-seconds");
  const reverseHeaderTimerBadge = document.getElementById("reverse-header-timer-badge");
  const reverseHeaderTimerSeconds = document.getElementById("reverse-header-timer-seconds");

  // Screen 4: Results Elements
  const resultStudentGreeting = document.getElementById("result-student-greeting");
  const resultScoreNum = document.getElementById("result-score-num");
  const resultScoreMax = document.getElementById("result-score-max");
  const resultPercentageBadge = document.getElementById("result-percentage-badge");
  const resultDeckBadge = document.getElementById("result-deck-badge");
  const resultCorrectCount = document.getElementById("result-correct-count");
  const resultIncorrectCount = document.getElementById("result-incorrect-count");
  const resultStatReversePill = document.getElementById("result-stat-reverse-pill");
  const resultReverseCount = document.getElementById("result-reverse-count");
  const resultMainRoundPts = document.getElementById("result-main-round-pts");
  const resultReversePts = document.getElementById("result-reverse-pts");
  const resultFinalTotalPts = document.getElementById("result-final-total-pts");
  const resultPerformanceTitle = document.getElementById("result-performance-title");
  const resultPerformanceMsg = document.getElementById("result-performance-msg");
  const resultReviewHeading = document.getElementById("result-review-heading");
  const resultReviewSub = document.getElementById("result-review-sub");
  const resultBreakdownList = document.getElementById("result-breakdown-list");
  const btnRetryDeck = document.getElementById("btn-retry-deck");
  const btnResultToDecks = document.getElementById("btn-result-to-decks");
  const btnResultToHome = document.getElementById("btn-result-to-home");

  // Active visible screen reference
  let currentScreen = screens.welcome;

  // ------------------------------------------------------------------------
  // Dynamic Catalog & Question Hydration (Teacher-to-Student Flow)
  // ------------------------------------------------------------------------
  function mapCatalogQuestionToCard(q, index) {
    const rawCategory = q.cardCategory || (q.questionType === "multiple_choice" ? "question" : "statement");
    const typeMeta = (typeof PANITIKARD_CARD_TYPES !== "undefined" && PANITIKARD_CARD_TYPES[rawCategory])
      ? PANITIKARD_CARD_TYPES[rawCategory]
      : {
          id: rawCategory,
          label: "Pagsusuri",
          subLabel: "Card",
          defaultPoints: 1
        };

    const rawChoices = (Array.isArray(q.dbChoices) && q.dbChoices.length > 0)
      ? q.dbChoices
      : ((Array.isArray(q.options) && q.options.length > 0)
        ? q.options
        : (Array.isArray(q.choices) ? q.choices : []));
    const options = rawChoices.map((c, i) => {
      if (typeof c === "string") {
        return { key: String.fromCharCode(65 + i), text: c };
      }
      const key = (c && c.key) || String.fromCharCode(65 + i);
      return { key, text: (c && (c.text || c.label)) || "" };
    });

    const isMultipleChoice = options.length > 0;
    const timeLimit = q.timeLimit || q.timeLimitSeconds || (rawCategory === "challenge" ? 30 : null);
    const points = typeof q.points === "number" ? q.points : (typeMeta.defaultPoints ?? 1);

    return {
      id: q.code || q.id,
      type: rawCategory,
      questionType: q.questionType || (isMultipleChoice ? "multiple_choice" : "open_ended"),
      v1Type: rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1),
      number: String(index + 1).padStart(2, "0"),
      tag: q.tag || q.categoryLabel || typeMeta.label || "Pagsusuri",
      title: q.title || `${typeMeta.label}: ${q.tag || "Pagsusuri"}`,
      prompt: q.prompt || "",
      choices: isMultipleChoice ? options.map(o => o.text) : null,
      options: options,
      answer: q.answerKey || q.expectedAnswer || "",
      terms: q.rubricGroups || null,
      hint: q.hint || null,
      timeLimit: timeLimit,
      points: points,
      explanation: q.explanation || "",
      didYouKnow: q.didYouKnow || null
    };
  }

  function mapCatalogQuestionToQuiz(q, index) {
    const rawChoices = (Array.isArray(q.dbChoices) && q.dbChoices.length > 0)
      ? q.dbChoices
      : ((Array.isArray(q.choices) && q.choices.length > 0)
        ? q.choices
        : (Array.isArray(q.options) ? q.options : []));
    const choices = rawChoices.map((c, i) => {
      if (typeof c === "string") {
        return { key: String.fromCharCode(65 + i), text: c };
      }
      const key = (c && c.key) || String.fromCharCode(65 + i);
      return { key, text: (c && (c.text || c.label)) || "" };
    });
    const rawTimeLimit = q.timeLimit ?? q.timeLimitSeconds ?? null;
    const timeLimit = typeof rawTimeLimit === "number" && rawTimeLimit > 0 ? rawTimeLimit : null;
    const explicitType = typeof q.questionType === "string" && q.questionType.trim()
      ? q.questionType.trim()
      : null;
    const questionType = explicitType || (choices.length ? "multiple_choice" : "identification");

    return {
      id: q.code || q.id,
      number: index + 1,
      category: q.categoryLabel || q.tag || "Pagsusuri",
      questionType: questionType,
      difficulty: q.difficulty || "average",
      points: typeof q.points === "number" ? q.points : 1,
      timeLimit: timeLimit,
      question: q.prompt || q.question || "",
      choices: questionType === "multiple_choice" ? choices : (choices.length ? choices : null),
      answer: q.answerKey || q.expectedAnswer || "",
      acceptedAnswers: q.acceptedAnswers || [],
      explanation: q.explanation || ""
    };
  }

  const BUNDLED_STATIC_TOPICS = new Set(["elements", "meaning", "alamat", "maikling-kwento"]);

  const CANONICAL_CARD_CATEGORY_ORDER = {
    question: 1,
    statement: 2,
    correction: 3,
    bonus: 4,
    reverse: 5,
    help: 6,
    challenge: 7
  };

  function compareNaturalCode(a, b) {
    const codeA = String(a?.code || a?.id || "");
    const codeB = String(b?.code || b?.id || "");
    return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: "base" });
  }

  function sortCatalogCardQuestions(questions) {
    return [...questions].sort((a, b) => {
      const catA = a?.cardCategory || a?.type || "";
      const catB = b?.cardCategory || b?.type || "";
      const orderA = CANONICAL_CARD_CATEGORY_ORDER[catA] ?? 99;
      const orderB = CANONICAL_CARD_CATEGORY_ORDER[catB] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return compareNaturalCode(a, b);
    });
  }

  function sortCatalogQuizQuestions(questions) {
    return [...questions].sort(compareNaturalCode);
  }

  function resolveCorrectAnswerDisplay(rawAnswer, options) {
    if (!rawAnswer || typeof rawAnswer !== "string") return "";
    const trimmed = rawAnswer.trim();
    if (!trimmed) return "";
    if (Array.isArray(options) && options.length > 0) {
      const rawKey = trimmed.includes(".") ? trimmed.split(".")[0].trim() : trimmed;
      const found = options.find(o => (o.key || "").toLowerCase() === rawKey.toLowerCase());
      if (found && found.text && !trimmed.toLowerCase().includes(found.text.toLowerCase())) {
        return `${found.key || rawKey}. ${found.text}`;
      }
    }
    return trimmed;
  }

  function hydrateDeckFromCatalog(topicCode, catalog) {
    if (!catalog || !Array.isArray(catalog.questions)) return;
    if (typeof PANITIKARD_DECKS === "undefined") return;

    const isBundledStatic = BUNDLED_STATIC_TOPICS.has(topicCode);
    if (catalog.questions.length === 0) {
      if (!isBundledStatic && PANITIKARD_DECKS[topicCode]) {
        PANITIKARD_DECKS[topicCode].cards = [];
        PANITIKARD_DECKS[topicCode].questions = [];
        PANITIKARD_DECKS[topicCode].cardCount = 0;
      }
      return;
    }

    if (!PANITIKARD_DECKS[topicCode]) {
      const topicTitle = catalog.topic?.title || topicCode;
      PANITIKARD_DECKS[topicCode] = {
        id: topicCode,
        title: topicTitle,
        badge: topicTitle.split(" ")[0] || "Paksa",
        themeClass: `deck-${topicCode}`,
        icon: "🎴",
        accentColor: "#185b55",
        cardCount: catalog.questions.length,
        competency: catalog.topic?.competency || "",
        description: catalog.topic?.description || "",
        subtopics: [],
        cards: [],
        questions: []
      };
    }

    const deck = PANITIKARD_DECKS[topicCode];
    const questions = catalog.questions;

    const cardQuestions = sortCatalogCardQuestions(questions.filter(q => Boolean(q.cardCategory)));
    const quizQuestions = sortCatalogQuizQuestions(questions.filter(q => !q.cardCategory));
    const isQuizTopic = topicCode === "alamat" || topicCode === "maikling-kwento" || (cardQuestions.length === 0 && quizQuestions.length > 0);

    if (isQuizTopic) {
      const targetQuizQuestions = quizQuestions.length > 0 ? quizQuestions : sortCatalogQuizQuestions(questions);
      deck.questions = targetQuizQuestions.map(mapCatalogQuestionToQuiz);
      if (!isBundledStatic && cardQuestions.length === 0) {
        deck.cards = [];
      }
      deck.cardCount = deck.questions.length;
    } else {
      deck.cards = cardQuestions.map(mapCatalogQuestionToCard);
      if (quizQuestions.length > 0) {
        deck.questions = quizQuestions.map(mapCatalogQuestionToQuiz);
      } else if (!isBundledStatic) {
        deck.questions = [];
      }
      deck.cardCount = deck.cards.length;
    }
  }

  function renderDynamicTopicCards(topicsList) {
    const container = document.querySelector(".topic-cards-container");
    if (!container || !Array.isArray(topicsList)) return;

    topicsList.forEach((topic) => {
      if (!topic || !topic.code) return;

      const isExplicitlyUnplayable =
        topic.playable === false ||
        (typeof topic.publishedQuestionCount === "number" && topic.publishedQuestionCount <= 0);

      if (isExplicitlyUnplayable) {
        if (!BUNDLED_STATIC_TOPICS.has(topic.code)) {
          const staleRow = container.querySelector(`[data-dynamic-topic="${topic.code}"]`);
          if (staleRow && typeof staleRow.remove === "function") {
            staleRow.remove();
          }
          if (typeof PANITIKARD_DECKS !== "undefined" && PANITIKARD_DECKS[topic.code]) {
            PANITIKARD_DECKS[topic.code].cards = [];
            PANITIKARD_DECKS[topic.code].questions = [];
            PANITIKARD_DECKS[topic.code].cardCount = 0;
          }
        }
        return;
      }

      const publishedCount =
        (typeof topic.deckQuestionCount === "number" && topic.deckQuestionCount > 0)
          ? topic.deckQuestionCount
          : ((typeof topic.quizQuestionCount === "number" && topic.quizQuestionCount > 0)
            ? topic.quizQuestionCount
            : (typeof topic.publishedQuestionCount === "number" && topic.publishedQuestionCount > 0 ? topic.publishedQuestionCount : 0));

      if (typeof PANITIKARD_DECKS !== "undefined" && !PANITIKARD_DECKS[topic.code]) {
        PANITIKARD_DECKS[topic.code] = {
          id: topic.code,
          title: topic.title || topic.code,
          badge: (topic.title || "Paksa").split(" ")[0],
          themeClass: `deck-${topic.code}`,
          icon: "🎴",
          accentColor: "#185b55",
          cardCount: publishedCount,
          competency: topic.competency || "",
          description: topic.description || "",
          subtopics: [],
          cards: [],
          questions: []
        };
      } else if (typeof PANITIKARD_DECKS !== "undefined" && PANITIKARD_DECKS[topic.code] && publishedCount > 0 && !BUNDLED_STATIC_TOPICS.has(topic.code)) {
        PANITIKARD_DECKS[topic.code].cardCount = publishedCount;
      }

      const existing = container.querySelector(`.topic-card[data-deck-id="${topic.code}"]`);
      if (existing) {
        const titleEl = existing.querySelector(".topic-title");
        if (titleEl && topic.title) titleEl.textContent = topic.title;
        const subEl = existing.querySelector(".topic-subtitle");
        if (subEl && (topic.description || topic.competency)) {
          subEl.textContent = topic.description || topic.competency;
        }
        return;
      }

      const row = document.createElement("div");
      row.className = "topic-row topic-row-single dynamic-topic-row";
      row.setAttribute("data-dynamic-topic", topic.code);

      const subtitle = topic.description || topic.competency || "Mga Tanong sa Pagsusuri";
      row.innerHTML = `
        <div class="topic-card deck-box card-dynamic card-${topic.code}" data-deck-id="${topic.code}" role="radio" aria-checked="false"
          tabindex="0" aria-label="Paksa: ${escapeHtml(topic.title || topic.code)}.">
          <span class="topic-corner corner-tl">01✦</span>
          <span class="topic-corner corner-br">✦10</span>
          <div class="topic-diagonal-band">
            <h2 class="topic-title">${escapeHtml(topic.title || topic.code)}</h2>
            <p class="topic-subtitle">${escapeHtml(subtitle)}</p>
          </div>
        </div>
      `;

      const box = row.querySelector(".topic-card");
      if (box) {
        box.addEventListener("click", () => handleTopicSelection(topic.code));
        box.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleTopicSelection(topic.code);
          }
        });
      }

      container.appendChild(row);
    });
  }

  async function loadRemoteCatalog() {
    const api = window.PANITIKARD_GAME_API;
    if (!api || !api.enabled || typeof api.listTopics !== "function") return;
    try {
      const topics = await api.listTopics({ playableOnly: true });
      if (Array.isArray(topics) && topics.length > 0) {
        renderDynamicTopicCards(topics);
      }
    } catch (err) {
      console.warn("[Catalog] Unable to load published topics from server:", err.message);
    }
  }

  function resolveActiveStudentName() {
    const fromState = typeof appState.studentName === "string" ? appState.studentName.trim() : "";
    if (fromState.length >= 2) {
      return fromState;
    }

    const inputEl = (typeof studentNameInput !== "undefined" && studentNameInput)
      ? studentNameInput
      : (typeof document !== "undefined" && typeof document.getElementById === "function" ? document.getElementById("student-name") : null);
    const fromInput = inputEl && typeof inputEl.value === "string" ? inputEl.value.trim() : "";
    if (fromInput.length >= 2) {
      appState.studentName = fromInput;
      if (typeof deckStudentName !== "undefined" && deckStudentName) {
        deckStudentName.textContent = fromInput;
      }
      return fromInput;
    }

    const deckBadgeEl = (typeof deckStudentName !== "undefined" && deckStudentName)
      ? deckStudentName
      : (typeof document !== "undefined" && typeof document.getElementById === "function" ? document.getElementById("deck-student-name") : null);
    const fromBadge = deckBadgeEl && typeof deckBadgeEl.textContent === "string" ? deckBadgeEl.textContent.trim() : "";
    if (fromBadge.length >= 2 && fromBadge !== "-" && fromBadge !== "Mag-aaral") {
      appState.studentName = fromBadge;
      if (inputEl && !inputEl.value) inputEl.value = fromBadge;
      return fromBadge;
    }

    try {
      if (typeof sessionStorage !== "undefined") {
        const fromSession = (sessionStorage.getItem("panitikard_student_name") || "").trim();
        if (fromSession.length >= 2) {
          appState.studentName = fromSession;
          if (inputEl && !inputEl.value) inputEl.value = fromSession;
          if (deckBadgeEl) deckBadgeEl.textContent = fromSession;
          return fromSession;
        }
      }
    } catch (_err) {
      // Ignore storage errors
    }

    return fromState || fromInput || "";
  }

  // Optional backend persistence is active only when an authenticated token and API URL exist.
  // The standalone classroom flow remains fully playable without either configuration.
  function beginRemoteGameSession(topicCode, mode) {
    appState.remoteSessionId = null;
    appState.remoteQuestionCatalog = null;
    appState.remoteSessionPromise = null;
    appState.remoteWriteQueue = Promise.resolve();
    appState.startedRemoteTimers = {};
    const api = window.PANITIKARD_GAME_API;
    if (api && typeof api.clearGuestToken === "function") {
      api.clearGuestToken();
    }
    if (!api || !api.enabled) return;

    const studentName = typeof resolveActiveStudentName === "function"
      ? resolveActiveStudentName()
      : (typeof appState.studentName === "string" ? appState.studentName.trim() : "");
    const hasAuthenticatedUserToken =
      typeof api.hasAccessToken === "function" &&
      api.hasAccessToken() &&
      !(typeof api.hasSessionToken === "function" && api.hasSessionToken());

    if (!hasAuthenticatedUserToken && (!studentName || studentName.length < 2 || studentName.length > 120)) {
      console.warn("[Session] Cannot start guest session: valid studentName (2-120 chars) is required.");
      return;
    }

    const generation = ++appState.remoteSessionGeneration;
    appState.remoteSessionPromise = Promise.all([
      api.listQuestions(topicCode, mode === "quiz" ? "quiz" : "cards"),
      api.createSession(topicCode, mode, studentName)
    ]).then(([catalog, session]) => {
      if (generation !== appState.remoteSessionGeneration) {
        if (!appState.remoteSessionId && typeof api.clearGuestToken === "function") {
          api.clearGuestToken();
        }
        return null;
      }
      appState.remoteQuestionCatalog = catalog;
      appState.remoteSessionId = (session && session.id) || null;
      if (session && session.sessionToken && typeof api.setGuestToken === 'function') {
        api.setGuestToken(session.sessionToken);
      }
      if (catalog && Array.isArray(catalog.questions) && catalog.questions.length > 0) {
        const activeIdx = appState.activeCardTypeIndex || 0;
        const prevDeck = (typeof PANITIKARD_DECKS !== "undefined") ? PANITIKARD_DECKS[topicCode] : null;
        const prevCard = prevDeck && Array.isArray(prevDeck.cards) ? prevDeck.cards[activeIdx] : null;
        const prevCardId = prevCard ? prevCard.id : null;
        const wasShowingFront = Boolean(
          typeof interactiveCard !== "undefined" &&
          interactiveCard &&
          interactiveCard.classList &&
          typeof interactiveCard.classList.contains === "function" &&
          !interactiveCard.classList.contains("is-flipped")
        );

        hydrateDeckFromCatalog(topicCode, catalog);

        if (
          mode === "deck" &&
          appState.activeDeckId === topicCode &&
          Object.keys(appState.answers || {}).length === 0
        ) {
          const nextDeck = (typeof PANITIKARD_DECKS !== "undefined") ? PANITIKARD_DECKS[topicCode] : null;
          const nextCard = nextDeck && Array.isArray(nextDeck.cards) ? nextDeck.cards[activeIdx] : null;

          if (!wasShowingFront) {
            if (typeof renderCardByTypeIndex === "function") {
              renderCardByTypeIndex(activeIdx);
            }
          } else {
            if (nextCard && prevCardId && prevCardId !== nextCard.id && typeof renderCardByTypeIndex === "function") {
              renderCardByTypeIndex(activeIdx);
              if (interactiveCard && interactiveCard.classList && typeof interactiveCard.classList.toggle === "function") {
                interactiveCard.classList.toggle("is-flipped", false);
              }
              if (interactiveCard && interactiveCard.dataset) {
                interactiveCard.dataset.flipped = "false";
              }
              if (typeof setActiveCardFace === "function") setActiveCardFace(interactiveCard, false);
              if (typeof updateFlipControlsState === "function") updateFlipControlsState(false);
            }
            if (nextCard && (nextCard.timeLimit || nextCard.timeLimitSeconds)) {
              if (!appState.challengeTimerId && typeof startChallengeTimer === "function") {
                startChallengeTimer(nextCard, true);
              } else if (typeof startRemoteTimer === "function") {
                startRemoteTimer(nextCard.id, "main");
              }
            }
          }
        } else if (
          mode === "quiz" &&
          typeof quizState !== "undefined" &&
          quizState.activeQuizId === topicCode &&
          Array.isArray(quizState.questions)
        ) {
          quizState.questions.forEach((quizQ) => {
            const matchedCatalogQ = catalog.questions.find(cq => cq.code === quizQ.id || cq.id === quizQ.id);
            if (matchedCatalogQ) {
              const rawLimit = matchedCatalogQ.timeLimit ?? matchedCatalogQ.timeLimitSeconds ?? null;
              if (typeof rawLimit === "number" && rawLimit > 0) {
                quizQ.timeLimit = rawLimit;
              }
            }
          });
          const activeQuizQ = quizState.questions[quizState.currentIndex || 0];
          const activeQuizLimit = activeQuizQ ? (activeQuizQ.timeLimit ?? activeQuizQ.timeLimitSeconds ?? null) : null;
          if (activeQuizQ && !quizState.isSubmitted && typeof activeQuizLimit === "number" && activeQuizLimit > 0 && typeof startRemoteTimer === "function") {
            startRemoteTimer(activeQuizQ.id, "main");
          }
        }
      }
      return { session, catalog, generation };
    }).catch((error) => {
      if (generation === appState.remoteSessionGeneration) {
        appState.remoteSessionId = null;
        if (typeof api.clearGuestToken === "function") {
          api.clearGuestToken();
        }
        console.warn("PanitiKard backend unavailable; continuing with local gameplay.", error.message);
      }
      return null;
    });
  }

  function persistRemoteAnswer(questionCode, response, round = "main", options = {}) {
    const api = window.PANITIKARD_GAME_API;
    const sessionPromise = appState.remoteSessionPromise;
    if (!api || !sessionPromise) return Promise.resolve(null);
    const writeTask = (appState.remoteWriteQueue || Promise.resolve())
      .catch(() => null)
      .then(() => sessionPromise)
      .then(async (remote) => {
        if (!remote?.session?.id) return null;
        const catalogQuestions = remote.catalog?.questions || [];
        const foundQuestion = catalogQuestions.find(question =>
          question.code === questionCode || question.id === questionCode
        );
        if (!foundQuestion) {
          console.warn(`Question ${questionCode} is absent from the published backend catalog; answer was not persisted.`);
          return null;
        }

        const timerKey = `${round}:${questionCode}`;
        const timerEntry = appState.startedRemoteTimers ? appState.startedRemoteTimers[timerKey] : null;
        if (timerEntry && timerEntry.status === "pending" && timerEntry.promise && typeof timerEntry.promise.then === "function") {
          await timerEntry.promise;
        }

        const catalogTimeLimit = foundQuestion.timeLimit ?? foundQuestion.timeLimitSeconds ?? null;
        const isTimed =
          (typeof catalogTimeLimit === "number" && catalogTimeLimit > 0) ||
          (typeof options.timeLimit === "number" && options.timeLimit > 0) ||
          options.isTimeout === true ||
          Boolean(timerEntry);

        if (isTimed) {
          if (!timerEntry || timerEntry.status !== "started") {
            const timerErr = timerEntry?.error || new Error("Question timer has not been started.");
            throw timerErr;
          }
        }

        return api.submitAnswer(remote.session.id, questionCode, response, round, options);
      });
    appState.remoteWriteQueue = writeTask.catch((error) => {
      console.warn("Unable to persist this answer to the backend.", error.message);
      return null;
    });
    return writeTask;
  }

  function startRemoteTimer(questionCode, round = "main") {
    if (!questionCode) return Promise.resolve(null);
    if (!appState.startedRemoteTimers) {
      appState.startedRemoteTimers = {};
    }
    const timerKey = `${round}:${questionCode}`;
    const existing = appState.startedRemoteTimers[timerKey];
    if (existing && (existing.status === "pending" || existing.status === "started")) {
      return existing.promise;
    }

    const api = window.PANITIKARD_GAME_API;
    const sessionPromise = appState.remoteSessionPromise;
    if (!api || !sessionPromise || typeof api.startQuestionTimer !== "function") {
      return Promise.resolve(null);
    }

    const generation = appState.remoteSessionGeneration;
    const entry = { status: "pending", promise: null, error: null };
    appState.startedRemoteTimers[timerKey] = entry;

    const timerTask = (appState.remoteWriteQueue || Promise.resolve())
      .catch(() => null)
      .then(() => sessionPromise)
      .then((remote) => {
        if (generation !== appState.remoteSessionGeneration) {
          entry.status = "cancelled";
          return null;
        }
        if (!remote?.session?.id) {
          entry.status = "failed";
          entry.error = new Error("Hindi nakakonekta sa serbisyo ang session para sa timer.");
          throw entry.error;
        }
        const catalogQuestions = remote.catalog?.questions;
        if (Array.isArray(catalogQuestions) && catalogQuestions.length > 0) {
          const foundInPublishedCatalog = catalogQuestions.some(question =>
            question.code === questionCode || question.id === questionCode
          );
          if (!foundInPublishedCatalog) {
            entry.status = "started";
            return null;
          }
        }
        return api.startQuestionTimer(remote.session.id, questionCode, round).then((res) => {
          entry.status = "started";
          entry.error = null;
          return res;
        });
      })
      .catch((err) => {
        entry.status = "failed";
        entry.error = err;
        console.warn("[Timer] Failed to record timer start on server:", err.message);
        return null;
      });

    entry.promise = timerTask;
    appState.remoteWriteQueue = timerTask.catch(() => null);
    return timerTask;
  }

  function finishRemoteGameSession() {
    const api = window.PANITIKARD_GAME_API;
    const sessionPromise = appState.remoteSessionPromise;
    if (!api || !sessionPromise) return;
    appState.remoteSessionId = null;
    appState.remoteSessionPromise = null;
    appState.remoteWriteQueue = appState.remoteWriteQueue
      .then(() => sessionPromise)
      .then(remote => remote?.session?.id ? api.finishSession(remote.session.id) : null)
      .catch((error) => {
      console.warn("Unable to mark the backend session complete.", error.message);
    });
  }

  // ------------------------------------------------------------------------
  // 3. Screen Navigation Helper
  // ------------------------------------------------------------------------
  /**
   * Switches the visible screen with smooth transition.
   * Updates the global header Back button visibility.
   * @param {HTMLElement} targetScreen
   */
  function navigateToScreen(targetScreen) {
    if (currentScreen === screens.card && targetScreen !== screens.card) {
      stopChallengeTimer();
    }
    if (currentScreen === screens.reverse && targetScreen !== screens.reverse) {
      stopReverseTimer();
    }
    Object.values(screens).forEach((screen) => {
      if (screen) screen.classList.add("hidden");
    });
    if (targetScreen) {
      targetScreen.classList.remove("hidden");
      currentScreen = targetScreen;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Header Back Button visibility logic
    if (headerBackBtn) {
      if (targetScreen === screens.welcome) {
        headerBackBtn.classList.add("hidden");
      } else {
        headerBackBtn.classList.remove("hidden");
      }
    }
  }

  // Header Back Button Global Click Handler
  if (headerBackBtn) {
    headerBackBtn.addEventListener("click", () => {
      if (currentScreen === screens.setup) {
        navigateToScreen(screens.welcome);
      } else if (currentScreen === screens.deck) {
        navigateToScreen(screens.setup);
      } else if (currentScreen === screens.card) {
        stopChallengeTimer();
        navigateToScreen(screens.deck);
      } else if (currentScreen === screens.quiz) {
        navigateToScreen(screens.deck);
      } else if (currentScreen === screens.reverseIntro) {
        navigateToScreen(screens.deck);
      } else if (currentScreen === screens.reverse) {
        stopReverseTimer();
        navigateToScreen(screens.deck);
      } else if (currentScreen === screens.result) {
        navigateToScreen(screens.deck);
      } else {
        navigateToScreen(screens.welcome);
      }
    });
  }

  // Side Drawer (Hamburger Menu) Handlers
  function openSideDrawer() {
    if (sideDrawer) {
      sideDrawer.classList.remove("hidden");
      sideDrawer.setAttribute("aria-hidden", "false");
    }
  }

  function closeSideDrawer() {
    if (sideDrawer) {
      sideDrawer.classList.add("hidden");
      sideDrawer.setAttribute("aria-hidden", "true");
    }
  }

  if (headerMenuBtn) headerMenuBtn.addEventListener("click", openSideDrawer);
  if (drawerCloseBtn) drawerCloseBtn.addEventListener("click", closeSideDrawer);
  if (drawerOverlay) drawerOverlay.addEventListener("click", closeSideDrawer);

  if (navLinkWelcome) {
    navLinkWelcome.addEventListener("click", () => {
      closeSideDrawer();
      navigateToScreen(screens.welcome);
    });
  }

  if (navLinkSetup) {
    navLinkSetup.addEventListener("click", () => {
      closeSideDrawer();
      navigateToScreen(screens.setup);
    });
  }

  if (navLinkDecks) {
    navLinkDecks.addEventListener("click", () => {
      closeSideDrawer();
      if (!appState.studentName) {
        navigateToScreen(screens.setup);
      } else {
        navigateToScreen(screens.deck);
      }
    });
  }

  // ------------------------------------------------------------------------
  // 4. Screen 1: Welcome Screen Interactions
  // ------------------------------------------------------------------------
  if (btnWelcomeStudent) {
    btnWelcomeStudent.addEventListener("click", () => {
      navigateToScreen(screens.setup);
      if (studentNameInput) studentNameInput.focus();
    });
  }

  function showTeacherModalAlert(msg, type = "error") {
    if (!teacherModalAlert) return;
    teacherModalAlert.textContent = msg;
    teacherModalAlert.className = `modal-auth-alert ${type}`;
    teacherModalAlert.style.display = "block";
    teacherModalAlert.classList.remove("hidden");
  }

  function hideTeacherModalAlert() {
    if (!teacherModalAlert) return;
    teacherModalAlert.textContent = "";
    teacherModalAlert.className = "modal-auth-alert hidden";
    teacherModalAlert.style.display = "none";
  }

  function closeTeacherModal() {
    if (teacherModal) teacherModal.classList.add("hidden");
    hideTeacherModalAlert();
    if (teacherLoginForm) teacherLoginForm.reset();
  }

  function openTeacherModal() {
    if (teacherModal) {
      hideTeacherModalAlert();
      if (teacherLoginForm) teacherLoginForm.reset();
      teacherModal.classList.remove("hidden");
      if (teacherEmailInput) {
        setTimeout(() => teacherEmailInput.focus(), 60);
      }
    }
  }

  if (btnWelcomeTeacher) {
    btnWelcomeTeacher.addEventListener("click", openTeacherModal);
  }

  if (btnCloseTeacherModal) {
    btnCloseTeacherModal.addEventListener("click", closeTeacherModal);
  }

  if (btnTeacherModalCancel) {
    btnTeacherModalCancel.addEventListener("click", closeTeacherModal);
  }

  if (teacherModal) {
    teacherModal.addEventListener("click", (e) => {
      if (e.target === teacherModal) closeTeacherModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && teacherModal && !teacherModal.classList.contains("hidden")) {
      closeTeacherModal();
    }
  });

  if (teacherLoginForm) {
    teacherLoginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideTeacherModalAlert();

      const email = (teacherEmailInput?.value || "").trim();
      const password = (teacherPasswordInput?.value || "").trim();

      if (!email || !password) {
        showTeacherModalAlert("Pakilagay ang email at password.");
        return;
      }

      const auth = window.PANITIKARD_DASHBOARD_AUTH;
      if (!auth || typeof auth.signIn !== "function") {
        showTeacherModalAlert("Hindi ma-load ang authentication service. Pakisubukang i-reload ang pahina.");
        return;
      }

      if (btnTeacherLoginSubmit) {
        btnTeacherLoginSubmit.disabled = true;
        btnTeacherLoginSubmit.textContent = "Sumusuri ng kredensyal...";
      }

      try {
        const profile = await auth.signIn(email, password);
        const roleLabel = profile.role === "admin" ? "Admin" : "Guro";
        showTeacherModalAlert(`Matagumpay na nag-sign in bilang ${roleLabel}! Binubuksan ang dashboard...`, "info");
        setTimeout(() => {
          window.location.href = "dashboard.html";
        }, 300);
      } catch (err) {
        showTeacherModalAlert(err.message || "Maling email o password. Pakisubukang muli.");
      } finally {
        if (btnTeacherLoginSubmit) {
          btnTeacherLoginSubmit.disabled = false;
          btnTeacherLoginSubmit.textContent = "Mag-sign in";
        }
      }
    });
  }

  // ------------------------------------------------------------------------
  // 5. Validation Helpers
  // ------------------------------------------------------------------------
  function showValidation(msg) {
    if (validationText) validationText.textContent = msg;
    if (validationBanner) {
      validationBanner.classList.remove("hidden");
      validationBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function hideValidation() {
    if (validationBanner) validationBanner.classList.add("hidden");
    if (validationText) validationText.textContent = "";
  }

  function showDeckWarning(msg) {
    if (typeof document === "undefined") return;
    let banner = document.getElementById("deck-alert-banner");
    let textEl = document.getElementById("deck-alert-text");
    if (!banner) {
      const wrapper = document.querySelector(".deck-screen-wrapper");
      if (wrapper) {
        banner = document.createElement("div");
        banner.id = "deck-alert-banner";
        banner.className = "alert-box alert-error";
        banner.setAttribute("role", "alert");
        textEl = document.createElement("span");
        textEl.id = "deck-alert-text";
        banner.appendChild(textEl);
        wrapper.prepend(banner);
      }
    }
    if (textEl) textEl.textContent = msg;
    if (banner) {
      banner.classList.remove("hidden");
      if (typeof banner.scrollIntoView === "function") {
        banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  function hideDeckWarning() {
    if (typeof document === "undefined") return;
    const banner = document.getElementById("deck-alert-banner");
    const textEl = document.getElementById("deck-alert-text");
    if (banner) banner.classList.add("hidden");
    if (textEl) textEl.textContent = "";
  }

  if (studentNameInput) {
    const initialInputName = studentNameInput.value.trim();
    if (initialInputName.length >= 2 && !appState.studentName) {
      appState.studentName = initialInputName;
      if (deckStudentName) deckStudentName.textContent = initialInputName;
    }

    studentNameInput.addEventListener("input", () => {
      const trimmed = studentNameInput.value.trim();
      if (trimmed.length > 0) {
        hideValidation();
      }
      if (trimmed.length >= 2) {
        appState.studentName = trimmed;
      }
    });
  }

  // ------------------------------------------------------------------------
  // 6. Screen 2 -> Screen 3: Student Setup to Deck Selection Flow
  // ------------------------------------------------------------------------
  if (setupForm) {
    setupForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = studentNameInput ? studentNameInput.value.trim() : "";

      if (!name || name.length < 2) {
        showValidation("Pakilagay muna ang iyong buong pangalan bago magpatuloy.");
        if (studentNameInput) studentNameInput.focus();
        return;
      }

      appState.studentName = name;
      try {
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem("panitikard_student_name", name);
        }
      } catch (_err) {
        // Ignore storage errors
      }
      hideValidation();
      hideDeckWarning();

      // Update player name badge on Screen 3 (Deck Screen)
      if (deckStudentName) {
        deckStudentName.textContent = name;
      }

      // Transition to Topic Deck Selection
      syncActiveDeckUI(appState.activeDeckId);
      loadRemoteCatalog();
      navigateToScreen(screens.deck);
    });
  }

  // Back Navigation: Deck Screen to Setup Screen
  if (btnBackToSetup) {
    btnBackToSetup.addEventListener("click", () => {
      stopChallengeTimer();
      navigateToScreen(screens.setup);
      if (studentNameInput) studentNameInput.focus();
    });
  }

  if (btnEditStudentName) {
    btnEditStudentName.addEventListener("click", () => {
      stopChallengeTimer();
      navigateToScreen(screens.setup);
      if (studentNameInput) studentNameInput.focus();
    });
  }

  // ------------------------------------------------------------------------
  // 7. Topic Selection Handling (Alamat, Kwento, Elements, Meaning)
  // ------------------------------------------------------------------------
  function selectDeck(deckId) {
    appState.activeDeckId = deckId;
    syncActiveDeckUI(deckId);
  }

  function syncActiveDeckUI(deckId) {
    const allBoxes = document.querySelectorAll(".deck-box, .topic-card");
    allBoxes.forEach((box) => {
      if (box.dataset.deckId === deckId) {
        box.classList.add("active-deck");
        box.setAttribute("aria-checked", "true");
      } else {
        box.classList.remove("active-deck");
        box.setAttribute("aria-checked", "false");
      }
    });
  }

  function setActiveCardFace(card, showingBack) {
    if (!card) return;
    const front = card.querySelector(".card-front");
    const back = card.querySelector(".card-back");
    if (front) {
      front.setAttribute("aria-hidden", String(showingBack));
      front.inert = showingBack;
    }
    if (back) {
      back.setAttribute("aria-hidden", String(!showingBack));
      back.inert = !showingBack;
    }
  }

  async function handleTopicSelection(deckId) {
    hideDeckWarning();
    selectDeck(deckId);

    const resolvedName = resolveActiveStudentName();
    if ((!resolvedName || resolvedName.length < 2) && screens.setup) {
      navigateToScreen(screens.setup);
      showValidation("Pakilagay muna ang iyong buong pangalan bago pumili ng paksa.");
      if (studentNameInput) studentNameInput.focus();
      return false;
    }

    const api = window.PANITIKARD_GAME_API;
    const deck = (typeof PANITIKARD_DECKS !== "undefined") ? PANITIKARD_DECKS[deckId] : null;
    const isBundledStatic = BUNDLED_STATIC_TOPICS.has(deckId);

    // Fetch published questions from backend when backend is enabled
    if (api && api.enabled && typeof api.listQuestions === "function" && (!deck || (!deck.cards?.length && !deck.questions?.length) || !isBundledStatic)) {
      try {
        const catalog = await api.listQuestions(deckId);
        if (catalog && Array.isArray(catalog.questions)) {
          hydrateDeckFromCatalog(deckId, catalog);
        }
      } catch (err) {
        console.warn(`[Catalog] Failed to load questions for topic ${deckId}:`, err.message);
      }
    }

    const currentDeck = (typeof PANITIKARD_DECKS !== "undefined") ? PANITIKARD_DECKS[deckId] : null;
    const hasPlayableCards = Boolean(currentDeck && Array.isArray(currentDeck.cards) && currentDeck.cards.length > 0);
    const hasPlayableQuiz = Boolean(currentDeck && Array.isArray(currentDeck.questions) && currentDeck.questions.length > 0);

    if (!hasPlayableCards && !hasPlayableQuiz) {
      showDeckWarning("Wala pang inilathalang tanong o kard para sa paksang ito. Pakipili ang ibang paksa.");
      return false;
    }

    if (deckId === "alamat" || deckId === "maikling-kwento" || (hasPlayableQuiz && !hasPlayableCards)) {
      if (!hasPlayableQuiz) {
        showDeckWarning("Wala pang inilathalang tanong sa pagsusulit para sa paksang ito. Pakipili ang ibang paksa.");
        return false;
      }
      startQuiz(deckId);
      return true;
    }

    return startDeckSession();
  }

  const allTopicCards = document.querySelectorAll(".topic-card, .deck-box");
  allTopicCards.forEach((box) => {
    box.addEventListener("click", () => handleTopicSelection(box.dataset.deckId));
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleTopicSelection(box.dataset.deckId);
      }
    });
  });

  if (btnEnterDeck) {
    btnEnterDeck.addEventListener("click", () => {
      handleTopicSelection(appState.activeDeckId);
    });
  }

  // ------------------------------------------------------------------------
  // 8. Gameplay Session Start & Card Arena Lifecycle
  // ------------------------------------------------------------------------
  function startDeckSession() {
    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck || !Array.isArray(deck.cards) || deck.cards.length === 0) {
      showDeckWarning("Wala pang inilathalang kard para sa paksang ito. Pakipili ang ibang paksa.");
      return false;
    }

    const resolvedName = resolveActiveStudentName();
    if ((!resolvedName || resolvedName.length < 2) && screens.setup) {
      navigateToScreen(screens.setup);
      showValidation("Pakilagay muna ang iyong buong pangalan bago magsimula ng laro.");
      if (studentNameInput) studentNameInput.focus();
      return false;
    }

    hideDeckWarning();
    deck.cardCount = deck.cards.length;

    // Reset gameplay state for new session
    appState.lastPlayedMode = "deck";
    appState.answers = {};
    appState.incorrectQuestions = [];
    appState.reverseRoundCompleted = false;
    appState.isEvaluatingAnswer = false;
    appState.activeCardTypeIndex = 0;
    appState.highestUnlockedIndex = 0;
    stopChallengeTimer();

    // Reset reverse state
    stopReverseTimer();
    reverseState.selectedQuestions = [];
    reverseState.maxAttempts = 3;
    reverseState.attemptsRemaining = 3;
    reverseState.currentIndex = 0;
    reverseState.pointsEarned = 0;
    reverseState.answers = {};
    reverseState.selectedOption = null;
    reverseState.isSubmitted = false;
    reverseState.timerId = null;
    reverseState.secondsRemaining = 0;

    beginRemoteGameSession(appState.activeDeckId, "deck");

    if (cardDeckIndicator) {
      cardDeckIndicator.textContent = `Deck: ${deck.title}`;
    }
    if (cardStudentIndicator) {
      cardStudentIndicator.textContent = `Mag-aaral: ${appState.studentName || "Mag-aaral"}`;
    }

    renderCardByTypeIndex(0);
    navigateToScreen(screens.card);
    return true;
  }

  /**
   * Renders the card at the specified index within the active deck.
   * Applies UNO category styling, corner pips, and manages formative feedback.
   * @param {number} index
   */
  function renderCardByTypeIndex(index) {
    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck || !deck.cards[index]) return;

    stopChallengeTimer();

    appState.activeCardTypeIndex = index;
    const cardData = deck.cards[index];
    const typeMeta = PANITIKARD_CARD_TYPES[cardData.type] || {
      label: cardData.type,
      subLabel: "Card",
      icon: "🎴",
      color: "#185b55",
      tagClass: "type-question",
      themeClass: "card-theme-green"
    };

    const isSubmitted = !!appState.answers[cardData.id];
    const currentSubmission = appState.answers[cardData.id] || null;
    const colorSequence = ["yellow", "red", "blue", "green"];
    const sequenceColor = colorSequence[index % colorSequence.length];

    // Keep card colors in the approved repeating order, independent of question type.
    interactiveCard.className = `playing-card theme-${typeMeta.tagClass} ${typeMeta.themeClass || ""} card-sequence-${sequenceColor}`;

    // A new question always begins on the branded green back; answered cards reopen on evaluation.
    interactiveCard.classList.toggle("is-flipped", true);
    interactiveCard.dataset.flipped = "true";
    setActiveCardFace(interactiveCard, true);
    if (cardBackBrandContent) cardBackBrandContent.classList.toggle("hidden", isSubmitted);
    if (cardBackFlipPill) cardBackFlipPill.classList.toggle("hidden", isSubmitted);

    // 0. Update Single Active Category Header (Displays ONLY the active card's category; inactive remain hidden)
    const singleActiveCategoryBanner = document.getElementById("single-active-category-banner");
    const activeCatIcon = document.getElementById("active-cat-icon");
    const activeCatName = document.getElementById("active-cat-name");
    const activeCatDesc = document.getElementById("active-cat-desc");
    const activeCatStep = document.getElementById("active-cat-step");

    if (singleActiveCategoryBanner) singleActiveCategoryBanner.className = "single-category-header-banner theme-green";
    if (activeCatIcon) activeCatIcon.textContent = typeMeta.icon;
    if (activeCatName) activeCatName.textContent = typeMeta.label;
    if (activeCatDesc) activeCatDesc.textContent = typeMeta.unoCategory || typeMeta.subLabel;
    if (activeCatStep) activeCatStep.textContent = `${index + 1} ng ${deck.cards.length}`;

    // 1. Header Badges & UNO Corner Pips
    if (frontCardNum) frontCardNum.textContent = cardData.number;
    if (frontCardNumBottom) frontCardNumBottom.textContent = cardData.number;
    if (frontPipIcon) frontPipIcon.textContent = typeMeta.icon;
    if (frontPipIconBottom) frontPipIconBottom.textContent = typeMeta.icon;

    if (frontCardTypeBadge) {
      frontCardTypeBadge.innerHTML = `
        <span class="type-badge-icon">${typeMeta.icon}</span>
        <span class="type-badge-text">${typeMeta.label} &bull; ${typeMeta.subLabel}</span>
      `;
    }

    if (frontDeckBadge) frontDeckBadge.textContent = deck.badge;
    if (frontCardIcon) frontCardIcon.textContent = typeMeta.icon;

    // 2. Title & Prompt Text
    if (frontCardTitle) frontCardTitle.textContent = cardData.title;
    if (frontCardPrompt) frontCardPrompt.textContent = cardData.prompt;

    // 3. Challenge Timer Header Indicator
    if (cardData.timeLimit && frontTimerBadge) {
      frontTimerBadge.classList.remove("hidden");
      if (!isSubmitted) {
        appState.challengeSecondsRemaining = cardData.timeLimit;
        if (timerSeconds) timerSeconds.textContent = String(appState.challengeSecondsRemaining);
      } else {
        if (timerSeconds) timerSeconds.textContent = "0";
      }
    } else if (frontTimerBadge) {
      frontTimerBadge.classList.add("hidden");
    }

    // 4. Options or Open Response Input Presentation
    renderCardFrontOptions(cardData, isSubmitted, currentSubmission, typeMeta);

    // 5. Back Content & Formative Feedback Box
    renderCardBackContent(cardData, isSubmitted, currentSubmission);

    // 6. Flip Security & On-Card Pill Indicator
    updateFlipControlsState(isSubmitted);

    // 7. Navigation Toolbar Buttons (Prev, Flip, Next)
    updateNavigationControls(index, isSubmitted);

    // 8. Update Switcher Tabs UI & Progression Locks
    updateTabsState(index);
  }

  /**
   * Updates reveal instructions and the card's flip control.
   */
  function updateFlipControlsState(isSubmitted) {
    const showingBack = interactiveCard.classList.contains("is-flipped");
    if (frontFlipIcon) frontFlipIcon.textContent = showingBack ? "🔄" : "✍️";
    if (frontFlipPillText) {
      frontFlipPillText.textContent = showingBack
        ? "I-tap upang ipakita ang tanong"
        : (isSubmitted ? "Nasuri na ang sagot" : "Sagutan at isumite ang tanong");
    }
    if (btnFlipCard) {
      btnFlipCard.disabled = isSubmitted;
      btnFlipCard.title = isSubmitted
        ? "Nasa evaluation face na ang kard. Magpatuloy sa susunod na tanong."
        : (showingBack ? "Ipakita ang tanong sa harap ng kard." : "Ibaligtad ang iisang kard.");
    }
  }

  /**
   * Updates toolbar button states based on progression.
   */
  function updateNavigationControls(index, isSubmitted) {
    if (btnPrevCard) {
      btnPrevCard.disabled = (index === 0);
    }

    if (btnNextCard) {
      const deck = (typeof PANITIKARD_DECKS !== "undefined") ? PANITIKARD_DECKS[appState.activeDeckId] : null;
      const totalCards = deck && Array.isArray(deck.cards) ? deck.cards.length : 0;
      if (!isSubmitted) {
        btnNextCard.disabled = true;
        btnNextCard.innerHTML = `<span>Susunod &rarr;</span>`;
      } else {
        btnNextCard.disabled = false;
        if (index >= totalCards - 1) {
          // Check if reverse round is available
          if (!appState.reverseRoundCompleted && appState.incorrectQuestions.length > 0) {
            btnNextCard.innerHTML = `<span>Reverse Round 🔁 &rarr;</span>`;
          } else {
            btnNextCard.innerHTML = `<span>Tingnan ang Resulta 🏆 &rarr;</span>`;
          }
        } else {
          btnNextCard.innerHTML = `<span>Susunod &rarr;</span>`;
        }
      }
    }
  }

  /**
   * Updates the 7 card type tabs with active & progression locked states.
   */
  function updateTabsState(activeIndex) {
    const deck = (typeof PANITIKARD_DECKS !== "undefined") ? PANITIKARD_DECKS[appState.activeDeckId] : null;
    const totalCards = deck?.cards?.length || cardTypeTabs.length;

    cardTypeTabs.forEach((tab, i) => {
      if (i >= totalCards) {
        tab.style.display = "none";
        return;
      }
      tab.style.display = "";
      const isLocked = i > appState.highestUnlockedIndex;
      
      if (isLocked) {
        tab.classList.add("is-locked");
        tab.setAttribute("aria-disabled", "true");
        tab.title = "Sagutan muna ang mga naunang kard upang mabuksan.";
      } else {
        tab.classList.remove("is-locked");
        tab.removeAttribute("aria-disabled");
        tab.title = "";
      }

      if (i === activeIndex) {
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      } else {
        tab.classList.remove("active");
        tab.setAttribute("aria-selected", "false");
      }
    });
  }

  // ------------------------------------------------------------------------
  // 9. Card Front Presentation & Submission Handlers
  // ------------------------------------------------------------------------
  function renderCardFrontOptions(cardData, isSubmitted, submission, typeMeta) {
    if (!frontCardOptions) return;
    frontCardOptions.innerHTML = "";

    // A. Multiple Choice Card
    if (cardData.options && cardData.options.length > 0) {
      frontCardOptions.className = "card-options-grid";
      let selectedOptionKey = submission ? submission.userAnswer : null;
      const choiceElements = [];

      cardData.options.forEach((opt) => {
        const optionEl = document.createElement("div");
        optionEl.className = "option-pill";
        optionEl.dataset.key = opt.key;

        optionEl.innerHTML = `
          <span class="option-key">${opt.key}</span>
          <span class="option-text">${opt.text}</span>
          <span class="option-status-icon"></span>
        `;

        if (isSubmitted) {
          optionEl.classList.add("disabled");
          if (opt.key === submission.userAnswer) optionEl.classList.add("selected");
        } else {
          optionEl.addEventListener("click", (e) => {
            e.stopPropagation();
            choiceElements.forEach(el => el.classList.remove("selected"));
            optionEl.classList.add("selected");
            selectedOptionKey = opt.key;
            
            const submitBtn = frontCardOptions.querySelector(".btn-submit-choice");
            if (submitBtn) submitBtn.disabled = false;
          });
        }

        choiceElements.push(optionEl);
        frontCardOptions.appendChild(optionEl);
      });

      // Submit Row
      const submitRow = document.createElement("div");
      submitRow.className = "card-submit-row";

      if (!isSubmitted) {
        submitRow.innerHTML = `
          <button type="button" class="btn-submit-choice" disabled>
            <span>Ipasa ang Sagot</span>
          </button>
        `;
        const submitBtn = submitRow.querySelector(".btn-submit-choice");
        if (submitBtn) {
          submitBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (selectedOptionKey) {
              submitMultipleChoiceAnswer(selectedOptionKey, cardData);
            }
          });
        }
      } else {
        submitRow.innerHTML = `<span class="feedback-badge feedback-submitted"><span>Nasumite na. I-flip ang kard para makita ang pagsusuri.</span></span>`;
      }

      frontCardOptions.appendChild(submitRow);
    } 
    // B. Open-Ended Cards (Statement, Correction, Bonus, Reverse, Help, Challenge)
    else {
      frontCardOptions.className = "card-options-open";

      const openCardForm = document.createElement("div");
      openCardForm.className = "open-card-form";

      let badgesHtml = `<span class="format-tag">✍️ Anyong Pasulat</span>`;
      if (cardData.timeLimit) {
        badgesHtml += `<span class="time-limit-badge">⏱️ ${cardData.timeLimit}s</span>`;
      }
      if (cardData.points > 1) {
        badgesHtml += `<span class="points-badge">⭐ ${cardData.points} Puntos</span>`;
      } else if (cardData.points === 0) {
        badgesHtml += `<span class="points-badge">🔄 Pagbabalik-aral (0 Puntos)</span>`;
      }

      let hintToggleHtml = "";
      if (cardData.hint) {
        hintToggleHtml = `
          <button type="button" class="hint-toggle-btn" id="btn-toggle-hint">
            <span>💡 Ipakita ang Pahiwatig</span>
          </button>
        `;
      }

      openCardForm.innerHTML = `
        <div class="open-form-meta">
          <div class="open-format-badge">${badgesHtml}</div>
          ${hintToggleHtml}
        </div>
        <div id="hint-box-container" class="hidden">
          <div class="hint-box-revealed">
            💡 <strong>Pahiwatig:</strong> ${cardData.hint || ""}
          </div>
        </div>
        <textarea id="open-answer-input" class="open-card-textarea"
          placeholder="Isulat dito ang iyong sagot o paliwanag..."
          rows="2" maxlength="280" ${isSubmitted ? "disabled" : ""}>${isSubmitted ? escapeHtml(submission.userAnswer || "") : ""}</textarea>
        <div class="card-submit-row">
          ${!isSubmitted ? `
            <button type="button" id="btn-submit-open" class="btn-submit-choice">
              <span>Ipasa ang Sagot</span>
            </button>
          ` : `
            <span class="feedback-badge feedback-submitted">
              <span>${getOpenFeedbackText(submission, cardData)}</span>
            </span>
          `}
        </div>
      `;

      // Hint Toggle Event
      const btnToggleHint = openCardForm.querySelector("#btn-toggle-hint");
      const hintBox = openCardForm.querySelector("#hint-box-container");
      if (btnToggleHint && hintBox) {
        btnToggleHint.addEventListener("click", (e) => {
          e.stopPropagation();
          hintBox.classList.toggle("hidden");
          btnToggleHint.textContent = hintBox.classList.contains("hidden") 
            ? "💡 Ipakita ang Pahiwatig" 
            : "🙈 Itago ang Pahiwatig";
        });
      }

      // Submit Open-Ended Answer Event
      if (!isSubmitted) {
        const btnSubmitOpen = openCardForm.querySelector("#btn-submit-open");
        const textarea = openCardForm.querySelector("#open-answer-input");

        if (btnSubmitOpen && textarea) {
          btnSubmitOpen.addEventListener("click", (e) => {
            e.stopPropagation();
            const answerText = textarea.value.trim();
            if (!answerText) {
              textarea.focus();
              textarea.style.borderColor = "#dc2626";
              setTimeout(() => { textarea.style.borderColor = ""; }, 1800);
              return;
            }
            submitOpenEndedAnswer(answerText, cardData);
          });

          textarea.addEventListener("click", (e) => e.stopPropagation());
          textarea.addEventListener("input", () => {
            const errBox = document.getElementById("open-error-container");
            if (errBox) errBox.classList.add("hidden");
          });
          textarea.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              btnSubmitOpen.click();
            }
          });
        }
      }

      frontCardOptions.appendChild(openCardForm);
    }
  }

  function getOpenFeedbackText(submission, cardData) {
    if (submission.isTimeout) {
      return "⏱️ Naubos ang 30 segundo na palugit!";
    }
    return "Nasumite na. I-flip ang kard para makita ang pagsusuri.";
  }

  // ------------------------------------------------------------------------
  // 10. Card Back Presentation & Formative Feedback Box
  // ------------------------------------------------------------------------
  function renderCardBackContent(cardData, isSubmitted, submission) {
    // Populate the evaluation shown on the same card's reverse face.
    if (backAnswerHighlight) {
      const resolvedAnswer = (submission && (submission.correctAnswer || submission.expectedAnswer)) ||
        cardData.answer ||
        "";
      if (cardData.options && cardData.options.length > 0) {
        const rawKey = resolvedAnswer.includes(".") ? resolvedAnswer.split(".")[0].trim() : resolvedAnswer.trim();
        const correctOpt = cardData.options.find(o => (o.key || "").toLowerCase() === rawKey.toLowerCase());
        backAnswerHighlight.textContent = correctOpt
          ? `${correctOpt.key} · ${correctOpt.text}`
          : (resolvedAnswer || "—");
      } else {
        backAnswerHighlight.textContent = resolvedAnswer || "—";
      }
    }

    if (backStudentAnswer) backStudentAnswer.textContent = submission ? submission.userAnswer : "—";

    if (backExplanationText) {
      backExplanationText.textContent = cardData.explanation;
    }

    if (cardData.didYouKnow) {
      if (backTriviaWrap) backTriviaWrap.classList.remove("hidden");
      if (backTriviaText) backTriviaText.textContent = cardData.didYouKnow;
    } else {
      if (backTriviaWrap) backTriviaWrap.classList.add("hidden");
    }

    if (cardData.terms && cardData.terms.length > 0) {
      if (backTermsBox) backTermsBox.classList.remove("hidden");
      if (backTermsText) backTermsText.textContent = cardData.terms.map(g => g.join(" / ")).join(" • ");
    } else {
      if (backTermsBox) backTermsBox.classList.add("hidden");
    }

    // Swap branded back for feedback only after a response has been evaluated.
    if (cardBackBrandContent) cardBackBrandContent.classList.toggle("hidden", !!(isSubmitted && submission));
    if (cardBackFlipPill) cardBackFlipPill.classList.toggle("hidden", !!(isSubmitted && submission));
    if (cardFeedbackBox) {
      if (isSubmitted && submission) {
        cardFeedbackBox.classList.remove("hidden");
        const isOk = submission.isCorrect;
        const isPartial = submission.pointsEarned > 0 && submission.pointsEarned < (submission.maxPoints || 1);
        if (cardFeedbackHeader) {
          cardFeedbackHeader.className = `card-feedback-head ${isOk ? "feedback-correct" : (isPartial ? "feedback-partial" : "feedback-incorrect")}`;
        }
        if (cardFeedbackIcon) {
          cardFeedbackIcon.textContent = isOk ? "✓" : (isPartial ? "◐" : "✗");
        }
        if (cardFeedbackStatus) {
          cardFeedbackStatus.textContent = isPartial
            ? "BAHAGYANG TAMA"
            : (isOk ? "TAMA!" : (submission.isTimeout ? "NAUBOS ANG ORAS!" : "HINDI TUMUGMA"));
        }
        if (cardFeedbackPoints) {
          cardFeedbackPoints.textContent = `+${submission.pointsEarned} ${submission.pointsEarned === 1 ? "Punto" : "Puntos"}`;
        }
        if (cardFeedbackMessage) {
          if (submission.aiFeedback) {
            let msg = submission.aiFeedback;
            if (Array.isArray(submission.criteriaEvaluation) && submission.criteriaEvaluation.length > 0) {
              const critDetails = submission.criteriaEvaluation
                .map(c => `• ${c.satisfied ? '✓' : '✗'} ${c.aspect}: ${c.explanation}`)
                .join('\n');
              msg += `\n\n${critDetails}`;
            }
            cardFeedbackMessage.style.whiteSpace = "pre-line";
            cardFeedbackMessage.textContent = msg;
          } else {
            cardFeedbackMessage.style.whiteSpace = "normal";
            cardFeedbackMessage.textContent = submission.isTimeout
              ? "Naubos ang oras. Walang puntos na iginawad."
              : (isOk
                ? "Tugma ang sagot sa inaasahang sagot at pamantayan."
                : "Hindi naabot ng sagot ang mga pamantayang itinakda para sa tanong na ito.");
          }
        }
        const cardFeedbackMethod = document.getElementById("card-feedback-method");
        if (cardFeedbackMethod) {
          if (submission.evaluationMethod === "deterministic_rubric" || submission.source === "backend_rubric") {
            cardFeedbackMethod.textContent = "Sinuri gamit ang PanitiKard Rubric Evaluator.";
          } else if (submission.evaluationMethod === "gemini_ai" || submission.source === "backend_gemini") {
            cardFeedbackMethod.textContent = "Sinuri gamit ang PanitiKard Semantic Evaluation.";
          } else {
            cardFeedbackMethod.textContent = "Sinuri batay sa itinakdang sagot at pamantayan.";
          }
        }
      } else {
        cardFeedbackBox.classList.add("hidden");
      }
    }
  }

  // ------------------------------------------------------------------------
  // 11. Evaluation & Submission Logic
  // ------------------------------------------------------------------------
  /**
   * Submits and grades Multiple Choice answers (1 point).
   * Automatically records incorrect questions for Reverse Round.
   */
  function submitMultipleChoiceAnswer(selectedKey, cardData) {
    if (appState.answers[cardData.id]) return;
    if (interactiveCard.classList.contains("is-flipped")) return;

    stopChallengeTimer();

    const cardTimeLimit = cardData.timeLimit || cardData.timeLimitSeconds || null;
    const backendActive = Boolean(
      window.PANITIKARD_GAME_API &&
      window.PANITIKARD_GAME_API.enabled &&
      appState.remoteSessionPromise
    );
    if (backendActive && typeof cardTimeLimit === "number" && cardTimeLimit > 0) {
      const timerEntry = appState.startedRemoteTimers ? appState.startedRemoteTimers[`main:${cardData.id}`] : null;
      if (!timerEntry || timerEntry.status === "failed") {
        console.warn("[Main] Cannot score timed multiple-choice answer: question timer failed to start.");
        return;
      }
    }

    let initialCorrect = resolveCorrectAnswerDisplay(cardData.answer, cardData.options) || cardData.answer || "";
    const isCorrect = Boolean(cardData.answer && selectedKey === cardData.answer);
    const pointsEarned = isCorrect ? cardData.points : 0;

    appState.answers[cardData.id] = {
      cardId: cardData.id,
      type: cardData.type,
      number: cardData.number,
      tag: cardData.tag,
      title: cardData.title,
      prompt: cardData.prompt,
      userAnswer: selectedKey,
      correctAnswer: initialCorrect,
      isCorrect: isCorrect,
      pointsEarned: pointsEarned,
      maxPoints: cardData.points,
      explanation: cardData.explanation,
      terms: cardData.terms,
      submittedAt: new Date().toISOString()
    };
    const persistPromise = persistRemoteAnswer(cardData.id, selectedKey, "main", { timeLimit: cardTimeLimit });
    if (persistPromise && typeof persistPromise.catch === "function") {
      persistPromise.then((officialResult) => {
        if (officialResult) {
          const rec = appState.answers[cardData.id];
          if (rec) {
            if (typeof officialResult.isCorrect === "boolean") rec.isCorrect = officialResult.isCorrect;
            if (typeof officialResult.pointsAwarded === "number") rec.pointsEarned = officialResult.pointsAwarded;
            if (officialResult.correctAnswer) {
              rec.correctAnswer = resolveCorrectAnswerDisplay(officialResult.correctAnswer, cardData.options);
            }
          }
          if (officialResult.correctAnswer) {
            cardData.answer = officialResult.correctAnswer;
          }
          const isSubmitted = Boolean(rec);
          renderCardBackContent(cardData, isSubmitted, rec);
        }
      }).catch((err) => {
        if (cardTimeLimit && appState.startedRemoteTimers?.[`main:${cardData.id}`]?.status === "failed") {
          delete appState.answers[cardData.id];
        }
        console.warn("[Main] Multiple-choice official persistence failed:", err.message);
      });
    }

    // Record incorrect question for Reverse Round
    if (!isCorrect) {
      const exists = appState.incorrectQuestions.some(item => item.id === cardData.id);
      if (!exists) {
        appState.incorrectQuestions.push({
          id: cardData.id,
          source: "card",
          title: cardData.title,
          question: cardData.prompt,
          category: cardData.tag || "Pagsusuri",
          questionType: "multiple_choice",
          choices: cardData.options ? [...cardData.options] : [],
          answer: cardData.answer,
          explanation: cardData.explanation,
          terms: cardData.terms,
          points: cardData.points || 1,
          timeLimit: cardData.timeLimit || null,
          originalCard: cardData
        });
      }
    }

    unlockNextIndex();
    renderCardByTypeIndex(appState.activeCardTypeIndex);
  }

  /**
   * Evaluates Open-Ended responses (Statement, Correction, Bonus, etc.).
   */
  function evaluateOpenEndedAnswer(userAnswer, cardData) {
    const evaluation = PANITIKARD_ANSWER_EVALUATOR.evaluateWrittenAnswer({
      studentAnswer: userAnswer,
      expectedAnswer: cardData.answer,
      acceptedAnswers: cardData.acceptedAnswers || [],
      rubricGroups: cardData.terms || [],
      questionId: cardData.id
    });

    return {
      isCorrect: evaluation.isCorrect,
      pointsEarned: evaluation.isCorrect ? (cardData.points ?? 1) : 0,
      matchedGroups: evaluation.matchedGroups,
      requiredGroups: evaluation.requiredGroups,
      evaluationMethod: evaluation.method,
      evaluationContext: {
        question: cardData.prompt,
        expectedAnswer: cardData.answer,
        rubricGroups: cardData.terms || [],
        studentAnswer: userAnswer
      }
    };
  }

  /**
   * Submits an open-ended answer.
   * Records incorrect answers (e.g. timeouts or blank responses) for Reverse Round.
   */
  async function submitOpenEndedAnswer(answerText, cardData, isTimeout = false) {
    if (appState.isEvaluatingAnswer) return;
    if (appState.answers[cardData.id]) return;
    if (interactiveCard.classList.contains("is-flipped")) return;

    stopChallengeTimer();

    // Prevent duplicate submissions during async evaluation
    appState.isEvaluatingAnswer = true;

    // Visual loading state on the submit button
    const submitBtn = document.getElementById("btn-submit-open");
    const textarea = document.getElementById("open-answer-input");
    const originalBtnContent = submitBtn ? submitBtn.innerHTML : "";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>⏳ Sinusuri ng AI...</span>`;
    }
    if (textarea) {
      textarea.disabled = true;
    }

    // Determine whether a backend is configured for this deployment.
    // This is based solely on whether the API base URL is set and the API is enabled —
    // NOT on whether a session was successfully created. If the backend is configured but
    // session creation failed, we must NOT fall back to local scoring (fail-closed).
    const backendConfigured = Boolean(
      window.PANITIKARD_GAME_API &&
      window.PANITIKARD_GAME_API.enabled
    );

    const sessionGeneration = appState.remoteSessionGeneration;
    let evalResult;
    try {
      if (isTimeout) {
        evalResult = {
          success: true,
          available: true,
          isCorrect: false,
          pointsEarned: 0,
          maxPoints: cardData.points || 1,
          feedback: "Naubos ang itinakdang 30 segundo na palugit para sa pagsusuri.",
          evaluationMethod: "timeout",
          criteriaEvaluation: []
        };
      } else {
        const gameApi = window.PANITIKARD_GAME_API;
        let activeSessionId = appState.remoteSessionId || null;

        if (backendConfigured) {
          const pendingSessionPromise = appState.remoteSessionPromise;
          if (!activeSessionId && pendingSessionPromise && typeof pendingSessionPromise.then === "function") {
            const initialized = await pendingSessionPromise.catch(() => null);
            if (sessionGeneration !== appState.remoteSessionGeneration) {
              return;
            }
            if (initialized && initialized.generation === sessionGeneration && initialized.session && initialized.session.id) {
              activeSessionId = initialized.session.id;
            } else {
              activeSessionId = appState.remoteSessionId || null;
            }
          }

          if (sessionGeneration !== appState.remoteSessionGeneration) {
            return;
          }

          const hasToken = Boolean(
            gameApi && (
              (typeof gameApi.hasSessionToken === "function" && gameApi.hasSessionToken()) ||
              (typeof gameApi.hasAccessToken === "function" && gameApi.hasAccessToken())
            )
          );

          if (!activeSessionId || typeof activeSessionId !== "string" || !activeSessionId.trim() || !hasToken) {
            evalResult = {
              success: false,
              available: false,
              isCorrect: false,
              pointsEarned: 0,
              maxPoints: cardData.points || 1,
              feedback: "Hindi nakakonekta sa serbisyo ang session. Pakisubukang muli ang pagsusumite.",
              errorCode: "SESSION_UNAVAILABLE",
              evaluationMethod: "unavailable"
            };
          } else {
            const cardTimeLimit = cardData.timeLimit || cardData.timeLimitSeconds || null;
            const timerEntry = appState.startedRemoteTimers ? appState.startedRemoteTimers[`main:${cardData.id}`] : null;
            if (timerEntry || (typeof cardTimeLimit === "number" && cardTimeLimit > 0)) {
              if (timerEntry && timerEntry.status === "pending" && timerEntry.promise && typeof timerEntry.promise.then === "function") {
                await timerEntry.promise;
                if (sessionGeneration !== appState.remoteSessionGeneration) {
                  return;
                }
              }
              if (!timerEntry || timerEntry.status !== "started") {
                evalResult = {
                  success: false,
                  available: false,
                  isCorrect: false,
                  pointsEarned: 0,
                  maxPoints: cardData.points || 1,
                  feedback: "Hindi nasimulan ang opisyal na timer para sa tanong na ito. Pakisubukang muli.",
                  errorCode: "TIMER_NOT_STARTED",
                  evaluationMethod: "unavailable"
                };
              }
            }
          }
        }

        if (!evalResult) {
          if (typeof PANITIKARD_API_CLIENT !== "undefined" && typeof PANITIKARD_API_CLIENT.evaluateWrittenAnswer === "function") {
            evalResult = await PANITIKARD_API_CLIENT.evaluateWrittenAnswer({
              questionCode: cardData.id,
              studentAnswer: answerText,
              cardData,
              sessionId: activeSessionId,
              // Allow local rubric fallback only when no backend is configured (standalone classroom mode)
              allowOfflineDevFallback: !backendConfigured
            });
            if (sessionGeneration !== appState.remoteSessionGeneration) {
              return;
            }
          } else {
            evalResult = {
              success: false,
              available: false,
              isCorrect: false,
              pointsEarned: 0,
              maxPoints: cardData.points || 1,
              feedback: "Hindi maabot ang serbisyo ng AI para sa pagsusuri. Pakisubukang muli.",
              evaluationMethod: "unavailable"
            };
          }
        }
      }
    } catch (evalErr) {
      console.warn("[Main] Error during answer evaluation:", evalErr);
      evalResult = {
        success: false,
        available: false,
        isCorrect: false,
        pointsEarned: 0,
        maxPoints: cardData.points || 1,
        feedback: "Hindi maabot ang serbisyo ng AI para sa pagsusuri. Pakisubukang muli.",
        evaluationMethod: "unavailable"
      };
    } finally {
      appState.isEvaluatingAnswer = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnContent;
      }
      if (textarea) {
        textarea.disabled = false;
      }
    }

    function renderOpenCardError(msg) {
      const openCardForm = document.querySelector(".open-card-form");
      let errorContainer = document.getElementById("open-error-container");
      if (!errorContainer && openCardForm) {
        errorContainer = document.createElement("div");
        errorContainer.id = "open-error-container";
        errorContainer.className = "alert-box alert-error";
        errorContainer.style.marginTop = "8px";
        errorContainer.style.padding = "8px 12px";
        errorContainer.style.fontSize = "0.85rem";
        const submitRow = openCardForm.querySelector(".card-submit-row");
        if (submitRow) {
          openCardForm.insertBefore(errorContainer, submitRow);
        } else {
          openCardForm.appendChild(errorContainer);
        }
      }
      if (errorContainer) {
        errorContainer.classList.remove("hidden");
        errorContainer.innerHTML = `⚠️ <span>${msg}</span>`;
      }
    }

    // When backend is configured but Gemini evaluation failed: fail closed and allow retry.
    // When no backend is configured (standalone classroom mode): continue using local evaluator result.
    if (!isTimeout && (!evalResult || evalResult.available === false || evalResult.success === false)) {
      if (backendConfigured) {
        // Backend reachable but evaluation unavailable — keep fail-closed behavior and allow retry.
        renderOpenCardError(evalResult?.feedback || "Hindi maabot ang serbisyo ng pagsusuri para suriin ang iyong sagot. Pakisubukang muli ang pagsusumite.");
        return;
      }
      // No backend configured: use local rubric evaluator result as advisory scoring.
      // Standalone classroom mode — scoring is for formative purposes only.
      const localEval = evaluateOpenEndedAnswer(answerText, cardData);
      evalResult = {
        success: true,
        available: false,
        isCorrect: localEval.isCorrect,
        pointsEarned: localEval.isCorrect ? (cardData.points ?? 1) : 0,
        maxPoints: cardData.points || 1,
        feedback: localEval.isCorrect
          ? "Pagsusuring Lokal: Tugma ang sagot sa pamantayan ng rubric."
          : "Pagsusuring Lokal: Hindi naabot ang mga pamantayan ng rubric.",
        evaluationMethod: localEval.evaluationMethod || "local_rubric",
        criteriaEvaluation: []
      };
    }

    // Persist to authoritative backend session via submit_game_answer
    let officialRecord = null;
    try {
      officialRecord = await persistRemoteAnswer(cardData.id, answerText, "main", {
        isTimeout,
        timeLimit: cardData.timeLimit || cardData.timeLimitSeconds || null
      });
    } catch (persistErr) {
      console.warn("[Main] Failed to record answer to official game session:", persistErr.message);
      renderOpenCardError(`Hindi maitala ang opisyal na marka sa iyong sesyon (${persistErr.message || "Network Error"}). Pakisubukang muli.`);
      return;
    }

    // Require a valid official RPC response when a backend session is active.
    // When no backend is configured (standalone classroom mode), officialRecord is null and
    // we fall back to the local evaluator result — this is intentional and preserved.
    const rawPoints = typeof officialRecord?.pointsAwarded === "number"
      ? officialRecord.pointsAwarded
      : (typeof officialRecord?.answer?.pointsAwarded === "number" ? officialRecord.answer.pointsAwarded : null);
    const rawCorrect = typeof officialRecord?.isCorrect === "boolean"
      ? officialRecord.isCorrect
      : (typeof officialRecord?.answer?.isCorrect === "boolean" ? officialRecord.answer.isCorrect : null);

    const isOfficialValid = officialRecord &&
      typeof officialRecord === "object" &&
      rawPoints !== null &&
      Number.isFinite(rawPoints) &&
      rawPoints >= 0 &&
      rawCorrect !== null;

    // Backend session active but RPC response is invalid — fail closed and allow retry.
    // Standalone offline mode: officialRecord is null — use local evaluator result.
    if (!isOfficialValid && backendConfigured) {
      console.warn("[Main] Missing or invalid official RPC response from submit_game_answer:", officialRecord);
      renderOpenCardError("Hindi natanggap ang wastong opisyal na marka mula sa database. Pakisubukang muli.");
      return;
    }

    // Official score from submit_game_answer (backend) takes strict precedence.
    // In standalone offline mode, evalResult provides the local rubric score.
    const authoritativePoints = isOfficialValid ? rawPoints : evalResult.pointsEarned;
    const authoritativeCorrect = isOfficialValid ? rawCorrect : evalResult.isCorrect;

    const referenceAnswer = officialRecord?.correctAnswer ||
      evalResult?.expectedAnswer ||
      evalResult?.correctAnswer ||
      cardData.answer ||
      "";

    if (referenceAnswer && !cardData.answer) {
      cardData.answer = referenceAnswer;
    }

    appState.answers[cardData.id] = {
      cardId: cardData.id,
      type: cardData.type,
      number: cardData.number,
      tag: cardData.tag,
      title: cardData.title,
      prompt: cardData.prompt,
      userAnswer: answerText,
      correctAnswer: referenceAnswer,
      expectedAnswer: referenceAnswer,
      isCorrect: authoritativeCorrect,
      pointsEarned: authoritativePoints,
      maxPoints: cardData.points || 1,
      explanation: cardData.explanation,
      terms: cardData.terms,
      aiFeedback: evalResult.feedback || null,
      semanticScore: evalResult.semanticScore ?? null,
      confidenceScore: evalResult.confidenceScore ?? null,
      criteriaEvaluation: evalResult.criteriaEvaluation || [],
      evaluationMethod: officialRecord?.evaluationMethod || officialRecord?.answer?.evaluationMethod || evalResult.evaluationMethod || "submit_game_answer",
      evaluationContext: {
        question: cardData.prompt,
        expectedAnswer: referenceAnswer,
        rubricGroups: cardData.terms || [],
        studentAnswer: answerText
      },
      isTimeout: isTimeout,
      submittedAt: new Date().toISOString()
    };

    // Record incorrect question for Reverse Round
    if (!authoritativeCorrect) {
      const exists = appState.incorrectQuestions.some(item => item.id === cardData.id);
      if (!exists) {
        appState.incorrectQuestions.push({
          id: cardData.id,
          source: "card",
          title: cardData.title,
          question: cardData.prompt,
          category: cardData.tag || "Pagsusuri",
          questionType: "open_ended",
          choices: null,
          answer: referenceAnswer || cardData.answer,
          explanation: cardData.explanation,
          terms: cardData.terms,
          points: cardData.points || 1,
          timeLimit: cardData.timeLimit || null,
          originalCard: cardData
        });
      }
    }

    unlockNextIndex();
    renderCardByTypeIndex(appState.activeCardTypeIndex);
  }

  function unlockNextIndex() {
    const deck = (typeof PANITIKARD_DECKS !== "undefined") ? PANITIKARD_DECKS[appState.activeDeckId] : null;
    const maxIndex = deck && Array.isArray(deck.cards) && deck.cards.length > 0
      ? deck.cards.length - 1
      : 0;
    if (appState.activeCardTypeIndex >= appState.highestUnlockedIndex) {
      appState.highestUnlockedIndex = Math.min(appState.activeCardTypeIndex + 1, maxIndex);
    }
  }

  // ------------------------------------------------------------------------
  // 12. Challenge Card 30-Second Countdown Timer
  // ------------------------------------------------------------------------
  function startChallengeTimer(cardData, preserveRemaining = false) {
    stopChallengeTimer();

    if (!preserveRemaining || appState.challengeSecondsRemaining <= 0) {
      appState.challengeSecondsRemaining = cardData.timeLimit || 30;
    }
    if (cardData && cardData.id && typeof startRemoteTimer === "function") {
      startRemoteTimer(cardData.id, "main");
    }
    if (timerSeconds) {
      timerSeconds.textContent = String(appState.challengeSecondsRemaining);
    }
    if (frontTimerBadge) {
      frontTimerBadge.classList.remove("timer-warning");
    }

    appState.challengeTimerId = setInterval(() => {
      appState.challengeSecondsRemaining--;

      if (timerSeconds) {
        timerSeconds.textContent = String(appState.challengeSecondsRemaining);
      }

      if (appState.challengeSecondsRemaining <= 10 && frontTimerBadge) {
        frontTimerBadge.classList.add("timer-warning");
      }

      if (appState.challengeSecondsRemaining <= 0) {
        stopChallengeTimer();
        const textarea = document.getElementById("open-answer-input");
        const existingText = textarea ? textarea.value.trim() : "";
        const finalSubmission = existingText || "(Naubos ang 30 segundo / Walang naisulat)";
        submitOpenEndedAnswer(finalSubmission, cardData, true);
      }
    }, 1000);
  }

  function stopChallengeTimer() {
    if (appState.challengeTimerId) {
      clearInterval(appState.challengeTimerId);
      appState.challengeTimerId = null;
    }
    if (frontTimerBadge) {
      frontTimerBadge.classList.remove("timer-warning");
    }
  }

  // ------------------------------------------------------------------------
  // 13. 3D Card Flip Mechanics & Security
  // ------------------------------------------------------------------------
  function toggleCardFlip() {
    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck || !deck.cards[appState.activeCardTypeIndex]) return;

    const cardData = deck.cards[appState.activeCardTypeIndex];
    if (appState.answers[cardData.id]) return;
    interactiveCard.classList.toggle("is-flipped");
    const isNowFlipped = interactiveCard.classList.contains("is-flipped");
    interactiveCard.dataset.flipped = isNowFlipped ? "true" : "false";
    setActiveCardFace(interactiveCard, isNowFlipped);
    updateFlipControlsState(!!appState.answers[cardData.id]);

    if (cardData.timeLimit && !appState.answers[cardData.id]) {
      if (isNowFlipped) stopChallengeTimer();
      else startChallengeTimer(cardData, true);
    }
  }

  if (btnFlipCard) {
    btnFlipCard.addEventListener("click", toggleCardFlip);
  }

  if (interactiveCard) {
    interactiveCard.addEventListener("click", (e) => {
      if (e.target.closest("textarea, button, input, .option-pill, .card-feedback-panel, .uno-card-center-oval")) {
        return;
      }
      toggleCardFlip();
    });

    interactiveCard.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.target.closest("textarea")) {
        e.preventDefault();
        toggleCardFlip();
      }
    });
  }

  // ------------------------------------------------------------------------
  // 14. Toolbar Controls & Card Switching
  // ------------------------------------------------------------------------
  cardTypeTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      if (index > appState.highestUnlockedIndex) {
        interactiveCard.classList.remove("shake-card");
        void interactiveCard.offsetWidth;
        interactiveCard.classList.add("shake-card");
        return;
      }
      renderCardByTypeIndex(index);
    });
  });

  if (btnPrevCard) {
    btnPrevCard.addEventListener("click", () => {
      if (appState.activeCardTypeIndex > 0) {
        renderCardByTypeIndex(appState.activeCardTypeIndex - 1);
      }
    });
  }

  if (btnNextCard) {
    btnNextCard.addEventListener("click", () => {
      const deck = (typeof PANITIKARD_DECKS !== "undefined") ? PANITIKARD_DECKS[appState.activeDeckId] : null;
      if (!deck || !deck.cards) return;
      const currentCard = deck.cards[appState.activeCardTypeIndex];
      const isSubmitted = currentCard && !!appState.answers[currentCard.id];
      if (!isSubmitted) return;

      const totalCards = deck.cards.length;
      if (appState.activeCardTypeIndex < totalCards - 1) {
        renderCardByTypeIndex(appState.activeCardTypeIndex + 1);
      } else {
        // Last card completed -> Check for Reverse Round eligibility
        if (!appState.reverseRoundCompleted && appState.incorrectQuestions.length > 0) {
          showReverseIntro();
        } else {
          renderResultScreen();
          navigateToScreen(screens.result);
        }
      }
    });
  }

  if (btnBackToDeck) {
    btnBackToDeck.addEventListener("click", () => {
      stopChallengeTimer();
      navigateToScreen(screens.deck);
    });
  }

  if (btnCrumbDeck) {
    btnCrumbDeck.addEventListener("click", () => {
      stopChallengeTimer();
      navigateToScreen(screens.deck);
    });
  }

  // ------------------------------------------------------------------------
  // 15. Screen 2.5: Interactive 15-Question Quiz Engine (Alamat & Maikling Kuwento)
  // ------------------------------------------------------------------------
  function normalizeQuizString(str) {
    if (typeof str !== "string") return "";
    return str
      .trim()
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "")
      .replace(/\s+/g, " ");
  }

  function checkQuizAnswer(question, studentInput) {
    if (studentInput === null || studentInput === undefined) return false;
    const qType = question.questionType;
    const normalizedInput = normalizeQuizString(studentInput);
    if (!normalizedInput) return false;

    if (["identification", "fill_in_blank", "situational"].includes(qType)) {
      return PANITIKARD_ANSWER_EVALUATOR.evaluateWrittenAnswer({
        studentAnswer: studentInput,
        expectedAnswer: question.answer,
        acceptedAnswers: question.acceptedAnswers || [],
        rubricGroups: question.rubricGroups || [],
        questionId: question.id
      }).isCorrect;
    }

    // 1. Multiple Choice
    if (qType === "multiple_choice") {
      const normUser = studentInput.trim().toUpperCase();
      const normAns = question.answer.trim().toUpperCase();
      if (normUser === normAns) return true;
      if (Array.isArray(question.choices)) {
        const matchedChoice = question.choices.find(c => c.key.toUpperCase() === normAns);
        if (matchedChoice && normalizeQuizString(matchedChoice.text) === normalizedInput) {
          return true;
        }
      }
      return false;
    }

    // 2. True or False
    if (qType === "true_false") {
      const normUser = studentInput.trim().toLowerCase();
      const normAns = question.answer.trim().toLowerCase();
      if (normUser === normAns) return true;
      if (normAns === "true" && (normUser === "tama" || normUser === "t")) return true;
      if (normAns === "false" && (normUser === "mali" || normUser === "m")) return true;
      return false;
    }

    return false;
  }

  function shuffleQuestions(array) {
    const arr = array.map(q => ({ ...q }));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function startQuiz(quizId) {
    const quizDeck = PANITIKARD_DECKS[quizId];
    if (!quizDeck || !Array.isArray(quizDeck.questions)) {
      console.error("Quiz deck questions not found for:", quizId);
      return;
    }

    appState.lastPlayedMode = "quiz";
    appState.incorrectQuestions = [];
    appState.reverseRoundCompleted = false;

    // Reset reverse state
    stopReverseTimer();
    reverseState.selectedQuestions = [];
    reverseState.maxAttempts = 3;
    reverseState.attemptsRemaining = 3;
    reverseState.currentIndex = 0;
    reverseState.pointsEarned = 0;
    reverseState.answers = {};
    reverseState.selectedOption = null;
    reverseState.isSubmitted = false;
    reverseState.timerId = null;
    reverseState.secondsRemaining = 0;

    quizState.activeQuizId = quizId;
    beginRemoteGameSession(quizId, "quiz");
    quizState.questions = shuffleQuestions(quizDeck.questions);
    quizState.currentIndex = 0;
    quizState.currentScore = 0;
    quizState.maxScore = quizState.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    quizState.userAnswers = {};
    quizState.selectedOption = null;
    quizState.isSubmitted = false;

    if (quizStudentName) quizStudentName.textContent = appState.studentName || "Mag-aaral";
    if (quizLessonBadge) quizLessonBadge.textContent = quizDeck.title;
    if (quizMaxScore) quizMaxScore.textContent = String(quizState.maxScore);
    if (quizCurrentScore) quizCurrentScore.textContent = "0";

    navigateToScreen(screens.quiz);
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    if (!q) return;

    quizState.selectedOption = null;
    quizState.isSubmitted = false;

    const quizTimeLimit = getQuestionTimeLimit(q);
    if (quizTimeLimit && q.id && typeof startRemoteTimer === "function") {
      startRemoteTimer(q.id, "main");
    }

    const currentNum = quizState.currentIndex + 1;
    const totalNum = quizState.questions.length;
    const pct = Math.round((currentNum / totalNum) * 100);

    if (quizQuestionCounter) quizQuestionCounter.textContent = `Tanong ${currentNum} / ${totalNum}`;
    if (quizProgressBarFill) quizProgressBarFill.style.width = `${pct}%`;

    if (quizDifficultyBadge) {
      quizDifficultyBadge.className = "difficulty-pill";
      if (q.difficulty === "easy") {
        quizDifficultyBadge.classList.add("pill-easy");
        quizDifficultyBadge.textContent = "Madali \u2022 1 pt";
      } else if (q.difficulty === "hard") {
        quizDifficultyBadge.classList.add("pill-hard");
        quizDifficultyBadge.textContent = "Mahirap \u2022 3 pts";
      } else {
        quizDifficultyBadge.classList.add("pill-average");
        quizDifficultyBadge.textContent = "Katamtaman \u2022 2 pts";
      }
    }

    if (quizCategoryBadge) quizCategoryBadge.textContent = "Tanong";
    if (quizTypeBadge) {
      const typeLabels = {
        multiple_choice: "Maramihang Pagpipilian",
        identification: "Pagtukoy",
        true_false: "Tama o Mali",
        fill_in_blank: "Punan ang Patlang",
        situational: "Sitwasyonal"
      };
      quizTypeBadge.textContent = `${q.category || "Pampanitikan"} · ${typeLabels[q.questionType] || q.questionType}`;
    }

    if (quizQuestionText) quizQuestionText.textContent = q.question;

    if (quizAlertBox) quizAlertBox.classList.add("hidden");
    if (quizFeedbackBox) quizFeedbackBox.classList.add("hidden");
    if (quizSubmitWrapper) quizSubmitWrapper.classList.remove("hidden");
    if (btnQuizSubmit) btnQuizSubmit.disabled = false;

    if (quizInputContainer) {
      quizInputContainer.innerHTML = "";

      if (q.questionType === "multiple_choice") {
        const grid = document.createElement("div");
        grid.className = "quiz-mc-grid";
        const mcChoices = Array.isArray(q.choices) ? q.choices : [];

        if (mcChoices.length === 0 && btnQuizSubmit) {
          btnQuizSubmit.disabled = true;
        }

        mcChoices.forEach((c) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "quiz-mc-option";
          btn.dataset.key = c.key;
          btn.innerHTML = `
            <span class="quiz-option-key">${c.key}</span>
            <span class="quiz-option-text">${escapeHtml(c.text)}</span>
          `;
          btn.addEventListener("click", () => {
            if (quizState.isSubmitted) return;
            quizState.selectedOption = c.key;
            grid.querySelectorAll(".quiz-mc-option").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            if (quizAlertBox) quizAlertBox.classList.add("hidden");
          });
          grid.appendChild(btn);
        });
        quizInputContainer.appendChild(grid);
      } else if (q.questionType === "true_false") {
        const group = document.createElement("div");
        group.className = "quiz-tf-group";

        const tfChoices = [
          { val: "True", icon: "✓", label: "Tama (True)" },
          { val: "False", icon: "✗", label: "Mali (False)" }
        ];

        tfChoices.forEach((t) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "quiz-tf-btn";
          btn.dataset.val = t.val;
          btn.innerHTML = `
            <span class="quiz-tf-icon">${t.icon}</span>
            <span>${t.label}</span>
          `;
          btn.addEventListener("click", () => {
            if (quizState.isSubmitted) return;
            quizState.selectedOption = t.val;
            group.querySelectorAll(".quiz-tf-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            if (quizAlertBox) quizAlertBox.classList.add("hidden");
          });
          group.appendChild(btn);
        });
        quizInputContainer.appendChild(group);
      } else if (q.questionType === "identification" || q.questionType === "fill_in_blank") {
        const wrap = document.createElement("div");
        wrap.className = "quiz-text-input-wrap";
        wrap.innerHTML = `
          <input type="text" id="quiz-text-answer" class="quiz-text-input" placeholder="Isulat dito ang iyong sagot (isang salita)..." autocomplete="off">
          <span class="quiz-input-hint-text">Isang salita lamang ang inaasahang sagot. Tiyakin ang tamang baybay.</span>
        `;
        const inputEl = wrap.querySelector("#quiz-text-answer");
        inputEl.addEventListener("input", () => {
          if (quizAlertBox) quizAlertBox.classList.add("hidden");
        });
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleQuizSubmission();
          }
        });
        quizInputContainer.appendChild(wrap);
        setTimeout(() => inputEl.focus(), 100);
      } else if (q.questionType === "situational") {
        const wrap = document.createElement("div");
        wrap.className = "quiz-text-input-wrap";
        wrap.innerHTML = `
          <input type="text" id="quiz-text-answer" class="quiz-text-input" placeholder="Isulat dito ang iyong sagot batay sa sitwasyon..." autocomplete="off">
          <span class="quiz-input-hint-text">Maaaring isang salita o maikling parirala (hal. Alamat ng hayop).</span>
        `;
        const inputEl = wrap.querySelector("#quiz-text-answer");
        inputEl.addEventListener("input", () => {
          if (quizAlertBox) quizAlertBox.classList.add("hidden");
        });
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleQuizSubmission();
          }
        });
        quizInputContainer.appendChild(wrap);
        setTimeout(() => inputEl.focus(), 100);
      }
    }
  }

  function handleQuizSubmission() {
    if (quizState.isSubmitted) return;

    const q = quizState.questions[quizState.currentIndex];
    if (!q) return;

    let studentInput = null;

    if (q.questionType === "multiple_choice" || q.questionType === "true_false") {
      studentInput = quizState.selectedOption;
    } else {
      const textInput = document.getElementById("quiz-text-answer");
      studentInput = textInput ? textInput.value.trim() : "";
    }

    if (!studentInput) {
      if (quizAlertBox) {
        quizAlertBox.classList.remove("hidden");
        const alertText = quizAlertBox.querySelector("#quiz-alert-text");
        if (alertText) alertText.textContent = "Pakilagay o piliin ang iyong sagot bago magpatuloy.";
      }
      return;
    }

    const quizTimeLimit = getQuestionTimeLimit(q);
    const backendActive = Boolean(
      window.PANITIKARD_GAME_API &&
      window.PANITIKARD_GAME_API.enabled &&
      appState.remoteSessionPromise
    );
    if (backendActive && quizTimeLimit) {
      const timerEntry = appState.startedRemoteTimers ? appState.startedRemoteTimers[`main:${q.id}`] : null;
      if (!timerEntry || timerEntry.status === "failed") {
        if (quizAlertBox) {
          quizAlertBox.classList.remove("hidden");
          const alertText = quizAlertBox.querySelector("#quiz-alert-text");
          if (alertText) alertText.textContent = "Hindi nasimulan ang opisyal na timer para sa tanong na ito. Pakisubukang muli.";
        }
        return;
      }
    }

    quizState.isSubmitted = true;

    if (btnQuizSubmit) btnQuizSubmit.disabled = true;
    if (quizSubmitWrapper) quizSubmitWrapper.classList.add("hidden");

    const allInputs = quizInputContainer.querySelectorAll("input, button");
    allInputs.forEach(el => el.disabled = true);

    const isCorrect = checkQuizAnswer(q, studentInput);
    const pointsEarned = isCorrect ? (q.points || 1) : 0;
    quizState.currentScore += pointsEarned;

    if (quizCurrentScore) {
      quizCurrentScore.textContent = String(quizState.currentScore);
    }

    if (q.questionType === "multiple_choice") {
      const opts = quizInputContainer.querySelectorAll(".quiz-mc-option");
      opts.forEach(opt => {
        const key = opt.dataset.key;
        if (key === q.answer) opt.classList.add("opt-correct");
        if (key === studentInput && !isCorrect) opt.classList.add("opt-incorrect");
      });
    } else if (q.questionType === "true_false") {
      const btns = quizInputContainer.querySelectorAll(".quiz-tf-btn");
      btns.forEach(btn => {
        const val = btn.dataset.val;
        if (val.toLowerCase() === q.answer.toLowerCase()) btn.classList.add("opt-correct");
        if (val === studentInput && !isCorrect) btn.classList.add("opt-incorrect");
      });
    }

    let correctDisplay = resolveCorrectAnswerDisplay(q.answer, q.choices) || q.answer || "";

    // Record quiz answer
    quizState.userAnswers[q.id] = {
      question: q.question,
      category: q.category,
      questionType: q.questionType,
      userAnswer: studentInput,
      correctAnswer: correctDisplay,
      isCorrect,
      pointsEarned,
      maxPoints: q.points || 1,
      explanation: q.explanation,
      evaluationMethod: ["identification", "fill_in_blank", "situational"].includes(q.questionType) ? "local_rubric" : "answer_key",
      evaluationContext: ["identification", "fill_in_blank", "situational"].includes(q.questionType) ? {
        question: q.question,
        expectedAnswer: q.answer,
        acceptedAnswers: q.acceptedAnswers || [],
        rubricGroups: PANITIKARD_ANSWER_EVALUATOR.quizRubrics[q.id] || q.rubricGroups || [],
        studentAnswer: studentInput
      } : null
    };
    const persistPromise = persistRemoteAnswer(q.id, studentInput, "main", { timeLimit: quizTimeLimit });
    if (persistPromise && typeof persistPromise.catch === "function") {
      persistPromise.then((officialResult) => {
        if (officialResult) {
          const rec = quizState.userAnswers[q.id];
          if (rec) {
            if (typeof officialResult.isCorrect === "boolean") rec.isCorrect = officialResult.isCorrect;
            if (typeof officialResult.pointsAwarded === "number") rec.pointsEarned = officialResult.pointsAwarded;
            if (officialResult.correctAnswer) {
              rec.correctAnswer = resolveCorrectAnswerDisplay(officialResult.correctAnswer, q.choices);
            }
          }
          if (officialResult.correctAnswer) {
            q.answer = officialResult.correctAnswer;
          }
        }
      }).catch((err) => {
        if (quizTimeLimit && appState.startedRemoteTimers?.[`main:${q.id}`]?.status === "failed") {
          quizState.currentScore = Math.max(0, quizState.currentScore - pointsEarned);
          delete quizState.userAnswers[q.id];
          if (quizCurrentScore) quizCurrentScore.textContent = String(quizState.currentScore);
        }
        console.warn("[Quiz] Official answer persistence failed:", err.message);
      });
    }

    // Record incorrect question for Reverse Round
    if (!isCorrect) {
      const exists = appState.incorrectQuestions.some(item => item.id === q.id);
      if (!exists) {
        appState.incorrectQuestions.push({
          id: q.id,
          source: "quiz",
          title: `${q.category || "Pampanitikan"} - Tanong #${quizState.currentIndex + 1}`,
          question: q.question,
          category: q.category || "Pampanitikan",
          questionType: q.questionType,
          choices: q.choices ? [...q.choices] : null,
          answer: q.answer,
          acceptedAnswers: q.acceptedAnswers ? [...q.acceptedAnswers] : null,
          rubricGroups: PANITIKARD_ANSWER_EVALUATOR.quizRubrics[q.id] || [],
          explanation: q.explanation,
          points: q.points || 1,
          timeLimit: q.timeLimit || q.timeLimitSeconds || null,
          difficulty: q.difficulty || "average"
        });
      }
    }

    // Populate Feedback Box
    if (quizFeedbackBox) {
      quizFeedbackBox.className = `quiz-feedback-box ${isCorrect ? "correct" : "incorrect"}`;
      if (quizFeedbackHeader) {
        quizFeedbackHeader.className = `feedback-header ${isCorrect ? "feedback-correct" : "feedback-incorrect"}`;
      }
      if (quizFeedbackIcon) quizFeedbackIcon.textContent = isCorrect ? "✓" : "✗";
      if (quizFeedbackStatus) quizFeedbackStatus.textContent = isCorrect ? "TAMA!" : "MALI";
      if (quizFeedbackPoints) {
        quizFeedbackPoints.textContent = isCorrect 
          ? `+${pointsEarned} ${pointsEarned > 1 ? "Puntos" : "Punto"}`
          : "0 Punto";
      }
      if (quizFeedbackCorrectAnswer) quizFeedbackCorrectAnswer.textContent = correctDisplay;
      if (quizFeedbackExplanation) quizFeedbackExplanation.textContent = q.explanation;
      const rubricGroups = PANITIKARD_ANSWER_EVALUATOR.quizRubrics[q.id] || q.rubricGroups || [];
      if (quizFeedbackKeywordsWrap && quizFeedbackKeywords) {
        quizFeedbackKeywordsWrap.classList.toggle("hidden", !rubricGroups.length);
        quizFeedbackKeywords.textContent = rubricGroups.map(group => group.join(" / ")).join(" • ");
      }

      const isLastQuestion = quizState.currentIndex === quizState.questions.length - 1;
      if (quizNextBtnText) {
        if (isLastQuestion) {
          quizNextBtnText.textContent = (!appState.reverseRoundCompleted && appState.incorrectQuestions.length > 0)
            ? "Tungo sa Reverse Round 🔁"
            : "Tingnan ang Kabuuang Resulta";
        } else {
          quizNextBtnText.textContent = "Susunod na Tanong";
        }
      }

      quizFeedbackBox.classList.remove("hidden");
      quizFeedbackBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  if (btnQuizSubmit) {
    btnQuizSubmit.addEventListener("click", handleQuizSubmission);
  }

  if (btnQuizNext) {
    btnQuizNext.addEventListener("click", () => {
      if (quizState.currentIndex < quizState.questions.length - 1) {
        quizState.currentIndex++;
        renderQuizQuestion();
      } else {
        // Quiz completed -> Check for Reverse Round eligibility
        if (!appState.reverseRoundCompleted && appState.incorrectQuestions.length > 0) {
          showReverseIntro();
        } else {
          renderQuizResults();
        }
      }
    });
  }

  if (btnQuizBackDecks) {
    btnQuizBackDecks.addEventListener("click", () => {
      navigateToScreen(screens.deck);
    });
  }

  // ------------------------------------------------------------------------
  // 16. Reverse Round Implementation (Screens 3.7 & 3.8)
  // ------------------------------------------------------------------------
  /**
   * Displays the Reverse Round introduction screen.
   */
  function showReverseIntro() {
    stopChallengeTimer();
    const count = appState.incorrectQuestions.length;
    if (reverseEligibleCount) {
      reverseEligibleCount.textContent = String(count);
    }
    if (reverseAttemptLimitLabel) {
      if (count === 1) {
        reverseAttemptLimitLabel.textContent = "(Mayroon kang 1 pagsubok)";
      } else if (count === 2) {
        reverseAttemptLimitLabel.textContent = "(Mayroon kang 2 pagsubok)";
      } else {
        reverseAttemptLimitLabel.textContent = "(Hanggang 3 ang mapipili)";
      }
    }
    navigateToScreen(screens.reverseIntro);
  }

  /**
   * Initializes Reverse Round with up to 3 randomly selected incorrect questions.
   */
  function startReverseRound() {
    stopReverseTimer();
    if (appState.incorrectQuestions.length === 0) {
      finishReverseRound();
      return;
    }

    // Question Selection Rules:
    // Maximum 3 attempts for entire game. Random selection happens once.
    const pool = shuffleQuestions(appState.incorrectQuestions);
    const maxAllowed = Math.min(3, pool.length);
    reverseState.selectedQuestions = pool.slice(0, maxAllowed);
    reverseState.maxAttempts = maxAllowed;
    reverseState.attemptsRemaining = maxAllowed;
    reverseState.currentIndex = 0;
    reverseState.pointsEarned = 0;
    reverseState.answers = {};
    reverseState.selectedOption = null;
    reverseState.isSubmitted = false;
    reverseState.timerId = null;
    reverseState.secondsRemaining = 0;

    navigateToScreen(screens.reverse);
    renderReverseCard();
  }

  function updateReverseAttemptUI() {
    if (reverseAttemptText) {
      reverseAttemptText.textContent = `${reverseState.attemptsRemaining}/${reverseState.maxAttempts} natitira`;
    }
    if (reverseAttemptDots) {
      reverseAttemptDots.innerHTML = "";
      for (let i = 0; i < reverseState.maxAttempts; i++) {
        const dot = document.createElement("span");
        dot.className = `attempt-dot ${i < reverseState.attemptsRemaining ? "active" : ""}`;
        reverseAttemptDots.appendChild(dot);
      }
    }
  }

  // ------------------------------------------------------------------------
  // Reverse Round Countdown Timer Helpers
  // ------------------------------------------------------------------------
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
    if (q && q.id && typeof startRemoteTimer === "function") {
      startRemoteTimer(q.id, "reverse");
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
    let timeoutAnswer = "";
    if (currentQ?.questionType === "multiple_choice" || currentQ?.questionType === "true_false") {
      timeoutAnswer = reverseState.selectedOption || "(Naubos ang 30 segundo / Walang napili)";
    } else {
      const inputEl = document.getElementById("reverse-text-answer");
      const existing = inputEl ? inputEl.value.trim() : "";
      timeoutAnswer = existing || "(Naubos ang 30 segundo / Walang naisulat)";
    }
    handleReverseSubmit(true, timeoutAnswer);
  }

  function toggleReverseCardFlip() {
    if (!reverseCard || reverseState.isSubmitted) return;
    reverseCard.classList.toggle("is-flipped");
    const isNowFlipped = reverseCard.classList.contains("is-flipped");
    reverseCard.dataset.flipped = isNowFlipped ? "true" : "false";
    setActiveCardFace(reverseCard, isNowFlipped);
    if (reverseSubmitWrap) reverseSubmitWrap.classList.toggle("hidden", isNowFlipped);

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

  /**
   * Renders the Special Red Reverse Card with the current question.
   */
  function renderReverseCard() {
    stopReverseTimer();
    const q = reverseState.selectedQuestions[reverseState.currentIndex];
    if (!q) {
      finishReverseRound();
      return;
    }

    reverseState.selectedOption = null;
    reverseState.isSubmitted = false;

    // Time limit setup
    const timeLimit = getQuestionTimeLimit(q);
    if (timeLimit) {
      reverseState.secondsRemaining = timeLimit;
      updateReverseTimerDisplay(timeLimit, false);
      setReverseTimerVisible(true);
    } else {
      reverseState.secondsRemaining = 0;
      setReverseTimerVisible(false);
    }

    // Each second-chance question starts on the green branded back.
    if (reverseCard) {
      reverseCard.classList.add("is-flipped");
      reverseCard.dataset.flipped = "true";
      setActiveCardFace(reverseCard, true);
    }
    if (reverseCardBackBrandContent) reverseCardBackBrandContent.classList.remove("hidden");

    // Update Attempt Counter & Dots
    updateReverseAttemptUI();

    // Score badge
    if (reverseScoreText) {
      reverseScoreText.textContent = `+${reverseState.pointsEarned} Puntos`;
    }

    // Card Header & Front Meta
    if (reverseCardNum) {
      reverseCardNum.textContent = `0${reverseState.currentIndex + 1}`;
    }
    if (reverseCardCategoryBadge) {
      reverseCardCategoryBadge.textContent = "Baligtaran";
    }
    if (reverseCardTitle) {
      reverseCardTitle.textContent = q.title || `Subukan Muli ang Tanong #${reverseState.currentIndex + 1}`;
    }
    if (reverseCardPrompt) {
      reverseCardPrompt.textContent = q.question;
    }

    // Reset alert and feedback boxes
    if (reverseAlertBox) reverseAlertBox.classList.add("hidden");
    if (reverseFeedbackBox) reverseFeedbackBox.classList.add("hidden");
    if (reverseSubmitWrap) reverseSubmitWrap.classList.add("hidden");
    if (btnReverseSubmit) btnReverseSubmit.disabled = false;

    // Render Options / Inputs
    if (reverseCardOptions) {
      reverseCardOptions.innerHTML = "";
      reverseCardOptions.className = q.questionType === "multiple_choice" || q.questionType === "true_false"
        ? "card-options-grid"
        : "card-options-open";

      // 1. Multiple Choice
      if (q.questionType === "multiple_choice" && Array.isArray(q.choices) && q.choices.length > 0) {
        const grid = document.createElement("div");
        grid.className = "quiz-mc-grid";

        q.choices.forEach((c) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "quiz-mc-option";
          btn.dataset.key = c.key;
          btn.innerHTML = `
            <span class="quiz-option-key">${c.key}</span>
            <span class="quiz-option-text">${escapeHtml(c.text)}</span>
          `;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (reverseState.isSubmitted) return;
            reverseState.selectedOption = c.key;
            grid.querySelectorAll(".quiz-mc-option").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            if (reverseAlertBox) reverseAlertBox.classList.add("hidden");
          });
          grid.appendChild(btn);
        });
        reverseCardOptions.appendChild(grid);
      }
      // 2. True or False
      else if (q.questionType === "true_false") {
        const group = document.createElement("div");
        group.className = "quiz-tf-group";

        const tfChoices = [
          { val: "True", icon: "✓", label: "Tama (True)" },
          { val: "False", icon: "✗", label: "Mali (False)" }
        ];

        tfChoices.forEach((t) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "quiz-tf-btn";
          btn.dataset.val = t.val;
          btn.innerHTML = `
            <span class="quiz-tf-icon">${t.icon}</span>
            <span>${t.label}</span>
          `;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (reverseState.isSubmitted) return;
            reverseState.selectedOption = t.val;
            group.querySelectorAll(".quiz-tf-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
            if (reverseAlertBox) reverseAlertBox.classList.add("hidden");
          });
          group.appendChild(btn);
        });
        reverseCardOptions.appendChild(group);
      }
      // 3. Open-Ended (from Arena Decks)
      else if (q.questionType === "open_ended") {
        const wrap = document.createElement("div");
        wrap.className = "open-card-form";
        wrap.innerHTML = `
          <textarea id="reverse-text-answer" class="open-card-textarea"
            placeholder="Isulat dito ang iyong sagot o pagwawasto..." rows="2" maxlength="280"></textarea>
          <span class="quiz-input-hint-text">Ipaliwanag o iwasto ang pahayag gamit ang mga angkop na salita.</span>
        `;
        const textarea = wrap.querySelector("#reverse-text-answer");
        textarea.addEventListener("click", (e) => e.stopPropagation());
        textarea.addEventListener("input", () => {
          if (reverseAlertBox) reverseAlertBox.classList.add("hidden");
        });
        textarea.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleReverseSubmit();
          }
        });
        reverseCardOptions.appendChild(wrap);
      }
      // 4. Identification, Fill in the Blank, Situational
      else {
        const wrap = document.createElement("div");
        wrap.className = "quiz-text-input-wrap";
        const isSingleWord = q.questionType === "identification" || q.questionType === "fill_in_blank";
        wrap.innerHTML = `
          <input type="text" id="reverse-text-answer" class="quiz-text-input"
            placeholder="${isSingleWord ? "Isulat dito ang iyong sagot (isang salita)..." : "Isulat dito ang iyong sagot batay sa sitwasyon..."}" autocomplete="off">
          <span class="quiz-input-hint-text">${isSingleWord ? "Isang salita lamang ang inaasahang sagot." : "Maaaring isang salita o maikling parirala."}</span>
        `;
        const inputEl = wrap.querySelector("#reverse-text-answer");
        inputEl.addEventListener("click", (e) => e.stopPropagation());
        inputEl.addEventListener("input", () => {
          if (reverseAlertBox) reverseAlertBox.classList.add("hidden");
        });
        inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleReverseSubmit();
          }
        });
        reverseCardOptions.appendChild(wrap);
      }
    }
  }

  /**
   * Handles Reverse Round submission, evaluates response, and updates attempts.
   */
  function handleReverseSubmit(isTimeout = false, forcedInput = null) {
    stopReverseTimer();
    if (reverseState.isSubmitted) return;
    if (reverseState.attemptsRemaining <= 0) return;

    const q = reverseState.selectedQuestions[reverseState.currentIndex];
    if (!q) return;

    if (!isTimeout && reverseCard && reverseCard.classList.contains("is-flipped")) {
      if (reverseAlertBox) reverseAlertBox.classList.remove("hidden");
      if (reverseAlertText) reverseAlertText.textContent = "I-tap muna ang berdeng likod ng kard upang makita ang tanong.";
      return;
    }

    let studentInput = null;
    if (isTimeout) {
      studentInput = forcedInput || "(Naubos ang 30 segundo / Walang sagot)";
    } else if (q.questionType === "multiple_choice" || q.questionType === "true_false") {
      studentInput = reverseState.selectedOption;
    } else {
      const inputEl = document.getElementById("reverse-text-answer");
      studentInput = inputEl ? inputEl.value.trim() : "";
    }

    if (!studentInput) {
      if (reverseAlertBox) {
        reverseAlertBox.classList.remove("hidden");
        if (reverseAlertText) {
          reverseAlertText.textContent = "Pakilagay o piliin ang iyong sagot bago mag-submit.";
        }
      }
      return;
    }

    const revTimeLimit = getQuestionTimeLimit(q);
    const backendActive = Boolean(
      window.PANITIKARD_GAME_API &&
      window.PANITIKARD_GAME_API.enabled &&
      appState.remoteSessionPromise
    );
    if (backendActive && revTimeLimit) {
      const timerEntry = appState.startedRemoteTimers ? appState.startedRemoteTimers[`reverse:${q.id}`] : null;
      if (!timerEntry || timerEntry.status === "failed") {
        if (reverseAlertBox) reverseAlertBox.classList.remove("hidden");
        if (reverseAlertText) {
          reverseAlertText.textContent = "Hindi nasimulan ang opisyal na timer para sa tanong na ito. Pakisubukang muli.";
        }
        return;
      }
    }

    reverseState.isSubmitted = true;
    reverseState.attemptsRemaining = Math.max(0, reverseState.attemptsRemaining - 1);
    updateReverseAttemptUI();

    // Lock inputs & hide submit button
    if (btnReverseSubmit) btnReverseSubmit.disabled = true;
    if (reverseSubmitWrap) reverseSubmitWrap.classList.add("hidden");
    if (reverseCardOptions) {
      const inputs = reverseCardOptions.querySelectorAll("input, button, textarea");
      inputs.forEach(el => el.disabled = true);
    }

    // Evaluate response
    let isCorrect = false;
    let pointsEarned = 0;

    if (isTimeout) {
      isCorrect = false;
      pointsEarned = 0;
    } else if (q.questionType === "open_ended") {
      const evalResult = evaluateOpenEndedAnswer(studentInput, q.originalCard || q);
      isCorrect = evalResult.isCorrect;
      pointsEarned = isCorrect ? (q.points || 1) : 0;
    } else {
      isCorrect = checkQuizAnswer(q, studentInput);
      pointsEarned = isCorrect ? (q.points || 1) : 0;
    }

    if (isCorrect) {
      reverseState.pointsEarned += pointsEarned;
      if (reverseScoreText) {
        reverseScoreText.textContent = `+${reverseState.pointsEarned} Puntos`;
      }
    }

    // Highlight choices visually
    if (q.questionType === "multiple_choice" && reverseCardOptions) {
      const opts = reverseCardOptions.querySelectorAll(".quiz-mc-option");
      opts.forEach(opt => {
        const key = opt.dataset.key;
        if (key === q.answer) opt.classList.add("opt-correct");
        if (key === studentInput && !isCorrect) opt.classList.add("opt-incorrect");
      });
    } else if (q.questionType === "true_false" && reverseCardOptions) {
      const btns = reverseCardOptions.querySelectorAll(".quiz-tf-btn");
      btns.forEach(btn => {
        const val = btn.dataset.val;
        if (val.toLowerCase() === q.answer.toLowerCase()) btn.classList.add("opt-correct");
        if (val === studentInput && !isCorrect) btn.classList.add("opt-incorrect");
      });
    }

    // Correct Answer Display Text
    const reverseChoices = q.choices || (q.originalCard && q.originalCard.options);
    let correctDisplay = resolveCorrectAnswerDisplay(q.answer, reverseChoices) || q.answer || "";

    // Record reverse attempt separately (main round records remain untouched)
    reverseState.answers[q.id] = {
      questionId: q.id,
      question: q.question,
      category: q.category,
      questionType: q.questionType,
      userAnswer: studentInput,
      correctAnswer: correctDisplay,
      isCorrect: isCorrect,
      pointsEarned: pointsEarned,
      maxPoints: q.points || 1,
      explanation: q.explanation,
      isTimeout: isTimeout === true,
      evaluationMethod: isTimeout ? "timeout" : (q.questionType === "open_ended" || ["identification", "fill_in_blank", "situational"].includes(q.questionType)
        ? "local_rubric"
        : "answer_key"),
      evaluationContext: q.questionType === "open_ended" || ["identification", "fill_in_blank", "situational"].includes(q.questionType) ? {
        question: q.question,
        expectedAnswer: q.answer,
        acceptedAnswers: q.acceptedAnswers || [],
        rubricGroups: q.terms || q.rubricGroups || (q.originalCard && q.originalCard.terms) || [],
        studentAnswer: studentInput
      } : null
    };
    const persistPromise = persistRemoteAnswer(q.id, studentInput, "reverse", { isTimeout, timeLimit: revTimeLimit });
    if (persistPromise && typeof persistPromise.catch === "function") {
      persistPromise.then((officialResult) => {
        if (officialResult) {
          const revRec = reverseState.answers[q.id];
          if (revRec) {
            if (typeof officialResult.isCorrect === "boolean") revRec.isCorrect = officialResult.isCorrect;
            if (typeof officialResult.pointsAwarded === "number") revRec.pointsEarned = officialResult.pointsAwarded;
            if (officialResult.correctAnswer) {
              revRec.correctAnswer = resolveCorrectAnswerDisplay(officialResult.correctAnswer, reverseChoices);
            }
          }
          if (officialResult.correctAnswer) {
            q.answer = officialResult.correctAnswer;
          }
        }
      }).catch((err) => {
        if (revTimeLimit && appState.startedRemoteTimers?.[`reverse:${q.id}`]?.status === "failed") {
          if (isCorrect) {
            reverseState.pointsEarned = Math.max(0, reverseState.pointsEarned - pointsEarned);
            if (reverseScoreText) reverseScoreText.textContent = `+${reverseState.pointsEarned} Puntos`;
          }
          delete reverseState.answers[q.id];
        }
        console.warn("[Reverse] Official answer persistence failed:", err.message);
      });
    }

    // Render Formative Feedback Box
    if (reverseFeedbackBox) {
      reverseFeedbackBox.className = `card-feedback-panel ${isCorrect ? "feedback-panel-correct" : "feedback-panel-incorrect"}`;
      if (reverseFeedbackHeader) {
        reverseFeedbackHeader.className = `card-feedback-head ${isCorrect ? "feedback-correct" : "feedback-incorrect"}`;
      }
      if (reverseFeedbackIcon) {
        reverseFeedbackIcon.textContent = isTimeout ? "⏱️" : (isCorrect ? "✓" : "✗");
      }
      if (reverseFeedbackStatus) {
        reverseFeedbackStatus.textContent = isTimeout ? "NAUBOS ANG ORAS!" : (isCorrect ? "TAMA SA REVERSE ROUND!" : "HINDI TUMUGMA");
      }
      if (reverseFeedbackPoints) {
        reverseFeedbackPoints.textContent = isCorrect
          ? `+${pointsEarned} ${pointsEarned > 1 ? "Puntos" : "Punto"}`
          : "0 Punto";
      }
      if (reverseFeedbackMessage) {
        reverseFeedbackMessage.textContent = isTimeout
          ? "Naubos ang itinakdang 30 segundo para sa tanong na ito sa Reverse Round."
          : (isCorrect
            ? "Tugma ang sagot sa itinakdang sagot at pamantayan."
            : "Hindi naabot ng sagot ang mga pamantayang itinakda para sa tanong na ito.");
      }
      if (reverseFeedbackStudentAnswer) reverseFeedbackStudentAnswer.textContent = studentInput;
      if (reverseFeedbackAnswer) {
        reverseFeedbackAnswer.textContent = correctDisplay;
      }
      if (reverseFeedbackExplanation) {
        reverseFeedbackExplanation.textContent = q.explanation;
      }
      const reviewTerms = q.terms || (q.originalCard && q.originalCard.terms) || q.rubricGroups || [];
      if (reverseFeedbackTerms && reverseFeedbackTermsText) {
        reverseFeedbackTerms.classList.toggle("hidden", !reviewTerms.length);
        reverseFeedbackTermsText.textContent = reviewTerms.map(group => group.join(" / ")).join(" • ");
      }

      const isExhausted = (reverseState.attemptsRemaining <= 0) ||
                          (reverseState.currentIndex >= reverseState.selectedQuestions.length - 1);

      if (reverseNextBtnText) {
        reverseNextBtnText.textContent = isExhausted ? "Tingnan ang Kabuuang Resulta" : "Susunod na Tanong";
      }

      reverseFeedbackBox.classList.remove("hidden");
    }

    if (reverseCardBackBrandContent) reverseCardBackBrandContent.classList.add("hidden");
    if (reverseSubmitWrap) reverseSubmitWrap.classList.add("hidden");
    if (reverseCard) {
      reverseCard.classList.add("is-flipped");
      reverseCard.dataset.flipped = "true";
      setActiveCardFace(reverseCard, true);
    }
  }

  function handleReverseNext() {
    stopReverseTimer();
    const isExhausted = (reverseState.attemptsRemaining <= 0) ||
                        (reverseState.currentIndex >= reverseState.selectedQuestions.length - 1);

    if (isExhausted) {
      finishReverseRound();
    } else {
      reverseState.currentIndex++;
      renderReverseCard();
    }
  }

  function finishReverseRound() {
    stopReverseTimer();
    appState.reverseRoundCompleted = true;
    if (appState.lastPlayedMode === "quiz") {
      renderQuizResults();
    } else {
      renderResultScreen();
      navigateToScreen(screens.result);
    }
  }

  if (btnStartReverseRound) btnStartReverseRound.addEventListener("click", startReverseRound);
  if (btnSkipReverseRound) btnSkipReverseRound.addEventListener("click", finishReverseRound);
  if (btnReverseBackDecks) btnReverseBackDecks.addEventListener("click", () => {
    stopReverseTimer();
    navigateToScreen(screens.deck);
  });
  if (btnReverseSubmit) btnReverseSubmit.addEventListener("click", () => handleReverseSubmit(false));
  if (btnReverseNext) btnReverseNext.addEventListener("click", handleReverseNext);
  if (btnReverseFlipCard) btnReverseFlipCard.addEventListener("click", toggleReverseCardFlip);
  if (reverseCard) {
    reverseCard.addEventListener("click", (e) => {
      if (e.target.closest("input, textarea, button, .quiz-mc-option, .quiz-tf-btn, .card-feedback-panel, .uno-card-center-oval")) return;
      toggleReverseCardFlip();
    });

    reverseCard.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.target.closest("input, textarea")) {
        e.preventDefault();
        toggleReverseCardFlip();
      }
    });
  }

  // ------------------------------------------------------------------------
  // 17. Final Results Screen Rendering (Card Arena & Quiz)
  // ------------------------------------------------------------------------
  /**
   * Renders Final Results Screen for 7-Card Arena Decks.
   * Integrates Main Round Score + Reverse Round Points = Updated Final Total.
   */
  function renderResultScreen() {
    stopChallengeTimer();
    finishRemoteGameSession();

    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck) return;

    let mainRoundScore = 0;
    let mainCorrectCount = 0;
    const maxScore = deck.cards.reduce((sum, c) => sum + (c.points ?? 1), 0) || 7;

    deck.cards.forEach((card) => {
      const record = appState.answers[card.id];
      if (record) {
        mainRoundScore += (record.pointsEarned || 0);
        if (record.isCorrect) mainCorrectCount++;
      }
    });

    const reverseRoundPoints = reverseState.pointsEarned || 0;
    const finalTotalScore = mainRoundScore + reverseRoundPoints;
    const percentage = Math.min(100, Math.round((finalTotalScore / maxScore) * 100));

    if (resultStudentGreeting) {
      resultStudentGreeting.textContent = `Binabati kita, ${appState.studentName || "Mag-aaral"}! Natapos mo ang lahat ng ${deck.cards.length} kard ng karunungan.`;
    }
    if (resultScoreNum) resultScoreNum.textContent = String(finalTotalScore);
    if (resultScoreMax) resultScoreMax.textContent = String(maxScore);
    if (resultPercentageBadge) resultPercentageBadge.textContent = `${percentage}% Marka`;
    if (resultDeckBadge) resultDeckBadge.textContent = `Deck: ${deck.title}`;

    if (resultCorrectCount) resultCorrectCount.textContent = String(mainCorrectCount);
    if (resultIncorrectCount) resultIncorrectCount.textContent = String(deck.cards.length - mainCorrectCount);

    // Score Breakdown Strip
    if (resultMainRoundPts) resultMainRoundPts.textContent = String(mainRoundScore);
    if (resultReversePts) resultReversePts.textContent = reverseRoundPoints > 0 ? `+${reverseRoundPoints}` : "+0";
    if (resultFinalTotalPts) resultFinalTotalPts.textContent = String(finalTotalScore);

    // Reverse Stat Pill
    if (resultStatReversePill) {
      const correctedCount = Object.values(reverseState.answers).filter(a => a.isCorrect).length;
      if (appState.reverseRoundCompleted && Object.keys(reverseState.answers).length > 0) {
        resultStatReversePill.classList.remove("hidden");
        if (resultReverseCount) resultReverseCount.textContent = String(correctedCount);
      } else {
        resultStatReversePill.classList.add("hidden");
      }
    }

    // Performance Qualitative Assessment
    if (resultPerformanceTitle && resultPerformanceMsg) {
      if (finalTotalScore >= 7) {
        resultPerformanceTitle.textContent = "🏆 Perpektong Pagganap!";
        resultPerformanceMsg.textContent = "Natatangi ang iyong kaalaman at pagsusuri sa panitikang Filipino. Ipinamalas mo ang buong karunungan!";
      } else if (finalTotalScore >= 5) {
        resultPerformanceTitle.textContent = "🌟 Napakahusay na Pagsubok!";
        resultPerformanceMsg.textContent = "Malalim ang iyong pag-unawa sa mga pahiwatig at elemento ng akda. May ilang konseptong maaaring repasuhin.";
      } else if (finalTotalScore >= 3) {
        resultPerformanceTitle.textContent = "📖 Magandang Pagsisikap!";
        resultPerformanceMsg.textContent = "May matibay kang pundasyon. Pag-aralan muli ang mga paliwanag at susing salita upang lalong humusay.";
      } else {
        resultPerformanceTitle.textContent = "🌱 Ipagpatuloy ang Pagsasanay!";
        resultPerformanceMsg.textContent = "Huwag panghinaan ng loob. Basahin muli ang mga kaisipan ng akda at subukan muli ang pagsusulit.";
      }
    }

    if (resultReviewHeading) {
      resultReviewHeading.textContent = "📋 Detalyadong Pagsusuri ng bawat Tanong";
    }
    if (resultReviewSub) {
      resultReviewSub.textContent = "Suriin ang iyong mga sagot at ang tamang pampanitikang paliwanag.";
    }

    // Render Detailed 7-Card Review List
    if (resultBreakdownList) {
      resultBreakdownList.innerHTML = "";

      deck.cards.forEach((card) => {
        const record = appState.answers[card.id] || {
          userAnswer: "(Walang naisumite)",
          correctAnswer: card.answer,
          isCorrect: false,
          pointsEarned: 0,
          explanation: card.explanation,
          terms: card.terms
        };

        const rawRef = record.correctAnswer ||
          record.expectedAnswer ||
          card.answer ||
          (record.evaluationContext && record.evaluationContext.expectedAnswer) ||
          "";
        const formattedRef = resolveCorrectAnswerDisplay(rawRef, card.options) || rawRef || "Walang nakatalagang batayang sagot";

        const typeMeta = PANITIKARD_CARD_TYPES[card.type] || {
          icon: "🎴",
          label: card.type
        };

        const itemCard = document.createElement("div");
        itemCard.className = `result-item-card ${record.isCorrect ? "result-item-correct" : "result-item-incorrect"}`;

        let pointsClass = "points-missed";
        if (record.pointsEarned > 0) {
          pointsClass = "points-correct";
        } else if (card.type === "reverse") {
          pointsClass = "points-review";
        }

        const pointsBadgeText = card.type === "reverse"
          ? "0 pt (Pagbabalik-aral)"
          : `+${record.pointsEarned}/${card.points} pt`;

        itemCard.innerHTML = `
          <div class="result-item-top">
            <span class="pill-chip result-type-chip">${typeMeta.icon} ${card.type || card.tag}</span>
            <span class="result-item-points ${pointsClass}">${pointsBadgeText}</span>
          </div>
          <h4 class="result-item-title">Kard #${card.number}: ${typeMeta.label}</h4>

          <p class="result-item-prompt">${escapeHtml(card.prompt)}</p>

          <div class="result-answers-comparison">
            <div class="student-ans-line">
              <strong>👤 Iyong Sagot:</strong> ${escapeHtml(record.userAnswer)}
            </div>
            <div class="correct-ans-line">
              <strong>✓ Tamang Sagot / Batayan:</strong> ${escapeHtml(formattedRef)}
            </div>
          </div>

          <div class="result-item-explanation">
            <strong>📚 Paliwanag:</strong> ${escapeHtml(card.explanation)}
          </div>

          ${record.aiFeedback ? `
            <div class="result-item-explanation" style="color: #1e3a8a; background: #eff6ff; padding: 6px 10px; border-radius: 6px; margin-top: 6px; white-space: pre-line;">
              <strong>🤖 AI Pagsusuri at Feedback:</strong> ${escapeHtml(record.aiFeedback)}
            </div>
          ` : ""}

          ${record.terms && record.terms.length > 0 ? `
            <div class="result-item-explanation" style="color: #b45309;">
              <strong>🔑 Mga Susing Kaisipan (Keywords):</strong> ${record.terms.map(g => g.join(" / ")).join(" &bull; ")}
            </div>
          ` : ""}
        `;

        resultBreakdownList.appendChild(itemCard);
      });

      // Append Reverse Round Second-Chance Section if played
      if (appState.reverseRoundCompleted && Object.keys(reverseState.answers).length > 0) {
        appendReverseRoundReviews();
      }
    }
  }

  /**
   * Renders Final Results Screen for 15-Question Quizzes.
   * Integrates Main Round Score + Reverse Round Points = Updated Final Total.
   */
  function renderQuizResults() {
    finishRemoteGameSession();
    const quizDeck = PANITIKARD_DECKS[quizState.activeQuizId];
    const title = quizDeck ? quizDeck.title : "Pagsusulit";

    const mainRoundScore = quizState.currentScore;
    const reverseRoundPoints = reverseState.pointsEarned || 0;
    const finalTotalScore = mainRoundScore + reverseRoundPoints;
    const maxScore = quizState.maxScore;
    const mainCorrectCount = Object.values(quizState.userAnswers).filter(a => a.isCorrect).length;
    const incorrectCount = quizState.questions.length - mainCorrectCount;
    const percentage = Math.min(100, Math.round((finalTotalScore / maxScore) * 100));

    if (resultStudentGreeting) {
      resultStudentGreeting.textContent = `Binabati kita, ${appState.studentName || "Mag-aaral"}! Natapos mo ang ${quizState.questions.length} na katanungan sa ${title}.`;
    }

    if (resultScoreNum) resultScoreNum.textContent = String(finalTotalScore);
    if (resultScoreMax) resultScoreMax.textContent = String(maxScore);
    if (resultPercentageBadge) resultPercentageBadge.textContent = `${percentage}% Marka`;
    if (resultDeckBadge) resultDeckBadge.textContent = `Paksa: ${title}`;

    if (resultCorrectCount) resultCorrectCount.textContent = String(mainCorrectCount);
    if (resultIncorrectCount) resultIncorrectCount.textContent = String(incorrectCount);

    // Score Breakdown Strip
    if (resultMainRoundPts) resultMainRoundPts.textContent = String(mainRoundScore);
    if (resultReversePts) resultReversePts.textContent = reverseRoundPoints > 0 ? `+${reverseRoundPoints}` : "+0";
    if (resultFinalTotalPts) resultFinalTotalPts.textContent = String(finalTotalScore);

    // Reverse Stat Pill
    if (resultStatReversePill) {
      const correctedCount = Object.values(reverseState.answers).filter(a => a.isCorrect).length;
      if (appState.reverseRoundCompleted && Object.keys(reverseState.answers).length > 0) {
        resultStatReversePill.classList.remove("hidden");
        if (resultReverseCount) resultReverseCount.textContent = String(correctedCount);
      } else {
        resultStatReversePill.classList.add("hidden");
      }
    }

    // Qualitative Performance Assessment
    if (resultPerformanceTitle && resultPerformanceMsg) {
      if (percentage >= 90) {
        resultPerformanceTitle.textContent = "🏆 Natatanging Kahusayan! (Mastery)";
        resultPerformanceMsg.textContent = "Napakahusay! Naipamalas mo ang mataas na antas ng kaalaman at komprehensibong pag-unawa sa paksang ito.";
      } else if (percentage >= 75) {
        resultPerformanceTitle.textContent = "🌟 Mataas na Antas ng Pagkatuto! (Proficient)";
        resultPerformanceMsg.textContent = "Magaling! Matagumpay mong nasagot nang wasto ang karamihan sa mga katanungan.";
      } else if (percentage >= 50) {
        resultPerformanceTitle.textContent = "📖 Umuunlad na Pagkatuto! (Developing)";
        resultPerformanceMsg.textContent = "May matibay kang simula. Magbalik-aral sa mga paliwanag upang higit pang mapalalim ang iyong kaalaman.";
      } else {
        resultPerformanceTitle.textContent = "🌱 Nangangailangan ng Karagdagang Gabay";
        resultPerformanceMsg.textContent = "Ipagpatuloy ang pagsisikap. Basahing mabuti ang mga paliwanag sa bawat tanong at subukan muli ang pagsusulit.";
      }
    }

    if (resultReviewHeading) {
      resultReviewHeading.textContent = `📋 Detalyadong Pagsusuri ng bawat Tanong (${quizState.questions.length} Tanong)`;
    }
    if (resultReviewSub) {
      resultReviewSub.textContent = "Suriin ang iyong mga sagot at ang tamang pampanitikang paliwanag.";
    }

    // Render 15 question reviews in resultBreakdownList
    if (resultBreakdownList) {
      resultBreakdownList.innerHTML = "";

      quizState.questions.forEach((q, idx) => {
        const record = quizState.userAnswers[q.id] || {
          userAnswer: "(Walang naisumite)",
          correctAnswer: q.answer,
          isCorrect: false,
          pointsEarned: 0,
          explanation: q.explanation
        };

        const rawQuizRef = record.correctAnswer ||
          q.answer ||
          (record.evaluationContext && record.evaluationContext.expectedAnswer) ||
          "";
        const formattedQuizRef = resolveCorrectAnswerDisplay(rawQuizRef, q.choices) || rawQuizRef || "Walang nakatalagang tamang sagot";

        const itemCard = document.createElement("div");
        itemCard.className = `result-item-card ${record.isCorrect ? "result-item-correct" : "result-item-incorrect"}`;

        const pointsBadgeText = record.isCorrect
          ? `+${record.pointsEarned}/${q.points || 1} pt`
          : `0/${q.points || 1} pt`;

        itemCard.innerHTML = `
          <div class="result-item-top">
            <span class="pill-chip result-type-chip">${q.questionType}</span>
            <span class="result-item-points ${record.isCorrect ? "points-correct" : "points-missed"}">${pointsBadgeText}</span>
          </div>
          <h4 class="result-item-title">Tanong #${idx + 1} (${q.category || "Pampanitikan"})</h4>

          <p class="result-item-prompt">${escapeHtml(q.question)}</p>

          <div class="result-answers-comparison">
            <div class="student-ans-line">
              <strong>👤 Iyong Sagot:</strong> ${escapeHtml(record.userAnswer)}
            </div>
            <div class="correct-ans-line">
              <strong>✓ Tamang Sagot:</strong> ${escapeHtml(formattedQuizRef)}
            </div>
          </div>

          <div class="result-item-explanation">
            <strong>📚 Paliwanag:</strong> ${escapeHtml(record.explanation)}
          </div>
        `;

        resultBreakdownList.appendChild(itemCard);
      });

      // Append Reverse Round Second-Chance Section if played
      if (appState.reverseRoundCompleted && Object.keys(reverseState.answers).length > 0) {
        appendReverseRoundReviews();
      }
    }

    appState.lastPlayedMode = "quiz";
    navigateToScreen(screens.result);
  }

  /**
   * Appends a dedicated Reverse Round section to the breakdown review list.
   * Preserves all original answers while clearly showing second-chance attempts.
   */
  function appendReverseRoundReviews() {
    const divider = document.createElement("div");
    divider.className = "reverse-review-divider-box";
    divider.innerHTML = `
      <div class="reverse-divider-head">
        <span class="reverse-divider-icon" aria-hidden="true">🔁</span>
        <h4 class="reverse-divider-title">Resulta ng Reverse Round (Ikalawang Pagkakataon)</h4>
      </div>
      <p class="reverse-divider-sub">
        Ipinapakita sa ibaba ang iyong mga ikalawang pagsubok. Ang iyong orihinal na rekord sa itaas ay nananatiling buo.
      </p>
    `;
    resultBreakdownList.appendChild(divider);

    Object.values(reverseState.answers).forEach((revAns, revIdx) => {
      const rawRevRef = revAns.correctAnswer ||
        revAns.answer ||
        (revAns.evaluationContext && revAns.evaluationContext.expectedAnswer) ||
        "";
      const formattedRevRef = resolveCorrectAnswerDisplay(rawRevRef, revAns.choices) || rawRevRef || "Walang nakatalagang tamang sagot";

      const itemCard = document.createElement("div");
      itemCard.className = `result-item-card reverse-review-item ${revAns.isCorrect ? "result-item-correct" : "result-item-incorrect"}`;

      itemCard.innerHTML = `
        <div class="result-item-top">
          <span class="pill-chip reverse-pill-chip">🔁 Ikalawang Pagkakataon</span>
          <span class="result-item-points ${revAns.isCorrect ? "points-correct" : "points-missed"}">
            ${revAns.isCorrect ? `+${revAns.pointsEarned} pt (Naitama!)` : "0 pt (Hindi Naitama)"}
          </span>
        </div>
        <h4 class="result-item-title">Reverse Pagsubok #${revIdx + 1} (${escapeHtml(revAns.category || "Tanong")})</h4>

        <p class="result-item-prompt">${escapeHtml(revAns.question)}</p>

        <div class="result-answers-comparison">
          <div class="student-ans-line">
            <strong>👤 Iyong Sagot sa Reverse:</strong> ${escapeHtml(revAns.userAnswer)}
          </div>
          <div class="correct-ans-line">
            <strong>✓ Tamang Sagot:</strong> ${escapeHtml(formattedRevRef)}
          </div>
        </div>

        <div class="result-item-explanation">
          <strong>📚 Paliwanag:</strong> ${escapeHtml(revAns.explanation)}
        </div>
      `;

      resultBreakdownList.appendChild(itemCard);
    });
  }

  function escapeHtml(text) {
    if (!text) return "";
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ------------------------------------------------------------------------
  // 18. Results Action Buttons (Retry, Return to Decks, Home)
  // ------------------------------------------------------------------------
  if (btnRetryDeck) {
    btnRetryDeck.addEventListener("click", () => {
      if (appState.lastPlayedMode === "quiz") {
        startQuiz(quizState.activeQuizId);
      } else {
        startDeckSession();
      }
    });
  }

  if (btnResultToDecks) {
    btnResultToDecks.addEventListener("click", () => {
      stopChallengeTimer();
      navigateToScreen(screens.deck);
    });
  }

  if (btnResultToHome) {
    btnResultToHome.addEventListener("click", () => {
      stopChallengeTimer();
      navigateToScreen(screens.welcome);
    });
  }

  // ------------------------------------------------------------------------
  // 19. Initial Remote Catalog Discovery & Test Export
  // ------------------------------------------------------------------------
  loadRemoteCatalog();

  if (typeof window !== "undefined") {
    window.PANITIKARD_DYNAMIC_CATALOG = {
      mapCatalogQuestionToCard,
      mapCatalogQuestionToQuiz,
      hydrateDeckFromCatalog,
      renderDynamicTopicCards,
      loadRemoteCatalog,
      resolveActiveStudentName,
      handleTopicSelection,
      startDeckSession,
      showDeckWarning,
      hideDeckWarning
    };
  }
});
