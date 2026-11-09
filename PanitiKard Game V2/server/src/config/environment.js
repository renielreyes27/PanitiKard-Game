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
    : ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:8000', 'http://localhost:8080', 'http://127.0.0.1:8080'],

  // Supabase Configuration Placeholders (Phase 4)
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  },

  // Guest Session Configuration (Phase 5.6)
  guestSessionSecret: process.env.GUEST_SESSION_SECRET || 'panitikard-guest-secret-dev-key'
};

module.exports = config;

