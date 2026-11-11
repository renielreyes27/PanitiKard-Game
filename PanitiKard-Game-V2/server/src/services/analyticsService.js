const { HttpError } = require('../middleware/httpError');

function dbFailure(error, action) {
  if (!error) return;
  console.error(`[Analytics] ${action} failed:`, error.code || error.message);
  throw new HttpError(503, 'DATABASE_ERROR', `Unable to ${action.toLowerCase()}.`);
}

function normalizeStudentName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().toLowerCase();
}

function parseDateBoundary(range) {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { start: start.toISOString(), end: null };
  }
  if (range === '7days') {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: null };
  }
  if (range === '30days') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: null };
  }
  return { start: null, end: null };
}

function createAnalyticsService() {
  return {
    /**
     * Aggregates high-level analytics across game sessions.
     * Complies with rules:
     * - Incomplete/abandoned sessions are excluded from completed-session average scores.
     * - Reverse round scores are kept strictly separate from official main round averages.
     * - Distinct student count is based on normalized guest student name snapshots.
     */
    async getOverviewAnalytics(client, { topicCode, dateRange, startDate, endDate } = {}) {
      if (!client || typeof client.from !== 'function') {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is required.');
      }

      let query = client
        .from('game_sessions')
        .select(`
          id,
          topic_id,
          mode,
          status,
          student_name_snapshot,
          main_score,
          reverse_score,
          started_at,
          completed_at,
          topics (
            id,
            code,
            title
          )
        `);

      const boundary = parseDateBoundary(dateRange);
      const effectiveStart = startDate || boundary.start;
      const effectiveEnd = endDate || boundary.end;

      if (effectiveStart) query = query.gte('started_at', effectiveStart);
      if (effectiveEnd) query = query.lte('started_at', effectiveEnd);

      const { data: rawSessions, error } = await query.order('started_at', { ascending: false });
      dbFailure(error, 'Fetch game sessions for analytics');

      let sessions = rawSessions || [];

      if (topicCode && topicCode !== 'all') {
        sessions = sessions.filter(s => s.topics?.code === topicCode);
      }

      const totalSessions = sessions.length;
      const completedSessions = sessions.filter(s => s.status === 'completed');
      const activeSessions = sessions.filter(s => s.status === 'active');
      const abandonedSessions = sessions.filter(s => s.status === 'abandoned');

      const distinctNameSet = new Set();
      sessions.forEach(s => {
        const norm = normalizeStudentName(s.student_name_snapshot);
        if (norm) distinctNameSet.add(norm);
      });
      const distinctStudents = distinctNameSet.size;

      const completionRate = totalSessions > 0
        ? parseFloat(((completedSessions.length / totalSessions) * 100).toFixed(1))
        : 0;

      // Completed Main Round average score
      const totalCompletedMainScore = completedSessions.reduce((acc, s) => acc + (Number(s.main_score) || 0), 0);
      const averageMainScore = completedSessions.length > 0
        ? parseFloat((totalCompletedMainScore / completedSessions.length).toFixed(2))
        : 0;

      // Group performance by topic
      const topicMap = new Map();
      sessions.forEach(s => {
        const tCode = s.topics?.code || 'unknown';
        const tTitle = s.topics?.title || tCode;
        if (!topicMap.has(tCode)) {
          topicMap.set(tCode, {
            code: tCode,
            title: tTitle,
            totalSessions: 0,
            completedSessions: 0,
            totalMainScore: 0,
            reverseRoundSessions: 0,
            totalReverseScore: 0
          });
        }
        const entry = topicMap.get(tCode);
        entry.totalSessions += 1;
        if (s.status === 'completed') {
          entry.completedSessions += 1;
          entry.totalMainScore += (Number(s.main_score) || 0);
        }
        if (Number(s.reverse_score) > 0) {
          entry.reverseRoundSessions += 1;
          entry.totalReverseScore += Number(s.reverse_score);
        }
      });

      const topicPerformance = Array.from(topicMap.values()).map(t => ({
        code: t.code,
        title: t.title,
        totalSessions: t.totalSessions,
        completedSessions: t.completedSessions,
        completionRate: t.totalSessions > 0
          ? parseFloat(((t.completedSessions / t.totalSessions) * 100).toFixed(1))
          : 0,
        averageMainScore: t.completedSessions > 0
          ? parseFloat((t.totalMainScore / t.completedSessions).toFixed(2))
          : 0,
        averageReverseScore: t.reverseRoundSessions > 0
          ? parseFloat((t.totalReverseScore / t.reverseRoundSessions).toFixed(2))
          : 0
      })).sort((a, b) => b.totalSessions - a.totalSessions);

      return {
        summary: {
          totalSessions,
          distinctStudents,
          completedSessions: completedSessions.length,
          activeSessions: activeSessions.length,
          abandonedSessions: abandonedSessions.length,
          completionRate,
          averageMainScore,
          isDistinctGuestNames: true,
          notice: 'Ang bilang ng mga mag-aaral ay batay sa normalized guest student names (trim + lowercase), hindi mga verified user accounts.'
        },
        topicPerformance
      };
    },

    /**
     * Lists aggregated student records by normalized guest student name.
     */
    async listStudents(client, { search, topicCode, dateRange, startDate, endDate, limit = 50, offset = 0 } = {}) {
      if (!client || typeof client.from !== 'function') {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is required.');
      }

      let query = client
        .from('game_sessions')
        .select(`
          id,
          topic_id,
          mode,
          status,
          student_name_snapshot,
          main_score,
          reverse_score,
          started_at,
          completed_at,
          topics (
            id,
            code,
            title
          )
        `);

      const boundary = parseDateBoundary(dateRange);
      const effectiveStart = startDate || boundary.start;
      const effectiveEnd = endDate || boundary.end;

      if (effectiveStart) query = query.gte('started_at', effectiveStart);
      if (effectiveEnd) query = query.lte('started_at', effectiveEnd);

      const { data: rawSessions, error } = await query.order('started_at', { ascending: false });
      dbFailure(error, 'Fetch student sessions');

      let sessions = rawSessions || [];

      if (topicCode && topicCode !== 'all') {
        sessions = sessions.filter(s => s.topics?.code === topicCode);
      }

      const searchNorm = search ? search.trim().toLowerCase() : '';

      // Aggregate by normalized student name
      const studentMap = new Map();
      sessions.forEach(s => {
        const rawName = s.student_name_snapshot || 'Hindi Kilalang Mag-aaral';
        const normName = normalizeStudentName(rawName);
        if (!normName) return;

        if (searchNorm && !normName.includes(searchNorm)) {
          return;
        }

        if (!studentMap.has(normName)) {
          studentMap.set(normName, {
            displayName: rawName.trim(),
            normalizedName: normName,
            totalSessions: 0,
            completedSessions: 0,
            totalMainScore: 0,
            bestMainScore: 0,
            totalReverseScore: 0,
            lastPlayedAt: s.started_at,
            topicsPlayedMap: new Map()
          });
        }

        const student = studentMap.get(normName);
        student.totalSessions += 1;
        if (s.status === 'completed') {
          student.completedSessions += 1;
          const mScore = Number(s.main_score) || 0;
          student.totalMainScore += mScore;
          if (mScore > student.bestMainScore) {
            student.bestMainScore = mScore;
          }
        }
        student.totalReverseScore += (Number(s.reverse_score) || 0);

        if (new Date(s.started_at) > new Date(student.lastPlayedAt)) {
          student.lastPlayedAt = s.started_at;
          student.displayName = rawName.trim();
        }

        if (s.topics?.code) {
          student.topicsPlayedMap.set(s.topics.code, s.topics.title || s.topics.code);
        }
      });

      const aggregated = Array.from(studentMap.values()).map(st => ({
        displayName: st.displayName,
        normalizedName: st.normalizedName,
        totalSessions: st.totalSessions,
        completedSessions: st.completedSessions,
        averageMainScore: st.completedSessions > 0
          ? parseFloat((st.totalMainScore / st.completedSessions).toFixed(2))
          : 0,
        bestMainScore: st.bestMainScore,
        totalReverseScore: st.totalReverseScore,
        lastPlayedAt: st.lastPlayedAt,
        topicsPlayed: Array.from(st.topicsPlayedMap.entries()).map(([code, title]) => ({ code, title }))
      })).sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt));

      const paginated = aggregated.slice(offset, offset + limit);

      return {
        total: aggregated.length,
        limit,
        offset,
        students: paginated
      };
    },

    /**
     * Retrieves full chronological session history for an individual student name.
     */
    async getStudentHistory(client, studentName) {
      if (!client || typeof client.from !== 'function') {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is required.');
      }

      const normTarget = normalizeStudentName(studentName);
      if (!normTarget) {
        throw new HttpError(400, 'INVALID_STUDENT_NAME', 'Valid student name is required.');
      }

      const { data: rawSessions, error } = await client
        .from('game_sessions')
        .select(`
          id,
          topic_id,
          mode,
          status,
          student_name_snapshot,
          main_score,
          reverse_score,
          started_at,
          completed_at,
          topics (
            id,
            code,
            title
          )
        `)
        .order('started_at', { ascending: false });

      dbFailure(error, 'Fetch student session history');

      const studentSessions = (rawSessions || []).filter(
        s => normalizeStudentName(s.student_name_snapshot) === normTarget
      );

      const sessionsWithDetails = studentSessions.map(s => {
        let durationSeconds = null;
        if (s.started_at && s.completed_at) {
          durationSeconds = Math.max(0, Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 1000));
        }

        return {
          sessionId: s.id,
          topicCode: s.topics?.code || 'unknown',
          topicTitle: s.topics?.title || 'Hindi Matukoy na Paksa',
          mode: s.mode,
          status: s.status,
          mainScore: Number(s.main_score) || 0,
          reverseScore: Number(s.reverse_score) || 0,
          startedAt: s.started_at,
          completedAt: s.completed_at,
          durationSeconds
        };
      });

      return {
        studentName: studentSessions[0]?.student_name_snapshot || studentName,
        normalizedName: normTarget,
        totalSessions: sessionsWithDetails.length,
        completedSessions: sessionsWithDetails.filter(s => s.status === 'completed').length,
        sessions: sessionsWithDetails
      };
    },

    /**
     * Retrieves detailed question-by-question breakdown of a specific session.
     */
    async getSessionBreakdown(client, sessionId) {
      if (!client || typeof client.from !== 'function') {
        throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Database service is required.');
      }

      if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
        throw new HttpError(400, 'INVALID_SESSION_ID', 'Valid session UUID is required.');
      }

      // Load session
      const { data: session, error: sErr } = await client
        .from('game_sessions')
        .select(`
          id,
          topic_id,
          mode,
          status,
          student_name_snapshot,
          main_score,
          reverse_score,
          started_at,
          completed_at,
          topics (
            id,
            code,
            title
          )
        `)
        .eq('id', sessionId)
        .maybeSingle();

      dbFailure(sErr, 'Load session');
      if (!session) {
        throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found.');
      }

      // Load student answers
      const { data: rawAnswers, error: aErr } = await client
        .from('student_answers')
        .select(`
          id,
          question_id,
          question_version_id,
          round,
          response,
          is_correct,
          points_awarded,
          max_points,
          evaluation_method,
          answered_at,
          questions (
            id,
            code,
            card_categories (
              code,
              name
            )
          ),
          question_versions (
            id,
            version_number,
            prompt,
            title,
            question_type,
            explanation
          )
        `)
        .eq('session_id', sessionId)
        .order('answered_at', { ascending: true });

      dbFailure(aErr, 'Load session answers');

      // Load evaluations if any
      const { data: rawEvals, error: eErr } = await client
        .from('ai_evaluations')
        .select('question_id, student_answer, is_semantic_match, semantic_score, feedback, criteria_evaluation:rubric_criteria, evaluated_at')
        .eq('session_id', sessionId);

      dbFailure(eErr, 'Load session evaluations');

      const evalMap = new Map();
      (rawEvals || []).forEach(ev => {
        evalMap.set(ev.question_id, ev);
      });

      let totalPossibleMainPoints = 0;
      let totalAwardedMainPoints = 0;

      const answers = (rawAnswers || []).map(a => {
        const questionCode = a.questions?.code || 'unknown';
        const version = a.question_versions || {};
        const evalRecord = evalMap.get(a.question_id) || null;

        let studentResponseText = '';
        if (typeof a.response === 'string') {
          studentResponseText = a.response;
        } else if (a.response && typeof a.response === 'object') {
          studentResponseText = a.response.textAnswer || a.response.selectedOption || JSON.stringify(a.response);
        }

        if (a.round === 'main') {
          totalPossibleMainPoints += (Number(a.max_points) || 0);
          totalAwardedMainPoints += (Number(a.points_awarded) || 0);
        }

        return {
          answerId: a.id,
          questionCode,
          round: a.round,
          prompt: version.prompt || '',
          questionPrompt: version.prompt || '',
          title: version.title || '',
          questionType: version.question_type || 'multiple_choice',
          cardCategory: a.questions?.card_categories?.code || null,
          categoryName: a.questions?.card_categories?.name || null,
          response: studentResponseText,
          answerText: studentResponseText,
          isCorrect: a.is_correct,
          pointsAwarded: a.points_awarded,
          maxPoints: a.max_points,
          explanation: version.explanation || null,
          evaluationMethod: a.evaluation_method || 'standard',
          feedback: evalRecord?.feedback || null,
          semanticScore: evalRecord?.semantic_score !== undefined ? Number(evalRecord.semantic_score) : null,
          criteriaEvaluation: evalRecord?.criteria_evaluation || [],
          evaluation: evalRecord ? {
            feedback: evalRecord.feedback,
            rubricCriteria: evalRecord.criteria_evaluation
          } : null,
          answeredAt: a.answered_at
        };
      });

      const percentage = totalPossibleMainPoints > 0
        ? parseFloat(((totalAwardedMainPoints / totalPossibleMainPoints) * 100).toFixed(1))
        : 0;

      let durationSeconds = null;
      if (session.started_at && session.completed_at) {
        durationSeconds = Math.max(0, Math.round((new Date(session.completed_at) - new Date(session.started_at)) / 1000));
      }

      return {
        session: {
          sessionId: session.id,
          studentName: session.student_name_snapshot,
          topicCode: session.topics?.code || 'unknown',
          topicTitle: session.topics?.title || 'Hindi Matukoy na Paksa',
          mode: session.mode,
          status: session.status,
          mainScore: Number(session.main_score) || 0,
          reverseScore: Number(session.reverse_score) || 0,
          totalPossibleMainPoints,
          percentage,
          startedAt: session.started_at,
          completedAt: session.completed_at,
          durationSeconds
        },
        answers
      };
    }
  };
}

module.exports = { createAnalyticsService, normalizeStudentName, parseDateBoundary };
