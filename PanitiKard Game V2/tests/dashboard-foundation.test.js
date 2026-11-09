/**
 * PanitiKard V2 — Phase 6.3 Dashboard Foundation Tests
 *
 * Tests for:
 *   js/dashboard-api.js
 *   js/dashboard.js
 *
 * Verifies:
 *   - Navigation state management and view switching
 *   - Responsive mobile drawer toggles
 *   - Aggregation of overview metrics (live topics + placeholder markers)
 *   - Error resilience in overview statistics
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardAuth = require('../js/dashboard-auth');
const dashboardApi = require('../js/dashboard-api');
const dashboard = require('../js/dashboard');

test('dashboardApi: exports getTopics, getQuestion, getOverviewStats', () => {
  assert.equal(typeof dashboardApi.getTopics, 'function');
  assert.equal(typeof dashboardApi.getQuestion, 'function');
  assert.equal(typeof dashboardApi.getOverviewStats, 'function');
});

test('dashboard: exports navigation and sidebar controls', () => {
  assert.equal(typeof dashboard.switchView, 'function');
  assert.equal(typeof dashboard.getCurrentView, 'function');
  assert.equal(typeof dashboard.openMobileSidebar, 'function');
  assert.equal(typeof dashboard.closeMobileSidebar, 'function');
  assert.equal(typeof dashboard.toggleMobileSidebar, 'function');
  assert.equal(typeof dashboard.init, 'function');
});

test('dashboard: switchView manages valid views and falls back to overview on unknown view', () => {
  assert.equal(dashboard.switchView('topics'), 'topics');
  assert.equal(dashboard.getCurrentView(), 'topics');

  assert.equal(dashboard.switchView('questions'), 'questions');
  assert.equal(dashboard.getCurrentView(), 'questions');

  assert.equal(dashboard.switchView('account'), 'account');
  assert.equal(dashboard.getCurrentView(), 'account');

  assert.equal(dashboard.switchView('overview'), 'overview');
  assert.equal(dashboard.getCurrentView(), 'overview');

  // Fallback on invalid view name
  assert.equal(dashboard.switchView('non-existent-tab'), 'overview');
  assert.equal(dashboard.getCurrentView(), 'overview');
});

test('dashboardApi: getOverviewStats aggregates real topic status and marks placeholders', async () => {
  // Mock dashboardAuth.apiRequest
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path) => {
    if (path === '/admin/topics') {
      return [
        { id: '1', code: 't1', status: 'published', archived_at: null },
        { id: '2', code: 't2', status: 'published', archived_at: null },
        { id: '3', code: 't3', status: 'draft', archived_at: null },
        { id: '4', code: 't4', status: 'draft', archived_at: '2026-01-01' } // archived
      ];
    }
    throw new Error('Unknown path: ' + path);
  };

  try {
    const stats = await dashboardApi.getOverviewStats();
    assert.equal(stats.topics.total, 4);
    assert.equal(stats.topics.published, 2);
    assert.equal(stats.topics.draft, 1); // 1 active draft
    assert.equal(stats.topics.isLive, true);

    assert.equal(stats.questions.isPlaceholder, true);
    assert.equal(stats.questions.total, '--');
    assert.ok(stats.questions.label.includes('Phase 6.5'));

    assert.equal(stats.rubrics.isPlaceholder, true);
    assert.equal(stats.rubrics.total, '--');
    assert.ok(stats.rubrics.label.includes('Phase 6.6'));
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: getOverviewStats fails safely if topic endpoint errors', async () => {
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async () => {
    throw new Error('Database offline');
  };

  try {
    const stats = await dashboardApi.getOverviewStats();
    assert.equal(stats.topics.total, '--');
    assert.equal(stats.topics.isLive, false);
    assert.equal(stats.questions.isPlaceholder, true);
    assert.equal(stats.rubrics.isPlaceholder, true);
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: getTopics and getQuestion delegate to auth.apiRequest', async () => {
  const calls = [];
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path) => {
    calls.push(path);
    return { path };
  };

  try {
    await dashboardApi.getTopics();
    await dashboardApi.getQuestion('elem-statement');

    assert.equal(calls.length, 2);
    assert.equal(calls[0], '/admin/topics');
    assert.equal(calls[1], '/admin/questions/elem-statement');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboard: init() resolves gracefully when unauthenticated', async () => {
  dashboardAuth.reset();
  dashboardAuth.configure({ supabaseUrl: '', supabaseAnonKey: '' });
  const result = await dashboard.init();
  assert.equal(result, false);
});
