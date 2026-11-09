const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cssPath = path.join(__dirname, "..", "css", "style.css");
const jsPath = path.join(__dirname, "..", "js", "main.js");
const htmlPath = path.join(__dirname, "..", "index.html");

const cssContent = fs.readFileSync(cssPath, "utf8");
const jsContent = fs.readFileSync(jsPath, "utf8");
const htmlContent = fs.readFileSync(htmlPath, "utf8");

test("UI Refinement 1: Header Back button is icon-only with accessible label and circular styling", () => {
  // Should have #header-back-btn
  assert.match(htmlContent, /id="header-back-btn"/, "index.html must have #header-back-btn");

  // Must NOT contain text 'Back' or .back-btn-text in header-back-btn
  const headerBackBtnMatch = htmlContent.match(/<button[^>]*id="header-back-btn"[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(headerBackBtnMatch, "header-back-btn button element found");
  const innerBtn = headerBackBtnMatch[1];
  const innerTextWithoutTags = innerBtn.replace(/<[^>]+>/g, "").trim();
  assert.doesNotMatch(innerTextWithoutTags, /Back/i, "Header back button must not have text 'Back'");
  assert.doesNotMatch(innerBtn, /back-btn-text/, "Header back button must not contain .back-btn-text span");
  assert.match(innerBtn, /back-arrow-icon/, "Header back button must contain back-arrow-icon");

  // Must have accessibility attributes
  assert.match(headerBackBtnMatch[0], /aria-label="Bumalik"/, "Header back button must have accessible aria-label");

  // CSS must style it as a centered circular button
  assert.match(cssContent, /\.header-back-btn\s*\{[^}]*border-radius:\s*50%/s, "Header back button must have border-radius: 50%");
  assert.match(cssContent, /\.header-back-btn\s*\{[^}]*justify-content:\s*center/s, "Header back button must be centered");
});

test("UI Refinement 2: Card page indicator uses 'X ng Y' format without pill/container background", () => {
  // HTML format
  assert.match(htmlContent, /id="active-cat-step"[^>]*>\s*1\s+ng\s+\d+\s*<\/span>/, "HTML initial active-cat-step must use '1 ng X' format");
  assert.doesNotMatch(htmlContent, /id="active-cat-step"[^>]*>\s*1\s+at\s+\d+\s*<\/span>/, "HTML must not use '1 at X'");

  // JS runtime format
  assert.match(jsContent, /activeCatStep\.textContent\s*=\s*`\$\{index\s*\+\s*1\}\s+ng\s+\$\{deck\.cards\.length\}`/, "JS must render '${index + 1} ng ${deck.cards.length}'");

  // CSS styling: transparent, borderless, no box-shadow
  assert.match(cssContent, /\.single-category-step-(?:pill|text)\s*\{[^}]*background:\s*transparent/s, "Step text must have transparent background");
  assert.match(cssContent, /\.single-category-step-(?:pill|text)\s*\{[^}]*border:\s*none/s, "Step text must have border: none");
  assert.match(cssContent, /\.single-category-step-(?:pill|text)\s*\{[^}]*box-shadow:\s*none/s, "Step text must have box-shadow: none");
});

test("UI Refinement 3: Redundant bottom back buttons removed from deck and card screens", () => {
  // #deck-screen should not contain bottom back button
  assert.doesNotMatch(htmlContent, /id="btn-back-to-setup"/, "index.html should not contain #btn-back-to-setup");
  assert.doesNotMatch(htmlContent, /deck-bottom-actions/, "index.html should not contain .deck-bottom-actions");

  // #card-screen should not contain bottom back button
  assert.doesNotMatch(htmlContent, /id="btn-back-to-deck"/, "index.html should not contain #btn-back-to-deck");
  assert.doesNotMatch(htmlContent, /card-footer-nav/, "index.html should not contain .card-footer-nav");

  // Global header back button must exist as the primary navigation control
  assert.match(htmlContent, /id="header-back-btn"/, "#header-back-btn must exist");
  assert.match(jsContent, /headerBackBtn\.addEventListener\("click"/, "js/main.js must attach click listener to headerBackBtn");
});

test("UI Refinement 4: Flip card reverse side places points section at top, title below, description below, with scroll boundaries", () => {
  // In index.html, #card-feedback-header has points-row first, title-group second
  const cardFeedbackHeaderMatch = htmlContent.match(/<div id="card-feedback-header"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(cardFeedbackHeaderMatch, "#card-feedback-header element found");
  const cardHeaderHtml = cardFeedbackHeaderMatch[0];
  const pointsPos = cardHeaderHtml.indexOf("feedback-points-row");
  const titlePos = cardHeaderHtml.indexOf("feedback-title-group");
  assert.ok(pointsPos > -1, "feedback-points-row present in feedback header");
  assert.ok(titlePos > -1, "feedback-title-group present in feedback header");
  assert.ok(pointsPos < titlePos, "feedback-points-row must precede feedback-title-group");

  // In index.html, #reverse-feedback-header also has points-row first
  const revFeedbackHeaderMatch = htmlContent.match(/<div id="reverse-feedback-header"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
  assert.ok(revFeedbackHeaderMatch, "#reverse-feedback-header element found");
  const revHeaderHtml = revFeedbackHeaderMatch[0];
  const revPointsPos = revHeaderHtml.indexOf("feedback-points-row");
  const revTitlePos = revHeaderHtml.indexOf("feedback-title-group");
  assert.ok(revPointsPos < revTitlePos, "Reverse feedback points row must precede title group");

  // CSS structure: .card-feedback-head flex-direction is column
  assert.match(cssContent, /\.card-feedback-head\s*\{[^}]*flex-direction:\s*column/s, ".card-feedback-head must be column flex");

  // CSS boundary containment: feedback panel has overflow-y auto and overflow-x hidden
  assert.match(cssContent, /#card-screen \.card-feedback-panel[^{]*\{[^}]*overflow-y:\s*auto/s, "Card feedback panel must have overflow-y: auto");
  assert.match(cssContent, /#card-screen \.card-feedback-panel[^{]*\{[^}]*overflow-x:\s*hidden/s, "Card feedback panel must have overflow-x: hidden");
});

test("UI Refinement 5: Result review items align question type on left and points on right on same row", () => {
  // CSS: .result-item-top flex space-between
  assert.match(cssContent, /\.result-item-top\s*\{[^}]*display:\s*flex/s, ".result-item-top must have display: flex");
  assert.match(cssContent, /\.result-item-top\s*\{[^}]*justify-content:\s*space-between/s, ".result-item-top must have justify-content: space-between");
  assert.match(cssContent, /\.result-item-top\s*\{[^}]*align-items:\s*center/s, ".result-item-top must have align-items: center");

  // CSS: .result-item-points white-space nowrap
  assert.match(cssContent, /\.result-item-points\s*\{[^}]*white-space:\s*nowrap/s, ".result-item-points must have white-space: nowrap");
  assert.match(cssContent, /\.result-item-points\s*\{[^}]*flex-shrink:\s*0/s, ".result-item-points must have flex-shrink: 0");

  // JS: renderCardResults places type chip on left, points on right, title below
  assert.match(jsContent, /<div class="result-item-top">\s*<span class="pill-chip result-type-chip">/, "renderCardResults must put type chip in result-item-top");
  assert.match(jsContent, /<h4 class="result-item-title">Kard #\$\{card\.number\}/, "renderCardResults must put title as separate h4 element below top row");

  // JS: renderQuizResults places type chip on left, points on right, title below
  assert.match(jsContent, /<div class="result-item-top">\s*<span class="pill-chip result-type-chip">\$\{q\.questionType\}<\/span>/, "renderQuizResults must put questionType chip in result-item-top");
  assert.match(jsContent, /<h4 class="result-item-title">Tanong #\$\{idx\s*\+\s*1\}/, "renderQuizResults must put title as separate h4 element below top row");

  // JS: renderReverseResults places chip on left, points on right, title below
  assert.match(jsContent, /<div class="result-item-top">\s*<span class="pill-chip reverse-pill-chip">/, "renderReverseResults must put reverse chip in result-item-top");
  assert.match(jsContent, /<h4 class="result-item-title">Reverse Pagsubok #\$\{revIdx\s*\+\s*1\}/, "renderReverseResults must put title as separate h4 element below top row");
});
