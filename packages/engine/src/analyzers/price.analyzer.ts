import {
  formatMoney,
  formatPercent,
  normalize,
  ramp,
  stats,
  textSimilarity,
  type PriceAssessment,
} from '@veritas/core';
import type { Analyzer, AnalyzerContext, AnalyzerResult, SignalDraft } from './types';
import { getProfile } from '../knowledge/domain-profiles';
import { expectedUsedPrice, findReference } from '../knowledge/price-reference';
import { CONDITION_TERMS, type ConditionLevel } from '../knowledge/scam-lexicon';

/** Nombre minimal de comparables pour qu'une statistique de marché soit publiée. */
const MIN_COMPARABLES = 4;

/**
 * Analyseur tarifaire.
 *
 * Le point important méthodologiquement : on ne compare pas le prix demandé au
 * prix neuf, mais à la **valeur d'occasion attendue**, obtenue en appliquant la
 * dépréciation liée à l'âge puis l'abattement lié à l'état déclaré. Une remise
 * de 40 % sur un téléphone de trois ans est normale ; la même remise sur un
 * modèle sorti il y a six mois ne l'est pas. C'est cette part de décote qui
 * reste inexpliquée après ces deux corrections qui constitue le signal.
 */
export class PriceAnalyzer implements Analyzer {
  readonly name = 'price';
  readonly category = 'price' as const;

  async run(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { listing } = context;
    const signals: SignalDraft[] = [];

    if (!listing.price || !Number.isFinite(listing.price.amount) || listing.price.amount <= 0) {
      return {
        name: this.name,
        category: this.category,
        applicable: false,
        unavailableReason: "Aucun prix exploitable n'a pu être extrait de l'annonce.",
        evaluated: 1,
        signals: [
          {
            criterionId: 'price.missing',
            strength: 1,
            explanation:
              "Aucun prix n'est affiché. Le prix est le signal le plus discriminant d'une analyse d'annonce : sans lui, la comparaison au marché est impossible. Demandez au vendeur un montant ferme avant tout échange.",
            evidence: [{ kind: 'number', label: 'Prix', value: 'absent' }],
          },
        ],
        price: {
          observed: 0,
          currency: listing.price?.currency ?? 'EUR',
          verdict: 'unknown',
          explanation: "Aucun prix n'a pu être extrait de l'annonce.",
        },
      };
    }

    const observed = listing.price.amount;
    const currency = listing.price.currency || 'EUR';
    const profile = getProfile(listing.domain);
    const normalizedTitle = normalize(listing.title);
    const normalizedText = normalize(`${listing.title} ${listing.description}`);

    const condition = detectCondition(normalizedText, listing.condition);
    const conditionDiscount =
      profile.conditionDiscount[condition] ?? profile.conditionDiscount.unknown ?? 0.3;

    // 1) Comparables issus des analyses déjà réalisées : la source la plus fidèle au marché réel.
    const comparables = findComparables(context, normalizedTitle);
    // 2) À défaut, le référentiel embarqué.
    const reference = findReference(normalizedTitle, normalizedText);

    let market: PriceAssessment['market'];
    let expected: number | undefined;

    if (comparables.length >= MIN_COMPARABLES) {
      const values = comparables.map((c) => c.price);
      market = {
        mean: stats.round(stats.mean(values)),
        median: stats.round(stats.median(values)),
        p10: stats.round(stats.quantile(values, 0.1)),
        p90: stats.round(stats.quantile(values, 0.9)),
        stdDev: stats.round(stats.stdDev(values)),
        sampleSize: values.length,
        source: 'history',
        label: `${values.length} annonces comparables déjà analysées`,
      };
      expected = market.median;
    } else if (reference) {
      expected = expectedUsedPrice(reference.reference, {
        conditionDiscount,
        domainDepreciation: profile.annualDepreciation,
        residualFloor: profile.residualFloor,
      });
      const dispersion = reference.reference.dispersion;
      market = {
        mean: stats.round(expected),
        median: stats.round(expected),
        p10: stats.round(expected * (1 - 1.28 * dispersion)),
        p90: stats.round(expected * (1 + 1.28 * dispersion)),
        stdDev: stats.round(expected * dispersion),
        sampleSize: 1,
        source: 'builtin',
        label: `référentiel « ${reference.reference.label} », état ${describeCondition(condition)}`,
      };
    }

    // Prix neuf annoncé par le vendeur : sert de garde-fou complémentaire.
    const declaredOriginal = listing.price.original;

    if (!expected && declaredOriginal && declaredOriginal > observed) {
      expected = declaredOriginal * (1 - conditionDiscount);
      market = {
        mean: stats.round(expected),
        median: stats.round(expected),
        p10: stats.round(expected * 0.75),
        p90: stats.round(expected * 1.25),
        stdDev: stats.round(expected * 0.2),
        sampleSize: 1,
        source: 'builtin',
        label: `estimation à partir du prix neuf déclaré (${formatMoney(declaredOriginal, currency)})`,
      };
    }

    const assessment = this.buildAssessment({
      observed,
      currency,
      market,
      expected,
      conditionDiscount,
      condition,
      signals,
    });

    // Signaux complémentaires indépendants du marché.
    signals.push(...this.analyzeStructure(context, observed, currency, normalizedText));

    return {
      name: this.name,
      category: this.category,
      applicable: true,
      evaluated: 13,
      signals,
      price: assessment,
      completeness: { available: expected ? 1 : 0.4, expected: 1 },
    };
  }

  /** Construit l'évaluation tarifaire et pousse les signaux correspondants. */
  private buildAssessment(input: {
    observed: number;
    currency: string;
    market?: PriceAssessment['market'];
    expected?: number;
    conditionDiscount: number;
    condition: ConditionLevel | 'unknown';
    signals: SignalDraft[];
  }): PriceAssessment {
    const { observed, currency, market, expected, conditionDiscount, condition, signals } = input;

    if (!market || !expected || expected <= 0) {
      signals.push({
        criterionId: 'price.reference.unavailable',
        strength: 1,
        explanation:
          "Aucune référence de marché n'a pu être établie pour ce bien : le référentiel embarqué ne le couvre pas et votre historique ne contient pas encore assez d'annonces comparables. La cohérence tarifaire n'a donc pas pu être vérifiée automatiquement — comparez manuellement avec des annonces similaires.",
        evidence: [{ kind: 'comparison', label: 'Référence de marché', value: 'indisponible' }],
      });
      return {
        observed,
        currency,
        verdict: 'unknown',
        explanation:
          "La cohérence du prix n'a pas pu être évaluée faute de référence de marché pour ce type de bien.",
      };
    }

    const deviation = (observed - expected) / expected;
    const zScore = market.stdDev > 0 ? (observed - market.median) / market.stdDev : 0;

    const evidence = [
      {
        kind: 'comparison' as const,
        label: 'Prix demandé',
        value: formatMoney(observed, currency),
      },
      {
        kind: 'comparison' as const,
        label: 'Valeur attendue',
        value: formatMoney(expected, currency),
      },
      { kind: 'comparison' as const, label: 'Référence', value: market.label },
    ];

    let verdict: PriceAssessment['verdict'];
    let explanation: string;

    if (deviation <= -0.45) {
      verdict = 'suspicious_low';
      explanation = `Le prix demandé est ${formatPercent(Math.abs(deviation))} sous la valeur attendue de ${formatMoney(expected, currency)} (${market.label}). Une décote de cette ampleur ne s'explique pas par l'état déclaré : c'est l'appât classique destiné à provoquer un contact rapide et un paiement avant vérification.`;
      signals.push({
        // Franchir le seuil est déjà l'essentiel du signal : la force part donc
        // haut et l'ampleur de l'écart ne fait que la compléter.
        criterionId: 'price.deviation.extreme_low',
        strength: Math.min(1, 0.6 + 0.4 * ramp(Math.abs(deviation), 0.45, 0.8)),
        explanation,
        evidence,
      });
    } else if (deviation <= -0.25) {
      verdict = 'below_market';
      explanation = `Le prix est ${formatPercent(Math.abs(deviation))} sous la valeur attendue de ${formatMoney(expected, currency)} (${market.label}). Une telle remise peut être légitime — vente rapide, défaut non photographié — mais elle doit être expliquée par le vendeur avant tout engagement.`;
      signals.push({
        criterionId: 'price.deviation.suspicious_low',
        strength: 0.5 + 0.5 * ramp(Math.abs(deviation), 0.25, 0.45),
        explanation,
        evidence,
      });
    } else if (deviation <= -0.12) {
      verdict = 'below_market';
      explanation = `Le prix est ${formatPercent(Math.abs(deviation))} sous la valeur attendue de ${formatMoney(expected, currency)}. C'est une bonne affaire plausible, dans la fourchette de négociation habituelle entre particuliers.`;
      signals.push({
        criterionId: 'price.deviation.below_market',
        strength: 0.4 + 0.6 * ramp(Math.abs(deviation), 0.12, 0.25),
        explanation,
        evidence,
      });
    } else if (deviation >= 0.25) {
      verdict = 'above_market';
      explanation = `Le prix dépasse de ${formatPercent(deviation)} la valeur attendue de ${formatMoney(expected, currency)}. Ce n'est pas un signal de fraude, mais vous surpayez probablement : la négociation est justifiée.`;
      signals.push({
        criterionId: 'price.deviation.above_market',
        strength: ramp(deviation, 0.25, 0.6),
        explanation,
        evidence,
      });
    } else {
      verdict = 'fair';
      explanation = `Le prix demandé de ${formatMoney(observed, currency)} correspond à la valeur attendue de ${formatMoney(expected, currency)} (${market.label}), à ${formatPercent(Math.abs(deviation))} près. Un prix cohérent est le premier indicateur d'une vente sincère : les annonces frauduleuses reposent presque toujours sur une remise anormale.`;
      signals.push({
        criterionId: 'price.deviation.fair',
        strength: 1 - ramp(Math.abs(deviation), 0, 0.25),
        explanation,
        evidence,
      });
    }

    // Part de la décote qui reste inexpliquée une fois l'état pris en compte.
    const unexplained = Math.max(0, -deviation - conditionDiscount * 0.35);
    if (unexplained > 0.2 && deviation < -0.25) {
      signals.push({
        criterionId: 'price.discount.unexplained',
        strength: ramp(unexplained, 0.2, 0.5),
        explanation: `Même en tenant compte de l'état déclaré (${describeCondition(condition)}), ${formatPercent(unexplained)} de la remise reste sans explication. Demandez au vendeur la raison précise de ce prix : une réponse évasive est en soi une réponse.`,
        evidence: [
          {
            kind: 'comparison',
            label: 'Décote inexpliquée',
            value: formatPercent(unexplained),
          },
        ],
      });
    }

    return {
      observed,
      currency,
      market,
      deviation: stats.round(deviation, 4),
      zScore: stats.round(zScore, 2),
      expectedDiscount: stats.round(conditionDiscount, 3),
      unexplainedDiscount: stats.round(unexplained, 3),
      verdict,
      explanation,
    };
  }

  /** Signaux tarifaires ne dépendant pas d'une référence de marché. */
  private analyzeStructure(
    context: AnalyzerContext,
    observed: number,
    currency: string,
    normalizedText: string,
  ): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const { listing } = context;
    const profile = getProfile(listing.domain);

    if (observed >= profile.highValueThreshold) {
      signals.push({
        criterionId: 'payment.exposure.high_amount',
        strength: ramp(observed, profile.highValueThreshold, profile.highValueThreshold * 5),
        explanation: `L'enjeu financier est de ${formatMoney(observed, currency)}. À ce niveau, le temps consacré aux vérifications (appel vidéo, facture, rencontre) est dérisoire au regard de la perte potentielle.`,
        evidence: [
          { kind: 'number', label: 'Montant en jeu', value: formatMoney(observed, currency) },
        ],
      });
    }

    // Flexibilité tarifaire excessive.
    if (
      /\b(faites? (moi )?une offre|tout est negociable|je brade|premier prix|n'importe quel prix|prix a debattre urgent)\b/.test(
        normalizedText,
      )
    ) {
      signals.push({
        criterionId: 'price.negotiation.excessive_flexibility',
        strength: 0.65,
        explanation:
          "Le vendeur annonce accepter pratiquement n'importe quelle offre. Un propriétaire réel connaît la valeur de son bien et la défend ; cette indifférence au prix suggère qu'il n'a rien à céder.",
        evidence: [{ kind: 'text', label: 'Flexibilité annoncée', value: 'toute offre acceptée' }],
      });
    }

    // Cohérence de la devise avec le pays annoncé.
    const country = listing.location?.country?.toLowerCase();
    if (country && currency) {
      const expectedCurrency = CURRENCY_BY_COUNTRY[country];
      if (expectedCurrency && expectedCurrency !== currency) {
        signals.push({
          criterionId: 'price.currency.mismatch',
          strength: 0.7,
          explanation: `Le prix est libellé en ${currency} alors que l'annonce est localisée dans un pays utilisant ${expectedCurrency}. Cette incohérence trahit une annonce recyclée depuis un autre marché sans adaptation.`,
          evidence: [
            { kind: 'comparison', label: 'Devise annoncée', value: currency },
            { kind: 'comparison', label: 'Devise attendue', value: expectedCurrency },
          ],
        });
      }
    }

    // Prix parfaitement rond sur un bien dont le marché est dispersé.
    if (observed >= 200 && observed % 100 === 0 && listing.domain !== 'real_estate') {
      signals.push({
        criterionId: 'price.psychological.round_number',
        strength: 0.3,
        explanation: `Le prix (${formatMoney(observed, currency)}) est parfaitement rond. C'est courant et rarement significatif seul, mais cela indique un montant choisi de façon arbitraire plutôt que calculé à partir de la valeur réelle du bien.`,
        evidence: [{ kind: 'number', label: 'Montant', value: formatMoney(observed, currency) }],
      });
    }

    // Caution disproportionnée sur une location.
    if (listing.domain === 'rental_stay' || listing.domain === 'real_estate') {
      const depositMatch = /\b(caution|depot de garantie)\b[^.]{0,40}?(\d[\d\s.]{2,8})\b/.exec(
        normalizedText,
      );
      const deposit = depositMatch?.[2] ? Number(depositMatch[2].replace(/\s/g, '')) : undefined;
      if (deposit && observed > 0 && deposit > observed * 3) {
        signals.push({
          criterionId: 'price.rental.deposit_ratio',
          strength: ramp(deposit / observed, 3, 8),
          explanation: `La caution demandée (${formatMoney(deposit, currency)}) représente plus de ${Math.round(deposit / observed)} fois le montant du séjour ou du loyer. Cette disproportion est le mécanisme même de l'arnaque à la fausse location : extraire un versement unique important.`,
          evidence: [
            { kind: 'number', label: 'Caution', value: formatMoney(deposit, currency) },
            { kind: 'number', label: 'Loyer / séjour', value: formatMoney(observed, currency) },
          ],
        });
      }
    }

    // Cohérence prix / kilométrage pour les véhicules.
    if (listing.domain === 'vehicle') {
      const mileage = extractMileage(normalizedText, listing.attributes);
      const year = extractYear(normalizedText);
      if (mileage && year) {
        const age = Math.max(1, new Date().getFullYear() - year);
        const annualMileage = mileage / age;
        // Un prix élevé sur un véhicule très kilométré, ou l'inverse, sort du marché.
        if (mileage > 200_000 && observed > 12_000) {
          signals.push({
            criterionId: 'price.vehicle.mileage_inconsistent',
            strength: 0.6,
            explanation: `Le véhicule affiche ${mileage.toLocaleString('fr-FR')} km pour un prix de ${formatMoney(observed, currency)}. Ce rapport s'écarte nettement des références du marché de l'occasion.`,
            evidence: [
              {
                kind: 'number',
                label: 'Kilométrage',
                value: `${mileage.toLocaleString('fr-FR')} km`,
              },
              { kind: 'number', label: 'Prix', value: formatMoney(observed, currency) },
            ],
          });
        } else if (annualMileage < 3000 && age > 5 && observed < 3000) {
          signals.push({
            criterionId: 'price.vehicle.mileage_inconsistent',
            strength: 0.5,
            explanation: `Le véhicule n'aurait parcouru que ${Math.round(annualMileage).toLocaleString('fr-FR')} km par an, tout en étant vendu ${formatMoney(observed, currency)}. Un faible kilométrage devrait au contraire soutenir le prix : cette combinaison est atypique et mérite une vérification du compteur.`,
            evidence: [
              {
                kind: 'number',
                label: 'Kilométrage annuel',
                value: `${Math.round(annualMileage)} km/an`,
              },
              { kind: 'number', label: 'Prix', value: formatMoney(observed, currency) },
            ],
          });
        }
      }
    }

    return signals;
  }
}

// ── Fonctions utilitaires ──────────────────────────────────────────────

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  france: 'EUR',
  fr: 'EUR',
  belgique: 'EUR',
  be: 'EUR',
  allemagne: 'EUR',
  de: 'EUR',
  espagne: 'EUR',
  es: 'EUR',
  italie: 'EUR',
  it: 'EUR',
  suisse: 'CHF',
  ch: 'CHF',
  'royaume-uni': 'GBP',
  uk: 'GBP',
  gb: 'GBP',
  'etats-unis': 'USD',
  us: 'USD',
};

/** Comparables : annonces déjà analysées dont le titre est proche et le domaine identique. */
function findComparables(
  context: AnalyzerContext,
  normalizedTitle: string,
): { price: number; similarity: number }[] {
  const out: { price: number; similarity: number }[] = [];

  for (const entry of context.corpus) {
    if (!entry.price || entry.price <= 0) continue;
    if (entry.domain && entry.domain !== context.listing.domain) continue;
    if (!entry.title) continue;

    const similarity = textSimilarity(normalizedTitle, normalize(entry.title));
    // 0,62 est le seuil au-delà duquel deux titres désignent en pratique le même modèle.
    if (similarity >= 0.62) out.push({ price: entry.price, similarity });
  }

  return out.sort((a, b) => b.similarity - a.similarity).slice(0, 40);
}

function detectCondition(normalizedText: string, declared?: string): ConditionLevel | 'unknown' {
  const haystack = declared ? `${normalize(declared)} ${normalizedText}` : normalizedText;
  // Ordre croissant de sévérité : un défaut mentionné prime sur un « comme neuf ».
  const order: ConditionLevel[] = ['poor', 'fair', 'good', 'excellent', 'new'];
  for (const level of order) {
    if (CONDITION_TERMS[level].some((p) => p.test(haystack))) return level;
  }
  return 'unknown';
}

function describeCondition(condition: ConditionLevel | 'unknown'): string {
  const labels: Record<string, string> = {
    new: 'neuf',
    excellent: 'excellent',
    good: 'bon',
    fair: 'correct',
    poor: 'dégradé',
    unknown: 'non précisé',
  };
  return labels[condition] ?? 'non précisé';
}

function extractYear(normalizedText: string): number | undefined {
  const currentYear = new Date().getFullYear();
  const matches = normalizedText.match(/\b(19[89]\d|20[0-4]\d)\b/g);
  if (!matches) return undefined;
  const years = matches.map(Number).filter((y) => y >= 1985 && y <= currentYear + 1);
  // On retient l'année la plus récente : c'est généralement l'année du modèle.
  return years.length > 0 ? Math.max(...years) : undefined;
}

function extractMileage(
  normalizedText: string,
  attributes: Record<string, string>,
): number | undefined {
  for (const [key, value] of Object.entries(attributes)) {
    if (/kilometrage|mileage|km/i.test(key)) {
      const parsed = Number(value.replace(/[^\d]/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  const match = /\b(\d[\d\s.]{2,8})\s?km\b/.exec(normalizedText);
  if (!match?.[1]) return undefined;
  const parsed = Number(match[1].replace(/[\s.]/g, ''));
  return Number.isFinite(parsed) && parsed > 100 ? parsed : undefined;
}
