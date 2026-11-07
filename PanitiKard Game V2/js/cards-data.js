/**
 * ==========================================================================
 * PanitiKard V2 - Educational Card Data (Migrated from V1 Source of Truth)
 * ==========================================================================
 * 
 * Source: E:\Program Files\PanitiKard\PanitiKard Game V1\index.html (Lines 722-749)
 * 
 * Original Curriculum Competencies:
 * 1. Pagsusuri ng Elemento ng Akda (elements):
 *    "Nasusuri ang mga elemento at mahahalagang kaisipan ng akdang pampanitikan."
 * 2. Pagpapakahulugan sa Pahayag (meaning):
 *    "Naipaliliwanag ang pahiwatig at mensahe ng akdang pampanitikan."
 * 
 * Original Card Types & Scoring Rules:
 * - Question: 1 pt (Multiple Choice A-D)
 * - Statement: 1 pt (Open text, keyword matching via terms)
 * - Correction: 1 pt (Open text, error correction via terms)
 * - Bonus: 2 pts (Double score for foundational concepts)
 * - Reverse: 0 pts (Concept reinforcement, unscored review)
 * - Help: 1 pt (Features hint reveal)
 * - Challenge: 1 pt (30-second timed challenge)
 * 
 * All 14 original questions, prompts, choices, answers, terms, hints, 
 * explanations, and tags are preserved with 100% exact wording.
 */

const PANITIKARD_CARD_TYPES = {
  question: { 
    id: "question", 
    v1Type: "Question",
    label: "Tanong", 
    subLabel: "Question", 
    icon: "❓", 
    tagClass: "type-question", 
    color: "#2563eb",
    defaultPoints: 1,
    rule: "Maramihang Pagpipilian (Multiple Choice A-D). 1 punto."
  },
  statement: { 
    id: "statement", 
    v1Type: "Statement",
    label: "Pahayag", 
    subLabel: "Statement", 
    icon: "📜", 
    tagClass: "type-statement", 
    color: "#d97706",
    defaultPoints: 1,
    rule: "Pasulat na Pagpapaliwanag. Sinusuri gamit ang mga susing kaisipan (terms). 1 punto."
  },
  correction: { 
    id: "correction", 
    v1Type: "Correction",
    label: "Pagwawasto", 
    subLabel: "Correction", 
    icon: "✏️", 
    tagClass: "type-correction", 
    color: "#059669",
    defaultPoints: 1,
    rule: "Pagwawasto ng maling pahayag. Sinusuri gamit ang mga susing salita. 1 punto."
  },
  bonus: { 
    id: "bonus", 
    v1Type: "Bonus",
    label: "Bonus Kard", 
    subLabel: "Bonus", 
    icon: "⭐", 
    tagClass: "type-bonus", 
    color: "#ca8a04",
    defaultPoints: 2,
    rule: "Espesyal na kard na may dobleng puntos (2 puntos)."
  },
  reverse: { 
    id: "reverse", 
    v1Type: "Reverse",
    label: "Baligtaran", 
    subLabel: "Reverse", 
    icon: "🔄", 
    tagClass: "type-reverse", 
    color: "#7c3aed",
    defaultPoints: 0,
    rule: "Pagbabalik-aral. Walang hiwalay na puntos (0 puntos) at hindi isinasama sa kabuuang marka."
  },
  help: { 
    id: "help", 
    v1Type: "Help",
    label: "Gabay", 
    subLabel: "Help", 
    icon: "💡", 
    tagClass: "type-help", 
    color: "#0891b2",
    defaultPoints: 1,
    rule: "Nagtataglay ng pahiwatig (hint) upang tulungan ang mag-aaral. 1 punto."
  },
  challenge: { 
    id: "challenge", 
    v1Type: "Challenge",
    label: "Hamon", 
    subLabel: "Challenge", 
    icon: "⚔️", 
    tagClass: "type-challenge", 
    color: "#dc2626",
    defaultPoints: 1,
    timeLimitSeconds: 30,
    rule: "Mabilisang hamon sa loob ng 30 segundo. 1 punto."
  }
};

const PANITIKARD_DECKS = {
  elements: {
    id: "elements",
    title: "Pagsusuri ng Elemento ng Akda",
    badge: "Elemento",
    themeClass: "deck-elements",
    icon: "✍️",
    accentColor: "#b91c1c",
    cardCount: 7,
    competency: "Nasusuri ang mga elemento at mahahalagang kaisipan ng akdang pampanitikan.",
    description: "Suriin ang banghay, tauhan, tagpuan, at tunggalian sa mga akdang pampanitikan.",
    subtopics: ["Tunggalian", "Tagpuan", "Tema", "Banghay", "Pagbabalik-aral", "Pananaw", "Tauhan"],
    cards: [
      {
        id: "elem-question",
        type: "question",
        v1Type: "Question",
        number: "01",
        tag: "Tunggalian",
        title: "Pagsusuri ng Elemento: Tunggalian",
        prompt: "Alin ang tumutukoy sa pangunahing tunggalian sa isang akda?",
        choices: [
          "Tagpuan ng mga tauhan",
          "Suliraning kinakaharap ng tauhan",
          "Pangalan ng may-akda",
          "Haba ng kabanata"
        ],
        options: [
          { key: "A", text: "Tagpuan ng mga tauhan" },
          { key: "B", text: "Suliraning kinakaharap ng tauhan" },
          { key: "C", text: "Pangalan ng may-akda" },
          { key: "D", text: "Haba ng kabanata" }
        ],
        answer: "B",
        terms: null,
        hint: null,
        timeLimit: null,
        points: 1,
        explanation: "Ang tunggalian ay labanan ng magkasalungat na puwersa na nagtutulak sa banghay.",
        didYouKnow: null // Wala sa V1 schema; hindi nag-iimbento ng pekeng trivia
      },
      {
        id: "elem-statement",
        type: "statement",
        v1Type: "Statement",
        number: "02",
        tag: "Tagpuan",
        title: "Pagsusuri ng Elemento: Tagpuan",
        prompt: "Ipaliwanag kung paano nakatutulong ang tagpuan sa pag-unawa sa akda.",
        choices: null, // Wala sa V1; open-ended written format sa V1
        options: [],
        answer: "Nagbibigay ang tagpuan ng konteksto sa kilos at damdamin ng tauhan.",
        terms: [
          ["konteksto", "kaligiran", "batayan"],
          ["tauhan", "karakter"]
        ],
        hint: null,
        timeLimit: null,
        points: 1,
        explanation: "Mahalaga ang panahon at lugar sa pagbibigay-kahulugan sa mga pangyayari.",
        didYouKnow: null
      },
      {
        id: "elem-correction",
        type: "correction",
        v1Type: "Correction",
        number: "03",
        tag: "Tema",
        title: "Pagsusuri ng Elemento: Tema",
        prompt: "Iwasto ang pahayag: “Walang kinalaman ang tema sa mensahe ng akda.”",
        choices: null,
        options: [],
        answer: "Magkaugnay ang tema at mensahe ng akda.",
        terms: [
          ["tema", "paksa"],
          ["mensahe", "aral", "diwa"]
        ],
        hint: null,
        timeLimit: null,
        points: 1,
        explanation: "Ang tema ang sentral na kaisipang kaugnay ng nais ipabatid ng akda.",
        didYouKnow: null
      },
      {
        id: "elem-bonus",
        type: "bonus",
        v1Type: "Bonus",
        number: "04",
        tag: "Banghay",
        title: "Pagsusuri ng Elemento: Banghay",
        prompt: "Ano ang tawag sa pagkakasunod-sunod ng mga pangyayari sa kuwento?",
        choices: null,
        options: [],
        answer: "Banghay",
        terms: [
          ["banghay", "balangkas"]
        ],
        hint: null,
        timeLimit: null,
        points: 2, // V1 Rule: Bonus Card = 2 puntos
        explanation: "Ang banghay ang organisadong daloy ng mga pangyayari.",
        didYouKnow: null
      },
      {
        id: "elem-reverse",
        type: "reverse",
        v1Type: "Reverse",
        number: "05",
        tag: "Pagbabalik-aral",
        title: "Pagsusuri ng Elemento: Pagbabalik-aral",
        prompt: "Pagbabalik-aral: Ano ang tawag sa pagkakasunod-sunod ng mga pangyayari sa kuwento?",
        choices: null,
        options: [],
        answer: "Banghay",
        terms: [
          ["banghay", "balangkas"]
        ],
        hint: null,
        timeLimit: null,
        points: 0, // V1 Rule: Reverse Card = 0 puntos (unscored review)
        explanation: "Ang pag-uulit ng konsepto ay nagpapatibay ng natutuhan. Walang hiwalay na puntos ang kard na ito.",
        didYouKnow: null
      },
      {
        id: "elem-help",
        type: "help",
        v1Type: "Help",
        number: "06",
        tag: "Pananaw",
        title: "Pagsusuri ng Elemento: Pananaw",
        prompt: "Ano ang tawag sa perspektibang ginagamit sa pagsasalaysay?",
        choices: null,
        options: [],
        answer: "Pananaw",
        terms: [
          ["pananaw", "perspektiba"]
        ],
        hint: "Isipin kung sino ang nagkukuwento.", // V1 Hint
        timeLimit: null,
        points: 1,
        explanation: "Ang pananaw ay posisyon o perspektiba ng nagsasalaysay.",
        didYouKnow: null
      },
      {
        id: "elem-challenge",
        type: "challenge",
        v1Type: "Challenge",
        number: "07",
        tag: "Tauhan",
        title: "Pagsusuri ng Elemento: Tauhan",
        prompt: "Sa loob ng 30 segundo: ano ang tawag sa mga gumaganap sa kuwento?",
        choices: null,
        options: [],
        answer: "Tauhan",
        terms: [
          ["tauhan", "karakter", "persona"]
        ],
        hint: null,
        timeLimit: 30, // V1 Rule: 30s Countdown Timer
        points: 1,
        explanation: "Ang tauhan ang mga persona o karakter na kumikilos sa akda.",
        didYouKnow: null
      }
    ]
  },

  meaning: {
    id: "meaning",
    title: "Pagpapakahulugan sa Pahayag",
    badge: "Kahulugan",
    themeClass: "deck-meaning",
    icon: "💡",
    accentColor: "#0369a1",
    cardCount: 7,
    competency: "Naipaliliwanag ang pahiwatig at mensahe ng akdang pampanitikan.",
    description: "Tuklasin ang pahiwatig, tayutay, at malalim na diwa ng bawat pahayag pampanitikan.",
    subtopics: ["Pahiwatig", "Mensahe", "Pagbabalik-aral", "Konteksto", "Tema"],
    cards: [
      {
        id: "mean-question",
        type: "question",
        v1Type: "Question",
        number: "01",
        tag: "Pahiwatig",
        title: "Pagpapakahulugan: Pahiwatig",
        prompt: "Ano ang pahiwatig sa isang akda?",
        choices: [
          "Tiyak na petsa",
          "Bilang ng talata",
          "Di-tuwirang kahulugan",
          "Pangalan ng tagapagsalaysay"
        ],
        options: [
          { key: "A", text: "Tiyak na petsa" },
          { key: "B", text: "Bilang ng talata" },
          { key: "C", text: "Di-tuwirang kahulugan" },
          { key: "D", text: "Pangalan ng tagapagsalaysay" }
        ],
        answer: "C",
        terms: null,
        hint: null,
        timeLimit: null,
        points: 1,
        explanation: "Ang pahiwatig ay kahulugang hindi tuwirang ipinahahayag.",
        didYouKnow: null
      },
      {
        id: "mean-statement",
        type: "statement",
        v1Type: "Statement",
        number: "02",
        tag: "Mensahe",
        title: "Pagpapakahulugan: Mensahe",
        prompt: "Bakit mahalagang suriin ang mensahe ng isang akda?",
        choices: null,
        options: [],
        answer: "Upang maunawaan ang aral at pangunahing kaisipang nais iparating ng akda.",
        terms: [
          ["aral", "mensahe", "diwa"],
          ["kaisipan", "ideya", "kahulugan"]
        ],
        hint: null,
        timeLimit: null,
        points: 1,
        explanation: "Ipinapakita ng pagsusuri ang ugnayan ng mga pangyayari at diwa ng akda.",
        didYouKnow: null
      },
      {
        id: "mean-correction",
        type: "correction",
        v1Type: "Correction",
        number: "03",
        tag: "Pahiwatig",
        title: "Pagpapakahulugan: Pahiwatig",
        prompt: "Iwasto ang pahayag: “Ang pahiwatig ay laging tuwirang sinasabi.”",
        choices: null,
        options: [],
        answer: "Ang pahiwatig ay di-tuwirang ipinahahayag.",
        terms: [
          ["pahiwatig"],
          ["di tuwiran", "hindi tuwiran", "di lantad"]
        ],
        hint: null,
        timeLimit: null,
        points: 1,
        explanation: "Binubuo ang kahulugan ng pahiwatig mula sa konteksto.",
        didYouKnow: null
      },
      {
        id: "mean-bonus",
        type: "bonus",
        v1Type: "Bonus",
        number: "04",
        tag: "Mensahe",
        title: "Pagpapakahulugan: Mensahe",
        prompt: "Ano ang tawag sa pangunahing aral na nais iparating ng akda?",
        choices: null,
        options: [],
        answer: "Mensahe",
        terms: [
          ["mensahe", "aral", "diwa"]
        ],
        hint: null,
        timeLimit: null,
        points: 2, // V1 Rule: Bonus Card = 2 puntos
        explanation: "Ang mensahe ang mahalagang kaisipang nais ipabatid.",
        didYouKnow: null
      },
      {
        id: "mean-reverse",
        type: "reverse",
        v1Type: "Reverse",
        number: "05",
        tag: "Pagbabalik-aral",
        title: "Pagpapakahulugan: Pagbabalik-aral",
        prompt: "Pagbabalik-aral: Ano ang pahiwatig?",
        choices: null,
        options: [],
        answer: "Di-tuwirang kahulugan",
        terms: [
          ["di tuwiran", "hindi tuwiran", "pahiwatig"]
        ],
        hint: null,
        timeLimit: null,
        points: 0, // V1 Rule: Reverse Card = 0 puntos (unscored review)
        explanation: "Mahalagang balikan ang di-tuwirang kahulugan. Walang hiwalay na puntos ang kard na ito.",
        didYouKnow: null
      },
      {
        id: "mean-help",
        type: "help",
        v1Type: "Help",
        number: "06",
        tag: "Konteksto",
        title: "Pagpapakahulugan: Konteksto",
        prompt: "Ano ang ginagamit upang maunawaan ang kahulugan ng isang pahayag batay sa paligid nitong mga salita?",
        choices: null,
        options: [],
        answer: "Konteksto",
        terms: [
          ["konteksto", "kaligiran"]
        ],
        hint: "Isaalang-alang ang mga salitang nakapaligid sa pahayag.", // V1 Hint
        timeLimit: null,
        points: 1,
        explanation: "Ang konteksto ay tumutulong sa wastong pagpapakahulugan.",
        didYouKnow: null
      },
      {
        id: "mean-challenge",
        type: "challenge",
        v1Type: "Challenge",
        number: "07",
        tag: "Tema",
        title: "Pagpapakahulugan: Tema",
        prompt: "Sa loob ng 30 segundo: ano ang tawag sa sentral na kaisipan ng isang akda?",
        choices: null,
        options: [],
        answer: "Tema",
        terms: [
          ["tema", "paksa"]
        ],
        hint: null,
        timeLimit: 30, // V1 Rule: 30s Countdown Timer
        points: 1,
        explanation: "Ang tema ang sentral na kaisipang pinag-uugnay ng akda.",
        didYouKnow: null
      }
    ]
  }
};
