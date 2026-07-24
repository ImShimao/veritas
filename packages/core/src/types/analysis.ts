import type { CriterionCategory, ScoreDimension, Severity, Polarity } from './criteria';
import type { Listing } from './listing';

/** Preuve attachée à un constat : c'est ce qui rend le rapport auditable. */
export interface Evidence {
  kind: 'text' | 'number' | 'image' | 'link' | 'metadata' | 'comparison';
  label: string;
  /** Valeur brute (extrait, montant, URL…). */
  value: string;
  /** Extrait exact du contenu analysé, pour surlignage dans l'interface. */
  excerpt?: string;
  /** Index de caractères dans la description, pour le surlignage. */
  span?: { start: number; end: number };
  /** Identifiant de l'image concernée, le cas échéant. */
  imageId?: string;
}

/** Un critère effectivement déclenché sur une annonce précise. */
export interface Finding {
  criterionId: string;
  category: CriterionCategory;
  label: string;
  /** Explication contextualisée : pourquoi CE critère se déclenche sur CETTE annonce. */
  explanation: string;
  severity: Severity;
  polarity: Polarity;
  /** Certitude que le signal est réellement présent, 0 à 1. */
  strength: number;
  /** Poids effectif après calibration par l'apprentissage. */
  weight: number;
  /** Contribution signée à chaque dimension, en log-odds. */
  contribution: Partial<Record<ScoreDimension, number>>;
  evidence: Evidence[];
}

export interface Scores {
  /** L'annonce décrit-elle un bien réel, non copié, non fabriqué ? 0 à 100. */
  authenticity: number;
  /** Peut-on faire confiance à la transaction et au vendeur ? 0 à 100. */
  trust: number;
  /** Probabilité d'issue défavorable. 0 à 100. */
  risk: number;
}

export const VERDICTS = ['safe', 'likely_safe', 'caution', 'risky', 'dangerous'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface CategoryScore {
  category: CriterionCategory;
  /** Score de santé de la catégorie, 0 à 100. */
  score: number;
  /** Nombre de critères évalués dans cette catégorie. */
  evaluated: number;
  /** Nombre de critères déclenchés. */
  triggered: number;
  /** L'analyseur a-t-il disposé des données nécessaires ? */
  applicable: boolean;
  /** Raison d'une catégorie non applicable (« aucune photo fournie »). */
  unavailableReason?: string;
}

export type RecommendationKind =
  'verification' | 'payment' | 'meeting' | 'communication' | 'documentation' | 'abort';

export interface Recommendation {
  id: string;
  kind: RecommendationKind;
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  detail: string;
  /** Constats qui justifient cette recommandation. */
  because: string[];
}

export interface PriceAssessment {
  observed: number;
  currency: string;
  /** Statistiques du marché de référence. */
  market?: {
    mean: number;
    median: number;
    p10: number;
    p90: number;
    stdDev: number;
    sampleSize: number;
    /** Provenance : référentiel embarqué, historique local, ou comparaison en direct. */
    source: 'builtin' | 'history' | 'live';
    label: string;
  };
  /** Écart relatif au marché : -0.45 = 45 % sous le marché. */
  deviation?: number;
  /** Écart exprimé en écarts-types. */
  zScore?: number;
  /** Décote attendue compte tenu de l'âge et de l'état déclarés. */
  expectedDiscount?: number;
  /** Part de la décote qui reste inexpliquée après prise en compte de l'état. */
  unexplainedDiscount?: number;
  verdict: 'suspicious_low' | 'below_market' | 'fair' | 'above_market' | 'unknown';
  explanation: string;
}

export interface ImageAssessment {
  imageId: string;
  /** Empreinte perceptuelle : identique entre deux annonces = même photo. */
  perceptualHash?: string;
  /** Empreinte cryptographique du fichier. */
  sha256?: string;
  width?: number;
  height?: number;
  megapixels?: number;
  /** Estimation du taux de compression JPEG. */
  qualityEstimate?: number;
  /** Score d'anomalie de niveau d'erreur (ELA), 0 à 1. */
  elaScore?: number;
  /** Indices de recadrage / capture d'écran / photo d'écran. */
  flags: string[];
  metadataPresent: boolean;
  /** URLs de recherche d'image inversée prêtes à l'emploi. */
  reverseSearch: { engine: string; url: string }[];
  notes: string[];
}

export interface DuplicateMatch {
  kind: 'text' | 'image' | 'title';
  /** Similarité 0 à 1. */
  similarity: number;
  /** Analyse locale déjà connue partageant ce contenu. */
  analysisId?: string;
  listingUrl?: string;
  platform?: string;
  excerpt?: string;
}

export interface AnalysisTimings {
  totalMs: number;
  perAnalyzer: Record<string, number>;
}

export interface AnalysisReport {
  id: string;
  createdAt: string;
  engineVersion: string;
  listing: Listing;
  scores: Scores;
  verdict: Verdict;
  /** Confiance du moteur dans sa propre analyse (dépend des données disponibles). */
  metaConfidence: number;
  /** Part des champs exploitables réellement disponibles, 0 à 1. */
  dataCompleteness: number;
  categories: CategoryScore[];
  findings: Finding[];
  price?: PriceAssessment;
  images: ImageAssessment[];
  duplicates: DuplicateMatch[];
  recommendations: Recommendation[];
  questionsForSeller: string[];
  /** Résumé rédigé, deux à quatre phrases. */
  summary: string;
  /** Nombre total de critères passés en revue. */
  criteriaEvaluated: number;
  timings: AnalysisTimings;
  /** Avertissements techniques (analyseur indisponible, image inaccessible…). */
  warnings: string[];
}

/** Retour utilisateur, matière première de l'apprentissage. */
export interface FeedbackRecord {
  id: string;
  analysisId: string;
  createdAt: string;
  /** Issue réelle constatée par l'utilisateur. */
  outcome: 'scam' | 'legitimate' | 'unknown';
  /** Constats que l'utilisateur juge pertinents. */
  agreedFindings?: string[];
  /** Constats que l'utilisateur juge faux. */
  disputedFindings?: string[];
  comment?: string;
}

/** Alerte produite par la surveillance d'une annonce. */
export interface WatchAlert {
  id: string;
  watchId: string;
  analysisId: string;
  createdAt: string;
  kind:
    | 'price_changed'
    | 'listing_removed'
    | 'images_changed'
    | 'text_changed'
    | 'seller_changed'
    | 'similar_listing'
    | 'score_changed';
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
  read?: boolean;
}

export interface Watch {
  id: string;
  analysisId: string;
  url: string;
  createdAt: string;
  lastCheckedAt?: string;
  nextCheckAt?: string;
  active: boolean;
  intervalMs: number;
  /** Empreinte de l'état observé lors du dernier passage. */
  snapshot?: {
    price?: number;
    titleHash?: string;
    descriptionHash?: string;
    imageHashes?: string[];
    riskScore?: number;
    available: boolean;
  };
  failures?: number;
}
