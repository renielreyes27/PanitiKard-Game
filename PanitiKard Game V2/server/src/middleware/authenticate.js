const { createUserClient } = require('../services/supabase');
const { HttpError } = require('./httpError');

function createAuthenticator({ userClientFactory = createUserClient } = {}) {
  return async function authenticate(req, _res, next) {
    try {
      const header = req.get('authorization') || '';
      const match = header.match(/^Bearer\s+([^\s]+)$/i);
      if (!match) throw new HttpError(401, 'AUTH_REQUIRED', 'A valid Supabase access token is required.');

      const client = userClientFactory(match[1]);
      if (!client) throw new HttpError(503, 'AUTH_UNAVAILABLE', 'Supabase authentication is not configured.');
      const { data, error } = await client.auth.getUser(match[1]);
      if (error || !data?.user) throw new HttpError(401, 'INVALID_TOKEN', 'The access token is invalid or expired.');

      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('id, display_name, role')
        .eq('id', data.user.id)
        .maybeSingle();
      if (profileError) throw new HttpError(503, 'PROFILE_LOOKUP_FAILED', 'Unable to load the authenticated profile.');
      if (!profile) throw new HttpError(403, 'PROFILE_MISSING', 'No PanitiKard profile is linked to this account.');

      req.auth = { user: data.user, profile, client };
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireStaff(req, _res, next) {
  if (!req.auth || !['teacher', 'admin'].includes(req.auth.profile.role)) {
    return next(new HttpError(403, 'STAFF_REQUIRED', 'Teacher or administrator permission is required.'));
  }
  next();
}

function requireAdmin(req, _res, next) {
  if (!req.auth || req.auth.profile.role !== 'admin') {
    return next(new HttpError(403, 'ADMIN_REQUIRED', 'Administrator permission is required.'));
  }
  next();
}

module.exports = { createAuthenticator, requireStaff, requireAdmin };
