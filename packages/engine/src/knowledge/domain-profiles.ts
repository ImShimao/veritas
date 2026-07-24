import type { ListingDomain } from '@veritas/core';

/**
 * Profils par famille de biens.
 *
 * Ils indiquent au moteur ce qu'une annonce sérieuse devrait contenir pour ce
 * type de bien, et comment la valeur se déprécie. C'est ce qui permet de dire
 * « il manque le kilométrage » plutôt que « il manque des informations ».
 */

export interface ExpectedAttribute {
  key: string;
  label: string;
  /** Motifs recherchés dans le texte normalisé lorsque l'attribut structuré est absent. */
  patterns: RegExp[];
  /** Un manque sur un attribut critique pèse plus lourd. */
  critical?: boolean;
}

export interface DomainProfile {
  domain: ListingDomain;
  label: string;
  /** Mots-clés servant à deviner la famille depuis le titre et la description. */
  keywords: RegExp[];
  expectedAttributes: ExpectedAttribute[];
  /** Taux de dépréciation annuel typique, utilisé pour estimer la décote normale. */
  annualDepreciation: number;
  /** Décote maximale plancher : un bien ancien conserve une valeur résiduelle. */
  residualFloor: number;
  /** Décote attendue selon l'état déclaré, appliquée au prix neuf. */
  conditionDiscount: Record<string, number>;
  /** Seuil au-delà duquel le montant justifie des vérifications renforcées. */
  highValueThreshold: number;
}

/**
 * Abattement lié à l'état déclaré.
 *
 * Ces valeurs s'appliquent **après** la dépréciation liée à l'âge, laquelle
 * intègre déjà l'usure d'un exemplaire moyen. Elles ne mesurent donc que
 * l'écart à cet exemplaire moyen, et restent volontairement modérées : les
 * cumuler avec la décote d'âge à pleine amplitude reviendrait à compter deux
 * fois la même usure, et ferait passer pour suspecte toute annonce honnête.
 */
const COMMON_CONDITION_DISCOUNT = {
  new: 0,
  excellent: 0.04,
  good: 0.12,
  fair: 0.24,
  poor: 0.5,
  unknown: 0.1,
};

export const DOMAIN_PROFILES: Record<ListingDomain, DomainProfile> = {
  vehicle: {
    domain: 'vehicle',
    label: 'Véhicule',
    keywords: [
      /\b(voiture|auto|automobile|berline|break|suv|citadine|utilitaire|camion|moto|scooter|quad|caravane|camping ?car)\b/,
      /\b(peugeot|renault|citroen|volkswagen|audi|bmw|mercedes|toyota|ford|opel|fiat|nissan|dacia|skoda|seat|kia|hyundai|tesla|volvo|mini|porsche)\b/,
      /\b\d{2,3} ?000 ?km\b/,
      /\b(diesel|essence|hybride|electrique)\b.*\b(boite|manuelle|automatique)\b/,
    ],
    expectedAttributes: [
      {
        key: 'year',
        label: 'Année de mise en circulation',
        patterns: [/\b(19[89]\d|20[0-4]\d)\b/, /\bannee\s*:?\s*\d{4}\b/],
        critical: true,
      },
      {
        key: 'mileage',
        label: 'Kilométrage',
        patterns: [/\b\d[\d\s.]{2,8}\s?km\b/, /\bkilometrage\s*:?\s*\d/],
        critical: true,
      },
      {
        key: 'fuel',
        label: 'Carburant',
        patterns: [/\b(diesel|essence|gpl|hybride|electrique)\b/],
      },
      {
        key: 'gearbox',
        label: 'Boîte de vitesses',
        patterns: [/\bboite\s*(de vitesses?)?\s*(manuelle|automatique|auto)\b/, /\b(bva|bvm)\b/],
      },
      {
        key: 'technical_inspection',
        label: 'Contrôle technique',
        patterns: [/\bcontrole technique\b/, /\bct\s*(ok|vierge|valide|a jour)\b/],
        critical: true,
      },
      {
        key: 'service_history',
        label: "Carnet d'entretien",
        patterns: [/\b(carnet d'entretien|revisions?|entretien(s)? (a jour|suivi))\b/],
      },
      {
        key: 'registration',
        label: 'Carte grise',
        patterns: [/\b(carte grise|certificat d'immatriculation)\b/],
      },
    ],
    annualDepreciation: 0.13,
    residualFloor: 0.12,
    conditionDiscount: COMMON_CONDITION_DISCOUNT,
    highValueThreshold: 4000,
  },

  electronics: {
    domain: 'electronics',
    label: 'Électronique',
    keywords: [
      /\b(iphone|samsung|galaxy|xiaomi|huawei|pixel|oneplus|smartphone|telephone portable)\b/,
      /\b(macbook|ordinateur|pc portable|laptop|imac|thinkpad|chromebook)\b/,
      /\b(playstation|ps[45]|xbox|nintendo|switch|console)\b/,
      /\b(televiseur|tv oled|qled|casque|airpods|apple watch|tablette|ipad|appareil photo|reflex|gopro|drone)\b/,
      /\b(rtx|geforce|ryzen|intel core|ssd|processeur|carte graphique)\b/,
    ],
    expectedAttributes: [
      {
        key: 'model',
        label: 'Modèle exact',
        patterns: [/\b(pro|max|plus|ultra|mini|air|se)\b/, /\b\d{2,4}\s?(go|gb|to|tb)\b/],
        critical: true,
      },
      {
        key: 'capacity',
        label: 'Capacité de stockage',
        patterns: [/\b\d{2,4}\s?(go|gb|to|tb)\b/],
      },
      {
        key: 'battery',
        label: 'État de la batterie',
        patterns: [/\bbatterie\b.*\b\d{2,3} ?%/, /\bsante de la batterie\b/, /\bautonomie\b/],
      },
      {
        key: 'unlocked',
        label: 'Désimlockage / opérateur',
        patterns: [/\b(debloque|desimlocke|tout operateur|libre)\b/],
      },
      {
        key: 'accessories',
        label: 'Accessoires fournis',
        patterns: [/\b(chargeur|cable|boite d'origine|emballage|coque)\b/],
      },
      {
        key: 'warranty',
        label: 'Garantie',
        patterns: [/\bgarantie\b/, /\bfacture\b/],
      },
    ],
    // Moyenne toutes catégories confondues ; les modèles premium, qui se
    // déprécient plus lentement, portent leur propre taux dans le référentiel.
    annualDepreciation: 0.2,
    residualFloor: 0.08,
    conditionDiscount: COMMON_CONDITION_DISCOUNT,
    highValueThreshold: 500,
  },

  fashion: {
    domain: 'fashion',
    label: 'Mode et accessoires',
    keywords: [
      /\b(robe|veste|manteau|pantalon|jean|chemise|pull|sweat|basket|sneakers|chaussures|bottes|sac a main|sac)\b/,
      /\b(nike|adidas|zara|levis|the north face|lacoste|ralph lauren|louis vuitton|gucci|chanel|hermes|dior|prada|rolex)\b/,
      /\btaille\s*(xs|s|m|l|xl|xxl|\d{2})\b/,
    ],
    expectedAttributes: [
      {
        key: 'size',
        label: 'Taille',
        patterns: [/\btaille\s*:?\s*(xs|s|m|l|xl|xxl|\d{2,3})\b/],
        critical: true,
      },
      { key: 'brand', label: 'Marque', patterns: [/\bmarque\s*:?\s*\w+/], critical: true },
      {
        key: 'material',
        label: 'Matière',
        patterns: [/\b(coton|cuir|laine|soie|lin|polyester|daim)\b/],
      },
      {
        key: 'authenticity',
        label: "Preuve d'authenticité",
        patterns: [/\b(facture|certificat|carte d'authenticite|dustbag|serial)\b/],
        critical: true,
      },
      {
        key: 'condition_detail',
        label: 'État détaillé',
        patterns: [/\b(porte|neuf|jamais porte|usure)\b/],
      },
    ],
    annualDepreciation: 0.3,
    residualFloor: 0.1,
    conditionDiscount: COMMON_CONDITION_DISCOUNT,
    highValueThreshold: 300,
  },

  furniture: {
    domain: 'furniture',
    label: 'Mobilier et décoration',
    keywords: [
      /\b(canape|fauteuil|table|chaise|armoire|commode|lit|matelas|bureau|etagere|bibliotheque|buffet)\b/,
      /\b(ikea|maisons du monde|conforama|but|roche bobois|made\.com)\b/,
    ],
    expectedAttributes: [
      {
        key: 'dimensions',
        label: 'Dimensions',
        patterns: [/\b\d{2,3}\s?(x|par)\s?\d{2,3}\b/, /\b(largeur|hauteur|profondeur)\b/],
        critical: true,
      },
      {
        key: 'material',
        label: 'Matériau',
        patterns: [/\b(bois|chene|hetre|metal|verre|tissu|cuir|rotin)\b/],
      },
      {
        key: 'delivery',
        label: "Modalités d'enlèvement",
        patterns: [/\b(enlevement|a demonter|sur place|livraison)\b/],
      },
    ],
    annualDepreciation: 0.15,
    residualFloor: 0.1,
    conditionDiscount: COMMON_CONDITION_DISCOUNT,
    highValueThreshold: 600,
  },

  real_estate: {
    domain: 'real_estate',
    label: 'Immobilier',
    keywords: [
      /\b(appartement|maison|studio|t[1-6]\b|f[1-6]\b|villa|loft|duplex|terrain|local commercial)\b/,
      /\b\d{2,4}\s?m2\b/,
      /\b(loyer|charges comprises|dpe|copropriete)\b/,
    ],
    expectedAttributes: [
      { key: 'surface', label: 'Surface', patterns: [/\b\d{2,4}\s?m2\b/], critical: true },
      {
        key: 'rooms',
        label: 'Nombre de pièces',
        patterns: [/\b(t|f)[1-6]\b/, /\b\d+ pieces?\b/],
        critical: true,
      },
      {
        key: 'energy',
        label: 'Diagnostic énergétique',
        patterns: [/\bdpe\b/, /\bclasse energie\b/],
        critical: true,
      },
      { key: 'charges', label: 'Charges', patterns: [/\bcharges?\b/] },
      {
        key: 'address_area',
        label: 'Quartier ou secteur',
        patterns: [/\b(quartier|secteur|proche|a \d+ ?min)\b/],
      },
    ],
    annualDepreciation: 0.0,
    residualFloor: 0.8,
    conditionDiscount: { new: 0, excellent: 0.05, good: 0.1, fair: 0.2, poor: 0.35, unknown: 0.1 },
    highValueThreshold: 50_000,
  },

  rental_stay: {
    domain: 'rental_stay',
    label: 'Location de séjour',
    keywords: [
      /\b(location saisonniere|gite|chambre d'hotes|airbnb|booking|sejour|nuitee|par nuit|par semaine)\b/,
      /\b(appartement|villa|studio)\b.*\b(vacances|week[ -]?end|sejour)\b/,
    ],
    expectedAttributes: [
      {
        key: 'capacity',
        label: "Capacité d'accueil",
        patterns: [/\b\d+ (personnes?|couchages?|voyageurs?)\b/],
        critical: true,
      },
      {
        key: 'address_area',
        label: 'Localisation précise',
        patterns: [/\b(quartier|rue|proche|a \d+ ?(min|km))\b/],
        critical: true,
      },
      {
        key: 'amenities',
        label: 'Équipements',
        patterns: [/\b(wifi|cuisine|parking|piscine|climatisation|lave[- ]linge)\b/],
      },
      {
        key: 'cancellation',
        label: "Conditions d'annulation",
        patterns: [/\b(annulation|remboursement|caution)\b/],
      },
    ],
    annualDepreciation: 0,
    residualFloor: 1,
    conditionDiscount: { new: 0, excellent: 0, good: 0, fair: 0.1, poor: 0.25, unknown: 0.05 },
    highValueThreshold: 800,
  },

  collectible: {
    domain: 'collectible',
    label: 'Collection',
    keywords: [
      /\b(collection|vintage|ancien|antiquite|piece de collection|timbre|monnaie|carte pokemon|figurine|vinyle)\b/,
      /\b(edition limitee|numerote|certifie|psa|gradee?)\b/,
    ],
    expectedAttributes: [
      {
        key: 'provenance',
        label: 'Provenance',
        patterns: [/\b(provenance|origine|acquis|succession|collection privee)\b/],
        critical: true,
      },
      {
        key: 'authenticity',
        label: "Certificat d'authenticité",
        patterns: [/\b(certificat|expertise|authentifie|grade|psa|bgs)\b/],
        critical: true,
      },
      {
        key: 'condition_detail',
        label: 'État détaillé',
        patterns: [/\b(etat|conservation|nm|mint|neuf)\b/],
      },
    ],
    annualDepreciation: -0.02,
    residualFloor: 0.5,
    conditionDiscount: COMMON_CONDITION_DISCOUNT,
    highValueThreshold: 400,
  },

  sport_leisure: {
    domain: 'sport_leisure',
    label: 'Sport et loisirs',
    keywords: [
      /\b(velo|vtt|vae|trottinette|ski|snowboard|surf|golf|tapis de course|home trainer|kayak|paddle)\b/,
      /\b(decathlon|specialized|trek|giant|cannondale|btwin|rockrider)\b/,
    ],
    expectedAttributes: [
      {
        key: 'size',
        label: "Taille du cadre ou de l'équipement",
        patterns: [/\btaille\b/, /\b\d{2}\s?(cm|pouces)\b/],
        critical: true,
      },
      {
        key: 'usage',
        label: 'Usage et kilométrage',
        patterns: [/\b(peu servi|\d+ ?km|saisons?)\b/],
      },
      {
        key: 'maintenance',
        label: 'Entretien',
        patterns: [/\b(revision|entretenu|neuf|change)\b/],
      },
    ],
    annualDepreciation: 0.2,
    residualFloor: 0.1,
    conditionDiscount: COMMON_CONDITION_DISCOUNT,
    highValueThreshold: 500,
  },

  baby_kids: {
    domain: 'baby_kids',
    label: 'Puériculture et enfant',
    keywords: [/\b(poussette|siege auto|lit bebe|chaise haute|parc|jouet|doudou|vetement bebe)\b/],
    expectedAttributes: [
      {
        key: 'age_range',
        label: 'Âge recommandé',
        patterns: [/\b(\d+ (mois|ans)|naissance)\b/],
        critical: true,
      },
      {
        key: 'safety',
        label: 'Conformité et sécurité',
        patterns: [/\b(norme|ce|homologue|r\d{2})\b/],
        critical: true,
      },
      {
        key: 'condition_detail',
        label: 'État détaillé',
        patterns: [/\b(propre|nettoye|usure|taches?)\b/],
      },
    ],
    annualDepreciation: 0.25,
    residualFloor: 0.08,
    conditionDiscount: COMMON_CONDITION_DISCOUNT,
    highValueThreshold: 250,
  },

  diy_garden: {
    domain: 'diy_garden',
    label: 'Bricolage et jardin',
    keywords: [
      /\b(perceuse|scie|tondeuse|tronconneuse|nettoyeur|compresseur|echafaudage|serre|barbecue|salon de jardin)\b/,
      /\b(bosch|makita|dewalt|stihl|husqvarna|karcher|ryobi)\b/,
    ],
    expectedAttributes: [
      {
        key: 'power',
        label: 'Puissance ou caractéristiques',
        patterns: [/\b\d{3,4}\s?w\b/, /\b\d{2}\s?v\b/, /\b\d+\s?cm3\b/],
        critical: true,
      },
      {
        key: 'usage',
        label: "Heures d'utilisation",
        patterns: [/\b(peu servi|\d+ ?h|utilise \d+ fois)\b/],
      },
      {
        key: 'accessories',
        label: 'Accessoires',
        patterns: [/\b(coffret|malette|lames?|batteries?|chargeur)\b/],
      },
    ],
    annualDepreciation: 0.18,
    residualFloor: 0.1,
    conditionDiscount: COMMON_CONDITION_DISCOUNT,
    highValueThreshold: 400,
  },

  service: {
    domain: 'service',
    label: 'Service',
    keywords: [
      /\b(prestation|cours particuliers|depannage|demenagement|travaux|coaching|reparation)\b/,
    ],
    expectedAttributes: [
      {
        key: 'qualification',
        label: 'Qualification',
        patterns: [/\b(diplome|certifie|siret|assurance|rge)\b/],
        critical: true,
      },
      {
        key: 'scope',
        label: 'Périmètre de la prestation',
        patterns: [/\b(comprend|inclus|forfait|par heure)\b/],
      },
      {
        key: 'insurance',
        label: 'Assurance professionnelle',
        patterns: [/\b(assurance|decennale|rc pro)\b/],
        critical: true,
      },
    ],
    annualDepreciation: 0,
    residualFloor: 1,
    conditionDiscount: { new: 0, excellent: 0, good: 0, fair: 0, poor: 0, unknown: 0 },
    highValueThreshold: 1000,
  },

  other: {
    domain: 'other',
    label: 'Autre',
    keywords: [],
    expectedAttributes: [
      { key: 'description_detail', label: 'Description détaillée', patterns: [/\w{60,}/] },
      {
        key: 'condition_detail',
        label: 'État du bien',
        patterns: [/\b(neuf|bon etat|usure|defaut)\b/],
        critical: true,
      },
    ],
    annualDepreciation: 0.2,
    residualFloor: 0.1,
    conditionDiscount: COMMON_CONDITION_DISCOUNT,
    highValueThreshold: 500,
  },
};

/** Devine la famille de bien à partir du titre, de la catégorie et de la description. */
export function inferDomain(normalizedText: string): ListingDomain {
  let best: { domain: ListingDomain; score: number } = { domain: 'other', score: 0 };

  for (const profile of Object.values(DOMAIN_PROFILES)) {
    let score = 0;
    for (const keyword of profile.keywords) {
      if (keyword.test(normalizedText)) score += 1;
    }
    if (score > best.score) best = { domain: profile.domain, score };
  }

  return best.domain;
}

export function getProfile(domain: ListingDomain): DomainProfile {
  return DOMAIN_PROFILES[domain] ?? DOMAIN_PROFILES.other;
}
