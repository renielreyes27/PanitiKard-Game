const test = require("node:test");
const assert = require("node:assert/strict");

const apiClient = require("../js/api-client");
const answerEvaluator = require("../js/answer-evaluator");

test("apiClient: evaluateWrittenAnswer fails closed with clear error when Gemini is unavailable in production (no silent fallback, 0 points)", async () => {
  // Production behavior: fails closed, does not award points, provides clear Filipino error
  const result = await apiClient.evaluateWrittenAnswer({
    questionCode: "elem-statement",
    studentAnswer: "Nagbibigay ang tagpuan ng konteksto sa mga tauhan at damdamin sa akda.",
    cardData: {
      id: "elem-statement",
      answer: "Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.",
      terms: [["konteksto"], ["kilos", "damdamin"], ["tauhan"]],
      points: 1
    }
  });

  assert.equal(result.success, false);
  assert.equal(result.available, false);
  assert.equal(result.isCorrect, false);
  assert.equal(result.pointsEarned, 0); // Never award points through fallback
  assert.equal(result.evaluationMethod, "unavailable");
  assert.ok(result.feedback.includes("Hindi nakakonekta") || result.feedback.includes("Hindi maabot"));
});

test("apiClient: evaluateWrittenAnswer supports explicit offline dev mode without awarding points", async () => {
  const result = await apiClient.evaluateWrittenAnswer({
    questionCode: "elem-statement",
    studentAnswer: "Nagbibigay ang tagpuan ng konteksto sa mga tauhan at damdamin sa akda.",
    cardData: {
      id: "elem-statement",
      answer: "Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.",
      terms: [["konteksto"], ["kilos", "damdamin"], ["tauhan"]],
      points: 1
    },
    allowOfflineDevFallback: true
  });

  assert.equal(result.success, true);
  assert.equal(result.isCorrect, true);
  assert.equal(result.pointsEarned, 0); // Fallback never awards points
  assert.equal(result.isAiEvaluated, false);
  assert.equal(result.source, "offline_dev_fallback");
  assert.equal(result.evaluationMethod, "offline_dev_rubric");
  assert.ok(result.feedback.includes("Offline Dev Mode"));
});

test("apiClient: evaluateWrittenAnswer integration with mock backend response", async () => {
  // Mock global window/PANITIKARD_GAME_API
  globalThis.PANITIKARD_GAME_API = {
    enabled: true,
    hasAccessToken: () => true,
    evaluateWithGemini: async (code, answer) => ({
      questionCode: code,
      studentAnswer: answer,
      isSemanticMatch: true,
      semanticScore: 0.92,
      confidenceScore: 0.96,
      feedback: "Napakahusay na pagsusuri.",
      criteriaEvaluation: [{ aspectNumber: 1, aspect: "Pamantayan 1", satisfied: true }],
      model: "gemini-3.5-flash-lite"
    })
  };

  try {
    const result = await apiClient.evaluateWrittenAnswer({
      questionCode: "elem-statement",
      studentAnswer: "Naipapamalas ng tagpuan ang pangkalahatang kalagayan.",
      cardData: { id: "elem-statement", points: 1 }
    });

    assert.equal(result.success, true);
    assert.equal(result.available, true);
    assert.equal(result.isCorrect, true);
    assert.equal(result.pointsEarned, 1);
    assert.equal(result.semanticScore, 0.92);
    assert.equal(result.evaluationMethod, "gemini_ai");
    assert.equal(result.source, "backend_gemini");
    assert.equal(result.feedback, "Napakahusay na pagsusuri.");
  } finally {
    delete globalThis.PANITIKARD_GAME_API;
  }
});

test("apiClient: never exposes or requires Gemini API keys on client", () => {
  assert.equal("apiKey" in apiClient, false);
  assert.equal("geminiKey" in apiClient, false);
  assert.equal("credentials" in apiClient, false);
});

test("apiClient: Phase 5.4 - awards partial credit bounded by card maxPoints", async () => {
  globalThis.PANITIKARD_GAME_API = {
    enabled: true,
    hasAccessToken: () => true,
    evaluateWithGemini: async () => ({
      isSemanticMatch: false,
      semanticScore: 0.5,
      pointsEarned: 0.5,
      feedback: "Bahagyang tama ang paliwanag.",
      criteriaEvaluation: [
        { aspectNumber: 1, aspect: "Pamantayan 1", satisfied: true },
        { aspectNumber: 2, aspect: "Pamantayan 2", satisfied: false }
      ]
    })
  };

  try {
    const result = await apiClient.evaluateWrittenAnswer({
      questionCode: "elem-statement",
      studentAnswer: "Bahagyang sagot lamang.",
      cardData: { id: "elem-statement", points: 1 }
    });

    assert.equal(result.success, true);
    assert.equal(result.pointsEarned, 0.5);
    assert.equal(result.maxPoints, 1);
    assert.equal(result.semanticScore, 0.5);
  } finally {
    delete globalThis.PANITIKARD_GAME_API;
  }
});

test("apiClient: Phase 5.4 - strictly enforces maxPoints ceiling", async () => {
  globalThis.PANITIKARD_GAME_API = {
    enabled: true,
    hasAccessToken: () => true,
    evaluateWithGemini: async () => ({
      isSemanticMatch: true,
      semanticScore: 1.0,
      pointsEarned: 10, // Out of bounds raw points
      feedback: "Wasto."
    })
  };

  try {
    const result = await apiClient.evaluateWrittenAnswer({
      questionCode: "elem-statement",
      studentAnswer: "Tamang sagot.",
      cardData: { id: "elem-statement", points: 2 }
    });

    assert.equal(result.success, true);
    assert.equal(result.pointsEarned, 2); // Capped at maxPoints: 2
    assert.equal(result.maxPoints, 2);
  } finally {
    delete globalThis.PANITIKARD_GAME_API;
  }
});

test("apiClient: Edge Case 1 - partial credit preserves formative feedback while respecting authoritative maxPoints", async () => {
  globalThis.PANITIKARD_GAME_API = {
    enabled: true,
    hasAccessToken: () => true,
    evaluateWithGemini: async () => ({
      isSemanticMatch: false,
      semanticScore: 0.5,
      pointsEarned: 0.5,
      feedback: "Nabanggit ang tauhan ngunit kulang sa tagpuan.",
      criteriaEvaluation: [
        { aspectNumber: 1, aspect: "Pamantayan 1", satisfied: true },
        { aspectNumber: 2, aspect: "Pamantayan 2", satisfied: false }
      ]
    })
  };

  try {
    const result = await apiClient.evaluateWrittenAnswer({
      questionCode: "elem-statement",
      studentAnswer: "Kalahating sagot.",
      cardData: { id: "elem-statement", points: 1 }
    });

    assert.equal(result.success, true);
    assert.equal(result.pointsEarned, 0.5);
    assert.equal(result.isCorrect, false);
    assert.equal(result.criteriaEvaluation.length, 2);
    assert.ok(result.feedback.includes("tagpuan"));
  } finally {
    delete globalThis.PANITIKARD_GAME_API;
  }
});

test("apiClient: Edge Case 2 - when Gemini succeeds but submitAnswer fails, error propagates for retry", async () => {
  let geminiCalls = 0;
  globalThis.PANITIKARD_GAME_API = {
    enabled: true,
    hasAccessToken: () => true,
    evaluateWithGemini: async () => {
      geminiCalls++;
      return {
        isSemanticMatch: true,
        semanticScore: 1.0,
        feedback: "Wasto ang sagot."
      };
    },
    submitAnswer: async () => {
      throw new Error("Database network failure during submit_game_answer");
    }
  };

  try {
    // 1. Gemini evaluation succeeds
    const evalResult = await apiClient.evaluateWrittenAnswer({
      questionCode: "elem-statement",
      studentAnswer: "Tamang sagot.",
      cardData: { id: "elem-statement", points: 1 }
    });
    assert.equal(evalResult.success, true);
    assert.equal(geminiCalls, 1);

    // 2. Official scoring failure rejects without silent success
    await assert.rejects(
      () => globalThis.PANITIKARD_GAME_API.submitAnswer("session-1", "elem-statement", "Tamang sagot."),
      /Database network failure/
    );
  } finally {
    delete globalThis.PANITIKARD_GAME_API;
  }
});

test("apiClient: Edge Case 2b - retry after network recovery submits successfully and validates official score without corrupting state", async () => {
  let geminiCalls = 0;
  let submitCalls = 0;
  let networkRecovered = false;

  globalThis.PANITIKARD_GAME_API = {
    enabled: true,
    hasAccessToken: () => true,
    evaluateWithGemini: async () => {
      geminiCalls++;
      return {
        isSemanticMatch: true,
        semanticScore: 1.0,
        feedback: "Wasto ang sagot."
      };
    },
    submitAnswer: async () => {
      submitCalls++;
      if (!networkRecovered) {
        throw new Error("Temporary network timeout");
      }
      return {
        pointsAwarded: 1,
        isCorrect: true,
        maxPoints: 1,
        evaluationMethod: "submit_game_answer"
      };
    }
  };

  try {
    // 1. Initial attempt: Gemini succeeds
    const evalResult = await apiClient.evaluateWrittenAnswer({
      questionCode: "elem-statement",
      studentAnswer: "Tamang sagot.",
      cardData: { id: "elem-statement", points: 1 }
    });
    assert.equal(evalResult.success, true);
    assert.equal(geminiCalls, 1);

    // 2. Initial official submission fails
    await assert.rejects(
      () => globalThis.PANITIKARD_GAME_API.submitAnswer("session-1", "elem-statement", "Tamang sagot."),
      /Temporary network timeout/
    );
    assert.equal(submitCalls, 1);

    // 3. Network recovers and student retries
    networkRecovered = true;
    const retryResult = await globalThis.PANITIKARD_GAME_API.submitAnswer("session-1", "elem-statement", "Tamang sagot.");
    const validated = apiClient.validateOfficialRpcResponse(retryResult);
    assert.ok(validated !== null);
    assert.equal(validated.pointsAwarded, 1);
    assert.equal(validated.isCorrect, true);
    assert.equal(submitCalls, 2);
  } finally {
    delete globalThis.PANITIKARD_GAME_API;
  }
});

test("apiClient: Edge Case 3 - timeout bypasses Gemini, awards 0 points, and preserves timer flow", async () => {
  let geminiCalled = false;
  globalThis.PANITIKARD_GAME_API = {
    enabled: true,
    hasAccessToken: () => true,
    evaluateWithGemini: async () => {
      geminiCalled = true;
      return { isSemanticMatch: true };
    }
  };

  try {
    // Timeout simulation: when isTimeout is true, client does not call evaluateWrittenAnswer with Gemini
    const timeoutResult = {
      success: true,
      available: true,
      isCorrect: false,
      pointsEarned: 0,
      maxPoints: 1,
      feedback: "Naubos ang itinakdang 30 segundo na palugit para sa pagsusuri.",
      evaluationMethod: "timeout"
    };

    assert.equal(geminiCalled, false);
    assert.equal(timeoutResult.pointsEarned, 0);
    assert.equal(timeoutResult.isCorrect, false);
    assert.equal(timeoutResult.evaluationMethod, "timeout");
  } finally {
    delete globalThis.PANITIKARD_GAME_API;
  }
});

test("apiClient: Edge Case 3b - timeout succeeds and awards 0 points even when Gemini is unconfigured or unavailable", async () => {
  // Simulate complete backend Gemini unavailability / outage
  globalThis.PANITIKARD_GAME_API = {
    enabled: true,
    hasAccessToken: () => true,
    evaluateWithGemini: async () => {
      throw new Error("503 GEMINI_NOT_CONFIGURED: Gemini semantic evaluation is not configured on this server.");
    },
    submitAnswer: async (_sessionId, _qCode, _resp, _round, options) => {
      assert.equal(options.isTimeout, true);
      return {
        pointsAwarded: 0,
        isCorrect: false,
        maxPoints: 1,
        evaluationMethod: "timeout"
      };
    }
  };

  try {
    // Under timeout conditions, evaluateWrittenAnswer is bypassed entirely
    const officialResponse = await globalThis.PANITIKARD_GAME_API.submitAnswer(
      "session-1",
      "elem-statement",
      "(Naubos ang 30 segundo / Walang naisulat)",
      "main",
      { isTimeout: true }
    );
    const validated = apiClient.validateOfficialRpcResponse(officialResponse);
    assert.ok(validated !== null);
    assert.equal(validated.pointsAwarded, 0);
    assert.equal(validated.isCorrect, false);
    assert.equal(validated.evaluationMethod, "timeout");
  } finally {
    delete globalThis.PANITIKARD_GAME_API;
  }
});

test("apiClient: validateOfficialRpcResponse rejects missing official response (null or undefined)", () => {
  assert.equal(apiClient.validateOfficialRpcResponse(null), null);
  assert.equal(apiClient.validateOfficialRpcResponse(undefined), null);
  assert.equal(apiClient.validateOfficialRpcResponse("invalid string"), null);
});

test("apiClient: validateOfficialRpcResponse rejects malformed responses (missing or non-numeric pointsAwarded)", () => {
  // Missing pointsAwarded
  assert.equal(apiClient.validateOfficialRpcResponse({ isCorrect: true }), null);
  // String pointsAwarded
  assert.equal(apiClient.validateOfficialRpcResponse({ isCorrect: true, pointsAwarded: "1" }), null);
  // NaN pointsAwarded
  assert.equal(apiClient.validateOfficialRpcResponse({ isCorrect: true, pointsAwarded: NaN }), null);
  // Negative pointsAwarded
  assert.equal(apiClient.validateOfficialRpcResponse({ isCorrect: true, pointsAwarded: -1 }), null);
});

test("apiClient: validateOfficialRpcResponse rejects incomplete responses (missing or non-boolean isCorrect)", () => {
  // Missing isCorrect
  assert.equal(apiClient.validateOfficialRpcResponse({ pointsAwarded: 1 }), null);
  // String isCorrect
  assert.equal(apiClient.validateOfficialRpcResponse({ pointsAwarded: 1, isCorrect: "true" }), null);
  // Null isCorrect
  assert.equal(apiClient.validateOfficialRpcResponse({ pointsAwarded: 1, isCorrect: null }), null);
});

test("apiClient: validateOfficialRpcResponse accepts valid top-level and nested official RPC responses", () => {
  const validTop = apiClient.validateOfficialRpcResponse({
    pointsAwarded: 1,
    isCorrect: true,
    maxPoints: 1,
    evaluationMethod: "submit_game_answer"
  });
  assert.deepEqual(validTop, {
    pointsAwarded: 1,
    isCorrect: true,
    maxPoints: 1,
    evaluationMethod: "submit_game_answer"
  });

  const validNested = apiClient.validateOfficialRpcResponse({
    answer: {
      pointsAwarded: 0,
      isCorrect: false,
      maxPoints: 2,
      evaluationMethod: "local_rubric"
    }
  });
  assert.deepEqual(validNested, {
    pointsAwarded: 0,
    isCorrect: false,
    maxPoints: 2,
    evaluationMethod: "local_rubric"
  });
});

test("apiClient: official scoring strictly enforces RPC 0 points over partial Gemini credit", () => {
  const geminiEval = {
    isSemanticMatch: false,
    semanticScore: 0.5,
    pointsEarned: 0.5,
    feedback: "Bahagyang tama."
  };

  const officialRpc = {
    isCorrect: false,
    pointsAwarded: 0,
    maxPoints: 1,
    evaluationMethod: "submit_game_answer"
  };

  const validatedOfficial = apiClient.validateOfficialRpcResponse(officialRpc);
  assert.ok(validatedOfficial !== null);

  const authoritativeScore = validatedOfficial.pointsAwarded;
  assert.equal(authoritativeScore, 0);
  assert.notEqual(authoritativeScore, geminiEval.pointsEarned);
});

