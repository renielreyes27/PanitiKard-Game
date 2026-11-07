/**
 * ==============================================================================
 * PanitiKard V2 - Express Backend Server
 * ==============================================================================
 * 
 * Phase 4: Backend & Database Development (Step 1 Setup)
 * Provides REST API services, Supabase database integration, and Gemini AI proxy.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const config = require('./config/environment');
const { getSupabaseStatus } = require('./services/supabase');

const app = express();

// Security & Utility Middlewares
app.use(helmet());
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. server-to-server, health check, curl)
    if (!origin) return callback(null, true);

    // In development mode, allow local development origins
    if (config.nodeEnv === 'development') {
      return callback(null, true);
    }

    if (config.frontendOrigin.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS policy does not allow access from ${origin}`));
  },
  credentials: true
}));

// Base Health Check Route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    message: 'PanitiKard V2 Backend API is running smoothly.',
    service: 'PanitiKard V2 Backend API',
    environment: config.nodeEnv,
    port: config.port,
    supabase: getSupabaseStatus(),
    timestamp: new Date().toISOString()
  });
});

// Root API Information Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'active',
    message: 'Maligayang pagdating sa PanitiKard V2 Backend API!',
    phase: 'Phase 4: Backend and Database Setup',
    endpoints: {
      health: '/health',
      root: '/'
    },
    timestamp: new Date().toISOString()
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Hindi nahanap ang ruta: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[PanitiKard Server Error]:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.name || 'Internal Server Error',
    message: err.message || 'May naganap na hindi inaasahang error sa server.',
    timestamp: new Date().toISOString()
  });
});

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

