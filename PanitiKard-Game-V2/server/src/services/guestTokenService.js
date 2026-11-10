/**
 * ==============================================================================
 * PanitiKard V2 — Guest Student Session Token Service (Phase 5.6)
 * ==============================================================================
 *
 * Provides cryptographic HMAC-SHA256 signing and verification for guest student
 * game sessions. Enables students to play and persist results to Supabase and
 * interact with backend Gemini evaluation without requiring student accounts or passwords.
 */

const crypto = require('crypto');
const config = require('../config/environment');
const { HttpError } = require('../middleware/httpError');

const DEV_DEFAULT_SECRET = 'panitikard-guest-secret-dev-key';

function getSecret(explicitSecret) {
  if (explicitSecret) return explicitSecret;
  const isProduction = (config.nodeEnv === 'production') || (process.env.NODE_ENV === 'production');
  const secret = config.guestSessionSecret;

  if (isProduction) {
    if (!secret || secret === DEV_DEFAULT_SECRET || typeof secret !== 'string' || secret.trim().length < 16) {
      throw new HttpError(
        500,
        'CONFIGURATION_ERROR',
        'GUEST_SESSION_SECRET must be securely configured in production (minimum 16 characters, not default).'
      );
    }
    return secret;
  }

  return secret || DEV_DEFAULT_SECRET;
}

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Generates an HMAC-SHA256 signed guest session token.
 *
 * @param {object} params
 * @param {string} params.sessionId - Valid UUID of the game session
 * @param {string} params.studentName - Full name of the student
 * @param {number} [params.expiresInMs=86400000] - Expiration time in ms (default: 24h)
 * @param {string} [secret] - Optional secret override (for tests)
 * @returns {string} Signed token: `${payloadB64}.${signatureB64}`
 */
function generateGuestToken({ sessionId, studentName, expiresInMs = 24 * 60 * 60 * 1000 }, secret) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('A valid sessionId is required to generate a guest token.');
  }

  const cleanName = typeof studentName === 'string' ? studentName.trim() : '';
  const now = Date.now();
  const payload = {
    sessionId,
    studentName: cleanName,
    role: 'guest',
    iat: now,
    exp: now + expiresInMs
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getSecret(secret))
    .update(payloadB64)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a guest session token.
 *
 * @param {string} token
 * @param {string} [secret]
 * @returns {{ sessionId: string, studentName: string, role: 'guest', exp: number, iat: number }}
 * @throws {HttpError} If token is missing, malformed, forged, or expired
 */
function verifyGuestToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new HttpError(401, 'INVALID_GUEST_TOKEN', 'Malformed guest session token.');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new HttpError(401, 'INVALID_GUEST_TOKEN', 'Guest session token must contain exactly two segments.');
  }

  const [payloadB64, signatureB64] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSecret(secret))
    .update(payloadB64)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sigBuffer = Buffer.from(signatureB64, 'utf8');
  const expectedBuffer = Buffer.from(expectedSig, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new HttpError(401, 'INVALID_GUEST_TOKEN', 'Invalid guest session token signature.');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (_e) {
    throw new HttpError(401, 'INVALID_GUEST_TOKEN', 'Unable to parse guest token payload.');
  }

  if (!payload || typeof payload !== 'object' || payload.role !== 'guest' || !payload.sessionId) {
    throw new HttpError(401, 'INVALID_GUEST_TOKEN', 'Guest token payload is invalid.');
  }

  if (typeof payload.exp === 'number' && payload.exp <= Date.now()) {
    throw new HttpError(401, 'EXPIRED_GUEST_TOKEN', 'Guest session token has expired.');
  }

  return payload;
}

/**
 * Checks whether a given token appears to be a PanitiKard guest token
 * (without throwing, for middleware routing purposes).
 */
function isGuestToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    return payload && payload.role === 'guest' && Boolean(payload.sessionId);
  } catch (_e) {
    return false;
  }
}

/**
 * Generates an HMAC-SHA256 signed question timer token.
 *
 * @param {object} params
 * @param {string} params.sessionId
 * @param {string} params.questionCode
 * @param {string} [params.round='main']
 * @param {number} [params.startedAt=Date.now()]
 * @param {number} [params.timeLimitSeconds=30]
 * @param {string} [secret]
 * @returns {string}
 */
function generateTimerToken({ sessionId, questionCode, round = 'main', startedAt = Date.now(), timeLimitSeconds = 30 }, secret) {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('A valid sessionId is required to generate a timer token.');
  }
  if (!questionCode || typeof questionCode !== 'string') {
    throw new Error('A valid questionCode is required to generate a timer token.');
  }

  const payload = {
    sessionId,
    questionCode,
    round,
    startedAt: typeof startedAt === 'number' ? startedAt : Date.now(),
    timeLimitSeconds: Number(timeLimitSeconds) || 30,
    role: 'question_timer'
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getSecret(secret))
    .update(payloadB64)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a question timer token.
 *
 * @param {string} token
 * @param {string} [secret]
 * @returns {{ sessionId: string, questionCode: string, round: string, startedAt: number, timeLimitSeconds: number, role: 'question_timer' }}
 * @throws {HttpError} If token is missing, malformed, forged, or invalid
 */
function verifyTimerToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) {
    throw new HttpError(400, 'INVALID_TIMER_TOKEN', 'Malformed timer token.');
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new HttpError(400, 'INVALID_TIMER_TOKEN', 'Timer token must contain exactly two segments.');
  }

  const [payloadB64, signatureB64] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSecret(secret))
    .update(payloadB64)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sigBuffer = Buffer.from(signatureB64, 'utf8');
  const expectedBuffer = Buffer.from(expectedSig, 'utf8');

  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new HttpError(400, 'INVALID_TIMER_TOKEN', 'Invalid timer token signature.');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch (_e) {
    throw new HttpError(400, 'INVALID_TIMER_TOKEN', 'Unable to parse timer token payload.');
  }

  if (!payload || typeof payload !== 'object' || payload.role !== 'question_timer' || !payload.sessionId || !payload.questionCode) {
    throw new HttpError(400, 'INVALID_TIMER_TOKEN', 'Timer token payload is invalid.');
  }

  return payload;
}

module.exports = {
  generateGuestToken,
  verifyGuestToken,
  isGuestToken,
  generateTimerToken,
  verifyTimerToken,
  getSecret,
  DEV_DEFAULT_SECRET
};
