import { normalize, truncate } from '@veritas/core';
import type { Analyzer, AnalyzerContext, AnalyzerResult, SignalDraft } from './types';

/**
 * Motifs recherchés dans le contexte libre saisi par l'utilisateur.
 *
 * Ces signaux sont volontairement forts : ce que l'utilisateur rapporte de ses
 * échanges directs avec le vendeur est bien plus révélateur que le texte
 * public de l'annonce, précisément parce que la fraude se dévoile après le
 * premier contact — jamais dans l'annonce elle-même.
 */
const CONTEXT_PATTERNS: {
  criterionId: string;
  patterns: RegExp[];
  strength: number;
  explain: string;
}[] = [
  {
    criterionId: 'behavior.evasion.refuses_verification',
    patterns: [
      /\b(refuse|ne veut pas|a refuse)\b.{0,40}\b(photo|video|appel|rencontre|visite|essai|numero de serie|facture)\b/,
      /\b(pas possible|impossible)\b.{0,30}\b(appel video|facetime|whatsapp video|rencontre)\b/,
      /\b(ignore|evite|change de sujet)\b.{0,30}\b(question|demande)\b/,
    ],
    strength: 0.95,
    explain:
      "Vous rapportez que le vendeur refuse une vérification simple. C'est le signal le plus décisif de toute l'analyse : envoyer une photo supplémentaire ou décrocher trente secondes en visio ne coûte rien à quelqu'un qui possède réellement le bien. Ce refus ne s'explique que par son absence.",
  },
  {
    criterionId: 'behavior.escalation.pressure_after_contact',
    patterns: [
      /\b(insiste|me presse|me met la pression|relance sans arret|veut que je paye (vite|maintenant|tout de suite))\b/,
      /\b(menace|se fache|s'enerve)\b/,
      /\b(un autre acheteur|quelqu'un d'autre)\b.{0,40}\b(attend|va prendre|paye)\b/,
    ],
    strength: 0.9,
    explain:
      "Vous décrivez une pression apparue après le premier contact, absente de l'annonce publiée. C'est précisément le moment où une fraude se révèle : l'escroc laisse l'annonce sobre pour passer la modération, puis presse la victime en messagerie privée.",
  },
  {
    criterionId: 'behavior.reported.user_context',
    patterns: [
      /\b(carte cadeau|paysafecard|transcash|neosurf|pcs|steam)\b/,
      /\b(western union|moneygram|mandat cash)\b/,
      /\b(rib|iban|coordonnees bancaires|code (recu|par sms))\b/,
      /\b(lien|site)\b.{0,30}\b(bizarre|etrange|inconnu|pas officiel)\b/,
      /\b(a l'etranger|militaire|en mission|ne peut pas se deplacer)\b/,
      /\b(demande (un )?acompte|verser (d'abord|avant))\b/,
    ],
    strength: 0.85,
    explain:
      "Le contexte que vous avez décrit contient un élément qui n'apparaît pas dans l'annonce publiée. Votre observation directe prime sur le texte : c'est en messagerie privée que les conditions réelles de la transaction se négocient.",
  },
];

/**
 * Analyseur contextuel.
 *
 * Il exploite les notes libres de l'utilisateur et l'historique de
 * surveillance. C'est le seul analyseur dont la matière première ne provient
 * pas de l'annonce elle-même.
 */
export class ContextAnalyzer implements Analyzer {
  readonly name = 'context';
  readonly category = 'behavior' as const;

  async run(context: AnalyzerContext): Promise<AnalyzerResult> {
    const notes = context.notes?.trim();

    if (!notes || notes.length < 8) {
      return {
        name: this.name,
        category: this.category,
        applicable: false,
        unavailableReason:
          "Aucun contexte n'a été fourni sur vos échanges avec le vendeur. Ajoutez-le : c'est souvent l'information la plus décisive.",
        evaluated: 0,
        signals: [],
      };
    }

    const normalized = normalize(notes);
    const signals: SignalDraft[] = [];

    for (const rule of CONTEXT_PATTERNS) {
      const matches = rule.patterns
        .map((pattern) => pattern.exec(normalized)?.[0])
        .filter((match): match is string => Boolean(match));

      if (matches.length === 0) continue;

      signals.push({
        criterionId: rule.criterionId,
        strength: Math.min(1, rule.strength + (matches.length - 1) * 0.05),
        explanation: `${rule.explain} Passage relevé : « ${truncate(matches[0]!, 90)} ».`,
        evidence: matches.slice(0, 3).map((match) => ({
          kind: 'text' as const,
          label: 'Extrait de votre description',
          value: truncate(match, 120),
        })),
      });
    }

    return {
      name: this.name,
      category: this.category,
      applicable: true,
      evaluated: CONTEXT_PATTERNS.reduce((sum, rule) => sum + rule.patterns.length, 0),
      signals,
    };
  }
}
