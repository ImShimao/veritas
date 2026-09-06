import {
  createId,
  findAllPrices,
  normalize,
  parseMoney,
  sanitize,
  type Listing,
  type Platform,
} from '@veritas/core';

/**
 * Analyse d'une annonce collée en texte brut.
 *
 * C'est le mode d'entrée le plus fiable en pratique : il ne dépend d'aucun
 * site, d'aucune protection anti-robot et d'aucun sélecteur CSS. Beaucoup
 * d'utilisateurs y viendront après un échec de récupération automatique, il
 * doit donc extraire le maximum d'un texte non structuré.
 */

/** Motifs de champs fréquemment présents dans une annonce copiée-collée. */
const FIELD_PATTERNS: { key: string; patterns: RegExp[] }[] = [
  { key: 'Prix', patterns: [/^prix\s*:?\s*(.+)$/im] },
  { key: 'Localisation', patterns: [/^(?:lieu|localisation|ville|adresse)\s*:?\s*(.+)$/im] },
  { key: 'État', patterns: [/^(?:etat|état|condition)\s*:?\s*(.+)$/im] },
  { key: 'Marque', patterns: [/^marque\s*:?\s*(.+)$/im] },
  { key: 'Modèle', patterns: [/^(?:modele|modèle)\s*:?\s*(.+)$/im] },
  { key: 'Année', patterns: [/^(?:annee|année)\s*:?\s*(.+)$/im] },
  { key: 'Kilométrage', patterns: [/^(?:kilometrage|kilométrage|km)\s*:?\s*(.+)$/im] },
  { key: 'Taille', patterns: [/^taille\s*:?\s*(.+)$/im] },
  { key: 'Surface', patterns: [/^surface\s*:?\s*(.+)$/im] },
  { key: 'Carburant', patterns: [/^carburant\s*:?\s*(.+)$/im] },
  { key: 'Vendeur', patterns: [/^(?:vendeur|vendu par)\s*:?\s*(.+)$/im] },
];

/**
 * Reconnaissance de la localisation dans une annonce collée.
 *
 * Deux ordres coexistent en pratique — « 92110 Clichy » et « Clichy 92110 » —
 * et il faut gérer les deux : n'en gérer qu'un affichait à tort « localisation
 * absente » sur des annonces qui la précisaient. Le code postal est validé
 * (01000–98999) pour éviter de prendre un prix ou une référence à cinq chiffres
 * pour une adresse, et la ville est bornée à quelques mots pour ne pas happer
 * une phrase entière.
 */
const FRENCH_POSTAL = String.raw`(?:0[1-9]|[1-8]\d|9[0-8])\d{3}`;
const CITY = String.raw`[A-ZÀ-Ý][\wÀ-ÿ'-]+(?:[ -][A-ZÀ-Ý][\wÀ-ÿ'-]+){0,3}`;
/** « 92110 Clichy » — code postal puis ville. */
const LOCATION_POSTAL_CITY = new RegExp(String.raw`\b(${FRENCH_POSTAL})\s+(${CITY})`);
/** « Clichy 92110 » — ville puis code postal. */
const LOCATION_CITY_POSTAL = new RegExp(String.raw`(${CITY})\s+(${FRENCH_POSTAL})\b`);

/** Extrait une localisation française, quel que soit l'ordre code postal / ville. */
function parseLocation(text: string): Listing['location'] | undefined {
  const postalFirst = LOCATION_POSTAL_CITY.exec(text);
  if (postalFirst) {
    return {
      raw: `${postalFirst[1]} ${postalFirst[2]}`,
      postalCode: postalFirst[1],
      city: postalFirst[2],
      country: 'France',
    };
  }
  const cityFirst = LOCATION_CITY_POSTAL.exec(text);
  if (cityFirst) {
    return {
      raw: `${cityFirst[1]} ${cityFirst[2]}`,
      postalCode: cityFirst[2],
      city: cityFirst[1],
      country: 'France',
    };
  }
  return undefined;
}

export interface FreeTextResult {
  listing: Partial<Listing>;
  extractedFields: string[];
}

export function parseFreeText(raw: string, platformHint?: Platform): FreeTextResult {
  const text = sanitize(raw);
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const extractedFields: string[] = [];

  // ── Titre ──────────────────────────────────────────────────────────
  // Première ligne substantielle qui ne soit ni un prix ni une étiquette.
  const isTitleCandidate = (line: string): boolean =>
    line.length >= 6 &&
    !/^prix\s*:?/i.test(line) &&
    !/^\s*[\d\s.,]+\s*(€|eur|euros?)\s*$/i.test(line);

  const rawTitleLine = lines.find((line) => line.length <= 160 && isTitleCandidate(line));
  // Repli : première ligne exploitable, tronquée à sa première phrase. Une
  // annonce collée en un seul paragraphe ne doit pas voir tout son texte
  // promu au rang de titre.
  const title =
    rawTitleLine ?? deriveTitleFromParagraph(lines.find(isTitleCandidate) ?? lines[0] ?? '');
  if (title) extractedFields.push('title');

  // ── Prix ───────────────────────────────────────────────────────────
  let price: { amount: number; currency: string } | undefined;
  let original: number | undefined;
  const labelled = /(?:^|\n)\s*prix\s*:?\s*([^\n]+)/i.exec(text);
  if (labelled?.[1]) price = parseMoney(labelled[1]);

  const candidates = findAllPrices(text);
  if (candidates.length > 0) {
    // Un montant précédé de « neuf / acheté / payé / valeur / au lieu de » est
    // un prix d'origine, pas le prix demandé : on le met de côté comme référence.
    const isOriginal = (amount: number): boolean => {
      const re = new RegExp(
        `\\b(neuf|achete|paye|valeur|au lieu de|prix d'achat|coute)\\b[^.\\n]{0,20}${amount}`,
        'i',
      );
      return re.test(normalize(text));
    };
    const originals = candidates.filter((c) => isOriginal(c.amount));
    const asking = candidates.filter((c) => !isOriginal(c.amount));

    if (!price) {
      // Sans étiquette « prix : », on prend le plus grand montant *demandé*
      // (hors prix d'origine), qui est presque toujours le prix de vente.
      const pool = asking.length > 0 ? asking : candidates;
      price = pool.reduce((best, current) => (current.amount > best.amount ? current : best));
    }
    if (originals.length > 0 && price) {
      const highestOriginal = Math.max(...originals.map((o) => o.amount));
      if (highestOriginal > price.amount) original = highestOriginal;
    }
  }
  if (price) extractedFields.push('price');

  // ── Champs étiquetés ───────────────────────────────────────────────
  const attributes: Record<string, string> = {};
  for (const field of FIELD_PATTERNS) {
    for (const pattern of field.patterns) {
      const match = pattern.exec(text);
      if (match?.[1]) {
        const value = sanitize(match[1]);
        if (value.length > 0 && value.length < 120) attributes[field.key] = value;
        break;
      }
    }
  }
  if (Object.keys(attributes).length > 0) extractedFields.push('attributes');

  // ── Localisation ───────────────────────────────────────────────────
  let location: Listing['location'];
  const explicit = attributes.Localisation;
  if (explicit) {
    location = { raw: explicit };
    extractedFields.push('location');
  } else {
    const parsed = parseLocation(text);
    if (parsed) {
      location = parsed;
      extractedFields.push('location');
    }
  }

  // ── Vendeur ────────────────────────────────────────────────────────
  const sellerName = attributes.Vendeur;
  const seller = sellerName ? { displayName: sellerName } : undefined;
  if (seller) extractedFields.push('seller');

  // ── Description ────────────────────────────────────────────────────
  // Tout le texte, titre compris : les analyseurs travaillent sur l'ensemble
  // et le titre porte souvent lui-même des signaux (urgence, majuscules).
  const description = text;
  if (description.length > 30) extractedFields.push('description');

  return {
    listing: {
      id: createId('lst'),
      title,
      description,
      price: price ? { ...price, ...(original ? { original } : {}) } : undefined,
      location,
      attributes,
      seller,
      source: platformHint
        ? { platform: platformHint, inputMode: 'text', capturedAt: new Date().toISOString() }
        : undefined,
    },
    extractedFields,
  };
}

/**
 * Fabrique un titre lisible à partir d'un paragraphe.
 *
 * On coupe à la première frontière naturelle (phrase, tiret, saut de sens) et
 * on borne la longueur. Objectif : « iPhone 15 Pro Max 256Go NEUF » plutôt que
 * les 400 caractères d'une annonce collée d'un bloc.
 */
function deriveTitleFromParagraph(paragraph: string): string {
  const clean = paragraph.trim();
  if (clean.length <= 80) return clean;

  // Première phrase ou premier segment avant une ponctuation forte.
  const firstSentence = clean.split(/(?<=[.!?…])\s|(?: [-–—] )|\n/)[0]?.trim() ?? clean;
  if (firstSentence.length >= 6 && firstSentence.length <= 90) return firstSentence;

  // À défaut, coupe au dernier mot entier avant 80 caractères.
  const truncated = clean.slice(0, 80);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated).trim() + '…';
}

/** Devine la plateforme mentionnée dans un texte collé. */
export function guessPlatformFromText(text: string): Platform | undefined {
  const normalized = normalize(text);
  const mapping: [RegExp, Platform][] = [
    [/\bleboncoin\b|\ble bon coin\b/, 'leboncoin'],
    [/\bvinted\b/, 'vinted'],
    [/\bebay\b/, 'ebay'],
    [/\bmarketplace\b|\bfacebook\b/, 'facebook_marketplace'],
    [/\bairbnb\b/, 'airbnb'],
    [/\bbooking\b/, 'booking'],
    [/\betsy\b/, 'etsy'],
    [/\bback ?market\b/, 'backmarket'],
    [/\bautoscout\b/, 'autoscout24'],
    [/\bmobile\.de\b/, 'mobile_de'],
    [/\bla centrale\b/, 'lacentrale'],
    [/\bselency\b/, 'selency'],
    [/\brakuten\b/, 'rakuten'],
    [/\bamazon\b/, 'amazon'],
  ];
  for (const [pattern, platform] of mapping) {
    if (pattern.test(normalized)) return platform;
  }
  return undefined;
}
