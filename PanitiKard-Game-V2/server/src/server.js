/**
 * ==============================================================================
 * PanitiKard V2 - Express Backend Server
 * ==============================================================================
 * 
 * Phase 4: Backend & Database Development (Step 1 Setup)
 * Provides health and API information routes with Supabase status placeholders.
 * Answer evaluation uses a deterministic rubric-based evaluator (no Gemini required).
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/environment');
const { getSupabaseStatus, checkSupabaseConnectivity, getSupabaseAdmin } = require('./services/supabase');
const { createCatalogService } = require('./services/catalogService');
const { createGameService } = require('./services/gameService');
const { createContentService } = require('./services/contentService');
const { createRubricEvaluatorService } = require('./services/rubricEvaluator');
const { createApiRouter } = require('./routes/apiRoutes');
const { HttpError } = require('./middleware/httpError');

// Canonical Vercel deployment hostnames belonging strictly to panitikard-game-server
const PANITIKARD_PREVIEW_ORIGIN_REGEX = /^https:\/\/panitikard-game-server(?:-[a-z0-9-]+)?\.vercel\.app$/i;

function isAllowedOrigin(origin, env = config.nodeEnv, allowedOrigins = config.frontendOrigin) {
  if (!origin) return true;
  if (env === 'development') return true;
  if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) return true;
  if (PANITIKARD_PREVIEW_ORIGIN_REGEX.test(origin)) return true;
  return false;
}

function createApp({ catalogService = createCatalogService(), gameService = createGameService(),
  contentService = createContentService(), evaluatorService = createRubricEvaluatorService(), authenticate, connectivityCheck = checkSupabaseConnectivity, adminClientFactory = getSupabaseAdmin } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  // Serve static frontend assets from named subdirectories only.
  // SECURITY: Only the specific public-facing subdirectories (css, js, assets) are exposed.
  // The server/ directory (.env, node_modules, src/, migrations) is never served statically.
  // index: false is set on all mounts so no directory listing or implicit index.html is served.
  const frontendRoot = path.join(__dirname, '..', '..');
  app.use('/css',    express.static(path.join(frontendRoot, 'css'),    { index: false }));
  app.use('/js',     express.static(path.join(frontendRoot, 'js'),     { index: false }));
  app.use('/assets', express.static(path.join(frontendRoot, 'assets'), { index: false }));

  // Explicit named HTML routes — no wildcard, no directory traversal possible.
  app.get('/dashboard',      (_req, res) => res.sendFile(path.join(frontendRoot, 'dashboard.html')));
  app.get('/dashboard.html', (_req, res) => res.sendFile(path.join(frontendRoot, 'dashboard.html')));
  app.get('/teacher',        (_req, res) => res.sendFile(path.join(frontendRoot, 'dashboard.html')));
  app.get('/admin',          (_req, res) => res.sendFile(path.join(frontendRoot, 'dashboard.html')));

  app.use(cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }
      return callback(new HttpError(403, 'CORS_REJECTED', 'CORS policy rejected this origin.'));
    },
    credentials: true
  }));

  app.get('/health', async (req, res, next) => {
    try {
      const database = await connectivityCheck();
      res.status(200).json({
        success: true,
        status: 'healthy',
        service: 'PanitiKard V2 Backend API',
        supabase: {
          connectivity: {
            reachable: Boolean(database?.reachable)
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) { next(error); }
  });

  app.get('/', (_req, res) => res.json({
    success: true,
    status: 'active',
    service: 'PanitiKard V2 Backend API',
    endpoints: { health: '/health', api: '/api/v1' },
    timestamp: new Date().toISOString()
  }));

  app.use('/api/v1', createApiRouter({ catalogService, gameService, contentService, evaluatorService, authenticate, adminClientFactory, connectivityCheck }));

  app.use((req, _res, next) => next(new HttpError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`)));
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) {
      error = new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
    }
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) {
      const sanitizedMessage = typeof error.message === 'string'
        ? error.message.replace(/(bearer\s+)[^\s]+/gi, '$1[REDACTED]').replace(/(key\s*[:=]\s*)[^\s&]+/gi, '$1[REDACTED]')
        : 'An unexpected internal error occurred.';
      console.error(`[PanitiKard API 5xx Error] ${error.code || 'INTERNAL_ERROR'}: ${sanitizedMessage}`);
    } else if (status === 403 && error.code === 'CORS_REJECTED') {
      console.warn(`[PanitiKard API 403] ${error.message}`);
    }
    res.status(status).json({
      success: false,
      error: error.code || 'INTERNAL_ERROR',
      message: status >= 500 ? 'A server error occurred.' : error.message,
      timestamp: new Date().toISOString()
    });
  });
  return app;
}

const app = createApp();

// Start listening if run directly
if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`==================================================================`);
    console.log(`🎴 PanitiKard V2 Backend Server`);
    console.log(`🚀 Port: ${config.port}`);
    console.log(`🌍 Environment: ${config.nodeEnv}`);
    console.log(`🩺 Health check: http://localhost:${config.port}/health`);
    console.log(`==================================================================`);
  });

  // Handle server startup errors (e.g. port already in use)
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server Startup Error]: Port ${config.port} is already in use.`);
      console.error(`Pakisuri kung may tumatakbo nang proseso sa port ${config.port} o baguhin ang PORT sa .env.`);
    } else if (err.code === 'EACCES') {
      console.error(`[Server Startup Error]: Elevated privileges required to bind to port ${config.port}.`);
    } else {
      console.error(`[Server Startup Error]:`, err.message);
    }
    process.exit(1);
  });

  // Graceful Shutdown on SIGTERM and SIGINT (Ctrl+C)
  const gracefulShutdown = (signal) => {
    console.log(`\n[${signal}] signal received: closing HTTP server gracefully...`);
    server.close(() => {
      console.log('HTTP server closed cleanly. Paalam!');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;
module.exports.createApp = createApp;
module.exports.isAllowedOrigin = isAllowedOrigin;
module.exports.PANITIKARD_PREVIEW_ORIGIN_REGEX = PANITIKARD_PREVIEW_ORIGIN_REGEX;

