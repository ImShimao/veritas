import {
  createId,
  nowIso,
  VeritasError,
  type AnalysisInputDto,
  type AnalysisReport,
  type FeedbackDto,
} from '@veritas/core';
import { buildCorpusEntry, CalibrationTable, VeritasEngine } from '@veritas/engine';
import { extractListing } from '@veritas/extractors';
import type { Store } from '../store';
import type { Fetcher } from './fetcher';
import type { Logger } from '../logger';

/**
 * Orchestration d'une analyse.
 *
 * Enchaîne extraction, analyse, persistance et enrichissement du corpus.
 * C'est le seul endroit qui connaît à la fois le stockage et le moteur : les
 * deux restent mutuellement ignorants l'un de l'autre.
 */
export class AnalysisService {
  readonly engine: VeritasEngine;

  constructor(
    private readonly store: Store,
    private readonly fetcher: Fetcher,
    private readonly logger: Logger,
  ) {
    // La calibration apprise lors des sessions précédentes est rechargée au
    // démarrage : l'apprentissage doit survivre au redémarrage du serveur.
    const snapshot = store.loadCalibration();
    this.engine = new VeritasEngine({
      calibration: new CalibrationTable(snapshot),
      logger: (message, details) => logger.debug({ ...details }, message),
    });

    if (snapshot) {
      logger.info(
        { samples: snapshot.samples, criteria: Object.keys(snapshot.criteria).length },
        'Calibration rechargée',
      );
    }
  }

  async analyze(input: AnalysisInputDto): Promise<AnalysisReport> {
    const extraction = await extractListing({
      url: input.url,
      html: input.html,
      text: input.text,
      images: input.images,
      platformHint: input.platformHint,
      domainHint: input.domainHint,
      fetchPage: (url) => this.fetcher.fetchPage(url),
    });

    this.logger.info(
      {
        adapter: extraction.adapter,
        platform: extraction.listing.source.platform,
        extracted: extraction.extractedFields,
        missing: extraction.missingFields,
      },
      'Annonce extraite',
    );

    const report = await this.engine.analyze(extraction.listing, {
      corpus: this.store.corpusEntries(),
      notes: input.notes,
      fetchImage: (url) => this.fetcher.fetchImage(url),
    });

    // Les avertissements d'extraction remontent dans le rapport : l'utilisateur
    // doit savoir ce qui n'a pas pu être lu avant d'interpréter un score.
    report.warnings.push(...extraction.warnings);

    this.persist(report);
    return report;
  }

  /** Relance une analyse à partir d'une annonce déjà extraite (surveillance). */
  async reanalyze(report: AnalysisReport): Promise<AnalysisReport> {
    const fresh = await this.engine.analyze(report.listing, {
      corpus: this.store.corpusEntries(),
      fetchImage: (url) => this.fetcher.fetchImage(url),
    });
    this.persist(fresh);
    return fresh;
  }

  private persist(report: AnalysisReport): void {
    this.store.analyses.put(report);
    // L'empreinte alimente la détection de contenus recyclés des analyses
    // suivantes : c'est ce qui fait grandir la valeur du produit avec l'usage.
    const entry = buildCorpusEntry(report);
    this.store.corpus.put({ ...entry, id: entry.analysisId });
  }

  get(id: string): AnalysisReport {
    const report = this.store.analyses.get(id);
    if (!report) {
      throw new VeritasError('NOT_FOUND', "Cette analyse n'existe pas ou a été supprimée.");
    }
    return report;
  }

  list(options: {
    limit: number;
    offset: number;
    search?: string;
    verdict?: string;
    favoritesOnly?: boolean;
  }) {
    const favorites = new Set(this.store.favorites.all().map((f) => f.analysisId));

    let items = this.store.analyses
      .all()
      // Les identifiants sont triables chronologiquement : tri décroissant = plus récent d'abord.
      .sort((a, b) => b.id.localeCompare(a.id));

    if (options.verdict) {
      items = items.filter((report) => report.verdict === options.verdict);
    }
    if (options.favoritesOnly) {
      items = items.filter((report) => favorites.has(report.id));
    }
    if (options.search) {
      const needle = options.search.toLowerCase();
      items = items.filter(
        (report) =>
          report.listing.title.toLowerCase().includes(needle) ||
          report.listing.source.url?.toLowerCase().includes(needle),
      );
    }

    const total = items.length;
    const page = items.slice(options.offset, options.offset + options.limit);

    return {
      total,
      items: page.map((report) => ({
        id: report.id,
        createdAt: report.createdAt,
        title: report.listing.title,
        platform: report.listing.source.platform,
        url: report.listing.source.url,
        price: report.listing.price,
        thumbnail: report.listing.images[0]?.url,
        scores: report.scores,
        verdict: report.verdict,
        metaConfidence: report.metaConfidence,
        findingCount: report.findings.length,
        favorite: favorites.has(report.id),
      })),
    };
  }

  delete(id: string): void {
    if (!this.store.analyses.has(id)) {
      throw new VeritasError('NOT_FOUND', "Cette analyse n'existe pas.");
    }
    this.store.analyses.delete(id);
    this.store.corpus.delete(id);
    // Les conversations et alertes rattachées n'ont plus d'objet.
    for (const chat of this.store.chats.find((session) => session.analysisId === id)) {
      this.store.chats.delete(chat.id);
    }
    for (const watch of this.store.watches.find((item) => item.analysisId === id)) {
      this.store.watches.delete(watch.id);
    }
  }

  toggleFavorite(analysisId: string): boolean {
    this.get(analysisId);
    const existing = this.store.favorites.findOne((f) => f.analysisId === analysisId);
    if (existing) {
      this.store.favorites.delete(existing.id);
      return false;
    }
    this.store.favorites.put({ id: createId('fav'), analysisId, createdAt: nowIso() });
    return true;
  }

  /**
   * Enregistre un retour utilisateur et met à jour la calibration.
   *
   * C'est le mécanisme d'apprentissage : un critère qui se déclenche aussi
   * souvent sur les annonces honnêtes que sur les frauduleuses voit son
   * influence diminuer, et inversement.
   */
  recordFeedback(dto: FeedbackDto): { samples: number } {
    const report = this.get(dto.analysisId);

    this.store.feedback.put({
      id: createId('fb'),
      analysisId: dto.analysisId,
      createdAt: nowIso(),
      outcome: dto.outcome,
      agreedFindings: dto.agreedFindings,
      disputedFindings: dto.disputedFindings,
      comment: dto.comment,
    });

    const snapshot = this.engine.learn(report, dto.outcome, {
      agreedFindings: dto.agreedFindings,
      disputedFindings: dto.disputedFindings,
    });
    this.store.saveCalibration(snapshot);

    this.logger.info(
      { analysisId: dto.analysisId, outcome: dto.outcome, samples: snapshot.samples },
      'Retour utilisateur intégré',
    );

    return { samples: snapshot.samples };
  }

  /** Comparaison de plusieurs analyses, exposée par l'interface. */
  compare(analysisIds: string[]) {
    const reports = analysisIds.map((id) => this.get(id));

    return {
      reports: reports.map((report) => ({
        id: report.id,
        title: report.listing.title,
        url: report.listing.source.url,
        platform: report.listing.source.platform,
        price: report.listing.price,
        scores: report.scores,
        verdict: report.verdict,
        metaConfidence: report.metaConfidence,
        thumbnail: report.listing.images[0]?.url,
      })),
      // Constats présents chez certaines annonces et absents chez d'autres :
      // c'est là que la comparaison apporte réellement quelque chose.
      differentiators: buildDifferentiators(reports),
      recommendation: pickBest(reports),
    };
  }

  /** Statistiques de l'apprentissage, exposées pour rendre l'IA lisible. */
  learningStats() {
    const calibration = this.engine.calibration;
    return {
      samples: calibration.sampleCount,
      feedbackCount: this.store.feedback.size,
      topDiscriminators: calibration.topDiscriminators(12).map((entry) => {
        const criterion = this.engine.registry.get(entry.criterionId);
        return {
          criterionId: entry.criterionId,
          label: criterion?.label ?? entry.criterionId,
          category: criterion?.category,
          multiplier: Number(entry.multiplier.toFixed(3)),
          samples: entry.samples,
        };
      }),
    };
  }
}

function buildDifferentiators(reports: AnalysisReport[]) {
  const byCriterion = new Map<string, { label: string; presentIn: string[] }>();

  for (const report of reports) {
    for (const finding of report.findings) {
      const entry = byCriterion.get(finding.criterionId) ?? {
        label: finding.label,
        presentIn: [],
      };
      entry.presentIn.push(report.id);
      byCriterion.set(finding.criterionId, entry);
    }
  }

  return [...byCriterion.entries()]
    .filter(([, entry]) => entry.presentIn.length < reports.length)
    .map(([criterionId, entry]) => ({ criterionId, ...entry }))
    .slice(0, 20);
}

function pickBest(reports: AnalysisReport[]): { analysisId: string; reason: string } | undefined {
  if (reports.length === 0) return undefined;

  const best = [...reports].sort((a, b) => {
    if (a.scores.risk !== b.scores.risk) return a.scores.risk - b.scores.risk;
    return b.scores.trust - a.scores.trust;
  })[0]!;

  const others = reports.filter((r) => r.id !== best.id);
  const margin = Math.min(...others.map((r) => r.scores.risk)) - best.scores.risk;

  return {
    analysisId: best.id,
    reason:
      margin >= 15
        ? `« ${best.listing.title} » se détache nettement : ${best.scores.risk} % de risque contre ${Math.min(...others.map((r) => r.scores.risk))} % pour la suivante.`
        : `« ${best.listing.title} » présente le risque le plus faible (${best.scores.risk} %), mais l'écart avec les autres reste faible : départagez-les sur le prix et l'état.`,
  };
}
