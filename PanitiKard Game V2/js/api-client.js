/**
 * ==============================================================================
 * PanitiKard V2 - Frontend API Client (Phase 5.1 Foundation)
 * ==============================================================================
 * 
 * Secure, credential-free API client integration for PanitiKard V2.
 * 
 * Security and Preservation Rules:
 * - Never exposes or stores Gemini API keys in client-side code.
 * - Communicates with the PanitiKard Express backend via authenticated JWT bearer token.
 * - Protects the existing 7-card scoring system and preserves Reverse Round behavior.
 * - Always falls back to `PANITIKARD_ANSWER_EVALUATOR` when offline or when backend
 *   is unavailable, ensuring uninterrupted classroom gameplay.
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
   * Communicates with backend Gemini semantic evaluation service.
   * If Gemini is unavailable, fails closed with clear error to prevent false AI evaluation
   * and unearned points. Local fallback is strictly restricted to explicit offline dev mode.
   */
  async function evaluateWrittenAnswer({ questionCode, studentAnswer, cardData = {}, sessionId = null, allowOfflineDevFallback = false }) {
    const gameApi = getGameApi();
    const localEvaluator = getLocalEvaluator();
    const pointsPossible = typeof cardData.points === 'number' ? cardData.points : 1;

    // 1. Attempt Backend AI Semantic Evaluation if configured and authenticated
    if (gameApi && gameApi.enabled && gameApi.hasAccessToken && gameApi.hasAccessToken()) {
      try {
        const aiResponse = await gameApi.evaluateWithGemini(questionCode, studentAnswer, { sessionId });
        if (aiResponse && typeof aiResponse.isSemanticMatch === 'boolean') {
          const rawPoints = typeof aiResponse.pointsEarned === 'number'
            ? aiResponse.pointsEarned
            : (aiResponse.isSemanticMatch ? pointsPossible : 0);
          const pointsEarned = Math.min(pointsPossible, Math.max(0, rawPoints));

          return {
            success: true,
            available: true,
            isCorrect: aiResponse.isSemanticMatch,
            pointsEarned,
            maxPoints: pointsPossible,
            feedback: aiResponse.feedback || '',
            semanticScore: aiResponse.semanticScore ?? (aiResponse.isSemanticMatch ? 1.0 : 0.0),
            confidenceScore: aiResponse.confidenceScore ?? null,
            criteriaEvaluation: aiResponse.criteriaEvaluation || [],
            evaluationMethod: 'gemini_ai',
            model: aiResponse.model || 'gemini-3.5-flash-lite',
            source: 'backend_gemini'
          };
        }
      } catch (err) {
        console.warn('[ApiClient] Backend AI evaluation unavailable:', err.message);
        if (!allowOfflineDevFallback) {
          return {
            success: false,
            available: false,
            isCorrect: false,
            pointsEarned: 0,
            maxPoints: pointsPossible,
            feedback: 'Hindi maabot ang serbisyo ng Gemini AI para sa pagsusuri. Pakisubukang muli.',
            error: err.message,
            errorCode: 'GEMINI_UNAVAILABLE',
            evaluationMethod: 'unavailable',
            source: 'backend_gemini_unavailable'
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
        errorCode: 'GEMINI_UNAVAILABLE',
        evaluationMethod: 'unavailable',
        source: 'backend_gemini_unavailable'
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
   * Retrieves the backend Gemini service status without exposing credentials.
   */
  async function getGeminiEvaluationStatus() {
    const gameApi = getGameApi();
    if (!gameApi || !gameApi.enabled) {
      return {
        configured: false,
        provider: 'Google Gemini',
        phase: '5.2-actual-gemini',
        status: 'unconfigured'
      };
    }

    try {
      const status = await gameApi.getGeminiStatus();
      return status || { configured: false, phase: '5.2-actual-gemini', status: 'unconfigured' };
    } catch (err) {
      return {
        configured: false,
        error: err.message,
        phase: '5.2-actual-gemini',
        status: 'provider_error'
      };
    }
  }

  /**
   * Validates the official RPC response from submit_game_answer.
   * Rejects missing, malformed, incomplete, non-numeric, or negative scores.
   * Ensures official scoring NEVER falls back to Gemini evaluation.
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
    getGeminiEvaluationStatus,
    validateOfficialRpcResponse
  };

  root.PANITIKARD_API_CLIENT = apiClient;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = apiClient;
  }
})(typeof window !== 'undefined' ? window : globalThis);

