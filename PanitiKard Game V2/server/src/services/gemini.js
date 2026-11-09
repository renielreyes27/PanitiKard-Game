/**
 * ==============================================================================
 * PanitiKard V2 - Gemini AI Semantic Evaluation Service (Phase 5.2 + 5.3)
 * ==============================================================================
 * 
 * Provides the backend evaluation service powered by Google Gemini AI for
 * semantic evaluation of student written responses (Statement, Correction, open-ended cards).
 * 
 * ARCHITECTURAL AND SECURITY SPECIFICATIONS:
 * - Semantic Evaluation: Evaluates meaning, depth, and context rather than exact keyword matching.
 * - Paraphrase & Synonym Acceptance: Accepts valid student explanations with varied sentence structures.
 * - Strict Non-Answer Rejection: Rejects irrelevant text, random gibberish, mere question echoing,
 *   or explanations contradicting the expected literary concept.
 * - Partial Evaluation: Identifies incomplete responses and evaluates completeness against rubric criteria.
 * - Formative/Advisory Only: Evaluation records are purely formative feedback. Official scoring
 *   and game progression are strictly governed by the `submit_game_answer` PostgreSQL RPC.
 * - Reverse Round Protection: Reverse Round practice remains strictly unscored (0 points).
 * - Credential Protection: Gemini API keys and Supabase service-role keys stay strictly server-side.
 * - Answer Confidentiality: Expected answers, answer keys, and raw rubrics are NEVER leaked to students.
 */

let GoogleGenAIClass = null;
try {
  const genaiModule = require('@google/genai');
  GoogleGenAIClass = genaiModule.GoogleGenAI || null;
} catch (_err) {
  GoogleGenAIClass = null;
}

const environmentConfig = require('../config/environment');
const { HttpError } = require('../middleware/httpError');

// System instruction for PanitiKard AI Semantic Evaluation (Topic-Agnostic)
const GEMINI_SYSTEM_INSTRUCTION = `Ikaw ay isang dalubhasa at makatarungang tagasuri at guro para sa educational learning card game na PanitiKard V2.
Ang iyong gawain ay magsagawa ng obhetibo at malalim na SEMANTIC EVALUATION sa sagot ng mag-aaral batay sa ibinigay na tanong, paksa, inaasahang diwa (expected answer), at mga pamantayan ng guro (rubric criteria).

MAHIGPIT NA MGA ALITUNTUNIN SA PAGSUSURI:
1. DIWA AT KAWASTUHAN (MEANING, CORRECTNESS, AND RELEVANCE):
   - Suriin ang kahulugan, katumpakan, kaugnayan, at pagkabuo (completeness) ng sagot ayon sa ibinigay na tanong, paksa, at rubric criteria.
   - HUWAG ipalagay na ang bawat tanong ay limitado lamang sa pagsusuring pampanitikan; suriin ang sagot ayon sa partikular na paksa at tanong (halimbawa: mga elemento ng akda, alamat, maikling kuwento, nobela, talasalitaan, o gramatika).
2. PARAPHRASE, KASINGKAHULUGAN, AT NATURAL NA WIKA:
   - Tanggapin ang mga wastong paraphrase, kasingkahulugan (synonyms), at magkakaibang kayarian ng pangungusap na nagpapahayag ng tamang kaisipan.
   - Tanggapin ang natural na wikang Filipino at makatwirang Taglish (hal. karaniwang terminolohiyang ginagamit ng mga mag-aaral) basta't wasto at malinaw ang ipinapahayag na diwa.
   - HUWAG tanggapin ang mga sagot na naglalaman ng mga maling pahayag o haka-haka na walang batayan (unsupported claims).
3. MGA MALING SAGOT AT PAGTANGGI (INCORRECT / REJECTION):
   - Tanggihan at bigyan ng markang 0 ang mga sagot na walang kaugnayan (irrelevant), random o walang saysay na teksto (gibberish/meaningless).
   - Tanggihan ang sagot na inuulit lamang ang tanong nang hindi sinasagot ang hinihingi (mere echoing).
   - Tanggihan ang sagot na hayagang sumasalungat (contradicts) sa inaasahang konsepto.
4. MGA BAHAGYANG SAGOT AT PAMANTAYAN (PARTIAL CREDIT & CRITERIA):
   - Kung may tamang kaisipan ngunit kulang sa mahahalagang detalye batay sa rubric, igawad ang angkop na bahagyang marka (semanticScore sa pagitan ng 0.0 at 1.0).
   - Suriin ang bawat itinakdang pamantayan (Pamantayan 1, Pamantayan 2, atbp.) kung natugunan o hindi.
5. MAINGAT AT NAKAPAGPAPATIBAY NA FEEDBACK:
   - Magbigay ng malinaw, magalang, at nakatutulong na paliwanag sa wikang Filipino na nagpapaliwanag kung bakit tama, mali, o kulang ang sagot.
   - Huwag kailanman ibunyag ang mismong sekretong answer key o inaasahang sagot nang literal sa feedback; sa halip, ipaliwanag ang kaisipan o konseptong dapat tandaan.`;

/**
 * Validates the student evaluation request input from API calls.
 * Explicitly rejects client-supplied `mockResult`, `studentId`, `questionId`, and `questionVersionId`.
 */
function validateEvaluationInput(input) {
  if (!input || typeof input !== 'object') {
    throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'Request body must be a JSON object.');
  }

  // Security guard: mockResult must never be accepted from external HTTP requests
  if ('mockResult' in input) {
    throw new HttpError(400, 'UNAUTHORIZED_MOCK', 'mockResult cannot be supplied through API requests.');
  }

  // Security guard: Never trust studentId supplied directly by client
  if ('studentId' in input) {
    throw new HttpError(400, 'UNAUTHORIZED_STUDENT_ID', 'studentId cannot be supplied directly by the client; it is derived exclusively from authentication.');
  }

  // Security guard: Never trust questionId or questionVersionId supplied directly by client
  if ('questionId' in input || 'questionVersionId' in input) {
    throw new HttpError(400, 'UNAUTHORIZED_QUESTION_ID', 'Question IDs cannot be supplied directly by the client; they are resolved server-side from questionCode.');
  }

  const { studentAnswer, questionCode, sessionId } = input;

  if (typeof studentAnswer !== 'string' || studentAnswer.trim().length === 0) {
    throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'studentAnswer must be a non-empty string.');
  }

  if (studentAnswer.length > 4000) {
    throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'studentAnswer cannot exceed 4000 characters.');
  }

  if (typeof questionCode !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(questionCode)) {
    throw new HttpError(400, 'INVALID_QUESTION_CODE', 'A valid questionCode is required.');
  }

  if (sessionId !== undefined && sessionId !== null) {
    if (typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw new HttpError(400, 'INVALID_SESSION_ID', 'sessionId must be a valid UUID.');
    }
  }

  return {
    studentAnswer: studentAnswer.trim(),
    questionCode: questionCode.trim(),
    sessionId: sessionId || null
  };
}

/**
 * Validates and normalizes server-side rubric criteria and question data.
 */
function validateRubricData(rubricData) {
  if (!rubricData || typeof rubricData !== 'object') {
    return { prompt: '', expectedAnswer: '', rubricCriteria: [] };
  }

  const prompt = typeof rubricData.prompt === 'string' ? rubricData.prompt.trim() : '';
  const expectedAnswer = typeof rubricData.expectedAnswer === 'string' ? rubricData.expectedAnswer.trim() : '';

  let rubricCriteria = [];
  if (Array.isArray(rubricData.rubricCriteria)) {
    rubricCriteria = rubricData.rubricCriteria
      .map(group => {
        if (Array.isArray(group)) {
          return group
            .filter(term => typeof term === 'string' && term.trim().length > 0)
            .map(t => t.trim());
        }
        if (typeof group === 'string' && group.trim().length > 0) {
          return [group.trim()];
        }
        return null;
      })
      .filter(group => Array.isArray(group) && group.length > 0);
  }

  return {
    prompt,
    expectedAnswer,
    rubricCriteria
  };
}

/**
 * Prepares the prompt and schema payload for Gemini AI semantic evaluation.
 * Adapts to topic context, card type, teacher-approved rubric, and accepts valid paraphrases/Taglish.
 */
function buildEvaluationPrompt({ questionPrompt, expectedAnswer, rubricCriteria = [], studentAnswer, category, topic, maxPoints = 1 }) {
  const topicLabel = topic || 'Panitikan at Wika';
  const categoryLabel = category || 'Pahayag';

  const criteriaFormatted = Array.isArray(rubricCriteria) && rubricCriteria.length > 0
    ? rubricCriteria.map((group, idx) => {
        const terms = Array.isArray(group) ? group.join(' / ') : String(group);
        return `  ${idx + 1}. Pamantayan ${idx + 1}: ${terms}`;
      }).join('\n')
    : `  1. Inaasahang Diwa: ${expectedAnswer || 'Kawastuhan batay sa aralin'}`;

  const userPrompt = `Suriin ang sumusunod na sagot ng mag-aaral para sa PanitiKard V2:

[KONTEKSTO NG ARALIN AT TANONG]
Paksa / Aralin: ${topicLabel}
Uri ng Tanong / Kard: ${categoryLabel}
Tanong / Gawain: "${questionPrompt || ''}"
Pinakamataas na Puntos: ${maxPoints}

[INAASAHANG BATAYAN NG GURO]
Inaasahang Diwa / Sagot: "${expectedAnswer || ''}"
Mga Pamantayan / Rubric Criteria:
${criteriaFormatted}

[SAGOT NG MAG-AARAL]
"${studentAnswer}"

[MGA MAHIGPIT NA TAGUBILIN SA PAGSUSURI]
1. Suriin ang DIWA AT KAHULUGAN (semantic evaluation), HINDI lamang pagtutugma ng mga salita (keywords).
2. Iangkop ang pagsusuri sa partikular na paksa at uri ng tanong; huwag ipalagay na pagsusuring pampanitikan lamang ang layunin.
3. Tanggapin ang mga wastong paraphrase, kasingkahulugan, at makatwirang Taglish kung wasto ang diwa. Huwag tanggapin ang mga pahayag na walang batayan (unsupported claims).
4. TANGGIHAN ang mga sagot na:
   - Walang kaugnayan (irrelevant)
   - Random o walang saysay na titik/salita (gibberish/meaningless)
   - Inuulit lamang ang mga salita mula sa tanong nang hindi sinasagot ang tanong (mere echoing)
   - Sumasalungat sa inaasahang diwa (contradictory)
5. Kung may bahagyang tamang kaisipan ngunit kulang sa mahahalagang detalye ayon sa rubric, magbigay ng angkop na bahagyang marka (semanticScore sa pagitan ng 0.0 at 1.0).
6. Magbigay ng nakatutulong at nakapagpapatibay na feedback sa wikang Filipino. HUWAG ibunyag ang mismong sekretong sagot o answer key nang literal sa feedback.

Ibalik ang iyong pagsusuri sa sumusunod na JSON format:
{
  "isCorrect": boolean,
  "isSemanticMatch": boolean,
  "semanticScore": number (0.0 hanggang 1.0),
  "confidenceScore": number (0.0 hanggang 1.0),
  "feedback": string (nakatutulong na paliwanag sa Filipino),
  "evaluationSummary": string (maikling buod),
  "criteriaEvaluation": [
    {
      "aspectNumber": integer (1, 2, ...),
      "aspect": string ("Pamantayan 1", ...),
      "satisfied": boolean,
      "explanation": string
    }
  ]
}`;

  return {
    systemInstruction: GEMINI_SYSTEM_INSTRUCTION,
    userPrompt,
    generationConfig: {
      temperature: 0.2,
      topP: 0.95,
      responseMimeType: 'application/json'
    }
  };
}

/**
 * Parses, validates, and sanitizes Gemini AI model response output.
 * Enforces numeric bounds, required fields, and aspect sanitization.
 */
function parseAndValidateModelResponse(rawText, maxPoints = 1) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new HttpError(502, 'INVALID_MODEL_RESPONSE', 'Gemini returned an empty response.');
  }

  // Handle potential markdown code fences (```json ... ```)
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    throw new HttpError(502, 'INVALID_MODEL_RESPONSE', `Failed to parse Gemini response as JSON: ${parseErr.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(502, 'INVALID_MODEL_RESPONSE', 'Model response must be a JSON object.');
  }

  // Validate isCorrect / isSemanticMatch
  const isCorrect = typeof parsed.isCorrect === 'boolean'
    ? parsed.isCorrect
    : (typeof parsed.isSemanticMatch === 'boolean' ? parsed.isSemanticMatch : null);

  if (isCorrect === null) {
    throw new HttpError(502, 'INVALID_MODEL_RESPONSE', "Model response missing boolean 'isCorrect' or 'isSemanticMatch'.");
  }

  // Validate semanticScore (Must be a finite number between 0.0 and 1.0)
  const rawScore = parsed.semanticScore;
  if (typeof rawScore !== 'number' || Number.isNaN(rawScore) || !Number.isFinite(rawScore) || rawScore < 0.0 || rawScore > 1.0) {
    throw new HttpError(502, 'INVALID_MODEL_RESPONSE', "Model response 'semanticScore' must be a finite number between 0.0 and 1.0.");
  }
  const semanticScore = parseFloat(rawScore.toFixed(4));

  // Validate feedback
  const feedback = typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '';
  if (!feedback) {
    throw new HttpError(502, 'INVALID_MODEL_RESPONSE', "Model response missing non-empty 'feedback'.");
  }

  // Validate confidenceScore (optional, if present must be number between 0.0 and 1.0)
  let confidenceScore = null;
  if (typeof parsed.confidenceScore === 'number' && !Number.isNaN(parsed.confidenceScore) && parsed.confidenceScore >= 0.0 && parsed.confidenceScore <= 1.0) {
    confidenceScore = parseFloat(parsed.confidenceScore.toFixed(4));
  }

  // Validate and sanitize criteriaEvaluation
  let criteriaEvaluation = [];
  if (Array.isArray(parsed.criteriaEvaluation)) {
    criteriaEvaluation = parsed.criteriaEvaluation.map((crit, idx) => {
      const satisfied = typeof crit?.satisfied === 'boolean' ? crit.satisfied : false;
      const explanation = typeof crit?.explanation === 'string' ? crit.explanation.trim() : '';
      return {
        aspectNumber: idx + 1,
        aspect: `Pamantayan ${idx + 1}`,
        satisfied,
        explanation: explanation || (satisfied ? 'Naisaayos nang wasto ang bahaging ito.' : 'Hindi naabot ang pamantayan sa bahaging ito.')
      };
    });
  }

  // Calculate advisory points earned bounded by maxPoints
  const safeMaxPoints = (typeof maxPoints === 'number' && maxPoints > 0) ? maxPoints : 1;
  const pointsEarned = parseFloat((semanticScore * safeMaxPoints).toFixed(2));

  return {
    isCorrect,
    isSemanticMatch: isCorrect,
    semanticScore,
    confidenceScore,
    feedback,
    evaluationSummary: typeof parsed.evaluationSummary === 'string' ? parsed.evaluationSummary.trim() : (isCorrect ? 'Wasto ang sagot.' : 'Kulang o hindi angkop ang sagot.'),
    criteriaEvaluation,
    pointsEarned,
    maxPoints: safeMaxPoints
  };
}

/**
 * Maps error occurrences from Gemini or network calls to appropriate HTTP status errors.
 */
function mapGeminiError(err) {
  if (err instanceof HttpError) return err;

  const msg = String(err?.message || '');
  const status = err?.status || err?.statusCode || (err?.response ? err.response.status : null);

  // 1. Timeout
  if (err.code === 'GEMINI_TIMEOUT' || err.name === 'TimeoutError' || err.name === 'AbortError' || msg.includes('timed out')) {
    return new HttpError(504, 'GEMINI_TIMEOUT', 'Gemini evaluation request timed out.');
  }

  // 2. Rate Limits (429 or RESOURCE_EXHAUSTED)
  if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit')) {
    return new HttpError(429, 'GEMINI_RATE_LIMIT', 'Gemini API rate limit exceeded. Please try again later.');
  }

  // 3. Provider Authentication Failure
  if (status === 401 || status === 403 || msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
    return new HttpError(502, 'GEMINI_PROVIDER_ERROR', 'Gemini authentication failed with provider.');
  }

  // 4. General Provider Error
  return new HttpError(502, 'GEMINI_PROVIDER_ERROR', `Gemini provider error: ${msg || 'Unknown provider failure'}`);
}

/**
 * Executes an async function with timeout protection.
 */
async function executeWithTimeout(asyncFn, timeoutMs = 15000) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Gemini evaluation request timed out after ${timeoutMs}ms.`);
      err.code = 'GEMINI_TIMEOUT';
      err.status = 504;
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([asyncFn(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Factory to create the Gemini evaluation service.
 */
function createGeminiService({ config = environmentConfig, genAIClient = null, modelRunner = null } = {}) {
  const apiKey = config.gemini?.apiKey || '';
  const modelName = config.gemini?.model || 'gemini-3.5-flash-lite';
  const timeoutMs = parseInt(config.gemini?.timeoutMs, 10) || 15000;

  let liveVerified = false;
  let lastVerifiedAt = null;
  let lastErrorCode = null;

  return {
    /**
     * Checks if Gemini API key is configured in the environment.
     */
    isConfigured() {
      return Boolean(apiKey && apiKey.trim().length > 0 && !apiKey.includes('your_gemini_'));
    },

    /**
     * Returns service status without leaking API credentials.
     * Accurately distinguishes configured, not-yet-live-tested, verified operational, and provider error.
     */
    getStatus() {
      const isKeyConfigured = Boolean(apiKey && apiKey.trim().length > 0 && !apiKey.includes('your_gemini_'));
      const isModelConfigured = Boolean(modelName && modelName.trim().length > 0);

      let providerStatus = 'unconfigured';
      if (isKeyConfigured) {
        if (lastErrorCode) {
          providerStatus = 'provider_error';
        } else if (liveVerified) {
          providerStatus = 'verified_operational';
        } else {
          providerStatus = 'not_yet_live_tested';
        }
      }

      return {
        configured: isKeyConfigured,
        apiKeyConfigured: isKeyConfigured,
        modelConfigured: isModelConfigured,
        model: modelName,
        provider: 'Google Gemini',
        phase: '5.2-actual-gemini',
        status: providerStatus,
        operational: providerStatus === 'verified_operational',
        notYetLiveTested: providerStatus === 'not_yet_live_tested',
        lastVerifiedAt,
        lastErrorCode,
        systemInstructionConfigured: Boolean(GEMINI_SYSTEM_INSTRUCTION),
        timeoutMs
      };
    },

    /**
     * Builds the prompt configuration for an evaluation.
     */
    buildPrompt(params) {
      return buildEvaluationPrompt(params);
    },

    /**
     * Evaluates a student's written response using Gemini AI semantic evaluation.
     * Evaluates meaning, context, and depth against the teacher's rubric.
     */
    async evaluateAnswer({
      studentAnswer,
      questionCode,
      questionPrompt = '',
      expectedAnswer = '',
      rubricCriteria = [],
      category = 'statement',
      topic = '',
      topicCode = '',
      maxPoints = 1,
      mockResult = null
    }) {
      // 1. Strict validation of question input
      if (typeof studentAnswer !== 'string' || studentAnswer.trim().length === 0) {
        throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'studentAnswer must be a non-empty string.');
      }
      if (studentAnswer.length > 4000) {
        throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'studentAnswer cannot exceed 4000 characters.');
      }
      if (typeof questionCode !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(questionCode)) {
        throw new HttpError(400, 'INVALID_QUESTION_CODE', 'A valid questionCode is required.');
      }

      const safeMaxPoints = (typeof maxPoints === 'number' && maxPoints > 0) ? maxPoints : 1;

      // 2. Service-level mockResult injection for unit testing
      if (mockResult) {
        const isCorrect = Boolean(mockResult.isCorrect ?? mockResult.isSemanticMatch);
        const semanticScore = typeof mockResult.semanticScore === 'number'
          ? Math.max(0.0, Math.min(1.0, mockResult.semanticScore))
          : (isCorrect ? 1.0 : 0.0);
        const pointsEarned = parseFloat((semanticScore * safeMaxPoints).toFixed(2));

        return {
          questionCode,
          studentAnswer: studentAnswer.trim(),
          isCorrect,
          isSemanticMatch: isCorrect,
          semanticScore,
          confidenceScore: typeof mockResult.confidenceScore === 'number' ? mockResult.confidenceScore : null,
          feedback: mockResult.feedback || (isCorrect ? 'Tumpak ang pampanitikang kaisipan.' : 'Hindi tumugma sa inaasahang kaisipan.'),
          evaluationSummary: mockResult.evaluationSummary || (isCorrect ? 'Wasto ang sagot.' : 'Kulang o hindi angkop ang sagot.'),
          criteriaEvaluation: Array.isArray(mockResult.criteriaEvaluation) ? mockResult.criteriaEvaluation : [],
          pointsEarned,
          maxPoints: safeMaxPoints,
          model: modelName,
          status: 'evaluated',
          evaluationMethod: 'gemini_semantic_evaluation',
          evaluatedAt: new Date().toISOString()
        };
      }

      // 3. Validate and normalize rubric data
      const validatedRubric = validateRubricData({
        prompt: questionPrompt,
        expectedAnswer,
        rubricCriteria
      });

      // 4. Build Prompt Payload
      const promptPayload = buildEvaluationPrompt({
        questionPrompt: validatedRubric.prompt,
        expectedAnswer: validatedRubric.expectedAnswer,
        rubricCriteria: validatedRubric.rubricCriteria,
        studentAnswer: studentAnswer.trim(),
        category,
        topic,
        maxPoints: safeMaxPoints
      });

      let rawModelText = null;

      // 5. Execute evaluation via modelRunner (if injected for unit/regression tests)
      if (modelRunner) {
        try {
          rawModelText = await executeWithTimeout(
            () => modelRunner({
              userPrompt: promptPayload.userPrompt,
              systemInstruction: promptPayload.systemInstruction,
              model: modelName,
              generationConfig: promptPayload.generationConfig,
              studentAnswer: studentAnswer.trim(),
              questionCode,
              topic
            }),
            timeoutMs
          );
        } catch (err) {
          const mapped = mapGeminiError(err);
          if (mapped.status === 502 || mapped.status === 429 || mapped.status === 504) {
            lastErrorCode = mapped.code;
          }
          throw mapped;
        }
      } else {
        // 6. Live Google Gemini API Integration via @google/genai SDK
        if (!apiKey || apiKey.trim().length === 0 || apiKey.includes('your_gemini_')) {
          throw new HttpError(503, 'GEMINI_NOT_CONFIGURED', 'Gemini semantic evaluation is not configured on this server.');
        }

        const client = genAIClient || (GoogleGenAIClass ? new GoogleGenAIClass({ apiKey }) : null);
        if (!client) {
          throw new HttpError(503, 'GEMINI_NOT_CONFIGURED', 'Google Gen AI SDK is not available.');
        }

        try {
          const response = await executeWithTimeout(
            () => client.models.generateContent({
              model: modelName,
              contents: promptPayload.userPrompt,
              config: {
                systemInstruction: promptPayload.systemInstruction,
                temperature: promptPayload.generationConfig.temperature,
                topP: promptPayload.generationConfig.topP,
                responseMimeType: promptPayload.generationConfig.responseMimeType
              }
            }),
            timeoutMs
          );

          rawModelText = typeof response?.text === 'function'
            ? response.text()
            : (response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text || '');
        } catch (err) {
          const mapped = mapGeminiError(err);
          if (mapped.status === 502 || mapped.status === 429 || mapped.status === 504) {
            lastErrorCode = mapped.code;
          }
          throw mapped;
        }
      }

      // Mark provider as verified operational after successful evaluation
      liveVerified = true;
      lastVerifiedAt = new Date().toISOString();
      lastErrorCode = null;

      // 7. Parse, strictly validate, and sanitize Gemini response
      const parsedResult = parseAndValidateModelResponse(rawModelText, safeMaxPoints);

      return {
        questionCode,
        studentAnswer: studentAnswer.trim(),
        isCorrect: parsedResult.isCorrect,
        isSemanticMatch: parsedResult.isSemanticMatch,
        semanticScore: parsedResult.semanticScore,
        confidenceScore: parsedResult.confidenceScore,
        feedback: parsedResult.feedback,
        evaluationSummary: parsedResult.evaluationSummary,
        criteriaEvaluation: parsedResult.criteriaEvaluation,
        pointsEarned: parsedResult.pointsEarned,
        maxPoints: parsedResult.maxPoints,
        model: modelName,
        status: 'evaluated',
        evaluationMethod: 'gemini_semantic_evaluation',
        evaluatedAt: new Date().toISOString()
      };
    },

    /**
     * Persists an AI evaluation record into Supabase `ai_evaluations` table.
     *
     * SECURITY ARCHITECTURE (Option A):
     * - Reads (session ownership, question/version validation, idempotency check) use the
     *   authenticated student's `client`, which is RLS-scoped to their own records.
     * - The final INSERT uses `serviceRoleClient`, which bypasses RLS and writes the record
     *   server-side. This prevents students from directly forging semantic_score,
     *   confidence_score, status, or raw_model_response via direct Supabase PostgREST calls.
     * - All field values are set exclusively by the backend after completing Gemini evaluation.
     * - `serviceRoleClient` is never exposed to the browser; it lives only in the backend env.
     *
     * @param {object} client - Authenticated student's RLS-scoped Supabase client (for reads/validation)
     * @param {object} serviceRoleClient - Backend service-role Supabase client (for the INSERT only)
     * @param {object} evaluationData - Validated evaluation fields to persist
     */
    async recordEvaluation(client, serviceRoleClient, evaluationData) {
      if (!client || typeof client.from !== 'function') return null;

      const studentId = evaluationData.studentId;
      if (!studentId || typeof studentId !== 'string') {
        throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'studentId is required to record evaluation.');
      }

      const questionId = evaluationData.questionId;
      if (!questionId || typeof questionId !== 'string') {
        throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'A valid questionId is required to record evaluation.');
      }

      const questionVersionId = evaluationData.questionVersionId;
      if (!questionVersionId || typeof questionVersionId !== 'string') {
        throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'A valid questionVersionId is required to record evaluation.');
      }

      // 1. Enforce session ownership if sessionId is supplied
      // Standalone / Practice Mode: If sessionId is null/omitted, evaluation is permitted
      // as an unattached formative practice check (persisted with session_id = null).
      let verifiedSessionId = null;
      if (evaluationData.sessionId) {
        const { data: session, error: sessionErr } = await client
          .from('game_sessions')
          .select('id, student_id')
          .eq('id', evaluationData.sessionId)
          .maybeSingle();

        if (sessionErr) {
          throw new HttpError(503, 'DATABASE_ERROR', `Failed to verify session: ${sessionErr.message}`);
        }
        if (!session) {
          throw new HttpError(404, 'SESSION_NOT_FOUND', `Session '${evaluationData.sessionId}' was not found.`);
        }
        if (session.student_id !== studentId) {
          throw new HttpError(403, 'FORBIDDEN_SESSION', 'Session does not belong to the authenticated student.');
        }
        verifiedSessionId = session.id;
      }

      // 2. Validate question relationship if questionCode is provided
      if (evaluationData.questionCode) {
        const { data: dbQ, error: qErr } = await client
          .from('questions')
          .select('id, code')
          .eq('id', questionId)
          .eq('code', evaluationData.questionCode)
          .maybeSingle();

        if (qErr) {
          throw new HttpError(503, 'DATABASE_ERROR', `Failed to verify question: ${qErr.message}`);
        }
        if (!dbQ) {
          throw new HttpError(400, 'QUESTION_RELATIONSHIP_MISMATCH', 'Resolved questionId does not match the questionCode.');
        }
      }

      // 3. Validate question version relationship
      const { data: dbV, error: vErr } = await client
        .from('question_versions')
        .select('id, question_id')
        .eq('id', questionVersionId)
        .eq('question_id', questionId)
        .maybeSingle();

      if (vErr) {
        throw new HttpError(503, 'DATABASE_ERROR', `Failed to verify question version: ${vErr.message}`);
      }
      if (!dbV) {
        throw new HttpError(400, 'QUESTION_VERSION_MISMATCH', 'questionVersionId does not belong to the resolved question.');
      }

      // Safe Idempotency Check: Prevent duplicate evaluations for identical student submissions.
      // Uses the student's client (RLS-scoped) since the student can read their own records.
      const aiReadTable = client.from('ai_evaluations');
      if (verifiedSessionId && aiReadTable && typeof aiReadTable.select === 'function') {
        const { data: existingEval, error: existingErr } = await aiReadTable
          .select('id, created_at, is_semantic_match, semantic_score, confidence_score, feedback, rubric_criteria, model_version, status, evaluated_at')
          .eq('student_id', studentId)
          .eq('session_id', verifiedSessionId)
          .eq('question_id', questionId)
          .eq('student_answer', evaluationData.studentAnswer)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existingErr && existingEval) {
          return {
            ...existingEval,
            isDuplicate: true
          };
        }
      }

      // INSERT uses service-role client to prevent authenticated students from forging
      // evaluation fields (semantic_score, confidence_score, status, raw_model_response)
      // via direct Supabase PostgREST calls. The service-role client is strictly server-side.
      // FAIL CLOSED: if serviceRoleClient is missing or invalid, reject the request entirely.
      // We must never fall back to the student client for INSERT — that would allow RLS bypass.
      if (!serviceRoleClient || typeof serviceRoleClient.from !== 'function') {
        throw new HttpError(503, 'SERVICE_ROLE_UNAVAILABLE',
          'Service role client is required to persist AI evaluation records. ' +
          'Direct authenticated inserts are not permitted.');
      }
      const insertClient = serviceRoleClient;

      const payload = {
        student_id: studentId,
        session_id: verifiedSessionId,
        question_id: questionId,
        question_version_id: questionVersionId,
        student_answer: evaluationData.studentAnswer,
        is_semantic_match: Boolean(evaluationData.isSemanticMatch || evaluationData.isCorrect),
        semantic_score: typeof evaluationData.semanticScore === 'number' ? evaluationData.semanticScore : 0.0,
        confidence_score: typeof evaluationData.confidenceScore === 'number' ? evaluationData.confidenceScore : null,
        feedback: evaluationData.feedback || '',
        rubric_criteria: Array.isArray(evaluationData.criteriaEvaluation) ? evaluationData.criteriaEvaluation : [],
        raw_model_response: {
          model: evaluationData.model || modelName,
          status: evaluationData.status || 'evaluated',
          evaluationMethod: evaluationData.evaluationMethod || 'gemini_semantic_evaluation',
          evaluationSummary: evaluationData.evaluationSummary || ''
        },
        model_version: evaluationData.model || modelName,
        status: evaluationData.status || 'evaluated',
        evaluated_at: evaluationData.evaluatedAt || new Date().toISOString()
      };

      const { data, error } = await insertClient
        .from('ai_evaluations')
        .insert(payload)
        .select('id, created_at')
        .single();

      if (error) {
        if (error.code === '42501') {
          throw new HttpError(403, 'FORBIDDEN', 'Permission denied by database row level security.');
        }
        console.warn('[GeminiService] Failed to record AI evaluation to Supabase:', error.message);
        throw new HttpError(503, 'DATABASE_ERROR', `Failed to record AI evaluation: ${error.message}`);
      }

      return data;
    }
  };
}

module.exports = {
  createGeminiService,
  validateEvaluationInput,
  validateRubricData,
  buildEvaluationPrompt,
  parseAndValidateModelResponse,
  mapGeminiError,
  executeWithTimeout,
  GEMINI_SYSTEM_INSTRUCTION
};
