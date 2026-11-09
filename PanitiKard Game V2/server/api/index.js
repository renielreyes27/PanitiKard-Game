/**
 * ==============================================================================
 * PanitiKard V2 — Vercel Serverless Function Entry Point (Server Directory)
 * ==============================================================================
 *
 * Provides a direct serverless entry point inside the server/ directory.
 * Useful if deployment is scoped directly to the server folder.
 */

const app = require('../src/server');

module.exports = app;
