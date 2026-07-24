import {
  contentHash,
  createId,
  nowIso,
  VeritasError,
  type AnalysisReport,
  type Severity,
  type Watch,
  type WatchAlert,
} from '@veritas/core';
import { extractListing } from '@veritas/extractors';
import type { Store } from '../store';
import type { Fetcher } from './fetcher';
import type { AnalysisService } from './analysis.service';
import type { Logger } from '../logger';
import type { Config } from '../config';

/**
 * Surveillance des annonces.
 *
 * Une annonce vivante en dit long : un prix qui baisse par paliers, des photos
 * remplacées, un texte réécrit ou une disparition soudaine sont des signaux
 * qu'aucune analyse ponctuelle ne peut capter.
 *
 * La surveillance ne s'applique qu'aux annonces analysées depuis une URL —
 * un texte collé n'a rien à surveiller — et respecte la même politique réseau
 * que le reste : délais, robots.txt, aucun contournement.
 */
export class WatchService {
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly store: Store,
    private readonly analyses: AnalysisService,
    private readonly fetcher: Fetcher,
    private readonly config: Config,
    private readonly logger: Logger,
  ) {}

  create(analysisId: string, intervalMs?: number): Watch {
    const report = this.analyses.get(analysisId);
    const url = report.listing.source.url;

    if (!url) {
      throw new VeritasError(
        'INVALID_INPUT',
        "Cette analyse ne provient pas d'une URL : il n'y a pas de page à surveiller.",
        {
          hint: "Relancez une analyse en collant le lien de l'annonce pour activer la surveillance.",
        },
      );
    }

    const existing = this.store.watches.findOne((watch) => watch.analysisId === analysisId);
    if (existing) return existing;

    const interval = intervalMs ?? this.config.WATCH_INTERVAL_MS;
    return this.store.watches.put({
      id: createId('wat'),
      analysisId,
      url,
      createdAt: nowIso(),
      active: true,
      intervalMs: interval,
      nextCheckAt: new Date(Date.now() + interval).toISOString(),
      snapshot: this.snapshotOf(report),
      failures: 0,
    });
  }

  stop(watchId: string): void {
    const watch = this.store.watches.get(watchId);
    if (!watch) throw new VeritasError('NOT_FOUND', "Cette surveillance n'existe pas.");
    this.store.watches.update(watchId, (item) => ({ ...item, active: false }));
  }

  list(): Watch[] {
    return this.store.watches.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  alerts(options: { unreadOnly?: boolean; limit?: number } = {}): WatchAlert[] {
    let alerts = this.store.alerts.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (options.unreadOnly) alerts = alerts.filter((alert) => !alert.read);
    return alerts.slice(0, options.limit ?? 50);
  }

  markRead(alertId: string): void {
    this.store.alerts.update(alertId, (alert) => ({ ...alert, read: true }));
  }

  /** Démarre la boucle périodique. */
  start(): void {
    if (!this.config.WATCH_ENABLED || this.timer) return;

    // Cadence de réveil : un huitième de l'intervalle nominal, borné à cinq
    // minutes. On vérifie souvent quelles annonces sont dues, mais on ne
    // sollicite chaque site qu'à son échéance propre.
    const tick = Math.max(60_000, Math.min(300_000, Math.floor(this.config.WATCH_INTERVAL_MS / 8)));
    this.timer = setInterval(() => {
      void this.runDueChecks();
    }, tick);
    this.timer.unref?.();

    this.logger.info({ tickMs: tick }, 'Surveillance des annonces activée');
  }

  stopAll(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Passe en revue les surveillances arrivées à échéance. */
  async runDueChecks(): Promise<number> {
    const now = Date.now();
    const due = this.store.watches
      .all()
      .filter(
        (watch) =>
          watch.active && (!watch.nextCheckAt || new Date(watch.nextCheckAt).getTime() <= now),
      );

    let checked = 0;
    for (const watch of due) {
      try {
        await this.check(watch);
        checked += 1;
      } catch (error) {
        this.logger.warn(
          { watchId: watch.id, error: error instanceof Error ? error.message : String(error) },
          'Vérification de surveillance échouée',
        );
      }
      // Les échéances sont replanifiées même en cas d'échec, pour ne pas
      // marteler un site qui répond mal.
      this.reschedule(watch);
    }

    return checked;
  }

  private reschedule(watch: Watch): void {
    this.store.watches.update(watch.id, (item) => ({
      ...item,
      lastCheckedAt: nowIso(),
      nextCheckAt: new Date(Date.now() + item.intervalMs).toISOString(),
    }));
  }

  private async check(watch: Watch): Promise<void> {
    const previous = watch.snapshot;
    let extraction;

    try {
      extraction = await extractListing({
        url: watch.url,
        fetchPage: (url) => this.fetcher.fetchPage(url),
      });
    } catch (error) {
      const failures = (watch.failures ?? 0) + 1;
      this.store.watches.update(watch.id, (item) => ({ ...item, failures }));

      // Trois échecs consécutifs : l'annonce a vraisemblablement été retirée.
      // On ne l'affirme qu'après plusieurs tentatives, un site peut être en panne.
      if (failures >= 3 && previous?.available !== false) {
        this.raise(watch, 'listing_removed', 'high', {
          message: `L'annonce surveillée n'est plus accessible après ${failures} tentatives. Elle a été vendue, ou retirée par la plateforme après signalements.`,
        });
        this.store.watches.update(watch.id, (item) => ({
          ...item,
          snapshot: item.snapshot ? { ...item.snapshot, available: false } : undefined,
        }));
      }
      throw error;
    }

    this.store.watches.update(watch.id, (item) => ({ ...item, failures: 0 }));

    const report = await this.analyses.reanalyze({
      ...this.analyses.get(watch.analysisId),
      listing: extraction.listing,
    });
    const current = this.snapshotOf(report);

    if (!previous) {
      this.store.watches.update(watch.id, (item) => ({ ...item, snapshot: current }));
      return;
    }

    this.compareSnapshots(watch, previous, current, report);
    this.store.watches.update(watch.id, (item) => ({ ...item, snapshot: current }));
  }

  private compareSnapshots(
    watch: Watch,
    previous: NonNullable<Watch['snapshot']>,
    current: NonNullable<Watch['snapshot']>,
    report: AnalysisReport,
  ): void {
    if (
      previous.price !== undefined &&
      current.price !== undefined &&
      previous.price !== current.price
    ) {
      const delta = current.price - previous.price;
      const percent = previous.price > 0 ? Math.abs(delta / previous.price) * 100 : 0;
      this.raise(watch, 'price_changed', percent > 25 ? 'high' : 'medium', {
        message:
          delta < 0
            ? `Le prix est passé de ${previous.price} à ${current.price} (−${percent.toFixed(0)} %). Une baisse successive sur une annonce déjà sous le marché accentue l'appât.`
            : `Le prix est passé de ${previous.price} à ${current.price} (+${percent.toFixed(0)} %).`,
        details: { previous: previous.price, current: current.price },
      });
    }

    if (previous.descriptionHash !== current.descriptionHash) {
      this.raise(watch, 'text_changed', 'medium', {
        message:
          "La description de l'annonce a été modifiée. Comparez avec la version analysée : une réécriture sert souvent à recycler une annonce signalée.",
      });
    }

    if (previous.titleHash !== current.titleHash) {
      this.raise(watch, 'text_changed', 'medium', {
        message: `Le titre de l'annonce a changé. Nouveau titre : « ${report.listing.title} ».`,
      });
    }

    const previousImages = new Set(previous.imageHashes ?? []);
    const currentImages = current.imageHashes ?? [];
    const newImages = currentImages.filter((hash) => !previousImages.has(hash));
    if (newImages.length > 0 && previousImages.size > 0) {
      this.raise(watch, 'images_changed', 'medium', {
        message: `${newImages.length} photo(s) ont été remplacées ou ajoutées depuis la dernière vérification.`,
      });
    }

    if (
      previous.riskScore !== undefined &&
      Math.abs(current.riskScore! - previous.riskScore) >= 15
    ) {
      this.raise(watch, 'score_changed', current.riskScore! > previous.riskScore ? 'high' : 'low', {
        message: `Le score de risque est passé de ${previous.riskScore} % à ${current.riskScore} % après ces changements.`,
        details: { previous: previous.riskScore, current: current.riskScore },
      });
    }
  }

  private raise(
    watch: Watch,
    kind: WatchAlert['kind'],
    severity: Severity,
    options: { message: string; details?: Record<string, unknown> },
  ): void {
    const alert: WatchAlert = {
      id: createId('alr'),
      watchId: watch.id,
      analysisId: watch.analysisId,
      createdAt: nowIso(),
      kind,
      severity,
      message: options.message,
      details: options.details,
      read: false,
    };
    this.store.alerts.put(alert);
    this.logger.info({ watchId: watch.id, kind, severity }, 'Alerte de surveillance');
  }

  private snapshotOf(report: AnalysisReport): NonNullable<Watch['snapshot']> {
    return {
      price: report.listing.price?.amount,
      titleHash: contentHash(report.listing.title),
      descriptionHash: contentHash(report.listing.description),
      imageHashes: report.images
        .map((image) => image.perceptualHash)
        .filter((hash): hash is string => Boolean(hash)),
      riskScore: report.scores.risk,
      available: true,
    };
  }
}
