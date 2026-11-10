const { HttpError } = require('../middleware/httpError');

const CARD_CATEGORIES = new Set(['question', 'statement', 'correction', 'bonus', 'reverse', 'help', 'challenge']);
const QUESTION_TYPES = new Set(['multiple_choice', 'identification', 'true_false', 'fill_in_blank', 'situational', 'open_ended']);

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_BODY', `${label} must be a JSON object.`);
  }
  return value;
}

function requireText(value, label, max = 4000, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) {
    throw new HttpError(400, 'INVALID_FIELD', `${label} must be a${allowEmpty ? '' : ' non-empty'} string up to ${max} characters.`);
  }
  return value.trim();
}

function validateQuestionInput(raw) {
  const body = requireObject(raw, 'Question');
  const code = requireText(body.code, 'code', 120);
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(code)) throw new HttpError(400, 'INVALID_CODE', 'code must use lowercase letters, digits, or hyphens.');
  const questionType = requireText(body.questionType, 'questionType', 40);
  if (!QUESTION_TYPES.has(questionType)) throw new HttpError(400, 'INVALID_QUESTION_TYPE', 'Unsupported question type.');
  const cardCategory = body.cardCategory == null ? null : requireText(body.cardCategory, 'cardCategory', 40);
  if (cardCategory && !CARD_CATEGORIES.has(cardCategory)) throw new HttpError(400, 'INVALID_CARD_CATEGORY', 'Unsupported card category.');
  const points = body.points ?? 1;
  if (!Number.isInteger(points) || points < 0 || points > 100) throw new HttpError(400, 'INVALID_POINTS', 'points must be an integer from 0 to 100.');
  const timeLimit = body.timeLimitSeconds ?? null;
  if (timeLimit !== null && (!Number.isInteger(timeLimit) || timeLimit < 1 || timeLimit > 3600)) {
    throw new HttpError(400, 'INVALID_TIME_LIMIT', 'timeLimitSeconds must be an integer from 1 to 3600.');
  }
  const acceptedAnswers = body.acceptedAnswers ?? [];
  const rubricGroups = body.rubricGroups ?? [];
  const choices = body.choices ?? [];
  if (!Array.isArray(acceptedAnswers) || acceptedAnswers.some(item => typeof item !== 'string' || item.length > 1000)) {
    throw new HttpError(400, 'INVALID_ACCEPTED_ANSWERS', 'acceptedAnswers must be an array of strings.');
  }
  if (!Array.isArray(rubricGroups) || rubricGroups.length > 40 || rubricGroups.some(group =>
    !Array.isArray(group) || !group.length || group.some(term => typeof term !== 'string' || !term.trim() || term.length > 200)
  )) throw new HttpError(400, 'INVALID_RUBRIC', 'rubricGroups must be arrays of non-empty keyword strings.');
  if (!Array.isArray(choices) || choices.length > 30 || choices.some(choice =>
    !choice || typeof choice.key !== 'string' || typeof choice.text !== 'string' || choice.text.length > 1000
  )) throw new HttpError(400, 'INVALID_CHOICES', 'choices must be an array of {key, text} objects.');
  if (questionType === 'multiple_choice' && (!body.answerKey || !choices.some(choice => choice.key === String(body.answerKey)))) {
    throw new HttpError(400, 'INVALID_ANSWER_KEY', 'Multiple-choice questions require an answerKey that matches one choice key.');
  }
  if (!['multiple_choice', 'true_false'].includes(questionType) && !body.expectedAnswer && !body.answerKey) {
    throw new HttpError(400, 'EXPECTED_ANSWER_REQUIRED', 'Written questions require an expectedAnswer or answerKey.');
  }

  return {
    code,
    questionType,
    cardCategory,
    title: requireText(body.title ?? '', 'title', 250, true),
    prompt: requireText(body.prompt, 'prompt', 4000),
    expectedAnswer: body.expectedAnswer == null ? null : requireText(body.expectedAnswer, 'expectedAnswer', 4000, true),
    answerKey: body.answerKey == null ? null : requireText(String(body.answerKey), 'answerKey', 250),
    acceptedAnswers,
    rubricGroups,
    explanation: requireText(body.explanation ?? '', 'explanation', 4000, true),
    hint: body.hint == null ? null : requireText(body.hint, 'hint', 1000, true),
    points,
    timeLimitSeconds: timeLimit,
    difficulty: body.difficulty ?? null,
    categoryLabel: body.categoryLabel == null ? null : requireText(body.categoryLabel, 'categoryLabel', 120, true),
    tag: body.tag == null ? null : requireText(body.tag, 'tag', 120, true),
    choices,
    payload: body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {}
  };
}

module.exports = { validateQuestionInput, requireText, requireObject, CARD_CATEGORIES, QUESTION_TYPES };
