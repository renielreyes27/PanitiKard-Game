const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
let express;
try {
  express = require('express');
} catch {
  express = require('../server/node_modules/express');
}
const { createApiRouter } = require('../server/src/routes/apiRoutes');
const { createContentService } = require('../server/src/services/contentService');
const { createAuthenticator } = require('../server/src/middleware/authenticate');
const dashboardApi = require('../js/dashboard-api');
const dashboard = require('../js/dashboard');

function makeMockApp({ role = 'teacher', contentService = createContentService(), adminClient } = {}) {
  const app = express();
  app.use(express.json());

  const mockAuth = (req, _res, next) => {
    if (role === 'unauthenticated') {
      req.auth = null;
    } else {
      req.auth = {
        user: { id: 'test-user-id', email: 'test@school.edu.ph' },
        client: {},
        profile: { id: 'test-user-id', role }
      };
    }
    next();
  };

  const router = createApiRouter({
    contentService,
    authenticate: mockAuth,
    adminClientFactory: () => adminClient || {}
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
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn(base);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

describe('Phase 6.9: Centralized Delete & Archive Management', () => {

  // =========================================================================
  // Priority 1: Question Restore
  // =========================================================================
  describe('Priority 1: Question Restore', () => {
    test('POST /admin/questions/:code/restore succeeds for authorized teacher and returns status draft', async () => {
      let restoredCode = null;
      const contentService = {
        restoreQuestion: async (_client, code) => {
          restoredCode = code;
          return { id: 'q-1', code, status: 'draft', currentVersion: 2 };
        }
      };

      const app = makeMockApp({ role: 'teacher', contentService });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/questions/elem-q-001/restore`, {
          method: 'POST'
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.data.status, 'draft');
        assert.equal(restoredCode, 'elem-q-001');
      });
    });

    test('POST /admin/questions/:code/restore rejects student with 403 STAFF_REQUIRED', async () => {
      const app = makeMockApp({ role: 'student' });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/questions/elem-q-001/restore`, {
          method: 'POST'
        });
        const body = await res.json();
        assert.equal(res.status, 403);
        assert.equal(body.error, 'STAFF_REQUIRED');
      });
    });

    test('contentService.restoreQuestion: rejects if question is not archived (400 QUESTION_NOT_ARCHIVED)', async () => {
      const service = createContentService();
      const mockClient = {
        from: (table) => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'q-1', code: 'q-active', current_version: 1, status: 'published' },
                error: null
              })
            })
          })
        })
      };

      await assert.rejects(
        () => service.restoreQuestion(mockClient, 'q-active'),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'QUESTION_NOT_ARCHIVED');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // Priority 2: Discard Draft Revision
  // =========================================================================
  describe('Priority 2: Discard Draft Revision', () => {
    test('POST /admin/questions/:code/discard-draft succeeds for teacher and preserves published version', async () => {
      let discardedCode = null;
      const contentService = {
        discardDraftRevision: async (_client, code) => {
          discardedCode = code;
          return { id: 'q-1', code, discardedVersion: 2, currentVersion: 1 };
        }
      };

      const app = makeMockApp({ role: 'teacher', contentService });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/questions/elem-q-001/discard-draft`, {
          method: 'POST'
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.data.discardedVersion, 2);
        assert.equal(body.data.currentVersion, 1);
        assert.equal(discardedCode, 'elem-q-001');
      });
    });

    test('contentService.discardDraftRevision rejects if no draft revision exists (400 NO_DRAFT_REVISION)', async () => {
      const service = createContentService();
      const mockClient = {
        from: (table) => {
          if (table === 'questions') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'q-1', code: 'clean-q', current_version: 2, status: 'published' },
                    error: null
                  })
                })
              })
            };
          }
          if (table === 'question_versions') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: { id: 'v-2', version_number: 2 },
                        error: null
                      })
                    })
                  })
                })
              })
            };
          }
        }
      };

      await assert.rejects(
        () => service.discardDraftRevision(mockClient, 'clean-q'),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'NO_DRAFT_REVISION');
          return true;
        }
      );
    });

    test('contentService.discardDraftRevision rejects if draft version has gameplay records (409 DRAFT_HAS_DEPENDENCIES)', async () => {
      const service = createContentService();
      const mockClient = {
        from: (table) => {
          if (table === 'questions') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'q-1', code: 'played-q', current_version: 1, status: 'published' },
                    error: null
                  })
                })
              })
            };
          }
          if (table === 'question_versions') {
            return {
              select: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: { id: 'v-2', version_number: 2 },
                        error: null
                      })
                    })
                  })
                })
              })
            };
          }
          if (table === 'student_answers') {
            return {
              select: () => ({
                eq: async () => ({ count: 5, error: null })
              })
            };
          }
        }
      };

      await assert.rejects(
        () => service.discardDraftRevision(mockClient, 'played-q'),
        (err) => {
          assert.equal(err.status, 409);
          assert.equal(err.code, 'DRAFT_HAS_DEPENDENCIES');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // Priority 4: Staff Permanent Delete (Teacher + Admin)
  // =========================================================================
  describe('Priority 4: Staff Permanent Delete (Teacher + Admin)', () => {
    test('DELETE /admin/topics/:topicCode/permanent strictly rejects student with 403 STAFF_REQUIRED', async () => {
      const app = makeMockApp({ role: 'student' });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/topics/elements/permanent`, {
          method: 'DELETE'
        });
        const body = await res.json();
        assert.equal(res.status, 403);
        assert.equal(body.error, 'STAFF_REQUIRED');
      });
    });

    test('DELETE /admin/questions/:questionCode/permanent strictly rejects student with 403 STAFF_REQUIRED', async () => {
      const app = makeMockApp({ role: 'student' });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/questions/elem-q-001/permanent`, {
          method: 'DELETE'
        });
        const body = await res.json();
        assert.equal(res.status, 403);
        assert.equal(body.error, 'STAFF_REQUIRED');
      });
    });

    test('DELETE /admin/topics/:topicCode/permanent succeeds for teacher on unreferenced draft topic', async () => {
      let deletedTopic = null;
      const contentService = {
        deletePermanentTopic: async (_client, code) => {
          deletedTopic = code;
          return { success: true, deletedCode: code };
        }
      };

      const app = makeMockApp({ role: 'teacher', contentService });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/topics/unused-topic/permanent`, {
          method: 'DELETE'
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.success, true);
        assert.equal(deletedTopic, 'unused-topic');
      });
    });

    test('DELETE /admin/topics/:topicCode/permanent succeeds for admin on unreferenced draft topic', async () => {
      let deletedTopic = null;
      const contentService = {
        deletePermanentTopic: async (_client, code) => {
          deletedTopic = code;
          return { success: true, deletedCode: code };
        }
      };

      const app = makeMockApp({ role: 'admin', contentService });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/topics/unused-topic/permanent`, {
          method: 'DELETE'
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.success, true);
        assert.equal(deletedTopic, 'unused-topic');
      });
    });

    test('DELETE /admin/questions/:questionCode/permanent succeeds for teacher on unreferenced draft question', async () => {
      let deletedQuestion = null;
      const contentService = {
        deletePermanentQuestion: async (_client, code) => {
          deletedQuestion = code;
          return { success: true, deletedCode: code };
        }
      };

      const app = makeMockApp({ role: 'teacher', contentService });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/questions/unused-q/permanent`, {
          method: 'DELETE'
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.success, true);
        assert.equal(deletedQuestion, 'unused-q');
      });
    });

    test('DELETE /admin/questions/:questionCode/permanent succeeds for admin on unreferenced draft question', async () => {
      let deletedQuestion = null;
      const contentService = {
        deletePermanentQuestion: async (_client, code) => {
          deletedQuestion = code;
          return { success: true, deletedCode: code };
        }
      };

      const app = makeMockApp({ role: 'admin', contentService });
      await withServer(app, async (base) => {
        const res = await fetch(`${base}/api/v1/admin/questions/unused-q/permanent`, {
          method: 'DELETE'
        });
        const body = await res.json();
        assert.equal(res.status, 200);
        assert.equal(body.success, true);
        assert.equal(deletedQuestion, 'unused-q');
      });
    });

    test('contentService.deletePermanentTopic rejects published topic (400 CANNOT_DELETE_ACTIVE_TOPIC)', async () => {
      const service = createContentService();
      const mockClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 't-1', code: 'pub-topic', status: 'published' },
                error: null
              })
            })
          })
        })
      };

      await assert.rejects(
        () => service.deletePermanentTopic(mockClient, 'pub-topic'),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'CANNOT_DELETE_ACTIVE_TOPIC');
          return true;
        }
      );
    });

    test('contentService.deletePermanentTopic allows unreferenced archived topic', async () => {
      const service = createContentService();
      let deletedTopicId = null;
      const mockClient = {
        from: (table) => {
          if (table === 'topics') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 't-archived', code: 'archived-topic', status: 'archived' },
                    error: null
                  })
                })
              }),
              delete: () => ({
                eq: async (_col, val) => {
                  deletedTopicId = val;
                  return { error: null };
                }
              })
            };
          }
          if (table === 'questions' || table === 'game_sessions') {
            return {
              select: () => ({
                eq: async () => ({ count: 0, error: null })
              })
            };
          }
        }
      };

      const result = await service.deletePermanentTopic(mockClient, 'archived-topic');
      assert.equal(result.success, true);
      assert.equal(deletedTopicId, 't-archived');
    });

    test('contentService.deletePermanentTopic rejects archived topic containing game sessions (409 TOPIC_HAS_SESSIONS)', async () => {
      const service = createContentService();
      const mockClient = {
        from: (table) => {
          if (table === 'topics') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 't-sessions', code: 'topic-sessions', status: 'archived' },
                    error: null
                  })
                })
              })
            };
          }
          if (table === 'questions') {
            return {
              select: () => ({
                eq: async () => ({ count: 0, error: null })
              })
            };
          }
          if (table === 'game_sessions') {
            return {
              select: () => ({
                eq: async () => ({ count: 5, error: null })
              })
            };
          }
        }
      };

      await assert.rejects(
        () => service.deletePermanentTopic(mockClient, 'topic-sessions'),
        (err) => {
          assert.equal(err.status, 409);
          assert.equal(err.code, 'TOPIC_HAS_SESSIONS');
          return true;
        }
      );
    });

    test('contentService.deletePermanentTopic rejects draft topic containing questions (409 TOPIC_HAS_QUESTIONS)', async () => {
      const service = createContentService();
      const mockClient = {
        from: (table) => {
          if (table === 'topics') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 't-1', code: 'draft-topic', status: 'draft' },
                    error: null
                  })
                })
              })
            };
          }
          if (table === 'questions') {
            return {
              select: () => ({
                eq: async () => ({ count: 3, error: null })
              })
            };
          }
        }
      };

      await assert.rejects(
        () => service.deletePermanentTopic(mockClient, 'draft-topic'),
        (err) => {
          assert.equal(err.status, 409);
          assert.equal(err.code, 'TOPIC_HAS_QUESTIONS');
          return true;
        }
      );
    });

    test('contentService.deletePermanentQuestion rejects published question (400 CANNOT_DELETE_ACTIVE_QUESTION)', async () => {
      const service = createContentService();
      const mockClient = {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'q-pub', code: 'pub-q', status: 'published' },
                error: null
              })
            })
          })
        })
      };

      await assert.rejects(
        () => service.deletePermanentQuestion(mockClient, 'pub-q'),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'CANNOT_DELETE_ACTIVE_QUESTION');
          return true;
        }
      );
    });

    test('contentService.deletePermanentQuestion allows unreferenced archived question', async () => {
      const service = createContentService();
      let deletedQuestionId = null;
      const mockClient = {
        from: (table) => {
          if (table === 'questions') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'q-archived', code: 'archived-q', status: 'archived', current_version: 1 },
                    error: null
                  })
                })
              }),
              delete: () => ({
                eq: async (_col, val) => {
                  deletedQuestionId = val;
                  return { error: null };
                }
              })
            };
          }
          if (table === 'student_answers' || table === 'ai_evaluations') {
            return {
              select: () => ({
                eq: async () => ({ count: 0, error: null })
              })
            };
          }
          if (table === 'question_versions') {
            return {
              select: () => ({
                eq: async () => ({ data: [{ id: 'v-1' }], error: null })
              }),
              delete: () => ({
                eq: async () => ({ error: null })
              })
            };
          }
          if (table === 'question_choices' || table === 'question_evaluation_rubrics') {
            return {
              delete: () => ({
                in: async () => ({ error: null })
              })
            };
          }
        }
      };

      const result = await service.deletePermanentQuestion(mockClient, 'archived-q');
      assert.equal(result.success, true);
      assert.equal(deletedQuestionId, 'q-archived');
    });

    test('contentService.deletePermanentQuestion rejects draft question with student answers (409 QUESTION_HAS_ANSWERS)', async () => {
      const service = createContentService();
      const mockClient = {
        from: (table) => {
          if (table === 'questions') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'q-1', code: 'q-answers', status: 'draft' },
                    error: null
                  })
                })
              })
            };
          }
          if (table === 'student_answers') {
            return {
              select: () => ({
                eq: async () => ({ count: 12, error: null })
              })
            };
          }
        }
      };

      await assert.rejects(
        () => service.deletePermanentQuestion(mockClient, 'q-answers'),
        (err) => {
          assert.equal(err.status, 409);
          assert.equal(err.code, 'QUESTION_HAS_ANSWERS');
          return true;
        }
      );
    });

    test('contentService.deletePermanentQuestion rejects archived question with ai evaluations (409 QUESTION_HAS_EVALUATIONS)', async () => {
      const service = createContentService();
      const mockClient = {
        from: (table) => {
          if (table === 'questions') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: 'q-eval', code: 'q-eval', status: 'archived' },
                    error: null
                  })
                })
              })
            };
          }
          if (table === 'student_answers') {
            return {
              select: () => ({
                eq: async () => ({ count: 0, error: null })
              })
            };
          }
          if (table === 'ai_evaluations') {
            return {
              select: () => ({
                eq: async () => ({ count: 3, error: null })
              })
            };
          }
        }
      };

      await assert.rejects(
        () => service.deletePermanentQuestion(mockClient, 'q-eval'),
        (err) => {
          assert.equal(err.status, 409);
          assert.equal(err.code, 'QUESTION_HAS_EVALUATIONS');
          return true;
        }
      );
    });
  });

  // =========================================================================
  // Priority 3: Dashboard API & UI Controls
  // =========================================================================
  describe('Priority 3: Dashboard API and UI Controls', () => {
    test('dashboardApi exports restoreQuestion, discardDraftRevision, deleteTopicPermanent, and deleteQuestionPermanent', () => {
      assert.equal(typeof dashboardApi.restoreQuestion, 'function');
      assert.equal(typeof dashboardApi.discardDraftRevision, 'function');
      assert.equal(typeof dashboardApi.deleteTopicPermanent, 'function');
      assert.equal(typeof dashboardApi.deleteQuestionPermanent, 'function');
    });

    test('dashboard exports promptRestoreQuestion, promptDiscardDraft, promptDeleteTopic, and promptDeleteQuestion handlers', () => {
      assert.equal(typeof dashboard.promptRestoreQuestion, 'function');
      assert.equal(typeof dashboard.promptDiscardDraft, 'function');
      assert.equal(typeof dashboard.promptDeleteTopic, 'function');
      assert.equal(typeof dashboard.promptDeleteQuestion, 'function');
      assert.equal(typeof dashboard.promptPermanentDeleteTopic, 'function');
      assert.equal(typeof dashboard.promptPermanentDeleteQuestion, 'function');
    });

    test('dashboard exports isStaffUser and correctly verifies teacher and admin roles', () => {
      assert.equal(typeof dashboard.isStaffUser, 'function');
      assert.equal(dashboard.isStaffUser({ role: 'teacher' }), true);
      assert.equal(dashboard.isStaffUser({ role: 'admin' }), true);
      assert.equal(dashboard.isStaffUser({ role: 'student' }), false);
      assert.equal(dashboard.isStaffUser(null), false);
    });
  });
});
