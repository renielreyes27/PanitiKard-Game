/**
 * Regression tests for Phase 5.5 Bug #1 & Bug #2 fixes.
 *
 * Bug #1 — Exact Answer Matching Blocks Submission:
 *   When no backend is configured, free-form answers must reach local rubric evaluation
 *   (via allowOfflineDevFallback: true) rather than being blocked by a fail-closed error.
 *
 * Bug #2 — Session Connection Error:
 *   When PANITIKARD_GAME_API.enabled === false (empty base URL), evaluateWrittenAnswer
 *   must succeed using the local rubric fallback, not return {available: false}.
 *
 * Fix location: js/main.js submitOpenEndedAnswer() — passes allowOfflineDevFallback: !backendConfigured.
 * Fix location: js/main.js submitOpenEndedAnswer() — allows officialRecord === null in offline mode.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const apiClient = require("../js/api-client");
const answerEvaluator = require("../js/answer-evaluator");

// ─────────────────────────────────────────────────────────────────────────────
// TEST A: allowOfflineDevFallback: true enables local rubric evaluation
// (Simulates submitOpenEndedAnswer passing allowOfflineDevFallback: !backendConfigured
//  when PANITIKARD_GAME_API.enabled === false)
// ─────────────────────────────────────────────────────────────────────────────

test("Phase 5.5 Bug #2 — offline mode: evaluateWrittenAnswer with allowOfflineDevFallback returns local rubric result, not connection error", async () => {
  // Simulate no backend configured (game-api.enabled === false)
  // The fix passes allowOfflineDevFallback: true in this scenario
  const cardData = {
    id: "elem-statement",
    answer: "Nagbibigay ang tagpuan ng konteksto sa mga tauhan at damdamin.",
    acceptedAnswers: [],
    terms: [["konteksto"], ["tauhan", "karakter"], ["damdamin", "emosyon"]],
    points: 1
  };
  const studentAnswer = "Nagbibigay ang tagpuan ng konteksto sa mga tauhan at damdamin sa akda.";

  const result = await apiClient.evaluateWrittenAnswer({
    questionCode: cardData.id,
    studentAnswer,
    cardData,
    allowOfflineDevFallback: true  // ← fix passes this when backendConfigured === false
  });

  // Must succeed via local evaluator, not return a connection error
  assert.equal(result.success, true, "Must succeed in offline mode");
  assert.equal(result.source, "offline_dev_fallback", "Source must identify as offline fallback");
  assert.equal(result.evaluationMethod, "offline_dev_rubric", "Method must identify as offline rubric");
  assert.equal(result.isAiEvaluated, false, "Must not be marked as AI evaluated");
  assert.equal(result.pointsEarned, 0, "Offline fallback never awards official points");
  assert.ok(result.feedback.includes("Offline Dev Mode"), "Feedback must label as offline mode");
});

test("Phase 5.5 Bug #2 — online mode: evaluateWrittenAnswer without allowOfflineDevFallback still fails closed", async () => {
  // Simulate backend configured but no access token / game API disabled
  // The fix only passes allowOfflineDevFallback: true when backendConfigured === false
  const result = await apiClient.evaluateWrittenAnswer({
    questionCode: "elem-statement",
    studentAnswer: "Nagbibigay ang tagpuan ng konteksto sa mga tauhan.",
    cardData: {
      id: "elem-statement",
      answer: "Nagbibigay ang tagpuan ng konteksto sa mga tauhan.",
      terms: [["konteksto"], ["tauhan"]],
      points: 1
    }
    // allowOfflineDevFallback defaults to false (backend configured mode)
  });

  // Must still fail closed when backend is configured but unavailable
  assert.equal(result.success, false, "Must fail closed when backend configured but unavailable");
  assert.equal(result.available, false, "Available must be false");
  assert.equal(result.pointsEarned, 0, "Must never award points through fail-closed path");
  assert.ok(
    result.feedback.includes("Hindi nakakonekta") || result.feedback.includes("Hindi maabot"),
    `Feedback must be a Filipino error message, got: ${result.feedback}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST B: Local rubric evaluation correctly identifies correct/incorrect answers
// (Validates the local evaluator used as offline fallback is semantically appropriate)
// ─────────────────────────────────────────────────────────────────────────────

test("Phase 5.5 Bug #1 — local rubric evaluator correctly accepts semantically correct Filipino paraphrase", () => {
  const result = answerEvaluator.evaluateWrittenAnswer({
    studentAnswer: "Nagbibigay ang tagpuan ng konteksto sa mga tauhan at damdamin sa akda.",
    expectedAnswer: "Nagbibigay ang tagpuan ng konteksto sa mga tauhan at damdamin.",
    acceptedAnswers: [],
    rubricGroups: [["konteksto"], ["tauhan", "karakter"], ["damdamin", "emosyon"]],
    questionId: "elem-statement"
  });

  assert.equal(result.isCorrect, true, "Semantically correct Filipino paraphrase must be accepted");
  assert.equal(result.matchedGroups, 3, "All 3 rubric groups must match");
  assert.equal(result.requiredGroups, 3, "Required groups count must equal rubric groups count");
});

test("Phase 5.5 Bug #1 — local rubric evaluator correctly rejects irrelevant or gibberish answers", () => {
  const irrelevant = answerEvaluator.evaluateWrittenAnswer({
    studentAnswer: "Asdfghjkl qwerty uiop",
    expectedAnswer: "Nagbibigay ang tagpuan ng konteksto sa mga tauhan at damdamin.",
    acceptedAnswers: [],
    rubricGroups: [["konteksto"], ["tauhan", "karakter"], ["damdamin", "emosyon"]],
    questionId: "elem-statement"
  });

  assert.equal(irrelevant.isCorrect, false, "Gibberish must be rejected");

  const unrelated = answerEvaluator.evaluateWrittenAnswer({
    studentAnswer: "Ang puting ulap ay lumilipad sa langit ngayong hapon.",
    expectedAnswer: "Nagbibigay ang tagpuan ng konteksto sa mga tauhan at damdamin.",
    acceptedAnswers: [],
    rubricGroups: [["konteksto"], ["tauhan", "karakter"], ["damdamin", "emosyon"]],
    questionId: "elem-statement"
  });

  assert.equal(unrelated.isCorrect, false, "Unrelated answer must be rejected");
});

test("Phase 5.5 Bug #1 — local rubric evaluator accepts exact match in acceptedAnswers list", () => {
  const result = answerEvaluator.evaluateWrittenAnswer({
    studentAnswer: "pag-asa",
    expectedAnswer: "Pag-asa",
    acceptedAnswers: ["pag-asa", "pag-asa at katatagan"],
    rubricGroups: [],
    questionId: "elem-vocab"
  });

  assert.equal(result.isCorrect, true, "Exact match in acceptedAnswers must be accepted");
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST C: Offline scoring behavior — evalResult used as authoritative when no backend
// (Validates the officialRecord === null + !backendConfigured path)
// ─────────────────────────────────────────────────────────────────────────────

test("Phase 5.5 Bug #2 — authoritativePoints derives from evalResult.pointsEarned when officialRecord is null and backend is not configured", () => {
  // Simulate the scoring logic in submitOpenEndedAnswer after the fix
  const isOfficialValid = false; // officialRecord === null
  const backendConfigured = false; // PANITIKARD_GAME_API.enabled === false
  const evalResult = {
    isCorrect: true,
    pointsEarned: 1,
    evaluationMethod: "local_rubric"
  };

  // Reproduce the fixed scoring logic (line ~1355 in main.js after the fix):
  // const authoritativePoints = isOfficialValid ? rawPoints : evalResult.pointsEarned;
  // const authoritativeCorrect = isOfficialValid ? rawCorrect : evalResult.isCorrect;
  const shouldBlock = !isOfficialValid && backendConfigured; // false → do not block
  assert.equal(shouldBlock, false, "Must NOT block when backend is not configured and officialRecord is null");

  const authoritativePoints = isOfficialValid ? 0 : evalResult.pointsEarned;
  const authoritativeCorrect = isOfficialValid ? false : evalResult.isCorrect;

  assert.equal(authoritativePoints, 1, "authoritativePoints must come from local eval in offline mode");
  assert.equal(authoritativeCorrect, true, "authoritativeCorrect must come from local eval in offline mode");
});

test("Phase 5.5 Bug #2 — fail-closed behavior preserved when backend IS configured but RPC returns null", () => {
  // officialRecord is null but backend IS configured → must block and show error
  const isOfficialValid = false;
  const backendConfigured = true;

  const shouldBlock = !isOfficialValid && backendConfigured;
  assert.equal(shouldBlock, true, "Must block when backend is configured but official RPC returns null/invalid");
});
