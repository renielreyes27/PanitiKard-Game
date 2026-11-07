/**
 * ==========================================================================
 * PanitiKard V2 - Main JavaScript (Phase 2.5 Polish)
 * ==========================================================================
 * 
 * Features:
 * 1. Streamlined 3-screen flow: Setup -> Topic Deck Selection -> Card Arena.
 * 2. Real-time name validation and dynamic player pass update.
 * 3. Topic deck selection with active state management.
 * 4. Viewport-optimized 3D flip card with 2x2 option grid on desktop.
 * 5. 7 Bilingual card type tabs with seamless keyboard and click interactions.
 * 
 * Pure vanilla JavaScript with zero external libraries.
 */

document.addEventListener("DOMContentLoaded", () => {
  console.log("PanitiKard V2: Phase 2.5 controller initialized.");

  // ------------------------------------------------------------------------
  // 1. App State
  // ------------------------------------------------------------------------
  const appState = {
    studentName: "",
    activeDeckId: "elements", // Default to 'elements'
    activeCardTypeIndex: 0    // Index 0-6 corresponding to the 7 card types
  };

  // ------------------------------------------------------------------------
  // 2. Element References
  // ------------------------------------------------------------------------
  // Screens
  const screens = {
    setup: document.getElementById("setup-screen"),
    deck: document.getElementById("deck-screen"),
    card: document.getElementById("card-screen")
  };

  // Screen 1: Setup Elements
  const setupForm = document.getElementById("setup-form");
  const studentNameInput = document.getElementById("student-name");
  const validationBanner = document.getElementById("validation-banner");
  const validationText = document.getElementById("validation-text");

  // Screen 2: Deck Elements
  const deckStudentName = document.getElementById("deck-student-name");
  const deckBoxes = document.querySelectorAll(".deck-box");
  const btnBackToSetup = document.getElementById("btn-back-to-setup");
  const btnEditStudentName = document.getElementById("btn-edit-student-name");
  const btnEnterDeck = document.getElementById("btn-enter-deck");

  // Screen 3: Card Arena Elements
  const btnCrumbDeck = document.getElementById("btn-crumb-deck");
  const btnBackToDeck = document.getElementById("btn-back-to-deck");
  const cardDeckIndicator = document.getElementById("card-deck-indicator");
  const cardStudentIndicator = document.getElementById("card-student-indicator");
  const cardTypeTabs = document.querySelectorAll(".type-tab");
  const interactiveCard = document.getElementById("interactive-card");
  const btnFlipCard = document.getElementById("btn-flip-card");
  const btnPrevCard = document.getElementById("btn-prev-card");
  const btnNextCard = document.getElementById("btn-next-card");

  // Front Face Elements
  const frontCardNum = document.getElementById("front-card-num");
  const frontCardNumBottom = document.getElementById("front-card-num-bottom");
  const frontCardTypeBadge = document.getElementById("front-card-type-badge");
  const frontDeckBadge = document.getElementById("front-deck-badge");
  const frontCardIcon = document.getElementById("front-card-icon");
  const frontCardTitle = document.getElementById("front-card-title");
  const frontCardPrompt = document.getElementById("front-card-prompt");
  const frontCardOptions = document.getElementById("front-card-options");

  // Back Face Elements
  const backCardNum = document.getElementById("back-card-num");
  const backCardNumBottom = document.getElementById("back-card-num-bottom");
  const backAnswerHighlight = document.getElementById("back-answer-highlight");
  const backExplanationText = document.getElementById("back-explanation-text");
  const backTriviaText = document.getElementById("back-trivia-text");

  // ------------------------------------------------------------------------
  // 3. Screen Navigation Helper
  // ------------------------------------------------------------------------
  /**
   * Switches the visible screen with smooth transition.
   * @param {HTMLElement} targetScreen
   */
  function navigateToScreen(targetScreen) {
    Object.values(screens).forEach((screen) => {
      if (screen) screen.classList.add("hidden");
    });
    if (targetScreen) {
      targetScreen.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // ------------------------------------------------------------------------
  // 4. Validation Helpers
  // ------------------------------------------------------------------------
  function showValidation(msg) {
    validationText.textContent = msg;
    validationBanner.classList.remove("hidden");
    validationBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideValidation() {
    validationBanner.classList.add("hidden");
    validationText.textContent = "";
  }

  studentNameInput.addEventListener("input", () => {
    if (studentNameInput.value.trim().length > 0) {
      hideValidation();
    }
  });

  // ------------------------------------------------------------------------
  // 5. Screen 1 -> Screen 2: Setup to Deck Selection Flow
  // ------------------------------------------------------------------------
  setupForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const name = studentNameInput.value.trim();

    if (!name) {
      showValidation("Pakilagay muna ang iyong buong pangalan bago magpatuloy.");
      studentNameInput.focus();
      return;
    }

    appState.studentName = name;
    hideValidation();

    // Update player name badge on Screen 2
    if (deckStudentName) {
      deckStudentName.textContent = name;
    }

    // Direct transition to Topic Deck Selection
    syncActiveDeckUI(appState.activeDeckId);
    navigateToScreen(screens.deck);
  });

  // Navigation: Back from Deck Screen to Setup Screen
  if (btnBackToSetup) {
    btnBackToSetup.addEventListener("click", () => {
      navigateToScreen(screens.setup);
      studentNameInput.focus();
    });
  }

  if (btnEditStudentName) {
    btnEditStudentName.addEventListener("click", () => {
      navigateToScreen(screens.setup);
      studentNameInput.focus();
    });
  }

  // ------------------------------------------------------------------------
  // 6. Screen 2: Topic Deck Selection
  // ------------------------------------------------------------------------
  function selectDeck(deckId) {
    appState.activeDeckId = deckId;
    syncActiveDeckUI(deckId);
  }

  function syncActiveDeckUI(deckId) {
    deckBoxes.forEach((box) => {
      if (box.dataset.deckId === deckId) {
        box.classList.add("active-deck");
        box.setAttribute("aria-checked", "true");
      } else {
        box.classList.remove("active-deck");
        box.setAttribute("aria-checked", "false");
      }
    });
  }

  deckBoxes.forEach((box) => {
    box.addEventListener("click", () => selectDeck(box.dataset.deckId));
    box.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectDeck(box.dataset.deckId);
      }
    });
  });

  // Deck Screen -> Card Arena Screen
  if (btnEnterDeck) {
    btnEnterDeck.addEventListener("click", () => {
      openCardArena();
    });
  }

  // ------------------------------------------------------------------------
  // 7. Screen 3: Card Arena & 3D Flip Card Logic
  // ------------------------------------------------------------------------
  function openCardArena() {
    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck) return;

    if (cardDeckIndicator) {
      cardDeckIndicator.textContent = `Deck: ${deck.title}`;
    }
    if (cardStudentIndicator) {
      cardStudentIndicator.textContent = `Mag-aaral: ${appState.studentName || "Mag-aaral"}`;
    }

    // Reset card index to first card (Question) and reset flip
    appState.activeCardTypeIndex = 0;
    if (interactiveCard) {
      interactiveCard.classList.remove("is-flipped");
      interactiveCard.dataset.flipped = "false";
    }

    renderCardByTypeIndex(appState.activeCardTypeIndex);
    navigateToScreen(screens.card);
  }

  /**
   * Renders the card at the specified index within the active deck.
   * @param {number} index
   */
  function renderCardByTypeIndex(index) {
    const deck = PANITIKARD_DECKS[appState.activeDeckId];
    if (!deck || !deck.cards[index]) return;

    const cardData = deck.cards[index];
    const typeMeta = PANITIKARD_CARD_TYPES[cardData.type] || {
      label: cardData.type,
      subLabel: "Card",
      icon: "🎴",
      color: "#185b55"
    };

    // Apply card type styling classes
    interactiveCard.className = "playing-card";
    interactiveCard.classList.add(`theme-${typeMeta.tagClass}`);
    if (interactiveCard.dataset.flipped === "true") {
      interactiveCard.classList.add("is-flipped");
    }

    // 1. Header Badges & Corners
    frontCardNum.textContent = cardData.number;
    frontCardNumBottom.textContent = cardData.number;
    backCardNum.textContent = cardData.number;
    backCardNumBottom.textContent = cardData.number;

    frontCardTypeBadge.innerHTML = `
      <span class="type-badge-icon">${typeMeta.icon}</span>
      <span class="type-badge-text">${typeMeta.label} &bull; ${typeMeta.subLabel}</span>
    `;

    frontDeckBadge.textContent = deck.badge;
    frontCardIcon.textContent = typeMeta.icon;

    // 2. Title & Prompt Text
    frontCardTitle.textContent = cardData.title;
    frontCardPrompt.textContent = cardData.prompt;

    // 3. Options or Format Presentation (Multiple Choice vs Open Response)
    frontCardOptions.innerHTML = "";
    if (cardData.options && cardData.options.length > 0) {
      frontCardOptions.className = "card-options-grid";
      cardData.options.forEach((opt) => {
        const optionEl = document.createElement("div");
        optionEl.className = "option-pill";
        optionEl.innerHTML = `
          <span class="option-key">${opt.key}</span>
          <span class="option-text">${opt.text}</span>
        `;
        // Practice click interaction without grading
        optionEl.addEventListener("click", (e) => {
          e.stopPropagation(); // Avoid triggering full card flip when clicking choice
          document.querySelectorAll(".option-pill").forEach(p => p.style.borderColor = "");
          optionEl.style.borderColor = typeMeta.color;
        });
        frontCardOptions.appendChild(optionEl);
      });
    } else {
      // In V1, non-Question cards (Statement, Correction, Bonus, Reverse, Help, Challenge)
      // are open-ended written format cards.
      frontCardOptions.className = "card-options-open";
      const openFormatNotice = document.createElement("div");
      openFormatNotice.className = "open-response-notice";
      
      let badgesHtml = `<span class="format-tag">✍️ Anyong Pasulat</span>`;
      if (cardData.timeLimit) {
        badgesHtml += `<span class="time-limit-badge">⏱️ ${cardData.timeLimit}s</span>`;
      }
      if (cardData.points > 1) {
        badgesHtml += `<span class="points-badge">⭐ ${cardData.points} Puntos</span>`;
      } else if (cardData.points === 0) {
        badgesHtml += `<span class="points-badge">🔄 Pagbabalik-aral (0 Puntos)</span>`;
      }

      openFormatNotice.innerHTML = `
        <div class="open-format-badge">
          ${badgesHtml}
        </div>
        <p class="open-format-desc">
          ${cardData.hint ? `💡 <strong>Pahiwatig:</strong> ${cardData.hint}` : `Isulat o ipaliwanag ang iyong sagot batay sa pampanitikang aralin.`}
        </p>
      `;
      frontCardOptions.appendChild(openFormatNotice);
    }

    // 4. Back Face Content
    const correctOpt = (cardData.options && cardData.options.length > 0) 
      ? cardData.options.find(o => o.key === cardData.answer) 
      : null;
    const answerText = correctOpt ? `${cardData.answer} &bull; ${correctOpt.text}` : cardData.answer;
    backAnswerHighlight.innerHTML = answerText;
    backExplanationText.textContent = cardData.explanation;

    // Display Trivia (if exists) or V1 Accepted Keywords (terms)
    const backTriviaBox = document.querySelector(".back-trivia-box");
    const triviaTitle = document.querySelector(".trivia-title");
    if (cardData.didYouKnow) {
      if (backTriviaBox) backTriviaBox.style.display = "block";
      if (triviaTitle) triviaTitle.textContent = "✨ Alam Mo Ba?";
      backTriviaText.textContent = cardData.didYouKnow;
    } else if (cardData.terms && cardData.terms.length > 0) {
      if (backTriviaBox) backTriviaBox.style.display = "block";
      if (triviaTitle) triviaTitle.textContent = "🔑 Mga Susing Kaisipan (V1 Keywords):";
      backTriviaText.textContent = cardData.terms.map(group => group.join(" / ")).join(" • ");
    } else {
      if (backTriviaBox) backTriviaBox.style.display = "none";
    }

    // 5. Update Switcher Tabs UI
    cardTypeTabs.forEach((tab, i) => {
      if (i === index) {
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      } else {
        tab.classList.remove("active");
        tab.setAttribute("aria-selected", "false");
      }
    });
  }

  // Card Switcher Tabs Click Handlers
  cardTypeTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      appState.activeCardTypeIndex = index;
      renderCardByTypeIndex(appState.activeCardTypeIndex);
    });
  });

  // Previous & Next Card Controls
  if (btnPrevCard) {
    btnPrevCard.addEventListener("click", () => {
      const totalCards = 7;
      appState.activeCardTypeIndex = (appState.activeCardTypeIndex - 1 + totalCards) % totalCards;
      renderCardByTypeIndex(appState.activeCardTypeIndex);
    });
  }

  if (btnNextCard) {
    btnNextCard.addEventListener("click", () => {
      const totalCards = 7;
      appState.activeCardTypeIndex = (appState.activeCardTypeIndex + 1) % totalCards;
      renderCardByTypeIndex(appState.activeCardTypeIndex);
    });
  }

  // ------------------------------------------------------------------------
  // 8. 3D Card Flip Mechanics
  // ------------------------------------------------------------------------
  function toggleCardFlip() {
    interactiveCard.classList.toggle("is-flipped");
    const isNowFlipped = interactiveCard.classList.contains("is-flipped");
    interactiveCard.dataset.flipped = isNowFlipped ? "true" : "false";
  }

  // Flip on button click
  if (btnFlipCard) {
    btnFlipCard.addEventListener("click", () => {
      toggleCardFlip();
    });
  }

  // Flip on card body click
  if (interactiveCard) {
    interactiveCard.addEventListener("click", () => {
      toggleCardFlip();
    });

    // Keyboard support on card
    interactiveCard.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleCardFlip();
      }
    });
  }

  // Back Navigation from Card Arena
  if (btnBackToDeck) {
    btnBackToDeck.addEventListener("click", () => {
      navigateToScreen(screens.deck);
    });
  }

  if (btnCrumbDeck) {
    btnCrumbDeck.addEventListener("click", () => {
      navigateToScreen(screens.deck);
    });
  }
});
