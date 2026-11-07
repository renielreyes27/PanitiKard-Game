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
  },

  alamat: {
    id: "alamat",
    title: "Alamat",
    badge: "Alamat",
    themeClass: "deck-alamat",
    icon: "📜",
    accentColor: "#F4F56B",
    centerColor: "#F5EBCB",
    borderColor: "#294629",
    cornerNum: "01✦",
    cornerDecor: "✦10",
    cardCount: 15,
    questionCount: 15,
    competency: "Nauunawaan ang kahulugan, elemento, uri, at pampanitikang aral ng mga alamat.",
    description: "Pagsusuri sa pinagmulan, elemento (tauhan, tagpuan, banghay), uri, at pampanitikang aral ng mga alamat.",
    subtopics: ["Kahulugan", "Elemento", "Uri", "Aral", "Pagsusuri"],
    questions: [
      {
        id: "alamat-q1",
        number: 1,
        category: "Kahulugan",
        questionType: "multiple_choice",
        difficulty: "easy",
        points: 1,
        question: "Ano ang pangunahing layunin ng alamat?",
        choices: [
          { key: "A", text: "Magbigay ng balita" },
          { key: "B", text: "Ipaliwanag ang pinagmulan ng isang bagay, lugar, o pangyayari" },
          { key: "C", text: "Maglahad ng talambuhay" },
          { key: "D", text: "Magturo ng agham" }
        ],
        answer: "B",
        acceptedAnswers: ["B", "b", "Ipaliwanag ang pinagmulan ng isang bagay, lugar, o pangyayari"],
        explanation: "Ang alamat ay pangunahing naglalayong ipaliwanag ang pinagmulan ng mga bagay, lugar, o pangyayari sa pamamagitan ng kapana-panabik na salaysay."
      },
      {
        id: "alamat-q2",
        number: 2,
        category: "Elemento",
        questionType: "identification",
        difficulty: "easy",
        points: 1,
        question: "Ano ang tawag sa mga gumaganap sa isang alamat?",
        choices: null,
        answer: "Tauhan",
        acceptedAnswers: ["Tauhan", "tauhan", "mga tauhan"],
        explanation: "Ang tauhan ang mga persona o karakter na gumaganap at nagbibigay-buhay sa mga pangyayari sa kuwento."
      },
      {
        id: "alamat-q3",
        number: 3,
        category: "Uri",
        questionType: "true_false",
        difficulty: "easy",
        points: 1,
        question: "Ang alamat ng pinagmulan ng isang bundok ay kabilang sa mga alamat na nagpapaliwanag ng pinagmulan ng isang lugar.",
        choices: [
          { key: "True", text: "Tama (True)" },
          { key: "False", text: "Mali (False)" }
        ],
        answer: "True",
        acceptedAnswers: ["True", "true", "tama", "Tama"],
        explanation: "Ang mga bundok, ilog, at bayan ay mga heograpikal na pook na kabilang sa alamat ng lugar (halimbawa: Alamat ng Bulkang Mayon)."
      },
      {
        id: "alamat-q4",
        number: 4,
        category: "Kahulugan",
        questionType: "fill_in_blank",
        difficulty: "easy",
        points: 1,
        question: "Ang __________ ay isang uri ng panitikang pasalaysay na nagpapaliwanag sa pinagmulan ng mga bagay, lugar, halaman, hayop, o pangyayari.",
        choices: null,
        answer: "Alamat",
        acceptedAnswers: ["Alamat", "alamat"],
        explanation: "Ang alamat ay tradisyonal na panitikang tuluyan na nagpapaliwanag sa pinagmulan ng iba't ibang bagay sa ating paligid."
      },
      {
        id: "alamat-q5",
        number: 5,
        category: "Elemento",
        questionType: "multiple_choice",
        difficulty: "average",
        points: 2,
        question: "Alin sa mga sumusunod ang tumutukoy sa pagkakasunod-sunod ng mga pangyayari sa alamat?",
        choices: [
          { key: "A", text: "Tagpuan" },
          { key: "B", text: "Tauhan" },
          { key: "C", text: "Banghay" },
          { key: "D", text: "Aral" }
        ],
        answer: "C",
        acceptedAnswers: ["C", "c", "Banghay"],
        explanation: "Ang banghay ang maayos at lohikal na pagkakasunod-sunod ng mga pangyayari mula simula hanggang wakas."
      },
      {
        id: "alamat-q6",
        number: 6,
        category: "Aral",
        questionType: "situational",
        difficulty: "average",
        points: 2,
        question: "Isang bata ang naging sakim at ayaw magbahagi ng kaniyang pagkain. Sa huli, nawalan siya ng mga kaibigan. Anong aral ang ipinapakita nito?",
        choices: null,
        answer: "Pagbabahagi",
        acceptedAnswers: ["Pagbabahagi", "pagbabahagi", "pagiging mapagbahagi", "pagbahagi"],
        explanation: "Ipinapakita sa sitwasyon ang kahalagahan ng pagbabahagi at pagiging bukas-palad sa kapwa."
      },
      {
        id: "alamat-q7",
        number: 7,
        category: "Uri",
        questionType: "multiple_choice",
        difficulty: "easy",
        points: 1,
        question: "Anong uri ng alamat ang nagpapaliwanag kung paano nagsimula ang isang halaman?",
        choices: [
          { key: "A", text: "Alamat ng lugar" },
          { key: "B", text: "Alamat ng halaman" },
          { key: "C", text: "Alamat ng hayop" },
          { key: "D", text: "Alamat ng bagay" }
        ],
        answer: "B",
        acceptedAnswers: ["B", "b", "Alamat ng halaman"],
        explanation: "Ang alamat ng halaman ay nakatuon sa pinagmulan ng mga puno, bulaklak, o prutas tulad ng pinya o mangga."
      },
      {
        id: "alamat-q8",
        number: 8,
        category: "Pagsusuri",
        questionType: "identification",
        difficulty: "average",
        points: 2,
        question: "Ano ang tawag sa pangunahing mensahe o kaisipang nais ipabatid ng isang akda?",
        choices: null,
        answer: "Tema",
        acceptedAnswers: ["Tema", "tema", "paksa", "Paksa"],
        explanation: "Ang tema ang sentral na kaisipan o diwa na nais ituro o ibahagi ng may-akda sa mambabasa."
      },
      {
        id: "alamat-q9",
        number: 9,
        category: "Elemento",
        questionType: "true_false",
        difficulty: "easy",
        points: 1,
        question: "Ang tagpuan ay tumutukoy sa lugar at panahon kung kailan naganap ang mga pangyayari sa alamat.",
        choices: [
          { key: "True", text: "Tama (True)" },
          { key: "False", text: "Mali (False)" }
        ],
        answer: "True",
        acceptedAnswers: ["True", "true", "tama", "Tama"],
        explanation: "Ang tagpuan ay sumasaklaw sa lokasyon, kapaligiran, at panahong pinangyarihan ng salaysay."
      },
      {
        id: "alamat-q10",
        number: 10,
        category: "Aral",
        questionType: "multiple_choice",
        difficulty: "average",
        points: 2,
        question: "Alin ang pinakamahalagang aral na maaaring makuha sa alamat na nagpapakita ng pagsasakripisyo ng isang anak para sa kaniyang pamilya?",
        choices: [
          { key: "A", text: "Pagiging mayabang" },
          { key: "B", text: "Pagiging sakim" },
          { key: "C", text: "Pagmamahal sa pamilya" },
          { key: "D", text: "Pagiging makasarili" }
        ],
        answer: "C",
        acceptedAnswers: ["C", "c", "Pagmamahal sa pamilya"],
        explanation: "Ang wagas na pagsasakripisyo ay patunay ng dalisay na pagmamahal at pagmamalasakit sa kapakanan ng pamilya."
      },
      {
        id: "alamat-q11",
        number: 11,
        category: "Uri",
        questionType: "situational",
        difficulty: "hard",
        points: 3,
        question: "Nakabasa ka ng kuwentong nagpapaliwanag kung bakit may iba't ibang uri ng ibon. Anong uri ng alamat ang maaaring kumatawan dito?",
        choices: null,
        answer: "Alamat ng hayop",
        acceptedAnswers: ["Alamat ng hayop", "alamat ng hayop"],
        explanation: "Ang mga kuwento hinggil sa mga ibon, isda, o iba pang nilalang ay nauuri bilang alamat ng hayop."
      },
      {
        id: "alamat-q12",
        number: 12,
        category: "Pagsusuri",
        questionType: "fill_in_blank",
        difficulty: "hard",
        points: 3,
        question: "Sa pagsusuri ng alamat, mahalagang alamin ang __________ ng mga kilos at desisyon ng pangunahing tauhan upang maunawaan ang kabuuang kuwento.",
        choices: null,
        answer: "Dahilan",
        acceptedAnswers: ["Dahilan", "dahilan", "kadahilanan", "sanhi"],
        explanation: "Ang motibasyon o dahilan sa likod ng bawat kilos ng tauhan ang nagpapaliwanag sa takbo ng mga pangyayari."
      },
      {
        id: "alamat-q13",
        number: 13,
        category: "Kahulugan",
        questionType: "multiple_choice",
        difficulty: "average",
        points: 2,
        question: "Bakit mahalagang pag-aralan ang mga alamat?",
        choices: [
          { key: "A", text: "Upang makalimutan ang nakaraan" },
          { key: "B", text: "Upang maunawaan ang kultura at paniniwala ng mga ninuno" },
          { key: "C", text: "Upang matutuhan ang mga balita" },
          { key: "D", text: "Upang malaman ang mga makabagong teknolohiya" }
        ],
        answer: "B",
        acceptedAnswers: ["B", "b", "Upang maunawaan ang kultura at paniniwala ng mga ninuno"],
        explanation: "Sinasalamin ng mga alamat ang mayamang kultura, tradisyon, at pilosopiya ng ating mga ninuno."
      },
      {
        id: "alamat-q14",
        number: 14,
        category: "Pagsusuri",
        questionType: "true_false",
        difficulty: "hard",
        points: 3,
        question: "Sa pagsusuri ng alamat, dapat lamang bigyang-pansin ang pamagat at hindi na kailangang unawain ang mga kilos ng tauhan.",
        choices: [
          { key: "True", text: "Tama (True)" },
          { key: "False", text: "Mali (False)" }
        ],
        answer: "False",
        acceptedAnswers: ["False", "false", "mali", "Mali"],
        explanation: "Ang komprehensibong pagsusuri ay nangangailangan ng masusing pagtingin sa kilos, motibo, at transpormasyon ng mga tauhan, hindi lamang sa pamagat."
      },
      {
        id: "alamat-q15",
        number: 15,
        category: "Aral",
        questionType: "situational",
        difficulty: "hard",
        points: 3,
        question: "Isang tauhan ang nagsisi matapos niyang saktan ang damdamin ng kaniyang kaibigan at humingi siya ng tawad. Anong pagpapahalaga ang ipinapakita nito?",
        choices: null,
        answer: "Pagpapakumbaba",
        acceptedAnswers: ["Pagpapakumbaba", "pagpapakumbaba", "pagkumbaba", "pagiging mapagpakumbaba"],
        explanation: "Ang pag-amin sa sariling pagkakamali at paghingi ng tawad ay marangal na katangian ng pagpapakumbaba."
      }
    ]
  },

  "maikling-kwento": {
    id: "maikling-kwento",
    title: "Maikling Kwento",
    badge: "Maikling Kwento",
    themeClass: "deck-maikling-kwento",
    icon: "📖",
    accentColor: "#00663D",
    centerColor: "#D9EFDC",
    borderColor: "#294629",
    cornerNum: "01✦",
    cornerDecor: "✦10",
    cardCount: 15,
    questionCount: 15,
    competency: "Nasusuri ang mga elemento, uri, at bahagi ng banghay sa maikling kuwento.",
    description: "Pagsusuri sa banghay, kasukdulan, tagpuan, tauhan, tema, at aral sa maikling kuwento.",
    subtopics: ["Kahulugan", "Elemento", "Uri", "Bahagi ng Banghay", "Tauhan", "Tagpuan", "Aral", "Pagsusuri"],
    questions: [
      {
        id: "mk-q1",
        number: 1,
        category: "Kahulugan",
        questionType: "multiple_choice",
        difficulty: "easy",
        points: 1,
        question: "Ano ang maikling kuwento?",
        choices: [
          { key: "A", text: "Isang mahabang salaysay tungkol sa kasaysayan" },
          { key: "B", text: "Isang akdang pampanitikan na naglalahad ng isang mahalagang pangyayari sa buhay ng tauhan" },
          { key: "C", text: "Isang tulang may sukat at tugma" },
          { key: "D", text: "Isang tekstong nagbibigay ng balita" }
        ],
        answer: "B",
        acceptedAnswers: ["B", "b", "Isang akdang pampanitikan na naglalahad ng isang mahalagang pangyayari sa buhay ng tauhan"],
        explanation: "Ang maikling kuwento ay maikling kathang pampanitikan na nagsasalaysay ng isang mahalagang pangyayaring kinasasangkutan ng isa o ilang tauhan."
      },
      {
        id: "mk-q2",
        number: 2,
        category: "Elemento",
        questionType: "identification",
        difficulty: "easy",
        points: 1,
        question: "Ano ang tawag sa taong gumaganap sa isang kuwento?",
        choices: null,
        answer: "Tauhan",
        acceptedAnswers: ["Tauhan", "tauhan", "mga tauhan"],
        explanation: "Ang tauhan ang lumilikha at kumikilos sa mga sitwasyon at tunggalian ng akda."
      },
      {
        id: "mk-q3",
        number: 3,
        category: "Katangian",
        questionType: "true_false",
        difficulty: "easy",
        points: 1,
        question: "Ang maikling kuwento ay karaniwang nakatuon sa isang pangunahing pangyayari o suliranin.",
        choices: [
          { key: "True", text: "Tama (True)" },
          { key: "False", text: "Mali (False)" }
        ],
        answer: "True",
        acceptedAnswers: ["True", "true", "tama", "Tama"],
        explanation: "Dahil sa kakintalan o iisang impresyon nito, umiikot ito sa iisang pangunahing suliranin."
      },
      {
        id: "mk-q4",
        number: 4,
        category: "Elemento",
        questionType: "situational",
        difficulty: "easy",
        points: 1,
        question: "Isang kuwento ang naganap sa isang maliit na baryo noong panahon ng tag-ulan. Anong elemento ang inilalarawan nito?",
        choices: null,
        answer: "Tagpuan",
        acceptedAnswers: ["Tagpuan", "tagpuan"],
        explanation: "Ang maliit na baryo (lugar) at tag-ulan (panahon/klima) ay bumubuo sa tagpuan ng kuwento."
      },
      {
        id: "mk-q5",
        number: 5,
        category: "Elemento",
        questionType: "multiple_choice",
        difficulty: "easy",
        points: 1,
        question: "Alin sa mga sumusunod ang HINDI elemento ng maikling kuwento?",
        choices: [
          { key: "A", text: "Tauhan" },
          { key: "B", text: "Tagpuan" },
          { key: "C", text: "Banghay" },
          { key: "D", text: "Sukat at tugma" }
        ],
        answer: "D",
        acceptedAnswers: ["D", "d", "Sukat at tugma"],
        explanation: "Ang sukat at tugma ay mga elemento ng tula, hindi ng tuluyang prosa tulad ng maikling kuwento."
      },
      {
        id: "mk-q6",
        number: 6,
        category: "Elemento",
        questionType: "fill_in_blank",
        difficulty: "average",
        points: 2,
        question: "Ang __________ ay tumutukoy sa pagkakasunod-sunod ng mga pangyayari sa kuwento.",
        choices: null,
        answer: "Banghay",
        acceptedAnswers: ["Banghay", "banghay"],
        explanation: "Ang banghay ang estruktura o balangkas ng mga pangyayari sa isang salaysay."
      },
      {
        id: "mk-q7",
        number: 7,
        category: "Bahagi ng Banghay",
        questionType: "identification",
        difficulty: "average",
        points: 2,
        question: "Ano ang tawag sa pinakamataas na bahagi ng tensiyon o kapanabikan sa kuwento?",
        choices: null,
        answer: "Kasukdulan",
        acceptedAnswers: ["Kasukdulan", "kasukdulan"],
        explanation: "Sa kasukdulan (climax) nararanasan ang pinakamatinding damdamin at doon nagpapasya ang kahihinatnan ng tunggalian."
      },
      {
        id: "mk-q8",
        number: 8,
        category: "Uri",
        questionType: "multiple_choice",
        difficulty: "average",
        points: 2,
        question: "Anong uri ng maikling kuwento ang nagbibigay-diin sa pagbabago o pag-unlad ng pagkatao ng pangunahing tauhan?",
        choices: [
          { key: "A", text: "Kuwento ng tauhan" },
          { key: "B", text: "Kuwento ng katatawanan" },
          { key: "C", text: "Kuwento ng katatakutan" },
          { key: "D", text: "Kuwento ng kababalaghan" }
        ],
        answer: "A",
        acceptedAnswers: ["A", "a", "Kuwento ng tauhan"],
        explanation: "Sa kuwento ng tauhan, nakatutok ang salaysay sa pag-uugali, kilos, at pagbabagong sikolohikal ng karakter."
      },
      {
        id: "mk-q9",
        number: 9,
        category: "Bahagi ng Banghay",
        questionType: "true_false",
        difficulty: "easy",
        points: 1,
        question: "Ang wakas ang bahaging nagpapakita ng resolusyon o kinahinatnan ng suliranin sa kuwento.",
        choices: [
          { key: "True", text: "Tama (True)" },
          { key: "False", text: "Mali (False)" }
        ],
        answer: "True",
        acceptedAnswers: ["True", "true", "tama", "Tama"],
        explanation: "Ang wakas o kakalasan ang nagpapakita ng kinalabasan ng labanan at ang bagong kalagayan ng mga tauhan."
      },
      {
        id: "mk-q10",
        number: 10,
        category: "Bahagi ng Banghay",
        questionType: "situational",
        difficulty: "hard",
        points: 3,
        question: "Sa kuwento, unti-unting nalaman ng pangunahing tauhan ang lihim ng kaniyang pamilya. Anong bahagi ng banghay ang maaaring magpakita ng unti-unting pag-usad ng mga pangyayari patungo sa kasukdulan?",
        choices: null,
        answer: "Pataas na Aksyon",
        acceptedAnswers: ["Pataas na Aksyon", "pataas na aksyon", "pataas na aksiyon", "saglit na kasiglahan"],
        explanation: "Ang pataas na aksyon o saglit na kasiglahan ang nagtutulak sa mga suliranin patungo sa kapana-panabik na kasukdulan."
      },
      {
        id: "mk-q11",
        number: 11,
        category: "Tauhan",
        questionType: "multiple_choice",
        difficulty: "average",
        points: 2,
        question: "Alin ang tumutukoy sa pangunahing tauhan na sentro ng mga pangyayari sa kuwento?",
        choices: [
          { key: "A", text: "Katunggali" },
          { key: "B", text: "Pantulong na tauhan" },
          { key: "C", text: "Protagonista" },
          { key: "D", text: "Tagapagsalaysay" }
        ],
        answer: "C",
        acceptedAnswers: ["C", "c", "Protagonista"],
        explanation: "Ang protagonista ang bida o pangunahing tauhan kung kanino umiikot ang kuwento."
      },
      {
        id: "mk-q12",
        number: 12,
        category: "Elemento",
        questionType: "identification",
        difficulty: "average",
        points: 2,
        question: "Ano ang tawag sa aral o mensaheng nais ipabatid ng kuwento?",
        choices: null,
        answer: "Tema",
        acceptedAnswers: ["Tema", "tema", "paksa", "Paksa"],
        explanation: "Ang tema ang sentral na kaisipan, aral, o mensahe ng akda."
      },
      {
        id: "mk-q13",
        number: 13,
        category: "Uri",
        questionType: "fill_in_blank",
        difficulty: "hard",
        points: 3,
        question: "Ang __________ ay uri ng maikling kuwentong naglalayong magpatawa sa mga mambabasa.",
        choices: null,
        answer: "Katatawanan",
        acceptedAnswers: ["Katatawanan", "katatawanan"],
        explanation: "Ang kuwento ng katatawanan ay sadyang isinulat upang magdulot ng aliw, saya, at tawanan."
      },
      {
        id: "mk-q14",
        number: 14,
        category: "Pagsusuri",
        questionType: "multiple_choice",
        difficulty: "average",
        points: 2,
        question: "Bakit mahalagang suriin ang maikling kuwento?",
        choices: [
          { key: "A", text: "Upang malaman lamang ang haba nito" },
          { key: "B", text: "Upang maunawaan ang mensahe, tauhan, at mga pangyayari" },
          { key: "C", text: "Upang bilangin ang mga salita" },
          { key: "D", text: "Upang malaman ang presyo ng aklat" }
        ],
        answer: "B",
        acceptedAnswers: ["B", "b", "Upang maunawaan ang mensahe, tauhan, at mga pangyayari"],
        explanation: "Ang pagsusuri ay nagpapalalim ng ating pang-unawa sa pahiwatig, istruktura, at kabuluhan ng mga karanasan sa kuwento."
      },
      {
        id: "mk-q15",
        number: 15,
        category: "Aral",
        questionType: "situational",
        difficulty: "hard",
        points: 3,
        question: "Isang tauhan ang nagsinungaling upang makaiwas sa pananagutan, ngunit sa huli ay nawalan siya ng tiwala ng kaniyang mga kaibigan. Anong aral ang maaaring makuha sa kuwento?",
        choices: null,
        answer: "Katapatan",
        acceptedAnswers: ["Katapatan", "katapatan", "pagiging matapat"],
        explanation: "Ang aral ay nagpapatunay na ang katapatan ay pundasyon ng tiwala at mabuting pakikipagkapwa."
      }
    ]
  }
};

// Helper object mapping quizzes specifically
const PANITIKARD_QUIZZES = {
  alamat: PANITIKARD_DECKS.alamat,
  "maikling-kwento": PANITIKARD_DECKS["maikling-kwento"]
};

// Export for Node.js test environment if applicable
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PANITIKARD_CARD_TYPES,
    PANITIKARD_DECKS,
    PANITIKARD_QUIZZES
  };
}
