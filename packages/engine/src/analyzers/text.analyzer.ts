import {
  CONTACT_PATTERNS,
  excerptAround,
  extractAll,
  findAllPrices,
  isNegated,
  normalize,
  ramp,
  sanitize,
  textUtils,
  type Evidence,
} from '@veritas/core';
import type { Analyzer, AnalyzerContext, AnalyzerResult, SignalDraft } from './types';
import {
  AI_STYLE_MARKERS,
  CONDITION_TERMS,
  MACHINE_TRANSLATION_MARKERS,
  MARKETING_BOILERPLATE,
  SCAM_LEXICON,
  type ConditionLevel,
  type LexiconEntry,
} from '../knowledge/scam-lexicon';
import { getProfile } from '../knowledge/domain-profiles';

/**
 * Analyseur textuel.
 *
 * Il combine trois familles de méthodes :
 *   • correspondance de motifs sur le lexique de fraude (signaux explicites) ;
 *   • métriques stylométriques (majuscules, entropie, rythme des phrases) ;
 *   • détection d'incohérences internes (état, prix, quantité).
 *
 * Chaque signal produit une explication rédigée et au moins une preuve
 * citable : aucune conclusion n'est émise sans extrait à l'appui.
 */
export class TextAnalyzer implements Analyzer {
  readonly name = 'text';
  readonly category = 'text' as const;

  async run(context: AnalyzerContext): Promise<AnalyzerResult> {
    const { listing } = context;
    const rawText = sanitize(`${listing.title}\n\n${listing.description}`);
    const normalized = normalize(rawText);
    const signals: SignalDraft[] = [];

    if (normalized.length < 12) {
      return {
        name: this.name,
        category: this.category,
        applicable: true,
        evaluated: 3,
        signals: [
          {
            criterionId: 'text.info.too_short',
            strength: 1,
            explanation:
              "L'annonce ne contient presque aucun texte. Sans description, il est impossible de vérifier quoi que ce soit : demandez au vendeur une présentation détaillée du bien avant d'aller plus loin.",
            evidence: [
              {
                kind: 'text',
                label: 'Longueur du texte',
                value: `${normalized.length} caractères`,
              },
            ],
          },
        ],
      };
    }

    signals.push(...this.matchLexicon(normalized, rawText));
    signals.push(...this.analyzeStyle(rawText, normalized));
    signals.push(...this.analyzeCompleteness(context, rawText, normalized));
    signals.push(...this.analyzeContradictions(context, rawText, normalized));
    signals.push(...this.analyzeContacts(rawText, normalized));

    // Un même critère ne doit apparaître qu'une fois : on conserve le signal le plus fort.
    const deduplicated = dedupeByCriterion(signals);

    return {
      name: this.name,
      category: this.category,
      applicable: true,
      evaluated: countEvaluatedCriteria(),
      signals: deduplicated,
      completeness: {
        available: normalized.length > 150 ? 1 : 0.5,
        expected: 1,
      },
    };
  }

  /** Applique le lexique et convertit chaque correspondance en signal. */
  private matchLexicon(normalized: string, rawText: string): SignalDraft[] {
    const signals: SignalDraft[] = [];

    for (const entry of SCAM_LEXICON) {
      const matches = collectMatches(normalized, entry);
      if (matches.length === 0) continue;

      const saturateAt = entry.saturateAt ?? 1;
      const base = entry.baseStrength ?? 0.6;
      // La force croît avec le nombre de motifs distincts trouvés, jusqu'à 1.
      const strength = Math.min(1, base + (1 - base) * ((matches.length - 1) / saturateAt));

      signals.push({
        criterionId: entry.criterionId,
        strength,
        explanation: entry.explain(matches),
        evidence: matches
          .slice(0, 3)
          .map((match) => buildExcerptEvidence(rawText, normalized, match)),
      });
    }

    return signals;
  }

  /** Métriques stylométriques : ce que la forme du texte révèle sur son origine. */
  private analyzeStyle(rawText: string, normalized: string): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const wordCount = textUtils.words(rawText).length;

    const caps = textUtils.uppercaseRatio(rawText);
    if (caps > 0.35) {
      signals.push({
        criterionId: 'text.style.excessive_caps',
        strength: ramp(caps, 0.35, 0.7),
        explanation: `${Math.round(caps * 100)} % du texte est en majuscules. Cette écriture criée sert à capter l'attention et se rencontre surtout dans les annonces publiées en série.`,
        evidence: [
          { kind: 'number', label: 'Part de majuscules', value: `${Math.round(caps * 100)} %` },
        ],
      });
    }

    const emojis = textUtils.emojiCount(rawText);
    const emojiDensity = wordCount > 0 ? emojis / wordCount : 0;
    if (emojis >= 6 && emojiDensity > 0.05) {
      signals.push({
        criterionId: 'text.style.excessive_emoji',
        strength: ramp(emojiDensity, 0.05, 0.2),
        explanation: `Le texte contient ${emojis} emojis pour ${wordCount} mots. Une telle densité décorative est caractéristique des annonces produites en volume plutôt que rédigées pour un bien précis.`,
        evidence: [
          { kind: 'number', label: "Densité d'emojis", value: `${emojis} pour ${wordCount} mots` },
        ],
      });
    }

    const punctuation = textUtils.repeatedPunctuation(rawText);
    if (punctuation >= 3) {
      signals.push({
        criterionId: 'text.style.repeated_punctuation',
        strength: ramp(punctuation, 3, 10),
        explanation: `On relève ${punctuation} séries de ponctuation répétée. C'est un marqueur de pression commerciale artificielle.`,
        evidence: [{ kind: 'number', label: 'Séries de ponctuation', value: String(punctuation) }],
      });
    }

    if (textUtils.hasInvisibleCharacters(rawText)) {
      signals.push({
        criterionId: 'text.obfuscation.invisible_chars',
        strength: 0.9,
        explanation:
          "Le texte contient des caractères de largeur nulle, invisibles à la lecture. Ils sont insérés délibérément pour tromper les filtres automatiques de la plateforme : aucun rédacteur légitime n'en produit.",
        evidence: [{ kind: 'metadata', label: 'Caractères invisibles', value: 'détectés' }],
      });
    }

    // Traduction automatique.
    const translationHits = MACHINE_TRANSLATION_MARKERS.filter((p) => p.test(normalized));
    if (translationHits.length > 0) {
      signals.push({
        criterionId: 'text.style.machine_translation',
        strength: Math.min(1, 0.5 + translationHits.length * 0.25),
        explanation: `Des tournures calquées sur l'anglais apparaissent (${translationHits.length} marqueur${translationHits.length > 1 ? 's' : ''}). Le texte a vraisemblablement été traduit automatiquement, ce qui accompagne souvent une annonce diffusée simultanément dans plusieurs pays.`,
        evidence: translationHits
          .slice(0, 2)
          .map((p) => buildRegexEvidence(rawText, normalized, p, 'Tournure traduite')),
      });
    }

    // Texte de fiche produit.
    const boilerplateHits = MARKETING_BOILERPLATE.filter((p) => p.test(normalized));
    if (boilerplateHits.length >= 2) {
      signals.push({
        criterionId: 'text.style.marketing_boilerplate',
        strength: Math.min(1, 0.4 + boilerplateHits.length * 0.2),
        explanation: `La description reprend le discours commercial du fabricant (${boilerplateHits.length} formules types) au lieu de décrire l'exemplaire réellement détenu. Demandez des précisions sur l'état concret de l'objet : le vendeur ne l'a peut-être jamais eu entre les mains.`,
        evidence: boilerplateHits
          .slice(0, 3)
          .map((p) => buildRegexEvidence(rawText, normalized, p, 'Formule de catalogue')),
      });
    }

    /*
     * Détection de texte généré.
     *
     * Aucun de ces indices ne suffit isolément — un vendeur peut écrire
     * proprement. C'est la conjonction de marqueurs stylistiques, d'un rythme
     * de phrases inhabituellement régulier et d'une absence de détail concret
     * qui fait signal, d'où l'accumulation de conditions ci-dessous.
     */
    if (wordCount >= 60) {
      const aiHits = AI_STYLE_MARKERS.filter((p) => p.test(normalized));
      const variance = textUtils.sentenceLengthVariance(rawText);
      const avgLength = textUtils.averageSentenceLength(rawText);
      const diversity = textUtils.lexicalDiversity(rawText);

      // Un humain alterne phrases courtes et longues ; un modèle produit un rythme régulier.
      const uniformRhythm = Number.isFinite(variance) && variance < 3.2 && avgLength > 11;
      const clues = aiHits.length + (uniformRhythm ? 1 : 0) + (diversity > 0.82 ? 1 : 0);

      if (aiHits.length >= 2 && clues >= 3) {
        signals.push({
          criterionId: 'text.style.ai_generated',
          strength: Math.min(0.85, 0.35 + clues * 0.12),
          explanation: `Plusieurs marqueurs convergent vers une rédaction automatique : ${aiHits.length} formules de transition stéréotypées${uniformRhythm ? `, un rythme de phrases très régulier (écart-type de ${variance.toFixed(1)} mots)` : ''}${diversity > 0.82 ? `, un vocabulaire inhabituellement varié pour une annonce` : ''}. Un texte généré n'est pas frauduleux en soi, mais il n'apporte aucune information de première main sur le bien.`,
          evidence: aiHits
            .slice(0, 3)
            .map((p) => buildRegexEvidence(rawText, normalized, p, 'Formule caractéristique')),
        });
      }

      if (uniformRhythm && aiHits.length < 2) {
        signals.push({
          criterionId: 'text.style.uniform_rhythm',
          strength: ramp(4 - variance, 0.8, 3),
          explanation: `La longueur des phrases varie très peu (écart-type de ${variance.toFixed(1)} mots autour de ${avgLength.toFixed(0)}). Une rédaction spontanée alterne davantage.`,
          evidence: [
            {
              kind: 'number',
              label: 'Régularité des phrases',
              value: `écart-type ${variance.toFixed(1)} mots`,
            },
          ],
        });
      }

      if (diversity < 0.45) {
        signals.push({
          criterionId: 'text.style.low_lexical_diversity',
          strength: ramp(0.45 - diversity, 0.05, 0.25),
          explanation: `Seuls ${Math.round(diversity * 100)} % des mots sont distincts sur un texte de ${wordCount} mots. Ce vocabulaire répétitif évoque un remplissage ou une accumulation de mots-clés.`,
          evidence: [
            {
              kind: 'number',
              label: 'Diversité lexicale',
              value: `${Math.round(diversity * 100)} %`,
            },
          ],
        });
      }
    }

    if (wordCount >= 120 && !signals.some((s) => s.criterionId === 'text.style.ai_generated')) {
      signals.push({
        criterionId: 'text.positive.detailed_description',
        strength: ramp(wordCount, 120, 300),
        explanation: `La description compte ${wordCount} mots et entre dans le détail. Un vendeur qui prend le temps d'écrire longuement sur son bien le connaît généralement bien.`,
        evidence: [
          { kind: 'number', label: 'Longueur de la description', value: `${wordCount} mots` },
        ],
      });
    }

    return signals;
  }

  /** Vérifie la présence des informations attendues pour cette famille de biens. */
  private analyzeCompleteness(
    context: AnalyzerContext,
    rawText: string,
    normalized: string,
  ): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const { listing } = context;
    const profile = getProfile(listing.domain);
    const wordCount = textUtils.words(rawText).length;

    if (wordCount < 25) {
      signals.push({
        criterionId: 'text.info.too_short',
        strength: ramp(25 - wordCount, 3, 20),
        explanation: `La description ne compte que ${wordCount} mots. C'est trop peu pour décrire un bien de cette nature : les annonces publiées en volume se reconnaissent à leur laconisme.`,
        evidence: [{ kind: 'number', label: 'Longueur', value: `${wordCount} mots` }],
      });
    }

    // Un attribut est considéré présent s'il figure dans les caractéristiques
    // structurées ou si l'un de ses motifs apparaît dans le texte.
    const attributeKeys = new Set(Object.keys(listing.attributes).map((k) => normalize(k)));
    const missing = profile.expectedAttributes.filter((attribute) => {
      if (
        attributeKeys.has(normalize(attribute.key)) ||
        attributeKeys.has(normalize(attribute.label))
      ) {
        return false;
      }
      return !attribute.patterns.some((pattern) => pattern.test(normalized));
    });

    const missingCritical = missing.filter((a) => a.critical);

    if (missingCritical.length > 0) {
      signals.push({
        criterionId: 'text.info.missing_key_facts',
        strength: ramp(missingCritical.length, 1, profile.expectedAttributes.length),
        explanation: `Pour un bien de la catégorie « ${profile.label} », il manque ${missingCritical.length === 1 ? "l'information suivante" : 'les informations suivantes'} : ${missingCritical.map((a) => a.label.toLowerCase()).join(', ')}. Ces éléments sont indispensables pour comparer l'annonce au marché — leur absence peut être une négligence, mais elle empêche toute vérification.`,
        evidence: missingCritical.slice(0, 5).map((a) => ({
          kind: 'text' as const,
          label: 'Information manquante',
          value: a.label,
        })),
      });
    } else if (missing.length === 0) {
      signals.push({
        criterionId: 'listing.attributes.complete',
        strength: 0.9,
        explanation: `Toutes les informations attendues pour un bien de type « ${profile.label} » sont présentes. Cette complétude permet une comparaison de marché fiable et traduit un vendeur qui maîtrise son sujet.`,
        evidence: profile.expectedAttributes.slice(0, 4).map((a) => ({
          kind: 'text' as const,
          label: 'Information fournie',
          value: a.label,
        })),
      });
    }

    // État du bien.
    const detected = detectConditions(normalized);
    if (detected.length === 0 && !listing.condition) {
      signals.push({
        criterionId: 'text.info.vague_condition',
        strength: 0.7,
        explanation:
          "L'état du bien n'est jamais qualifié. Cette imprécision permet au vendeur de contester ensuite toute réclamation : demandez-lui de décrire précisément l'usure et les défauts éventuels.",
        evidence: [{ kind: 'text', label: 'État déclaré', value: 'non précisé' }],
      });
    }

    return signals;
  }

  /** Détecte les incohérences internes du texte. */
  private analyzeContradictions(
    context: AnalyzerContext,
    rawText: string,
    normalized: string,
  ): SignalDraft[] {
    const signals: SignalDraft[] = [];
    const { listing } = context;

    // Contradiction d'état : « neuf » et « quelques rayures » ne coexistent pas.
    const detected = detectConditions(normalized);
    const hasPristine = detected.includes('new') || detected.includes('excellent');
    const hasWorn = detected.includes('fair') || detected.includes('poor');
    if (hasPristine && hasWorn) {
      signals.push({
        criterionId: 'text.contradiction.condition',
        strength: 0.85,
        explanation: `L'annonce décrit à la fois un bien ${detected.includes('new') ? 'neuf' : 'en parfait état'} et un bien présentant de l'usure ou des défauts. Ces deux affirmations sont incompatibles : le texte a probablement été assemblé à partir de sources différentes plutôt que rédigé en observant l'objet.`,
        evidence: collectConditionEvidence(rawText, normalized),
      });
    }

    // Contradiction de prix : montants du texte incompatibles avec le prix affiché.
    if (listing.price?.amount) {
      const textPrices = findAllPrices(rawText, listing.price.currency).filter(
        (p) => p.amount > 0 && p.amount !== listing.price!.amount,
      );
      // On ignore les montants plausibles comme accessoires (< 20 % du prix)
      // ou comme prix neuf de référence (> prix affiché).
      const conflicting = textPrices.filter(
        (p) => p.amount < listing.price!.amount && p.amount > listing.price!.amount * 0.2,
      );

      if (conflicting.length > 0) {
        signals.push({
          criterionId: 'text.contradiction.price',
          strength: 0.6,
          explanation: `Le prix affiché est de ${listing.price.amount} ${listing.price.currency}, mais la description mentionne ${conflicting.map((p) => `${p.amount} ${p.currency}`).join(', ')}. Faites préciser le montant réellement demandé : un écart non expliqué sert parfois d'appât pour déclencher le contact.`,
          evidence: conflicting.slice(0, 3).map((p) => ({
            kind: 'number' as const,
            label: 'Montant contradictoire',
            value: `${p.amount} ${p.currency}`,
          })),
        });
      }
    }

    // Vente présentée comme unique mais décrivant un stock.
    const stockPattern =
      /\b(plusieurs (exemplaires|pieces|disponibles)|stock (disponible|important)|\d+ (disponibles|en stock)|lot de \d+)\b/;
    const stockMatch = stockPattern.exec(normalized);
    if (stockMatch) {
      signals.push({
        criterionId: 'text.contradiction.quantity',
        strength: 0.7,
        explanation: `L'annonce évoque plusieurs exemplaires (« ${stockMatch[0]} ») alors qu'elle est publiée comme une vente entre particuliers. Il s'agit vraisemblablement d'une activité commerciale déguisée, ce qui vous prive des garanties légales dues par un professionnel.`,
        evidence: [buildExcerptEvidence(rawText, normalized, stockMatch[0])],
      });
    }

    return signals;
  }

  /** Coordonnées publiées en clair dans la description. */
  private analyzeContacts(rawText: string, _normalized: string): SignalDraft[] {
    const signals: SignalDraft[] = [];

    const emails = extractAll(rawText, CONTACT_PATTERNS.email);
    const phones = extractAll(rawText, CONTACT_PATTERNS.phone).filter(
      (p) => p.replace(/\D/g, '').length >= 9,
    );

    if (emails.length > 0 || phones.length > 0) {
      const parts: string[] = [];
      if (phones.length > 0) parts.push(`${phones.length} numéro${phones.length > 1 ? 's' : ''}`);
      if (emails.length > 0)
        parts.push(`${emails.length} adresse${emails.length > 1 ? 's' : ''} email`);

      const evidence: Evidence[] = [
        ...phones.slice(0, 2).map((p) => ({
          kind: 'text' as const,
          label: 'Numéro dans la description',
          value: maskContact(p),
        })),
        ...emails.slice(0, 2).map((e) => ({
          kind: 'text' as const,
          label: 'Email dans la description',
          value: maskContact(e),
        })),
      ];

      signals.push({
        criterionId: 'text.contact.in_description',
        strength: 0.6,
        explanation: `La description publie directement ${parts.join(' et ')}. Contourner la messagerie de la plateforme place vos échanges hors de tout contrôle : en cas de litige, aucune trace ne pourra être produite. Ce n'est pas rédhibitoire, mais privilégiez toujours la messagerie intégrée pour les premiers échanges.`,
        evidence,
      });
    }

    const urls = extractAll(rawText, CONTACT_PATTERNS.url);
    if (urls.length >= 3) {
      signals.push({
        criterionId: 'text.link.shortened_url',
        strength: 0.3,
        explanation: `L'annonce contient ${urls.length} liens externes. Vérifiez chaque destination avant de cliquer : les redirections sont le vecteur principal des pages d'hameçonnage.`,
        evidence: urls.slice(0, 3).map((u) => ({ kind: 'link' as const, label: 'Lien', value: u })),
      });
    }

    return signals;
  }
}

// ── Fonctions utilitaires ──────────────────────────────────────────────

/**
 * Applique les motifs d'une entrée du lexique en écartant les correspondances niées.
 *
 * Un motif comme « remise en main propre » se retrouve tel quel dans « pas de
 * remise en main propre possible » : sans ce filtre, le moteur conclurait
 * l'inverse de ce que dit l'annonce. Les critères dont la négation fait
 * partie du motif (« pas de visite ») ne sont pas concernés, puisque la
 * négation est alors incluse dans la correspondance elle-même.
 */
function collectMatches(normalized: string, entry: LexiconEntry): string[] {
  const found: string[] = [];
  for (const pattern of entry.patterns) {
    const match = pattern.exec(normalized);
    if (!match?.[0]) continue;
    if (isNegated(normalized, match.index)) continue;
    found.push(match[0]);
  }
  return found;
}

/** Retrouve l'extrait d'origine (accentué, casse préservée) à partir du texte normalisé. */
function buildExcerptEvidence(rawText: string, normalized: string, match: string): Evidence {
  const index = normalized.indexOf(match);
  if (index === -1) {
    return { kind: 'text', label: 'Passage détecté', value: match };
  }
  // Le texte normalisé conserve l'ordre des caractères : la position est une
  // bonne approximation dans le texte d'origine, suffisante pour un extrait.
  const approximate = Math.min(index, Math.max(0, rawText.length - 1));
  return {
    kind: 'text',
    label: 'Passage détecté',
    value: match,
    excerpt: excerptAround(rawText, approximate, 70),
    span: { start: approximate, end: Math.min(rawText.length, approximate + match.length) },
  };
}

function buildRegexEvidence(
  rawText: string,
  normalized: string,
  pattern: RegExp,
  label: string,
): Evidence {
  const match = pattern.exec(normalized);
  if (!match?.[0]) return { kind: 'text', label, value: pattern.source };
  const evidence = buildExcerptEvidence(rawText, normalized, match[0]);
  return { ...evidence, label };
}

function detectConditions(normalized: string): ConditionLevel[] {
  const found: ConditionLevel[] = [];
  for (const [level, patterns] of Object.entries(CONDITION_TERMS) as [ConditionLevel, RegExp[]][]) {
    if (patterns.some((p) => p.test(normalized))) found.push(level);
  }
  return found;
}

function collectConditionEvidence(rawText: string, normalized: string): Evidence[] {
  const evidence: Evidence[] = [];
  for (const [level, patterns] of Object.entries(CONDITION_TERMS) as [ConditionLevel, RegExp[]][]) {
    for (const pattern of patterns) {
      const match = pattern.exec(normalized);
      if (match?.[0]) {
        evidence.push({
          ...buildExcerptEvidence(rawText, normalized, match[0]),
          label: `État « ${level} »`,
        });
        break;
      }
    }
  }
  return evidence.slice(0, 4);
}

function maskContact(value: string): string {
  if (value.includes('@')) {
    const [local = '', domain = ''] = value.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  const digits = value.replace(/\D/g, '');
  return `${digits.slice(0, 2)}${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}`;
}

function dedupeByCriterion(signals: SignalDraft[]): SignalDraft[] {
  const best = new Map<string, SignalDraft>();
  for (const signal of signals) {
    const existing = best.get(signal.criterionId);
    if (!existing || signal.strength > existing.strength) best.set(signal.criterionId, signal);
  }
  return [...best.values()];
}

/** Nombre de critères textuels réellement passés en revue à chaque analyse. */
function countEvaluatedCriteria(): number {
  // Motifs du lexique + métriques de style + complétude + contradictions + contacts.
  return (
    SCAM_LEXICON.length +
    MARKETING_BOILERPLATE.length +
    AI_STYLE_MARKERS.length +
    MACHINE_TRANSLATION_MARKERS.length +
    12
  );
}
