/**
 * @veritas/core — socle partagé de la plateforme.
 *
 * Ce paquet ne contient aucune logique métier d'analyse : uniquement les
 * contrats de données, la validation, les erreurs et les primitives
 * mathématiques et textuelles réutilisées partout ailleurs.
 */

export * from './types/listing';
export * from './types/criteria';
export * from './types/analysis';
export * from './types/chat';
export * from './schemas';
export * from './errors';
export * from './verdict';

export * as textUtils from './utils/text';
export * as stats from './utils/stats';
export * as money from './utils/money';

export {
  normalize,
  sanitize,
  tokenize,
  words,
  sentences,
  textSimilarity,
  editSimilarity,
  contentHash,
  excerptAround,
  isNegated,
  truncate,
  redact,
  extractAll,
  CONTACT_PATTERNS,
} from './utils/text';

export {
  clamp,
  sigmoid,
  logit,
  ramp,
  inverseRamp,
  round,
  weightedMean,
  bayesianAverage,
  likelihoodRatio,
  robustZScore,
} from './utils/stats';
export { parseMoney, formatMoney, formatPercent, findAllPrices } from './utils/money';
export { createId, nowIso, daysBetween, relativeTime, idTimestamp } from './utils/id';

/** Version du contrat de données. Incrémentée à chaque changement incompatible. */
export const CORE_VERSION = '0.1.0';
