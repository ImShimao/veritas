import {
  contentHash,
  createId,
  deriveVerdict,
  normalize,
  nowIso,
  truncate,
  type AnalysisReport,
  type Listing,
} from '@veritas/core';
import { createDefaultRegistry, CriterionRegistry } from './criteria';
import { inferDomain } from './knowledge/domain-profiles';
import { CalibrationTable } from './learning/calibration';
import { aggregate } from './scoring/aggregator';
import { buildQuestions, buildRecommendations } from './scoring/recommendations';
import { buildSummary } from './scoring/summary';
import type { Analyzer, AnalyzerContext, AnalyzerResult, CorpusEntry } from './analyzers/types';
import { ListingAnalyzer } from './analyzers/listing.analyzer';
import { TextAnalyzer } from './analyzers/text.analyzer';
import { PriceAnalyzer } from './analyzers/price.analyzer';
import { SellerAnalyzer } from './analyzers/seller.analyzer';
import { ImageAnalyzer } from './analyzers/image.analyzer';
import { WebAnalyzer } from './analyzers/web.analyzer';
import { TransactionAnalyzer } from './analyzers/transaction.analyzer';
import { ContextAnalyzer } from './analyzers/context.analyzer';

export const ENGINE_VERSION = '0.1.0';

export interface EngineOptions {
  /** Registre de critères. Permet d'en désactiver ou d'en ajouter sans toucher au moteur. */
  registry?: CriterionRegistry;
  /** Table de calibration issue des retours utilisateurs. */
  calibration?: CalibrationTable;
  /** Chaîne d'analyseurs. Ajouter un analyseur revient à ajouter un élément ici. */
  analyzers?: Analyzer[];
  logger?: (message: string, details?: Record<string, unknown>) => void;
}

export interface AnalyzeOptions {
  /** Empreintes des analyses précédentes, pour la détection de contenus recyclés. */
  corpus?: CorpusEntry[];
  /** Contexte libre fourni par l'utilisateur sur ses échanges avec le vendeur. */
  notes?: string;
  /** Téléchargement d'images, injecté par l'hôte (politique réseau, quotas, robots.txt). */
  fetchImage?: (url: string) => Promise<Buffer | undefined>;
  /** Budget temps indicatif transmis aux analyseurs. */
  budgetMs?: number;
}

/**
 * Veritas — moteur d'analyse.
 *
 * Le moteur orchestre une chaîne d'analyseurs indépendants, agrège leurs
 * signaux en scores explicables, puis rédige le rapport. Trois propriétés
 * structurent sa conception :
 *
 * **Déterminisme.** À entrée et calibration identiques, la sortie est
 * identique. C'est ce qui rend le produit auditable et testable, et qui
 * permet de répondre précisément à « pourquoi ce score ? ».
 *
 * **Isolation des pannes.** L'échec d'un analyseur ne fait jamais échouer
 * l'analyse : sa catégorie est marquée non applicable et le rapport le
 * signale. Une image inaccessible ne doit pas priver l'utilisateur de
 * l'analyse du prix.
 *
 * **Extensibilité.** Ajouter une plateforme, un critère ou un analyseur ne
 * demande aucune modification du cœur — seulement une entrée de plus dans le
 * registre ou la chaîne.
 */
export class VeritasEngine {
  readonly registry: CriterionRegistry;
  readonly calibration: CalibrationTable;
  private readonly analyzers: Analyzer[];
  private readonly logger?: EngineOptions['logger'];

  constructor(options: EngineOptions = {}) {
    this.registry = options.registry ?? createDefaultRegistry();
    this.calibration = options.calibration ?? CalibrationTable.empty();
    this.analyzers = options.analyzers ?? VeritasEngine.defaultAnalyzers();
    this.logger = options.logger;
  }

  static defaultAnalyzers(): Analyzer[] {
    return [
      new ListingAnalyzer(),
      new TextAnalyzer(),
      new PriceAnalyzer(),
      new SellerAnalyzer(),
      new ImageAnalyzer(),
      new TransactionAnalyzer(),
      new WebAnalyzer(),
      new ContextAnalyzer(),
    ];
  }

  /** Nom de l'IA, exposé par l'API et affiché dans l'interface. */
  get identity(): { name: string; version: string; criteria: number } {
    return { name: 'Veritas', version: ENGINE_VERSION, criteria: this.registry.size };
  }

  /**
   * Complète la famille de bien lorsqu'elle n'a pas été déterminée en amont.
   *
   * Cette déduction appartient au moteur : ce sont ses référentiels de prix et
   * ses critères qui donnent un sens aux familles. Les extracteurs ne
   * transmettent que ce que la page déclare explicitement.
   */
  private resolveDomain(listing: Listing): Listing {
    if (listing.domain && listing.domain !== 'other') return listing;
    const haystack = normalize(
      `${listing.title} ${listing.category ?? ''} ${listing.description.slice(0, 2000)}`,
    );
    return { ...listing, domain: inferDomain(haystack) };
  }

  async analyze(input: Listing, options: AnalyzeOptions = {}): Promise<AnalysisReport> {
    const startedAt = Date.now();
    const perAnalyzer: Record<string, number> = {};
    const warnings: string[] = [];
    const listing = this.resolveDomain(input);

    const context: AnalyzerContext = {
      listing,
      now: new Date(),
      registry: this.registry,
      calibration: this.calibration,
      corpus: options.corpus ?? [],
      notes: options.notes,
      budgetMs: options.budgetMs ?? 20_000,
      fetchImage: options.fetchImage,
      log: this.logger,
    };

    const results: AnalyzerResult[] = [];

    for (const analyzer of this.analyzers) {
      const analyzerStart = Date.now();
      try {
        results.push(await analyzer.run(context));
      } catch (error) {
        // Un analyseur défaillant dégrade l'analyse, il ne l'interrompt pas.
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`L'analyse « ${analyzer.name} » a échoué : ${message}`);
        this.logger?.('analyzer_failed', { analyzer: analyzer.name, error: message });
        results.push({
          name: analyzer.name,
          category: analyzer.category,
          applicable: false,
          unavailableReason: `Cette dimension n'a pas pu être analysée (${message}).`,
          evaluated: 0,
          signals: [],
        });
      } finally {
        perAnalyzer[analyzer.name] = Date.now() - analyzerStart;
      }
    }

    const aggregation = aggregate({
      results,
      registry: this.registry,
      calibration: this.calibration,
    });

    warnings.push(...aggregation.warnings);

    const verdict = deriveVerdict(aggregation.scores, {
      maxSeverity: aggregation.maxSeverity,
      metaConfidence: aggregation.metaConfidence,
    });

    const price = results.find((r) => r.price)?.price;
    const images = results.flatMap((r) => r.images ?? []);
    const duplicates = results.flatMap((r) => r.duplicates ?? []);

    const recommendationInput = {
      listing,
      findings: aggregation.findings,
      scores: aggregation.scores,
      verdict,
    };

    const report: AnalysisReport = {
      id: createId('an'),
      createdAt: nowIso(),
      engineVersion: ENGINE_VERSION,
      listing,
      scores: aggregation.scores,
      verdict,
      metaConfidence: aggregation.metaConfidence,
      dataCompleteness: aggregation.dataCompleteness,
      categories: aggregation.categories,
      findings: aggregation.findings,
      price,
      images,
      duplicates,
      recommendations: buildRecommendations(recommendationInput),
      questionsForSeller: buildQuestions(recommendationInput),
      summary: buildSummary({
        listing,
        scores: aggregation.scores,
        verdict,
        findings: aggregation.findings,
        price,
        metaConfidence: aggregation.metaConfidence,
        dataCompleteness: aggregation.dataCompleteness,
      }),
      criteriaEvaluated: aggregation.criteriaEvaluated,
      timings: { totalMs: Date.now() - startedAt, perAnalyzer },
      warnings,
    };

    this.logger?.('analysis_completed', {
      analysisId: report.id,
      verdict,
      risk: report.scores.risk,
      durationMs: report.timings.totalMs,
      findings: report.findings.length,
    });

    return report;
  }

  /**
   * Intègre un retour utilisateur dans la table de calibration.
   * Retourne l'instantané à persister par l'hôte.
   */
  learn(
    report: Pick<AnalysisReport, 'findings'>,
    outcome: 'scam' | 'legitimate' | 'unknown',
    options: { agreedFindings?: string[]; disputedFindings?: string[] } = {},
  ): ReturnType<CalibrationTable['toSnapshot']> {
    const triggered = report.findings.map((f) => f.criterionId);
    this.calibration.learn(
      triggered,
      outcome,
      options.agreedFindings ?? [],
      options.disputedFindings ?? [],
    );
    return this.calibration.toSnapshot();
  }

  /** Construit l'empreinte d'un rapport pour alimenter le corpus de comparaison. */
  static toCorpusEntry(report: AnalysisReport): CorpusEntry {
    return buildCorpusEntry(report);
  }
}

/** Empreinte minimale d'un rapport : aucun contenu intégral n'est conservé. */
export function buildCorpusEntry(report: AnalysisReport): CorpusEntry {
  const { listing } = report;
  return {
    analysisId: report.id,
    listingUrl: listing.source.url,
    platform: listing.source.platform,
    titleHash: contentHash(listing.title),
    descriptionHash: contentHash(listing.description),
    // Échantillon normalisé conservé pour la similarité partielle, borné en taille.
    descriptionSample: truncate(normalize(listing.description), 1200),
    title: listing.title,
    imageHashes: report.images
      .map((image) => image.perceptualHash)
      .filter((value): value is string => Boolean(value)),
    sellerAlias: listing.seller?.displayName,
    riskScore: report.scores.risk,
    createdAt: report.createdAt,
    price: listing.price?.amount,
    currency: listing.price?.currency,
    domain: listing.domain,
  };
}
