import {
  formatMoney,
  normalize,
  textSimilarity,
  VERDICT_PRESENTATION,
  type AnalysisReport,
  type BrainReply,
  type Finding,
} from '@veritas/core';
import { buildHighlights } from '@veritas/engine';
import type { Intent } from './intents';

/**
 * Générateurs de réponses.
 *
 * Règle absolue : **toute affirmation doit provenir du rapport**. Aucun
 * responder n'invente un fait, n'extrapole une donnée manquante ni ne formule
 * de généralité rassurante. Quand l'information n'existe pas, on le dit —
 * c'est précisément ce qui distingue un assistant fiable d'un modèle qui
 * improvise avec assurance.
 *
 * Chaque réponse cite les constats qui la fondent (`citedFindings`), ce qui
 * permet à l'interface de surligner le rapport en regard de la conversation.
 */

export interface ResponderContext {
  report: AnalysisReport;
  question: string;
}

type Responder = (context: ResponderContext) => BrainReply;

const bullet = (items: string[]): string => items.map((item) => `• ${item}`).join('\n');

function ids(findings: Finding[]): string[] {
  return findings.map((f) => f.criterionId);
}

/** Constats négatifs les plus lourds, dans l'ordre où ils comptent. */
function topNegative(report: AnalysisReport, limit = 5): Finding[] {
  return report.findings.filter((f) => f.polarity === 'negative').slice(0, limit);
}

function topPositive(report: AnalysisReport, limit = 5): Finding[] {
  return report.findings.filter((f) => f.polarity === 'positive').slice(0, limit);
}

// ── Responders ─────────────────────────────────────────────────────────

const shouldIBuy: Responder = ({ report }) => {
  const highlights = buildHighlights(report.findings);
  const critical = highlights.critical;
  const positives = topPositive(report, 3);

  const lines: string[] = [];

  if (report.verdict === 'dangerous' || critical.length > 0) {
    lines.push(
      `Non — je ne l'achèterais pas en l'état. Le risque est évalué à **${report.scores.risk} %**, et ${critical.length > 0 ? `${critical.length === 1 ? 'un constat critique' : `${critical.length} constats critiques`} ${critical.length === 1 ? 'suffit' : 'suffisent'} à disqualifier l'annonce` : 'le faisceau de signaux est caractéristique des annonces frauduleuses'}.`,
    );
    if (critical.length > 0) {
      lines.push(
        '',
        'Ce qui bloque :',
        bullet(critical.map((f) => `**${f.label}** — ${f.explanation.split('.')[0]}.`)),
      );
    }
    lines.push(
      '',
      "Ce ne sont pas des points négociables : aucune explication du vendeur ne les rendrait acceptables. N'envoyez aucun paiement et signalez l'annonce à la plateforme.",
    );
  } else if (report.verdict === 'risky') {
    lines.push(
      `Je ne m'y engagerais pas sans vérifications sérieuses. Le risque est à **${report.scores.risk} %**, ce qui est élevé.`,
      '',
      'Ce qui me retient :',
      bullet(topNegative(report, 4).map((f) => `**${f.label}** — ${f.explanation.split('.')[0]}.`)),
      '',
      "Si vous tenez à poursuivre, exigez une rencontre physique avec paiement sur place. Tant que vous ne payez rien à l'avance, vous ne risquez que votre temps.",
    );
  } else if (report.verdict === 'caution') {
    lines.push(
      `Oui, mais pas les yeux fermés. Le risque est modéré (**${report.scores.risk} %**) : rien de rédhibitoire, mais des zones d'ombre à lever.`,
      '',
      'À clarifier avant de vous engager :',
      bullet(topNegative(report, 3).map((f) => `**${f.label}** — ${f.explanation.split('.')[0]}.`)),
    );
    if (positives.length > 0) {
      lines.push(
        '',
        `En faveur de l'annonce : ${positives.map((f) => f.label.toLowerCase()).join(', ')}.`,
      );
    }
  } else {
    lines.push(
      `Oui, l'annonce tient la route. Risque évalué à **${report.scores.risk} %**, confiance **${report.scores.trust} %**.`,
    );
    if (positives.length > 0) {
      lines.push(
        '',
        'Ce qui joue en sa faveur :',
        bullet(positives.map((f) => `**${f.label}** — ${f.explanation.split('.')[0]}.`)),
      );
    }
    const remaining = topNegative(report, 2);
    if (remaining.length > 0) {
      lines.push(
        '',
        `Deux réserves mineures tout de même : ${remaining.map((f) => f.label.toLowerCase()).join(' et ')}.`,
      );
    }
    lines.push(
      '',
      "Appliquez les précautions d'usage — voir le bien, payer à la remise ou via le paiement sécurisé — et ce sera une transaction normale.",
    );
  }

  if (report.metaConfidence < 0.55) {
    lines.push(
      '',
      `⚠️ Un mot de prudence : je n'ai pu exploiter que ${Math.round(report.dataCompleteness * 100)} % des informations habituelles. Mon avis est donc moins solide que d'ordinaire — importez les photos et le texte complet pour que je puisse trancher vraiment.`,
    );
  }

  return {
    content: lines.join('\n'),
    intent: 'should_i_buy',
    citedFindings: ids([...critical, ...topNegative(report, 3), ...positives]),
    suggestions: [
      'Pourquoi ce score ?',
      'Quelles questions poser au vendeur ?',
      'Rédige un message au vendeur',
    ],
  };
};

const explainScore: Responder = ({ report }) => {
  const negatives = report.findings.filter((f) => f.polarity === 'negative');
  const positives = report.findings.filter((f) => f.polarity === 'positive');

  const contribution = (f: Finding): string => {
    const risk = f.contribution.risk ?? 0;
    return `${f.label} (${risk > 0 ? '+' : ''}${risk.toFixed(2)})`;
  };

  const lines = [
    `Voici exactement d'où viennent ces chiffres.`,
    '',
    `J'ai passé en revue **${report.criteriaEvaluated} critères**, dont **${report.findings.length}** se sont déclenchés sur cette annonce : ${negatives.length} défavorables, ${positives.length} favorables.`,
    '',
    `**Méthode.** Je ne fais pas une moyenne. Je pars d'une probabilité a priori — la plupart des annonces sont honnêtes — et chaque critère déclenché déplace cette probabilité d'une quantité proportionnelle à son poids et à la force du signal détecté. Les preuves redondantes sont volontairement atténuées : trois signaux qui disent la même chose ne comptent pas comme trois preuves indépendantes.`,
    '',
  ];

  if (negatives.length > 0) {
    lines.push(
      `**Ce qui a fait monter le risque** (contribution en log-cotes) :`,
      bullet(negatives.slice(0, 6).map(contribution)),
      '',
    );
  }
  if (positives.length > 0) {
    lines.push(
      `**Ce qui l'a fait baisser** :`,
      bullet(positives.slice(0, 5).map(contribution)),
      '',
    );
  }

  lines.push(
    `**Fiabilité de l'analyse elle-même : ${Math.round(report.metaConfidence * 100)} %.** C'est une mesure distincte du verdict : elle dit à quel point j'ai eu de quoi travailler. J'ai disposé de ${Math.round(report.dataCompleteness * 100)} % des informations que j'exploite habituellement.`,
  );

  const unavailable = report.categories.filter((c) => !c.applicable);
  if (unavailable.length > 0) {
    lines.push(
      '',
      `Points aveugles : ${unavailable.map((c) => `${categoryLabel(c.category)} (${c.unavailableReason ?? 'données absentes'})`).join(' ; ')}`,
    );
  }

  return {
    content: lines.join('\n'),
    intent: 'explain_score',
    citedFindings: ids([...negatives.slice(0, 6), ...positives.slice(0, 5)]),
    suggestions: [
      'Quels sont les risques ?',
      'Le prix est-il cohérent ?',
      'Que sais-tu du vendeur ?',
    ],
  };
};

const listRisks: Responder = ({ report }) => {
  const highlights = buildHighlights(report.findings);
  const all = [...highlights.critical, ...highlights.warnings];

  if (all.length === 0) {
    return {
      content: `Je n'ai relevé **aucun signal négatif** sur les critères applicables à cette annonce. Le risque est estimé à ${report.scores.risk} %.\n\nCela ne veut pas dire que le risque est nul : ${report.categories.filter((c) => !c.applicable).length > 0 ? "certaines dimensions n'ont pas pu être analysées, " : ''}et aucune analyse automatique ne remplace une rencontre physique. Mais rien, dans ce que j'ai pu examiner, ne sort de l'ordinaire.`,
      intent: 'list_risks',
      citedFindings: [],
      suggestions: ['Que dois-je vérifier quand même ?', 'Comment payer en sécurité ?'],
    };
  }

  const format = (f: Finding): string => {
    const marker = f.severity === 'critical' ? '🔴' : f.severity === 'high' ? '🟠' : '🟡';
    const evidence = f.evidence[0];
    const proof = evidence ? `\n  ↳ *${evidence.label} : ${evidence.value}*` : '';
    return `${marker} **${f.label}**\n  ${f.explanation}${proof}`;
  };

  const lines = [
    `J'ai relevé **${all.length} point${all.length > 1 ? 's' : ''} d'attention**, du plus grave au moins grave.`,
    '',
    all.map(format).join('\n\n'),
  ];

  if (highlights.critical.length > 0) {
    lines.push(
      '',
      `Les points marqués 🔴 sont des schémas de fraude documentés : ils n'admettent aucune explication légitime.`,
    );
  }

  return {
    content: lines.join('\n'),
    intent: 'list_risks',
    citedFindings: ids(all),
    suggestions: ['Est-ce que tu achèterais ?', 'Que dois-je demander au vendeur ?'],
  };
};

const priceQuestion: Responder = ({ report }) => {
  const price = report.price;

  if (!price || price.verdict === 'unknown') {
    return {
      content: `Je n'ai pas pu évaluer la cohérence du prix.\n\n${price?.explanation ?? "Aucun prix exploitable n'a été trouvé dans l'annonce."}\n\nPour trancher, comparez manuellement avec trois ou quatre annonces du même modèle dans le même état. C'est la vérification la plus rentable que vous puissiez faire : la décote anormale est présente dans la quasi-totalité des annonces frauduleuses.`,
      intent: 'price_question',
      citedFindings: ids(report.findings.filter((f) => f.category === 'price')),
      suggestions: ['Quels sont les risques ?', 'Que sais-tu du vendeur ?'],
    };
  }

  const lines = [price.explanation];

  if (price.market) {
    lines.push(
      '',
      '**Détail du calcul :**',
      bullet(
        [
          `Prix demandé : ${formatMoney(price.observed, price.currency)}`,
          `Valeur médiane de référence : ${formatMoney(price.market.median, price.currency)}`,
          `Fourchette normale : ${formatMoney(price.market.p10, price.currency)} → ${formatMoney(price.market.p90, price.currency)}`,
          `Source : ${price.market.label}`,
          price.expectedDiscount !== undefined
            ? `Décote attendue vu l'état déclaré : ${Math.round(price.expectedDiscount * 100)} %`
            : '',
        ].filter(Boolean),
      ),
    );
  }

  if (price.unexplainedDiscount && price.unexplainedDiscount > 0.15) {
    lines.push(
      '',
      `Après avoir tenu compte de l'âge du modèle et de l'état annoncé, il reste **${Math.round(price.unexplainedDiscount * 100)} % de remise sans explication**. C'est le chiffre qui compte : demandez au vendeur la raison précise de ce prix, et jugez la réponse.`,
    );
  }

  return {
    content: lines.join('\n'),
    intent: 'price_question',
    citedFindings: ids(report.findings.filter((f) => f.category === 'price')),
    suggestions: ['Est-ce que tu achèterais ?', 'Rédige un message au vendeur'],
  };
};

const sellerQuestion: Responder = ({ report }) => {
  const findings = report.findings.filter((f) => f.category === 'seller');
  const seller = report.listing.seller;

  if (!seller || findings.length === 0) {
    return {
      content: `Je n'ai aucune information exploitable sur le vendeur : ni ancienneté de compte, ni avis, ni historique de publication.\n\nC'est un angle mort important de cette analyse. Allez consulter son profil directement sur la plateforme et regardez trois choses : depuis quand le compte existe, combien d'avis il a reçus, et si ses autres annonces forment un ensemble cohérent.`,
      intent: 'seller_question',
      citedFindings: [],
      suggestions: ['Quels sont les risques ?', 'Comment payer en sécurité ?'],
    };
  }

  const positives = findings.filter((f) => f.polarity === 'positive');
  const negatives = findings.filter((f) => f.polarity === 'negative');

  const lines = [`Voici ce que j'ai pu établir sur **${seller.displayName ?? 'ce vendeur'}**.`, ''];

  if (negatives.length > 0) {
    lines.push(
      '**Points de vigilance :**',
      bullet(negatives.map((f) => `${f.label} — ${f.explanation}`)),
      '',
    );
  }
  if (positives.length > 0) {
    lines.push(
      '**Éléments rassurants :**',
      bullet(positives.map((f) => `${f.label} — ${f.explanation}`)),
      '',
    );
  }

  lines.push(
    negatives.length > positives.length
      ? "Au global, ce profil ne fournit pas les garanties qu'on attend : compensez par une rencontre physique et un paiement sur place."
      : "Au global, ce profil correspond à celui d'un vendeur réel avec un historique vérifiable.",
  );

  return {
    content: lines.join('\n'),
    intent: 'seller_question',
    citedFindings: ids(findings),
    suggestions: ['Est-ce que tu achèterais ?', 'Quelles questions poser ?'],
  };
};

const photosQuestion: Responder = ({ report }) => {
  const findings = report.findings.filter((f) => f.category === 'image');
  const images = report.images;

  if (images.length === 0) {
    return {
      content: `Aucune photo n'a pu être analysée.\n\n${findings[0]?.explanation ?? "Aucune image n'a été fournie avec cette annonce."}\n\nC'est dommage, car l'analyse visuelle est souvent décisive : elle révèle les captures d'écran, les photos de catalogue et surtout les images déjà utilisées ailleurs. Importez les photos de l'annonce et je relance cette partie.`,
      intent: 'photos_question',
      citedFindings: ids(findings),
      suggestions: ['Quels sont les risques ?', 'Que dois-je demander au vendeur ?'],
    };
  }

  const lines = [
    `J'ai analysé **${images.length} photo${images.length > 1 ? 's' : ''}**.`,
    '',
    ...findings.map(
      (f) => `${f.polarity === 'positive' ? '✅' : '⚠️'} **${f.label}** — ${f.explanation}`,
    ),
  ];

  const withSearch = images.filter((i) => i.reverseSearch.length > 0);
  if (withSearch.length > 0) {
    lines.push(
      '',
      `**La vérification qui tranche vraiment**, et que je ne peux pas faire à votre place : la recherche d'image inversée. Les liens sont prêts dans la section Photos du rapport, pour Google Images, Bing, Yandex et TinEye. Si une photo apparaît sur un site marchand ou dans une autre annonce, vous avez votre réponse en trente secondes.`,
    );
  }

  return {
    content: lines.join('\n'),
    intent: 'photos_question',
    citedFindings: ids(findings),
    suggestions: ['Est-ce que tu achèterais ?', 'Demande une photo de preuve'],
  };
};

const paymentAdvice: Responder = ({ report }) => {
  const paymentFindings = report.findings.filter(
    (f) => f.category === 'payment' || f.criterionId.startsWith('text.payment'),
  );
  const recommendations = report.recommendations.filter((r) => r.kind === 'payment');

  const lines = ['Sur le paiement, voici ce que je recommande pour cette annonce précise.', ''];

  if (recommendations.length > 0) {
    lines.push(...recommendations.map((r) => `**${r.title}**\n${r.detail}`), '');
  }

  const dangerous = paymentFindings.filter(
    (f) => f.polarity === 'negative' && f.severity === 'critical',
  );
  if (dangerous.length > 0) {
    lines.push('**Signaux critiques détectés :**', bullet(dangerous.map((f) => f.label)), '');
  }

  lines.push(
    '**Le classement des moyens de paiement, du plus sûr au plus dangereux :**',
    bullet([
      '**Espèces à la remise en main propre** — vous voyez le bien avant de payer. Risque quasi nul.',
      '**Paiement sécurisé de la plateforme** — recours réel en cas de non-réception.',
      '**Carte bancaire** — la contestation auprès de votre banque reste possible.',
      "**PayPal biens et services** — protection acheteur ; jamais l'option « entre proches ».",
      '**Virement bancaire** — quasi irrécupérable une fois émis.',
      '**Cartes prépayées, cryptomonnaie, mandat cash** — irrécupérables et intraçables. Aucune vente honnête ne les exige.',
    ]),
  );

  return {
    content: lines.join('\n'),
    intent: 'payment_advice',
    citedFindings: ids(paymentFindings),
    suggestions: ['Où le rencontrer en sécurité ?', 'Rédige un message au vendeur'],
  };
};

const meetingAdvice: Responder = ({ report }) => {
  const blocked = report.findings.some((f) =>
    ['text.excuse.no_visit', 'text.excuse.abroad', 'text.excuse.military_or_mission'].includes(
      f.criterionId,
    ),
  );

  const lines = blocked
    ? [
        "**Attention : le vendeur exclut déjà toute rencontre.** C'est le point le plus important de cette annonce.",
        '',
        'Proposez-lui malgré tout deux options, dans cet ordre :',
        bullet([
          'Une remise en main propre dans un lieu public.',
          "À défaut, un appel vidéo de deux minutes pendant lequel il manipule l'objet et vous montre un détail que vous choisissez sur le moment.",
        ]),
        '',
        "Le second point est décisif : il ne coûte rien à quelqu'un qui possède le bien, et il est impossible à satisfaire pour quelqu'un qui ne l'a pas. **Un refus des deux propositions vaut réponse définitive.**",
      ]
    : [
        "Pour la rencontre, quelques principes simples qui éliminent l'essentiel du risque.",
        '',
        bullet([
          '**Lieu public et fréquenté** — parking de supermarché, gare, centre commercial. Certains commissariats et gendarmeries proposent des points de rencontre dédiés aux transactions entre particuliers.',
          '**En journée**, et prévenez un proche de votre rendez-vous.',
          '**Accompagné** si possible, surtout pour un montant important.',
          "**Testez le bien sur place** avant de sortir l'argent : allumez l'appareil, essayez le véhicule, vérifiez le numéro de série.",
          '**Payez seulement après vérification.** Un vendeur honnête trouve cela parfaitement normal.',
        ]),
      ];

  if (report.listing.location?.raw) {
    lines.push(
      '',
      `L'annonce est localisée à **${report.listing.location.raw}** : proposez un point de rencontre neutre dans cette zone.`,
    );
  }

  return {
    content: lines.join('\n'),
    intent: 'meeting_advice',
    citedFindings: ids(
      report.findings.filter(
        (f) => f.criterionId.includes('meeting') || f.criterionId.includes('visit'),
      ),
    ),
    suggestions: ['Comment payer en sécurité ?', 'Quelles questions poser ?'],
  };
};

const questionsToAsk: Responder = ({ report }) => {
  const questions = report.questionsForSeller;
  const lines = [
    `Voici les questions que je poserais, dans cet ordre. Elles sont choisies en fonction des zones d'ombre **de cette annonce précise**.`,
    '',
    questions.map((q, index) => `${index + 1}. ${q}`).join('\n'),
    '',
    "**Ce qui compte n'est pas seulement la réponse, mais la façon de répondre.** Une esquive répétée sur une question triviale — une photo, un numéro de série — vous en dira plus long que n'importe quelle explication.",
  ];

  return {
    content: lines.join('\n'),
    intent: 'questions_to_ask',
    citedFindings: ids(topNegative(report, 4)),
    suggestions: ['Rédige un message au vendeur', 'Est-ce que tu achèterais ?'],
    attachment: {
      kind: 'checklist',
      title: 'Questions à poser au vendeur',
      body: questions.map((q, index) => `${index + 1}. ${q}`).join('\n'),
    },
  };
};

const nextSteps: Responder = ({ report }) => {
  const recommendations = report.recommendations;
  const lines = [
    `Voici la marche à suivre, par ordre de priorité.`,
    '',
    recommendations
      .map((r, index) => {
        const marker = r.priority === 'critical' ? '🔴' : r.priority === 'high' ? '🟠' : '🔵';
        const because = r.because.length > 0 ? `\n   *Parce que : ${r.because.join(', ')}.*` : '';
        return `${marker} **${index + 1}. ${r.title}**\n   ${r.detail}${because}`;
      })
      .join('\n\n'),
  ];

  return {
    content: lines.join('\n'),
    intent: 'next_steps',
    citedFindings: recommendations.flatMap((r) => r.because),
    suggestions: ['Rédige un message au vendeur', 'Comment payer en sécurité ?'],
  };
};

const reportScam: Responder = () => ({
  content: [
    "Voici les démarches, dans l'ordre où elles comptent.",
    '',
    "**1. Signalez l'annonce sur la plateforme.** Chaque plateforme dispose d'un bouton de signalement sur la page de l'annonce. C'est le plus rapide et cela protège les acheteurs suivants.",
    '',
    '**2. Si vous avez déjà payé, contactez immédiatement votre banque.** Pour un paiement par carte, demandez une opposition et engagez une procédure de rétrofacturation. Les délais sont courts : agissez le jour même.',
    '',
    '**3. Signalez sur les plateformes officielles.** En France, le service **THESEE** (accessible depuis service-public.fr) permet de déposer une plainte en ligne pour escroquerie sur Internet. **Cybermalveillance.gouv.fr** oriente vers les bons interlocuteurs. Le **17 119** est le numéro dédié aux arnaques.',
    '',
    "**4. Déposez plainte** au commissariat ou à la gendarmerie, avec toutes les captures d'écran : annonce, conversation, preuves de paiement. Conservez tout, même ce qui vous semble anodin.",
    '',
    '**5. Conservez les preuves.** Ne supprimez aucun échange, même si le vendeur vous le demande.',
    '',
    "Un point important : se faire piéger n'a rien à voir avec un manque d'intelligence. Ces montages sont conçus par des professionnels et rodés sur des milliers de victimes.",
  ].join('\n'),
  intent: 'report_scam',
  citedFindings: [],
  suggestions: ['Quels sont mes recours ?', 'Analyser une autre annonce'],
});

const legalRecourse: Responder = ({ report }) => {
  const isPro = report.listing.seller?.proAccount;
  const lines = [
    isPro
      ? 'Le vendeur est enregistré comme **professionnel**, ce qui vous ouvre des droits substantiels.'
      : "Il s'agit d'une vente **entre particuliers**, ce qui limite les protections légales — mais ne les supprime pas.",
    '',
  ];

  if (isPro) {
    lines.push(
      bullet([
        "**Garantie légale de conformité** : deux ans à compter de la livraison sur un bien neuf, un an sur un bien d'occasion. Le défaut est présumé antérieur à la vente.",
        '**Droit de rétractation** : quatorze jours sans motif pour tout achat à distance.',
        '**Garantie des vices cachés** : deux ans à compter de la découverte du défaut.',
      ]),
    );
  } else {
    lines.push(
      bullet([
        "**Garantie des vices cachés** (articles 1641 et suivants du code civil) : elle s'applique aussi entre particuliers. Le défaut doit être antérieur à la vente, non apparent, et rendre le bien impropre à son usage.",
        '**Pas de droit de rétractation** ni de garantie de conformité entre particuliers.',
        "**En cas d'escroquerie caractérisée** — bien inexistant, tromperie délibérée — c'est le pénal qui s'applique, pas le civil : déposez plainte.",
      ]),
    );
  }

  lines.push(
    '',
    "**Conservez tout** : annonce, échanges, preuve de paiement. Une capture d'écran de l'annonce avant sa suppression vaut de l'or dans un dossier.",
    '',
    "*Ces éléments sont donnés à titre d'information générale et ne constituent pas un conseil juridique.*",
  );

  return {
    content: lines.join('\n'),
    intent: 'legal_recourse',
    citedFindings: [],
    suggestions: ['Comment signaler une arnaque ?', 'Comment payer en sécurité ?'],
  };
};

const whatIsVeritas: Responder = ({ report }) => ({
  content: [
    "Je suis **Veritas**, le moteur d'analyse intégré à ce logiciel.",
    '',
    "**Je ne suis pas ChatGPT et je n'appelle aucun service externe.** Tout tourne sur cette machine : aucune de vos annonces, aucune de vos photos, aucune de vos questions ne quitte votre ordinateur.",
    '',
    `**Comment je travaille.** Je passe chaque annonce au crible de plusieurs centaines de critères — ${report.criteriaEvaluated} sur celle-ci — répartis en huit familles : structure de l'annonce, rédaction, prix, vendeur, photos, recoupements, sécurité du paiement, et contexte que vous me donnez. Chaque critère est nommé, documenté et pondéré. Je n'invente jamais un score : chaque point vient d'un critère précis, appuyé sur un extrait citable de l'annonce.`,
    '',
    "**Pourquoi c'est important.** Un modèle de langage qui « devine » si une annonce est une arnaque ne peut pas vous dire pourquoi, et se trompe avec le même aplomb qu'il a raison. Moi, je peux toujours vous montrer la phrase exacte qui a déclenché une alerte — et vous pouvez me contredire.",
    '',
    "**J'apprends de vos retours.** Quand vous me dites qu'un constat était juste ou faux, j'ajuste le poids du critère concerné. Cet apprentissage reste local, et il est lui aussi consultable : ce n'est qu'une table de comptage, pas une boîte noire.",
  ].join('\n'),
  intent: 'what_is_veritas',
  citedFindings: [],
  suggestions: ['Pourquoi ce score ?', 'Quels sont les risques ?'],
});

const greeting: Responder = ({ report }) => ({
  content: `Bonjour. J'ai analysé **« ${report.listing.title || 'cette annonce'} »** — verdict : **${VERDICT_PRESENTATION[report.verdict].label.toLowerCase()}**, risque à ${report.scores.risk} %.\n\nPosez-moi ce que vous voulez sur cette annonce : le prix, le vendeur, les photos, ce qu'il faut vérifier, ou demandez-moi de rédiger un message au vendeur.`,
  intent: 'greeting',
  citedFindings: [],
  suggestions: ['Est-ce que tu achèterais ?', 'Quels sont les risques ?', 'Pourquoi ce score ?'],
});

const thanks: Responder = () => ({
  content:
    "Avec plaisir. Un dernier conseil qui vaut pour toutes les annonces : si à un moment vous ressentez de la pression pour aller vite, c'est précisément le moment de ralentir.\n\nEt si vous concluez la transaction, revenez me dire comment ça s'est passé — vos retours affinent mes critères.",
  intent: 'thanks',
  citedFindings: [],
  suggestions: ['Analyser une autre annonce'],
});

/**
 * Explication d'un constat précis.
 *
 * On rapproche la question du libellé et de l'explication de chaque constat
 * pour retrouver celui dont l'utilisateur parle — plutôt que de répondre à côté.
 */
const explainFinding: Responder = ({ report, question }) => {
  const normalized = normalize(question);
  let best: { finding: Finding; score: number } | undefined;

  for (const finding of report.findings) {
    const score = Math.max(
      textSimilarity(normalized, normalize(finding.label)) * 1.5,
      textSimilarity(normalized, normalize(finding.explanation.slice(0, 200))),
    );
    if (!best || score > best.score) best = { finding, score };
  }

  if (!best || best.score < 0.12) {
    return listRisks({ report, question });
  }

  const finding = best.finding;
  const lines = [
    `**${finding.label}**`,
    '',
    finding.explanation,
    '',
    `*Gravité : ${severityLabel(finding.severity)} — Certitude du signal : ${Math.round(finding.strength * 100)} % — Poids du critère : ${finding.weight.toFixed(2)}*`,
  ];

  if (finding.evidence.length > 0) {
    lines.push(
      '',
      '**Ce sur quoi je me base :**',
      bullet(
        finding.evidence.map((e) => `${e.label} : ${e.excerpt ? `« ${e.excerpt} »` : e.value}`),
      ),
    );
  }

  return {
    content: lines.join('\n'),
    intent: 'explain_finding',
    citedFindings: [finding.criterionId],
    suggestions: ['Quels sont les autres risques ?', 'Est-ce que tu achèterais ?'],
  };
};

const fallback: Responder = ({ report, question }) => {
  // Avant d'avouer l'incompréhension, on tente de rattacher la question à un
  // constat : beaucoup de formulations libres visent un point précis du rapport.
  const attempt = explainFinding({ report, question });
  if (attempt.citedFindings.length > 0 && attempt.intent === 'explain_finding') return attempt;

  return {
    content: [
      "Je n'ai pas bien saisi votre question — je reste volontairement cantonné à ce que je peux établir sur cette annonce, plutôt que de vous répondre approximativement.",
      '',
      'Voici ce sur quoi je peux vous répondre précisément :',
      bullet([
        '**Le verdict** — « Est-ce que tu achèterais ? »',
        '**Le calcul** — « Pourquoi ce score ? »',
        '**Les risques** — « Quels sont les risques ? »',
        '**Le prix** — « Le prix est-il cohérent ? »',
        '**Le vendeur** — « Que sais-tu du vendeur ? »',
        '**Les photos** — « Les photos sont-elles authentiques ? »',
        '**Le paiement** — « Comment payer en sécurité ? »',
        '**La suite** — « Que dois-je faire maintenant ? »',
        '**Un message** — « Rédige un message au vendeur »',
      ]),
    ].join('\n'),
    intent: 'fallback',
    citedFindings: [],
    suggestions: ['Est-ce que tu achèterais ?', 'Quels sont les risques ?', 'Pourquoi ce score ?'],
  };
};

export const RESPONDERS: Record<Intent, Responder> = {
  should_i_buy: shouldIBuy,
  explain_score: explainScore,
  list_risks: listRisks,
  explain_finding: explainFinding,
  price_question: priceQuestion,
  seller_question: sellerQuestion,
  photos_question: photosQuestion,
  payment_advice: paymentAdvice,
  meeting_advice: meetingAdvice,
  questions_to_ask: questionsToAsk,
  // `draft_message` est traité à part : il produit une pièce jointe rédigée.
  draft_message: questionsToAsk,
  next_steps: nextSteps,
  report_scam: reportScam,
  legal_recourse: legalRecourse,
  what_is_veritas: whatIsVeritas,
  greeting,
  thanks,
  fallback,
};

// ── Libellés ───────────────────────────────────────────────────────────

function severityLabel(severity: Finding['severity']): string {
  const labels: Record<Finding['severity'], string> = {
    critical: 'critique',
    high: 'élevée',
    medium: 'moyenne',
    low: 'faible',
    info: 'informative',
  };
  return labels[severity];
}

export function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    listing: "structure de l'annonce",
    text: 'rédaction',
    price: 'prix',
    seller: 'vendeur',
    image: 'photos',
    web: 'recoupements',
    payment: 'sécurité du paiement',
    behavior: 'comportement',
  };
  return labels[category] ?? category;
}
