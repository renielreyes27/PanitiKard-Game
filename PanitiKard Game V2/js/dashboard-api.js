/**
 * ==============================================================================
 * PanitiKard V2 — Dashboard API Client (Phase 6.3 - 6.5)
 * ==============================================================================
 *
 * Dedicated API helper for the Teacher/Admin Dashboard.
 * Relies on PANITIKARD_DASHBOARD_AUTH for secure JWT token attachment.
 */
(function (root) {
  'use strict';

  function getAuth() {
    return root.PANITIKARD_DASHBOARD_AUTH;
  }

  const dashboardApi = {
    // -------------------------------------------------------------------------
    // Topic Operations
    // -------------------------------------------------------------------------

    /**
     * Lists all topics (draft, published, archived) for authorized staff.
     */
    async getTopics() {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      return auth.apiRequest('/admin/topics');
    },

    /**
     * Creates a new topic in draft status.
     * @param {{ code: string, title: string, description?: string, competency?: string }} topicData
     */
    async createTopic(topicData) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      return auth.apiRequest('/admin/topics', {
        method: 'POST',
        body: topicData
      });
    },

    /**
     * Updates an existing topic's details or status.
     * @param {string} code - Topic slug identifier
     * @param {{ title?: string, description?: string, competency?: string, status?: 'draft'|'published'|'archived' }} updateData
     */
    async updateTopic(code, updateData) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      if (!code) throw new Error('Topic code is required.');
      return auth.apiRequest(`/admin/topics/${encodeURIComponent(code)}`, {
        method: 'PATCH',
        body: updateData
      });
    },

    /**
     * Publishes a topic so it becomes active in student gameplay.
     * @param {string} code
     */
    async publishTopic(code) {
      return this.updateTopic(code, { status: 'published' });
    },

    /**
     * Reverts a published topic back to draft (unpublish).
     * @param {string} code
     */
    async unpublishTopic(code) {
      return this.updateTopic(code, { status: 'draft' });
    },

    /**
     * Archives a topic.
     * @param {string} code
     */
    async archiveTopic(code) {
      return this.updateTopic(code, { status: 'archived' });
    },

    // -------------------------------------------------------------------------
    // Question Operations (Phase 6.5)
    // -------------------------------------------------------------------------

    /**
     * Lists questions for a given topic code.
     * @param {string} topicCode
     * @param {{ kind?: 'all'|'cards'|'quiz' }} [options={}]
     */
    async getQuestions(topicCode, options = {}) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      const kind = options.kind || 'all';
      return auth.apiRequest(`/admin/topics/${encodeURIComponent(topicCode)}/questions?kind=${encodeURIComponent(kind)}`);
    },

    /**
     * Aggregates questions across topics for unified view.
     * @param {Array<{code: string, title: string}>} [topics]
     */
    async getAllQuestions(topics = []) {
      const targetTopics = topics.length ? topics : await this.getTopics();
      const results = await Promise.allSettled(
        targetTopics.map(t => this.getQuestions(t.code))
      );
      const all = [];
      results.forEach((res, index) => {
        if (res.status === 'fulfilled' && res.value?.questions) {
          const t = targetTopics[index];
          res.value.questions.forEach(q => {
            all.push({
              ...q,
              topicTitle: t.title || q.topicCode,
              topicCode: t.code || q.topicCode
            });
          });
        }
      });
      return all;
    },

    /**
     * Retrieves full question detail by code including current version, choices, and rubric.
     * Optionally loads a specific version number or previews the latest draft revision.
     * @param {string} questionCode
     * @param {{ version?: number|string, previewDraft?: boolean }} [options={}]
     */
    async getQuestionDetail(questionCode, options = {}) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      const params = new URLSearchParams();
      if (options.version !== undefined && options.version !== null && options.version !== '') {
        params.append('version', String(options.version));
      }
      if (options.previewDraft) {
        params.append('previewDraft', 'true');
      }
      const qs = params.toString() ? `?${params.toString()}` : '';
      return auth.apiRequest(`/admin/questions/${encodeURIComponent(questionCode)}${qs}`);
    },

    /**
     * Alias for getQuestionDetail (backwards compatibility).
     * @param {string} questionCode
     * @param {{ version?: number|string, previewDraft?: boolean }} [options={}]
     */
    async getQuestion(questionCode, options = {}) {
      return this.getQuestionDetail(questionCode, options);
    },

    /**
     * Creates a new question under a topic.
     * @param {string} topicCode
     * @param {object} questionData
     */
    async createQuestion(topicCode, questionData) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      return auth.apiRequest(`/admin/topics/${encodeURIComponent(topicCode)}/questions`, {
        method: 'POST',
        body: questionData
      });
    },

    /**
     * Revises an existing question, creating the next immutable version.
     * In Option B workflow, this creates a draft revision without immediate publishing.
     * @param {string} questionCode
     * @param {object} questionData
     */
    async reviseQuestion(questionCode, questionData) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      return auth.apiRequest(`/admin/questions/${encodeURIComponent(questionCode)}`, {
        method: 'PUT',
        body: questionData
      });
    },

    /**
     * Publishes a question version to make it live for students.
     * Uses the backend publish_question_version() RPC safely.
     * @param {string} questionCode
     * @param {{ versionNumber?: number }} [options={}]
     */
    async publishQuestion(questionCode, options = {}) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      return auth.apiRequest(`/admin/questions/${encodeURIComponent(questionCode)}/publish`, {
        method: 'POST',
        body: options.versionNumber ? { versionNumber: options.versionNumber } : {}
      });
    },

    /**
     * Reverts a published question to draft status, hiding it from students.
     * @param {string} questionCode
     */
    async unpublishQuestion(questionCode) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      return auth.apiRequest(`/admin/questions/${encodeURIComponent(questionCode)}/unpublish`, {
        method: 'POST'
      });
    },

    /**
     * Archives a question.
     * @param {string} questionCode
     */
    async archiveQuestion(questionCode) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      return auth.apiRequest(`/admin/questions/${encodeURIComponent(questionCode)}`, {
        method: 'DELETE'
      });
    },

    // -------------------------------------------------------------------------
    // Rubric Operations (Phase 6.6)
    // -------------------------------------------------------------------------

    /**
     * Lists rubric summaries across all questions for authorized staff.
     * Each rubric is tied to a specific question version and is immutable.
     * "Editing" a rubric requires revising the question via reviseQuestion().
     * @param {{ topicCode?: string }} [options={}]
     */
    async getRubrics(options = {}) {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      const qs = options.topicCode
        ? `?topicCode=${encodeURIComponent(options.topicCode)}`
        : '';
      return auth.apiRequest(`/admin/rubrics${qs}`);
    },

    // -------------------------------------------------------------------------
    // Admin-Only System Status & API Settings Operations
    // -------------------------------------------------------------------------

    /**
     * Retrieves system status and API configuration for Administrator accounts only.
     * Enforced both client-side via verified profile role and server-side via requireAdmin.
     */
    async getSystemStatus() {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      const profile = typeof auth.getProfile === 'function' ? auth.getProfile() : null;
      if (profile && profile.role !== 'admin') {
        throw new Error('Administrator role required.');
      }
      return auth.apiRequest('/admin/system-status');
    },

    /**
     * Retrieves API security & configuration details for Administrator accounts only.
     */
    async getApiSettings() {
      const auth = getAuth();
      if (!auth) throw new Error('Dashboard authentication is not initialized.');
      const profile = typeof auth.getProfile === 'function' ? auth.getProfile() : null;
      if (profile && profile.role !== 'admin') {
        throw new Error('Administrator role required.');
      }
      return auth.apiRequest('/admin/api-settings');
    },

    // -------------------------------------------------------------------------
    // Overview Metrics Aggregator
    // -------------------------------------------------------------------------

    /**
     * Aggregates dashboard overview metrics:
     * - Uses real data from GET /admin/topics
     * - Flags questions and rubrics as placeholders until dedicated count endpoints are available
     */
    async getOverviewStats() {
      try {
        const topics = await this.getTopics();
        const topicList = Array.isArray(topics) ? topics : [];
        const publishedTopics = topicList.filter(t => t.status === 'published' && !t.archived_at).length;
        const draftTopics = topicList.filter(t => t.status === 'draft' && !t.archived_at).length;
        const archivedTopics = topicList.filter(t => t.status === 'archived' || t.archived_at).length;

        return {
          topics: {
            total: topicList.length,
            published: publishedTopics,
            draft: draftTopics,
            archived: archivedTopics,
            isLive: true
          },
          questions: {
            total: '--',
            isPlaceholder: true,
            label: 'Parating sa Phase 6.5'
          },
          rubrics: {
            total: '--',
            isPlaceholder: true,
            label: 'Parating sa Phase 6.6'
          }
        };
      } catch (err) {
        console.warn('[DashboardApi] Unable to load live stats:', err.message);
        return {
          topics: { total: '--', published: 0, draft: 0, archived: 0, isLive: false, label: 'Offline / Hindi ma-load' },
          questions: { total: '--', isPlaceholder: true, label: 'Parating sa Phase 6.5' },
          rubrics: { total: '--', isPlaceholder: true, label: 'Parating sa Phase 6.6' }
        };
      }
    }
  };

  root.PANITIKARD_DASHBOARD_API = dashboardApi;
  if (typeof module !== 'undefined' && module.exports) module.exports = dashboardApi;
})(typeof window !== 'undefined' ? window : globalThis);
