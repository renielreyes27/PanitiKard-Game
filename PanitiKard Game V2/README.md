# PanitiKard V2

PanitiKard V2 is a standalone, browser-based educational card game for Filipino literature (Panitikan) built using standard web technologies.

---

## 📁 Project Structure

```text
PanitiKard Game V2/
├── index.html              # Main HTML entry point (Setup, Topic Deck, and Card Arena screens)
├── README.md               # Project guide, features, and development documentation
├── css/
│   └── style.css           # Design tokens, 3D card flip styles, collectible deck aesthetics, responsive layout
├── js/
│   ├── cards-data.js       # Curated Baitang 10 Filipino literature data (7 card types for both decks)
│   └── main.js             # Vanilla JS: Multi-screen navigation, validation, 3D card flip, and tab switcher
└── assets/
    ├── images/             # Card artwork, backgrounds, and visual illustrations
    ├── icons/              # UI icons, badges, and symbols
    └── audio/              # Sound effects and game audio
```

---

## 🛠️ Technology Stack

- **HTML5**: Semantic layout with accessibility attributes (`role="radiogroup"`, `role="radio"`, `role="tablist"`, `role="tab"`, `aria-checked`, `aria-selected`, `aria-live`).
- **CSS3**: Viewport-optimized 3D transform animations (`perspective: 1400px; transform-style: preserve-3d; rotateY(180deg)`), collectible card frame design, Google Fonts (`Fraunces` & `Plus Jakarta Sans`), custom theme tokens, and mobile-first responsive layout.
- **JavaScript (ES6+)**: Pure vanilla DOM manipulation, multi-screen state controller, keyboard accessible 3D flip interaction, and card type switching. Zero third-party packages, zero build dependencies.

---

## 🎮 Features by Phase

### Phase 1 & 2.5: Streamlined Student Welcome & Setup
- **Header & Branding**: Title *PanitiKard V2*, tagline *Digital na Pagkatutong Pampanitikan*, and live status indicator (*Handa na*).
- **Focused Welcome Screen (`#setup-screen`)**:
  - Focuses cleanly on student profile entry without redundant topic picking.
  - Interactive *PanitiKard Pass* preview badge.
  - Centered input with real-time validation and Filipino feedback alert.
  - Direct transition to Topic Deck Selection upon entering the student name.

### Phase 2: Topic Deck Selection (`#deck-screen`)
- **Player Profile Strip**: Displays the active student's name with an instant *"✏️ Palitan ang Pangalan"* edit shortcut.
- **Two Collectible Decks**:
  1. ✍️ **Mga Elemento ng Akda** (Banghay, Tauhan, Tagpuan, Tunggalian &bull; Crimson theme)
  2. 💡 **Pagpapakahulugan sa Pahayag** (Pahiwatig, Tayutay, Mensahe, Diwa &bull; Ocean Sapphire theme)
- **Deck Preview Chips**: Bilingual chip indicators for all 7 card types.
- **Working Back Navigation**: Easily returns to the Setup screen with student information preserved.

### Phase 2.5: Card Arena & 3D Flip Card Optimization (`#card-screen`)
- **Viewport Optimization**:
  - Playing card height reduced to fluid `clamp(470px, 58vh, 530px)` and width `540px`, eliminating vertical page overflow on laptops and mobile devices.
- **$2 \times 2$ Options Grid**:
  - Multiple-choice options display in a compact $2 \times 2$ grid on desktop ($>768\text{px}$) and seamlessly collapse to a clean single column on mobile.
- **Direct Flip Controls**:
  - On-card interactive pill (*"🔄 I-tap upang Baligtarin"* / *"🔄 I-tap upang Bumalik sa Harap"*).
  - Whole-card click and keyboard (`Enter` / `Space`) toggling.
  - Floating pill toolbar immediately below the card: `[ ← Nakaraan ] [ 🔄 I-flip ang Kard ] [ Susunod → ]`.
- **Enhanced Back-Face Readability**:
  - High-contrast answer banner with checkmark badge.
  - Dedicated *"📚 Pampanitikang Paliwanag"* plaque.
  - Dynamic *"🔑 Mga Susing Kaisipan"* / *"✨ Alam Mo Ba?"* information box.
- **Bilingual Card Type Tabs**:
  - Prominent Filipino labels with secondary English subtitles:
    - `❓ Tanong` *(Question)*
    - `📜 Pahayag` *(Statement)*
    - `✏️ Pagwawasto` *(Correction)*
    - `⭐ Bonus` *(Bonus Kard)*
    - `🔄 Baligtaran` *(Reverse)*
    - `💡 Gabay` *(Help)*
    - `⚔️ Hamon` *(Challenge)*
  - Horizontal scrollbar with thin styling for touch devices.

### Phase 1 Content Migration: Authentic V1 Curriculum Integration
- **Source of Truth**: `PanitiKard Game V1/index.html` (Lines 722–749).
- **14 Authenticated Questions**: Exactly 7 cards per topic deck migrated with 100% identical wording:
  - **Deck 1: Pagsusuri ng Elemento ng Akda**
    - Competency: *"Nasusuri ang mga elemento at mahahalagang kaisipan ng akdang pampanitikan."*
    - Cards: Question (Tunggalian), Statement (Tagpuan), Correction (Tema), Bonus (Banghay - 2 pts), Reverse (Pagbabalik-aral - 0 pts), Help (Pananaw - may hint), Challenge (Tauhan - 30s).
  - **Deck 2: Pagpapakahulugan sa Pahayag**
    - Competency: *"Naipaliliwanag ang pahiwatig at mensahe ng akdang pampanitikan."*
    - Cards: Question (Pahiwatig), Statement (Mensahe), Correction (Pahiwatig), Bonus (Mensahe - 2 pts), Reverse (Pagbabalik-aral - 0 pts), Help (Konteksto - may hint), Challenge (Tema - 30s).
- **Preserved Rules & Schema**:
  - Original scoring weights preserved: Bonus = 2 points, Reverse = 0 points (unscored review), Challenge = 30-second time limit, others = 1 point.
  - Keyword arrays (`terms: [['group1'], ['group2']]`) preserved for open-ended validation.
  - Explicit markings for missing V1 schemas (`choices: null`, `didYouKnow: null`) without inventing fake or AI-generated filler.
- **Renderer Compatibility**:
  - `main.js` and `style.css` support both Multiple Choice (2x2 grid) and Open Response presentation with hint/timer badges and back-face keyword badges.

---

## ⚠️ Current Scope & Remaining Unfinished Items

The project maintains strict boundaries for Phase 2.5:
- **No scoring or answer evaluation**: Option pills are interactive previews and do not deduct or add points yet.
- **No timers or automated rounds**: Students can browse and flip cards at their own pace.
- **No database or Canva SDK**: Kept strictly as a standalone client-side browser application.
- **Future Phase 3**: Implementation of active gameplay mode (scoring, score counter, streak bonuses, answer validation, and final Results/Review screen).

---

## 🚀 How to Run

1. Open `index.html` directly in any modern web browser (Chrome, Edge, Firefox, Safari).
2. Or run a lightweight local server:
   ```bash
   python -m http.server 8000
   ```
   Navigate to `http://localhost:8000` in your browser.
