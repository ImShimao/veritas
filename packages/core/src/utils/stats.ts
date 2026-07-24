/** Statistiques descriptives et fonctions de calibration utilisées par le scoring. */

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Quantile par interpolation linéaire (méthode R-7, celle d'Excel et de NumPy). */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sorted[base]!;
  const upper = sorted[base + 1];
  return upper === undefined ? lower : lower + rest * (upper - lower);
}

export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Écart absolu médian : dispersion robuste aux valeurs aberrantes. */
export function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

/** Score z robuste, basé sur la médiane plutôt que la moyenne. */
export function robustZScore(value: number, values: number[]): number {
  const mad = medianAbsoluteDeviation(values);
  if (mad === 0) {
    const sd = stdDev(values);
    return sd === 0 ? 0 : (value - mean(values)) / sd;
  }
  // 1.4826 rend le MAD comparable à un écart-type sur une loi normale.
  return (value - median(values)) / (1.4826 * mad);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

export function logit(p: number): number {
  const safe = clamp(p, 1e-6, 1 - 1e-6);
  return Math.log(safe / (1 - safe));
}

/** Interpolation linéaire d'une valeur d'un intervalle vers [0, 1]. */
export function ramp(value: number, low: number, high: number): number {
  if (high === low) return value >= high ? 1 : 0;
  return clamp((value - low) / (high - low), 0, 1);
}

/** Rampe inversée : 1 lorsque la valeur est basse. */
export function inverseRamp(value: number, low: number, high: number): number {
  return 1 - ramp(value, low, high);
}

/**
 * Moyenne pondérée d'un ensemble de scores. Les poids nuls sont ignorés,
 * ce qui permet d'écarter proprement une catégorie non applicable.
 */
export function weightedMean(entries: { value: number; weight: number }[]): number {
  const active = entries.filter((e) => e.weight > 0);
  if (active.length === 0) return 0;
  const totalWeight = active.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0) return 0;
  return active.reduce((sum, e) => sum + e.value * e.weight, 0) / totalWeight;
}

/**
 * Moyenne d'un ratio observé, lissée vers une valeur a priori.
 * Indispensable quand l'échantillon est minuscule (2 avis vendeur sur 2).
 */
export function bayesianAverage(
  observedSum: number,
  observedCount: number,
  priorMean: number,
  priorWeight: number,
): number {
  return (observedSum + priorMean * priorWeight) / (observedCount + priorWeight);
}

/** Rapport de vraisemblance issu d'une posterior Beta — cœur de la recalibration. */
export function likelihoodRatio(
  positiveHits: number,
  positiveTotal: number,
  negativeHits: number,
  negativeTotal: number,
  prior = 1,
): number {
  const pPositive = (positiveHits + prior) / (positiveTotal + 2 * prior);
  const pNegative = (negativeHits + prior) / (negativeTotal + 2 * prior);
  if (pNegative === 0) return 1;
  return pPositive / pNegative;
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function percentile(value: number, values: number[]): number {
  if (values.length === 0) return 0.5;
  const below = values.filter((v) => v < value).length;
  return below / values.length;
}
