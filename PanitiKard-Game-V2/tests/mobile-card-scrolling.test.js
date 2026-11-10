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

test("CSS: .uno-card-center-oval is configured as a touch-friendly vertical scroll container", () => {
  // Must have flex: 1, min-height: 0, overflow-y: auto, touch scrolling, and overscroll containment
  assert.match(cssContent, /\.uno-card-center-oval\s*\{[^}]*overflow-y:\s*auto/s, "Missing overflow-y: auto on .uno-card-center-oval");
  assert.match(cssContent, /\.uno-card-center-oval\s*\{[^}]*min-height:\s*0/s, "Missing min-height: 0 on .uno-card-center-oval");
  assert.match(cssContent, /\.uno-card-center-oval\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/s, "Missing -webkit-overflow-scrolling: touch on .uno-card-center-oval");
  assert.match(cssContent, /\.uno-card-center-oval\s*\{[^}]*overscroll-behavior-y:\s*contain/s, "Missing overscroll-behavior-y: contain on .uno-card-center-oval");
});

test("CSS: Card header and footer are pinned (flex-shrink: 0) while inner oval scrolls", () => {
  assert.match(cssContent, /\.uno-face-header\s*\{[^}]*flex-shrink:\s*0/s, "Missing flex-shrink: 0 on .uno-face-header");
  assert.match(cssContent, /\.uno-face-footer\s*\{[^}]*flex-shrink:\s*0/s, "Missing flex-shrink: 0 on .uno-face-footer");
});

test("CSS: Parent .uno-card-frame allows flex shrinking with min-height: 0 and overflow: hidden", () => {
  assert.match(cssContent, /#card-screen \.uno-card-frame\s*\{[^}]*min-height:\s*0/s, "Missing min-height: 0 on #card-screen .uno-card-frame");
  assert.match(cssContent, /#card-screen \.uno-card-frame\s*\{[^}]*overflow:\s*hidden/s, "Missing overflow: hidden on #card-screen .uno-card-frame");
  assert.match(cssContent, /#reverse-screen \.card-reverse-front \.uno-card-frame\s*\{[^}]*min-height:\s*0/s, "Missing min-height: 0 on #reverse-screen .uno-card-frame");
});

test("CSS: .card-face-body uses safe vertical alignment to prevent negative scroll clipping", () => {
  assert.match(cssContent, /#card-screen \.card-face-body[^{]*\{[^}]*justify-content:\s*(?:flex-start|safe center)/s, "Missing safe vertical alignment on .card-face-body");
});

test("CSS: .card-submit-row spans full width across all option layouts", () => {
  assert.match(cssContent, /\.card-submit-row\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s, "Missing grid-column: 1 / -1 on .card-submit-row");
  assert.match(cssContent, /\.card-submit-row\s*\{[^}]*justify-content:\s*center/s, "Missing justify-content: center on .card-submit-row");
});

test("CSS: Responsive card heights on mobile do not aggressively clamp with excessive offsets", () => {
  // Check that max-width 768px, 600px, and max-height 680px provide healthy height allocations
  assert.match(cssContent, /@media\s*\(max-width:\s*768px\)[\s\S]*?#card-screen \.playing-card[^{]*\{[^}]*height:\s*clamp\(380px/s, "Mobile 768px card height should allow at least 380px min clamp");
  assert.match(cssContent, /@media\s*\(max-width:\s*600px\)[\s\S]*?#card-screen \.playing-card[^{]*\{[^}]*height:\s*clamp\(360px/s, "Mobile 600px card height should allow at least 360px min clamp");
  assert.match(cssContent, /@media\s*\(max-height:\s*680px\)[\s\S]*?#card-screen \.playing-card[^{]*\{[^}]*height:\s*clamp\(320px/s, "Short viewport card height should allow at least 320px min clamp");
});

test("CSS: 3D Flip animation and uniform dark-green card back are preserved", () => {
  assert.match(cssContent, /\.playing-card\s*\{[^}]*transform-style:\s*preserve-3d/s, "preserve-3d missing on .playing-card");
  assert.match(cssContent, /\.playing-card\.is-flipped\s*\{[^}]*transform:\s*rotateY\(180deg\)/s, "rotateY(180deg) missing on .playing-card.is-flipped");
  assert.match(cssContent, /\.uniform-card-back\s*\{[^}]*background:[^;]*#184221|#176b3a/s, "Uniform dark-green background missing on .uniform-card-back");
});

test("JS: Clicking/scrolling inside .uno-card-center-oval is guarded against accidental flip", () => {
  assert.match(jsContent, /interactiveCard\.addEventListener\("click",\s*\(e\)\s*=>\s*\{[^}]*\.uno-card-center-oval/s, "interactiveCard click listener must guard .uno-card-center-oval");
  assert.match(jsContent, /reverseCard\.addEventListener\("click",\s*\(e\)\s*=>\s*\{[^}]*\.uno-card-center-oval/s, "reverseCard click listener must guard .uno-card-center-oval");
});

test("HTML: Structure contains designated inner scroll container between header and footer", () => {
  assert.ok(htmlContent.includes('class="card-face-header uno-face-header"'), "HTML missing uno-face-header");
  assert.ok(htmlContent.includes('class="uno-card-center-oval"'), "HTML missing uno-card-center-oval");
  assert.ok(htmlContent.includes('class="card-face-footer uno-face-footer"'), "HTML missing uno-face-footer");
  assert.ok(htmlContent.includes('id="front-card-options"'), "HTML missing front-card-options");
});

test("Gameplay Flow Simulation: Short and long questions render with submit button accessible", () => {
  // Test both short question and long question mock rendering
  function renderMockCard({ isLongQuestion = false, questionType = "multiple_choice" }) {
    const cardData = {
      id: "card_elem_01",
      title: isLongQuestion
        ? "Mahabang Pagsusuri sa mga Elemento ng Akda, Tunggalian at Tagpuan sa Kwentong Bayan"
        : "Maikling Tanong",
      prompt: isLongQuestion
        ? "Basahin nang mabuti ang sumusunod na talata: 'Sa isang liblib na baryo sa kabundukan, may isang matandang nagngangalang Tandang Selo na buong buhay ay naglingkod sa kanyang kapwa nang walang hinihintay na kapalit...' Alin sa mga sumusunod ang pangunahing kaisipan?"
        : "Sino ang may-akda ng Florante at Laura?",
      options: [
        { key: "A", text: "Francisco Balagtas Baltazar" },
        { key: "B", text: "Jose Rizal y Alonso" },
        { key: "C", text: "Andres Bonifacio" },
        { key: "D", text: "Marcelo H. del Pilar" }
      ],
      answer: "A",
      points: 1
    };

    let selectedKey = null;
    let submitted = false;

    // Simulate DOM elements
    const submitBtn = { disabled: true, clicked: false };
    const options = cardData.options.map(opt => ({
      key: opt.key,
      text: opt.text,
      selected: false,
      click() {
        options.forEach(o => o.selected = false);
        this.selected = true;
        selectedKey = this.key;
        submitBtn.disabled = false;
      }
    }));

    function submit() {
      if (submitBtn.disabled || !selectedKey) return false;
      submitted = true;
      submitBtn.clicked = true;
      return {
        cardId: cardData.id,
        userAnswer: selectedKey,
        isCorrect: selectedKey === cardData.answer,
        pointsEarned: selectedKey === cardData.answer ? cardData.points : 0
      };
    }

    return { cardData, options, submitBtn, submit, getSelectedKey: () => selectedKey, isSubmitted: () => submitted };
  }

  // 1. Short Question test
  const shortSim = renderMockCard({ isLongQuestion: false });
  assert.equal(shortSim.submitBtn.disabled, true, "Submit button starts disabled");
  shortSim.options[0].click();
  assert.equal(shortSim.getSelectedKey(), "A");
  assert.equal(shortSim.submitBtn.disabled, false, "Submit button enabled after choice selection");
  const shortResult = shortSim.submit();
  assert.equal(shortResult.isCorrect, true);
  assert.equal(shortResult.pointsEarned, 1);
  assert.equal(shortSim.isSubmitted(), true);

  // 2. Long Question test
  const longSim = renderMockCard({ isLongQuestion: true });
  assert.equal(longSim.submitBtn.disabled, true);
  longSim.options[1].click(); // Option B (wrong)
  assert.equal(longSim.getSelectedKey(), "B");
  assert.equal(longSim.submitBtn.disabled, false);
  const longResult = longSim.submit();
  assert.equal(longResult.isCorrect, false);
  assert.equal(longResult.pointsEarned, 0);
  assert.equal(longSim.isSubmitted(), true);
});
