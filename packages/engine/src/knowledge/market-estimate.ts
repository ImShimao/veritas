import { normalize, type Listing, type ListingDomain } from '@veritas/core';

/**
 * Estimation de marché et recherches pré-remplies.
 *
 * Objectif : ne **jamais** laisser l'utilisateur sans repère de prix. Deux
 * niveaux, du plus fiable au moins fiable :
 *
 *   1. Une **estimation par catégorie** — un ordre de grandeur du prix neuf et
 *      de la fourchette d'occasion attendue, déduit du type de bien, de la
 *      marque, de la matière, de l'année. Ce n'est pas une cote exacte, c'est
 *      une base de discussion, clairement présentée comme telle.
 *   2. Des **recherches pré-remplies** (Leboncoin, Google, Google Shopping) qui
 *      permettent à l'utilisateur de vérifier lui-même le prix réel en un clic.
 *
 * Le second niveau est toujours fourni ; le premier quand le bien est
 * identifiable. Ensemble, ils répondent à « je n'ai aucune idée du prix ».
 */

export interface MarketEstimate {
  /** Prix neuf approximatif. */
  newPrice: number;
  /** Fourchette d'occasion attendue. */
  usedLow: number;
  usedHigh: number;
  /** Explication de la base d'estimation (« vélo gravel carbone, marque premium »). */
  basis: string;
  /**
   * Vrai si l'estimation s'appuie sur des signaux discriminants (marque,
   * matière, transmission) et peut donc servir à juger le prix. Faux pour un
   * simple ordre de grandeur par domaine, qui n'informe que l'utilisateur.
   */
  precise: boolean;
}

/** Nettoie un titre pour en faire une requête de recherche efficace. */
function toQuery(title: string): string {
  return title
    .replace(/[|/•·]+/g, ' ')
    .replace(/\b(urgent|a saisir|tres bon etat|bon etat|comme neuf|neuf)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/**
 * Construit des recherches pré-remplies pour comparer le prix soi-même.
 * Toujours disponibles, quel que soit le bien.
 */
export function buildMarketSearchLinks(listing: Listing): { engine: string; url: string }[] {
  const query = toQuery(listing.title || '');
  if (query.length < 3) return [];
  const encoded = encodeURIComponent(query);

  return [
    {
      engine: 'Leboncoin (occasions similaires)',
      url: `https://www.leboncoin.fr/recherche?text=${encoded}`,
    },
    {
      engine: 'Google (prix du marché)',
      url: `https://www.google.com/search?q=${encoded}+prix`,
    },
    {
      engine: 'Google Shopping (prix neuf)',
      url: `https://www.google.com/search?tbm=shop&q=${encoded}`,
    },
  ];
}

// ── Estimation par catégorie ───────────────────────────────────────────

/** Multiplicateur de gamme selon la marque, par grande famille. */
interface BrandTier {
  premium: RegExp;
  mid?: RegExp;
  budget: RegExp;
}

const BIKE_BRANDS: BrandTier = {
  premium:
    /\b(specialized|trek|canyon|cervelo|bmc|pinarello|cannondale|scott|giant|orbea|cube|lapierre|santa cruz|focus|bianchi|colnago|look|time)\b/,
  budget: /\b(btwin|b'twin|rockrider|triban|decathlon|nakamura|gitane|go sport)\b/,
};

/**
 * Prix neuf de base d'un vélo selon son type, pour une version d'entrée de
 * gamme (cadre alu, transmission basique). Les multiplicateurs qui suivent
 * (carbone, marque, groupe) montent en gamme à partir de cette base.
 */
const BIKE_BASE_NEW: { match: RegExp; base: number; label: string }[] = [
  {
    match: /\b(velo electrique|vae|vtt electrique|vtc electrique|e-?bike|speedbike)\b/,
    base: 1800,
    label: 'vélo électrique',
  },
  { match: /\b(gravel|diverge|grizl|topstone|checkpoint)\b/, base: 1400, label: 'gravel' },
  { match: /\b(velo de route|route|road|endurance|aero)\b/, base: 1300, label: 'vélo de route' },
  {
    match: /\b(vtt|mtb|enduro|descente|dh|cross country|xc|all mountain)\b/,
    base: 1200,
    label: 'VTT',
  },
  { match: /\b(vtc|ville|hybride|city|urbain)\b/, base: 600, label: 'vélo de ville / VTC' },
  { match: /\b(bmx)\b/, base: 400, label: 'BMX' },
];

/**
 * Estime le prix d'un vélo à partir du type, de la marque, de la matière et du
 * groupe de transmission. Volontairement grossier : c'est un ordre de grandeur.
 */
function estimateBike(text: string, ageYears: number): MarketEstimate | undefined {
  const base = BIKE_BASE_NEW.find((b) => b.match.test(text));
  if (!base) return undefined;

  let newPrice = base.base;
  const factors: string[] = [base.label];

  // Marque.
  if (BIKE_BRANDS.premium.test(text)) {
    newPrice *= 1.25;
    factors.push('marque premium');
  } else if (BIKE_BRANDS.budget.test(text)) {
    newPrice *= 0.6;
    factors.push('marque accessible');
  }

  // Cadre carbone : forte prime.
  if (/\bcarbone?\b|\bcarbon\b/.test(text)) {
    newPrice *= 1.55;
    factors.push('cadre carbone');
  } else if (/\balu(minium)?\b/.test(text)) {
    factors.push('cadre alu');
  }

  // Groupe de transmission haut de gamme.
  if (/\b(dura[- ]?ace|red etap|xtr|super record|force)\b/.test(text)) {
    newPrice *= 1.35;
    factors.push('transmission haut de gamme');
  } else if (/\b(ultegra|grx|slx|xt|rival|105)\b/.test(text)) {
    newPrice *= 1.15;
    factors.push('transmission performante');
  }

  // Dépréciation : ~18 %/an, plancher 35 % de la valeur neuve.
  const depreciation = Math.max(0.35, (1 - 0.18) ** Math.max(0, ageYears));
  const usedMid = newPrice * depreciation;

  return {
    newPrice: Math.round(newPrice / 50) * 50,
    usedLow: Math.round((usedMid * 0.8) / 50) * 50,
    usedHigh: Math.round((usedMid * 1.15) / 50) * 50,
    basis: factors.join(', '),
    // Précise dès qu'un signal de gamme a été identifié (marque, matière ou
    // groupe) ; un simple « vélo de route » sans indice reste indicatif.
    precise: factors.length >= 2,
  };
}

/** Ordres de grandeur de prix neuf par famille, dernier recours par domaine. */
const DOMAIN_HINTS: Partial<
  Record<ListingDomain, { newPrice: number; usedRatio: number; label: string }>
> = {
  electronics: { newPrice: 400, usedRatio: 0.5, label: 'appareil électronique' },
  furniture: { newPrice: 500, usedRatio: 0.35, label: 'meuble' },
  fashion: { newPrice: 120, usedRatio: 0.4, label: 'article de mode' },
  sport_leisure: { newPrice: 300, usedRatio: 0.5, label: 'équipement de sport' },
  diy_garden: { newPrice: 250, usedRatio: 0.5, label: 'outil / jardin' },
  baby_kids: { newPrice: 150, usedRatio: 0.35, label: 'puériculture' },
  collectible: { newPrice: 200, usedRatio: 1, label: 'objet de collection' },
};

/** Extrait l'année déclarée, pour dater la dépréciation. */
function extractYear(text: string): number | undefined {
  const now = new Date().getFullYear();
  const matches = text.match(/\b(19[89]\d|20[0-4]\d)\b/g);
  if (!matches) return undefined;
  const years = matches.map(Number).filter((y) => y >= 1990 && y <= now + 1);
  return years.length ? Math.max(...years) : undefined;
}

/**
 * Estimation de catégorie : un ordre de grandeur du prix neuf et de la
 * fourchette d'occasion, quand aucune référence exacte n'existe.
 *
 * Retourne `undefined` si l'on ne peut vraiment rien estimer — dans ce cas
 * seules les recherches pré-remplies sont proposées.
 */
export function estimateCategoryPrice(listing: Listing): MarketEstimate | undefined {
  const text = normalize(`${listing.title} ${listing.description}`);
  const year = extractYear(text);
  const ageYears = year ? Math.max(0, new Date().getFullYear() - year) : 3;

  // Estimateur spécialisé vélo (cas très fréquent et à forte valeur).
  const bike = estimateBike(text, ageYears);
  if (bike) return bike;

  // Repli générique par domaine, dernier recours volontairement large.
  const hint = DOMAIN_HINTS[listing.domain];
  if (!hint) return undefined;

  const depreciation = Math.max(0.3, (1 - 0.2) ** ageYears);
  const usedMid = hint.newPrice * (hint.usedRatio || depreciation);
  return {
    newPrice: hint.newPrice,
    usedLow: Math.round(usedMid * 0.6),
    usedHigh: Math.round(usedMid * 1.3),
    basis: `${hint.label} (ordre de grandeur par catégorie)`,
    // Trop grossier pour juger le prix : sert uniquement à donner un repère.
    precise: false,
  };
}
