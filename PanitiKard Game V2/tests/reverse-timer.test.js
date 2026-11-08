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
  const reverseTimerBadge = createMockElement();
  const reverseTimerSeconds = createMockElement();
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

  assert.equal(h.reverseTimerSeconds.textContent, "30");
  assert.equal(h.reverseHeaderTimerSeconds.textContent, "30");
  assert.equal(h.reverseTimerBadge.classList.contains("hidden"), false);
  assert.equal(h.reverseHeaderTimerBadge.classList.contains("hidden"), false);
  assert.equal(h.reverseState.timerId, null); // Not ticking yet because card is still facing back
});

test("untimed Reverse question keeps timer hidden and does not start timer", () => {
  const h = setupReverseTimerHarness();
  h.reverseState.selectedQuestions = [{ id: "elem-question", timeLimit: null, points: 1 }];
  h.renderReverseCard();

  assert.equal(h.reverseTimerBadge.classList.contains("hidden"), true);
  assert.equal(h.reverseHeaderTimerBadge.classList.contains("hidden"), true);
  assert.equal(h.reverseState.timerId, null);

  // Flipping card still does not start timer for untimed question
  h.toggleReverseCardFlip();
  assert.equal(h.reverseState.timerId, null);
  assert.equal(h.reverseTimerBadge.classList.contains("hidden"), true);
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
  assert.equal(h.reverseTimerBadge.classList.contains("hidden"), true);
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
  assert.equal(h.reverseTimerSeconds.textContent, "30");
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
  assert.equal(h.reverseTimerBadge.classList.contains("timer-warning"), false);
});
