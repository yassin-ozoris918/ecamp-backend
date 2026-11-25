/**
 * Plain text matching for the support bot. Works without any AI, so the bot still answers common
 * questions when the AI quota is used up. Handles English, Arabic (incl. Egyptian spelling variants)
 * and Arabic written in Latin letters ("el code msh sha8al") reasonably well.
 */

const ARABIC_DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

const STOPWORDS = new Set([
  // English
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'be', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'it', 'its',
  'my', 'me', 'i', 'im', 'you', 'your', 'we', 'do', 'does', 'did', 'can', 'could', 'how', 'what', 'why', 'when',
  'this', 'that', 'with', 'from', 'please', 'pls', 'plz', 'hi', 'hello', 'help', 'have', 'has', 'get', 'got',
  // Arabic / Egyptian
  'في', 'من', 'على', 'علي', 'الى', 'الي', 'عن', 'مع', 'هل', 'انا', 'ان', 'او', 'و', 'يا', 'ده', 'دي', 'دا',
  'ازاي', 'ليه', 'ايه', 'اللي', 'التي', 'الذي', 'لو', 'بس', 'كده', 'عشان', 'علشان', 'لما', 'مش', 'لا', 'ما',
  'عندي', 'عاوز', 'عايز', 'عايزه', 'محتاج', 'ممكن', 'لي', 'ليا', 'السلام', 'عليكم', 'مرحبا', 'اهلا', 'شكرا',
  // Arabic in Latin letters
  'el', 'ana', 'enta', 'enty', 'ezay', 'leh', 'eh', 'msh', 'mesh', 'ya', 'law', 'bas', 'keda', 'ma3lsh',
]);

/** Lower-case, unify Arabic letter variants, drop diacritics/punctuation. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip the Arabic article and common one-letter prefixes so "بالكود" matches "كود". */
function stem(token: string): string {
  let t = token;
  if (/^[؀-ۿ]+$/.test(t)) {
    for (const p of ['وال', 'بال', 'كال', 'فال', 'لل', 'ال']) {
      if (t.startsWith(p) && t.length - p.length >= 2) {
        t = t.slice(p.length);
        break;
      }
    }
    if (t.length > 3 && /^[وبفل]/.test(t)) t = t.slice(1);
    if (t.length > 3 && /(ات|ين|ون|ها|هم|ه)$/.test(t)) t = t.replace(/(ات|ين|ون|ها|هم|ه)$/, '');
  } else if (/^[a-z0-9]+$/.test(t)) {
    if (t.length > 4 && t.endsWith('ing')) t = t.slice(0, -3);
    else if (t.length > 3 && t.endsWith('es')) t = t.slice(0, -2);
    else if (t.length > 3 && t.endsWith('s')) t = t.slice(0, -1);
    else if (t.length > 3 && t.endsWith('ed')) t = t.slice(0, -2);
  }
  return t;
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(' ')
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length >= 2);
}

/** Similarity between a student's message and one FAQ text, 0..1. */
export function similarity(queryTokens: string[], text: string): number {
  const textTokens = tokenize(text);
  if (!queryTokens.length || !textTokens.length) return 0;
  const q = new Set(queryTokens);
  const tset = new Set(textTokens);
  let shared = 0;
  for (const w of q) {
    if (tset.has(w)) shared++;
    else if (w.length >= 4 && [...tset].some((x) => x.length >= 4 && (x.startsWith(w) || w.startsWith(x)))) shared += 0.7;
  }
  // Dice coefficient, plus a bonus when the FAQ text is fully covered by the message. The bonus needs
  // at least two shared words, so one common word ("تاني", "account") cannot match a short phrasing.
  const dice = (2 * shared) / (q.size + tset.size);
  const coverage = shared >= 2 ? shared / tset.size : 0;
  return Math.min(1, Math.max(dice, coverage * 0.9));
}

export interface MatchableFaq {
  id: string;
  questionEn: string;
  questionAr: string;
  phrasings: string[];
}

export function rankFaqs<T extends MatchableFaq>(message: string, faqs: T[]): { faq: T; score: number }[] {
  const queryTokens = tokenize(message);
  const normMessage = normalizeText(message);
  return faqs
    .map((faq) => {
      const texts = [faq.questionEn, faq.questionAr, ...faq.phrasings];
      let score = 0;
      for (const t of texts) {
        const nt = normalizeText(t);
        // An admin-written phrasing that appears word-for-word in the message is a strong signal.
        if (nt.length >= 6 && normMessage.includes(nt)) score = Math.max(score, 0.95);
        score = Math.max(score, similarity(queryTokens, t));
      }
      return { faq, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Requests the bot must refuse outright, whatever the FAQ list says: getting free/new codes,
 * hacking or bypassing protection, admin access, and attempts to re-program the bot.
 * (Ordinary support questions such as "my code is invalid" or "I forgot my password" are allowed.)
 */
const BLOCKED: RegExp[] = [
  // Asking to be given codes
  /\b(free|new|give|send|generate|generator|share)\b.{0,20}\b(code|codes|key|voucher)\b/i,
  /\bcode\s*(generator|gen)\b/i,
  // Someone else's code
  /\b(code|codes)\s+(of|from)\s+(a|my|your|another|other|some)\s*(friend|student|person|user|one|body)\b/i,
  /\b(friend|friends|someone|somebody|another\s+student|other\s+student)'?s?\s+(activation\s+)?(code|codes)\b/i,
  /(كود|اكواد|أكواد)\s*(صاحبي|صاحبى|زميلي|زميلى|حد تاني|حد غيري|طالب تاني|واحد صاحبي)/,
  /(كود|اكواد|أكواد|كودات)\s*(مجان|ببلاش|هديه|هدية)/,
  /(ابعت|ابعتلي|ابعتولي|هات|هاتلي|اديني|ادوني|عايز|عاوز|محتاج)\s*(لي\s*)?(كود|اكواد|أكواد)\s*(مجان|ببلاش|جديد|هديه|هدية)/,
  /(ولد|توليد|تولد|اعمل|اعملي)\s*(لي\s*)?(كود|اكواد|أكواد)/,
  // Hacking / bypassing protection
  /\b(hack|hacking|hacker|crack|cracked|bypass|exploit|inject|injection|sql|xss|jailbreak|ddos|brute\s*force|scrape|scraping)\b/i,
  /(اختراق|اخترق|تهكير|هكر|تهكر|ثغره|ثغرة|تخطي الحمايه|تخطي الحماية|كسر الحمايه|كسر الحماية)/,
  // Admin access / other people's accounts
  /\badmin(istrator)?'?s?\s*(panel|account|password|access|login|log\s*in|dashboard|permission|permissions|rights|role|page)\b/i,
  /\b(root|superuser|api\s*key|access\s*token|jwt|database|other\s+(student|user)'?s?\s+(account|password))\b/i,
  /(لوحه التحكم|لوحة التحكم|صلاحيات الادمن|صلاحيات الأدمن|صلاحية الادمن|صلاحية الأدمن|صلاحيات المسؤول|حساب الادمن|حساب الأدمن|باسورد الادمن|باسورد الأدمن|دخول الادمن|دخول الأدمن|قاعده البيانات|قاعدة البيانات|حساب حد تاني|باسورد حد|كلمه سر حد|كلمة سر حد)/,
  // Trying to change the bot's instructions
  /\b(ignore|disregard|forget)\b.{0,30}\b(instruction|instructions|rules|prompt|above|previous)\b/i,
  /\b(system\s*prompt|you\s+are\s+now|act\s+as|pretend|role\s*play|developer\s+mode|dan\b)/i,
  /(تجاهل|انسى|إنسى)\s*.{0,20}(التعليمات|القواعد|الاوامر|الأوامر)/,
];

export function isBlocked(message: string): boolean {
  return BLOCKED.some((re) => re.test(message));
}

// Control characters plus zero-width and text-direction characters (used to hide or reorder text).
// eslint-disable-next-line no-control-regex
const INVISIBLE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Remove control characters, collapse whitespace and cap the length. */
export function sanitizeMessage(input: unknown, max = 500): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(INVISIBLE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function detectLanguage(message: string): 'ar' | 'en' {
  return /[؀-ۿ]/.test(message) ? 'ar' : 'en';
}
