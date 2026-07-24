import { formatMoney, type AnalysisReport, type BrainReply } from '@veritas/core';

/**
 * Rédaction de messages au vendeur.
 *
 * Le message est composé à partir des zones d'ombre réelles du rapport, pas
 * d'un modèle générique. Deux principes de rédaction le gouvernent :
 *
 * **Rester courtois et neutre.** Un message accusateur fait fuir un vendeur
 * honnête et met un escroc sur ses gardes. On demande, on n'accuse pas.
 *
 * **Poser des questions vérifiables.** L'intérêt n'est pas la réponse mais la
 * capacité à y répondre. « Envoyez-moi une photo avec la date » ne coûte rien
 * à qui possède le bien, et est impossible à satisfaire pour qui ne l'a pas.
 */

export interface DraftOptions {
  /** Ton du message. */
  tone?: 'neutral' | 'friendly' | 'firm';
  /** Prénom de l'acheteur, inséré dans la demande de photo datée. */
  buyerName?: string;
}

export function buildSellerMessage(report: AnalysisReport, options: DraftOptions = {}): string {
  const tone = options.tone ?? 'neutral';
  const name = options.buyerName?.trim() || 'mon prénom';
  const triggered = new Set(report.findings.map((f) => f.criterionId));
  const listing = report.listing;

  const opening =
    tone === 'friendly'
      ? `Bonjour,\n\nVotre annonce « ${listing.title} » m'intéresse beaucoup.`
      : tone === 'firm'
        ? `Bonjour,\n\nJe suis intéressé par votre annonce « ${listing.title} », mais j'ai besoin de plusieurs précisions avant d'aller plus loin.`
        : `Bonjour,\n\nVotre annonce « ${listing.title} » m'intéresse. Avant de m'engager, j'aurais quelques questions.`;

  const questions: string[] = [];

  // La photo datée en premier : c'est la vérification la plus discriminante.
  questions.push(
    `Pourriez-vous m'envoyer une photo du bien avec un papier portant « ${name} » et la date du jour ? C'est une habitude que j'ai prise pour tous mes achats en ligne.`,
  );

  if (
    triggered.has('price.deviation.extreme_low') ||
    triggered.has('price.deviation.suspicious_low')
  ) {
    questions.push(
      `Le prix est nettement en dessous de ce que je vois ailleurs pour un bien équivalent — y a-t-il une raison particulière (défaut, vente rapide) ?`,
    );
  }

  if (!triggered.has('text.positive.invoice_available')) {
    questions.push(`Disposez-vous encore de la facture d'origine ou du ticket de caisse ?`);
  }

  if (listing.domain === 'electronics' && !triggered.has('text.positive.serial_number')) {
    questions.push(
      `Pourriez-vous me communiquer le numéro de série ou l'IMEI, et confirmer que l'appareil est bien dissocié de tout compte constructeur ?`,
    );
  }

  if (listing.domain === 'vehicle') {
    questions.push(
      `Pourriez-vous me transmettre la plaque et le numéro de châssis pour que je consulte le rapport HistoVec, ainsi que la date du dernier contrôle technique ?`,
    );
  }

  if (triggered.has('text.excuse.no_visit') || triggered.has('text.excuse.abroad')) {
    questions.push(
      `Je vois que la remise en main propre n'est pas possible. Seriez-vous disponible pour un court appel vidéo pendant lequel vous me montreriez le bien ? Cela me rassurerait.`,
    );
  } else {
    questions.push(`Quand serait-il possible de venir voir le bien et l'essayer ?`);
  }

  if (triggered.has('image.count.single') || triggered.has('image.source.screenshot')) {
    questions.push(
      `Auriez-vous d'autres photos, prises sous différents angles ? Celles de l'annonce ne me permettent pas de bien juger de l'état.`,
    );
  }

  questions.push(
    listing.price
      ? `Enfin, pour ${formatMoney(listing.price.amount, listing.price.currency)}, quel mode de paiement souhaitez-vous ? Je privilégie le règlement à la remise ou le paiement sécurisé de la plateforme.`
      : `Enfin, quel mode de paiement souhaitez-vous ? Je privilégie le règlement à la remise ou le paiement sécurisé de la plateforme.`,
  );

  const closing =
    tone === 'firm'
      ? `\nJe vous remercie de répondre à ces points avant que nous n'allions plus loin.\n\nCordialement`
      : `\nMerci d'avance pour vos réponses.\n\nCordialement`;

  return `${opening}\n\n${questions.map((q) => `— ${q}`).join('\n\n')}\n${closing}`;
}

export function draftMessageReply(report: AnalysisReport, options: DraftOptions = {}): BrainReply {
  const body = buildSellerMessage(report, options);
  const critical = report.findings.filter(
    (f) => f.polarity === 'negative' && f.severity === 'critical',
  );

  const preface =
    critical.length > 0
      ? [
          `⚠️ **Avant de l'envoyer :** cette annonce présente ${critical.length === 1 ? 'un signal critique' : `${critical.length} signaux critiques`} (${critical.map((f) => f.label.toLowerCase()).join(', ')}). Aucune réponse du vendeur ne rendra cette transaction sûre — je vous recommande de renoncer plutôt que d'engager la conversation.`,
          '',
          'Cela dit, voici le message si vous souhaitez tout de même le contacter :',
        ].join('\n')
      : [
          `Voici un message prêt à envoyer. Il est construit à partir des points restés flous dans **cette** annonce, et reste volontairement courtois : un ton accusateur fait fuir un vendeur honnête et met un escroc sur ses gardes.`,
        ].join('\n');

  return {
    content: `${preface}\n\n---\n\n${body}\n\n---\n\n**Ce qu'il faut observer dans sa réponse :** répond-il à *toutes* les questions, ou en évite-t-il certaines ? Une esquive sur la photo datée est le signal le plus parlant.`,
    intent: 'draft_message',
    citedFindings: report.findings.slice(0, 5).map((f) => f.criterionId),
    suggestions: ['Quels sont les risques ?', 'Comment payer en sécurité ?', 'Où le rencontrer ?'],
    attachment: {
      kind: 'draft_message',
      title: 'Message au vendeur',
      body,
    },
  };
}
