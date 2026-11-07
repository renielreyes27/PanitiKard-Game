/**
 * ==========================================================================
 * PanitiKard V2 - Main JavaScript (Core Gameplay Controller)
 * ==========================================================================
 * 
 * Features:
 * 1. Multi-Screen Flow:
 *    Setup -> Topic Deck Selection -> Card Arena -> Final Results.
 * 2. Active Student Identity handling with volatile session state.
 * 3. Multiple Choice Card grading (A-D) with immediate visual feedback.
 * 4. Open-Ended Response handling (Statement, Correction, Bonus, Reverse, Help, Challenge)
 *    structured for future Gemini AI evaluation without rigid keyword pass/fail gating.
 * 5. Progression Security: Card flip is locked until an answer is submitted.
 * 6. Challenge Card 30-second countdown timer with auto-submit on timeout.
 * 7. DepEd/V1 Scoring Rules Preserved:
 *    - Question: 1 pt
 *    - Statement: 1 pt
 *    - Correction: 1 pt
 *    - Bonus: 2 pts (Double points)
 *    - Reverse: 0 pts (Unscored review card)
 *    - Help: 1 pt (With hint reveal)
 *    - Challenge: 1 pt (30s timed challenge)
 *    Total Max Score = 7 Points.
 * 8. Comprehensive Final Results Screen with score breakdown, card-by-card
 *    review, and retry / deck-switch capabilities.
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

  // ------------------------------------------------------------------------
  // 2. Element References
  // ------------------------------------------------------------------------
  // Screens (6 Total: Welcome, Setup, Deck, Card Arena, Quiz, Results)
  const screens = {
    welcome: document.getElementById("welcome-screen"),
    setup: document.getElementById("setup-screen"),
    deck: document.getElementById("deck-screen"),
    card: document.getElementById("card-screen"),
    quiz: document.getElementById("quiz-screen"),
    result: document.getElementById("result-screen")
  };

  // Header & Drawer Elements (Matches Screenshots 1 & 2)
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
  const btnTeacherToStudent = document.getElementById("btn-teacher-to-student");

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
  const btnQuizNext = document.getElementById("btn-quiz-next");
  const quizNextBtnText = document.getElementById("quiz-next-btn-text");

  // Screen 4: Card Arena Elements
  const btnCrumbDeck = document.getElementById("btn-crumb-deck");
  const btnBackToDeck = document.getElementById("btn-back-to-deck");
  const cardDeckIndicator = document.getElementById("card-deck-indicator");
  const cardStudentIndicator = document.getElementById("card-student-indicator");
  const cardTypeTabs = document.querySelectorAll(".type-tab");
  const interactiveCard = document.getElementById("interactive-card");
  const btnFlipCard = document.getElementById("btn-flip-card");
  const btnPrevCard = document.getElementById("btn-prev-card");
  const btnNextCard = document.getElementById("btn-next-card");

  // Front Face Elements
  const frontCardNum = document.getElementById("front-card-num");
  const frontCardNumBottom = document.getElementById("front-card-num-bottom");
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

  // Back Face Elements
  const backCardNum = document.getElementById("back-card-num");
  const backCardNumBottom = document.getElementById("back-card-num-bottom");
  const backAnswerHighlight = document.getElementById("back-answer-highlight");
  const backExplanationText = document.getElementById("back-explanation-text");
  const backTriviaText = document.getElementById("back-trivia-text");

  // Screen 5: Results Elements
  const resultStudentGreeting = document.getElementById("result-student-greeting");
  const resultScoreNum = document.getElementById("result-score-num");
  const resultScoreMax = document.getElementById("result-score-max");
  const resultPercentageBadge = document.getElementById("result-percentage-badge");
  const resultDeckBadge = document.getElementById("result-deck-badge");
  const resultPerformanceTitle = document.getElementById("result-performance-title");
  const resultPerformanceMsg = document.getElementById("result-performance-msg");
  const resultBreakdownList = document.getElementById("result-breakdown-list");
  const btnRetryDeck = document.getElementById("btn-retry-deck");
  const btnResultToDecks = document.getElementById("btn-result-to-decks");
  const btnResultToHome = document.getElementById("btn-result-to-home");
  const resultCorrectCount = document.getElementById("result-correct-count");
  const resultIncorrectCount = document.getElementById("result-incorrect-count");
  const resultReviewHeading = document.getElementById("result-review-heading");
  const resultReviewSub = document.getElementById("result-review-sub");

  // Active visible screen reference
  let currentScreen = screens.welcome;

  // ------------------------------------------------------------------------
  // 3. Screen Navigation Helper
  // ------------------------------------------------------------------------
  /**
   * Switches the visible screen with smooth transition.
   * Updates the global header Back button visibility.
   * @param {HTMLElement} targetScreen
   */
  function navigateToScreen(targetScreen) {
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

  if (btnWelcomeTeacher) {
    btnWelcomeTeacher.addEventListener("click", () => {
      if (teacherModal) teacherModal.classList.remove("hidden");
    });
  }

  if (btnCloseTeacherModal) {
    btnCloseTeacherModal.addEventListener("click", () => {
      if (teacherModal) teacherModal.classList.add("hidden");
    });
  }

  if (btnTeacherModalCancel) {
    btnTeacherModalCancel.addEventListener("click", () => {
      if (teacherModal) teacherModal.classList.add("hidden");
    });
  }

  if (btnTeacherToStudent) {
    btnTeacherToStudent.addEventListener("click", () => {
      if (teacherModal) teacherModal.classList.add("hidden");
      navigateToScreen(screens.setup);
      if (studentNameInput) studentNameInput.focus();
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

  if (studentNameInput) {
    studentNameInput.addEventListener("input", () => {
      if (studentNameInput.value.trim().length > 0) {
        hideValidation();
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

      if (!name) {
        showValidation("Pakilagay muna ang iyong buong pangalan bago magpatuloy.");
        if (studentNameInput) studentNameInput.focus();
        return;
      }

      appState.studentName = name;
      hideValidation();

      // Update player name badge on Screen 3 (Deck Screen)
      if (deckStudentName) {
        deckStudentName.textContent = name;
      }

      // Transition to Topic Deck Selection
      syncActiveDeckUI(appState.activeDeckId);
      navigateToScreen(screens.deck);
    });
  }

  // Back Navigation: Deck Screen to Setup Screen
  if (btnBackToSetup) {
    btnBackToSetup.addEventListener("click", () => {
      stopChallengeTimer();
      navigateToScreen(screens.setup);
      studentNameInput.focus();
    });
  }

  if (btnEditStudentName) {
    btnEditStudentName.addEventListener("click", () => {
      stopChallengeTimer();
      navigateToScreen(screens.setup);
      studentNameInput.focus();
    });
  }

  // ------------------------------------------------------------------------
  // 6. Screen 2: Topic Selection Handling (Screenshot 3 & Quiz Flow)
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

  function handleTopicSelection(deckId) {
    if (deckId === "alamat" || deckId === "maikling-kwento") {
      // Immediately start the quiz without another category selection page
      startQuiz(deckId);
    } else {
      // 7-card 3D flip card flow (elements, meaning)
      selectDeck(deckId);
      startDeckSession();
    }
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

  // Deck Screen -> Card Arena Screen (Fallback button)
  if (btnEnterDeck) {
    btnEnterDeck.addEventListener("click", () => {
      handleTopicSelection(appState.activeDeckId);
    });
  }

  // ------------------------------------------------------------------------
  // 7. Gameplay Session Start & Card Arena Lifecycle
  // ------------------------------------------------------------------------
  function startDeckSession() {
    // Reset gameplay state for new session
    appState.lastPlayedMode = "deck";
    appState.answers = {};
    appState.activeCardTypeIndex = 0;
    appState.highestUnlockedIndex = 0;
    stopChallengeTimer();

    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck) return;

    if (cardDeckIndicator) {
      cardDeckIndicator.textContent = `Deck: ${deck.title}`;
    }
    if (cardStudentIndicator) {
      cardStudentIndicator.textContent = `Mag-aaral: ${appState.studentName || "Mag-aaral"}`;
    }

    renderCardByTypeIndex(0);
    navigateToScreen(screens.card);
  }

  /**
   * Renders the card at the specified index within the active deck.
   * Handles flip security, submission checking, and timer initiation.
   * @param {number} index
   */
  function renderCardByTypeIndex(index) {
    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck || !deck.cards[index]) return;

    // Stop any existing timer when switching cards
    stopChallengeTimer();

    appState.activeCardTypeIndex = index;
    const cardData = deck.cards[index];
    const typeMeta = PANITIKARD_CARD_TYPES[cardData.type] || {
      label: cardData.type,
      subLabel: "Card",
      icon: "🎴",
      color: "#185b55"
    };

    const isSubmitted = !!appState.answers[cardData.id];
    const currentSubmission = appState.answers[cardData.id] || null;

    // Apply card type styling classes
    interactiveCard.className = "playing-card";
    interactiveCard.classList.add(`theme-${typeMeta.tagClass}`);
    
    // Card flip status: locked on front face if not submitted yet
    if (!isSubmitted) {
      interactiveCard.classList.remove("is-flipped");
      interactiveCard.dataset.flipped = "false";
    }

    // 1. Header Badges & Corners
    frontCardNum.textContent = cardData.number;
    frontCardNumBottom.textContent = cardData.number;
    backCardNum.textContent = cardData.number;
    backCardNumBottom.textContent = cardData.number;

    frontCardTypeBadge.innerHTML = `
      <span class="type-badge-icon">${typeMeta.icon}</span>
      <span class="type-badge-text">${typeMeta.label} &bull; ${typeMeta.subLabel}</span>
    `;

    frontDeckBadge.textContent = deck.badge;
    frontCardIcon.textContent = typeMeta.icon;

    // 2. Title & Prompt Text
    frontCardTitle.textContent = cardData.title;
    frontCardPrompt.textContent = cardData.prompt;

    // 3. Challenge Timer Header Indicator
    if (cardData.timeLimit && frontTimerBadge) {
      frontTimerBadge.classList.remove("hidden");
      if (!isSubmitted) {
        startChallengeTimer(cardData);
      } else {
        timerSeconds.textContent = "0";
      }
    } else if (frontTimerBadge) {
      frontTimerBadge.classList.add("hidden");
    }

    // 4. Options or Open Response Input Presentation
    renderCardFrontOptions(cardData, isSubmitted, currentSubmission, typeMeta);

    // 5. Back Face Content (Answers, Explanations, Keywords)
    renderCardBackContent(cardData, isSubmitted, currentSubmission);

    // 6. Flip Security & On-Card Pill Indicator
    updateFlipControlsState(isSubmitted);

    // 7. Navigation Toolbar Buttons (Prev, Flip, Next)
    updateNavigationControls(index, isSubmitted);

    // 8. Update Switcher Tabs UI & Progression Locks
    updateTabsState(index);
  }

  /**
   * Updates flip security indicators on the card front and toolbar.
   * Prevents revealing answers prior to submission.
   */
  function updateFlipControlsState(isSubmitted) {
    if (!isSubmitted) {
      if (frontFlipIcon) frontFlipIcon.textContent = "🔒";
      if (frontFlipPillText) frontFlipPillText.textContent = "Mag-submit muna ng sagot upang buksan";
      if (btnFlipCard) {
        btnFlipCard.disabled = true;
        btnFlipCard.title = "Kailangan munang sagutan ang kard bago buksan ang likod.";
      }
    } else {
      if (frontFlipIcon) frontFlipIcon.textContent = "🔄";
      if (frontFlipPillText) frontFlipPillText.textContent = "I-tap upang Baligtarin at Suriin";
      if (btnFlipCard) {
        btnFlipCard.disabled = false;
        btnFlipCard.title = "I-flip ang kard upang basahin ang paliwanag.";
      }
    }
  }

  /**
   * Updates toolbar button states based on progression.
   */
  function updateNavigationControls(index, isSubmitted) {
    // Previous Button
    if (btnPrevCard) {
      btnPrevCard.disabled = (index === 0);
    }

    // Next Button: Locked until submission
    if (btnNextCard) {
      if (!isSubmitted) {
        btnNextCard.disabled = true;
        btnNextCard.innerHTML = `<span>Susunod &rarr;</span>`;
      } else {
        btnNextCard.disabled = false;
        if (index === 6) {
          // Last card submitted -> Show Results button
          btnNextCard.innerHTML = `<span>Tingnan ang Resulta 🏆 &rarr;</span>`;
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
    cardTypeTabs.forEach((tab, i) => {
      // Locked state: cannot jump ahead to unreached cards
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
  // 8. Card Front Presentation & Submission Handlers
  // ------------------------------------------------------------------------
  function renderCardFrontOptions(cardData, isSubmitted, submission, typeMeta) {
    frontCardOptions.innerHTML = "";

    // A. Multiple Choice Card (Card Type 1: Question)
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

        // If already submitted: show correct/incorrect styles
        if (isSubmitted) {
          optionEl.classList.add("disabled");
          const statusIcon = optionEl.querySelector(".option-status-icon");

          if (opt.key === cardData.answer) {
            optionEl.classList.add("correct");
            statusIcon.textContent = "✓";
          } else if (opt.key === submission.userAnswer && !submission.isCorrect) {
            optionEl.classList.add("incorrect");
            statusIcon.textContent = "✗";
          }
        } else {
          // Active interactive choice selection
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
        submitBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (selectedOptionKey) {
            submitMultipleChoiceAnswer(selectedOptionKey, cardData);
          }
        });
      } else {
        // Feedback display after submission
        if (submission.isCorrect) {
          submitRow.innerHTML = `
            <span class="feedback-badge feedback-correct">
              <span>✅ TAMA! Natamo mo ang ${submission.pointsEarned} puntos.</span>
            </span>
          `;
        } else {
          submitRow.innerHTML = `
            <span class="feedback-badge feedback-incorrect">
              <span>❌ MALI. Ang tamang sagot ay (${cardData.answer}).</span>
            </span>
          `;
        }
      }

      frontCardOptions.appendChild(submitRow);
    } 
    // B. Open-Ended Cards (Statement, Correction, Bonus, Reverse, Help, Challenge)
    else {
      frontCardOptions.className = "card-options-open";

      const openCardForm = document.createElement("div");
      openCardForm.className = "open-card-form";

      // Meta indicators: time limits, hints, points rule
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
          rows="2" maxlength="280" ${isSubmitted ? "disabled" : ""}>${isSubmitted ? (submission.userAnswer || "") : ""}</textarea>
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

        // Submit on Ctrl+Enter
        textarea.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            btnSubmitOpen.click();
          }
        });
      }

      frontCardOptions.appendChild(openCardForm);
    }
  }

  function getOpenFeedbackText(submission, cardData) {
    if (submission.isTimeout) {
      return `⏱️ Naubos ang 30 segundo na palugit!`;
    }
    if (cardData.type === "bonus") {
      return `⭐ Naitala ang sagot sa Bonus Kard! (+${submission.pointsEarned} puntos)`;
    }
    if (cardData.type === "reverse") {
      return `🔄 Naitala ang pagbabalik-aral. (0 puntos)`;
    }
    return `✅ Naitala ang iyong tugon para sa pagsusuri. (+${submission.pointsEarned} puntos)`;
  }

  // ------------------------------------------------------------------------
  // 9. Card Back Presentation (Answers, Explanations & Keywords)
  // ------------------------------------------------------------------------
  function renderCardBackContent(cardData, isSubmitted, submission) {
    // Back answer highlight
    if (cardData.options && cardData.options.length > 0) {
      const correctOpt = cardData.options.find(o => o.key === cardData.answer);
      backAnswerHighlight.innerHTML = correctOpt 
        ? `${cardData.answer} &bull; ${correctOpt.text}` 
        : cardData.answer;
    } else {
      backAnswerHighlight.textContent = cardData.answer;
    }

    backExplanationText.textContent = cardData.explanation;

    // Display Trivia (if exists) or V1 Accepted Keywords (terms)
    const backTriviaBox = document.querySelector(".back-trivia-box");
    const triviaTitle = document.querySelector(".trivia-title");
    
    if (cardData.didYouKnow) {
      if (backTriviaBox) backTriviaBox.style.display = "block";
      if (triviaTitle) triviaTitle.textContent = "✨ Alam Mo Ba?";
      backTriviaText.textContent = cardData.didYouKnow;
    } else if (cardData.terms && cardData.terms.length > 0) {
      if (backTriviaBox) backTriviaBox.style.display = "block";
      if (triviaTitle) triviaTitle.textContent = "🔑 Mga Susing Kaisipan (V1 Keywords):";
      backTriviaText.textContent = cardData.terms.map(group => group.join(" / ")).join(" • ");
    } else {
      if (backTriviaBox) backTriviaBox.style.display = "none";
    }
  }

  // ------------------------------------------------------------------------
  // 10. Evaluation & Submission Logic
  // ------------------------------------------------------------------------
  /**
   * Submits and grades Multiple Choice answers (1 point).
   */
  function submitMultipleChoiceAnswer(selectedKey, cardData) {
    if (appState.answers[cardData.id]) return; // Prevent duplicate submission

    const isCorrect = (selectedKey === cardData.answer);
    const pointsEarned = isCorrect ? cardData.points : 0;

    appState.answers[cardData.id] = {
      cardId: cardData.id,
      type: cardData.type,
      number: cardData.number,
      tag: cardData.tag,
      title: cardData.title,
      prompt: cardData.prompt,
      userAnswer: selectedKey,
      correctAnswer: cardData.answer,
      isCorrect: isCorrect,
      pointsEarned: pointsEarned,
      maxPoints: cardData.points,
      explanation: cardData.explanation,
      terms: cardData.terms,
      submittedAt: new Date().toISOString()
    };

    // Unlock next sequential card index
    unlockNextIndex();

    // Re-render card in submitted state
    renderCardByTypeIndex(appState.activeCardTypeIndex);

    // Smooth auto-flip to reveal literary explanation
    autoFlipToBack();
  }

  /**
   * Evaluates Open-Ended responses (Statement, Correction, Bonus, etc.).
   * 
   * ARCHITECTURE NOTICE:
   * Prepared for future Gemini AI evaluation API integration.
   * Does NOT use simple keyword matching as a rigid pass/fail final gate.
   * Validates substantive engagement and preserves curriculum scoring rules:
   * Bonus = 2 pts, Reverse = 0 pts (unscored), others = 1 pt.
   */
  function evaluateOpenEndedAnswer(userAnswer, cardData) {
    const trimmed = (userAnswer || "").trim();
    const isSubstantive = trimmed.length >= 3;

    // Conceptual keyword check preserved as an advisory metric for review display
    let advisoryKeywordMatch = false;
    if (cardData.terms && cardData.terms.length > 0) {
      const lower = trimmed.toLowerCase();
      advisoryKeywordMatch = cardData.terms.some(group =>
        group.some(term => lower.includes(term.toLowerCase()))
      );
    }

    // Award full points for substantive attempt;
    // Curriculum rules: Reverse = 0 pts, Bonus = 2 pts, others = 1 pt.
    const points = isSubstantive ? cardData.points : 0;

    return {
      isCorrect: isSubstantive,
      pointsEarned: points,
      advisoryKeywordMatch: advisoryKeywordMatch,
      evaluationMethod: "provisional_ai_ready"
    };
  }

  /**
   * Submits an open-ended answer.
   */
  function submitOpenEndedAnswer(answerText, cardData, isTimeout = false) {
    if (appState.answers[cardData.id]) return; // Prevent duplicate submission

    stopChallengeTimer();

    const evalResult = evaluateOpenEndedAnswer(answerText, cardData);
    if (isTimeout) {
      evalResult.isCorrect = false;
      evalResult.pointsEarned = 0;
    }

    appState.answers[cardData.id] = {
      cardId: cardData.id,
      type: cardData.type,
      number: cardData.number,
      tag: cardData.tag,
      title: cardData.title,
      prompt: cardData.prompt,
      userAnswer: answerText,
      correctAnswer: cardData.answer,
      isCorrect: evalResult.isCorrect,
      pointsEarned: evalResult.pointsEarned,
      maxPoints: cardData.points,
      explanation: cardData.explanation,
      terms: cardData.terms,
      isTimeout: isTimeout,
      submittedAt: new Date().toISOString()
    };

    // Unlock next sequential card index
    unlockNextIndex();

    // Re-render card in submitted state
    renderCardByTypeIndex(appState.activeCardTypeIndex);

    // Smooth auto-flip to reveal literary explanation
    autoFlipToBack();
  }

  function unlockNextIndex() {
    if (appState.activeCardTypeIndex >= appState.highestUnlockedIndex) {
      appState.highestUnlockedIndex = Math.min(appState.activeCardTypeIndex + 1, 6);
    }
  }

  function autoFlipToBack() {
    setTimeout(() => {
      if (interactiveCard && !interactiveCard.classList.contains("is-flipped")) {
        interactiveCard.classList.add("is-flipped");
        interactiveCard.dataset.flipped = "true";
      }
    }, 600);
  }

  // ------------------------------------------------------------------------
  // 11. Challenge Card 30-Second Countdown Timer
  // ------------------------------------------------------------------------
  function startChallengeTimer(cardData) {
    stopChallengeTimer();

    appState.challengeSecondsRemaining = cardData.timeLimit || 30;
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

      // Warning pulse when <= 10 seconds remaining
      if (appState.challengeSecondsRemaining <= 10 && frontTimerBadge) {
        frontTimerBadge.classList.add("timer-warning");
      }

      // Time expired: automatically end attempt
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
  // 12. 3D Card Flip Mechanics & Security
  // ------------------------------------------------------------------------
  function toggleCardFlip() {
    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck || !deck.cards[appState.activeCardTypeIndex]) return;

    const cardData = deck.cards[appState.activeCardTypeIndex];
    const isSubmitted = !!appState.answers[cardData.id];

    // Card flip security: locked until an answer is submitted
    if (!isSubmitted) {
      interactiveCard.classList.remove("shake-card");
      void interactiveCard.offsetWidth; // Force CSS reflow
      interactiveCard.classList.add("shake-card");
      return;
    }

    interactiveCard.classList.toggle("is-flipped");
    const isNowFlipped = interactiveCard.classList.contains("is-flipped");
    interactiveCard.dataset.flipped = isNowFlipped ? "true" : "false";
  }

  // Flip on toolbar button click
  if (btnFlipCard) {
    btnFlipCard.addEventListener("click", () => {
      toggleCardFlip();
    });
  }

  // Flip on card body click or keyboard Enter/Space
  if (interactiveCard) {
    interactiveCard.addEventListener("click", (e) => {
      // Don't toggle flip if interacting with input, button, or options inside card
      if (e.target.closest("textarea") || e.target.closest("button") || e.target.closest(".option-pill")) {
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
  // 13. Toolbar Controls & Card Switching
  // ------------------------------------------------------------------------
  // Card Switcher Tabs Click Handlers
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

  // Previous Card Button
  if (btnPrevCard) {
    btnPrevCard.addEventListener("click", () => {
      if (appState.activeCardTypeIndex > 0) {
        renderCardByTypeIndex(appState.activeCardTypeIndex - 1);
      }
    });
  }

  // Next Card Button / View Results
  if (btnNextCard) {
    btnNextCard.addEventListener("click", () => {
      const currentCard = PANITIKARD_DECKS[appState.activeDeckId].cards[appState.activeCardTypeIndex];
      const isSubmitted = !!appState.answers[currentCard.id];
      if (!isSubmitted) return;

      if (appState.activeCardTypeIndex < 6) {
        renderCardByTypeIndex(appState.activeCardTypeIndex + 1);
      } else {
        // Last card completed -> Transition to Results Screen
        renderResultScreen();
        navigateToScreen(screens.result);
      }
    });
  }

  // Back Navigation from Card Arena to Deck Selection
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
  // 14. Final Results Screen Rendering & Review Information
  // ------------------------------------------------------------------------
  function renderResultScreen() {
    stopChallengeTimer();

    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck) return;

    let totalScore = 0;
    let correctCount = 0;
    const maxScore = 7; // Total max points: 5x1 + 1x2 (Bonus) + 1x0 (Reverse) = 7

    deck.cards.forEach((card) => {
      const answerRecord = appState.answers[card.id];
      if (answerRecord) {
        totalScore += (answerRecord.pointsEarned || 0);
        if (answerRecord.isCorrect) correctCount++;
      }
    });

    const percentage = Math.round((totalScore / maxScore) * 100);

    // Update Results Overview
    if (resultStudentGreeting) {
      resultStudentGreeting.textContent = `Binabati kita, ${appState.studentName || "Mag-aaral"}! Natapos mo ang lahat ng 7 kard ng karunungan.`;
    }
    if (resultScoreNum) resultScoreNum.textContent = String(totalScore);
    if (resultScoreMax) resultScoreMax.textContent = String(maxScore);
    if (resultPercentageBadge) resultPercentageBadge.textContent = `${percentage}% Marka`;
    if (resultDeckBadge) resultDeckBadge.textContent = `Deck: ${deck.title}`;

    // Performance Qualitative Assessment
    if (resultPerformanceTitle && resultPerformanceMsg) {
      if (totalScore === 7) {
        resultPerformanceTitle.textContent = "🏆 Perpektong Pagganap!";
        resultPerformanceMsg.textContent = "Natatangi ang iyong kaalaman at pagsusuri sa panitikang Filipino. Ipinamalas mo ang buong karunungan!";
      } else if (totalScore >= 5) {
        resultPerformanceTitle.textContent = "🌟 Napakahusay na Pagsubok!";
        resultPerformanceMsg.textContent = "Malalim ang iyong pag-unawa sa mga pahiwatig at elemento ng akda. May ilang konseptong maaaring repasuhin.";
      } else if (totalScore >= 3) {
        resultPerformanceTitle.textContent = "📖 Magandang Pagsisikap!";
        resultPerformanceMsg.textContent = "May matibay kang pundasyon. Pag-aralan muli ang mga paliwanag at susing salita upang lalong humusay.";
      } else {
        resultPerformanceTitle.textContent = "🌱 Ipagpatuloy ang Pagsasanay!";
        resultPerformanceMsg.textContent = "Huwag panghinaan ng loob. Basahin muli ang mga kaisipan ng akda at subukan muli ang pagsusulit.";
      }
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
            <span class="result-item-title">
              <span>${typeMeta.icon} Kard #${card.number}: ${typeMeta.label}</span>
              <span class="pill-chip">${card.tag}</span>
            </span>
            <span class="result-item-points ${pointsClass}">${pointsBadgeText}</span>
          </div>

          <p class="result-item-prompt">${card.prompt}</p>

          <div class="result-answers-comparison">
            <div class="student-ans-line">
              <strong>👤 Iyong Sagot:</strong> ${escapeHtml(record.userAnswer)}
            </div>
            <div class="correct-ans-line">
              <strong>✓ Tamang Sagot / Batayan:</strong> ${escapeHtml(card.answer)}
            </div>
          </div>

          <div class="result-item-explanation">
            <strong>📚 Paliwanag:</strong> ${card.explanation}
          </div>

          ${record.terms && record.terms.length > 0 ? `
            <div class="result-item-explanation" style="color: #b45309;">
              <strong>🔑 Mga Susing Kaisipan (Keywords):</strong> ${record.terms.map(g => g.join(" / ")).join(" &bull; ")}
            </div>
          ` : ""}
        `;

        resultBreakdownList.appendChild(itemCard);
      });
    }
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
  // 15. Results Action Buttons (Retry, Return to Decks, Home)
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
  // 16. Screen 2.5: Interactive 15-Question Quiz Engine (Alamat & Maikling Kuwento)
  // ------------------------------------------------------------------------
  
  /**
   * Normalizes strings for robust, fair answer validation.
   * Lowercases, collapses whitespace, removes trailing/leading punctuation.
   * @param {string} str
   * @returns {string}
   */
  function normalizeQuizString(str) {
    if (typeof str !== "string") return "";
    return str
      .trim()
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "")
      .replace(/\s+/g, " ");
  }

  /**
   * Validates student answers for all 5 question types.
   * Preserves exact intended answers, supports multi-word situational answers,
   * and enforces single-word limits for Identification and Fill in the Blank.
   * @param {Object} question
   * @param {string} studentInput
   * @returns {boolean}
   */
  function checkQuizAnswer(question, studentInput) {
    if (studentInput === null || studentInput === undefined) return false;
    const qType = question.questionType;
    const normalizedInput = normalizeQuizString(studentInput);
    if (!normalizedInput) return false;

    // 1. Multiple Choice (Compare option key or option text)
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

    // 3 & 4. Identification & Fill in the Blank (Single-word answer)
    if (qType === "identification" || qType === "fill_in_blank") {
      const words = normalizedInput.split(" ").filter(Boolean);
      const expectedNormalized = normalizeQuizString(question.answer);
      const expectedWords = expectedNormalized.split(" ").filter(Boolean);

      // Reject multiple words when single word is expected
      if (expectedWords.length === 1 && words.length > 1) {
        return false;
      }

      const validAnswers = [expectedNormalized];
      if (Array.isArray(question.acceptedAnswers)) {
        question.acceptedAnswers.forEach(alt => validAnswers.push(normalizeQuizString(alt)));
      }
      return validAnswers.includes(normalizedInput);
    }

    // 5. Situational (Supports meaningful multi-word answers, e.g. "Alamat ng hayop", "Pataas na Aksyon")
    if (qType === "situational") {
      const expectedNormalized = normalizeQuizString(question.answer);
      const validAnswers = [expectedNormalized];
      if (Array.isArray(question.acceptedAnswers)) {
        question.acceptedAnswers.forEach(alt => validAnswers.push(normalizeQuizString(alt)));
      }
      return validAnswers.includes(normalizedInput);
    }

    return false;
  }

  /**
   * Fisher-Yates shuffle algorithm for question randomization.
   * Clones items to preserve the original data intact.
   * @param {Array} array
   * @returns {Array}
   */
  function shuffleQuestions(array) {
    const arr = array.map(q => ({ ...q }));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Launches an interactive 15-question quiz immediately.
   * @param {string} quizId 'alamat' or 'maikling-kwento'
   */
  function startQuiz(quizId) {
    const quizDeck = PANITIKARD_DECKS[quizId];
    if (!quizDeck || !Array.isArray(quizDeck.questions)) {
      console.error("Quiz deck questions not found for:", quizId);
      return;
    }

    appState.lastPlayedMode = "quiz";
    quizState.activeQuizId = quizId;
    quizState.questions = shuffleQuestions(quizDeck.questions);
    quizState.currentIndex = 0;
    quizState.currentScore = 0;
    quizState.maxScore = quizState.questions.reduce((sum, q) => sum + (q.points || 1), 0);
    quizState.userAnswers = {};
    quizState.selectedOption = null;
    quizState.isSubmitted = false;

    // Update Header / Meta
    if (quizStudentName) {
      quizStudentName.textContent = appState.studentName || "Mag-aaral";
    }
    if (quizLessonBadge) {
      quizLessonBadge.textContent = quizDeck.title;
    }
    if (quizMaxScore) {
      quizMaxScore.textContent = String(quizState.maxScore);
    }
    if (quizCurrentScore) {
      quizCurrentScore.textContent = "0";
    }

    navigateToScreen(screens.quiz);
    renderQuizQuestion();
  }

  /**
   * Renders the current question and dynamic input controls.
   */
  function renderQuizQuestion() {
    const q = quizState.questions[quizState.currentIndex];
    if (!q) return;

    quizState.selectedOption = null;
    quizState.isSubmitted = false;

    // Progress bar and counter
    const currentNum = quizState.currentIndex + 1;
    const totalNum = quizState.questions.length;
    const pct = Math.round((currentNum / totalNum) * 100);

    if (quizQuestionCounter) quizQuestionCounter.textContent = `Tanong ${currentNum} / ${totalNum}`;
    if (quizProgressBarFill) quizProgressBarFill.style.width = `${pct}%`;

    // Difficulty Badge
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

    // Category and Type Badges
    if (quizCategoryBadge) quizCategoryBadge.textContent = q.category || "Pampanitikan";
    if (quizTypeBadge) {
      const typeLabels = {
        multiple_choice: "Maramihang Pagpipilian",
        identification: "Pagtukoy",
        true_false: "Tama o Mali",
        fill_in_blank: "Punan ang Patlang",
        situational: "Sitwasyonal"
      };
      quizTypeBadge.textContent = typeLabels[q.questionType] || q.questionType;
    }

    // Question Prompt
    if (quizQuestionText) quizQuestionText.textContent = q.question;

    // Reset alert and feedback boxes
    if (quizAlertBox) quizAlertBox.classList.add("hidden");
    if (quizFeedbackBox) quizFeedbackBox.classList.add("hidden");
    if (quizSubmitWrapper) quizSubmitWrapper.classList.remove("hidden");
    if (btnQuizSubmit) btnQuizSubmit.disabled = false;

    // Render Input Area
    if (quizInputContainer) {
      quizInputContainer.innerHTML = "";

      if (q.questionType === "multiple_choice") {
        const grid = document.createElement("div");
        grid.className = "quiz-mc-grid";

        (q.choices || []).forEach((c) => {
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

  /**
   * Evaluates student's answer, awards points, and reveals immediate feedback.
   */
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

    quizState.isSubmitted = true;

    // Lock input elements
    if (btnQuizSubmit) btnQuizSubmit.disabled = true;
    if (quizSubmitWrapper) quizSubmitWrapper.classList.add("hidden");

    const allInputs = quizInputContainer.querySelectorAll("input, button");
    allInputs.forEach(el => el.disabled = true);

    // Validate answer
    const isCorrect = checkQuizAnswer(q, studentInput);
    const pointsEarned = isCorrect ? (q.points || 1) : 0;
    quizState.currentScore += pointsEarned;

    if (quizCurrentScore) {
      quizCurrentScore.textContent = String(quizState.currentScore);
    }

    // Highlight choices visually
    if (q.questionType === "multiple_choice") {
      const opts = quizInputContainer.querySelectorAll(".quiz-mc-option");
      opts.forEach(opt => {
        const key = opt.dataset.key;
        if (key === q.answer) {
          opt.classList.add("opt-correct");
        }
        if (key === studentInput && !isCorrect) {
          opt.classList.add("opt-incorrect");
        }
      });
    } else if (q.questionType === "true_false") {
      const btns = quizInputContainer.querySelectorAll(".quiz-tf-btn");
      btns.forEach(btn => {
        const val = btn.dataset.val;
        if (val.toLowerCase() === q.answer.toLowerCase()) {
          btn.classList.add("opt-correct");
        }
        if (val === studentInput && !isCorrect) {
          btn.classList.add("opt-incorrect");
        }
      });
    }

    // Build correct answer string
    let correctDisplay = q.answer;
    if (q.questionType === "multiple_choice" && q.choices) {
      const found = q.choices.find(c => c.key === q.answer);
      if (found) correctDisplay = `${q.answer}. ${found.text}`;
    }

    // Record answer
    quizState.userAnswers[q.id] = {
      question: q.question,
      category: q.category,
      questionType: q.questionType,
      userAnswer: studentInput,
      correctAnswer: correctDisplay,
      isCorrect,
      pointsEarned,
      maxPoints: q.points || 1,
      explanation: q.explanation
    };

    // Populate Feedback Box
    if (quizFeedbackBox) {
      quizFeedbackBox.className = `quiz-feedback-box ${isCorrect ? "correct" : "incorrect"}`;
      if (quizFeedbackHeader) {
        quizFeedbackHeader.className = `feedback-header ${isCorrect ? "feedback-correct" : "feedback-incorrect"}`;
      }
      if (quizFeedbackIcon) {
        quizFeedbackIcon.textContent = isCorrect ? "✓" : "✗";
      }
      if (quizFeedbackStatus) {
        quizFeedbackStatus.textContent = isCorrect ? "TAMA!" : "MALI";
      }
      if (quizFeedbackPoints) {
        quizFeedbackPoints.textContent = isCorrect 
          ? `+${pointsEarned} ${pointsEarned > 1 ? "Puntos" : "Punto"}`
          : "0 Punto";
      }
      if (quizFeedbackCorrectAnswer) {
        quizFeedbackCorrectAnswer.textContent = correctDisplay;
      }
      if (quizFeedbackExplanation) {
        quizFeedbackExplanation.textContent = q.explanation;
      }

      const isLastQuestion = quizState.currentIndex === quizState.questions.length - 1;
      if (quizNextBtnText) {
        quizNextBtnText.textContent = isLastQuestion 
          ? "Tingnan ang Kabuuang Resulta" 
          : "Susunod na Tanong";
      }

      quizFeedbackBox.classList.remove("hidden");
      quizFeedbackBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // Quiz Action Listeners
  if (btnQuizSubmit) {
    btnQuizSubmit.addEventListener("click", handleQuizSubmission);
  }

  if (btnQuizNext) {
    btnQuizNext.addEventListener("click", () => {
      if (quizState.currentIndex < quizState.questions.length - 1) {
        quizState.currentIndex++;
        renderQuizQuestion();
      } else {
        renderQuizResults();
      }
    });
  }

  if (btnQuizBackDecks) {
    btnQuizBackDecks.addEventListener("click", () => {
      navigateToScreen(screens.deck);
    });
  }

  /**
   * Renders the Final Results Screen for 15-Question Quizzes.
   * Computes dynamic percentage, counts, and card-by-card review.
   */
  function renderQuizResults() {
    const quizDeck = PANITIKARD_DECKS[quizState.activeQuizId];
    const title = quizDeck ? quizDeck.title : "Pagsusulit";

    const totalScore = quizState.currentScore;
    const maxScore = quizState.maxScore;
    const correctCount = Object.values(quizState.userAnswers).filter(a => a.isCorrect).length;
    const incorrectCount = quizState.questions.length - correctCount;
    const percentage = Math.round((totalScore / maxScore) * 100);

    // Student Greeting
    if (resultStudentGreeting) {
      resultStudentGreeting.textContent = `Binabati kita, ${appState.studentName || "Mag-aaral"}! Natapos mo ang ${quizState.questions.length} na katanungan sa ${title}.`;
    }

    if (resultScoreNum) resultScoreNum.textContent = String(totalScore);
    if (resultScoreMax) resultScoreMax.textContent = String(maxScore);
    if (resultPercentageBadge) resultPercentageBadge.textContent = `${percentage}% Marka`;
    if (resultDeckBadge) resultDeckBadge.textContent = `Paksa: ${title}`;

    if (resultCorrectCount) resultCorrectCount.textContent = String(correctCount);
    if (resultIncorrectCount) resultIncorrectCount.textContent = String(incorrectCount);

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

    // Update review section headings
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

        const itemCard = document.createElement("div");
        itemCard.className = `result-item-card ${record.isCorrect ? "result-item-correct" : "result-item-incorrect"}`;

        const pointsBadgeText = record.isCorrect 
          ? `+${record.pointsEarned}/${q.points || 1} pt` 
          : `0/${q.points || 1} pt`;

        itemCard.innerHTML = `
          <div class="result-item-top">
            <span class="result-item-title">
              <span>Tanong #${idx + 1} (${q.category || "Pampanitikan"})</span>
              <span class="pill-chip">${q.questionType}</span>
            </span>
            <span class="result-item-points ${record.isCorrect ? "points-correct" : "points-missed"}">${pointsBadgeText}</span>
          </div>

          <p class="result-item-prompt">${escapeHtml(q.question)}</p>

          <div class="result-answers-comparison">
            <div class="student-ans-line">
              <strong>👤 Iyong Sagot:</strong> ${escapeHtml(record.userAnswer)}
            </div>
            <div class="correct-ans-line">
              <strong>✓ Tamang Sagot:</strong> ${escapeHtml(record.correctAnswer)}
            </div>
          </div>

          <div class="result-item-explanation">
            <strong>📚 Paliwanag:</strong> ${escapeHtml(record.explanation)}
          </div>
        `;

        resultBreakdownList.appendChild(itemCard);
      });
    }

    appState.lastPlayedMode = "quiz";
    navigateToScreen(screens.result);
  }
});
