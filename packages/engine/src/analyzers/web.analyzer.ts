import {
  contentHash,
  normalize,
  ramp,
  textSimilarity,
  truncate,
  type DuplicateMatch,
} from '@veritas/core';
import type { Analyzer, AnalyzerContext, AnalyzerResult, SignalDraft } from './types';

/** En dessous, la détection de doublons n'a statistiquement aucune valeur. */
const MIN_CORPUS = 3;

/**
 * Analyseur de recoupement.
 *
 * Il compare l'annonce au corpus local d'analyses déjà réalisées. C'est la
 * fonctionnalité qui gagne le plus de valeur avec l'usage : chaque analyse
 * enrichit la base de comparaison, et un escroc qui recycle son texte ou ses
 * photos finit par se faire repérer par sa propre répétition.
 *
 * La détection reste locale et respectueuse de la vie privée : seules des
 * empreintes sont stockées, jamais le contenu intégral des annonces.
 */
export class WebAnalyzer implements Analyzer {
  readonly name = 'web';
  readonly category = 'web' as const;

  async run(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { listing, corpus } = context;
    const signals: SignalDraft[] = [];
    const duplicates: DuplicateMatch[] = [];

    const currentUrl = listing.source.url;
    const others = corpus.filter((entry) => !currentUrl || entry.listingUrl !== currentUrl);

    if (others.length < MIN_CORPUS) {
      return {
        name: this.name,
        category: this.category,
        applicable: false,
        unavailableReason: `Votre historique ne compte que ${others.length} analyse(s) : trop peu pour que la détection de doublons soit significative.`,
        evaluated: 2,
        signals: [
          {
            criterionId: 'web.corpus.too_small',
            strength: 1,
            explanation: `La détection de contenus recyclés compare cette annonce à celles que vous avez déjà analysées. Avec ${others.length} analyse(s) en mémoire, la comparaison n'a pas encore de valeur statistique — elle deviendra l'un des signaux les plus décisifs à mesure que votre historique s'étoffera.`,
            evidence: [
              {
                kind: 'metadata',
                label: 'Base de comparaison',
                value: `${others.length} analyse(s)`,
              },
            ],
          },
        ],
        duplicates: [],
      };
    }

    const normalizedDescription = normalize(listing.description);
    const normalizedTitle = normalize(listing.title);
    const descriptionHash = contentHash(listing.description);
    const titleHash = contentHash(listing.title);

    let exactMatch: (typeof others)[number] | undefined;
    let bestPartial: { entry: (typeof others)[number]; similarity: number } | undefined;

    for (const entry of others) {
      if (normalizedDescription.length > 60 && entry.descriptionHash === descriptionHash) {
        exactMatch = entry;
        duplicates.push({
          kind: 'text',
          similarity: 1,
          analysisId: entry.analysisId,
          listingUrl: entry.listingUrl,
          platform: entry.platform,
        });
        continue;
      }

      if (normalizedDescription.length > 120 && entry.descriptionSample) {
        const similarity = textSimilarity(normalizedDescription, entry.descriptionSample);
        if (similarity >= 0.72) {
          duplicates.push({
            kind: 'text',
            similarity: Number(similarity.toFixed(3)),
            analysisId: entry.analysisId,
            listingUrl: entry.listingUrl,
            platform: entry.platform,
            excerpt: truncate(entry.descriptionSample, 160),
          });
          if (!bestPartial || similarity > bestPartial.similarity) {
            bestPartial = { entry, similarity };
          }
        }
      }

      if (normalizedTitle.length > 10 && entry.titleHash === titleHash) {
        duplicates.push({
          kind: 'title',
          similarity: 1,
          analysisId: entry.analysisId,
          listingUrl: entry.listingUrl,
          platform: entry.platform,
          excerpt: entry.title,
        });
      }
    }

    if (exactMatch) {
      signals.push({
        criterionId: 'web.duplicate.text_exact',
        strength: 1,
        explanation: `La description de cette annonce est rigoureusement identique à celle d'une annonce déjà analysée${exactMatch.listingUrl ? ` (${truncate(exactMatch.listingUrl, 60)})` : ''}. Un texte repris au caractère près signale soit une annonce copiée sur une vraie vente, soit la diffusion en masse d'un même contenu par un même acteur. Dans les deux cas, ce n'est pas un vendeur qui décrit son bien.`,
        evidence: [
          {
            kind: 'link',
            label: 'Annonce identique',
            value: exactMatch.listingUrl ?? exactMatch.analysisId,
          },
          {
            kind: 'metadata',
            label: 'Analysée le',
            value: new Date(exactMatch.createdAt).toLocaleDateString('fr-FR'),
          },
        ],
      });
    } else if (bestPartial) {
      signals.push({
        criterionId: 'web.duplicate.text_partial',
        strength: ramp(bestPartial.similarity, 0.72, 0.95),
        explanation: `La description recoupe à ${Math.round(bestPartial.similarity * 100)} % celle d'une annonce déjà analysée. Les escrocs recyclent leurs textes en changeant quelques détails — prix, ville, modèle — pour échapper aux détections exactes. Comparez les deux annonces avant d'aller plus loin.`,
        evidence: [
          {
            kind: 'link',
            label: 'Annonce similaire',
            value: bestPartial.entry.listingUrl ?? bestPartial.entry.analysisId,
          },
          {
            kind: 'number',
            label: 'Similarité',
            value: `${Math.round(bestPartial.similarity * 100)} %`,
          },
        ],
      });
    }

    // Titre déjà rencontré, sans similarité de description.
    const titleDuplicates = duplicates.filter((d) => d.kind === 'title');
    if (titleDuplicates.length > 0 && !exactMatch && !bestPartial) {
      signals.push({
        criterionId: 'web.duplicate.title',
        strength: 0.4,
        explanation: `Le titre de cette annonce a déjà été rencontré dans votre historique, mais les descriptions diffèrent. Sur un produit courant c'est normal ; vérifiez tout de même s'il ne s'agit pas de la republication d'une annonce supprimée.`,
        evidence: titleDuplicates.slice(0, 2).map((d) => ({
          kind: 'link' as const,
          label: 'Même titre',
          value: d.listingUrl ?? d.analysisId ?? 'analyse locale',
        })),
      });
    }

    // Pseudonyme déjà croisé.
    const alias = listing.seller?.displayName ? normalize(listing.seller.displayName) : undefined;
    if (alias && alias.length > 2) {
      const previous = others.filter(
        (entry) => entry.sellerAlias && normalize(entry.sellerAlias) === alias,
      );
      if (previous.length > 0) {
        const risky = previous.filter((entry) => entry.riskScore >= 50);
        signals.push({
          criterionId: 'web.reuse.seller_alias',
          strength: risky.length > 0 ? 0.8 : 0.4,
          explanation:
            risky.length > 0
              ? `Le pseudonyme « ${listing.seller!.displayName} » apparaît dans ${previous.length} analyse(s) précédente(s), dont ${risky.length} conclue(s) comme risquée(s). Consultez ces analyses : un même vendeur au comportement déjà signalé mérite une vigilance particulière.`
              : `Le pseudonyme « ${listing.seller!.displayName} » figure dans ${previous.length} analyse(s) de votre historique, sans alerte particulière. Cette récurrence est plutôt rassurante : il s'agit vraisemblablement d'un vendeur régulier.`,
          evidence: previous.slice(0, 3).map((entry) => ({
            kind: 'link' as const,
            label: 'Analyse précédente',
            value: entry.listingUrl ?? entry.analysisId,
          })),
        });
      }
    }

    if (duplicates.length === 0) {
      signals.push({
        criterionId: 'web.unique.no_duplicate_found',
        strength: ramp(others.length, MIN_CORPUS, 60),
        explanation: `Ni le texte ni le titre de cette annonce ne correspondent à l'une des ${others.length} annonces déjà analysées. Rien n'indique un contenu recyclé — sous réserve que la vérification par recherche d'image inversée, elle, reste à faire manuellement.`,
        evidence: [{ kind: 'metadata', label: 'Comparé à', value: `${others.length} annonces` }],
      });
    }

    // Rappel de la vérification externe, avec requêtes prêtes à l'emploi.
    signals.push({
      criterionId: 'web.reputation.check_pending',
      strength: 1,
      explanation:
        "Une recherche du pseudonyme, du numéro de téléphone ou d'un extrait caractéristique de l'annonce sur un moteur de recherche fait souvent remonter des signalements publics. Les requêtes correspondantes sont préparées dans le rapport.",
      evidence: [{ kind: 'link', label: 'Vérifications externes', value: 'requêtes préparées' }],
    });

    return {
      name: this.name,
      category: this.category,
      applicable: true,
      evaluated: 9,
      signals,
      duplicates: dedupeMatches(duplicates),
    };
  }
}

function dedupeMatches(matches: DuplicateMatch[]): DuplicateMatch[] {
  const best = new Map<string, DuplicateMatch>();
  for (const match of matches) {
    const key = `${match.kind}:${match.analysisId ?? match.listingUrl ?? ''}`;
    const existing = best.get(key);
    if (!existing || match.similarity > existing.similarity) best.set(key, match);
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}
