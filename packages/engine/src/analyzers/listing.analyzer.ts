import {
  daysBetween,
  normalize,
  ramp,
  relativeTime,
  textSimilarity,
  textUtils,
} from '@veritas/core';
import type { Analyzer, AnalyzerContext, AnalyzerResult, SignalDraft } from './types';
import { getPlatformProfile } from '../knowledge/platforms';
import { getProfile } from '../knowledge/domain-profiles';

/** Analyseur structurel : cohérence de l'annonce prise comme un tout. */
export class ListingAnalyzer implements Analyzer {
  readonly name = 'listing';
  readonly category = 'listing' as const;

  async run(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { listing, now } = context;
    const signals: SignalDraft[] = [];
    const title = normalize(listing.title);
    const description = normalize(listing.description);

    signals.push(...this.analyzeTitle(listing.title, title, description));
    signals.push(...this.analyzeFreshness(context, now));
    signals.push(...this.analyzeLocation(context));
    signals.push(...this.analyzeAttributes(context));
    signals.push(...this.analyzePlatform(context));

    if (listing.source.degraded) {
      signals.push({
        criterionId: 'listing.extraction.degraded',
        strength: 1,
        explanation: `L'extraction de l'annonce a été partielle${listing.source.degradedReason ? ` : ${listing.source.degradedReason}` : '.'} Les conclusions ci-dessous reposent donc sur un sous-ensemble des informations réellement disponibles. Pour une analyse complète, copiez le texte de l'annonce et importez ses photos.`,
        evidence: [
          {
            kind: 'metadata',
            label: 'Extraction',
            value: listing.source.degradedReason ?? 'partielle',
          },
        ],
      });
    }

    return {
      name: this.name,
      category: this.category,
      applicable: true,
      evaluated: 16,
      signals,
      completeness: this.measureCompleteness(context),
    };
  }

  private analyzeTitle(rawTitle: string, title: string, description: string): SignalDraft[] {
    const signals: SignalDraft[] = [];
    if (title.length === 0) return signals;

    const tokens = textUtils.words(rawTitle);

    // Bourrage de mots-clés : titre long, très répétitif ou saturé de séparateurs.
    const separators = (rawTitle.match(/[|/,+•·]/g) ?? []).length;
    const uniqueRatio = tokens.length > 0 ? new Set(tokens).size / tokens.length : 1;
    if ((tokens.length > 14 && separators >= 4) || (tokens.length > 10 && uniqueRatio < 0.6)) {
      signals.push({
        criterionId: 'listing.title.keyword_stuffing',
        strength: ramp(separators + tokens.length / 5, 5, 14),
        explanation: `Le titre accumule ${tokens.length} mots et ${separators} séparateurs. Cette construction vise le référencement interne de la plateforme plutôt que la description du bien : elle est courante sur les comptes qui publient en volume.`,
        evidence: [{ kind: 'text', label: 'Titre', value: textUtils.truncate(rawTitle, 120) }],
      });
    }

    // Titre trop générique.
    if (tokens.length <= 2 && !/\d/.test(title)) {
      signals.push({
        criterionId: 'listing.title.too_generic',
        strength: 0.6,
        explanation: `Le titre « ${rawTitle} » ne mentionne ni marque ni modèle. Cette imprécision empêche toute comparaison de marché et complique la vérification du bien.`,
        evidence: [{ kind: 'text', label: 'Titre', value: rawTitle }],
      });
    }

    // Divergence entre titre et description.
    if (description.length > 80 && title.length > 8) {
      const similarity = textSimilarity(title, description.slice(0, 600));
      const titleTokens = new Set(textUtils.words(title).filter((t) => t.length > 3));
      const descriptionTokens = new Set(textUtils.words(description));
      const shared = [...titleTokens].filter((t) => descriptionTokens.has(t)).length;
      const coverage = titleTokens.size > 0 ? shared / titleTokens.size : 1;

      if (coverage < 0.25 && similarity < 0.1) {
        signals.push({
          criterionId: 'listing.title.mismatch_description',
          strength: ramp(0.25 - coverage, 0.05, 0.25),
          explanation: `Le titre et la description n'ont presque aucun terme en commun (${Math.round(coverage * 100)} % des mots du titre apparaissent dans le texte). Un tel écart suggère une annonce assemblée à partir de sources différentes, ou un titre volontairement trompeur.`,
          evidence: [
            { kind: 'text', label: 'Titre', value: textUtils.truncate(rawTitle, 100) },
            { kind: 'text', label: 'Recouvrement', value: `${Math.round(coverage * 100)} %` },
          ],
        });
      }
    }

    return signals;
  }

  private analyzeFreshness(context: AnalyzerContext, now: Date): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const { listing } = context;
    if (!listing.publishedAt) return signals;

    const ageDays = daysBetween(listing.publishedAt, now);
    if (!Number.isFinite(ageDays)) return signals;

    if (ageDays < 0.25) {
      signals.push({
        criterionId: 'listing.freshness.very_recent',
        strength: 0.5,
        explanation: `L'annonce a été publiée ${relativeTime(listing.publishedAt, now)}. Elle n'a donc pas encore été exposée à la modération ni aux signalements des autres utilisateurs, qui font disparaître une partie des annonces frauduleuses dans les premières heures.`,
        evidence: [
          { kind: 'metadata', label: 'Publication', value: relativeTime(listing.publishedAt, now) },
        ],
      });
    } else if (ageDays > 90) {
      signals.push({
        criterionId: 'listing.freshness.stale',
        strength: ramp(ageDays, 90, 300),
        explanation: `L'annonce est en ligne depuis ${Math.round(ageDays)} jours. Si le prix est attractif, cette longévité interroge : soit le bien présente un défaut non mentionné, soit l'annonce sert d'appât permanent pour collecter des contacts.`,
        evidence: [
          { kind: 'metadata', label: 'En ligne depuis', value: `${Math.round(ageDays)} jours` },
        ],
      });
    }

    // Republication : mise à jour bien postérieure à la publication déclarée.
    if (listing.updatedAt && listing.publishedAt) {
      const gap = daysBetween(listing.publishedAt, listing.updatedAt);
      if (Number.isFinite(gap) && gap > 30) {
        signals.push({
          criterionId: 'listing.freshness.republished',
          strength: 0.4,
          explanation: `L'annonce a été modifiée ${Math.round(gap)} jours après sa publication initiale. La republication régulière permet de remonter dans les résultats, mais aussi d'effacer l'historique des échanges et de dissimuler l'ancienneté réelle.`,
          evidence: [
            {
              kind: 'metadata',
              label: 'Dernière modification',
              value: relativeTime(listing.updatedAt, now),
            },
          ],
        });
      }
    }

    return signals;
  }

  private analyzeLocation(context: AnalyzerContext): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const location = context.listing.location;

    if (!location || (!location.raw && !location.city && !location.postalCode)) {
      signals.push({
        criterionId: 'listing.location.missing',
        strength: 0.7,
        explanation:
          "Aucune localisation n'est indiquée. Sans elle, aucune remise en main propre ne peut être organisée et la cohérence géographique de l'annonce est invérifiable. C'est justement ce que recherche un vendeur qui ne détient pas le bien.",
        evidence: [{ kind: 'metadata', label: 'Localisation', value: 'absente' }],
      });
      return signals;
    }

    // Cohérence entre code postal français et région déclarée.
    if (location.postalCode && /^\d{5}$/.test(location.postalCode) && location.city) {
      const department = location.postalCode.slice(0, 2);
      const inconsistent = department === '00' || Number(department) > 98;
      if (inconsistent) {
        signals.push({
          criterionId: 'listing.location.inconsistent',
          strength: 0.8,
          explanation: `Le code postal « ${location.postalCode} » ne correspond à aucun département existant. Les informations de localisation ont été saisies sans lien avec un lieu réel.`,
          evidence: [
            { kind: 'metadata', label: 'Code postal', value: location.postalCode },
            { kind: 'metadata', label: 'Ville', value: location.city },
          ],
        });
      }
    }

    return signals;
  }

  private analyzeAttributes(context: AnalyzerContext): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const { listing } = context;
    const profile = getProfile(listing.domain);
    const entries = Object.entries(listing.attributes);

    if (entries.length === 0 && profile.expectedAttributes.length > 0) {
      signals.push({
        criterionId: 'listing.attributes.missing_critical',
        strength: 0.55,
        explanation: `Aucune caractéristique structurée n'accompagne l'annonce, alors qu'un bien de type « ${profile.label} » en compte normalement plusieurs (${profile.expectedAttributes
          .slice(0, 3)
          .map((a) => a.label.toLowerCase())
          .join(', ')}…). L'évaluation doit alors reposer uniquement sur le texte libre.`,
        evidence: [{ kind: 'metadata', label: 'Caractéristiques', value: 'aucune' }],
      });
      return signals;
    }

    // Année déclarée dans le futur ou absurde.
    const currentYear = new Date().getFullYear();
    for (const [key, value] of entries) {
      if (/ann(e|é)e|year/i.test(key)) {
        const year = Number(value.replace(/\D/g, ''));
        if (Number.isFinite(year) && year > 1900 && (year > currentYear + 1 || year < 1950)) {
          signals.push({
            criterionId: 'listing.attributes.contradictory',
            strength: 0.85,
            explanation: `L'année déclarée (${year}) est impossible pour ce bien. Une donnée aussi manifestement fausse indique une fiche remplie automatiquement, sans rapport avec un objet réel.`,
            evidence: [{ kind: 'metadata', label: key, value }],
          });
        }
      }
    }

    return signals;
  }

  private analyzePlatform(context: AnalyzerContext): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const profile = getPlatformProfile(context.listing.source.platform);

    if (profile.protectedPayment) {
      signals.push({
        criterionId: 'listing.platform.protected_transaction',
        strength: 0.85,
        explanation: `${profile.label} propose un paiement protégé${profile.protectionName ? ` (${profile.protectionName})` : ''}. L'utiliser transforme radicalement votre exposition : en cas de non-réception, vous disposez d'un recours réel.${profile.notes ? ` À noter : ${profile.notes.charAt(0).toLowerCase()}${profile.notes.slice(1)}` : ''}`,
        evidence: [
          { kind: 'metadata', label: 'Plateforme', value: profile.label },
          { kind: 'metadata', label: 'Protection', value: profile.protectionName ?? 'disponible' },
        ],
      });
    } else if (profile.baselineExposure >= 0.65) {
      signals.push({
        criterionId: 'listing.platform.high_risk_context',
        strength: ramp(profile.baselineExposure, 0.6, 0.85),
        explanation: `${profile.label} ne propose ni paiement sécurisé ni vérification d'identité des vendeurs.${profile.notes ? ` ${profile.notes}` : ''} L'intégralité du risque repose donc sur vos propres vérifications : privilégiez impérativement la remise en main propre avec paiement sur place.`,
        evidence: [
          { kind: 'metadata', label: 'Plateforme', value: profile.label },
          { kind: 'metadata', label: 'Paiement sécurisé', value: 'indisponible' },
        ],
      });
    }

    return signals;
  }

  /** Mesure la part des champs exploitables réellement renseignés. */
  private measureCompleteness(context: AnalyzerContext): { available: number; expected: number } {
    const { listing } = context;
    const fields = [
      Boolean(listing.title),
      listing.description.length > 40,
      Boolean(listing.price?.amount),
      Boolean(listing.location?.raw || listing.location?.city),
      listing.images.length > 0,
      Boolean(listing.seller),
      Boolean(listing.publishedAt),
      Object.keys(listing.attributes).length > 0,
    ];
    return { available: fields.filter(Boolean).length, expected: fields.length };
  }
}
