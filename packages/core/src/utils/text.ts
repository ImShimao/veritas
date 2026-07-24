/** Primitives de traitement de texte partagées par les analyseurs et les extracteurs. */

/**
 * Construit une classe de caractères à partir de points de code.
 * Écrire ces jeux en littéral rendrait le fichier illisible et fragile :
 * il s'agit de caractères invisibles ou visuellement indistinguables.
 */
function charClass(codePoints: number[], flags: string): RegExp {
  const body = codePoints.map((c) => `\\u${c.toString(16).padStart(4, '0')}`).join('');
  return new RegExp(`[${body}]`, flags);
}

/**
 * Caractères de largeur nulle et marques de direction. Certains vendeurs les
 * insèrent au milieu de mots-clés pour contourner les filtres des plateformes.
 */
const INVISIBLES = charClass(
  [
    0x00ad, // trait d'union conditionnel
    0x200b,
    0x200c,
    0x200d, // espaces et jointures de largeur nulle
    0x200e,
    0x200f, // marques de direction
    0x202a,
    0x202b,
    0x202c,
    0x202d,
    0x202e, // surcharges bidirectionnelles
    0x2060, // liant invisible
    0xfeff, // BOM
  ],
  'g',
);

/** Espaces exotiques (insécable, fine, cadratin, idéographique). */
const EXOTIC_SPACES = charClass(
  [
    0x00a0, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a,
    0x202f, 0x205f, 0x3000,
  ],
  'g',
);

/** Apostrophes typographiques ramenées à l'apostrophe ASCII. */
const SMART_APOSTROPHES = charClass([0x2018, 0x2019, 0x201b, 0x2032], 'g');

/** Guillemets courbes ramenés au guillemet droit. */
const SMART_QUOTES = charClass([0x201c, 0x201d, 0x201f, 0x2033], 'g');

/** Signes diacritiques combinants, retirés après décomposition NFD. */
const COMBINING_MARKS = /\p{Mn}/gu;

/** Minuscules, sans accents, espaces normalisés. Base de toutes les comparaisons. */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(SMART_APOSTROPHES, "'")
    .replace(SMART_QUOTES, '"')
    .replace(INVISIBLES, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Conserve la casse mais neutralise les caractères invisibles et les espaces exotiques. */
export function sanitize(input: string): string {
  return input
    .replace(INVISIBLES, '')
    .replace(EXOTIC_SPACES, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Vrai si le texte contient des caractères invisibles — signe d'évasion de filtres. */
export function hasInvisibleCharacters(input: string): boolean {
  INVISIBLES.lastIndex = 0;
  return INVISIBLES.test(input);
}

export function tokenize(input: string): string[] {
  return normalize(input)
    .split(/[^a-z0-9'@.+-]+/)
    .filter((t) => t.length > 0);
}

export function words(input: string): string[] {
  return tokenize(input).filter((t) => /^[a-z]{2,}$/.test(t));
}

export function sentences(input: string): string[] {
  return sanitize(input)
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Distance de Levenshtein bornée, avec sortie anticipée pour rester rapide. */
export function levenshtein(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0]!;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length]!;
}

/** Similarité 0–1 dérivée de la distance d'édition. */
export function editSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/** Découpe en n-grammes de caractères, utilisé pour la similarité robuste aux fautes. */
export function charNGrams(input: string, n = 3): Set<string> {
  const normalized = normalize(input);
  const grams = new Set<string>();
  for (let i = 0; i + n <= normalized.length; i++) {
    grams.add(normalized.slice(i, i + n));
  }
  return grams;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Similarité textuelle combinée : n-grammes de caractères (robustes aux fautes)
 * pondérés avec le recouvrement lexical (robuste aux réagencements).
 */
export function textSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const gramScore = jaccard(charNGrams(a, 4), charNGrams(b, 4));
  const wordScore = jaccard(new Set(words(a)), new Set(words(b)));
  return 0.6 * gramScore + 0.4 * wordScore;
}

/** Empreinte stable d'un contenu textuel, indépendante de la mise en forme. */
export function contentHash(input: string): string {
  const normalized = normalize(input);
  // Deux accumulateurs FNV-1a 32 bits, concaténés pour limiter les collisions.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/**
 * Marqueurs de négation cherchés juste avant une correspondance.
 *
 * Sans cette vérification, « pas de remise en main propre » déclencherait le
 * critère « rencontre proposée », et « aucune facture » le critère
 * « justificatif d'achat disponible » — en inversant complètement le sens.
 */
const NEGATION_BEFORE =
  /\b(pas|aucun|aucune|jamais|sans|ni|impossible|refuse|refusons|non|exclu|interdit|hors de question|malheureusement)\b[^.!?;]{0,24}$/;

/** Fenêtre de contexte gauche examinée, en caractères. */
const NEGATION_WINDOW = 34;

/**
 * Vrai si la correspondance située à `matchIndex` est niée par ce qui la précède.
 * Le texte doit être normalisé (`normalize`), la fonction raisonnant sans accents.
 */
export function isNegated(normalizedText: string, matchIndex: number): boolean {
  const start = Math.max(0, matchIndex - NEGATION_WINDOW);
  const before = normalizedText.slice(start, matchIndex);
  return NEGATION_BEFORE.test(before);
}

/** Retourne l'extrait entourant une position, pour afficher une preuve lisible. */
export function excerptAround(text: string, index: number, radius = 60): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end).replace(/\s+/g, ' ').trim() + suffix;
}

/** Proportion de majuscules parmi les lettres — révèle les titres criés. */
export function uppercaseRatio(input: string): number {
  const letters = input.replace(/[^\p{L}]/gu, '');
  if (letters.length < 8) return 0;
  const upper = letters.replace(/[^\p{Lu}]/gu, '');
  return upper.length / letters.length;
}

/** Densité d'emojis et de symboles décoratifs. */
export function emojiCount(input: string): number {
  const matches = input.match(/\p{Extended_Pictographic}/gu);
  return matches ? matches.length : 0;
}

/** Compte les répétitions de ponctuation (!!!, ???) typiques du marketing agressif. */
export function repeatedPunctuation(input: string): number {
  const matches = input.match(/([!?.])\1{1,}/g);
  return matches ? matches.length : 0;
}

/**
 * Entropie de Shannon par caractère. Un texte généré automatiquement présente
 * souvent une entropie plus régulière qu'une rédaction humaine spontanée.
 */
export function shannonEntropy(input: string): number {
  const text = normalize(input);
  if (text.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of text) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Proportion de mots uniques : mesure la richesse lexicale. */
export function lexicalDiversity(input: string): number {
  const list = words(input);
  if (list.length < 10) return 1;
  return new Set(list).size / list.length;
}

/** Longueur moyenne des phrases, en mots. */
export function averageSentenceLength(input: string): number {
  const parts = sentences(input);
  if (parts.length === 0) return 0;
  const total = parts.reduce((sum, s) => sum + words(s).length, 0);
  return total / parts.length;
}

/** Écart-type de la longueur des phrases : très faible = rythme mécanique. */
export function sentenceLengthVariance(input: string): number {
  const parts = sentences(input).map((s) => words(s).length);
  if (parts.length < 3) return Infinity;
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  const variance = parts.reduce((sum, n) => sum + (n - avg) ** 2, 0) / parts.length;
  return Math.sqrt(variance);
}

export const CONTACT_PATTERNS = {
  email: /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi,
  /** Numéros internationaux avec séparateurs variés. */
  phone: /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?){3,5}\d{2,4}/g,
  url: /https?:\/\/[^\s<>"')]+/gi,
  whatsapp: /\bwhat'?s\s?app\b|\bwa\.me\b/gi,
  telegram: /\bt\.me\b|\btelegram\b/gi,
  iban: /\b[A-Z]{2}\d{2}[\sA-Z0-9]{11,30}\b/g,
} as const;

/** Applique un motif global et retourne toutes les correspondances sans état partagé. */
export function extractAll(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
  const re = new RegExp(pattern.source, flags);
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0]) out.push(match[0]);
    if (match.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/** Masque les données personnelles avant journalisation. */
export function redact(text: string): string {
  return text
    .replace(new RegExp(CONTACT_PATTERNS.email.source, 'gi'), '[email masque]')
    .replace(new RegExp(CONTACT_PATTERNS.iban.source, 'g'), '[IBAN masque]')
    .replace(/(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){9,14}/g, '[telephone masque]');
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return input.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

export function titleCase(input: string): string {
  return input.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}
