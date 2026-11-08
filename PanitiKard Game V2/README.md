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

### Phase 3: Core Gameplay Mechanics Implementation
- **Interactive Multiple Choice Grading**:
  - Single-choice selection with visual confirmation.
  - Immediate feedback indicating correct (`✓`) or incorrect (`✗`) selections.
  - Automatically highlights the correct answer on error for formative learning.
  - 1 point awarded for correct answers.
- **Open-Ended Response Architecture**:
  - Textarea input for Statement, Correction, Bonus, Reverse, Help, and Challenge cards.
  - Clean submission flow structured for future Gemini AI evaluation API integration.
  - Does not rely on rigid keyword matching as a final grading gate.
  - Hint toggle support for Help cards (`💡 Ipakita ang Pahiwatig`).
- **Card Progression & Flip Security**:
  - Cards cannot be flipped before an answer is submitted, preventing premature answer exposure.
  - Sequential progression locks: students must submit an answer to unlock the next card and review the back.
  - Duplicate submissions are prevented once an answer is logged.
  - Smooth auto-flip upon submission reveals the official answer and literary explanation.
- **Challenge Card 30-Second Countdown**:
  - Active real-time countdown timer with visual warning pulse at $\le 10$ seconds.
  - Automatically submits and ends attempt when time runs out.
- **Curriculum Scoring Rules (7 Points Total Max)**:
  - Question: 1 pt
  - Statement: 1 pt
  - Correction: 1 pt
  - Bonus: 2 pts (Double score)
  - Reverse: 0 pts (Unscored review card)
  - Help: 1 pt
  - Challenge: 1 pt
- **Comprehensive Results Screen (`#result-screen`)**:
  - Total score display (out of 7 points) and mastery percentage.
  - Personalized student greeting and qualitative feedback badge.
  - 7-Card detailed review list displaying student answer, correct answer, points earned, literary explanation, and key conceptual terms.
  - "Subukan Muli ang Deck" (Retry) and "Pumili ng Ibang Topic Deck" actions.

### Phase 1 Frontend Update: Welcome Screen & Student Setup (Matches Official Design)
- **Screen 1 – Welcome Screen (`#welcome-screen`)**:
  - Dark forest green header (`#193822`) with circular hamburger menu button and cursive script logo (`Pacifico`).
  - Uppercase `WELCOME TO THE GAME` lead with dark green 4-point star `✦`.
  - Display serif heading: `Welcome to PanitiKard` (`Fraunces`).
  - Warm handwritten subtitle & introduction (`Caveat`):
    - *"Tuklasin ang saya ng pagkatuto sa pamamagitan ng laro!"*
    - *"Ang PanitiKard ay isang interactive card game na naglalayong paunlarin ang kaalaman at kasanayan ng mga mag-aaral sa wikang Filipino sa isang masaya at makabuluhang paraan."*
  - Interactive Role Login Buttons with 3D offset drop shadows (`#b7cbb8` fill, `6px 6px 0px #193822`):
    - `STUDENT LOGIN` -> Direct transition to Student Setup.
    - `TEACHER/ ADMIN LOGIN` -> Informative modal explaining teacher portal integration with option to test as student.
  - Bottom banner with sage green pill background and dark forest green footer:
    - *"Handa ka na bang maglaro at matuto?"*
    - *"Piliin ang iyong role at simulan ang iyong PanitiKard journey!"*
- **Screen 2 – Student Setup / Game Introduction (`#setup-screen`)**:
  - Top Card: White card with `Baitang 10 • Filipino` dark pill, 4-point star `✦`, `Matuto sa bawat kard.` heading, instructions, and sage green input field with gold border for student name entry.
  - Bottom Card: White card with `Handa ka na bang maglaro?` heading and game instructions.
  - Header `◀ Back` navigation returning to the Welcome Screen.

### Phase 4 Step 1 & Step 3: Backend & Supabase Service Layer Preparation
- **Server Architecture**: Node.js v24 + Express backend in isolated `server/` directory.
- **Supabase SDK Integration**: `@supabase/supabase-js` installed in `server/`.
- **Centralized Service (`server/src/services/supabase.js`)**:
  - Centralized Supabase client initialization via environment variables.
  - Graceful standalone development fallback when credentials are not yet configured.
  - Server-side credential isolation (service role key is never exposed to client).
  - Status helper function exposed in `GET /health`.
- **Security & Git Ignore**: `.env` strictly ignored by Git; `.env.example` provided with non-sensitive placeholders.

### Phase 4 implementation in this workspace (migration not applied)

- `server/supabase/migrations/202611080001_phase4_catalog_and_gameplay.sql` defines profiles, the four stable topics, separate card categories, versioned questions/choices, private evaluation rubrics, game sessions, student answers, indexes, RLS policies, and server/database-side scoring functions. Question versions are snapshotted at session start so editing or archiving a question does not change an in-progress or historical attempt.
- The migration seeds the four topic rows and seven card categories only. `npm run seed:catalog` imports the current 14 card questions and 30 quiz questions as immutable versions; it requires a backend-only service-role key and skips unchanged content.
- Express routes are mounted under `/api/v1`: public `GET /topics` and `GET /topics/:topicCode/questions`; authenticated session `POST /sessions`, `GET /sessions/:id`, `POST /sessions/:id/answers`, and `POST /sessions/:id/finish`; and teacher/admin topic/question create, version, publish, and archive routes under `/admin`.
- Student answer requests send only the response. The database scoring RPC loads the private answer key/rubric, validates Reverse Round eligibility and its three-attempt cap, and stores the evaluated answer and score atomically. The service-role key is not used by student request handlers.
- The browser API client is opt-in. Set the `panitikard-api-base-url` meta value to the backend `/api/v1` URL and provide a user Supabase access token through `window.PANITIKARD_GET_ACCESS_TOKEN`; without these settings, the existing standalone local gameplay remains available. Never put the service-role key in the browser.
- From `server/`, run `npm test` for API/service tests and `npm run check:supabase` for a read-only `topics` query. The Supabase migration must be reviewed and explicitly applied by an authorized operator before seeding or live use. No production migration is applied by these commands.

---

## ⚠️ Current Scope & Remaining Items

- Phase 4 schema and API code are implemented locally, but the Supabase migration has **not** been applied. Connectivity currently reaches the Supabase REST endpoint but returns `PGRST205` for the not-yet-created `topics` table.
- The current local Supabase config has an anon key but no service-role key. Public reads and user-scoped API access can be configured after migration; catalog seeding and privileged operations remain unavailable until the operator configures a backend-only service-role key.
- Teacher/Admin UI, Supabase Auth UI/token provisioning, database migration application, and catalog seeding are not completed here.
- **Phase 5** Gemini evaluation is not connected; current grading uses deterministic question-specific rubrics.

---

## 🚀 How to Run

1. Open `index.html` directly in any modern web browser (Chrome, Edge, Firefox, Safari).
2. Or run a lightweight local server:
   ```bash
   python -m http.server 8000
   ```
   Navigate to `http://localhost:8000` in your browser.
