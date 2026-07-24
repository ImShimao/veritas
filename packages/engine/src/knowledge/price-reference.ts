import type { ListingDomain } from '@veritas/core';

/**
 * Référentiel de prix embarqué.
 *
 * Il ne prétend pas remplacer une base de marché temps réel : il fournit un
 * point d'ancrage vérifiable pour les biens les plus fréquemment concernés par
 * la fraude. Trois sources de comparaison sont utilisées par l'analyseur, dans
 * cet ordre de préférence :
 *
 *   1. `history` — les annonces comparables déjà analysées localement,
 *      la source la plus pertinente puisqu'elle reflète le marché réel ;
 *   2. `builtin` — ce référentiel, pour les modèles identifiables ;
 *   3. l'estimation par dépréciation, quand le vendeur indique un prix neuf.
 *
 * Les prix neufs sont exprimés en euros TTC au lancement du produit.
 */

export interface PriceReference {
  id: string;
  label: string;
  domain: ListingDomain;
  /** Motifs appliqués au titre normalisé. Le plus spécifique doit venir en premier. */
  match: RegExp[];
  newPrice: number;
  releaseYear: number;
  /** Dépréciation annuelle propre au modèle, si elle diffère de celle du domaine. */
  depreciation?: number;
  /** Écart-type relatif observé sur le marché de l'occasion (0.18 = ±18 %). */
  dispersion: number;
}

/**
 * Les modèles premium — Apple, flagships Samsung — se déprécient nettement plus
 * lentement que la moyenne de l'électronique grand public. Leur appliquer le
 * taux générique reviendrait à qualifier de « suspecte » toute annonce honnête
 * sur ces produits, qui sont précisément les plus échangés d'occasion.
 */
const PREMIUM_DEPRECIATION = 0.16;

export const PRICE_REFERENCES: PriceReference[] = [
  // ── Téléphonie ───────────────────────────────────────────────────────
  {
    id: 'iphone-15-pro-max',
    label: 'iPhone 15 Pro Max',
    domain: 'electronics',
    match: [/\biphone 15 pro max\b/],
    newPrice: 1479,
    releaseYear: 2023,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.15,
  },
  {
    id: 'iphone-15-pro',
    label: 'iPhone 15 Pro',
    domain: 'electronics',
    match: [/\biphone 15 pro\b(?! max)/],
    newPrice: 1229,
    releaseYear: 2023,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.15,
  },
  {
    id: 'iphone-15',
    label: 'iPhone 15',
    domain: 'electronics',
    match: [/\biphone 15\b(?! pro)/],
    newPrice: 969,
    releaseYear: 2023,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.16,
  },
  {
    id: 'iphone-14-pro',
    label: 'iPhone 14 Pro',
    domain: 'electronics',
    match: [/\biphone 14 pro\b/],
    newPrice: 1329,
    releaseYear: 2022,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.17,
  },
  {
    id: 'iphone-14',
    label: 'iPhone 14',
    domain: 'electronics',
    match: [/\biphone 14\b(?! pro)/],
    newPrice: 1019,
    releaseYear: 2022,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.17,
  },
  {
    id: 'iphone-13',
    label: 'iPhone 13',
    domain: 'electronics',
    match: [/\biphone 13\b/],
    newPrice: 909,
    releaseYear: 2021,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.18,
  },
  {
    id: 'iphone-12',
    label: 'iPhone 12',
    domain: 'electronics',
    match: [/\biphone 12\b/],
    newPrice: 909,
    releaseYear: 2020,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.2,
  },
  {
    id: 'iphone-11',
    label: 'iPhone 11',
    domain: 'electronics',
    match: [/\biphone 11\b/],
    newPrice: 809,
    releaseYear: 2019,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.22,
  },
  {
    id: 'galaxy-s24-ultra',
    label: 'Samsung Galaxy S24 Ultra',
    domain: 'electronics',
    match: [/\bgalaxy s24 ultra\b|\bs24 ultra\b/],
    newPrice: 1469,
    releaseYear: 2024,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.16,
  },
  {
    id: 'galaxy-s23-ultra',
    label: 'Samsung Galaxy S23 Ultra',
    domain: 'electronics',
    match: [/\bgalaxy s23 ultra\b|\bs23 ultra\b/],
    newPrice: 1419,
    releaseYear: 2023,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.17,
  },
  {
    id: 'galaxy-s23',
    label: 'Samsung Galaxy S23',
    domain: 'electronics',
    match: [/\bgalaxy s23\b|\bs23\b/],
    newPrice: 959,
    releaseYear: 2023,
    dispersion: 0.18,
  },
  {
    id: 'galaxy-s22',
    label: 'Samsung Galaxy S22',
    domain: 'electronics',
    match: [/\bgalaxy s22\b|\bs22\b/],
    newPrice: 859,
    releaseYear: 2022,
    dispersion: 0.19,
  },
  {
    id: 'pixel-8-pro',
    label: 'Google Pixel 8 Pro',
    domain: 'electronics',
    match: [/\bpixel 8 pro\b/],
    newPrice: 1099,
    releaseYear: 2023,
    dispersion: 0.18,
  },

  // ── Informatique ─────────────────────────────────────────────────────
  {
    id: 'macbook-pro-16-m3',
    label: 'MacBook Pro 16 pouces M3',
    domain: 'electronics',
    match: [/\bmacbook pro 16\b.*\bm3\b|\bm3 (pro|max)\b.*\b16\b/],
    newPrice: 2999,
    releaseYear: 2023,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.14,
  },
  {
    id: 'macbook-pro-14-m3',
    label: 'MacBook Pro 14 pouces M3',
    domain: 'electronics',
    match: [/\bmacbook pro 14\b/],
    newPrice: 1999,
    releaseYear: 2023,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.15,
  },
  {
    id: 'macbook-air-m2',
    label: 'MacBook Air M2',
    domain: 'electronics',
    match: [/\bmacbook air\b.*\bm2\b/],
    newPrice: 1499,
    releaseYear: 2022,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.15,
  },
  {
    id: 'macbook-air-m1',
    label: 'MacBook Air M1',
    domain: 'electronics',
    match: [/\bmacbook air\b.*\bm1\b/],
    newPrice: 1129,
    releaseYear: 2020,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.17,
  },
  {
    id: 'ipad-pro-11',
    label: 'iPad Pro 11 pouces',
    domain: 'electronics',
    match: [/\bipad pro 11\b/],
    newPrice: 1069,
    releaseYear: 2022,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.17,
  },
  {
    id: 'ipad-air',
    label: 'iPad Air',
    domain: 'electronics',
    match: [/\bipad air\b/],
    newPrice: 789,
    releaseYear: 2022,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.18,
  },

  // ── Consoles ─────────────────────────────────────────────────────────
  // Les consoles tiennent remarquablement leur valeur tant qu'elles sont
  // en production : leur prix neuf ne baisse quasiment jamais.
  {
    id: 'ps5-pro',
    label: 'PlayStation 5 Pro',
    domain: 'electronics',
    match: [/\bps5 pro\b|\bplaystation 5 pro\b/],
    newPrice: 799,
    releaseYear: 2024,
    depreciation: 0.1,
    dispersion: 0.14,
  },
  {
    id: 'ps5',
    label: 'PlayStation 5',
    domain: 'electronics',
    match: [/\bps5\b|\bplaystation 5\b/],
    newPrice: 549,
    releaseYear: 2020,
    depreciation: 0.1,
    dispersion: 0.15,
  },
  {
    id: 'xbox-series-x',
    label: 'Xbox Series X',
    domain: 'electronics',
    match: [/\bxbox series x\b/],
    newPrice: 499,
    releaseYear: 2020,
    depreciation: 0.1,
    dispersion: 0.15,
  },
  {
    id: 'switch-oled',
    label: 'Nintendo Switch OLED',
    domain: 'electronics',
    match: [/\bswitch oled\b/],
    newPrice: 349,
    releaseYear: 2021,
    depreciation: 0.1,
    dispersion: 0.14,
  },
  {
    id: 'switch',
    label: 'Nintendo Switch',
    domain: 'electronics',
    match: [/\bnintendo switch\b|\bswitch\b/],
    newPrice: 319,
    releaseYear: 2017,
    depreciation: 0.09,
    dispersion: 0.16,
  },

  // ── Audio et photo ───────────────────────────────────────────────────
  {
    id: 'airpods-pro-2',
    label: 'AirPods Pro 2',
    domain: 'electronics',
    match: [/\bairpods pro 2\b|\bairpods pro\b.*\b2(e|eme)? ?gen/],
    newPrice: 299,
    releaseYear: 2022,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.18,
  },
  {
    id: 'airpods-max',
    label: 'AirPods Max',
    domain: 'electronics',
    match: [/\bairpods max\b/],
    newPrice: 629,
    releaseYear: 2020,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.18,
  },
  {
    id: 'sony-wh1000xm5',
    label: 'Sony WH-1000XM5',
    domain: 'electronics',
    match: [/\bwh[- ]?1000 ?xm5\b/],
    newPrice: 419,
    releaseYear: 2022,
    dispersion: 0.17,
  },
  {
    id: 'gopro-hero12',
    label: 'GoPro HERO12',
    domain: 'electronics',
    match: [/\bgopro hero ?12\b/],
    newPrice: 449,
    releaseYear: 2023,
    dispersion: 0.18,
  },
  {
    id: 'dji-mini-4-pro',
    label: 'DJI Mini 4 Pro',
    domain: 'electronics',
    match: [/\bdji mini 4 pro\b/],
    newPrice: 999,
    releaseYear: 2023,
    dispersion: 0.16,
  },

  // ── Montres et luxe ──────────────────────────────────────────────────
  {
    id: 'apple-watch-ultra-2',
    label: 'Apple Watch Ultra 2',
    domain: 'electronics',
    match: [/\bapple watch ultra 2\b/],
    newPrice: 899,
    releaseYear: 2023,
    depreciation: PREMIUM_DEPRECIATION,
    dispersion: 0.16,
  },
  // Dépréciation négative : la cote de ces montres progresse avec le temps.
  {
    id: 'rolex-submariner',
    label: 'Rolex Submariner',
    domain: 'collectible',
    match: [/\brolex submariner\b/],
    newPrice: 9500,
    releaseYear: 2020,
    depreciation: -0.03,
    dispersion: 0.25,
  },

  // ── Vélos ────────────────────────────────────────────────────────────
  {
    id: 'vae-generic',
    label: 'Vélo à assistance électrique',
    domain: 'sport_leisure',
    match: [/\b(velo electrique|vae|vtt electrique|vtc electrique)\b/],
    newPrice: 1800,
    releaseYear: 2022,
    depreciation: 0.22,
    dispersion: 0.3,
  },
  {
    id: 'vtt-generic',
    label: 'VTT',
    domain: 'sport_leisure',
    match: [/\bvtt\b/],
    newPrice: 900,
    releaseYear: 2021,
    depreciation: 0.2,
    dispersion: 0.32,
  },
];

export interface ReferenceMatch {
  reference: PriceReference;
  /** Confiance dans l'appariement, 0 à 1. */
  confidence: number;
}

/** Trouve la référence la plus spécifique correspondant au titre normalisé. */
export function findReference(
  normalizedTitle: string,
  normalizedText: string,
): ReferenceMatch | undefined {
  const candidates: ReferenceMatch[] = [];

  for (const reference of PRICE_REFERENCES) {
    for (const pattern of reference.match) {
      if (pattern.test(normalizedTitle)) {
        candidates.push({ reference, confidence: 0.9 });
        break;
      }
      if (pattern.test(normalizedText)) {
        candidates.push({ reference, confidence: 0.6 });
        break;
      }
    }
  }

  if (candidates.length === 0) return undefined;

  // À confiance égale, le motif le plus long est le plus spécifique
  // (« iphone 15 pro max » l'emporte sur « iphone 15 »).
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const aLength = Math.max(...a.reference.match.map((m) => m.source.length));
    const bLength = Math.max(...b.reference.match.map((m) => m.source.length));
    return bLength - aLength;
  });

  return candidates[0];
}

/**
 * Valeur d'occasion attendue pour une référence donnée.
 *
 * Modèle : dépréciation exponentielle depuis la **sortie du modèle**, plancher
 * de valeur résiduelle, puis abattement selon l'état déclaré.
 *
 * L'âge se compte depuis la commercialisation jusqu'à aujourd'hui — et non
 * depuis une année mentionnée dans l'annonce. Un iPhone 13 acheté en 2022 reste
 * un modèle de 2021 : c'est la date de sortie qui gouverne sa cote, pas la date
 * d'achat de ce vendeur-là.
 */
export function expectedUsedPrice(
  reference: PriceReference,
  options: {
    conditionDiscount: number;
    domainDepreciation: number;
    residualFloor: number;
    /** Année d'évaluation. Par défaut l'année courante ; surchargeable pour les tests. */
    evaluationYear?: number;
  },
): number {
  const evaluationYear = options.evaluationYear ?? new Date().getFullYear();
  const age = Math.max(0, evaluationYear - reference.releaseYear);
  const rate = reference.depreciation ?? options.domainDepreciation;
  const decayed = reference.newPrice * (1 - rate) ** age;
  const floor = reference.newPrice * options.residualFloor;
  const base = Math.max(decayed, floor);
  return base * (1 - options.conditionDiscount);
}
