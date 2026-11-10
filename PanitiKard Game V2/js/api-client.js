/**
 * ==============================================================================
 * PanitiKard V2 - Frontend API Client
 * ==============================================================================
 *
 * Secure, credential-free API client integration for PanitiKard V2.
 *
 * Security and Preservation Rules:
 * - Never exposes or stores API keys in client-side code.
 * - Communicates with the PanitiKard Express backend via authenticated JWT bearer token.
 * - Protects the existing 7-card scoring system and preserves Reverse Round behavior.
 * - Always falls back to `PANITIKARD_ANSWER_EVALUATOR` when offline or when backend
 *   is unavailable, ensuring uninterrupted classroom gameplay.
 * - Backend evaluation is fully deterministic — no external AI or Gemini API required.
 */
(function (root) {
  "use strict";

  function getGameApi() {
    return root.PANITIKARD_GAME_API || (typeof require !== 'undefined' ? require('./game-api') : null);
  }

  function getLocalEvaluator() {
    return root.PANITIKARD_ANSWER_EVALUATOR || (typeof require !== 'undefined' ? require('./answer-evaluator') : null);
  }

  /**
   * Evaluates a student's written response (Statement, Correction, open-ended cards).
   * Communicates with the backend deterministic rubric-based evaluator.
   * If the backend is unavailable, fails closed with a clear error to prevent false
   * evaluation and unearned points. Local fallback is strictly restricted to explicit
   * offline dev mode only.
   */
  async function evaluateWrittenAnswer({ questionCode, studentAnswer, cardData = {}, sessionId = null, allowOfflineDevFallback = false }) {
    const gameApi = getGameApi();
    const localEvaluator = getLocalEvaluator();
    const pointsPossible = typeof cardData.points === 'number' ? cardData.points : 1;

    // 1. Attempt Backend Rubric Evaluation if configured and authenticated (or active guest session)
    const hasActiveToken = (typeof gameApi?.hasAccessToken === 'function' && gameApi.hasAccessToken()) ||
      (typeof gameApi?.hasSessionToken === 'function' && gameApi.hasSessionToken()) ||
      Boolean(sessionId);

    if (gameApi && gameApi.enabled && hasActiveToken) {
      try {
        const evaluateFn = typeof gameApi.evaluateAnswer === 'function'
          ? gameApi.evaluateAnswer.bind(gameApi)
          : (typeof gameApi.evaluateWithGemini === 'function' ? gameApi.evaluateWithGemini.bind(gameApi) : null);
        if (!evaluateFn) throw new Error('Evaluation function unavailable on gameApi');
        const evalResponse = await evaluateFn(questionCode, studentAnswer, { sessionId });
        if (evalResponse && typeof evalResponse.isSemanticMatch === 'boolean') {
          const rawPoints = typeof evalResponse.pointsEarned === 'number'
            ? evalResponse.pointsEarned
            : (evalResponse.isSemanticMatch ? pointsPossible : 0);
          const pointsEarned = Math.min(pointsPossible, Math.max(0, rawPoints));

          const defaultMethod = (evalResponse.model && String(evalResponse.model).includes('gemini')) ? 'gemini_ai' : 'deterministic_rubric';
          const defaultSource = (evalResponse.model && String(evalResponse.model).includes('gemini')) ? 'backend_gemini' : 'backend_rubric';

          return {
            success: true,
            available: true,
            isCorrect: evalResponse.isSemanticMatch,
            pointsEarned,
            maxPoints: pointsPossible,
            feedback: evalResponse.feedback || '',
            expectedAnswer: evalResponse.expectedAnswer || evalResponse.correctAnswer || '',
            correctAnswer: evalResponse.correctAnswer || evalResponse.expectedAnswer || '',
            semanticScore: evalResponse.semanticScore ?? (evalResponse.isSemanticMatch ? 1.0 : 0.0),
            confidenceScore: evalResponse.confidenceScore ?? null,
            criteriaEvaluation: evalResponse.criteriaEvaluation || [],
            evaluationMethod: evalResponse.evaluationMethod || defaultMethod,
            model: evalResponse.model || 'deterministic_rubric_v1',
            source: evalResponse.source || defaultSource
          };
        }
      } catch (err) {
        console.warn('[ApiClient] Backend evaluation unavailable:', err.message);
        if (!allowOfflineDevFallback) {
          return {
            success: false,
            available: false,
            isCorrect: false,
            pointsEarned: 0,
            maxPoints: pointsPossible,
            feedback: 'Hindi maabot ang serbisyo ng pagsusuri. Pakisubukang muli.',
            error: err.message,
            errorCode: 'EVALUATOR_UNAVAILABLE',
            evaluationMethod: 'unavailable',
            source: 'backend_rubric_unavailable'
          };
        }
      }
    } else if (!allowOfflineDevFallback) {
      return {
        success: false,
        available: false,
        isCorrect: false,
        pointsEarned: 0,
        maxPoints: pointsPossible,
        feedback: 'Hindi nakakonekta ang sesyon sa serbisyo ng pagsusuri. Pakisubukang muli.',
        error: 'AUTH_OR_API_DISABLED',
        errorCode: 'EVALUATOR_UNAVAILABLE',
        evaluationMethod: 'unavailable',
        source: 'backend_rubric_unavailable'
      };
    }

    // 2. Explicit Offline / Dev Mode Fallback (ONLY when allowOfflineDevFallback is true)
    // Strictly labeled as offline dev mode and does NOT award points
    if (localEvaluator && typeof localEvaluator.evaluateWrittenAnswer === 'function') {
      const local = localEvaluator.evaluateWrittenAnswer({
        studentAnswer,
        expectedAnswer: cardData.answer || '',
        acceptedAnswers: cardData.acceptedAnswers || [],
        rubricGroups: cardData.terms || [],
        questionId: questionCode
      });

      return {
        success: true,
        available: true,
        isCorrect: local.isCorrect,
        pointsEarned: 0, // Fallback NEVER awards points
        maxPoints: pointsPossible,
        expectedAnswer: cardData.answer || '',
        correctAnswer: cardData.answer || '',
        feedback: local.isCorrect
          ? 'Pansamantalang Pagsusuri (Offline Dev Mode): Tugma ang sagot sa lokal na pamantayan.'
          : 'Pansamantalang Pagsusuri (Offline Dev Mode): Hindi naabot ang lokal na pamantayan.',
        semanticScore: local.isCorrect ? 1.0 : 0.0,
        confidenceScore: null,
        criteriaEvaluation: [],
        evaluationMethod: 'offline_dev_rubric',
        matchedGroups: local.matchedGroups,
        requiredGroups: local.requiredGroups,
        isAiEvaluated: false,
        source: 'offline_dev_fallback'
      };
    }

    // 3. Fallback exhausted
    return {
      success: false,
      available: false,
      isCorrect: false,
      pointsEarned: 0,
      maxPoints: pointsPossible,
      feedback: 'Walang magagamit na serbisyo ng pagsusuri.',
      evaluationMethod: 'unavailable',
      source: 'offline_dev_fallback'
    };
  }

  /**
   * Retrieves the backend evaluation service status.
   */
  async function getEvaluationStatus() {
    const gameApi = getGameApi();
    if (!gameApi || !gameApi.enabled) {
      return {
        configured: false,
        provider: 'PanitiKard Deterministic Rubric Evaluator',
        phase: 'deterministic-rubric-v1',
        status: 'unconfigured'
      };
    }

    try {
      const status = await gameApi.getEvaluationStatus();
      return status || { configured: false, phase: 'deterministic-rubric-v1', status: 'unconfigured' };
    } catch (err) {
      return {
        configured: false,
        error: err.message,
        phase: 'deterministic-rubric-v1',
        status: 'unavailable'
      };
    }
  }

  /**
   * @deprecated Use getEvaluationStatus() instead. Kept for backward compat.
   */
  async function getGeminiEvaluationStatus() {
    return getEvaluationStatus();
  }

  /**
   * Validates the official RPC response from submit_game_answer.
   * Rejects missing, malformed, incomplete, non-numeric, or negative scores.
   * Ensures official scoring NEVER falls back to evaluator results.
   */
  function validateOfficialRpcResponse(officialRecord) {
    if (!officialRecord || typeof officialRecord !== 'object') {
      return null;
    }

    const rawPoints = typeof officialRecord.pointsAwarded === 'number'
      ? officialRecord.pointsAwarded
      : (typeof officialRecord.answer?.pointsAwarded === 'number' ? officialRecord.answer.pointsAwarded : null);

    const rawCorrect = typeof officialRecord.isCorrect === 'boolean'
      ? officialRecord.isCorrect
      : (typeof officialRecord.answer?.isCorrect === 'boolean' ? officialRecord.answer.isCorrect : null);

    if (rawPoints === null || !Number.isFinite(rawPoints) || rawPoints < 0 || rawCorrect === null) {
      return null;
    }

    return {
      pointsAwarded: rawPoints,
      isCorrect: rawCorrect,
      maxPoints: typeof officialRecord.maxPoints === 'number'
        ? officialRecord.maxPoints
        : (officialRecord.answer?.maxPoints || 1),
      evaluationMethod: officialRecord.evaluationMethod || officialRecord.answer?.evaluationMethod || 'submit_game_answer'
    };
  }

  const apiClient = {
    evaluateWrittenAnswer,
    getEvaluationStatus,
    getGeminiEvaluationStatus, // backward-compat alias
    validateOfficialRpcResponse
  };

  root.PANITIKARD_API_CLIENT = apiClient;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = apiClient;
  }
})(typeof window !== 'undefined' ? window : globalThis);

