/**
 * ==============================================================================
 * PanitiKard V2 - Server Environment Configuration
 * ==============================================================================
 */

const dotenv = require('dotenv');
const path = require('path');

// Load .env from server directory if it exists
dotenv.config({ path: path.join(__dirname, '../../.env') });

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendOrigin: process.env.FRONTEND_ORIGIN
    ? process.env.FRONTEND_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8000'],

  // Supabase Configuration Placeholders (Phase 4)
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  },

  // Gemini AI Configuration (Phase 5)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    timeoutMs: parseInt(process.env.GEMINI_TIMEOUT_MS, 10) || 15000
  }
};

module.exports = config;

