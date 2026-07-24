import { normalize } from '@veritas/core';

/**
 * Reconnaissance d'intention.
 *
 * Plutôt qu'un classifieur statistique, on utilise un score de correspondance
 * pondéré : chaque intention déclare des expressions caractéristiques et des
 * mots-clés d'appoint. C'est parfaitement adapté à un domaine fermé — les
 * utilisateurs posent une vingtaine de questions différentes sur une annonce —
 * et cela présente trois avantages décisifs : aucune donnée d'entraînement
 * n'est nécessaire, la reconnaissance est instantanée, et surtout on peut
 * toujours expliquer pourquoi telle intention a été retenue.
 */

export const INTENTS = [
  'should_i_buy',
  'explain_score',
  'list_risks',
  'explain_finding',
  'price_question',
  'seller_question',
  'photos_question',
  'payment_advice',
  'meeting_advice',
  'questions_to_ask',
  'draft_message',
  'next_steps',
  'report_scam',
  'legal_recourse',
  'what_is_veritas',
  'greeting',
  'thanks',
  'fallback',
] as const;

export type Intent = (typeof INTENTS)[number];

interface IntentPatternSet {
  intent: Intent;
  /** Expressions fortes : une seule correspondance emporte généralement la décision. */
  phrases: RegExp[];
  /** Mots-clés d'appoint, qui ajoutent un poids plus faible. */
  keywords?: RegExp[];
  /** Poids de base, pour départager les intentions génériques des spécifiques. */
  weight?: number;
}

const PATTERNS: IntentPatternSet[] = [
  {
    intent: 'should_i_buy',
    phrases: [
      /\b(est ce que |est-ce que )?tu (l'|le |la )?ach[eè]terais\b/,
      /\b(je peux|puis je|puis-je|dois je|dois-je) (y aller|acheter|foncer|me lancer)\b/,
      /\bj'y vais\b/,
      /\bc'est fiable\b/,
      /\bje fonce\b/,
      /\bton avis\b/,
      /\btu (en )?penses? quoi\b/,
      /\bqu'en penses[- ]tu\b/,
      /\b(faut il|faut-il) (acheter|y aller)\b/,
    ],
    keywords: [/\bacheter\b/, /\bconfiance\b/, /\bavis\b/],
    weight: 1.2,
  },
  {
    intent: 'explain_score',
    phrases: [
      /\bpourquoi ce (score|note|resultat|verdict)\b/,
      /\bcomment (tu |est ce que tu |as tu )?(calcul|obten)/,
      /\bd'ou vient (ce|le) (score|chiffre)\b/,
      /\bexplique (moi )?(le |ce )?(score|verdict|calcul|resultat)\b/,
      /\bsur quoi (tu te bases|te bases tu)\b/,
    ],
    keywords: [/\bscore\b/, /\bcalcul\b/, /\bpourcentage\b/],
    weight: 1.3,
  },
  {
    intent: 'list_risks',
    phrases: [
      /\bquels sont les risques\b/,
      /\bquel(s)? (est|sont) le(s)? (risque|danger|probleme)/,
      /\b(y a t il|y a-t-il|est ce qu'il y a) (un |des )?(risque|danger|probleme|souci)/,
      /\bqu'est ce qui (cloche|ne va pas|est suspect)\b/,
      /\bpoints? (negatifs?|faibles?|d'alerte)\b/,
      /\bles risques\b/,
    ],
    keywords: [/\brisque/, /\bdanger/, /\bsuspect/, /\barnaque/],
    weight: 1.2,
  },
  {
    intent: 'price_question',
    phrases: [
      /\ble prix est[- ]il\b/,
      /\bpourquoi (le prix|c'est) (si |aussi )?(bas|eleve|cher|bon marche)\b/,
      /\bc'est (cher|donne|pas cher|trop cher)\b/,
      /\bprix (correct|coherent|normal|juste|du marche)\b/,
      /\b(combien|quel prix) (ca |cela )?(vaut|coute)\b/,
      /\bnegocier le prix\b/,
    ],
    keywords: [/\bprix\b/, /\bcher\b/, /\bmarche\b/, /\btarif\b/, /\bcote\b/],
    weight: 1.1,
  },
  {
    intent: 'seller_question',
    phrases: [
      /\ble vendeur est[- ]il\b/,
      /\b(qui est|c'est qui) le vendeur\b/,
      /\b(que|qu'est ce que tu) sais (tu )?(sur|du) (le )?vendeur\b/,
      /\bcompte (recent|fiable|verifie)\b/,
      /\bses avis\b/,
      /\bsa reputation\b/,
    ],
    keywords: [/\bvendeur\b/, /\bcompte\b/, /\bavis\b/, /\bprofil\b/, /\breputation\b/],
    weight: 1.1,
  },
  {
    intent: 'photos_question',
    phrases: [
      /\bles photos sont[- ]elles\b/,
      /\bphotos? (vraie|authentique|truquee|volee|retouchee|originale)/,
      /\b(verifier|analyser) les (photos|images)\b/,
      /\brecherche (d'image )?inversee\b/,
      /\bles images (viennent|proviennent) d'ou\b/,
    ],
    keywords: [/\bphoto/, /\bimage/, /\bcliche/],
    weight: 1.1,
  },
  {
    intent: 'payment_advice',
    phrases: [
      /\bcomment (je )?(dois )?payer\b/,
      /\bquel (moyen|mode) de paiement\b/,
      /\b(je peux|puis je) payer par\b/,
      /\bpaiement (securise|sur|risque)\b/,
      /\b(virement|paypal|especes|cheque|carte)\b.*\b(ok|sur|risque|conseil)/,
    ],
    keywords: [/\bpayer\b/, /\bpaiement\b/, /\bvirement\b/, /\bpaypal\b/],
    weight: 1.1,
  },
  {
    intent: 'meeting_advice',
    phrases: [
      /\b(ou|comment) (le |la |se )?(rencontrer|voir|recuperer)\b/,
      /\bremise en main propre\b/,
      /\brendez[- ]vous\b/,
      /\b(je dois|faut il) (me deplacer|aller le voir)\b/,
      /\blieu de rencontre\b/,
    ],
    keywords: [/\brencontre/, /\bvisite/, /\bdeplacer/],
    weight: 1.1,
  },
  {
    intent: 'questions_to_ask',
    phrases: [
      /\b(quelles|quelle) questions? (je )?(dois|devrais|peux)?\s*(lui )?(poser|demander)\b/,
      /\bque (dois je|dois-je|je dois) (lui )?demander\b/,
      /\b(genere|fais|donne)[- ]moi (une )?(liste|serie) de questions\b/,
      /\bquoi (lui )?demander\b/,
      /\bquestions a poser\b/,
    ],
    keywords: [/\bquestion/, /\bdemander\b/],
    weight: 1.3,
  },
  {
    intent: 'draft_message',
    phrases: [
      /\b(redige|ecris|prepare|genere|fais)[- ]moi (un )?(message|mail|texte|sms)\b/,
      /\bmessage (au|pour le) vendeur\b/,
      /\bcomment (je )?(lui )?(ecris|contacte|aborde)\b/,
      /\bquoi (lui )?(ecrire|dire)\b/,
    ],
    keywords: [/\bmessage\b/, /\brediger?\b/, /\becrire\b/],
    weight: 1.4,
  },
  {
    intent: 'next_steps',
    phrases: [
      /\b(je fais|on fait) quoi (maintenant|ensuite)\b/,
      /\b(quelles?|quoi comme) (etapes?|prochaines? etapes?)\b/,
      /\bque (dois je|je dois) faire\b/,
      /\bcomment (je )?(procede|continue)\b/,
      /\bla suite\b/,
    ],
    keywords: [/\betape/, /\bsuite\b/, /\bfaire\b/],
    weight: 1,
  },
  {
    intent: 'report_scam',
    phrases: [
      /\b(comment|ou) (je )?(signale|denonce|porte plainte)\b/,
      /\bsignaler (l'annonce|cette annonce|le vendeur)\b/,
      /\bporter plainte\b/,
      /\bje me suis fait (avoir|arnaquer)\b/,
      /\bj'ai (deja )?paye\b/,
    ],
    keywords: [/\bsignaler\b/, /\bplainte\b/, /\barnaque\b/, /\bescroquerie\b/],
    weight: 1.3,
  },
  {
    intent: 'legal_recourse',
    phrases: [
      /\b(quels|quel) (sont mes |est mon )?(recours|droits)\b/,
      /\bje peux (me faire )?rembourser\b/,
      /\bgarantie legale\b/,
      /\bdroit de retractation\b/,
    ],
    keywords: [/\brecours\b/, /\bdroit/, /\bremboursement\b/, /\bgarantie\b/],
    weight: 1.1,
  },
  {
    intent: 'explain_finding',
    phrases: [
      /\bpourquoi (tu dis|dis[- ]tu|c'est|est ce) (que )?/,
      /\bexplique (moi )?(ce |le |cette )?(point|constat|critere|alerte|signal)\b/,
      /\bqu'est ce que (ca|cela) veut dire\b/,
      /\bc'est quoi (ce|cette|le|la)\b/,
      /\bpourquoi (ce|cette) (alerte|constat|point)\b/,
    ],
    keywords: [/\bpourquoi\b/, /\bexplique/, /\bconstat\b/, /\bcritere\b/],
    weight: 0.9,
  },
  {
    intent: 'what_is_veritas',
    phrases: [
      /\bqui es[- ]tu\b/,
      /\bc'est quoi veritas\b/,
      /\bcomment (tu fonctionnes|fonctionnes[- ]tu)\b/,
      /\btu es (une |un )?(ia|intelligence artificielle|robot|chatgpt)\b/,
      /\btu utilises (quoi|chatgpt|openai)\b/,
    ],
    keywords: [/\bveritas\b/, /\bia\b/],
    weight: 1.2,
  },
  {
    intent: 'greeting',
    phrases: [/^(bonjour|bonsoir|salut|hello|hey|coucou|yo)\b/],
    weight: 0.8,
  },
  {
    intent: 'thanks',
    phrases: [/\bmerci\b/, /\bnickel\b/, /\bparfait\b/, /\bsuper\b/, /\btop\b/],
    weight: 0.7,
  },
];

export interface IntentMatch {
  intent: Intent;
  confidence: number;
  /** Expressions ayant motivé la décision — exposées pour la transparence. */
  matched: string[];
}

/** Détecte l'intention d'une question et rend compte de ce qui l'a déclenchée. */
export function detectIntent(question: string): IntentMatch {
  const normalized = normalize(question);
  if (normalized.length === 0) {
    return { intent: 'fallback', confidence: 0, matched: [] };
  }

  const scores: IntentMatch[] = [];

  for (const set of PATTERNS) {
    let score = 0;
    const matched: string[] = [];

    for (const phrase of set.phrases) {
      const match = phrase.exec(normalized);
      if (match?.[0]) {
        score += 1;
        matched.push(match[0]);
      }
    }
    for (const keyword of set.keywords ?? []) {
      if (keyword.test(normalized)) score += 0.25;
    }

    if (score > 0) {
      scores.push({
        intent: set.intent,
        confidence: score * (set.weight ?? 1),
        matched,
      });
    }
  }

  if (scores.length === 0) {
    return { intent: 'fallback', confidence: 0, matched: [] };
  }

  scores.sort((a, b) => b.confidence - a.confidence);
  const best = scores[0]!;

  // Normalisation grossière de la confiance, pour l'affichage.
  return { ...best, confidence: Math.min(1, best.confidence / 2) };
}
