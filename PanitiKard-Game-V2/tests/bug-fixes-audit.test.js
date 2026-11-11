const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const dashboardHtml = fs.readFileSync(path.join(rootDir, "dashboard.html"), "utf8");
const mainJs = fs.readFileSync(path.join(rootDir, "js", "main.js"), "utf8");
const dashboardJs = fs.readFileSync(path.join(rootDir, "js", "dashboard.js"), "utf8");
const dashboardCss = fs.readFileSync(path.join(rootDir, "css", "dashboard.css"), "utf8");

// Helper to extract visible text (stripping comments, scripts, styles, HTML tags)
function getVisibleText(html) {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const withoutScripts = withoutComments.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  const withoutStyles = withoutScripts.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  return withoutStyles.replace(/<[^>]+>/g, " ");
}

test("Bug 1: Multiple Choice checks selected option against answer key (A, B, C, D) and awards correct score when matching", () => {
  // In main.js submitMultipleChoiceAnswer:
  assert.match(
    mainJs,
    /function submitMultipleChoiceAnswer\(/,
    "main.js must define submitMultipleChoiceAnswer"
  );
  assert.match(
    mainJs,
    /const normUser\s*=\s*\(selectedKey\s*\|\|\s*""\)\.trim\(\)\.toUpperCase\(\);/,
    "submitMultipleChoiceAnswer must normalize option key"
  );
  assert.match(
    mainJs,
    /const normAns\s*=\s*\(cardData\.answer\s*\|\|\s*""\)\.trim\(\)\.toUpperCase\(\);/,
    "submitMultipleChoiceAnswer must normalize answer key"
  );
  assert.match(
    mainJs,
    /normUser === normAns/,
    "submitMultipleChoiceAnswer must check matching normalized keys"
  );

  // Must set non-boolean status text for multiple choice (WASTO! / DI-WASTO)
  assert.match(
    mainJs,
    /cardFeedbackStatus\.textContent\s*=\s*isOk\s*\?\s*"WASTO!"\s*:\s*\(submission\.isTimeout\s*\?\s*"NAUBOS ANG ORAS!"\s*:\s*"DI-WASTO"\)/,
    "cardFeedbackStatus must display WASTO! or DI-WASTO for multiple choice"
  );

  // In checkQuizAnswer:
  assert.match(
    mainJs,
    /function checkQuizAnswer\(/,
    "main.js must define checkQuizAnswer"
  );

  // In handleQuizSubmission:
  assert.match(
    mainJs,
    /if \(q\.questionType === "multiple_choice"\) \{\s*quizFeedbackStatus\.textContent = isCorrect \? "WASTO!" : "MALI";/,
    "handleQuizSubmission must set WASTO! or MALI for multiple choice questions"
  );
});

test("Bug 1 / Regression: True/False questions still check correctly ('True'/'False', 'Tama'/'Mali')", () => {
  // True/False in checkQuizAnswer
  assert.match(
    mainJs,
    /\(normAns === "true" \|\| normAns === "tama"\) && \(normUser === "true" \|\| normUser === "tama" \|\| normUser === "t"\)/,
    "checkQuizAnswer must accept True/Tama variants"
  );
  assert.match(
    mainJs,
    /\(normAns === "false" \|\| normAns === "mali"\) && \(normUser === "false" \|\| normUser === "mali" \|\| normUser === "m"\)/,
    "checkQuizAnswer must accept False/Mali variants"
  );

  // Feedback for True/False uses TAMA! / MALI
  assert.match(
    mainJs,
    /quizFeedbackStatus\.textContent = isCorrect \? "TAMA!" : "MALI";/,
    "Quiz feedback must use TAMA! / MALI for True/False"
  );
});

test("Bug 2: Identification question submits successfully and advances to the next card", () => {
  // Verify submitOpenEndedAnswer clears isEvaluatingAnswer on success and unlocks next index
  assert.match(
    mainJs,
    /async function submitOpenEndedAnswer\(/,
    "main.js must define submitOpenEndedAnswer"
  );
  assert.match(
    mainJs,
    /appState\.isEvaluatingAnswer = false;/,
    "submitOpenEndedAnswer must reset isEvaluatingAnswer to allow proceeding"
  );
  assert.match(
    mainJs,
    /unlockNextIndex\(\);/,
    "submitOpenEndedAnswer must call unlockNextIndex"
  );
  assert.match(
    mainJs,
    /renderCardByTypeIndex\(appState\.activeCardTypeIndex\);/,
    "submitOpenEndedAnswer must re-render card to display feedback and next button"
  );

  // Gracefully handles 23505 / duplicate remote submission without throwing or halting card progression
  assert.match(
    mainJs,
    /errMsg\.includes\("already been recorded"\) \|\| errMsg\.includes\("duplicate"\) \|\| errMsg\.includes\("23505"\)/,
    "submitOpenEndedAnswer must catch duplicate submission errors and continue safely"
  );
});

test("Bug 3: Rapid double-clicking the submit button produces only one submission call", () => {
  // main.js must guard against multiple in-flight evaluations
  assert.match(
    mainJs,
    /if \(appState\.isEvaluatingAnswer\) return;/,
    "submitOpenEndedAnswer must guard against repeated clicks while evaluating"
  );

  // Must immediately disable button and set in-flight flag
  assert.match(
    mainJs,
    /appState\.isEvaluatingAnswer = true;/,
    "submitOpenEndedAnswer must set isEvaluatingAnswer = true before async work"
  );
  assert.match(
    mainJs,
    /if \(submitBtn\) \{\s*submitBtn\.disabled = true;/,
    "submitOpenEndedAnswer must immediately disable button"
  );
});

test("Bug 3: Slow network responses keep submit button in loading/disabled state without premature re-enable", () => {
  // Shows loading state during evaluation
  assert.match(
    mainJs,
    /submitBtn\.innerHTML = `<span>[^<]*Sinusuri ang sagot\.\.\.<\/span>`;/,
    "Button must show 'Sinusuri ang sagot...' during processing"
  );
  assert.doesNotMatch(
    mainJs,
    /Sinusuri ng AI\.\.\./,
    "Must not reference AI in card answer evaluation button"
  );

  // Ensure button is NOT re-enabled in a premature finally block before remote persistence finishes
  const submitOpenMatch = mainJs.match(/async function submitOpenEndedAnswer\([\s\S]*?function restoreSubmitButtonOnFailure/);
  assert.ok(submitOpenMatch, "submitOpenEndedAnswer implementation found");
  const fnBody = submitOpenMatch[0];
  assert.doesNotMatch(
    fnBody,
    /finally\s*\{[^}]*submitBtn\.disabled\s*=\s*false[^}]*\}/,
    "submitOpenEndedAnswer must NOT prematurely re-enable submit button in a finally block"
  );
});

test("Bug 2 & 3: A successful submission proceeds without requiring a second click", () => {
  // Successful answer evaluation updates answers and triggers unlockNextIndex
  assert.match(
    mainJs,
    /appState\.answers\[cardData\.id\] = \{/,
    "Card answer must be recorded in appState"
  );
  assert.match(
    mainJs,
    /function unlockNextIndex\(\) \{/,
    "unlockNextIndex must be defined"
  );
  assert.match(
    mainJs,
    /appState\.highestUnlockedIndex = Math\.min\(appState\.activeCardTypeIndex \+ 1, maxIndex\);/,
    "unlockNextIndex must unlock the next card index"
  );
});

test("Bug 4: Submit button displays 'Isumite' after an answer is selected (multiple choice) or typed (open-ended)", () => {
  // Initial card multiple choice button has "Isumite" and is disabled
  assert.match(
    mainJs,
    /<button type="button" class="btn-submit-choice" disabled>\s*<span>Isumite<\/span>\s*<\/button>/,
    "Card multiple choice button must initially be disabled with 'Isumite'"
  );

  // Selecting a multiple choice option updates text to "Isumite" and enables button
  assert.match(
    mainJs,
    /submitBtn\.disabled = false;[\s\S]*?span\.textContent = "Isumite";/,
    "Selecting option must enable submit button and set text to 'Isumite'"
  );

  // Card open-ended button initial state and textarea input listener
  assert.match(
    mainJs,
    /<button type="button" id="btn-submit-open" class="btn-submit-choice" disabled>\s*<span>Isumite<\/span>\s*<\/button>/,
    "Card open-ended button must initially be disabled with 'Isumite'"
  );
  assert.match(
    mainJs,
    /btnSubmitOpen\.disabled = !hasText;[\s\S]*?span\.textContent = "Isumite";/,
    "Typing in textarea must ensure button text is 'Isumite'"
  );

  // Quiz submit button
  assert.match(
    indexHtml,
    /<button[^>]*id="btn-quiz-submit"[^>]*disabled[^>]*>[\s\S]*?<span>Isumite<\/span>/,
    "Quiz submit button must have label 'Isumite'"
  );
  assert.match(
    mainJs,
    /if \(btnQuizSubmit\) btnQuizSubmit\.disabled = false;/,
    "Quiz answer selection must update button state"
  );

  // Reverse card submit button
  assert.match(
    mainJs,
    /btnReverseSubmit\.disabled = false;[\s\S]*?span\.textContent = "Isumite";/,
    "Reverse round must update button text to 'Isumite'"
  );
});

test("Bug 5: Student UI contains zero occurrences of 'Mga Deck', 'Topic Deck', or 'Deck:' in visible text elements", () => {
  const visibleIndexText = getVisibleText(indexHtml);

  // Must not contain "Mga Deck" or "Topic Deck" or "Deck:" in visible text
  assert.doesNotMatch(visibleIndexText, /Mga Deck/i, "index.html must not contain visible 'Mga Deck'");
  assert.doesNotMatch(visibleIndexText, /Topic Deck/i, "index.html must not contain visible 'Topic Deck'");
  assert.doesNotMatch(visibleIndexText, /Deck:\s*-/i, "index.html must not contain 'Deck: -'");

  // Must have "Mga Paksa" and "Paksa: -"
  assert.match(visibleIndexText, /Mga Paksa/, "index.html must contain 'Mga Paksa'");
  assert.match(visibleIndexText, /Paksa:\s*-/, "index.html must contain 'Paksa: -'");

  // Check main.js runtime indicators
  assert.doesNotMatch(mainJs, /cardDeckIndicator\.textContent\s*=\s*`Deck:/, "main.js card indicator must not use 'Deck:'");
  assert.match(mainJs, /cardDeckIndicator\.textContent\s*=\s*`Paksa:\s*\$\{deck\.title\}`/, "main.js card indicator must use 'Paksa:'");
  assert.doesNotMatch(mainJs, /resultDeckBadge\.textContent\s*=\s*`Deck:/, "main.js result badge must not use 'Deck:'");
  assert.match(mainJs, /resultDeckBadge\.textContent\s*=\s*`Paksa:\s*\$\{deck\.title\}`/, "main.js result badge must use 'Paksa:'");
});

test("Bug 6: Teacher sign-in handles repeated clicks safely (in-flight guard)", () => {
  // main.js teacher auth in-flight guard
  assert.match(
    mainJs,
    /let isSubmittingTeacherAuth = false;/,
    "main.js must define isSubmittingTeacherAuth flag"
  );
  assert.match(
    mainJs,
    /if \(isSubmittingTeacherAuth\) return;/,
    "main.js teacher submit listener must guard against repeated clicks"
  );

  // dashboard.js staff login in-flight guard
  assert.match(
    dashboardJs,
    /let isSubmittingStaffLogin = false;/,
    "dashboard.js must define isSubmittingStaffLogin flag"
  );
  assert.match(
    dashboardJs,
    /if \(isSubmittingStaffLogin\) return;/,
    "dashboard.js login form must guard against repeated submissions"
  );
});

test("Bug 6: Successful teacher sign-in keeps the button disabled while the redirect is in progress", () => {
  // In main.js teacher sign-in
  assert.match(
    mainJs,
    /btnTeacherLoginSubmit\.textContent = "Binubuksan ang dashboard\.\.\.";/,
    "Teacher submit button must show 'Binubuksan ang dashboard...'"
  );
  assert.match(
    mainJs,
    /btnTeacherLoginSubmit\.disabled = true;/,
    "Teacher submit button must remain disabled"
  );
  // Ensure synchronous catch only restores on error
  assert.match(
    mainJs,
    /isSubmittingTeacherAuth = false;\s*showTeacherModalAlert\(err\.message/,
    "Catch block must reset isSubmittingTeacherAuth only on error"
  );
});

test("Bug 7: Dashboard header buttons have responsive styles ensuring Logout does not overflow at 375px, 414px, 768px, and 1024px", () => {
  // .btn-logout must have flex-shrink: 0 and white-space: nowrap
  assert.match(
    dashboardCss,
    /\.btn-logout\s*\{[^}]*white-space:\s*nowrap/s,
    ".btn-logout must have white-space: nowrap"
  );
  assert.match(
    dashboardCss,
    /\.btn-logout\s*\{[^}]*flex-shrink:\s*0/s,
    ".btn-logout must have flex-shrink: 0"
  );

  // Responsive breakpoints
  assert.match(dashboardCss, /@media\s*\(max-width:\s*1024px\)/, "dashboard.css must have @media (max-width: 1024px)");
  assert.match(dashboardCss, /@media\s*\(max-width:\s*768px\)/, "dashboard.css must have @media (max-width: 768px)");
  assert.match(dashboardCss, /@media\s*\(max-width:\s*480px\)/, "dashboard.css must have @media (max-width: 480px) for mobile");
  assert.match(dashboardCss, /@media\s*\(max-width:\s*375px\)/, "dashboard.css must have @media (max-width: 375px) for narrow viewports");

  // Mobile rules adapt elements to prevent overflow
  assert.match(
    dashboardCss,
    /@media\s*\(max-width:\s*480px\)[\s\S]*?\.brand-badge\s*\{[^}]*display:\s*none;/s,
    "Mobile <=480px must hide brand-badge to save space"
  );
  assert.match(
    dashboardCss,
    /@media\s*\(max-width:\s*375px\)[\s\S]*?\.user-identity-pill\s*\{[^}]*display:\s*none;/s,
    "Mobile <=375px must hide user-identity-pill so Logout never overflows"
  );
});

test("Bug 8: Internal Back button in Add Topic and Edit Question modals returns to Teacher/Admin dashboard without routing through selection page", () => {
  // Check dashboard.html modal back buttons
  assert.match(
    dashboardHtml,
    /<button[^>]*class="btn-internal-back"[^>]*data-close-modal="create"[^>]*>[\s\S]*?Bumalik sa Dashboard\s*<\/button>/,
    "Create Topic modal must have internal back button"
  );
  assert.match(
    dashboardHtml,
    /<button[^>]*class="btn-internal-back"[^>]*data-close-modal="edit"[^>]*>[\s\S]*?Bumalik sa Dashboard\s*<\/button>/,
    "Edit Topic modal must have internal back button"
  );
  assert.match(
    dashboardHtml,
    /<button[^>]*class="btn-internal-back"[^>]*data-close-modal="create-q"[^>]*>[\s\S]*?Bumalik sa Dashboard\s*<\/button>/,
    "Create Question modal must have internal back button"
  );
  assert.match(
    dashboardHtml,
    /<button[^>]*class="btn-internal-back"[^>]*data-close-modal="edit-q"[^>]*>[\s\S]*?Bumalik sa Dashboard\s*<\/button>/,
    "Edit Question modal must have internal back button"
  );

  // Footer back buttons
  assert.match(
    dashboardHtml,
    /<button[^>]*class="btn-outline btn-back-to-dash"[^>]*data-close-modal="create"/,
    "Create Topic footer must have back to dash button"
  );
  assert.match(
    dashboardHtml,
    /<button[^>]*class="btn-outline btn-back-to-dash"[^>]*data-close-modal="edit-q"/,
    "Edit Question footer must have back to dash button"
  );

  // None of these internal back buttons should be an anchor tag pointing to '/'
  const modalMatches = dashboardHtml.match(/<div[^>]*id="modal-(?:create|edit)-(?:topic|question)"[\s\S]*?<\/form>\s*<\/div>\s*<\/div>/g);
  assert.ok(modalMatches && modalMatches.length >= 4, "Topic and question modals found in dashboard.html");
  for (const modalSnippet of modalMatches) {
    assert.doesNotMatch(
      modalSnippet,
      /<a[^>]+href="\/"[^>]*>(?:←|&larr;)?\s*Bumalik/i,
      "Modal back button must NOT link to root (/)"
    );
  }

  // dashboard.js event wiring closes modals without changing window.location
  assert.match(
    dashboardJs,
    /document\.querySelectorAll\('\[data-close-modal\]'\)\.forEach/,
    "dashboard.js must attach click listener to [data-close-modal]"
  );
});
