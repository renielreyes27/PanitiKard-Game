/**
 * ==============================================================================
 * PanitiKard V2 — Teacher/Admin Login Modal UI & Integration Tests
 * ==============================================================================
 *
 * Verifies that:
 * 1. The homepage (index.html) Teacher modal contains a real Teacher/Admin login form.
 * 2. Obsolete student placeholder text and "Pumasok bilang Mag-aaral" are removed.
 * 3. Form fields (email, password), buttons ("Mag-sign in", "Bumalik"), and supporting text match specifications.
 * 4. Scripts (Supabase CDN, js/dashboard-auth.js) are loaded in index.html.
 * 5. Teacher login verifies role via backend and redirects to dashboard.
 * 6. Admin login verifies role via backend and redirects to dashboard.
 * 7. Student login attempt is strictly rejected, session revoked, and Filipino error shown.
 * 8. Invalid credentials show user-friendly error without exposing technical details.
 * 9. Student gameplay flow remains unauthenticated and fully preserved.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const v2Root = path.join(__dirname, "..");
const indexPath = path.join(v2Root, "index.html");
const mainJsPath = path.join(v2Root, "js", "main.js");
const styleCssPath = path.join(v2Root, "css", "style.css");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const mainJs = fs.readFileSync(mainJsPath, "utf8");
const styleCss = fs.readFileSync(styleCssPath, "utf8");

const dashboardAuth = require(path.join(v2Root, "js", "dashboard-auth.js"));

// -----------------------------------------------------------------------------
// 1. HTML Structure & Copy Verification
// -----------------------------------------------------------------------------
test("Teacher Login UI: modal markup has expected title, description, and supporting text", () => {
  // Title
  assert.match(
    indexHtml,
    /<h2[^>]*id=["']teacher-modal-title["'][^>]*>\s*Portal ng Guro \/ Admin\s*<\/h2>/,
    "Modal title must be 'Portal ng Guro / Admin'"
  );

  // Description
  assert.match(
    indexHtml,
    /Mag-sign in gamit ang iyong authorized account upang ma-access ang dashboard\./,
    "Modal description must instruct user to sign in with authorized account"
  );

  // Supporting text
  assert.match(
    indexHtml,
    /Para lamang sa authorized Teachers at Administrators\./,
    "Supporting text must specify 'Para lamang sa authorized Teachers at Administrators.'"
  );
});

test("Teacher Login UI: modal contains email, password, alert container, and submit button", () => {
  // Email input
  assert.match(
    indexHtml,
    /<input[^>]*type=["']email["'][^>]*id=["']teacher-login-email["'][^>]*required/i,
    "Email input #teacher-login-email must exist and be required"
  );

  // Password input
  assert.match(
    indexHtml,
    /<input[^>]*type=["']password["'][^>]*id=["']teacher-login-password["'][^>]*required/i,
    "Password input #teacher-login-password must exist and be required"
  );

  // Submit button with text "Mag-sign in"
  assert.match(
    indexHtml,
    /<button[^>]*id=["']btn-teacher-login-submit["'][^>]*>\s*<span>Mag-sign in<\/span>\s*<\/button>/,
    "Submit button #btn-teacher-login-submit must display 'Mag-sign in'"
  );

  // Alert container
  assert.match(
    indexHtml,
    /<div[^>]*id=["']teacher-modal-alert["'][^>]*role=["']alert["']/i,
    "Alert container #teacher-modal-alert must exist"
  );

  // Cancel/Back button
  assert.match(
    indexHtml,
    /<button[^>]*id=["']btn-teacher-modal-cancel["'][^>]*>\s*<span>Bumalik<\/span>\s*<\/button>/,
    "Cancel button #btn-teacher-modal-cancel must display 'Bumalik'"
  );
});

test("Teacher Login UI: obsolete student placeholder is completely removed from teacher modal", () => {
  assert.doesNotMatch(
    indexHtml,
    /btn-teacher-to-student/,
    "Obsolete button #btn-teacher-to-student must be removed"
  );
  assert.doesNotMatch(
    indexHtml,
    /Pumasok bilang Mag-aaral/,
    "Obsolete text 'Pumasok bilang Mag-aaral' must not exist in modal"
  );
  assert.doesNotMatch(
    indexHtml,
    /Sa ngayon, maaari mong subukan at laruin ang buong educational card game bilang mag-aaral/,
    "Obsolete placeholder text must not exist in modal"
  );
});

test("Teacher Login UI: index.html loads Supabase JS CDN and dashboard-auth.js", () => {
  assert.match(
    indexHtml,
    /<script\s+src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2["']><\/script>/,
    "index.html must load Supabase JS CDN"
  );
  assert.match(
    indexHtml,
    /<script\s+src=["']js\/dashboard-auth\.js["']><\/script>/,
    "index.html must load js/dashboard-auth.js"
  );
});

// -----------------------------------------------------------------------------
// 2. CSS Styling Verification
// -----------------------------------------------------------------------------
test("Teacher Login UI: css/style.css defines form group, control, and alert styles", () => {
  assert.match(styleCss, /\.modal-form-group\s*\{/, "Missing .modal-form-group styling");
  assert.match(styleCss, /\.modal-form-control\s*\{/, "Missing .modal-form-control styling");
  assert.match(styleCss, /\.modal-auth-alert\s*\{/, "Missing .modal-auth-alert styling");
  assert.match(styleCss, /\.modal-auth-alert\.error\s*\{/, "Missing .modal-auth-alert.error styling");
  assert.match(styleCss, /\.modal-auth-alert\.info\s*\{/, "Missing .modal-auth-alert.info styling");
});

// -----------------------------------------------------------------------------
// 3. JavaScript Event Handler & Authentication Flow Verification
// -----------------------------------------------------------------------------
test("Teacher Login Controller: main.js integrates teacher-login-form with dashboardAuth", () => {
  // Elements bound
  assert.match(mainJs, /document\.getElementById\(["']teacher-login-form["']\)/);
  assert.match(mainJs, /document\.getElementById\(["']teacher-login-email["']\)/);
  assert.match(mainJs, /document\.getElementById\(["']teacher-login-password["']\)/);
  assert.match(mainJs, /document\.getElementById\(["']btn-teacher-login-submit["']\)/);
  assert.match(mainJs, /document\.getElementById\(["']teacher-modal-alert["']\)/);

  // Submits via window.PANITIKARD_DASHBOARD_AUTH.signIn
  assert.match(mainJs, /auth\.signIn\(email,\s*password\)/);

  // Redirects to dashboard.html on success
  assert.match(mainJs, /window\.location\.href\s*=\s*["']dashboard\.html["']/);

  // Handles empty inputs without network call
  assert.match(mainJs, /if\s*\(!email\s*\|\|\s*!password\)\s*\{\s*showTeacherModalAlert\(/);
});

// -----------------------------------------------------------------------------
// 4. Role-Based Authentication Simulation
// -----------------------------------------------------------------------------
function makeMockSupabaseClient(loginEmail, opts = {}) {
  const isInvalid = Boolean(opts.invalidCredentials);
  return {
    auth: {
      signInWithPassword: async ({ email, password }) => {
        if (isInvalid) {
          return { data: null, error: { message: "Invalid login credentials" } };
        }
        return {
          data: {
            session: {
              access_token: `mock-token-for-${email}`,
              user: { id: "mock-user-1", email }
            }
          },
          error: null
        };
      },
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null }, error: null })
    }
  };
}

test("Teacher Login Flow: authorized teacher succeeds, verifies role, and is allowed access", async () => {
  dashboardAuth.reset();

  const mockClient = makeMockSupabaseClient("teacher@school.edu.ph");
  const mockFetch = async (url) => {
    if (url.endsWith("/auth/me")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { id: "u-1", email: "teacher@school.edu.ph", role: "teacher", displayName: "Guro Maria" }
        })
      };
    }
    return { ok: false };
  };

  dashboardAuth.configure({
    supabaseClient: mockClient,
    apiBaseUrl: "/api/v1",
    fetch: mockFetch
  });

  const profile = await dashboardAuth.signIn("teacher@school.edu.ph", "ValidPass123!");
  assert.equal(profile.role, "teacher");
  assert.equal(profile.email, "teacher@school.edu.ph");
  assert.equal(dashboardAuth.isAuthenticated(), true);
});

test("Admin Login Flow: authorized admin succeeds, verifies role, and is allowed access", async () => {
  dashboardAuth.reset();

  const mockClient = makeMockSupabaseClient("admin@school.edu.ph");
  const mockFetch = async (url) => {
    if (url.endsWith("/auth/me")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { id: "u-2", email: "admin@school.edu.ph", role: "admin", displayName: "Admin Santos" }
        })
      };
    }
    return { ok: false };
  };

  dashboardAuth.configure({
    supabaseClient: mockClient,
    apiBaseUrl: "/api/v1",
    fetch: mockFetch
  });

  const profile = await dashboardAuth.signIn("admin@school.edu.ph", "AdminPass123!");
  assert.equal(profile.role, "admin");
  assert.equal(profile.email, "admin@school.edu.ph");
  assert.equal(dashboardAuth.isAuthenticated(), true);
});

test("Student Login Rejection: student account is strictly denied access and signed out", async () => {
  dashboardAuth.reset();

  let signedOut = false;
  const mockClient = {
    auth: {
      signInWithPassword: async () => ({
        data: {
          session: {
            access_token: "student-token",
            user: { id: "student-1", email: "student@school.edu.ph" }
          }
        },
        error: null
      }),
      signOut: async () => {
        signedOut = true;
        return { error: null };
      }
    }
  };

  const mockFetch = async (url) => {
    if (url.endsWith("/auth/me")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          data: { id: "student-1", email: "student@school.edu.ph", role: "student", displayName: "Juan Mag-aaral" }
        })
      };
    }
    return { ok: false };
  };

  dashboardAuth.configure({
    supabaseClient: mockClient,
    apiBaseUrl: "/api/v1",
    fetch: mockFetch
  });

  await assert.rejects(
    () => dashboardAuth.signIn("student@school.edu.ph", "StudentPass123!"),
    (err) => {
      assert.match(
        err.message,
        /Ang dashboard ay para lamang sa guro at administrador\. Walang access ang mga mag-aaral\./
      );
      return true;
    }
  );

  // Must have immediately signed out the student session
  assert.equal(signedOut, true, "Unauthorized student must be immediately signed out");
  assert.equal(dashboardAuth.isAuthenticated(), false);
  assert.equal(dashboardAuth.getProfile(), null);
});

test("Invalid Credentials: displays user-friendly Filipino error message", async () => {
  dashboardAuth.reset();

  const mockClient = makeMockSupabaseClient("unknown@school.edu.ph", { invalidCredentials: true });

  dashboardAuth.configure({
    supabaseClient: mockClient,
    apiBaseUrl: "/api/v1"
  });

  await assert.rejects(
    () => dashboardAuth.signIn("unknown@school.edu.ph", "WrongPassword!"),
    (err) => {
      assert.match(err.message, /Maling email o password\. Pakisubukang muli\./);
      return true;
    }
  );
});

// -----------------------------------------------------------------------------
// 5. Student Guest Gameplay Flow Preserved
// -----------------------------------------------------------------------------
test("Student Flow Preserved: homepage retains unauthenticated student entry button", () => {
  assert.match(
    indexHtml,
    /<button[^>]*id=["']btn-welcome-student["'][^>]*class=["'][^"']*btn-student-login/,
    "Student entry button #btn-welcome-student must remain in index.html"
  );
  assert.match(
    mainJs,
    /btnWelcomeStudent\.addEventListener\(["']click["'],\s*\(\)\s*=>\s*\{\s*navigateToScreen\(screens\.setup\);/s,
    "Student entry button must still navigate to student setup screen"
  );
});
