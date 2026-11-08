/**
 * ==============================================================================
 * PanitiKard V2 - Express Backend Server
 * ==============================================================================
 * 
 * Phase 4: Backend & Database Development (Step 1 Setup)
 * Provides health and API information routes with Supabase status placeholders.
 * Gemini evaluation is not implemented or connected in this server yet.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/environment');
const { getSupabaseStatus, checkSupabaseConnectivity } = require('./services/supabase');
const { createCatalogService } = require('./services/catalogService');
const { createGameService } = require('./services/gameService');
const { createContentService } = require('./services/contentService');
const { createApiRouter } = require('./routes/apiRoutes');
const { HttpError } = require('./middleware/httpError');

function createApp({ catalogService = createCatalogService(), gameService = createGameService(),
  contentService = createContentService(), authenticate, connectivityCheck = checkSupabaseConnectivity } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || config.nodeEnv === 'development' || config.frontendOrigin.includes(origin)) return callback(null, true);
      return callback(new Error('CORS policy rejected this origin.'));
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
        environment: config.nodeEnv,
        supabase: { ...getSupabaseStatus(), connectivity: database },
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

  app.use('/api/v1', createApiRouter({ catalogService, gameService, contentService, authenticate }));

  app.use((req, _res, next) => next(new HttpError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`)));
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && Object.prototype.hasOwnProperty.call(error, 'body')) {
      error = new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
    }
    const status = Number.isInteger(error.status) ? error.status : 500;
    if (status >= 500) console.error('[PanitiKard API]', error.code || error.name || 'INTERNAL_ERROR');
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

