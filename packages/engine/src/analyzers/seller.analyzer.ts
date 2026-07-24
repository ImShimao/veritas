import { daysBetween, normalize, ramp, relativeTime, stats } from '@veritas/core';
import type { Analyzer, AnalyzerContext, AnalyzerResult, SignalDraft } from './types';

/**
 * Analyseur de profil vendeur.
 *
 * Deux précautions gouvernent cet analyseur.
 *
 * D'abord, l'absence d'information n'est jamais traitée comme une information :
 * si la plateforme ne publie pas l'ancienneté du compte, on émet un critère
 * neutre de poids nul plutôt qu'une pénalité. Sanctionner l'invisible
 * produirait des faux positifs sur toutes les plateformes discrètes.
 *
 * Ensuite, les moyennes d'avis sont lissées bayésiennement : « 5,0 sur 2 avis »
 * ne doit pas peser autant que « 4,8 sur 300 avis ».
 */
export class SellerAnalyzer implements Analyzer {
  readonly name = 'seller';
  readonly category = 'seller' as const;

  async run(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { listing, now } = context;
    const seller = listing.seller;
    const signals: SignalDraft[] = [];

    if (!seller || Object.keys(seller).length === 0) {
      return {
        name: this.name,
        category: this.category,
        applicable: false,
        unavailableReason:
          "Aucune information sur le vendeur n'a pu être récupérée depuis cette source.",
        evaluated: 1,
        signals: [
          {
            criterionId: 'seller.identity.no_profile',
            strength: 1,
            explanation:
              "Aucune donnée sur le vendeur n'est accessible : ni ancienneté, ni avis, ni historique. Toute une dimension de l'analyse reste donc aveugle. Consultez son profil manuellement sur la plateforme avant de vous engager.",
            evidence: [{ kind: 'metadata', label: 'Profil vendeur', value: 'inaccessible' }],
          },
        ],
        completeness: { available: 0, expected: 1 },
      };
    }

    let available = 0;
    const expected = 5;

    // ── Ancienneté du compte ─────────────────────────────────────────
    if (seller.memberSince) {
      available += 1;
      const ageDays = daysBetween(seller.memberSince, now);
      if (Number.isFinite(ageDays)) {
        if (ageDays < 14) {
          signals.push({
            criterionId: 'seller.account.brand_new',
            strength: ramp(14 - ageDays, 0, 12),
            explanation: `Le compte a été créé ${relativeTime(seller.memberSince, now)}, soit il y a moins de deux semaines. Les comptes frauduleux sont jetables : créés, exploités quelques jours, puis abandonnés dès les premiers signalements. Sur un compte aussi neuf, exigez systématiquement une rencontre ou un paiement sécurisé.`,
            evidence: [
              {
                kind: 'metadata',
                label: 'Compte créé',
                value: relativeTime(seller.memberSince, now),
              },
            ],
          });
        } else if (ageDays < 90) {
          signals.push({
            criterionId: 'seller.account.recent',
            strength: ramp(90 - ageDays, 0, 76),
            explanation: `Le compte existe depuis ${Math.round(ageDays)} jours. Ce n'est pas anormal en soi — tout le monde commence quelque part — mais il n'y a pas encore d'historique permettant d'évaluer la fiabilité du vendeur.`,
            evidence: [
              { kind: 'metadata', label: 'Ancienneté', value: `${Math.round(ageDays)} jours` },
            ],
          });
        } else if (ageDays > 730) {
          signals.push({
            criterionId: 'seller.account.established',
            strength: ramp(ageDays, 730, 2200),
            explanation: `Le compte est actif depuis ${(ageDays / 365).toFixed(1)} ans. Une telle ancienneté représente un investissement qu'un escroc ne consent presque jamais : les comptes frauduleux sont supprimés bien avant.`,
            evidence: [
              { kind: 'metadata', label: 'Ancienneté', value: `${(ageDays / 365).toFixed(1)} ans` },
            ],
          });
        }
      }
    } else {
      signals.push({
        criterionId: 'seller.account.age_unknown',
        strength: 1,
        explanation:
          "La date d'inscription du vendeur n'est pas accessible. L'ancienneté du compte est l'un des indicateurs les plus fiables : vérifiez-la directement sur son profil.",
        evidence: [{ kind: 'metadata', label: "Date d'inscription", value: 'non publiée' }],
      });
    }

    // ── Réputation ───────────────────────────────────────────────────
    // Distinction essentielle : « avis non récupérés » (donnée absente) n'est
    // PAS « aucun avis » (zéro constaté). Beaucoup de sources — Leboncoin en
    // tête — n'exposent pas la note dans les données extraites ; l'afficher
    // comme « aucun avis » fabriquerait un risque à partir d'un trou de
    // collecte. Conformément à l'en-tête, l'absence d'information reste neutre.
    const ratingAverage = seller.ratingAverage;
    const ratingCount = seller.ratingCount;
    const hasRating = ratingAverage !== undefined && (ratingCount ?? 0) > 0;

    if (hasRating) {
      available += 1;
      const count = ratingCount as number;
      // Lissage : la note affichée est ramenée vers 4,2 tant que l'échantillon est faible.
      const smoothed = stats.bayesianAverage(ratingAverage * count, count, 4.2, 8);
      const scale = ratingAverage <= 5 ? 5 : 100;
      const normalizedScore = (smoothed / scale) * 5;

      if (count < 3) {
        signals.push({
          criterionId: 'seller.reputation.few_reviews',
          strength: 0.7,
          explanation: `Le vendeur n'a que ${count} avis. Une note calculée sur si peu de transactions n'a aucune valeur statistique : elle ne prouve ni la fiabilité ni son contraire.`,
          evidence: [{ kind: 'metadata', label: "Nombre d'avis", value: String(count) }],
        });
      } else if (normalizedScore >= 4.5 && count >= 20) {
        signals.push({
          criterionId: 'seller.reputation.strong',
          strength: Math.min(1, ramp(count, 20, 150) * 0.5 + ramp(normalizedScore, 4.3, 5) * 0.5),
          explanation: `Le vendeur affiche ${ratingAverage.toFixed(1)}/${scale} sur ${count} avis. Un tel historique est coûteux à fabriquer et constitue le signal de confiance le plus robuste dont on dispose sur une plateforme.`,
          evidence: [
            { kind: 'metadata', label: 'Note', value: `${ratingAverage.toFixed(1)}/${scale}` },
            { kind: 'metadata', label: 'Volume', value: `${count} avis` },
          ],
        });
      } else if (normalizedScore < 3.8 && count >= 5) {
        signals.push({
          criterionId: 'seller.reputation.poor',
          strength: ramp(3.8 - normalizedScore, 0.1, 1.5),
          explanation: `La note du vendeur est de ${ratingAverage.toFixed(1)}/${scale} sur ${count} avis. Sur un volume suffisant, une note basse traduit des litiges récurrents : lisez les avis négatifs avant toute décision.`,
          evidence: [
            { kind: 'metadata', label: 'Note', value: `${ratingAverage.toFixed(1)}/${scale}` },
          ],
        });
      }

      // Note parfaite sur un très gros volume : profil statistiquement improbable.
      if (ratingAverage >= scale * 0.995 && count > 80) {
        signals.push({
          criterionId: 'seller.reputation.suspicious_pattern',
          strength: 0.5,
          explanation: `Une note parfaite maintenue sur ${count} transactions est statistiquement rare : même les excellents vendeurs accumulent quelques avis mitigés. Vérifiez que les avis ne sont pas tous récents ni rédigés dans des termes très similaires.`,
          evidence: [
            {
              kind: 'metadata',
              label: 'Note parfaite',
              value: `${ratingAverage}/${scale} sur ${count} avis`,
            },
          ],
        });
      }
    } else if (ratingCount === 0 && !seller.proAccount) {
      // Zéro avis explicitement constaté sur un compte particulier : caution légitime.
      available += 1;
      signals.push({
        criterionId: 'seller.reputation.no_reviews',
        strength: 0.8,
        explanation:
          "Le vendeur n'a aucun avis. Rien ne permet alors de distinguer un nouvel utilisateur légitime d'un compte créé pour une fraude unique. Privilégiez la remise en main propre avec paiement sur place.",
        evidence: [{ kind: 'metadata', label: 'Avis', value: 'aucun' }],
      });
    } else {
      // Note et nombre d'avis non récupérés : incertitude, jamais un risque.
      signals.push({
        criterionId: 'seller.reputation.unknown',
        strength: 1,
        explanation:
          "Les avis du vendeur n'ont pas pu être récupérés depuis cette source. Ce n'est pas un mauvais signe : beaucoup de plateformes n'exposent pas la note dans les données lues. Ouvrez la fiche du vendeur pour voir sa note et son nombre d'avis avant de vous engager.",
        evidence: [{ kind: 'metadata', label: 'Avis', value: 'non récupérés' }],
      });
    }

    // ── Volume et rythme de publication ──────────────────────────────
    if (seller.listingsCount !== undefined) {
      available += 1;
      const count = seller.listingsCount;
      if (count > 40 && !seller.proAccount) {
        signals.push({
          criterionId: 'seller.pro.hidden',
          strength: ramp(count, 40, 200),
          explanation: `Le vendeur a ${count} annonces en ligne sous un compte particulier. Ce volume relève d'une activité professionnelle : en achetant à un « particulier », vous perdez la garantie légale de conformité et le droit de rétractation qui vous seraient dus par un professionnel.`,
          evidence: [{ kind: 'metadata', label: 'Annonces en ligne', value: String(count) }],
        });
      } else if (count > 15) {
        signals.push({
          criterionId: 'seller.activity.bulk_listings',
          strength: ramp(count, 15, 60),
          explanation: `Le vendeur gère ${count} annonces simultanément. Ce n'est pas anormal pour quelqu'un qui vide sa maison, mais cela mérite un coup d'œil : ses autres annonces relèvent-elles d'un même univers cohérent ?`,
          evidence: [{ kind: 'metadata', label: 'Annonces en ligne', value: String(count) }],
        });
      }

      // Publication en rafale : beaucoup d'annonces sur un compte tout neuf.
      if (seller.memberSince) {
        const ageDays = daysBetween(seller.memberSince, now);
        if (Number.isFinite(ageDays) && ageDays > 0 && ageDays < 7 && count > 8) {
          signals.push({
            criterionId: 'seller.activity.burst_publishing',
            strength: 0.85,
            explanation: `${count} annonces ont été publiées en moins de ${Math.ceil(ageDays)} jour(s) sur un compte tout juste créé. Ce rythme correspond au mode opératoire des comptes automatisés qui inondent la plateforme avant d'être fermés.`,
            evidence: [
              {
                kind: 'metadata',
                label: 'Cadence',
                value: `${count} annonces en ${Math.ceil(ageDays)} j`,
              },
            ],
          });
        }
      }
    }

    // ── Identité ─────────────────────────────────────────────────────
    if (seller.verified === true) {
      available += 1;
      signals.push({
        criterionId: 'seller.identity.verified',
        strength: 1,
        explanation:
          "L'identité du vendeur a été vérifiée par la plateforme. Cette vérification rattache le compte à une pièce officielle et constitue une barrière réelle : elle rend l'usage d'un compte jetable beaucoup plus coûteux.",
        evidence: [{ kind: 'metadata', label: 'Identité', value: 'vérifiée par la plateforme' }],
      });
    } else if (seller.verified === false) {
      available += 1;
      signals.push({
        criterionId: 'seller.identity.unverified',
        strength: 0.6,
        explanation:
          "L'identité du vendeur n'est pas vérifiée. Le compte peut avoir été créé sous une identité fictive, et recréé indéfiniment après signalement.",
        evidence: [{ kind: 'metadata', label: 'Identité', value: 'non vérifiée' }],
      });
    }

    if (seller.proAccount) {
      signals.push({
        criterionId: 'seller.pro.declared',
        strength: 0.9,
        explanation:
          "Le vendeur est enregistré comme professionnel. Vous bénéficiez à ce titre de la garantie légale de conformité et, en vente à distance, d'un droit de rétractation de quatorze jours.",
        evidence: [{ kind: 'metadata', label: 'Statut', value: 'professionnel déclaré' }],
      });
    }

    // Pseudonyme généré automatiquement : prénom + suite de chiffres.
    if (seller.displayName) {
      available += 1;
      const alias = normalize(seller.displayName);
      if (/^[a-z]{2,12}[._-]?\d{4,}$/.test(alias) || /^user\d+$/.test(alias)) {
        signals.push({
          criterionId: 'seller.identity.generic_name',
          strength: 0.55,
          explanation: `Le pseudonyme « ${seller.displayName} » suit le format généré automatiquement lors des créations de comptes en masse. Beaucoup d'utilisateurs légitimes acceptent aussi le pseudonyme proposé par défaut : ce signal ne vaut qu'en combinaison avec d'autres.`,
          evidence: [{ kind: 'metadata', label: 'Pseudonyme', value: seller.displayName }],
        });
      }
    }

    // Localisation vendeur / annonce.
    if (seller.location && listing.location?.raw) {
      const sellerPlace = normalize(seller.location);
      const listingPlace = normalize(listing.location.raw);
      if (
        sellerPlace.length > 2 &&
        listingPlace.length > 2 &&
        !overlaps(sellerPlace, listingPlace)
      ) {
        signals.push({
          criterionId: 'seller.identity.location_mismatch',
          strength: 0.6,
          explanation: `Le profil du vendeur indique « ${seller.location} » alors que l'annonce est localisée à « ${listing.location.raw} ». Une divergence géographique complique la remise en main propre et sert souvent à justifier une expédition payée d'avance.`,
          evidence: [
            { kind: 'metadata', label: 'Localisation du profil', value: seller.location },
            { kind: 'metadata', label: "Localisation de l'annonce", value: listing.location.raw },
          ],
        });
      }
    }

    // ── Réactivité ───────────────────────────────────────────────────
    if (seller.responseRate !== undefined) {
      const rate = seller.responseRate > 1 ? seller.responseRate / 100 : seller.responseRate;
      if (rate >= 0.9) {
        signals.push({
          criterionId: 'seller.responsiveness.high',
          strength: ramp(rate, 0.9, 1),
          explanation: `Le vendeur répond à ${Math.round(rate * 100)} % des messages. Une bonne réactivité facilite les vérifications et témoigne d'un compte réellement suivi.`,
          evidence: [
            { kind: 'metadata', label: 'Taux de réponse', value: `${Math.round(rate * 100)} %` },
          ],
        });
      } else if (rate < 0.5) {
        signals.push({
          criterionId: 'seller.responsiveness.low',
          strength: ramp(0.5 - rate, 0.05, 0.4),
          explanation: `Le vendeur ne répond qu'à ${Math.round(rate * 100)} % des messages. Obtenir les vérifications nécessaires sera difficile, et la résolution d'un éventuel litige improbable.`,
          evidence: [
            { kind: 'metadata', label: 'Taux de réponse', value: `${Math.round(rate * 100)} %` },
          ],
        });
      }
    }

    return {
      name: this.name,
      category: this.category,
      applicable: true,
      evaluated: 22,
      signals,
      completeness: { available, expected },
    };
  }
}

/** Deux localisations se recoupent si elles partagent un mot significatif. */
function overlaps(a: string, b: string): boolean {
  const tokensA = new Set(a.split(/[^a-z0-9]+/).filter((t) => t.length > 3));
  const tokensB = b.split(/[^a-z0-9]+/).filter((t) => t.length > 3);
  return tokensB.some((token) => tokensA.has(token));
}
