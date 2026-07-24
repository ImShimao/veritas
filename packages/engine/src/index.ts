/**
 * @veritas/engine — le moteur d'analyse Veritas.
 *
 * Analyse déterministe, explicable et entièrement locale : aucune requête vers
 * un service tiers, aucune clé d'API. Chaque point de score est rattaché à un
 * critère nommé, documenté et pondéré, lui-même appuyé sur une preuve citable.
 */

export { VeritasEngine, ENGINE_VERSION, buildCorpusEntry } from './engine';
export type { EngineOptions, AnalyzeOptions } from './engine';

export { CriterionRegistry, createDefaultRegistry, defineCriteria } from './criteria';
export type { CriterionSpec } from './criteria';

export { CalibrationTable, MULTIPLIER_BOUNDS } from './learning/calibration';
export type { CalibrationSnapshot, CriterionStats } from './learning/calibration';

export { aggregate } from './scoring/aggregator';
export type { AggregationInput, AggregationOutput } from './scoring/aggregator';
export { buildRecommendations, buildQuestions } from './scoring/recommendations';
export { buildSummary, buildHighlights } from './scoring/summary';

export type {
  Analyzer,
  AnalyzerContext,
  AnalyzerResult,
  CorpusEntry,
  SignalDraft,
} from './analyzers/types';
export { inapplicable } from './analyzers/types';
export { ListingAnalyzer } from './analyzers/listing.analyzer';
export { TextAnalyzer } from './analyzers/text.analyzer';
export { PriceAnalyzer } from './analyzers/price.analyzer';
export { SellerAnalyzer } from './analyzers/seller.analyzer';
export { ImageAnalyzer } from './analyzers/image.analyzer';
export { WebAnalyzer } from './analyzers/web.analyzer';
export { TransactionAnalyzer } from './analyzers/transaction.analyzer';
export { ContextAnalyzer } from './analyzers/context.analyzer';

export { DOMAIN_PROFILES, inferDomain, getProfile } from './knowledge/domain-profiles';
export type { DomainProfile } from './knowledge/domain-profiles';
export { PLATFORM_PROFILES, getPlatformProfile } from './knowledge/platforms';
export type { PlatformProfile } from './knowledge/platforms';
export { SCAM_LEXICON, CONDITION_TERMS } from './knowledge/scam-lexicon';
export { PRICE_REFERENCES, findReference, expectedUsedPrice } from './knowledge/price-reference';
export { buildMarketSearchLinks, estimateCategoryPrice } from './knowledge/market-estimate';
export type { MarketEstimate } from './knowledge/market-estimate';

export {
  probeImage,
  perceptualSimilarity,
  hammingDistance,
  reverseSearchLinks,
  readDimensionsFromHeader,
  sha256,
  SAME_IMAGE_THRESHOLD,
} from './vision';
export type { ImageProbe } from './vision';
