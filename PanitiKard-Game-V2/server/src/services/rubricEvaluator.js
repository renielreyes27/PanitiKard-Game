/**
 * ==============================================================================
 * PanitiKard V2 - Deterministic Rubric-Based Answer Evaluator
 * ==============================================================================
 *
 * Replaces Gemini AI semantic evaluation with a fully deterministic evaluator
 * powered by teacher-approved rubrics, required concepts, keywords, and
 * accepted alternative terms stored in question_evaluation_rubrics.
 *
 * DESIGN PRINCIPLES:
 * - No external AI API or paid service required.
 * - Deterministic: same input always produces the same output.
 * - Word/phrase boundary matching to prevent false-positive keyword hits.
 * - Partial credit based on how many rubric concept groups are covered.
 * - Full points never awarded from a single keyword when multiple concepts required.
 * - Formative feedback in Filipino identifying matched and missing concepts.
 * - Rubric data and expected answers remain strictly server-side; never leaked.
 * - Official scoring authority remains with the submit_game_answer PostgreSQL RPC.
 */

'use strict';

const { HttpError } = require('../middleware/httpError');

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes text for comparison:
 * - Lowercase
 * - Strip common Filipino diacritics (accented vowels, ñ)
 * - Replace all non-alphanumeric sequences with a single space
 * - Trim leading/trailing whitespace
 */
function normalizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[áàâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Returns the number of words in a normalized string.
 */
function wordCount(normalized) {
  if (!normalized || !normalized.trim()) return 0;
  return normalized.trim().split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

const NEGATION_MARKERS = new Set(['hindi', 'di', 'walang', 'wala', 'huwag', 'not', 'no', 'never']);
const CONTRAST_MARKERS = new Set(['kundi', 'ngunit', 'subalit', 'pero', 'bagkus', 'datapwat']);

/**
 * Checks whether a phrase match at `matchIndex` in `paddedAnswer` is negated
 * by a preceding negation marker within a 3-word window (unless separated by a contrast conjunction).
 */
function isMatchNegated(paddedAnswer, matchIndex) {
  const beforeText = paddedAnswer.slice(0, matchIndex).trim();
  if (!beforeText) return false;
  const prevWords = beforeText.split(/\s+/);
  const windowWords = prevWords.slice(-3);
  for (let i = windowWords.length - 1; i >= 0; i--) {
    const w = windowWords[i];
    if (CONTRAST_MARKERS.has(w)) return false;
    if (NEGATION_MARKERS.has(w)) return true;
  }
  return false;
}

/**
 * Tests whether a normalized phrase appears in a normalized student answer
 * using word-boundary matching (space-padded search within space-padded target),
 * supporting common Filipino ligatures (-ng after vowels, -g after 'n' for words >= 4 chars),
 * and rejecting negated occurrences (e.g. "hindi magkaugnay", "walang konteksto").
 * This prevents "pag" from matching "pagkain" and prevents contradictory answers from matching.
 */
function phraseMatchesInAnswer(normalizedPhrase, normalizedAnswer) {
  if (!normalizedPhrase || !normalizedAnswer) return false;
  const padded = ` ${normalizedAnswer} `;
  const candidates = [` ${normalizedPhrase} `];

  if (normalizedPhrase.length >= 4) {
    if (/[aeiou]$/.test(normalizedPhrase)) {
      candidates.push(` ${normalizedPhrase}ng `);
    } else if (/n$/.test(normalizedPhrase)) {
      candidates.push(` ${normalizedPhrase}g `);
    }
  }

  for (const target of candidates) {
    let searchFrom = 0;
    while (searchFrom < padded.length) {
      const idx = padded.indexOf(target, searchFrom);
      if (idx === -1) break;
      if (!isMatchNegated(padded, idx)) {
        return true;
      }
      searchFrom = idx + 1;
    }
  }
  return false;
}

/**
 * Tests whether any term in an accepted-answer list matches the student answer exactly.
 * Matching is normalized.
 */
function matchesAcceptedAnswer(normalizedAnswer, acceptedAnswers) {
  if (!Array.isArray(acceptedAnswers) || acceptedAnswers.length === 0) return false;
  return acceptedAnswers.some(accepted => {
    if (typeof accepted !== 'string') return false;
    return normalizeText(accepted) === normalizedAnswer;
  });
}

/**
 * Tests whether a rubric concept group is satisfied by the student answer.
 * A group is an array of alternative terms/phrases; ANY one match satisfies the group.
 */
function groupMatchesInAnswer(group, normalizedAnswer) {
  if (!Array.isArray(group) || group.length === 0) return false;
  return group.some(term => {
    if (typeof term !== 'string' || !term.trim()) return false;
    return phraseMatchesInAnswer(normalizeText(term), normalizedAnswer);
  });
}

// ---------------------------------------------------------------------------
// Rubric validation
// ---------------------------------------------------------------------------

/**
 * Validates and normalizes rubric criteria.
 * rubricGroups must be an array of arrays of strings.
 */
function validateRubricGroups(rubricGroups) {
  if (!Array.isArray(rubricGroups)) return [];
  return rubricGroups
    .map(group => {
      if (Array.isArray(group)) {
        return group.filter(t => typeof t === 'string' && t.trim().length > 0).map(t => t.trim());
      }
      if (typeof group === 'string' && group.trim().length > 0) {
        return [group.trim()];
      }
      return null;
    })
    .filter(group => Array.isArray(group) && group.length > 0);
}

// ---------------------------------------------------------------------------
// Feedback generation (Filipino)
// ---------------------------------------------------------------------------

/**
 * Generates Filipino feedback for the student based on matched/missed rubric groups.
 */
function buildFeedback({ isCorrect, semanticScore, matchedGroups, missedGroups, isExactMatch, isAcceptedAlternative, isTimeout }) {
  if (isTimeout) {
    return 'Nag-time out ang iyong sagot. Walang puntos para sa pagsumiteng ito.';
  }

  if (isExactMatch || isAcceptedAlternative) {
    return 'Tama ang iyong sagot! Tugma ito sa inaasahang kasagutan ng guro.';
  }

  const totalGroups = matchedGroups + missedGroups;

  if (isCorrect && totalGroups > 0) {
    return `Mahusay! Nasagot mo ang lahat ng ${totalGroups} na kinakailangang konsepto.`;
  }

  if (semanticScore > 0 && totalGroups > 0) {
    const pct = Math.round(semanticScore * 100);
    if (missedGroups === 1) {
      return `Malapit na ang iyong sagot (${pct}%)! Nasagot mo ang ${matchedGroups} sa ${totalGroups} na konsepto. Kulang pa ang isa pang mahalagang kaisipan.`;
    }
    return `Bahagyang tama ang iyong sagot (${pct}%). Nasagot mo ang ${matchedGroups} sa ${totalGroups} na kinakailangang konsepto. Suriin pa ang mga napalampas na bahagi.`;
  }

  if (totalGroups > 0) {
    return `Hindi nasagot ang mga kinakailangang konsepto. Kailangan ng sagot na sumasaklaw sa lahat ng ${totalGroups} na paksa.`;
  }

  return 'Hindi tumugma ang sagot sa inaasahang kasagutan. Pakisubukan muli.';
}

/**
 * Builds per-criterion evaluation for the response.
 */
function buildCriteriaEvaluation(validatedGroups, normalizedAnswer) {
  return validatedGroups.map((group, idx) => {
    const satisfied = groupMatchesInAnswer(group, normalizedAnswer);
    return {
      aspectNumber: idx + 1,
      aspect: `Pamantayan ${idx + 1}`,
      satisfied,
      explanation: satisfied
        ? 'Natugunan nang wasto ang bahaging ito ng pamantayan.'
        : 'Hindi pa naabot ang kaukulang kaisipan para sa bahaging ito ng pamantayan.'
    };
  });
}

// ---------------------------------------------------------------------------
// Core evaluator
// ---------------------------------------------------------------------------

/**
 * Validates evaluation input (mirrors the shape from validateEvaluationInput in gemini.js).
 */
function validateEvaluationInput(input) {
  if (!input || typeof input !== 'object') {
    throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'Request body must be a JSON object.');
  }

  if ('mockResult' in input) {
    throw new HttpError(400, 'UNAUTHORIZED_MOCK', 'mockResult cannot be supplied through API requests.');
  }
  if ('studentId' in input) {
    throw new HttpError(400, 'UNAUTHORIZED_STUDENT_ID', 'studentId cannot be supplied directly by the client.');
  }
  if ('questionId' in input || 'questionVersionId' in input) {
    throw new HttpError(400, 'UNAUTHORIZED_QUESTION_ID', 'Question IDs cannot be supplied directly by the client.');
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
 * Factory for the deterministic rubric evaluator service.
 * Provides evaluated answers against teacher-approved rubrics and stores records in ai_evaluations.
 */
function createRubricEvaluatorService() {
  const MODEL_NAME = 'deterministic_rubric_v1';

  return {
    /**
     * Always "configured" — no external service required.
     */
    isConfigured() {
      return true;
    },

    /**
     * Service status — always operational.
     */
    getStatus() {
      return {
        configured: true,
        apiKeyConfigured: false,
        modelConfigured: true,
        model: MODEL_NAME,
        provider: 'PanitiKard Deterministic Rubric Evaluator',
        phase: 'deterministic-rubric-v1',
        status: 'operational',
        operational: true,
        notYetLiveTested: false,
        lastVerifiedAt: null,
        lastErrorCode: null,
        systemInstructionConfigured: false,
        timeoutMs: 0
      };
    },

    /**
     * Evaluates a student's written response deterministically against teacher rubrics.
     *
     * @param {object} params
     * @param {string} params.studentAnswer - The student's submitted text
     * @param {string} params.questionCode - Unique question identifier
     * @param {string} [params.questionPrompt] - The question text (unused in matching, for future use)
     * @param {string} [params.expectedAnswer] - Teacher's model answer (normalized exact match)
     * @param {Array}  [params.rubricCriteria] - Array of concept groups (each group: array of alternative terms)
     * @param {Array}  [params.acceptedAnswers] - Array of teacher-approved alternative answers
     * @param {number} [params.maxPoints] - Maximum points possible
     * @param {object|null} [params.mockResult] - Injected mock result for unit testing
     */
    async evaluateAnswer({
      studentAnswer,
      questionCode,
      questionPrompt = '',
      expectedAnswer = '',
      rubricCriteria = [],
      acceptedAnswers = [],
      category = 'statement',
      topic = '',
      topicCode = '',
      maxPoints = 1,
      mockResult = null
    }) {
      // Input validation
      if (typeof studentAnswer !== 'string' || studentAnswer.trim().length === 0) {
        throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'studentAnswer must be a non-empty string.');
      }
      if (studentAnswer.length > 4000) {
        throw new HttpError(400, 'INVALID_EVALUATION_INPUT', 'studentAnswer cannot exceed 4000 characters.');
      }
      if (typeof questionCode !== 'string' || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(questionCode)) {
        throw new HttpError(400, 'INVALID_QUESTION_CODE', 'A valid questionCode is required.');
      }

      const safeMaxPoints = (typeof maxPoints === 'number' && Number.isFinite(maxPoints) && maxPoints >= 0) ? maxPoints : 1;

      // Unit-test mock injection
      if (mockResult) {
        const isCorrect = Boolean(mockResult.isCorrect ?? mockResult.isSemanticMatch);
        const semanticScore = typeof mockResult.semanticScore === 'number'
          ? Math.max(0.0, Math.min(1.0, mockResult.semanticScore))
          : (isCorrect ? 1.0 : 0.0);
        let pointsEarned = isCorrect
          ? safeMaxPoints
          : parseFloat((semanticScore * safeMaxPoints).toFixed(2));
        if (!isCorrect && safeMaxPoints > 0 && pointsEarned >= safeMaxPoints) {
          pointsEarned = Math.max(0, parseFloat((safeMaxPoints - 0.01).toFixed(2)));
        }
        return {
          questionCode,
          studentAnswer: studentAnswer.trim(),
          isCorrect,
          isSemanticMatch: isCorrect,
          semanticScore,
          confidenceScore: null,
          feedback: mockResult.feedback || (isCorrect ? 'Tama ang iyong sagot.' : 'Hindi tamang sagot.'),
          evaluationSummary: mockResult.evaluationSummary || (isCorrect ? 'Wasto ang sagot.' : 'Kulang o hindi angkop ang sagot.'),
          criteriaEvaluation: Array.isArray(mockResult.criteriaEvaluation) ? mockResult.criteriaEvaluation : [],
          pointsEarned,
          maxPoints: safeMaxPoints,
          model: MODEL_NAME,
          status: 'evaluated',
          evaluationMethod: 'deterministic_rubric',
          evaluatedAt: new Date().toISOString()
        };
      }

      // Normalize the student's answer
      const normalizedAnswer = normalizeText(studentAnswer.trim());
      const words = wordCount(normalizedAnswer);

      // 1. Exact match against expected answer
      const normalizedExpected = normalizeText(expectedAnswer);
      const isExactMatch = normalizedExpected.length > 0 && normalizedAnswer === normalizedExpected;

      // 2. Accepted alternative match (teacher-approved alternatives)
      const safeAcceptedAnswers = Array.isArray(acceptedAnswers) ? acceptedAnswers : [];
      const isAcceptedAlternative = !isExactMatch && matchesAcceptedAnswer(normalizedAnswer, safeAcceptedAnswers);

      // 3. Rubric group concept matching
      const validatedGroups = validateRubricGroups(rubricCriteria);
      const totalGroups = validatedGroups.length;

      let matchedCount = 0;
      let criteriaEvaluation = [];

      if (totalGroups > 0) {
        criteriaEvaluation = buildCriteriaEvaluation(validatedGroups, normalizedAnswer);
        matchedCount = criteriaEvaluation.filter(c => c.satisfied).length;
      }

      // 4. Determine correctness
      let isCorrect = false;
      let semanticScore = 0.0;

      if (isExactMatch || isAcceptedAlternative) {
        // Exact or teacher-approved match — full credit
        isCorrect = true;
        semanticScore = 1.0;
      } else if (totalGroups > 0) {
        // Rubric-based: requires all groups satisfied AND minimum 3 words (matches SQL RPC logic)
        isCorrect = words >= 3 && matchedCount === totalGroups;
        if (isCorrect) {
          semanticScore = 1.0;
        } else if (matchedCount === totalGroups && words < 3) {
          // All concepts matched, but minimum-word requirement (>= 3 words) not met.
          // Award 50% partial credit for keyword coverage without complete explanation.
          semanticScore = 0.5;
        } else if (matchedCount > 0) {
          // Proportional partial credit based on concept groups covered.
          // If words < 3, cap partial credit at 50% of the proportional score.
          const proportion = matchedCount / totalGroups;
          semanticScore = words >= 3
            ? parseFloat(proportion.toFixed(4))
            : parseFloat((proportion * 0.5).toFixed(4));
        } else {
          semanticScore = 0.0;
        }
      } else if (normalizedExpected && normalizedAnswer === normalizedExpected) {
        isCorrect = true;
        semanticScore = 1.0;
      }

      // 5. Compute advisory points (official scoring is always via RPC)
      let pointsEarned = isCorrect
        ? safeMaxPoints
        : parseFloat((semanticScore * safeMaxPoints).toFixed(2));

      // Guard against rounding up to full points when not correct:
      // An incorrect answer must NEVER receive rounded full advisory points.
      if (!isCorrect && safeMaxPoints > 0 && pointsEarned >= safeMaxPoints) {
        pointsEarned = Math.max(0, parseFloat((safeMaxPoints - 0.01).toFixed(2)));
      }

      // 6. Build feedback
      const feedback = buildFeedback({
        isCorrect,
        semanticScore,
        matchedGroups: matchedCount,
        missedGroups: totalGroups - matchedCount,
        isExactMatch,
        isAcceptedAlternative,
        isTimeout: false
      });

      const evaluationSummary = isCorrect
        ? 'Wasto ang sagot.'
        : (semanticScore > 0 ? 'Bahagyang tama ang sagot.' : 'Kulang o hindi angkop ang sagot.');

      return {
        questionCode,
        studentAnswer: studentAnswer.trim(),
        isCorrect,
        isSemanticMatch: isCorrect,
        semanticScore,
        confidenceScore: null,
        feedback,
        evaluationSummary,
        criteriaEvaluation,
        pointsEarned,
        maxPoints: safeMaxPoints,
        model: MODEL_NAME,
        status: 'evaluated',
        evaluationMethod: 'deterministic_rubric',
        evaluatedAt: new Date().toISOString()
      };
    },

    /**
     * Persists an evaluation record into Supabase ai_evaluations table.
     * Enforces session ownership, question relationship, version check, idempotency, and service-role INSERT.
     */
    async recordEvaluation(client, serviceRoleClient, evaluationData) {
      if (!client && !serviceRoleClient) return null;

      const isGuest = evaluationData.isGuest === true;
      const studentId = evaluationData.studentId;
      if (!isGuest && (!studentId || typeof studentId !== 'string')) {
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

      const queryClient = (client && typeof client.from === 'function') ? client : serviceRoleClient;
      if (!queryClient || typeof queryClient.from !== 'function') return null;

      // 1. Enforce session ownership
      let verifiedSessionId = null;
      if (evaluationData.sessionId) {
        const { data: session, error: sessionErr } = await queryClient
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
        if (isGuest) {
          if (session.student_id !== null) {
            throw new HttpError(403, 'FORBIDDEN_SESSION', 'Session does not belong to a guest student.');
          }
        } else if (session.student_id !== studentId) {
          throw new HttpError(403, 'FORBIDDEN_SESSION', 'Session does not belong to the authenticated student.');
        }
        verifiedSessionId = session.id;
      } else if (isGuest) {
        throw new HttpError(400, 'SESSION_REQUIRED', 'A valid sessionId is required for guest evaluation.');
      }

      // 2. Validate question relationship
      if (evaluationData.questionCode) {
        const { data: dbQ, error: qErr } = await queryClient
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
      const { data: dbV, error: vErr } = await queryClient
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

      // 4. Idempotency check
      const aiReadTable = queryClient.from('ai_evaluations');
      if (verifiedSessionId && aiReadTable && typeof aiReadTable.select === 'function') {
        let query = aiReadTable
          .select('id, created_at, is_semantic_match, semantic_score, confidence_score, feedback, rubric_criteria, model_version, status, evaluated_at')
          .eq('session_id', verifiedSessionId)
          .eq('question_id', questionId)
          .eq('student_answer', evaluationData.studentAnswer);

        if (!isGuest && studentId) {
          query = query.eq('student_id', studentId);
        }

        const { data: existingEval, error: existingErr } = await query
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!existingErr && existingEval) {
          return { ...existingEval, isDuplicate: true };
        }
      }

      // 5. INSERT via service-role client only
      if (!serviceRoleClient || typeof serviceRoleClient.from !== 'function') {
        throw new HttpError(503, 'SERVICE_ROLE_UNAVAILABLE',
          'Service role client is required to persist evaluation records. ' +
          'Direct authenticated inserts are not permitted.');
      }
      const insertClient = serviceRoleClient;

      const payload = {
        student_id: isGuest ? null : studentId,
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
          model: evaluationData.model || MODEL_NAME,
          status: evaluationData.status || 'evaluated',
          evaluationMethod: evaluationData.evaluationMethod || 'deterministic_rubric',
          evaluationSummary: evaluationData.evaluationSummary || ''
        },
        model_version: evaluationData.model || MODEL_NAME,
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
        console.warn('[RubricEvaluator] Failed to record evaluation to Supabase:', error.message);
        throw new HttpError(503, 'DATABASE_ERROR', `Failed to record evaluation: ${error.message}`);
      }

      return data;
    }
  };
}

module.exports = {
  createRubricEvaluatorService,
  validateEvaluationInput,
  normalizeText,
  wordCount,
  phraseMatchesInAnswer,
  matchesAcceptedAnswer,
  groupMatchesInAnswer,
  validateRubricGroups,
  buildFeedback,
  buildCriteriaEvaluation
};
