#!/usr/bin/env node
/**
 * PanitiKard Game V2 — Static Frontend Build Script
 *
 * Securely prepares the production static distribution in `dist/` for Vercel deployment.
 * Strictly copies only frontend static assets (HTML, CSS, JS, assets) and excludes
 * all server-side code, tests, serverless functions, environment variables, and dependencies.
 */

const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

// Safety guard: ensure distDir is strictly inside projectRoot and not projectRoot itself
if (distDir === projectRoot || !distDir.startsWith(projectRoot + path.sep)) {
  console.error("[build:error] Invalid dist directory path:", distDir);
  process.exit(1);
}

console.log("[build] Preparing PanitiKard V2 static distribution...");
console.log(`[build] Project root: ${projectRoot}`);
console.log(`[build] Output directory: ${distDir}`);

// 1. Clean and recreate dist/ directory safely
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 2. Define whitelist of static frontend targets to copy
const copyTargets = [
  { type: "file", relativePath: "index.html" },
  { type: "file", relativePath: "dashboard.html" },
  { type: "dir", relativePath: "css" },
  { type: "dir", relativePath: "js" },
  { type: "dir", relativePath: "assets" }
];

let copiedFileCount = 0;

for (const target of copyTargets) {
  const srcPath = path.join(projectRoot, target.relativePath);
  const destPath = path.join(distDir, target.relativePath);

  if (!fs.existsSync(srcPath)) {
    console.error(`[build:error] Required source target not found: ${target.relativePath}`);
    process.exit(1);
  }

  if (target.type === "file") {
    fs.copyFileSync(srcPath, destPath);
    copiedFileCount += 1;
    console.log(`[build] Copied file: ${target.relativePath}`);
  } else if (target.type === "dir") {
    fs.cpSync(srcPath, destPath, { recursive: true });
    // Count files in directory
    const countFiles = (dir) => {
      let count = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          count += countFiles(path.join(dir, entry.name));
        } else if (entry.isFile()) {
          count += 1;
        }
      }
      return count;
    };
    const count = countFiles(destPath);
    copiedFileCount += count;
    console.log(`[build] Copied directory: ${target.relativePath} (${count} files)`);
  }
}

// 3. Security Inspection: verify forbidden paths are NEVER present in dist/
const forbiddenItems = [
  "server",
  "api",
  "tests",
  "node_modules",
  "scripts",
  "package.json",
  "package-lock.json",
  "vercel.json",
  ".gitignore",
  ".env",
  ".env.local",
  ".env.production"
];

for (const forbidden of forbiddenItems) {
  const forbiddenPath = path.join(distDir, forbidden);
  if (fs.existsSync(forbiddenPath)) {
    console.error(`[build:security-error] Forbidden item found in dist: ${forbidden}`);
    process.exit(1);
  }
}

// 4. Verify all critical frontend files exist in dist/
const criticalFiles = [
  "index.html",
  "dashboard.html",
  path.join("css", "style.css"),
  path.join("css", "dashboard.css"),
  path.join("js", "main.js"),
  path.join("js", "cards-data.js"),
  path.join("js", "api-client.js"),
  path.join("js", "game-api.js"),
  path.join("js", "answer-evaluator.js"),
  path.join("js", "dashboard.js"),
  path.join("js", "dashboard-api.js"),
  path.join("js", "dashboard-auth.js")
];

for (const crit of criticalFiles) {
  const fullPath = path.join(distDir, crit);
  if (!fs.existsSync(fullPath)) {
    console.error(`[build:error] Critical file missing from dist: ${crit}`);
    process.exit(1);
  }
}

console.log(`[build] Successfully built PanitiKard V2 in dist/ (${copiedFileCount} total files copied).`);
console.log("[build] Security checks passed: zero backend/private files leaked into dist/.");

