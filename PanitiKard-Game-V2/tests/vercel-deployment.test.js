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
  assert.equal(content.outputDirectory, "dist", "outputDirectory must be configured as dist");
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

test("Vercel: root package.json includes a valid build script and preserves the dev script", () => {
  const pkgPath = path.join(v2Root, "package.json");
  assert.ok(fs.existsSync(pkgPath), "Root package.json must exist");

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  assert.ok(pkg.scripts && typeof pkg.scripts === "object", "package.json must have scripts");
  assert.equal(
    typeof pkg.scripts.build,
    "string",
    "Root package.json must define a build script so Vercel npm run build succeeds"
  );
  assert.equal(
    pkg.scripts.build,
    "node scripts/build.js",
    "Root build script must invoke node scripts/build.js"
  );
  assert.equal(
    pkg.scripts.dev,
    'concurrently -k -n BACKEND,FRONTEND "npm --prefix server run dev" "npx http-server . -p 8080"',
    "Existing dev script must be preserved exactly"
  );
});

test("Vercel Deployment: scripts/build.js generates dist/ containing only frontend assets", () => {
  const { execSync } = require("node:child_process");
  execSync("node scripts/build.js", { cwd: v2Root, stdio: "pipe" });

  const distDir = path.join(v2Root, "dist");
  assert.ok(fs.existsSync(distDir), "dist/ directory must exist after build");

  const requiredStaticFiles = [
    "index.html",
    "dashboard.html",
    path.join("css", "style.css"),
    path.join("css", "dashboard.css"),
    path.join("js", "main.js"),
    path.join("js", "cards-data.js"),
    path.join("js", "api-client.js"),
    path.join("js", "game-api.js"),
    path.join("js", "answer-evaluator.js"),
    path.join("js", "dashboard.js"),
    path.join("js", "dashboard-api.js"),
    path.join("js", "dashboard-auth.js"),
    path.join("assets", "audio", ".gitkeep"),
    path.join("assets", "icons", ".gitkeep"),
    path.join("assets", "images", ".gitkeep")
  ];

  for (const rel of requiredStaticFiles) {
    const fullPath = path.join(distDir, rel);
    assert.ok(fs.existsSync(fullPath), `dist/ must contain ${rel}`);
  }
});

test("Vercel Deployment: dist/ strictly excludes backend code, serverless functions, tests, and env secrets", () => {
  const distDir = path.join(v2Root, "dist");
  assert.ok(fs.existsSync(distDir), "dist/ directory must exist");

  const forbiddenEntries = [
    "server",
    "api",
    "tests",
    "node_modules",
    "scripts",
    "package.json",
    "package-lock.json",
    "vercel.json",
    ".gitignore",
    ".env",
    ".env.local"
  ];

  for (const entry of forbiddenEntries) {
    const targetPath = path.join(distDir, entry);
    assert.equal(
      fs.existsSync(targetPath),
      false,
      `dist/ must NEVER contain forbidden backend or config file: ${entry}`
    );
  }

  // Recursive walk to ensure no .env, server, or test files exist anywhere inside dist/
  function scanDir(dir) {
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, file.name);
      assert.ok(!file.name.startsWith(".env"), `Forbidden env file found in dist: ${fullPath}`);
      assert.ok(file.name !== "server.js", `Forbidden server.js found in dist: ${fullPath}`);
      if (file.isDirectory()) {
        scanDir(fullPath);
      }
    }
  }
  scanDir(distDir);
});

test("Vercel Deployment: .gitignore ignores dist/ directory", () => {
  const gitignorePath = path.join(v2Root, ".gitignore");
  assert.ok(fs.existsSync(gitignorePath), ".gitignore must exist");
  const gitignore = fs.readFileSync(gitignorePath, "utf8");
  assert.match(gitignore, /^dist\/$/m, ".gitignore must ignore dist/ directory");
});

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Must find ${startMarker} in js/main.js`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Must find ${endMarker} after ${startMarker} in js/main.js`);
  return source.slice(start, end);
}

function buildMainSessionHarness() {
  const mainJs = fs.readFileSync(path.join(v2Root, "js", "main.js"), "utf8");
  const sessionFnsSrc = sliceBetween(mainJs, "function beginRemoteGameSession(", "function startRemoteTimer(");
  const submitOpenSrc = sliceBetween(mainJs, "async function submitOpenEndedAnswer(", "function unlockNextIndex(");

  const appState = {
    studentName: "Juan",
    remoteSessionId: null,
    remoteQuestionCatalog: null,
    remoteSessionPromise: null,
    remoteSessionGeneration: 0,
    remoteWriteQueue: Promise.resolve(),
    isEvaluatingAnswer: false,
    answers: {},
    incorrectQuestions: [],
    activeCardTypeIndex: 0,
    highestUnlockedIndex: 0,
    score: 0,
    isReverseRound: false,
    wrongQueue: []
  };

  let renderedOpenError = null;
  const errorBox = {
    id: "open-error-container",
    className: "",
    style: {},
    innerHTML: "",
    classList: {
      remove: () => {},
      add: () => {}
    }
  };
  const submitBtn = { disabled: false, innerHTML: "Ipasa" };
  const textarea = { disabled: false };

  const fakeDocument = {
    getElementById: (id) => {
      if (id === "btn-submit-open") return submitBtn;
      if (id === "open-answer-input") return textarea;
      if (id === "open-error-container") return errorBox;
      return null;
    },
    querySelector: (sel) => {
      if (sel === ".open-card-form") {
        return {
          querySelector: () => null,
          insertBefore: () => {},
          appendChild: () => {}
        };
      }
      return null;
    },
    createElement: () => errorBox
  };

  let activeGuestToken = null;
  const evaluateCalls = [];
  const submitAnswerCalls = [];
  const fakeWindow = {
    PANITIKARD_GAME_API: {
      enabled: true,
      hasSessionToken: () => Boolean(activeGuestToken),
      hasAccessToken: () => Boolean(activeGuestToken),
      setGuestToken: (tok) => { activeGuestToken = tok || null; },
      getGuestToken: () => activeGuestToken,
      clearGuestToken: () => { activeGuestToken = null; },
      listQuestions: async () => ({ questions: [{ code: "elem-challenge", id: "elem-challenge" }] }),
      createSession: async () => ({ id: "sess-default", sessionToken: "tok-default" }),
      submitAnswer: async (sessionId, questionCode, response, round, options) => {
        submitAnswerCalls.push({ sessionId, questionCode, response, round, options, token: activeGuestToken });
        return { isCorrect: true, pointsAwarded: 1, totalScore: 1 };
      }
    }
  };

  const fakeApiClient = {
    evaluateWrittenAnswer: async (opts) => {
      evaluateCalls.push({ ...opts, tokenAtCallTime: activeGuestToken });
      return {
        success: true,
        available: true,
        isCorrect: true,
        pointsEarned: 2,
        maxPoints: 2,
        feedback: "Mahusay!",
        evaluationMethod: "deterministic-rubric",
        criteriaEvaluation: []
      };
    }
  };

  const factory = new Function(
    "window",
    "document",
    "appState",
    "PANITIKARD_API_CLIENT",
    `
    const interactiveCard = { classList: { contains: () => false, add: () => {} } };
    function stopChallengeTimer() {}
    function hydrateDeckFromCatalog() {}
    function evaluateOpenEndedAnswer() { return { isCorrect: true }; }
    function unlockNextIndex() {}
    function renderCardByTypeIndex() {}
    ${sessionFnsSrc}
    ${submitOpenSrc}
    return { beginRemoteGameSession, persistRemoteAnswer, submitOpenEndedAnswer };
    `
  );

  const fns = factory(fakeWindow, fakeDocument, appState, fakeApiClient);
  return {
    ...fns,
    appState,
    fakeWindow,
    fakeApiClient,
    evaluateCalls,
    submitAnswerCalls,
    errorBox,
    getGuestToken: () => activeGuestToken,
    setGuestToken: (tok) => { activeGuestToken = tok; }
  };
}

test("Regression: Written-answer submission waits for pending session initialization and sends correct session ID and guest token", async () => {
  const harness = buildMainSessionHarness();

  let resolveSession;
  harness.fakeWindow.PANITIKARD_GAME_API.createSession = () =>
    new Promise((resolve) => {
      resolveSession = () => {
        harness.setGuestToken("guest-token-session-123");
        resolve({ id: "00000000-0000-4000-8000-000000000123", sessionToken: "guest-token-session-123" });
      };
    });

  // Start game session (promise remains pending)
  harness.beginRemoteGameSession("elemento-ng-tula", "cards");
  assert.equal(harness.appState.remoteSessionId, null, "remoteSessionId must still be null while session creation is in flight");
  assert.ok(harness.appState.remoteSessionPromise, "remoteSessionPromise must be set");

  // Student submits written answer before createSession finishes
  const submitPromise = harness.submitOpenEndedAnswer(
    "Ang tula ay may sukat at tugma.",
    { id: "elem-challenge", points: 2 },
    false
  );

  // Before resolving the session, evaluateWrittenAnswer must NOT have been called yet
  await new Promise((r) => setTimeout(r, 15));
  assert.equal(
    harness.evaluateCalls.length,
    0,
    "evaluateWrittenAnswer must wait for pending remoteSessionPromise before firing"
  );

  // Now resolve the pending session initialization
  resolveSession();
  await submitPromise;

  assert.equal(harness.evaluateCalls.length, 1, "evaluateWrittenAnswer must be called once session initialization resolves");
  assert.equal(
    harness.evaluateCalls[0].sessionId,
    "00000000-0000-4000-8000-000000000123",
    "evaluateWrittenAnswer must receive the resolved sessionId, not null"
  );
  assert.equal(
    harness.evaluateCalls[0].tokenAtCallTime,
    "guest-token-session-123",
    "Guest token must be established before evaluateWrittenAnswer is called"
  );
});

test("Regression: Failed session initialization does not send an evaluation request with a null session ID", async () => {
  const harness = buildMainSessionHarness();

  // Simulate previous session token to verify beginRemoteGameSession clears stale tokens
  harness.setGuestToken("stale-token-from-previous-session");

  harness.fakeWindow.PANITIKARD_GAME_API.createSession = async () => {
    throw new Error("Network failure creating session");
  };

  harness.beginRemoteGameSession("elemento-ng-tula", "cards");
  assert.equal(harness.getGuestToken(), null, "beginRemoteGameSession must clear any previous session guest token");

  await harness.submitOpenEndedAnswer(
    "Ang tula ay may sukat at tugma.",
    { id: "elem-challenge", points: 2 },
    false
  );

  assert.equal(
    harness.evaluateCalls.length,
    0,
    "evaluateWrittenAnswer must NOT be called with a null sessionId when session initialization fails"
  );
  assert.match(
    harness.errorBox.innerHTML,
    /Hindi nakakonekta sa serbisyo ang session/i,
    "Must display a clear session connection retry error message when session initialization fails"
  );
});

test("Regression: Existing multiple-choice / remote answer persistence and guest gameplay still work", async () => {
  const harness = buildMainSessionHarness();

  harness.fakeWindow.PANITIKARD_GAME_API.createSession = async () => {
    harness.setGuestToken("guest-token-mc-456");
    return { id: "00000000-0000-4000-8000-000000000456", sessionToken: "guest-token-mc-456" };
  };

  harness.beginRemoteGameSession("elemento-ng-tula", "cards");
  const result = await harness.persistRemoteAnswer("elem-challenge", "A", "main");

  assert.ok(result, "persistRemoteAnswer must resolve with the server scoring result");
  assert.equal(result.isCorrect, true);
  assert.equal(harness.submitAnswerCalls.length, 1);
  assert.equal(harness.submitAnswerCalls[0].sessionId, "00000000-0000-4000-8000-000000000456");
  assert.equal(harness.submitAnswerCalls[0].questionCode, "elem-challenge");
  assert.equal(harness.submitAnswerCalls[0].response, "A");
  assert.equal(harness.submitAnswerCalls[0].token, "guest-token-mc-456");
});
