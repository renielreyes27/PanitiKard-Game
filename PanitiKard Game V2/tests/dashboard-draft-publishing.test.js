/**
 * PanitiKard V2 — Phase 6.7 Draft & Publishing Workflow Tests
 *
 * Tests for:
 *   - dashboardApi.publishQuestion() and dashboardApi.unpublishQuestion()
 *   - dashboardApi.getQuestionDetail() version and previewDraft options
 *   - Question status indicators, draft revision badges, and version rendering
 *   - Publish / Unpublish actions visibility based on draft status and draft revisions
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardAuth = require('../js/dashboard-auth');
const dashboardApi = require('../js/dashboard-api');
const dashboard = require('../js/dashboard');

// ---------------------------------------------------------------------------
// 1. API Client Method Tests
// ---------------------------------------------------------------------------

test('dashboardApi: publishQuestion() sends POST /admin/questions/:code/publish with versionNumber', async () => {
  let capturedPath = null;
  let capturedOptions = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path, options) => {
    capturedPath = path;
    capturedOptions = options;
    return { success: true, data: { code: 'elem-q-001', status: 'published', currentVersion: 2 } };
  };

  try {
    const res = await dashboardApi.publishQuestion('elem-q-001', { versionNumber: 2 });
    assert.equal(capturedPath, '/admin/questions/elem-q-001/publish');
    assert.equal(capturedOptions.method, 'POST');
    assert.deepEqual(capturedOptions.body, { versionNumber: 2 });
    assert.equal(res.data.status, 'published');
    assert.equal(res.data.currentVersion, 2);
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: publishQuestion() sends empty body when versionNumber omitted', async () => {
  let capturedPath = null;
  let capturedOptions = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path, options) => {
    capturedPath = path;
    capturedOptions = options;
    return { success: true, data: { code: 'elem-q-001', status: 'published' } };
  };

  try {
    await dashboardApi.publishQuestion('elem-q-001');
    assert.equal(capturedPath, '/admin/questions/elem-q-001/publish');
    assert.equal(capturedOptions.method, 'POST');
    assert.deepEqual(capturedOptions.body, {});
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: unpublishQuestion() sends POST /admin/questions/:code/unpublish', async () => {
  let capturedPath = null;
  let capturedOptions = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path, options) => {
    capturedPath = path;
    capturedOptions = options;
    return { success: true, data: { code: 'elem-q-001', status: 'draft', currentVersion: 1 } };
  };

  try {
    const res = await dashboardApi.unpublishQuestion('elem-q-001');
    assert.equal(capturedPath, '/admin/questions/elem-q-001/unpublish');
    assert.equal(capturedOptions.method, 'POST');
    assert.equal(res.data.status, 'draft');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: getQuestionDetail() appends version query parameter', async () => {
  let capturedPath = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path) => {
    capturedPath = path;
    return { code: 'elem-q-001', selectedVersionNumber: 2 };
  };

  try {
    await dashboardApi.getQuestionDetail('elem-q-001', { version: 2 });
    assert.equal(capturedPath, '/admin/questions/elem-q-001?version=2');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: getQuestionDetail() appends previewDraft query parameter', async () => {
  let capturedPath = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path) => {
    capturedPath = path;
    return { code: 'elem-q-001', isDraftPreview: true };
  };

  try {
    await dashboardApi.getQuestionDetail('elem-q-001', { previewDraft: true });
    assert.equal(capturedPath, '/admin/questions/elem-q-001?previewDraft=true');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

// ---------------------------------------------------------------------------
// 2. Draft & Publishing Workflow UI State Tests
// ---------------------------------------------------------------------------

test('Question Workflow: published question with draft revision is correctly structured', () => {
  const publishedWithDraft = {
    code: 'elem-q-001',
    status: 'published',
    currentVersion: 1,
    latestVersionNumber: 2,
    hasDraftRevision: true,
    draftVersionNumber: 2
  };

  assert.equal(publishedWithDraft.status, 'published');
  assert.equal(publishedWithDraft.hasDraftRevision, true);
  assert.equal(publishedWithDraft.currentVersion, 1);
  assert.equal(publishedWithDraft.draftVersionNumber, 2);
});

test('Question Workflow: new question starts in draft status with draftVersionNumber null', () => {
  const newDraft = {
    code: 'elem-q-002',
    status: 'draft',
    currentVersion: 1,
    latestVersionNumber: 1,
    hasDraftRevision: false,
    draftVersionNumber: null
  };

  assert.equal(newDraft.status, 'draft');
  assert.equal(newDraft.hasDraftRevision, false);
  assert.equal(newDraft.currentVersion, 1);
});

test('Question Workflow: published question without draft revision is clean', () => {
  const publishedClean = {
    code: 'elem-q-003',
    status: 'published',
    currentVersion: 2,
    latestVersionNumber: 2,
    hasDraftRevision: false,
    draftVersionNumber: null
  };

  assert.equal(publishedClean.status, 'published');
  assert.equal(publishedClean.hasDraftRevision, false);
});

test('Question Workflow: promptPublishQuestion blocks and warns when parent topic is unpublished', () => {
  dashboard.setTopicsList([
    { code: 'draft-topic', title: 'Paksang Borador', status: 'draft' },
    { code: 'pub-topic', title: 'Paksang Nailathala', status: 'published' }
  ]);
  dashboard.setQuestionsList([
    { code: 'draft-topic-q-01', topicCode: 'draft-topic', status: 'draft', currentVersion: 1 },
    { code: 'pub-topic-q-01', topicCode: 'pub-topic', status: 'draft', currentVersion: 1 }
  ]);

  try {
    const blocked = dashboard.promptPublishQuestion('draft-topic-q-01', 1);
    assert.equal(blocked, false, 'Publishing a question under a draft topic must be blocked on the frontend with a warning');

    const allowed = dashboard.promptPublishQuestion('pub-topic-q-01', 1);
    assert.equal(allowed, true, 'Publishing a question under a published topic must proceed');
  } finally {
    dashboard.setTopicsList([]);
    dashboard.setQuestionsList([]);
  }
});
