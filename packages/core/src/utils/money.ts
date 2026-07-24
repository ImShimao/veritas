/** Analyse et mise en forme des montants, tous formats de saisie confondus. */

const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  $: 'USD',
  '£': 'GBP',
  '₣': 'CHF',
  '¥': 'JPY',
  '₽': 'RUB',
  '₹': 'INR',
  zł: 'PLN',
  kr: 'SEK',
};

const CURRENCY_CODES = new Set([
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'CAD',
  'JPY',
  'PLN',
  'SEK',
  'NOK',
  'DKK',
  'CZK',
  'RON',
  'HUF',
  'BGN',
]);

export interface ParsedMoney {
  amount: number;
  currency: string;
}

/**
 * Extrait un montant d'une chaîne libre.
 *
 * Gère « 1 250,50 € », « EUR 1.250,50 », « $1,250.50 », « 1250€ », « 12 500 »
 * en levant l'ambiguïté point/virgule d'après la position du dernier séparateur.
 */
export function parseMoney(input: string, fallbackCurrency = 'EUR'): ParsedMoney | undefined {
  if (!input) return undefined;
  // `\s` couvre deja les espaces insecables et fines en JavaScript.
  const text = input.replace(/\s+/g, ' ').trim();

  let currency: string | undefined;
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) {
      currency = code;
      break;
    }
  }
  if (!currency) {
    const codeMatch = text.toUpperCase().match(/\b([A-Z]{3})\b/);
    if (codeMatch?.[1] && CURRENCY_CODES.has(codeMatch[1])) currency = codeMatch[1];
  }

  const numberMatch = text.match(/-?\d[\d\s.,']*\d|-?\d/);
  if (!numberMatch) return undefined;

  const amount = parseDecimal(numberMatch[0]);
  if (amount === undefined) return undefined;

  return { amount, currency: currency ?? fallbackCurrency };
}

/** Convertit une chaîne numérique en nombre, quel que soit le séparateur décimal. */
export function parseDecimal(raw: string): number | undefined {
  const cleaned = raw.replace(/[\s']/g, '');
  if (!/\d/.test(cleaned)) return undefined;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized: string;

  if (lastComma === -1 && lastDot === -1) {
    normalized = cleaned;
  } else if (lastComma > lastDot) {
    // La virgule est le séparateur décimal : « 1.250,50 ».
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    const decimals = cleaned.length - lastDot - 1;
    // « 1.250 » avec exactement trois décimales est un séparateur de milliers.
    normalized =
      decimals === 3 && lastComma === -1 ? cleaned.replace(/\./g, '') : cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned;
  }

  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : undefined;
}

const LOCALE_BY_CURRENCY: Record<string, string> = {
  EUR: 'fr-FR',
  USD: 'en-US',
  GBP: 'en-GB',
  CHF: 'de-CH',
};

export function formatMoney(amount: number, currency = 'EUR'): string {
  const locale = LOCALE_BY_CURRENCY[currency] ?? 'fr-FR';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export function formatPercent(ratio: number, decimals = 0): string {
  return `${(ratio * 100).toFixed(decimals)} %`;
}

/** Extrait tous les montants d'un texte : utile pour repérer les prix contradictoires. */
export function findAllPrices(text: string, fallbackCurrency = 'EUR'): ParsedMoney[] {
  // Un montant est reconnu soit suivi d'un symbole ou d'un code de devise
  // (« 250 € », « 12€ », « 950 euros »), soit précédé d'un symbole (« €250 »).
  // Le `\b` ne s'applique qu'aux codes alphabétiques : après un symbole comme
  // « € », il n'y a jamais de frontière de mot, ce qui ferait rater « 250€ ».
  const pattern =
    /(?:[€$£]\s?)?\d[\d\s.,']{0,12}\d\s?(?:[€$£]|(?:eur|euros?|usd|dollars?|gbp|chf)\b)|[€$£]\s?\d[\d\s.,']*\d/gi;
  const out: ParsedMoney[] = [];
  const seen = new Set<number>();
  for (const match of text.match(pattern) ?? []) {
    const parsed = parseMoney(match, fallbackCurrency);
    if (parsed && parsed.amount > 0 && !seen.has(parsed.amount)) {
      seen.add(parsed.amount);
      out.push(parsed);
    }
  }
  return out;
}
