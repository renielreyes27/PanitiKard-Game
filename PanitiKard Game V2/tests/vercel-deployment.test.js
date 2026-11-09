/**
 * ==============================================================================
 * PanitiKard V2 — Vercel Deployment & Serverless Integration Tests
 * ==============================================================================
 *
 * Verifies that:
 * 1. Root vercel.json is valid and contains correct routing/rewrite rules.
 * 2. Root serverless entry point (api/index.js) and server/api/index.js correctly
 *    export the Express backend application.
 * 3. Frontend configuration in index.html and dashboard.html points to /api/v1.
 * 4. Critical static assets remain available in the repository root.
 * 5. Serverless entry point responds to HTTP requests (/health, /api/v1/topics, etc.).
 * 6. Standalone vs. backend-connected mode boundary is preserved.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const v2Root = path.join(__dirname, "..");

test("Vercel: vercel.json exists and is valid JSON with required rewrites", () => {
  const vercelJsonPath = path.join(v2Root, "vercel.json");
  assert.ok(fs.existsSync(vercelJsonPath), "vercel.json must exist in V2 root");

  const content = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
  assert.equal(typeof content, "object");
  assert.equal(content.cleanUrls, true, "cleanUrls must be enabled");
  assert.equal(content.installCommand, "npm --prefix server install", "installCommand must target server package");

  assert.ok(Array.isArray(content.rewrites), "rewrites must be an array");

  // Verify route rewrites
  const rewriteSources = content.rewrites.map(r => r.source);
  assert.ok(rewriteSources.includes("/api/v1/:path*"), "Must rewrite /api/v1/:path* to serverless API");
  assert.ok(rewriteSources.includes("/api/v1"), "Must rewrite /api/v1 to serverless API");
  assert.ok(rewriteSources.includes("/health"), "Must rewrite /health to serverless API");
  assert.ok(rewriteSources.includes("/dashboard"), "Must rewrite /dashboard to /dashboard.html");
  assert.ok(rewriteSources.includes("/teacher"), "Must rewrite /teacher to /dashboard.html");
  assert.ok(rewriteSources.includes("/admin"), "Must rewrite /admin to /dashboard.html");
});

test("Vercel: api/index.js exists and exports the Express app", () => {
  const rootEntryPath = path.join(v2Root, "api", "index.js");
  assert.ok(fs.existsSync(rootEntryPath), "api/index.js must exist");

  const app = require(rootEntryPath);
  assert.equal(typeof app, "function", "api/index.js must export an Express application (function)");
  assert.equal(typeof app.listen, "function", "Exported app must have listen method");
  assert.equal(typeof app.use, "function", "Exported app must have use method");
});

test("Vercel: server/api/index.js exists and exports the Express app", () => {
  const serverEntryPath = path.join(v2Root, "server", "api", "index.js");
  assert.ok(fs.existsSync(serverEntryPath), "server/api/index.js must exist");

  const app = require(serverEntryPath);
  assert.equal(typeof app, "function", "server/api/index.js must export an Express application");
  assert.equal(typeof app.listen, "function");
});

test("Vercel: index.html configures panitikard-api-base-url as /api/v1", () => {
  const indexPath = path.join(v2Root, "index.html");
  const html = fs.readFileSync(indexPath, "utf8");

  assert.match(
    html,
    /<meta\s+name=["']panitikard-api-base-url["']\s+content=["']\/api\/v1["']\s*\/?>/i,
    "index.html must set panitikard-api-base-url to /api/v1"
  );
});

test("Vercel: dashboard.html configures panitikard-api-base-url as /api/v1", () => {
  const dashboardPath = path.join(v2Root, "dashboard.html");
  const html = fs.readFileSync(dashboardPath, "utf8");

  assert.match(
    html,
    /<meta\s+name=["']panitikard-api-base-url["']\s+content=["']\/api\/v1["']\s*\/?>/i,
    "dashboard.html must set panitikard-api-base-url to /api/v1"
  );
});

test("Vercel: all static frontend files exist at expected relative paths", () => {
  const staticFiles = [
    "index.html",
    "dashboard.html",
    "css/style.css",
    "css/dashboard.css",
    "js/main.js",
    "js/game-api.js",
    "js/api-client.js",
    "js/cards-data.js",
    "js/answer-evaluator.js",
    "js/dashboard.js",
    "js/dashboard-api.js",
    "js/dashboard-auth.js"
  ];

  for (const rel of staticFiles) {
    const fullPath = path.join(v2Root, rel);
    assert.ok(fs.existsSync(fullPath), `Static file ${rel} must exist in V2 root`);
  }
});

test("Vercel: serverless entry point responds to HTTP requests (/health, /api/v1/auth/config, /api/v1/topics)", async () => {
  const app = require(path.join(v2Root, "api", "index.js"));
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    // 1. Test /health
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.success, true);
    assert.equal(healthData.status, "healthy");

    // 2. Test /api/v1/auth/config
    const configRes = await fetch(`http://127.0.0.1:${port}/api/v1/auth/config`);
    assert.equal(configRes.status, 200);
    const configData = await configRes.json();
    assert.equal(configData.success, true);
    assert.ok("supabaseUrl" in configData.data);
    assert.ok("supabaseAnonKey" in configData.data);

    // 3. Test /api/v1/topics
    const topicsRes = await fetch(`http://127.0.0.1:${port}/api/v1/topics`);
    assert.equal(topicsRes.status, 200);
    const topicsData = await topicsRes.json();
    assert.equal(topicsData.success, true);
    assert.ok(Array.isArray(topicsData.data));

    // 4. Test /teacher and /admin routes
    const teacherRes = await fetch(`http://127.0.0.1:${port}/teacher`);
    assert.equal(teacherRes.status, 200);
    const teacherHtml = await teacherRes.text();
    assert.ok(teacherHtml.includes("Dashboard ng Guro at Admin"));

    const adminRes = await fetch(`http://127.0.0.1:${port}/admin`);
    assert.equal(adminRes.status, 200);
    const adminHtml = await adminRes.text();
    assert.ok(adminHtml.includes("Dashboard ng Guro at Admin"));

    // 5. Test 404 route handling
    const notFoundRes = await fetch(`http://127.0.0.1:${port}/api/v1/nonexistent-endpoint`);
    assert.equal(notFoundRes.status, 404);
    const notFoundData = await notFoundRes.json();
    assert.equal(notFoundData.success, false);
    assert.equal(notFoundData.error, "NOT_FOUND");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Vercel: main.js backendConfigured logic cleanly isolates unauthenticated vs authenticated states", () => {
  const mainJsPath = path.join(v2Root, "js", "main.js");
  assert.ok(fs.existsSync(mainJsPath), "js/main.js must exist");
  const mainJs = fs.readFileSync(mainJsPath, "utf8");

  // 1. Verify that main.js defines backendConfigured strictly by checking API enablement
  assert.match(
    mainJs,
    /const\s+backendConfigured\s*=\s*Boolean\(\s*window\.PANITIKARD_GAME_API\s*&&\s*window\.PANITIKARD_GAME_API\.enabled\s*\);/,
    "main.js must define backendConfigured solely from PANITIKARD_GAME_API.enabled"
  );

  // 2. Verify that main.js does NOT tie backendConfigured to remoteSessionId or hasAccessToken
  assert.doesNotMatch(
    mainJs,
    /const\s+backendConfigured\s*=[^;]*remoteSessionId/s,
    "backendConfigured in main.js must not depend on remoteSessionId"
  );
  assert.doesNotMatch(
    mainJs,
    /const\s+backendConfigured\s*=[^;]*hasAccessToken/s,
    "backendConfigured in main.js must not depend on hasAccessToken"
  );

  // 3. Verify fail-closed behavior in main.js:
  // a) allowOfflineDevFallback is only true when NO backend is configured (!backendConfigured)
  assert.match(
    mainJs,
    /allowOfflineDevFallback:\s*!backendConfigured/,
    "main.js must pass allowOfflineDevFallback: !backendConfigured to prevent offline fallback when backend is configured"
  );

  // b) When backend is configured and Gemini evaluation fails, it fails closed (renders error and returns)
  assert.match(
    mainJs,
    /if\s*\(!isTimeout[\s\S]*?if\s*\(backendConfigured\)[\s\S]*?renderOpenCardError\(/,
    "main.js must fail closed when backendConfigured is true and evaluation fails"
  );

  // c) When backend is configured and official RPC answer submission fails / is invalid, it fails closed
  assert.match(
    mainJs,
    /if\s*\(!isOfficialValid\s*&&\s*backendConfigured\)[\s\S]*?renderOpenCardError\(/,
    "main.js must fail closed when backend is configured but official RPC response is missing or invalid"
  );

  // 4. Extract and dynamically evaluate the exact expression from main.js
  const match = mainJs.match(/const\s+backendConfigured\s*=\s*(Boolean\([^;]+\));/);
  assert.ok(match, "Must find backendConfigured assignment in js/main.js");
  const computeBackendConfigured = new Function("window", `return ${match[1]};`);

  // Case 1: Backend URL configured for a guest student (enabled: true, no auth token)
  assert.equal(
    computeBackendConfigured({ PANITIKARD_GAME_API: { enabled: true, hasAccessToken: () => false } }),
    true,
    "Enabled backend must be considered configured for guest students (fail-closed: no local scoring fallback)"
  );

  // Case 2: Backend URL configured AND student has auth token
  assert.equal(
    computeBackendConfigured({ PANITIKARD_GAME_API: { enabled: true, hasAccessToken: () => true } }),
    true,
    "Enabled backend with auth token must be considered configured"
  );

  // Case 3: Backend configured but remote session creation FAILED (remoteSessionId is null, API still enabled)
  assert.equal(
    computeBackendConfigured({ PANITIKARD_GAME_API: { enabled: true, hasAccessToken: () => false } }),
    true,
    "Backend configured but session creation failed: backendConfigured must remain true (fail-closed)"
  );

  // Case 4: API disabled (empty base URL in standalone classroom mode)
  assert.equal(
    computeBackendConfigured({ PANITIKARD_GAME_API: { enabled: false, hasAccessToken: () => true } }),
    false,
    "Disabled API must always evaluate to false"
  );
  assert.equal(
    computeBackendConfigured({}),
    false,
    "Missing API object must always evaluate to false"
  );
});
