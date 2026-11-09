/**
 * PanitiKard V2 — Phase 6.4 Topic Management Interface Tests
 *
 * Tests for:
 *   - js/dashboard-api.js topic CRUD methods (create, update, publish, unpublish, archive)
 *   - js/dashboard.js topic filtering, search query handling, and formatting
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const dashboardAuth = require('../js/dashboard-auth');
const dashboardApi = require('../js/dashboard-api');
const dashboard = require('../js/dashboard');

const SAMPLE_TOPICS = [
  {
    id: 't-1',
    code: 'elemento-kwento',
    title: 'Mga Elemento ng Maikling Kwento',
    description: 'Tauhan, tagpuan, banghay, at tema.',
    competency: 'Nasusuri ang mga elemento ng maikling kwento.',
    status: 'published',
    archived_at: null,
    updated_at: '2026-06-01T10:00:00Z'
  },
  {
    id: 't-2',
    code: 'matalinhagang-pahayag',
    title: 'Matalinhagang Pahayag at Tayutay',
    description: 'Pagtutulad, pagwawangis, atbp.',
    competency: 'Natutukoy ang mga uri ng tayutay.',
    status: 'draft',
    archived_at: null,
    updated_at: '2026-07-15T14:30:00Z'
  },
  {
    id: 't-3',
    code: 'lumang-aralin',
    title: 'Lumang Aralin sa Balagtasan',
    description: 'Naka-archive nang paksa.',
    competency: 'Kasaysayan ng Balagtasan.',
    status: 'archived',
    archived_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z'
  }
];

test('dashboardApi: createTopic() sends POST /admin/topics with body', async () => {
  let capturedPath = null;
  let capturedOptions = null;

  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path, options) => {
    capturedPath = path;
    capturedOptions = options;
    return { id: 'new-id', ...options.body, status: 'draft' };
  };

  try {
    const created = await dashboardApi.createTopic({
      code: 'epiko-maragtas',
      title: 'Epiko ng Maragtas',
      competency: 'Pagsusuri ng epiko.',
      description: 'Maikling deskripsyon.'
    });

    assert.equal(capturedPath, '/admin/topics');
    assert.equal(capturedOptions.method, 'POST');
    assert.equal(capturedOptions.body.code, 'epiko-maragtas');
    assert.equal(created.code, 'epiko-maragtas');
    assert.equal(created.status, 'draft');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: updateTopic() sends PATCH /admin/topics/:code with body', async () => {
  let capturedPath = null;
  let capturedOptions = null;

  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (path, options) => {
    capturedPath = path;
    capturedOptions = options;
    return { code: 'elemento-kwento', ...options.body };
  };

  try {
    const updated = await dashboardApi.updateTopic('elemento-kwento', {
      title: 'Bagong Pamagat ng Elemento',
      competency: 'Binagong kasanayan.'
    });

    assert.equal(capturedPath, '/admin/topics/elemento-kwento');
    assert.equal(capturedOptions.method, 'PATCH');
    assert.equal(capturedOptions.body.title, 'Bagong Pamagat ng Elemento');
    assert.equal(updated.title, 'Bagong Pamagat ng Elemento');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: publishTopic() sends status published', async () => {
  let capturedOptions = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (_path, options) => {
    capturedOptions = options;
    return { code: 'matalinhagang-pahayag', status: 'published' };
  };

  try {
    const result = await dashboardApi.publishTopic('matalinhagang-pahayag');
    assert.equal(capturedOptions.body.status, 'published');
    assert.equal(result.status, 'published');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: unpublishTopic() sends status draft', async () => {
  let capturedOptions = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (_path, options) => {
    capturedOptions = options;
    return { code: 'elemento-kwento', status: 'draft' };
  };

  try {
    const result = await dashboardApi.unpublishTopic('elemento-kwento');
    assert.equal(capturedOptions.body.status, 'draft');
    assert.equal(result.status, 'draft');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboardApi: archiveTopic() sends status archived', async () => {
  let capturedOptions = null;
  const originalApiRequest = dashboardAuth.apiRequest;
  dashboardAuth.apiRequest = async (_path, options) => {
    capturedOptions = options;
    return { code: 'lumang-aralin', status: 'archived' };
  };

  try {
    const result = await dashboardApi.archiveTopic('lumang-aralin');
    assert.equal(capturedOptions.body.status, 'archived');
    assert.equal(result.status, 'archived');
  } finally {
    dashboardAuth.apiRequest = originalApiRequest;
  }
});

test('dashboard.filterTopics: filters correctly by status', () => {
  // All
  const all = dashboard.filterTopics(SAMPLE_TOPICS, 'all', '');
  assert.equal(all.length, 3);

  // Published only
  const published = dashboard.filterTopics(SAMPLE_TOPICS, 'published', '');
  assert.equal(published.length, 1);
  assert.equal(published[0].code, 'elemento-kwento');

  // Draft only
  const draft = dashboard.filterTopics(SAMPLE_TOPICS, 'draft', '');
  assert.equal(draft.length, 1);
  assert.equal(draft[0].code, 'matalinhagang-pahayag');

  // Archived only
  const archived = dashboard.filterTopics(SAMPLE_TOPICS, 'archived', '');
  assert.equal(archived.length, 1);
  assert.equal(archived[0].code, 'lumang-aralin');
});

test('dashboard.filterTopics: searches across title, code, and competency', () => {
  // Match title
  const byTitle = dashboard.filterTopics(SAMPLE_TOPICS, 'all', 'tayutay');
  assert.equal(byTitle.length, 1);
  assert.equal(byTitle[0].code, 'matalinhagang-pahayag');

  // Match code
  const byCode = dashboard.filterTopics(SAMPLE_TOPICS, 'all', 'kwento');
  assert.equal(byCode.length, 1);
  assert.equal(byCode[0].code, 'elemento-kwento');

  // Match competency
  const byComp = dashboard.filterTopics(SAMPLE_TOPICS, 'all', 'balagtasan');
  assert.equal(byComp.length, 1);
  assert.equal(byComp[0].code, 'lumang-aralin');

  // Non-matching query
  const nonMatch = dashboard.filterTopics(SAMPLE_TOPICS, 'all', 'xyz-random-123');
  assert.equal(nonMatch.length, 0);
});

test('dashboard.formatDate: formats safely and handles invalid inputs', () => {
  assert.equal(dashboard.formatDate(null), '--');
  assert.equal(dashboard.formatDate(''), '--');
  assert.equal(dashboard.formatDate(undefined), '--');

  const valid = dashboard.formatDate('2026-06-01T10:00:00Z');
  assert.ok(valid.includes('2026'));
});
