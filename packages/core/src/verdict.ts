import type { Scores, Verdict } from './types/analysis';
import type { Severity } from './types/criteria';

export interface VerdictPresentation {
  verdict: Verdict;
  label: string;
  /** Phrase d'accroche affichée sous le score. */
  headline: string;
  /** Jeton de couleur, résolu par le thème de l'interface. */
  tone: 'emerald' | 'lime' | 'amber' | 'orange' | 'red';
  icon: 'shield-check' | 'check' | 'alert-triangle' | 'alert-octagon' | 'skull';
}

export const VERDICT_PRESENTATION: Record<Verdict, VerdictPresentation> = {
  safe: {
    verdict: 'safe',
    label: 'Fiable',
    headline: "Aucun signal d'alerte significatif détecté.",
    tone: 'emerald',
    icon: 'shield-check',
  },
  likely_safe: {
    verdict: 'likely_safe',
    label: 'Probablement fiable',
    headline: 'Quelques points mineurs à vérifier avant de conclure.',
    tone: 'lime',
    icon: 'check',
  },
  caution: {
    verdict: 'caution',
    label: 'Prudence',
    headline: 'Plusieurs éléments méritent une vérification avant tout paiement.',
    tone: 'amber',
    icon: 'alert-triangle',
  },
  risky: {
    verdict: 'risky',
    label: 'Risqué',
    headline: 'Des signaux sérieux évoquent une annonce frauduleuse.',
    tone: 'orange',
    icon: 'alert-octagon',
  },
  dangerous: {
    verdict: 'dangerous',
    label: 'Danger',
    headline: 'Faisceau de signaux caractéristique des arnaques. Ne payez pas.',
    tone: 'red',
    icon: 'skull',
  },
};

/**
 * Détermine le verdict à partir du risque, avec deux garde-fous :
 * un constat critique plafonne le verdict optimiste, et une confiance faible
 * dans l'analyse elle-même interdit d'annoncer « Fiable ».
 */
export function deriveVerdict(
  scores: Scores,
  options: { maxSeverity: Severity; metaConfidence: number },
): Verdict {
  const { risk } = scores;
  let verdict: Verdict;

  if (risk < 12) verdict = 'safe';
  else if (risk < 28) verdict = 'likely_safe';
  else if (risk < 50) verdict = 'caution';
  else if (risk < 72) verdict = 'risky';
  else verdict = 'dangerous';

  // Un signal critique isolé (numéro signalé, paiement hors plateforme imposé)
  // suffit à disqualifier l'annonce, quel que soit le reste du score.
  if (options.maxSeverity === 'critical' && rank(verdict) < rank('risky')) {
    verdict = 'risky';
  } else if (options.maxSeverity === 'high' && rank(verdict) < rank('caution')) {
    verdict = 'caution';
  }

  // Sans données suffisantes, on n'a pas le droit d'être rassurant.
  if (options.metaConfidence < 0.45 && rank(verdict) < rank('caution')) {
    verdict = 'caution';
  }

  return verdict;
}

const ORDER: Verdict[] = ['safe', 'likely_safe', 'caution', 'risky', 'dangerous'];

export function rank(verdict: Verdict): number {
  return ORDER.indexOf(verdict);
}

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function maxSeverity(severities: Severity[]): Severity {
  let best: Severity = 'info';
  for (const severity of severities) {
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[best]) best = severity;
  }
  return best;
}
