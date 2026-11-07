/**
 * ==============================================================================
 * PanitiKard V2 - Supabase Service Layer
 * ==============================================================================
 * 
 * Phase 4: Backend & Database Development (Step 3)
 * Provides a centralized, singleton Supabase client for database operations.
 * 
 * Security & Reliability:
 * - Credentials are kept strictly on the backend.
 * - Gracefully handles missing or unconfigured credentials during development
 *   without crashing the Express server.
 * - Exports both standard client (anon) and admin client (service-role) when configured.
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config/environment');

let supabaseClient = null;
let supabaseAdminClient = null;
let isConfigured = false;

// Validate configuration
const hasValidUrl = Boolean(
  config.supabase.url &&
  config.supabase.url.startsWith('https://') &&
  !config.supabase.url.includes('your-project-id')
);

const hasValidAnonKey = Boolean(
  config.supabase.anonKey &&
  !config.supabase.anonKey.includes('your_supabase_anon_public_key')
);

const hasValidServiceKey = Boolean(
  config.supabase.serviceRoleKey &&
  !config.supabase.serviceRoleKey.includes('your_supabase_service_role_secret')
);

if (hasValidUrl && (hasValidAnonKey || hasValidServiceKey)) {
  try {
    // 1. Standard Client (respects RLS, for user-context queries)
    const clientKey = hasValidAnonKey ? config.supabase.anonKey : config.supabase.serviceRoleKey;
    supabaseClient = createClient(config.supabase.url, clientKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    // 2. Admin Client (privileged, strictly backend operations)
    if (hasValidServiceKey) {
      supabaseAdminClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    }

    isConfigured = true;
    console.log('[Supabase Service]: Supabase client initialized successfully.');
  } catch (error) {
    console.warn('[Supabase Service Warning]: Failed to initialize Supabase client:', error.message);
    isConfigured = false;
  }
} else {
  console.log('[Supabase Service]: Supabase credentials not yet configured in server/.env.');
  console.log('[Supabase Service]: Express server will run in standalone development mode.');
}

/**
 * Returns the active Supabase client or null if not yet configured.
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
function getSupabase() {
  return supabaseClient;
}

/**
 * Returns the Supabase Admin client (service role) or null.
 * @returns {import('@supabase/supabase-js').SupabaseClient|null}
 */
function getSupabaseAdmin() {
  return supabaseAdminClient || supabaseClient;
}

/**
 * Returns the current configuration and readiness status.
 */
function getSupabaseStatus() {
  return {
    configured: isConfigured,
    hasUrl: hasValidUrl,
    hasAnonKey: hasValidAnonKey,
    hasServiceRoleKey: hasValidServiceKey,
    serviceRoleActive: Boolean(supabaseAdminClient),
    statusMessage: isConfigured 
      ? 'Konektado / Handa na ang Supabase Service' 
      : 'Hindi pa nakakonekta ang Supabase (Standalone Development Mode)'
  };
}

module.exports = {
  supabase: supabaseClient,
  getSupabase,
  getSupabaseAdmin,
  getSupabaseStatus,
  isConfigured
};

