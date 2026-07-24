import { clamp, likelihoodRatio } from '@veritas/core';

/**
 * Apprentissage supervisé léger, local et entièrement explicable.
 *
 * Le moteur n'entraîne pas un réseau de neurones opaque : il tient une table
 * de comptage par critère. Pour chaque critère, on enregistre combien de fois
 * il s'est déclenché sur une annonce dont l'utilisateur a confirmé qu'elle
 * était une arnaque, et combien de fois sur une annonce légitime.
 *
 * Le rapport de vraisemblance qui en découle multiplie le poids d'origine.
 * Conséquence directe : un critère qui se déclenche aussi souvent sur les
 * annonces honnêtes que sur les frauduleuses voit son influence fondre, et
 * l'on peut toujours répondre à la question « pourquoi ce poids ? » par un
 * décompte lisible.
 */

export interface CriterionStats {
  /** Déclenchements sur des annonces confirmées frauduleuses. */
  scamHits: number;
  /** Déclenchements sur des annonces confirmées légitimes. */
  legitHits: number;
  /** Nombre de retours « arnaque » observés au total. */
  scamTotal: number;
  /** Nombre de retours « légitime » observés au total. */
  legitTotal: number;
  /** Contestations explicites de ce constat par des utilisateurs. */
  disputed: number;
  /** Confirmations explicites de la pertinence de ce constat. */
  agreed: number;
}

export interface CalibrationSnapshot {
  version: number;
  updatedAt: string;
  /** Nombre de retours utilisateur intégrés. */
  samples: number;
  criteria: Record<string, CriterionStats>;
}

const EMPTY_STATS: CriterionStats = {
  scamHits: 0,
  legitHits: 0,
  scamTotal: 0,
  legitTotal: 0,
  disputed: 0,
  agreed: 0,
};

/**
 * Bornes du multiplicateur. Un critère ne peut ni disparaître complètement ni
 * dominer le score : l'apprentissage ajuste, il ne réécrit pas le modèle.
 */
export const MULTIPLIER_BOUNDS = { min: 0.35, max: 2.2 } as const;

/** Nombre de retours en dessous duquel on n'ajuste presque pas. */
const CONFIDENCE_RAMP = 25;

export class CalibrationTable {
  private readonly stats: Map<string, CriterionStats>;
  private samples: number;
  private updatedAt: string;

  constructor(snapshot?: CalibrationSnapshot) {
    this.stats = new Map(Object.entries(snapshot?.criteria ?? {}));
    this.samples = snapshot?.samples ?? 0;
    this.updatedAt = snapshot?.updatedAt ?? new Date().toISOString();
  }

  static empty(): CalibrationTable {
    return new CalibrationTable();
  }

  getStats(criterionId: string): CriterionStats {
    return this.stats.get(criterionId) ?? EMPTY_STATS;
  }

  /**
   * Multiplicateur appliqué au poids d'un critère.
   *
   * Il combine deux sources : le pouvoir discriminant mesuré (rapport de
   * vraisemblance) et l'accord explicite des utilisateurs avec le constat.
   * L'ajustement est atténué tant que l'échantillon est petit.
   */
  multiplier(criterionId: string): number {
    const stats = this.stats.get(criterionId);
    if (!stats) return 1;

    const observations = stats.scamTotal + stats.legitTotal;
    if (observations === 0) return 1;

    const ratio = likelihoodRatio(
      stats.scamHits,
      stats.scamTotal,
      stats.legitHits,
      stats.legitTotal,
    );

    // Le log du rapport est symétrique autour de 0 ; on le ramène en multiplicateur.
    const discriminative = 1 + Math.log(ratio) * 0.35;

    // Les contestations directes pèsent immédiatement, sans attendre un volume.
    const reviews = stats.agreed + stats.disputed;
    const agreement = reviews === 0 ? 1 : 0.6 + 0.8 * ((stats.agreed + 1) / (reviews + 2));

    // Atténuation : à 0 retour le multiplicateur vaut 1, à CONFIDENCE_RAMP il joue à plein.
    const confidence = clamp(observations / CONFIDENCE_RAMP, 0, 1);
    const target = discriminative * agreement;
    const blended = 1 + (target - 1) * confidence;

    return clamp(blended, MULTIPLIER_BOUNDS.min, MULTIPLIER_BOUNDS.max);
  }

  /**
   * Intègre un retour utilisateur.
   *
   * @param triggeredCriteria critères déclenchés lors de l'analyse concernée
   * @param outcome issue réelle constatée
   * @param agreed constats jugés pertinents par l'utilisateur
   * @param disputed constats jugés faux par l'utilisateur
   */
  learn(
    triggeredCriteria: string[],
    outcome: 'scam' | 'legitimate' | 'unknown',
    agreed: string[] = [],
    disputed: string[] = [],
  ): void {
    const triggered = new Set(triggeredCriteria);

    if (outcome !== 'unknown') {
      const isScam = outcome === 'scam';
      // Tous les critères connus voient leur total augmenter : ne compter que
      // les déclenchements biaiserait le rapport de vraisemblance.
      for (const id of this.knownUniverse(triggered)) {
        const stats = this.ensure(id);
        if (isScam) {
          stats.scamTotal += 1;
          if (triggered.has(id)) stats.scamHits += 1;
        } else {
          stats.legitTotal += 1;
          if (triggered.has(id)) stats.legitHits += 1;
        }
      }
      this.samples += 1;
    }

    for (const id of agreed) this.ensure(id).agreed += 1;
    for (const id of disputed) this.ensure(id).disputed += 1;

    this.updatedAt = new Date().toISOString();
  }

  /**
   * Univers des critères suivis : ceux déjà connus plus ceux qui viennent de
   * se déclencher. Un critère jamais observé n'a pas besoin de compteur.
   */
  private knownUniverse(triggered: Set<string>): Set<string> {
    const universe = new Set(this.stats.keys());
    for (const id of triggered) universe.add(id);
    return universe;
  }

  private ensure(criterionId: string): CriterionStats {
    let stats = this.stats.get(criterionId);
    if (!stats) {
      stats = { ...EMPTY_STATS };
      this.stats.set(criterionId, stats);
    }
    return stats;
  }

  toSnapshot(): CalibrationSnapshot {
    return {
      version: 1,
      updatedAt: this.updatedAt,
      samples: this.samples,
      criteria: Object.fromEntries(this.stats),
    };
  }

  get sampleCount(): number {
    return this.samples;
  }

  /**
   * Critères les plus discriminants d'après l'expérience accumulée.
   * Exposé dans l'interface pour rendre l'apprentissage visible.
   */
  topDiscriminators(limit = 10): { criterionId: string; multiplier: number; samples: number }[] {
    return [...this.stats.entries()]
      .map(([criterionId, stats]) => ({
        criterionId,
        multiplier: this.multiplier(criterionId),
        samples: stats.scamTotal + stats.legitTotal,
      }))
      .filter((entry) => entry.samples > 0)
      .sort((a, b) => Math.abs(b.multiplier - 1) - Math.abs(a.multiplier - 1))
      .slice(0, limit);
  }
}
