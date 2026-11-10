/** Server-only Supabase client factory. Privileged credentials stay backend-side. */
const { createClient } = require('@supabase/supabase-js');
const config = require('../config/environment');

const validUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabase.url || '');
const hasAnonKey = Boolean(config.supabase.anonKey && !config.supabase.anonKey.includes('your_supabase_'));
const hasServiceRoleKey = Boolean(config.supabase.serviceRoleKey && !config.supabase.serviceRoleKey.includes('your_supabase_'));
const isConfigured = validUrl && hasAnonKey;

function clientOptions(accessToken) {
  return {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {})
  };
}

function createUserClient(accessToken) {
  if (!isConfigured) return null;
  return createClient(config.supabase.url, config.supabase.anonKey, clientOptions(accessToken));
}

function getSupabase() {
  return createUserClient();
}

// Never silently substitute the anon client for an admin client.
function getSupabaseAdmin() {
  if (!validUrl || !hasServiceRoleKey) return null;
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, clientOptions());
}

function getSupabaseStatus() {
  return {
    configured: isConfigured,
    hasUrl: validUrl,
    hasAnonKey,
    hasServiceRoleKey,
    serviceRoleActive: validUrl && hasServiceRoleKey,
    statusMessage: isConfigured
      ? 'Configuration present; database connectivity has not been checked.'
      : 'Supabase is not configured; API uses local/fallback behavior.'
  };
}

async function checkSupabaseConnectivity(client = getSupabase()) {
  if (!client) return { reachable: false, reason: 'not_configured' };
  const { error } = await client.from('topics').select('id').limit(1);
  if (error) return { reachable: false, reason: 'query_failed', code: error.code || null };
  return { reachable: true };
}

module.exports = {
  createUserClient,
  getSupabase,
  getSupabaseAdmin,
  getSupabaseStatus,
  checkSupabaseConnectivity,
  isConfigured,
  hasServiceRoleKey
};

