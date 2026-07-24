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

/** Codes postaux et villes françaises fréquemment présents en fin d'annonce. */
const LOCATION_PATTERN = /\b(\d{5})\s+([A-ZÀ-Ý][\wÀ-ÿ'-]+(?:[ -][A-ZÀ-Ý][\wÀ-ÿ'-]+)*)/;

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
  const labelled = /(?:^|\n)\s*prix\s*:?\s*([^\n]+)/i.exec(text);
  if (labelled?.[1]) price = parseMoney(labelled[1]);
  if (!price) {
    const candidates = findAllPrices(text);
    // Le prix de l'annonce est presque toujours le montant le plus élevé :
    // les autres sont des accessoires, des frais de port ou un prix neuf.
    if (candidates.length > 0) {
      price = candidates.reduce((best, current) => (current.amount > best.amount ? current : best));
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
  const postal = LOCATION_PATTERN.exec(text);
  if (explicit) {
    location = { raw: explicit };
    extractedFields.push('location');
  } else if (postal) {
    location = {
      raw: `${postal[1]} ${postal[2]}`,
      postalCode: postal[1],
      city: postal[2],
      country: 'France',
    };
    extractedFields.push('location');
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
      price,
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
