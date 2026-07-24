import {
  clamp,
  logit,
  maxSeverity,
  round,
  SCORE_DIMENSIONS,
  sigmoid,
  type CategoryScore,
  type CriterionCategory,
  type Finding,
  type ScoreDimension,
  type Scores,
  type Severity,
} from '@veritas/core';
import type { CriterionRegistry } from '../criteria';
import type { CalibrationTable } from '../learning/calibration';
import type { AnalyzerResult } from '../analyzers/types';

/**
 * Agrégation des signaux en scores.
 *
 * ## Pourquoi des log-cotes plutôt qu'une moyenne pondérée
 *
 * Une moyenne pondérée traite les critères comme interchangeables et sature mal :
 * ajouter un dixième signal négatif à une annonce déjà catastrophique change le
 * score autant que le premier. L'accumulation en log-cotes correspond en revanche
 * à la façon dont des indices indépendants se combinent réellement : chaque
 * signal déplace la conviction d'une quantité fixe, et la conversion finale par
 * sigmoïde produit naturellement des rendements décroissants aux extrêmes.
 *
 * ## Saturation
 *
 * Les signaux d'une même famille ne sont pas indépendants — « prix très bas »,
 * « décote inexpliquée » et « urgence » se déclenchent souvent ensemble sur la
 * même annonce. Les additionner brutalement surestimerait la preuve. On applique
 * donc une compression logarithmique aux totaux positifs et négatifs pris
 * séparément, avant de les injecter dans les log-cotes.
 *
 * ## Prudence
 *
 * Les scores sont enfin ramenés vers leur valeur a priori proportionnellement au
 * manque de données. Une annonce dont on ne connaît ni le vendeur ni les photos
 * ne peut pas obtenir 97 % de confiance : l'incertitude doit se voir.
 */

/** Probabilités a priori, avant tout signal. */
const PRIORS: Record<ScoreDimension, number> = {
  authenticity: 0.72,
  trust: 0.62,
  risk: 0.18,
};

/** Facteur d'échelle convertissant un poids de critère en log-cotes. */
const WEIGHT_SCALE = 0.8;

/** Constante de saturation : plus elle est basse, plus les signaux se compressent vite. */
const SATURATION = 2.2;

/**
 * Plancher de risque imposé par un constat critique.
 *
 * Un seul signal de cette gravité — carte cadeau, faux séquestre, domaine sosie —
 * suffit à disqualifier l'annonce, indépendamment de tout le reste : ces schémas
 * n'admettent aucune explication légitime, et il serait absurde qu'un vendeur
 * bien noté puisse les compenser.
 *
 * Aucun plancher équivalent n'existe pour la gravité « élevée » : ces critères
 * sont trop courants pour qu'un seul d'entre eux condamne une annonce. Leur
 * poids suffit, et `deriveVerdict` plafonne déjà l'optimisme du verdict.
 */
const CRITICAL_RISK_FLOOR = 72;

export interface AggregationInput {
  results: AnalyzerResult[];
  registry: CriterionRegistry;
  calibration: CalibrationTable;
}

export interface AggregationOutput {
  scores: Scores;
  findings: Finding[];
  categories: CategoryScore[];
  metaConfidence: number;
  dataCompleteness: number;
  criteriaEvaluated: number;
  maxSeverity: Severity;
  warnings: string[];
}

/** Compression logarithmique : rendements décroissants sur les preuves redondantes. */
function saturate(total: number): number {
  if (total <= 0) return 0;
  return SATURATION * Math.log1p(total / SATURATION);
}

export function aggregate(input: AggregationInput): AggregationOutput {
  const { results, registry, calibration } = input;
  const findings: Finding[] = [];
  const warnings: string[] = [];

  // Accumulateurs séparés par dimension et par signe, pour saturer indépendamment.
  const positive: Record<ScoreDimension, number> = { authenticity: 0, trust: 0, risk: 0 };
  const negative: Record<ScoreDimension, number> = { authenticity: 0, trust: 0, risk: 0 };

  // Idem par catégorie, pour les sous-scores affichés dans le rapport.
  const categoryPositive = new Map<CriterionCategory, number>();
  const categoryNegative = new Map<CriterionCategory, number>();
  const categoryTriggered = new Map<CriterionCategory, number>();

  let criteriaEvaluated = 0;
  let completenessAvailable = 0;
  let completenessExpected = 0;

  for (const result of results) {
    criteriaEvaluated += result.evaluated;
    if (result.warnings) warnings.push(...result.warnings);
    if (result.completeness) {
      completenessAvailable += result.completeness.available;
      completenessExpected += result.completeness.expected;
    }

    for (const signal of result.signals) {
      const criterion = registry.get(signal.criterionId);
      if (!criterion) {
        // Un analyseur a émis un signal pour un critère non déclaré : c'est un
        // défaut de programmation, signalé plutôt que silencieusement ignoré.
        warnings.push(`Signal ignoré : critère « ${signal.criterionId} » absent du registre.`);
        continue;
      }

      const strength = clamp(signal.strength, 0, 1);
      if (strength <= 0) continue;

      const multiplier = criterion.learnable === false ? 1 : calibration.multiplier(criterion.id);
      const effectiveWeight =
        criterion.weight * multiplier * (signal.weightMultiplier ?? 1) * strength;

      const contribution: Partial<Record<ScoreDimension, number>> = {};

      for (const dimension of SCORE_DIMENSIONS) {
        const impact = criterion.impact[dimension];
        if (impact === undefined || impact === 0) continue;

        const delta = impact * effectiveWeight * WEIGHT_SCALE;
        contribution[dimension] = round(delta, 4);

        if (delta >= 0) positive[dimension] += delta;
        else negative[dimension] += -delta;
      }

      // Le sous-score de catégorie suit la dimension « trust », la plus parlante.
      const trustDelta = contribution.trust ?? 0;
      if (trustDelta >= 0) {
        categoryPositive.set(
          criterion.category,
          (categoryPositive.get(criterion.category) ?? 0) + trustDelta,
        );
      } else {
        categoryNegative.set(
          criterion.category,
          (categoryNegative.get(criterion.category) ?? 0) - trustDelta,
        );
      }
      categoryTriggered.set(
        criterion.category,
        (categoryTriggered.get(criterion.category) ?? 0) + 1,
      );

      findings.push({
        criterionId: criterion.id,
        category: criterion.category,
        label: criterion.label,
        explanation: signal.explanation,
        severity: criterion.severity,
        polarity: criterion.polarity,
        strength: round(strength, 3),
        weight: round(criterion.weight * multiplier, 3),
        contribution,
        evidence: signal.evidence ?? [],
      });
    }
  }

  const dataCompleteness =
    completenessExpected > 0 ? clamp(completenessAvailable / completenessExpected, 0, 1) : 0.5;

  const applicableAnalyzers = results.filter((r) => r.applicable).length;
  const analyzerCoverage = results.length > 0 ? applicableAnalyzers / results.length : 0;

  /*
   * Méta-confiance : à quel point le moteur peut-il se fier à sa propre sortie ?
   * Elle combine la couverture des analyseurs (combien ont pu s'exécuter) et la
   * complétude des données. Elle ne mesure pas la fiabilité de l'annonce mais
   * celle de l'analyse — deux choses qu'il serait grave de confondre.
   */
  const metaConfidence = clamp(0.15 + 0.45 * analyzerCoverage + 0.4 * dataCompleteness, 0, 1);

  const rawScores = {} as Scores;
  for (const dimension of SCORE_DIMENSIONS) {
    const logOdds =
      logit(PRIORS[dimension]) + saturate(positive[dimension]) - saturate(negative[dimension]);
    const probability = sigmoid(logOdds);
    // Rétraction vers l'a priori quand la confiance dans l'analyse est faible.
    const shrunk =
      PRIORS[dimension] + (probability - PRIORS[dimension]) * (0.55 + 0.45 * metaConfidence);
    rawScores[dimension] = clamp(shrunk * 100, 0, 100);
  }

  // Planchers de risque : un constat grave ne peut pas être noyé par des signaux positifs.
  const severities = findings
    .filter((f) => f.polarity === 'negative' && f.strength >= 0.65)
    .map((f) => f.severity);
  const worst = maxSeverity(severities);

  if (worst === 'critical') {
    rawScores.risk = Math.max(rawScores.risk, CRITICAL_RISK_FLOOR);
    rawScores.trust = Math.min(rawScores.trust, 100 - CRITICAL_RISK_FLOOR + 8);
  }

  const scores: Scores = {
    authenticity: Math.round(rawScores.authenticity),
    trust: Math.round(rawScores.trust),
    risk: Math.round(rawScores.risk),
  };

  const categories = buildCategoryScores(
    results,
    categoryPositive,
    categoryNegative,
    categoryTriggered,
  );

  return {
    scores,
    findings: sortFindings(findings),
    categories,
    metaConfidence: round(metaConfidence, 3),
    dataCompleteness: round(dataCompleteness, 3),
    criteriaEvaluated,
    maxSeverity: worst,
    warnings,
  };
}

function buildCategoryScores(
  results: AnalyzerResult[],
  positive: Map<CriterionCategory, number>,
  negative: Map<CriterionCategory, number>,
  triggered: Map<CriterionCategory, number>,
): CategoryScore[] {
  const byCategory = new Map<CriterionCategory, CategoryScore>();

  for (const result of results) {
    const existing = byCategory.get(result.category);
    const pos = positive.get(result.category) ?? 0;
    const neg = negative.get(result.category) ?? 0;
    const logOdds = logit(0.68) + saturate(pos) - saturate(neg);

    const score: CategoryScore = {
      category: result.category,
      score: Math.round(clamp(sigmoid(logOdds) * 100, 0, 100)),
      evaluated: (existing?.evaluated ?? 0) + result.evaluated,
      triggered: triggered.get(result.category) ?? 0,
      applicable: (existing?.applicable ?? false) || result.applicable,
      unavailableReason: result.applicable
        ? undefined
        : (result.unavailableReason ?? existing?.unavailableReason),
    };

    byCategory.set(result.category, score);
  }

  return [...byCategory.values()].sort((a, b) => a.score - b.score);
}

/**
 * Tri des constats : gravité décroissante, puis contribution absolue.
 * L'utilisateur doit voir en premier ce qui pèse le plus sur le verdict.
 */
function sortFindings(findings: Finding[]): Finding[] {
  const severityRank: Record<Severity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0,
  };
  return [...findings].sort((a, b) => {
    // Les constats négatifs passent devant les positifs à gravité égale.
    if (a.polarity !== b.polarity) {
      if (a.polarity === 'negative') return -1;
      if (b.polarity === 'negative') return 1;
    }
    const bySeverity = severityRank[b.severity] - severityRank[a.severity];
    if (bySeverity !== 0) return bySeverity;
    return magnitude(b) - magnitude(a);
  });
}

function magnitude(finding: Finding): number {
  return Object.values(finding.contribution).reduce((sum, value) => sum + Math.abs(value ?? 0), 0);
}
