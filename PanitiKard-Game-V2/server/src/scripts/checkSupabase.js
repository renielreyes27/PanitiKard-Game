const { getSupabaseStatus, checkSupabaseConnectivity } = require('../services/supabase');

(async () => {
  const configStatus = getSupabaseStatus();
  const connection = await checkSupabaseConnectivity();
  console.log(JSON.stringify({ configuration: configStatus, connection }, null, 2));
  if (!connection.reachable) process.exitCode = 1;
})().catch(error => {
  console.error('Supabase read-only connectivity check failed:', error.message);
  process.exitCode = 1;
});
