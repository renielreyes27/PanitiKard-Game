/**
 * ==============================================================================
 * PanitiKard V2 — Dashboard Authentication (Phase 6.2)
 * ==============================================================================
 *
 * Manages Teacher/Admin authentication for the dashboard interface.
 *
 * Security model:
 * - Uses the Supabase JS client (anon key) for sign-in and session management
 *   only. The anon key is a public credential protected by RLS policies.
 * - Uses an isolated auth storage key ('panitikard-staff-auth-token') to ensure
 *   staff sessions never collide with student gameplay sessions.
 * - Role verification is ALWAYS performed server-side via GET /api/v1/auth/me.
 *   The frontend NEVER trusts a role it computed itself or cached locally.
 * - Students are blocked at the dashboard level and immediately signed out.
 * - The service-role key is NEVER present in this file, in dashboard.html,
 *   or in any frontend code.
 *
 * Configuration loading priority:
 * 1. Explicitly configured options via configure()
 * 2. <meta> tags in dashboard.html:
 *      <meta name="panitikard-supabase-url" content="...">
 *      <meta name="panitikard-supabase-anon-key" content="...">
 *      <meta name="panitikard-api-base-url" content="...">
 * 3. Fallback to GET /api/v1/auth/config for seamless local development
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------
  let _supabaseClient = null;
  let _session = null;         // Supabase session object (access token + refresh)
  let _profile = null;         // { id, email, role, displayName } from backend /auth/me
  let _authStateSubscription = null;
  let _fetchFn = (typeof fetch !== 'undefined') ? fetch.bind(root) : null;

  let _config = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    apiBaseUrl: ''
  };

  // ---------------------------------------------------------------------------
  // Config helpers
  // ---------------------------------------------------------------------------
  function _meta(name) {
    if (typeof document === 'undefined') return '';
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? (el.content || '').trim() : '';
  }

  function fromConfigString(val) {
    return (typeof val === 'string' && val.trim().length > 0) ? val.trim() : '';
  }

  function _resolveApiBaseUrl(rawBase, customWindow) {
    const trimmed = fromConfigString(rawBase);
    const base = trimmed || '/api/v1';

    // If already absolute (http:// or https://), return it directly
    if (/^https?:\/\//i.test(base)) {
      return base.replace(/\/+$/, '');
    }

    // Environment-aware resolution for browser environments
    const win = customWindow || (typeof window !== 'undefined' ? window : null);
    if (win && win.location) {
      const loc = win.location;
      const hostname = (loc.hostname || '').toLowerCase();
      const isLocalHost = hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.endsWith('.localhost') ||
        loc.protocol === 'file:';

      const port = loc.port ? String(loc.port) : (loc.protocol === 'https:' ? '443' : (loc.protocol === 'http:' ? '80' : ''));

      // If running on a local development static server on a port other than 3000
      // (e.g. http-server on 8080, Live Server on 5500, or file://),
      // target the local Express backend on http://localhost:3000.
      if (isLocalHost && port !== '3000') {
        const cleanPath = base.startsWith('/') ? base : `/${base}`;
        return `http://localhost:3000${cleanPath}`.replace(/\/+$/, '');
      }
    }

    return base.replace(/\/+$/, '');
  }

  function _getApiBase() {
    if (_config.apiBaseUrl) return _config.apiBaseUrl;
    const fromMeta = _meta('panitikard-api-base-url');
    const fromGlobal = root.PANITIKARD_API_BASE_URL || '';
    const raw = (fromConfigString(fromMeta) || fromConfigString(fromGlobal) || '/api/v1');
    _config.apiBaseUrl = _resolveApiBaseUrl(raw);
    return _config.apiBaseUrl;
  }

  async function _resolveSupabaseConfig() {
    let url = _config.supabaseUrl || _meta('panitikard-supabase-url') || root.PANITIKARD_SUPABASE_URL || '';
    let anonKey = _config.supabaseAnonKey || _meta('panitikard-supabase-anon-key') || root.PANITIKARD_SUPABASE_ANON_KEY || '';

    // If meta tags are not filled, query /auth/config
    if (!url || !anonKey || anonKey.includes('your_supabase_')) {
      const base = _getApiBase();
      if (base && _fetchFn) {
        try {
          const res = await _fetchFn(`${base}/auth/config`, { headers: { Accept: 'application/json' } });
          if (res.ok) {
            const body = await res.json();
            if (body?.data?.supabaseUrl && body?.data?.supabaseAnonKey) {
              url = body.data.supabaseUrl;
              anonKey = body.data.supabaseAnonKey;
            }
          }
        } catch (_err) {
          // Ignore network errors fetching config; will handle missing credentials below
        }
      }
    }

    _config.supabaseUrl = url;
    _config.supabaseAnonKey = anonKey;
    return { url, anonKey };
  }

  async function _getSupabaseClient() {
    if (_supabaseClient) return _supabaseClient;

    const { url, anonKey } = await _resolveSupabaseConfig();
    if (!url || !anonKey || anonKey.includes('your_supabase_')) {
      return null;
    }

    const factory = root.supabase;
    if (!factory || typeof factory.createClient !== 'function') {
      console.error('[DashboardAuth] Supabase JS SDK not loaded. Add the CDN script to dashboard.html.');
      return null;
    }

    _supabaseClient = factory.createClient(url, anonKey, {
      auth: {
        storageKey: 'panitikard-staff-auth-token',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });

    if (_supabaseClient?.auth?.onAuthStateChange && !_authStateSubscription) {
      const { data } = _supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED' && session) {
          _session = session;
        } else if (event === 'SIGNED_OUT') {
          _session = null;
          _profile = null;
        }
      });
      _authStateSubscription = data?.subscription || null;
    }

    return _supabaseClient;
  }

  // ---------------------------------------------------------------------------
  // Backend role verification — the ONLY source of truth for roles
  // ---------------------------------------------------------------------------
  async function _verifyRoleWithBackend(accessToken) {
    const base = _getApiBase();
    if (!base || !accessToken || !_fetchFn) return null;
    try {
      const response = await _fetchFn(`${base}/auth/me`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
      });
      if (!response.ok) return null;
      const body = await response.json();
      if (!body.success || !body.data) return null;
      return body.data; // { id, email, role, displayName }
    } catch (err) {
      console.error('[DashboardAuth] Backend role verification failed:', err.message);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Configures or overrides client dependencies (useful for testing or runtime bootstrap).
   */
  function configure(options = {}) {
    if (options.supabaseUrl !== undefined) _config.supabaseUrl = options.supabaseUrl;
    if (options.supabaseAnonKey !== undefined) _config.supabaseAnonKey = options.supabaseAnonKey;
    if (options.apiBaseUrl !== undefined) _config.apiBaseUrl = _resolveApiBaseUrl(options.apiBaseUrl);
    if (options.supabaseClient !== undefined) _supabaseClient = options.supabaseClient;
    if (options.fetch !== undefined) _fetchFn = options.fetch;
  }

  /**
   * Resets internal auth state (for tests and clean resets).
   */
  function reset() {
    _supabaseClient = null;
    _session = null;
    _profile = null;
    _authStateSubscription = null;
    _fetchFn = (typeof fetch !== 'undefined') ? fetch.bind(root) : null;
    _config = { supabaseUrl: '', supabaseAnonKey: '', apiBaseUrl: '' };
  }

  /**
   * Initializes the auth module. Call once on dashboard page load.
   * Checks for an existing Supabase session, verifies the role with the backend,
   * and returns the verified profile or null.
   *
   * @returns {Promise<{id: string, email: string|null, role: string, displayName: string|null}|null>}
   */
  async function init() {
    const client = await _getSupabaseClient();
    if (!client) {
      _session = null;
      _profile = null;
      return null;
    }

    const { data, error } = await client.auth.getSession();
    const session = data?.session;
    if (error || !session) {
      _session = null;
      _profile = null;
      return null;
    }

    _session = session;
    _profile = await _verifyRoleWithBackend(session.access_token);

    // Reject sessions whose backend-verified role is not teacher or admin
    if (!_profile || !['teacher', 'admin'].includes(_profile.role)) {
      await _signOut(/* silent */ true);
      return null;
    }

    return _profile;
  }

  /**
   * Signs in a user with email and password.
   * After Supabase sign-in succeeds, the role is verified server-side.
   * If the account does not have teacher or admin role, the session is
   * immediately revoked and an error is thrown.
   *
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{id: string, email: string|null, role: string, displayName: string|null}>}
   * @throws {Error} with a user-facing message on any failure
   */
  async function signIn(email, password) {
    const cleanEmail = (email || '').trim();
    const cleanPassword = (password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      throw new Error('Pakilagay ang email at password.');
    }

    const client = await _getSupabaseClient();
    if (!client) {
      throw new Error('Hindi pa nakakonekta ang authentication. Pakisubukang i-reload ang pahina o suriin ang server configuration.');
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword
    });

    if (error) {
      if (error.message && /invalid login credentials/i.test(error.message)) {
        throw new Error('Maling email o password. Pakisubukang muli.');
      }
      if (error.message && /email not confirmed/i.test(error.message)) {
        throw new Error('Hindi pa nakumpirma ang email address. Pakitingnan ang iyong inbox.');
      }
      throw new Error(error.message || 'Hindi makapag-sign in. Pakisubukang muli.');
    }

    if (!data?.session) {
      throw new Error('Hindi natanggap ang authentication session. Pakisubukang muli.');
    }

    _session = data.session;

    // Authoritative server-side role verification
    const profile = await _verifyRoleWithBackend(data.session.access_token);

    if (!profile) {
      await _signOut(true);
      throw new Error('Hindi ma-verify ang iyong account sa server. Pakisubukang muli.');
    }

    if (!['teacher', 'admin'].includes(profile.role)) {
      // Immediate fail-closed rejection for students or unrecognized roles
      await _signOut(true);
      throw new Error('Ang dashboard ay para lamang sa guro at administrador. Walang access ang mga mag-aaral.');
    }

    _profile = profile;
    return _profile;
  }

  /**
   * Signs out the current user and clears local state.
   * @param {boolean} [silent=false] - If true, suppresses console messages.
   */
  async function signOut(silent = false) {
    return _signOut(silent);
  }

  async function _signOut(silent = false) {
    _profile = null;
    _session = null;
    const client = await _getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (err) {
        if (!silent) console.warn('[DashboardAuth] Sign-out notice:', err.message);
      }
    }
  }

  /**
   * Returns the currently verified profile, or null if not authenticated.
   * In-memory read without network overhead.
   * @returns {{id: string, email: string|null, role: string, displayName: string|null}|null}
   */
  function getProfile() {
    return _profile;
  }

  /**
   * Returns true if a verified staff session is active.
   * @returns {boolean}
   */
  function isAuthenticated() {
    return Boolean(_profile && ['teacher', 'admin'].includes(_profile.role));
  }

  /**
   * Returns the current Supabase access token for use in backend API requests,
   * or null if no session exists.
   * @returns {string|null}
   */
  function getAccessToken() {
    return _session ? _session.access_token : null;
  }

  /**
   * Convenience method: makes an authenticated request to the backend API.
   * Uses the current session's access token automatically.
   *
   * @param {string} path - Relative to the configured API base (e.g. '/admin/topics')
   * @param {RequestInit} [options={}]
   * @returns {Promise<any>} Parsed `data` field from the API response
   * @throws {Error} on network errors or non-OK responses
   */
  async function apiRequest(path, options = {}) {
    const base = _getApiBase();
    if (!base) throw new Error('API base URL not configured.');
    const token = getAccessToken();
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined && typeof options.body !== 'string') {
      options = { ...options, body: JSON.stringify(options.body) };
      headers['Content-Type'] = 'application/json';
    }
    const response = await _fetchFn(`${base}${path}`, { ...options, headers });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || `API request failed (${response.status}).`);
    }
    return payload?.data ?? null;
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------
  const dashboardAuth = {
    init,
    signIn,
    signOut,
    getProfile,
    isAuthenticated,
    getAccessToken,
    apiRequest,
    configure,
    reset,
    resolveApiBaseUrl: _resolveApiBaseUrl
  };

  root.PANITIKARD_DASHBOARD_AUTH = dashboardAuth;
  if (typeof module !== 'undefined' && module.exports) module.exports = dashboardAuth;
})(typeof window !== 'undefined' ? window : globalThis);
