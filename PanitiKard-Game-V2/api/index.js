/**
 * ==============================================================================
 * PanitiKard V2 — Vercel Serverless Function Entry Point (Root)
 * ==============================================================================
 *
 * Routes incoming serverless requests on Vercel to the Express backend application.
 * Preserves Supabase authentication, Gemini AI evaluation, and official scoring.
 */

const app = require('../server/src/server');

module.exports = app;
