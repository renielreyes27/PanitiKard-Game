const test = require("node:test");
const assert = require("node:assert/strict");
const { PANITIKARD_DECKS } = require("../js/cards-data.js");
const evaluator = require("../js/answer-evaluator.js");

const writtenQuizTypes = new Set(["identification", "fill_in_blank", "situational"]);

function evaluateQuizAnswer(question, answer) {
  return evaluator.evaluateWrittenAnswer({
    studentAnswer: answer,
    expectedAnswer: question.answer,
    acceptedAnswers: question.acceptedAnswers || [],
    questionId: question.id
  });
}

test("all open-ended card answer keys are accepted", () => {
  for (const deck of Object.values(PANITIKARD_DECKS)) {
    for (const card of (deck.cards || []).filter(item => !item.options?.length)) {
      const result = evaluator.evaluateWrittenAnswer({
        studentAnswer: card.answer,
        expectedAnswer: card.answer,
        rubricGroups: card.terms || [],
        questionId: card.id
      });
      assert.equal(result.isCorrect, true, `expected answer for ${card.id}`);
    }
  }
});

test("unrelated short responses receive zero-credit correctness", () => {
  const result = evaluator.evaluateWrittenAnswer({
    studentAnswer: "mas mabilis",
    expectedAnswer: "Nagbibigay ang tunggalian ng konteksto sa kilos at damdamin ng tauhan.",
    rubricGroups: [["konteksto", "kaligiran"], ["tauhan", "karakter"]],
    questionId: "elem-conflict-explanation"
  });
  assert.equal(result.isCorrect, false);
});

test("a complete paraphrase matching each card rubric group is accepted", () => {
  const card = PANITIKARD_DECKS.elements.cards.find(item => item.id === "elem-statement");
  const result = evaluator.evaluateWrittenAnswer({
    studentAnswer: "Nagbibigay konteksto sa kilos at damdamin ng mga tauhan",
    expectedAnswer: card.answer,
    rubricGroups: card.terms,
    questionId: card.id
  });
  assert.equal(result.isCorrect, true);
});

test("a partial keyword-only answer does not satisfy the card rubric", () => {
  const card = PANITIKARD_DECKS.elements.cards.find(item => item.id === "elem-statement");
  const result = evaluator.evaluateWrittenAnswer({
    studentAnswer: "konteksto sa tauhan",
    expectedAnswer: card.answer,
    rubricGroups: card.terms,
    questionId: card.id
  });
  assert.equal(result.isCorrect, false);
});

test("written quiz answer keys and teacher-approved alternatives are accepted", () => {
  for (const deck of Object.values(PANITIKARD_DECKS)) {
    for (const question of (deck.questions || []).filter(item => writtenQuizTypes.has(item.questionType))) {
      for (const answer of [question.answer, ...(question.acceptedAnswers || [])]) {
        assert.equal(evaluateQuizAnswer(question, answer).isCorrect, true, `${question.id}: ${answer}`);
      }
    }
  }
});

test("every written quiz question has its own paraphrase rubric", () => {
  for (const deck of Object.values(PANITIKARD_DECKS)) {
    for (const question of (deck.questions || []).filter(item => writtenQuizTypes.has(item.questionType))) {
      assert.ok(evaluator.quizRubrics[question.id]?.length, `missing question-specific rubric for ${question.id}`);
    }
  }
});

test("quiz paraphrases must cover all question-specific rubric groups", () => {
  const sharing = PANITIKARD_DECKS.alamat.questions.find(item => item.id === "alamat-q6");
  assert.equal(evaluateQuizAnswer(sharing, "Pagbabahagi ng pagkain sa kapwa").isCorrect, true);
  assert.equal(evaluateQuizAnswer(sharing, "mas mabilis").isCorrect, false);
});
