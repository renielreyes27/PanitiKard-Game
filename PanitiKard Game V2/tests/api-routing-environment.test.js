/**
 * ==============================================================================
 * PanitiKard V2 — Environment-Aware API Routing & URL Resolution Tests
 * ==============================================================================
 *
 * Verifies that:
 * 1. Local development frontend (e.g. http://127.0.0.1:8080 via http-server,
 *    http://localhost:8080, http://localhost:5500 via Live Server, or file://)
 *    routes relative API requests to http://localhost:3000/api/v1 instead of 8080.
 * 2. Production Vercel deployment (panitikard.vercel.app or custom domain) preserves
 *    the relative base URL /api/v1 for serverless routing rewrites.
 * 3. Express fullstack local serving on port 3000 preserves /api/v1 as relative.
 * 4. Absolute URLs (http:// or https://) are preserved unchanged across all environments.
 * 5. Both dashboard-auth.js and game-api.js resolve consistently.
 * 6. Backend CORS configuration allows frontend origins running on port 8080.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const v2Root = path.join(__dirname, "..");
const dashboardAuth = require(path.join(v2Root, "js", "dashboard-auth.js"));
const gameApi = require(path.join(v2Root, "js", "game-api.js"));
const serverConfig = require(path.join(v2Root, "server", "src", "config", "environment.js"));

// -----------------------------------------------------------------------------
// 1. Local Development URL Resolution (Port 8080, 5500, file://)
// -----------------------------------------------------------------------------
test("API Routing: dashboardAuth resolves relative /api/v1 to http://localhost:3000/api/v1 on 127.0.0.1:8080", () => {
  const mockWindow = {
    location: {
      hostname: "127.0.0.1",
      port: "8080",
      protocol: "http:"
    }
  };

  const resolved = dashboardAuth.resolveApiBaseUrl("/api/v1", mockWindow);
  assert.equal(resolved, "http://localhost:3000/api/v1", "Must target backend on port 3000 when frontend runs on 8080");
});

test("API Routing: dashboardAuth resolves relative /api/v1 to http://localhost:3000/api/v1 on localhost:8080", () => {
  const mockWindow = {
    location: {
      hostname: "localhost",
      port: "8080",
      protocol: "http:"
    }
  };

  const resolved = dashboardAuth.resolveApiBaseUrl("/api/v1", mockWindow);
  assert.equal(resolved, "http://localhost:3000/api/v1");
});

test("API Routing: dashboardAuth resolves relative /api/v1 to http://localhost:3000/api/v1 on Live Server (localhost:5500)", () => {
  const mockWindow = {
    location: {
      hostname: "localhost",
      port: "5500",
      protocol: "http:"
    }
  };

  const resolved = dashboardAuth.resolveApiBaseUrl("/api/v1", mockWindow);
  assert.equal(resolved, "http://localhost:3000/api/v1");
});

test("API Routing: dashboardAuth resolves file:// protocol to http://localhost:3000/api/v1", () => {
  const mockWindow = {
    location: {
      hostname: "",
      port: "",
      protocol: "file:"
    }
  };

  const resolved = dashboardAuth.resolveApiBaseUrl("/api/v1", mockWindow);
  assert.equal(resolved, "http://localhost:3000/api/v1");
});

test("API Routing: gameApi resolves relative /api/v1 to http://localhost:3000/api/v1 on 127.0.0.1:8080", () => {
  const mockWindow = {
    location: {
      hostname: "127.0.0.1",
      port: "8080",
      protocol: "http:"
    }
  };

  const resolved = gameApi.resolveApiBaseUrl("/api/v1", mockWindow);
  assert.equal(resolved, "http://localhost:3000/api/v1", "gameApi must target port 3000 when frontend runs on 8080");
});

// -----------------------------------------------------------------------------
// 2. Production Vercel & Express Serving URL Preservation
// -----------------------------------------------------------------------------
test("API Routing: dashboardAuth preserves relative /api/v1 on Vercel production domain", () => {
  const mockWindow = {
    location: {
      hostname: "panitikard.vercel.app",
      port: "",
      protocol: "https:"
    }
  };

  const resolved = dashboardAuth.resolveApiBaseUrl("/api/v1", mockWindow);
  assert.equal(resolved, "/api/v1", "Production domain must preserve relative /api/v1 for Vercel rewrites");
});

test("API Routing: dashboardAuth preserves relative /api/v1 on custom production domain", () => {
  const mockWindow = {
    location: {
      hostname: "panitikard.edu.ph",
      port: "",
      protocol: "https:"
    }
  };

  const resolved = dashboardAuth.resolveApiBaseUrl("/api/v1", mockWindow);
  assert.equal(resolved, "/api/v1");
});

test("API Routing: gameApi preserves relative /api/v1 on Vercel production domain", () => {
  const mockWindow = {
    location: {
      hostname: "panitikard.vercel.app",
      port: "",
      protocol: "https:"
    }
  };

  const resolved = gameApi.resolveApiBaseUrl("/api/v1", mockWindow);
  assert.equal(resolved, "/api/v1");
});

test("API Routing: preserves relative /api/v1 when frontend is served directly on Express port 3000", () => {
  const mockWindow = {
    location: {
      hostname: "localhost",
      port: "3000",
      protocol: "http:"
    }
  };

  assert.equal(dashboardAuth.resolveApiBaseUrl("/api/v1", mockWindow), "/api/v1");
  assert.equal(gameApi.resolveApiBaseUrl("/api/v1", mockWindow), "/api/v1");
});

// -----------------------------------------------------------------------------
// 3. Absolute URL Preservation
// -----------------------------------------------------------------------------
test("API Routing: absolute http:// and https:// URLs are preserved as-is", () => {
  const mockWindow = {
    location: {
      hostname: "127.0.0.1",
      port: "8080",
      protocol: "http:"
    }
  };

  assert.equal(
    dashboardAuth.resolveApiBaseUrl("http://api.myschool.edu/api/v1", mockWindow),
    "http://api.myschool.edu/api/v1"
  );
  assert.equal(
    dashboardAuth.resolveApiBaseUrl("https://production-backend.com/api/v1", mockWindow),
    "https://production-backend.com/api/v1"
  );
  assert.equal(
    gameApi.resolveApiBaseUrl("https://production-backend.com/api/v1", mockWindow),
    "https://production-backend.com/api/v1"
  );
});

// -----------------------------------------------------------------------------
// 4. Integration: Auth Config and API Request Targeting in Local Dev
// -----------------------------------------------------------------------------
test("API Routing Integration: dashboardAuth queries http://localhost:3000/api/v1/auth/config when on port 8080", async () => {
  dashboardAuth.reset();

  let fetchedUrl = null;
  const mockFetch = async (url) => {
    fetchedUrl = url;
    if (url === "http://localhost:3000/api/v1/auth/config") {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: {
            supabaseUrl: "https://test.supabase.co",
            supabaseAnonKey: "anon-test-key-12345"
          }
        })
      };
    }
    return { ok: false };
  };

  // Configure with explicit port 8080 environment base
  const mockWindow = {
    location: {
      hostname: "127.0.0.1",
      port: "8080",
      protocol: "http:"
    }
  };

  const localDevBase = dashboardAuth.resolveApiBaseUrl("/api/v1", mockWindow);
  dashboardAuth.configure({
    apiBaseUrl: localDevBase,
    fetch: mockFetch
  });

  await dashboardAuth.init();
  assert.equal(
    fetchedUrl,
    "http://localhost:3000/api/v1/auth/config",
    "Must fetch /auth/config from backend on port 3000, not port 8080"
  );
});

test("API Routing Integration: dashboardAuth apiRequest targets http://localhost:3000/api/v1/admin/topics on port 8080", async () => {
  dashboardAuth.reset();

  let requestedUrl = null;
  const mockFetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({
        success: true,
        data: [{ id: "t-1", code: "elements", title: "Mga Elemento ng Tula" }]
      })
    };
  };

  const mockWindow = {
    location: {
      hostname: "127.0.0.1",
      port: "8080",
      protocol: "http:"
    }
  };

  const localDevBase = dashboardAuth.resolveApiBaseUrl("/api/v1", mockWindow);
  dashboardAuth.configure({
    apiBaseUrl: localDevBase,
    fetch: mockFetch
  });

  const topics = await dashboardAuth.apiRequest("/admin/topics");
  assert.equal(
    requestedUrl,
    "http://localhost:3000/api/v1/admin/topics",
    "apiRequest must target backend on port 3000"
  );
  assert.equal(topics.length, 1);
});

// -----------------------------------------------------------------------------
// 5. Backend CORS Origin Support
// -----------------------------------------------------------------------------
test("Backend Config: frontendOrigin includes http://localhost:8080 and http://127.0.0.1:8080", () => {
  assert.ok(
    serverConfig.frontendOrigin.includes("http://localhost:8080"),
    "serverConfig.frontendOrigin must include http://localhost:8080"
  );
  assert.ok(
    serverConfig.frontendOrigin.includes("http://127.0.0.1:8080"),
    "serverConfig.frontendOrigin must include http://127.0.0.1:8080"
  );
});
