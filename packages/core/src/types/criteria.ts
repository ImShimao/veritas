/**
 * Définition d'un critère d'analyse.
 *
 * Un critère est une règle nommée, pondérée et documentée. Le moteur n'évalue
 * jamais « un score » directement : il produit des signaux rattachés à des
 * critères, ce qui garantit que chaque point de score est explicable et
 * traçable jusqu'à sa preuve.
 */

export const CRITERION_CATEGORIES = [
  'listing',
  'text',
  'price',
  'seller',
  'image',
  'web',
  'payment',
  'behavior',
] as const;

export type CriterionCategory = (typeof CRITERION_CATEGORIES)[number];

export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Polarity = 'positive' | 'negative' | 'neutral';

/** Les trois dimensions indépendantes du score. */
export const SCORE_DIMENSIONS = ['authenticity', 'trust', 'risk'] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];

/**
 * Impact d'un critère sur chaque dimension, exprimé en log-odds.
 *
 * Convention : une valeur positive pousse la dimension vers le haut.
 * Pour `risk`, une valeur positive augmente donc le risque.
 */
export type DimensionImpact = Partial<Record<ScoreDimension, number>>;

export interface Criterion {
  /** Identifiant stable et hiérarchique : `text.urgency.artificial_deadline`. */
  id: string;
  category: CriterionCategory;
  /** Libellé court affiché à l'utilisateur. */
  label: string;
  /** Explication pédagogique du critère, indépendante d'une annonce donnée. */
  rationale: string;
  polarity: Polarity;
  severity: Severity;
  /** Poids de base du critère, multiplié par la force du signal détecté. */
  weight: number;
  impact: DimensionImpact;
  /** Restreint le critère à certaines familles de biens. Vide = universel. */
  domains?: string[];
  /** Restreint le critère à certaines plateformes. Vide = universel. */
  platforms?: string[];
  /** Le critère peut-il être recalibré par l'apprentissage ? */
  learnable?: boolean;
  /** Références documentaires (sources officielles, signalements). */
  references?: string[];
}
