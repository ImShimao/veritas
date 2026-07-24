import { mkdirSync } from 'node:fs';
import type { AnalysisReport, ChatSession, FeedbackRecord, Watch, WatchAlert } from '@veritas/core';
import type { CalibrationSnapshot, CorpusEntry } from '@veritas/engine';
import { JsonCollection } from './collection';
import type { Config } from '../config';

/** Empreinte d'analyse persistée, avec son identifiant propre pour la collection. */
export interface CorpusRecord extends CorpusEntry {
  id: string;
}

/** Marque-page utilisateur sur une analyse. */
export interface FavoriteRecord {
  id: string;
  analysisId: string;
  createdAt: string;
  note?: string;
}

/** Instantané de calibration, stocké comme élément unique. */
interface CalibrationRecord {
  id: 'current';
  snapshot: CalibrationSnapshot;
}

/**
 * Accès aux données.
 *
 * Un seul point d'entrée pour toutes les collections : les services ne
 * manipulent jamais de fichiers, ce qui rend le remplacement du stockage
 * transparent pour eux.
 */
export class Store {
  readonly analyses: JsonCollection<AnalysisReport>;
  readonly corpus: JsonCollection<CorpusRecord>;
  readonly chats: JsonCollection<ChatSession>;
  readonly feedback: JsonCollection<FeedbackRecord>;
  readonly watches: JsonCollection<Watch>;
  readonly alerts: JsonCollection<WatchAlert>;
  readonly favorites: JsonCollection<FavoriteRecord>;
  private readonly calibration: JsonCollection<CalibrationRecord>;

  constructor(config: Config) {
    mkdirSync(config.dataDir, { recursive: true });
    const key = config.encryptionKey;

    // Les rapports complets sont volumineux (preuves, empreintes d'images) :
    // on en conserve un nombre borné, tandis que les empreintes du corpus,
    // minuscules, sont gardées bien plus longtemps pour la détection de doublons.
    this.analyses = new JsonCollection(config.dataDir, 'analyses', key, { maxItems: 500 });
    this.corpus = new JsonCollection(config.dataDir, 'corpus', key, { maxItems: 5000 });
    this.chats = new JsonCollection(config.dataDir, 'chats', key, { maxItems: 500 });
    this.feedback = new JsonCollection(config.dataDir, 'feedback', key, { maxItems: 5000 });
    this.watches = new JsonCollection(config.dataDir, 'watches', key, { maxItems: 200 });
    this.alerts = new JsonCollection(config.dataDir, 'alerts', key, { maxItems: 1000 });
    this.favorites = new JsonCollection(config.dataDir, 'favorites', key, { maxItems: 1000 });
    this.calibration = new JsonCollection(config.dataDir, 'calibration', key);
  }

  loadCalibration(): CalibrationSnapshot | undefined {
    return this.calibration.get('current')?.snapshot;
  }

  saveCalibration(snapshot: CalibrationSnapshot): void {
    this.calibration.put({ id: 'current', snapshot });
  }

  /** Empreintes servant de base de comparaison au moteur. */
  corpusEntries(limit = 2000): CorpusEntry[] {
    return this.corpus.all().slice(-limit);
  }

  /** Écrit toutes les collections sur disque. Appelée à l'arrêt. */
  flushAll(): void {
    this.analyses.flush();
    this.corpus.flush();
    this.chats.flush();
    this.feedback.flush();
    this.watches.flush();
    this.alerts.flush();
    this.favorites.flush();
    this.calibration.flush();
  }

  stats(): Record<string, number> {
    return {
      analyses: this.analyses.size,
      corpus: this.corpus.size,
      chats: this.chats.size,
      feedback: this.feedback.size,
      watches: this.watches.size,
      alerts: this.alerts.size,
      favorites: this.favorites.size,
    };
  }
}

export { JsonCollection } from './collection';
