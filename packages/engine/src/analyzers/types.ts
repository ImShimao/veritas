import type {
  CriterionCategory,
  DuplicateMatch,
  Evidence,
  ImageAssessment,
  Listing,
  PriceAssessment,
} from '@veritas/core';
import type { CriterionRegistry } from '../criteria';
import type { CalibrationTable } from '../learning/calibration';

/**
 * Entrée du corpus local utilisée pour la détection de doublons.
 * Volontairement réduite à des empreintes : le moteur n'a jamais besoin
 * du contenu intégral des analyses précédentes.
 */
export interface CorpusEntry {
  analysisId: string;
  listingUrl?: string;
  platform?: string;
  titleHash: string;
  descriptionHash: string;
  /** Texte normalisé tronqué, pour calculer une similarité partielle. */
  descriptionSample?: string;
  title?: string;
  imageHashes: string[];
  sellerAlias?: string;
  contactHashes?: string[];
  riskScore: number;
  createdAt: string;
  /** Prix observé, utilisé comme comparable de marché pour les analyses suivantes. */
  price?: number;
  currency?: string;
  domain?: string;
}

export interface AnalyzerContext {
  listing: Listing;
  now: Date;
  registry: CriterionRegistry;
  calibration: CalibrationTable;
  corpus: CorpusEntry[];
  /** Contexte libre saisi par l'utilisateur. */
  notes?: string;
  /** Coupe les traitements coûteux (téléchargement d'images notamment). */
  budgetMs: number;
  /**
   * Récupération d'une image distante, injectée par l'hôte.
   *
   * Le moteur ne sort jamais sur le réseau de lui-même : c'est l'API qui décide
   * de la politique (délais, taille maximale, domaines autorisés, robots.txt).
   * Sans cette fonction, seules les images fournies en data-URI sont analysées.
   */
  fetchImage?: (url: string) => Promise<Buffer | undefined>;
  /** Journalisation optionnelle injectée par l'hôte. */
  log?: (message: string, details?: Record<string, unknown>) => void;
}

/** Signal brut émis par un analyseur, avant pondération et agrégation. */
export interface SignalDraft {
  criterionId: string;
  /** Certitude que le signal est présent, 0 à 1. */
  strength: number;
  /** Explication contextualisée, rédigée pour l'utilisateur final. */
  explanation: string;
  evidence?: Evidence[];
  /** Multiplicateur ponctuel du poids, pour moduler un cas particulier. */
  weightMultiplier?: number;
}

export interface AnalyzerResult {
  name: string;
  category: CriterionCategory;
  /** Faux lorsque les données nécessaires manquent : la catégorie est alors neutralisée. */
  applicable: boolean;
  unavailableReason?: string;
  /** Nombre de critères réellement passés en revue par cet analyseur. */
  evaluated: number;
  signals: SignalDraft[];
  /** Sous-produits structurés exposés tels quels dans le rapport. */
  price?: PriceAssessment;
  images?: ImageAssessment[];
  duplicates?: DuplicateMatch[];
  warnings?: string[];
  /** Champs exploitables présents / attendus, pour le calcul de complétude. */
  completeness?: { available: number; expected: number };
}

export interface Analyzer {
  readonly name: string;
  readonly category: CriterionCategory;
  run(context: AnalyzerContext): Promise<AnalyzerResult>;
}

/** Fabrique un résultat vide, utilisée quand un analyseur ne peut pas s'exécuter. */
export function inapplicable(
  name: string,
  category: CriterionCategory,
  reason: string,
  signals: SignalDraft[] = [],
): AnalyzerResult {
  return {
    name,
    category,
    applicable: false,
    unavailableReason: reason,
    evaluated: 0,
    signals,
  };
}
