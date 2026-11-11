const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const rootDir = path.resolve(__dirname, "..");
const mainJs = fs.readFileSync(path.join(rootDir, "js", "main.js"), "utf8");
const cardsData = require(path.join(rootDir, "js", "cards-data.js"));
const { createApp } = require(path.join(rootDir, "server", "src", "server.js"));

test("Regression: Question 1 -> Question 2 Identification submission handler resilience in main.js", () => {
  // Verify submitOpenEndedAnswer awaits remoteWriteQueue and remoteSessionPromise
  assert.match(
    mainJs,
    /const pendingSessionPromise\s*=\s*appState\.remoteSessionPromise;/,
    "submitOpenEndedAnswer must reference appState.remoteSessionPromise"
  );
  assert.match(
    mainJs,
    /\(appState\.remoteWriteQueue\s*\|\|\s*Promise\.resolve\(\)\)/,
    "submitOpenEndedAnswer must chain with appState.remoteWriteQueue to prevent session race conditions"
  );

  // Verify that guest token is synchronized from remote session
  assert.match(
    mainJs,
    /if\s*\(initialized\.session\.sessionToken\s*&&\s*typeof gameApi\?\.setGuestToken\s*===\s*"function"\)\s*\{\s*gameApi\.setGuestToken\(initialized\.session\.sessionToken\);\s*\}/,
    "submitOpenEndedAnswer must synchronize guest token from remote session"
  );

  // Verify hasToken permits activeSessionId to prevent premature SESSION_UNAVAILABLE traps
  assert.match(
    mainJs,
    /Boolean\(activeSessionId\)/,
    "submitOpenEndedAnswer must recognize activeSessionId as valid token credential"
  );

  // Verify fallback to deterministic local rubric evaluator is present
  assert.match(
    mainJs,
    /const localEval\s*=\s*evaluateOpenEndedAnswer\(answerText,\s*cardData\);/,
    "submitOpenEndedAnswer must use evaluateOpenEndedAnswer for deterministic fallback"
  );
});

test("E2E Regression: Elements Question 1 (Multiple Choice) -> Question 2 (Identification) sequential submission", async () => {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // 1. Create a guest session for Elements topic
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topicCode: "elements",
        mode: "deck",
        studentName: "Question 2 Regression QA"
      })
    });
    assert.equal(createRes.status, 201, "Session creation must return 201 Created");
    const sessionPayload = await createRes.json();
    assert.ok(sessionPayload.success, "Session creation must succeed");
    const session = sessionPayload.data;
    const sessionId = session.id;
    const guestToken = session.sessionToken;

    // 2. Submit Question 1 (elem-question - Multiple Choice: B)
    const q1Res = await fetch(`${baseUrl}/sessions/${sessionId}/answers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${guestToken}`
      },
      body: JSON.stringify({
        questionCode: "elem-question",
        response: "B",
        round: "main"
      })
    });
    assert.equal(q1Res.status, 201, "Question 1 submission must return 201 Created");
    const q1Payload = await q1Res.json();
    assert.ok(q1Payload.success, "Question 1 answer submission must succeed");
    assert.equal(q1Payload.data.isCorrect, true, "Question 1 answer B must be evaluated as correct");

    // 3. Submit Question 2 (elem-statement - Identification / Open-Ended)
    const q2StudentAnswer = "Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.";
    const q2Res = await fetch(`${baseUrl}/sessions/${sessionId}/answers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${guestToken}`
      },
      body: JSON.stringify({
        questionCode: "elem-statement",
        response: q2StudentAnswer,
        round: "main"
      })
    });
    assert.equal(q2Res.status, 201, "Question 2 submission must return 201 Created");
    const q2Payload = await q2Res.json();
    assert.ok(q2Payload.success, "Question 2 answer submission must succeed");
    assert.equal(q2Payload.data.isCorrect, true, "Question 2 answer must be evaluated as correct");
    assert.equal(q2Payload.data.pointsAwarded, 1, "Question 2 must award 1 point");

    // 4. Verify session state reflects both answers
    const verifyRes = await fetch(`${baseUrl}/sessions/${sessionId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${guestToken}` }
    });
    assert.equal(verifyRes.status, 200, "Get session must return 200 OK");
    const verifyPayload = await verifyRes.json();
    const loadedSession = verifyPayload.data;
    assert.equal(loadedSession.answers.length, 2, "Session must have exactly 2 answers recorded");
    assert.equal(loadedSession.main_score, 2, "Total main score after Q1 and Q2 must be 2");
  } finally {
    server.close();
  }
});
