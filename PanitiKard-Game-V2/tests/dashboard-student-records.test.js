/**
 * PanitiKard V2 — Phase 7: Student Records & Analytics Test Suite
 *
 * Covers:
 * 1. analyticsService business logic & calculation rules:
 *    - Incomplete/abandoned sessions excluded from average scores
 *    - Reverse round scores kept separate from official main round averages
 *    - Distinct guest student name normalization (trim + lowercase)
 *    - Topic popularity and performance breakdown
 *    - Chronological student history & duration calculations
 *    - Question-by-question breakdown retrieval
 * 2. API Routes authorization (authenticate + requireStaff):
 *    - Rejection of unauthenticated and non-staff requests
 *    - Access for verified Teachers and Administrators
 * 3. Client dashboard-api.js methods (getAnalyticsOverview, getStudentsList, getStudentHistory, getSessionBreakdown)
 * 4. Controller js/dashboard.js view switching and DOM rendering
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
let express;
try {
  express = require('express');
} catch {
  express = require('../server/node_modules/express');
}

const { createAnalyticsService } = require('../server/src/services/analyticsService');
const { createApiRouter } = require('../server/src/routes/apiRoutes');
const dashboardApi = require('../js/dashboard-api');
const dashboard = require('../js/dashboard');

// Sample dataset simulating Supabase game_sessions table
function createMockSupabaseClient() {
  const SESSIONS_DATA = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      topic_id: 't-1',
      mode: 'standard',
      status: 'completed',
      student_name_snapshot: 'Juan Dela Cruz',
      main_score: 15,
      reverse_score: 5,
      started_at: '2026-11-01T10:00:00Z',
      completed_at: '2026-11-01T10:05:00Z',
      topics: { id: 't-1', code: 'panitikan', title: 'Elemento ng Panitikan' }
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      topic_id: 't-1',
      mode: 'standard',
      status: 'completed',
      student_name_snapshot: '  juan dela cruz  ', // Should normalize to same student
      main_score: 25,
      reverse_score: 0,
      started_at: '2026-11-02T11:00:00Z',
      completed_at: '2026-11-02T11:07:30Z',
      topics: { id: 't-1', code: 'panitikan', title: 'Elemento ng Panitikan' }
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      topic_id: 't-1',
      mode: 'standard',
      status: 'abandoned',
      student_name_snapshot: 'Maria Clara',
      main_score: 8,
      reverse_score: 0,
      started_at: '2026-11-03T09:00:00Z',
      completed_at: null,
      topics: { id: 't-1', code: 'panitikan', title: 'Elemento ng Panitikan' }
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      topic_id: 't-2',
      mode: 'standard',
      status: 'active',
      student_name_snapshot: 'Pedro Penduko',
      main_score: 10,
      reverse_score: 0,
      started_at: '2026-11-04T14:00:00Z',
      completed_at: null,
      topics: { id: 't-2', code: 'tayutay', title: 'Tayutay at Talinghaga' }
    }
  ];

  const ANSWERS_DATA = [
    {
      id: 'ans-1',
      session_id: '11111111-1111-1111-1111-111111111111',
      question_id: 'q-1',
      question_version_id: 'qv-1',
      round: 'main',
      response: 'Simili',
      is_correct: true,
      points_awarded: 2,
      max_points: 2,
      answered_at: '2026-11-01T10:01:00Z',
      questions: {
        id: 'q-1',
        code: 'tay-001',
        card_categories: { code: 'question', name: 'Tanong' }
      },
      question_versions: {
        id: 'qv-1',
        prompt: 'Ano ang tawag sa pagtutulad gamit ang mga salitang gaya ng, tulad ng?',
        card_category: 'question',
        question_type: 'identification',
        points: 2,
        explanation: 'Simili o pagtutulad ang tawag dito.'
      }
    },
    {
      id: 'ans-2',
      session_id: '11111111-1111-1111-1111-111111111111',
      question_id: 'q-2',
      question_version_id: 'qv-2',
      round: 'main',
      response: 'Maling sagot',
      is_correct: false,
      points_awarded: 0,
      max_points: 3,
      answered_at: '2026-11-01T10:02:00Z',
      questions: {
        id: 'q-2',
        code: 'tay-002',
        card_categories: { code: 'question', name: 'Tanong' }
      },
      question_versions: {
        id: 'qv-2',
        prompt: 'Ipaliwanag ang metapora.',
        card_category: 'question',
        question_type: 'open_ended',
        points: 3,
        explanation: 'Direktang paghahambing nang hindi gumagamit ng mga pantukoy.'
      }
    }
  ];

  return {
    from(tableName) {
      if (tableName === 'game_sessions') {
        let filtered = [...SESSIONS_DATA];
        const chain = {
          select() { return chain; },
          gte(col, val) {
            filtered = filtered.filter(row => row[col] >= val);
            return chain;
          },
          lte(col, val) {
            filtered = filtered.filter(row => row[col] <= val);
            return chain;
          },
          order() {
            return {
              data: filtered,
              error: null,
              async maybeSingle() {
                return { data: filtered[0] || null, error: null };
              }
            };
          },
          eq(col, val) {
            filtered = filtered.filter(row => row[col] === val);
            return {
              ...chain,
              async maybeSingle() {
                return { data: filtered[0] || null, error: null };
              }
            };
          }
        };
        return chain;
      }

      if (tableName === 'student_answers') {
        let filtered = [...ANSWERS_DATA];
        const chain = {
          select() { return chain; },
          eq(col, val) {
            filtered = filtered.filter(row => row.session_id === val);
            return chain;
          },
          order() {
            return { data: filtered, error: null };
          }
        };
        return chain;
      }

      if (tableName === 'ai_evaluations') {
        const chain = {
          select() { return chain; },
          eq(col, val) {
            return {
              data: [
                {
                  question_id: 'q-2',
                  student_answer: 'Maling sagot',
                  is_semantic_match: false,
                  semantic_score: 0.1,
                  feedback: 'Kulang ang paliwanag sa katangian ng metapora.',
                  rubric_criteria: { expectedKeywords: ['direktang', 'paghahambing'] },
                  evaluated_at: '2026-11-01T10:02:05Z'
                }
              ],
              error: null
            };
          }
        };
        return chain;
      }

      return {
        select() { return this; },
        eq() { return this; },
        order() { return { data: [], error: null }; }
      };
    }
  };
}

describe('Phase 7: Student Records & Analytics', () => {

  // =========================================================================
  // Section 1: Analytics Service Business Logic & Accuracy Rules
  // =========================================================================
  describe('analyticsService calculation rules', () => {
    const service = createAnalyticsService();

    test('getOverviewAnalytics computes accurate summary statistics and excludes incomplete sessions from average score', async () => {
      const mockClient = createMockSupabaseClient();
      const result = await service.getOverviewAnalytics(mockClient);

      const summary = result.summary;
      assert.equal(summary.totalSessions, 4, 'Total sessions must count all statuses');
      assert.equal(summary.completedSessions, 2, 'Completed sessions count');
      assert.equal(summary.abandonedSessions, 1, 'Abandoned sessions count');
      assert.equal(summary.activeSessions, 1, 'Active sessions count');

      // Distinct student names: "Juan Dela Cruz" and "  juan dela cruz  " must normalize to 1.
      // Along with "Maria Clara" and "Pedro Penduko", distinct count is exactly 3.
      assert.equal(summary.distinctStudents, 3, 'Distinct student count must be normalized');

      // Completion rate = 2 / 4 * 100 = 50.0%
      assert.equal(summary.completionRate, 50.0);

      // Average Main Score: strictly for completed sessions!
      // Completed sessions have scores 15 and 25 -> average = (15 + 25) / 2 = 20.0
      // Incomplete sessions (scores 8 and 10) must be excluded!
      assert.equal(summary.averageMainScore, 20.0, 'Incomplete sessions must be excluded from average main score');

      // Reverse Round scores must NOT be added to main round average score
      assert.equal(summary.isDistinctGuestNames, true);
    });

    test('getOverviewAnalytics filters by topicCode', async () => {
      const mockClient = createMockSupabaseClient();
      const result = await service.getOverviewAnalytics(mockClient, { topicCode: 'tayutay' });

      assert.equal(result.summary.totalSessions, 1);
      assert.equal(result.summary.distinctStudents, 1);
      assert.equal(result.summary.completedSessions, 0);
      assert.equal(result.summary.averageMainScore, 0);
    });

    test('listStudents aggregates normalized student names and provides summary metrics', async () => {
      const mockClient = createMockSupabaseClient();
      const result = await service.listStudents(mockClient);

      assert.equal(result.total, 3, 'There should be 3 aggregated distinct student records');
      const juan = result.students.find(s => s.normalizedName === 'juan dela cruz');
      assert.ok(juan, 'Juan Dela Cruz should exist as a consolidated record');
      assert.equal(juan.totalSessions, 2, 'Juan should have 2 sessions consolidated');
      assert.equal(juan.completedSessions, 2);
      assert.equal(juan.averageMainScore, 20.0, 'Average of 15 and 25 is 20');
      assert.equal(juan.bestMainScore, 25, 'Best main score is 25');
      assert.equal(juan.totalReverseScore, 5, 'Reverse score is 5');
    });

    test('listStudents search filters student records by name substring', async () => {
      const mockClient = createMockSupabaseClient();
      const result = await service.listStudents(mockClient, { search: 'clara' });

      assert.equal(result.total, 1);
      assert.equal(result.students[0].normalizedName, 'maria clara');
    });

    test('getStudentHistory returns chronological history and durationSeconds', async () => {
      const mockClient = createMockSupabaseClient();
      const history = await service.getStudentHistory(mockClient, 'Juan Dela Cruz');

      assert.equal(history.totalSessions, 2);
      assert.equal(history.completedSessions, 2);
      assert.equal(history.sessions.length, 2);

      const first = history.sessions.find(s => s.sessionId === '11111111-1111-1111-1111-111111111111');
      assert.ok(first);
      // Started 10:00:00, completed 10:05:00 = 300 seconds
      assert.equal(first.durationSeconds, 300);
      assert.equal(first.mainScore, 15);
      assert.equal(first.reverseScore, 5);
    });

    test('getSessionBreakdown returns question details and evaluations', async () => {
      const mockClient = createMockSupabaseClient();
      const breakdown = await service.getSessionBreakdown(mockClient, '11111111-1111-1111-1111-111111111111');

      assert.ok(breakdown.session);
      assert.equal(breakdown.session.sessionId, '11111111-1111-1111-1111-111111111111');
      assert.equal(breakdown.answers.length, 2);

      const q1 = breakdown.answers[0];
      assert.equal(q1.isCorrect, true);
      assert.equal(q1.pointsAwarded, 2);

      const q2 = breakdown.answers[1];
      assert.equal(q2.isCorrect, false);
      assert.equal(q2.pointsAwarded, 0);
      assert.ok(q2.evaluation);
      assert.equal(q2.evaluation.feedback, 'Kulang ang paliwanag sa katangian ng metapora.');
    });

    test('getSessionBreakdown rejects invalid session UUID', async () => {
      const mockClient = createMockSupabaseClient();
      await assert.rejects(
        () => service.getSessionBreakdown(mockClient, 'invalid-uuid-format'),
        /Valid session UUID is required/
      );
    });
  });

  // =========================================================================
  // Section 2: API Routes & Authorization
  // =========================================================================
  describe('API Routes staff-only authorization', () => {
    function makeApp({ role = 'teacher', analyticsService = createAnalyticsService() } = {}) {
      const app = express();
      app.use(express.json());

      const mockAuth = (req, _res, next) => {
        if (role === 'unauthenticated') {
          req.auth = null;
        } else {
          req.auth = {
            user: { id: 'test-user', email: 'test@school.edu.ph' },
            client: createMockSupabaseClient(),
            profile: { id: 'test-user', role }
          };
        }
        next();
      };

      const router = createApiRouter({
        analyticsService,
        authenticate: mockAuth
      });

      app.use('/api/v1', router);

      app.use((err, _req, res, _next) => {
        const status = Number.isInteger(err.status) ? err.status : 500;
        res.status(status).json({
          success: false,
          error: err.code || 'INTERNAL_ERROR',
          message: err.message
        });
      });

      return app;
    }

    async function withServer(app, fn) {
      const server = app.listen(0);
      await new Promise(res => server.once('listening', res));
      const port = server.address().port;
      const base = `http://127.0.0.1:${port}`;
      try {
        await fn(base);
      } finally {
        await new Promise(res => server.close(res));
      }
    }

    test('GET /admin/analytics/overview requires authentication (401/403 for unauthenticated)', async () => {
      const app = makeApp({ role: 'unauthenticated' });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/analytics/overview`);
        assert.equal(res.status, 403);
      });
    });

    test('GET /admin/analytics/overview rejects non-staff role (e.g. student)', async () => {
      const app = makeApp({ role: 'student' });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/analytics/overview`);
        assert.equal(res.status, 403);
      });
    });

    test('GET /admin/analytics/overview succeeds for teacher', async () => {
      const app = makeApp({ role: 'teacher' });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/analytics/overview`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.data.summary.totalSessions, 4);
      });
    });

    test('GET /admin/students succeeds for teacher', async () => {
      const app = makeApp({ role: 'teacher' });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/students?search=juan`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.data.total, 1);
      });
    });

    test('GET /admin/students/:studentName/history succeeds for teacher', async () => {
      const app = makeApp({ role: 'teacher' });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/students/Juan%20Dela%20Cruz/history`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.data.totalSessions, 2);
      });
    });

    test('GET /admin/sessions/:sessionId/breakdown succeeds for teacher', async () => {
      const app = makeApp({ role: 'teacher' });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/sessions/11111111-1111-1111-1111-111111111111/breakdown`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.success, true);
        assert.equal(body.data.answers.length, 2);
      });
    });
  });

  // =========================================================================
  // Section 3: dashboard-api.js Client Methods
  // =========================================================================
  describe('dashboard-api.js Phase 7 client methods', () => {
    test('methods are exposed and construct correct endpoints', async () => {
      let recordedUrl = null;
      const fakeAuth = {
        apiRequest: async (endpoint) => {
          recordedUrl = endpoint;
          return { success: true };
        }
      };

      const originalAuth = globalThis.PANITIKARD_DASHBOARD_AUTH;
      globalThis.PANITIKARD_DASHBOARD_AUTH = fakeAuth;

      try {
        await dashboardApi.getAnalyticsOverview({ topicCode: 'panitikan', dateRange: '7days' });
        assert.equal(recordedUrl, '/admin/analytics/overview?topicCode=panitikan&dateRange=7days');

        await dashboardApi.getStudentsList({ search: 'juan', limit: 25 });
        assert.equal(recordedUrl, '/admin/students?search=juan&limit=25');

        await dashboardApi.getStudentHistory('Juan Dela Cruz');
        assert.equal(recordedUrl, '/admin/students/Juan%20Dela%20Cruz/history');

        await dashboardApi.getSessionBreakdown('11111111-1111-1111-1111-111111111111');
        assert.equal(recordedUrl, '/admin/sessions/11111111-1111-1111-1111-111111111111/breakdown');
      } finally {
        globalThis.PANITIKARD_DASHBOARD_AUTH = originalAuth;
      }
    });
  });

  // =========================================================================
  // Section 4: dashboard.js View Controller Integration
  // =========================================================================
  describe('dashboard.js controller student records integration', () => {
    test('VALID_VIEWS includes students and switchView switches to students', () => {
      assert.equal(dashboard.switchView('students'), 'students');
    });

    test('controller exports Phase 7 methods', () => {
      assert.equal(typeof dashboard.loadAnalyticsOverview, 'function');
      assert.equal(typeof dashboard.loadStudents, 'function');
      assert.equal(typeof dashboard.openStudentHistoryModal, 'function');
      assert.equal(typeof dashboard.openSessionBreakdownModal, 'function');
      assert.equal(typeof dashboard.renderAnalyticsOverview, 'function');
      assert.equal(typeof dashboard.renderStudents, 'function');
      assert.equal(typeof dashboard.renderStudentHistory, 'function');
      assert.equal(typeof dashboard.renderSessionBreakdown, 'function');
    });
  });

});
