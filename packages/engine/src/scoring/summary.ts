import {
  formatMoney,
  VERDICT_PRESENTATION,
  type Finding,
  type Listing,
  type PriceAssessment,
  type Scores,
  type Verdict,
} from '@veritas/core';

/**
 * Rédaction du résumé.
 *
 * Le résumé est ce que 80 % des utilisateurs liront réellement. Il doit tenir
 * en quelques phrases, nommer les faits plutôt que des adjectifs, et ne jamais
 * masquer l'incertitude quand les données manquent.
 */

export interface SummaryInput {
  listing: Listing;
  scores: Scores;
  verdict: Verdict;
  findings: Finding[];
  price?: PriceAssessment;
  metaConfidence: number;
  dataCompleteness: number;
}

export function buildSummary(input: SummaryInput): string {
  const { listing, scores, verdict, findings, price, metaConfidence } = input;
  const sentences: string[] = [];

  const negatives = findings.filter((f) => f.polarity === 'negative');
  const positives = findings.filter((f) => f.polarity === 'positive');
  const critical = negatives.filter((f) => f.severity === 'critical');
  const high = negatives.filter((f) => f.severity === 'high');

  // 1. Le verdict, en une phrase.
  const presentation = VERDICT_PRESENTATION[verdict];
  sentences.push(
    `${presentation.label} — risque évalué à ${scores.risk} % pour « ${truncateTitle(listing.title)} ». ${presentation.headline}`,
  );

  // 2. Ce qui pèse le plus.
  if (critical.length > 0) {
    const labels = critical.slice(0, 2).map((f) => f.label.toLowerCase());
    sentences.push(
      `Le verdict tient d'abord à ${critical.length === 1 ? 'un constat critique' : `${critical.length} constats critiques`} : ${labels.join(', ')}${critical.length > 2 ? ', entre autres' : ''}. Ce type de signal n'admet pas d'explication légitime.`,
    );
  } else if (high.length > 0) {
    const labels = high.slice(0, 3).map((f) => f.label.toLowerCase());
    sentences.push(
      `${high.length === 1 ? 'Un point sérieux ressort' : `${high.length} points sérieux ressortent`} : ${labels.join(', ')}. ${high.length === 1 ? 'Il mérite' : 'Ils méritent'} une clarification avant tout engagement financier.`,
    );
  } else if (negatives.length > 0) {
    sentences.push(
      `Aucun signal grave n'a été relevé, mais ${negatives.length} point${negatives.length > 1 ? 's' : ''} mineur${negatives.length > 1 ? 's méritent' : ' mérite'} votre attention.`,
    );
  } else {
    sentences.push(
      "Aucun signal négatif n'a été relevé sur les critères applicables à cette annonce.",
    );
  }

  // 3. Le prix, quand il a pu être évalué.
  if (price?.market && price.deviation !== undefined) {
    const gap = Math.abs(price.deviation * 100);
    if (price.verdict === 'suspicious_low') {
      sentences.push(
        `Le prix de ${formatMoney(price.observed, price.currency)} se situe ${gap.toFixed(0)} % sous la valeur attendue de ${formatMoney(price.market.median, price.currency)} — l'écart caractéristique d'une annonce appât.`,
      );
    } else if (price.verdict === 'fair') {
      sentences.push(
        `Le prix de ${formatMoney(price.observed, price.currency)} est cohérent avec le marché (référence : ${formatMoney(price.market.median, price.currency)}), ce qui constitue le meilleur indice en faveur de l'annonce.`,
      );
    } else if (price.verdict === 'below_market') {
      sentences.push(
        `Le prix est ${gap.toFixed(0)} % sous la référence de marché : une bonne affaire plausible, à condition que le vendeur puisse l'expliquer.`,
      );
    }
  }

  // 4. Les points positifs, quand ils existent et que le verdict n'est pas catastrophique.
  if (positives.length > 0 && verdict !== 'dangerous') {
    const labels = positives.slice(0, 3).map((f) => f.label.toLowerCase());
    sentences.push(`En faveur de l'annonce : ${labels.join(', ')}.`);
  }

  // 5. L'aveu d'incertitude, quand il est dû.
  if (metaConfidence < 0.55) {
    sentences.push(
      `Attention : cette analyse repose sur des données partielles (fiabilité de l'analyse estimée à ${Math.round(metaConfidence * 100)} %). Complétez-la en important les photos et le texte intégral de l'annonce pour obtenir un verdict solide.`,
    );
  }

  return sentences.join(' ');
}

function truncateTitle(title: string): string {
  const clean = title.trim().replace(/\s+/g, ' ');
  return clean.length > 70 ? `${clean.slice(0, 69)}…` : clean || 'annonce sans titre';
}

/**
 * Regroupe les constats en trois blocs destinés à l'affichage en tête de rapport.
 * L'utilisateur doit saisir la situation d'un coup d'œil, avant de dérouler le détail.
 */
export function buildHighlights(findings: Finding[]): {
  critical: Finding[];
  warnings: Finding[];
  positive: Finding[];
} {
  return {
    critical: findings
      .filter((f) => f.polarity === 'negative' && f.severity === 'critical')
      .slice(0, 6),
    warnings: findings
      .filter(
        (f) => f.polarity === 'negative' && (f.severity === 'high' || f.severity === 'medium'),
      )
      .slice(0, 8),
    positive: findings.filter((f) => f.polarity === 'positive').slice(0, 6),
  };
}
