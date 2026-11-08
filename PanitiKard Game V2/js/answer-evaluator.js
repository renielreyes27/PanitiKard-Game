/**
 * Question-specific, deterministic written-answer evaluator.
 * This is local rubric evaluation only; no Gemini or other AI service is called.
 * Future server-side evaluation can consume the same question/answer/rubric payload.
 */
(function (root) {
  "use strict";

  const QUIZ_RUBRICS = {
    "alamat-q2": [["tauhan", "karakter", "persona"], ["gumaganap", "kumikilos", "ginagampanan"]],
    "alamat-q4": [["alamat", "salaysay", "kuwento", "panitikan"], ["pinagmulan", "pinanggalingan"], ["bagay", "lugar", "pangyayari", "halaman", "hayop"]],
    "alamat-q6": [["pagbabahagi", "pagbahagi", "mapagbahagi", "mapagbigay", "bukas palad"], ["pagkain", "kaibigan", "kapwa", "pagbibigay"]],
    "alamat-q8": [["tema", "paksa"], ["kaisipan", "diwa", "mensahe", "aral"]],
    "alamat-q11": [["alamat"], ["hayop", "ibon", "isda", "nilalang"]],
    "alamat-q12": [["dahilan", "sanhi", "motibo", "kadahilanan"], ["kilos", "desisyon", "ginagawa", "tauhan"]],
    "alamat-q15": [["pagpapakumbaba", "pagkumbaba", "mapagpakumbaba"], ["tawad", "paghingi", "pag-amin", "pagsisisi", "pagkakamali"]],
    "mk-q2": [["tauhan", "karakter", "persona"], ["gumaganap", "kumikilos", "ginagampanan"]],
    "mk-q4": [["tagpuan", "lugar", "pook"], ["panahon", "kapaligiran", "klima", "tag-ulan"]],
    "mk-q6": [["banghay", "balangkas", "daloy", "pagkakasunod"], ["sunod-sunod", "pangyayari"]],
    "mk-q7": [["kasukdulan", "climax", "pinakamataas", "pinakamatindi"], ["tensiyon", "kapanabikan", "bahagi"]],
    "mk-q10": [["pataas na aksyon", "pataas na aksiyon", "saglit na kasiglahan", "paakyat", "pataas"], ["pangyayari", "suliranin", "kasukdulan"]],
    "mk-q12": [["tema", "paksa"], ["kaisipan", "diwa", "mensahe", "aral"]],
    "mk-q13": [["katatawanan", "katatawa", "nakakatawa"], ["magpatawa", "patawa", "tawanan", "aliw"]],
    "mk-q15": [["katapatan", "matapat"], ["tiwala", "pagsisinungaling", "totoo", "katotohanan"]]
  };

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function includesTerm(normalizedText, term) {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return false;
    return (` ${normalizedText} `).includes(` ${normalizedTerm} `);
  }

  function evaluateWrittenAnswer({ studentAnswer, expectedAnswer, acceptedAnswers = [], rubricGroups = [], questionId = "" }) {
    const response = normalize(studentAnswer);
    const expected = normalize(expectedAnswer);
    const accepted = [expected, ...acceptedAnswers.map(normalize)].filter(Boolean);
    const exactMatch = accepted.includes(response);

    if (!response) {
      return { isCorrect: false, method: "local_rubric", matchedGroups: 0, requiredGroups: rubricGroups.length };
    }
    if (exactMatch) {
      return { isCorrect: true, method: "local_rubric", matchedGroups: rubricGroups.length, requiredGroups: rubricGroups.length };
    }

    const questionRubric = rubricGroups.length ? rubricGroups : (QUIZ_RUBRICS[questionId] || []);
    if (!questionRubric.length) {
      return { isCorrect: false, method: "local_rubric", matchedGroups: 0, requiredGroups: 0 };
    }

    const matchedGroups = questionRubric.filter((group) =>
      group.some((term) => includesTerm(response, term))
    ).length;
    const wordCount = response.split(" ").filter(Boolean).length;
    const isCorrect = wordCount >= 3 && matchedGroups === questionRubric.length;

    return {
      isCorrect,
      method: "local_rubric",
      matchedGroups,
      requiredGroups: questionRubric.length
    };
  }

  const evaluator = { normalize, evaluateWrittenAnswer, quizRubrics: QUIZ_RUBRICS };
  root.PANITIKARD_ANSWER_EVALUATOR = evaluator;
  if (typeof module !== "undefined" && module.exports) module.exports = evaluator;
})(typeof globalThis !== "undefined" ? globalThis : this);
