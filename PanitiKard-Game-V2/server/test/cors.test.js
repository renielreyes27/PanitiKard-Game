const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { createApp, isAllowedOrigin, PANITIKARD_PREVIEW_ORIGIN_REGEX } = require('../src/server');

async function withServer(app, run) {
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('CORS regex validation for PanitiKard Vercel deployment hostnames', () => {
  // 1. Production origin accepted
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://panitikard-game-server.vercel.app'),
    true,
    'Canonical production hostname must match regex'
  );

  // 2. Valid project Preview origins accepted
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://panitikard-game-server-git-master-reyes15.vercel.app'),
    true,
    'Git branch preview hostname must match regex'
  );
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://panitikard-game-server-8ha36t6cl-reyes15.vercel.app'),
    true,
    'Deployment hash preview hostname must match regex'
  );
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://panitikard-game-server-h2e66wazk-reyes15.vercel.app'),
    true,
    'Preview alias hostname must match regex'
  );

  // 3. Unrelated Vercel project origins strictly rejected
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://another-app.vercel.app'),
    false,
    'Arbitrary vercel.app origin must be rejected'
  );
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://notpanitikard-game-server.vercel.app'),
    false,
    'Prefix-spoofed hostname must be rejected'
  );
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://panitikard-game-server.malicious.vercel.app'),
    false,
    'Subdomain spoofing must be rejected'
  );
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://fake-panitikard-game-server.vercel.app'),
    false,
    'Pre-hyphen spoofed hostname must be rejected'
  );

  // 4. Unapproved external origins rejected
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://evil.com'),
    false,
    'Arbitrary external domain must be rejected'
  );
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('https://panitikard-game-server.vercel.app.evil.com'),
    false,
    'Domain suffix spoofing must be rejected'
  );
  assert.equal(
    PANITIKARD_PREVIEW_ORIGIN_REGEX.test('http://panitikard-game-server.vercel.app'),
    false,
    'Insecure HTTP must be rejected'
  );
});

test('isAllowedOrigin evaluates production, localhost, and preview correctly in production mode', () => {
  const allowed = ['https://panitikard-game-server.vercel.app', 'http://localhost:8080', 'http://127.0.0.1:8080'];

  // Same-origin / server-to-server (no origin header)
  assert.equal(isAllowedOrigin(undefined, 'production', allowed), true);
  assert.equal(isAllowedOrigin(null, 'production', allowed), true);
  assert.equal(isAllowedOrigin('', 'production', allowed), true);

  // Production origin accepted
  assert.equal(isAllowedOrigin('https://panitikard-game-server.vercel.app', 'production', allowed), true);

  // Localhost origins accepted under existing rules
  assert.equal(isAllowedOrigin('http://localhost:8080', 'production', allowed), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:8080', 'production', allowed), true);

  // Valid project Preview origin accepted
  assert.equal(isAllowedOrigin('https://panitikard-game-server-8ha36t6cl-reyes15.vercel.app', 'production', allowed), true);
  assert.equal(isAllowedOrigin('https://panitikard-game-server-git-master-reyes15.vercel.app', 'production', allowed), true);

  // Unrelated Vercel project origin rejected
  assert.equal(isAllowedOrigin('https://unrelated-project.vercel.app', 'production', allowed), false);

  // Unapproved external origin rejected
  assert.equal(isAllowedOrigin('https://attacker.example.com', 'production', allowed), false);
  assert.equal(isAllowedOrigin('https://evil.com', 'production', allowed), false);
});

test('HTTP Server CORS Enforcement: Valid Preview Origin allowed, Unapproved Origin rejected with HTTP 403', async () => {
  const config = require('../src/config/environment');
  const prevEnv = config.nodeEnv;
  config.nodeEnv = 'production';

  const app = createApp({
    connectivityCheck: async () => ({ reachable: true })
  });

  try {
    await withServer(app, async (baseUrl) => {
      // 1. Valid Preview Origin accepted
      const validPreviewRes = await fetch(`${baseUrl}/health`, {
        headers: {
          Origin: 'https://panitikard-game-server-8ha36t6cl-reyes15.vercel.app'
        }
      });
      assert.equal(validPreviewRes.status, 200, 'Valid Preview Origin must succeed with 200');
      assert.equal(
        validPreviewRes.headers.get('access-control-allow-origin'),
        'https://panitikard-game-server-8ha36t6cl-reyes15.vercel.app',
        'CORS header must echo the allowed preview origin'
      );

      // 2. Production Origin accepted
      const prodRes = await fetch(`${baseUrl}/health`, {
        headers: {
          Origin: 'https://panitikard-game-server.vercel.app'
        }
      });
      assert.equal(prodRes.status, 200, 'Production Origin must succeed with 200');

      // 3. Unrelated Vercel Project Origin rejected with HTTP 403 (NOT 500)
      const unrelatedVercelRes = await fetch(`${baseUrl}/api/v1/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://attacker-project.vercel.app'
        },
        body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Test Student' })
      });
      assert.equal(unrelatedVercelRes.status, 403, 'Unrelated Vercel project must be rejected with HTTP 403');
      const unrelatedPayload = await unrelatedVercelRes.json();
      assert.equal(unrelatedPayload.success, false);
      assert.equal(unrelatedPayload.error, 'CORS_REJECTED', 'Error code must be CORS_REJECTED, not INTERNAL_ERROR');

      // 4. Unapproved External Origin rejected with HTTP 403 (NOT 500)
      const evilRes = await fetch(`${baseUrl}/api/v1/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.com'
        },
        body: JSON.stringify({ topicCode: 'elements', mode: 'deck', studentName: 'Test Student' })
      });
      assert.equal(evilRes.status, 403, 'Evil domain must be rejected with HTTP 403');
      const evilPayload = await evilRes.json();
      assert.equal(evilPayload.success, false);
      assert.equal(evilPayload.error, 'CORS_REJECTED', 'Error code must be CORS_REJECTED, not INTERNAL_ERROR');
    });
  } finally {
    config.nodeEnv = prevEnv;
  }
});
