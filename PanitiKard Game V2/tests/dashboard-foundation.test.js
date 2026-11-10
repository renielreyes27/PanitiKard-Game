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

// ---------------------------------------------------------------------------
// Admin-Only Dashboard Features (API Modal/Settings & System Status)
// ---------------------------------------------------------------------------

test('dashboard.html: API security card, API modal button, System Status panel, and API modal are hidden by default and marked data-admin-only="true"', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

  assert.match(
    html,
    /<div\s+id=["']stat-card-api-security["'][^>]*class=["'][^"']*hidden[^"']*["'][^>]*data-admin-only=["']true["']/i,
    'API security stat card must have id="stat-card-api-security", class="... hidden", and data-admin-only="true"'
  );
  assert.match(
    html,
    /<button[^>]*id=["']btn-open-api-modal["'][^>]*data-admin-only=["']true["']/i,
    'API modal button must have id="btn-open-api-modal" and data-admin-only="true"'
  );
  assert.match(
    html,
    /<div\s+id=["']panel-system-status["'][^>]*class=["'][^"']*hidden[^"']*["'][^>]*data-admin-only=["']true["']/i,
    'System status panel must have id="panel-system-status", class="... hidden", and data-admin-only="true"'
  );
  assert.match(
    html,
    /<div\s+id=["']modal-api-settings["'][^>]*class=["'][^"']*hidden[^"']*["'][^>]*data-admin-only=["']true["']/i,
    'API settings modal must have id="modal-api-settings", class="... hidden", and data-admin-only="true"'
  );
});

test('dashboard: Admin vs Teacher role visibility and access enforcement for API modal/settings and System Status', async () => {
  function makeMockEl(id, initialHidden = true) {
    const classes = new Set(initialHidden ? ['hidden'] : []);
    const attrs = { 'aria-hidden': initialHidden ? 'true' : null };
    return {
      id,
      textContent: '',
      innerHTML: '',
      classList: {
        add: (...names) => names.forEach(n => classes.add(n)),
        remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: (name) => classes.has(name),
        toggle: (name, force) => {
          const shouldHave = force !== undefined ? Boolean(force) : !classes.has(name);
          if (shouldHave) classes.add(name);
          else classes.delete(name);
        }
      },
      setAttribute: (k, v) => { attrs[k] = String(v); },
      removeAttribute: (k) => { delete attrs[k]; },
      getAttribute: (k) => attrs[k] ?? null
    };
  }

  const statCardApi = makeMockEl('stat-card-api-security', true);
  const btnOpenApi = makeMockEl('btn-open-api-modal', true);
  const panelStatus = makeMockEl('panel-system-status', true);
  const modalApi = makeMockEl('modal-api-settings', true);
  const map = {
    'stat-card-api-security': statCardApi,
    'btn-open-api-modal': btnOpenApi,
    'panel-system-status': panelStatus,
    'modal-api-settings': modalApi
  };

  const prevDoc = globalThis.document;
  globalThis.document = {
    getElementById: (id) => map[id] || null,
    querySelectorAll: (sel) => {
      if (sel === '[data-admin-only="true"]') {
        return [statCardApi, btnOpenApi, panelStatus, modalApi];
      }
      return [];
    }
  };

  const originalApiRequest = dashboardAuth.apiRequest;
  const originalGetProfile = dashboardAuth.getProfile;
  let currentMockProfile = null;
  dashboardAuth.getProfile = () => currentMockProfile;
  dashboardAuth.apiRequest = async (path) => {
    if (path === '/admin/system-status') {
      return {
        apiServer: { status: 'online', label: 'Online' },
        database: { status: 'connected', label: 'Connected' },
        rlsSecurity: { status: 'active', label: 'Active' },
        evaluator: { status: 'active', label: 'Ready' }
      };
    }
    if (path === '/admin/api-settings') {
      return {
        basePath: '/api/v1',
        rbacProtection: 'RBAC Protected',
        authMechanism: 'Verified JWT Bearer + Supabase RLS'
      };
    }
    return {};
  };

  try {
    // 1. Teacher role: cannot see or access API modal/settings or System Status
    currentMockProfile = { id: 't-1', email: 'guro@paaralan.ph', role: 'teacher', displayName: 'Guro Maria' };
    dashboard.applyRoleBasedVisibility(currentMockProfile);

    assert.equal(dashboard.isAdminUser(currentMockProfile), false);
    assert.equal(statCardApi.classList.contains('hidden'), true, 'Teacher must NOT see API security card');
    assert.equal(btnOpenApi.classList.contains('hidden'), true, 'Teacher must NOT see API modal button');
    assert.equal(panelStatus.classList.contains('hidden'), true, 'Teacher must NOT see System Status panel');
    assert.equal(modalApi.classList.contains('hidden'), true, 'Teacher must NOT see API settings modal');

    const teacherModalOpened = await dashboard.openApiSettingsModal();
    assert.equal(teacherModalOpened, false, 'Teacher must be blocked from opening API settings modal');
    assert.equal(modalApi.classList.contains('active'), false, 'API settings modal must remain inactive for Teacher');

    const teacherStatus = await dashboard.loadSystemStatus(currentMockProfile);
    assert.equal(teacherStatus, null, 'Teacher must not load system status');

    await assert.rejects(
      () => dashboardApi.getSystemStatus(),
      /Administrator role required/,
      'dashboardApi.getSystemStatus() must reject Teacher role'
    );
    await assert.rejects(
      () => dashboardApi.getApiSettings(),
      /Administrator role required/,
      'dashboardApi.getApiSettings() must reject Teacher role'
    );

    // 2. Admin role: can see and access API modal/settings and System Status
    currentMockProfile = { id: 'a-1', email: 'admin@paaralan.ph', role: 'admin', displayName: 'Admin Santos' };
    dashboard.applyRoleBasedVisibility(currentMockProfile);

    assert.equal(dashboard.isAdminUser(currentMockProfile), true);
    assert.equal(statCardApi.classList.contains('hidden'), false, 'Admin MUST see API security card');
    assert.equal(btnOpenApi.classList.contains('hidden'), false, 'Admin MUST see API modal button');
    assert.equal(panelStatus.classList.contains('hidden'), false, 'Admin MUST see System Status panel');

    const adminModalOpened = await dashboard.openApiSettingsModal();
    assert.equal(adminModalOpened, true, 'Admin must be able to open API settings modal');
    assert.equal(modalApi.classList.contains('active'), true, 'API settings modal must be active for Admin');
    assert.equal(modalApi.classList.contains('hidden'), false, 'API settings modal must be visible for Admin');

    const adminStatus = await dashboard.loadSystemStatus(currentMockProfile);
    assert.ok(adminStatus !== null, 'Admin must be able to load system status');
    assert.equal(adminStatus.apiServer.status, 'online');

    dashboard.closeApiSettingsModal();
    assert.equal(modalApi.classList.contains('active'), false, 'closeApiSettingsModal closes modal');

    // 3. Switching back to Teacher or signing out hides Admin-only elements again
    dashboard.applyRoleBasedVisibility({ id: 't-1', role: 'teacher' });
    assert.equal(statCardApi.classList.contains('hidden'), true);
    assert.equal(panelStatus.classList.contains('hidden'), true);
    assert.equal(modalApi.classList.contains('hidden'), true);

    // 4. Cached Admin profile in dashboardAuth MUST NOT reveal Admin UI after logout or auth error (profile = null)
    currentMockProfile = { id: 'a-1', email: 'admin@paaralan.ph', role: 'admin', displayName: 'Cached Admin' };
    dashboard.applyRoleBasedVisibility(currentMockProfile);
    assert.equal(statCardApi.classList.contains('hidden'), false, 'Precondition: Admin UI visible while logged in as Admin');

    // Simulate logout or auth error where applyRoleBasedVisibility(null) is called while dashboardAuth still caches old profile
    assert.equal(dashboard.getVerifiedRole(null), null, 'getVerifiedRole(null) must return null immediately');
    const visibleAfterNull = dashboard.applyRoleBasedVisibility(null);
    assert.equal(visibleAfterNull, false, 'applyRoleBasedVisibility(null) must return false');
    assert.equal(dashboard.getVerifiedRole(), null, 'getVerifiedRole() with no args must stay null after explicit clear despite cached profile');
    assert.equal(dashboard.isAdminUser(null), false, 'isAdminUser(null) must be false');
    assert.equal(dashboard.isAdminUser(), false, 'isAdminUser() must be false after explicit clear despite cached Admin profile');
    assert.equal(statCardApi.classList.contains('hidden'), true, 'API stat card must be hidden after applyRoleBasedVisibility(null)');
    assert.equal(btnOpenApi.classList.contains('hidden'), true, 'API button must be hidden after applyRoleBasedVisibility(null)');
    assert.equal(panelStatus.classList.contains('hidden'), true, 'System Status panel must be hidden after applyRoleBasedVisibility(null)');
    assert.equal(modalApi.classList.contains('hidden'), true, 'API modal must be hidden after applyRoleBasedVisibility(null)');

    const modalOpenedAfterClear = await dashboard.openApiSettingsModal();
    assert.equal(modalOpenedAfterClear, false, 'Cached Admin profile must not allow opening API settings modal after clear');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
    dashboardAuth.getProfile = originalGetProfile;
    dashboard.setCurrentProfile(null);
    globalThis.document = prevDoc;
  }
});
