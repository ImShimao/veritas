import {
  formatMoney,
  type Finding,
  type Listing,
  type Recommendation,
  type Scores,
  type Verdict,
} from '@veritas/core';
import { getPlatformProfile } from '../knowledge/platforms';
import { getProfile } from '../knowledge/domain-profiles';

/**
 * Génération des recommandations et des questions à poser au vendeur.
 *
 * Principe directeur : chaque recommandation doit être **actionnable et
 * justifiée**. On ne dit jamais « soyez prudent » — on dit quoi faire, et on
 * cite les constats qui l'imposent. Une recommandation sans « parce que » est
 * du bruit ; l'utilisateur doit pouvoir remonter du conseil à la preuve.
 */

export interface RecommendationInput {
  listing: Listing;
  findings: Finding[];
  scores: Scores;
  verdict: Verdict;
}

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { listing, findings, verdict } = input;
  const recommendations: Recommendation[] = [];
  const triggered = new Set(findings.map((f) => f.criterionId));
  const platform = getPlatformProfile(listing.source.platform);

  const because = (...criterionIds: string[]): string[] =>
    findings.filter((f) => criterionIds.includes(f.criterionId)).map((f) => f.label);

  // ── Abandon ──────────────────────────────────────────────────────────
  const dealBreakers = [
    'text.payment.gift_cards',
    'text.payment.fake_escrow',
    'payment.identity.bank_details_requested',
    'payment.method.friends_and_family',
    'text.link.lookalike_domain',
    'text.shipping.fake_carrier_link',
    'payment.identity.documents_requested',
  ].filter((id) => triggered.has(id));

  if (dealBreakers.length > 0) {
    recommendations.push({
      id: 'abort-transaction',
      kind: 'abort',
      priority: 'critical',
      title: 'Interrompez la transaction',
      detail:
        "Un ou plusieurs éléments de cette annonce correspondent à des schémas de fraude documentés qui n'admettent aucune explication légitime. N'envoyez aucun paiement, ne transmettez aucun document, et signalez l'annonce à la plateforme. Aucune vérification complémentaire ne rendra cette transaction sûre.",
      because: because(...dealBreakers),
    });
  } else if (verdict === 'dangerous') {
    recommendations.push({
      id: 'abort-high-risk',
      kind: 'abort',
      priority: 'critical',
      title: 'Renoncez, sauf preuve formelle',
      detail:
        "Le faisceau de signaux réunis ici est caractéristique des annonces frauduleuses. Si vous tenez à poursuivre, n'engagez aucun fonds sans avoir vu le bien physiquement et vérifié l'identité du vendeur.",
      because: findings
        .filter(
          (f) => f.polarity === 'negative' && (f.severity === 'critical' || f.severity === 'high'),
        )
        .slice(0, 4)
        .map((f) => f.label),
    });
  }

  // ── Paiement ─────────────────────────────────────────────────────────
  if (platform.protectedPayment && !triggered.has('payment.method.cash_on_delivery')) {
    recommendations.push({
      id: 'use-protected-payment',
      kind: 'payment',
      priority: triggered.has('payment.protection.waived') ? 'critical' : 'high',
      title: `Réglez exclusivement via ${platform.protectionName ?? 'le paiement sécurisé de la plateforme'}`,
      detail: triggered.has('payment.protection.waived')
        ? `Le vendeur cherche à éviter ${platform.protectionName ?? 'le paiement sécurisé'}. C'est précisément le moment de refuser : cette protection est votre seul recours en cas de non-réception. S'il insiste, arrêtez là.`
        : `${platform.label} propose un paiement protégé. Tant que l'intégralité de la transaction reste dans ce cadre — paiement et livraison compris — votre exposition financière est faible. Une sortie du cadre annule la protection, même partielle.`,
      because: because(
        'payment.protection.waived',
        'payment.protection.available',
        'listing.platform.protected_transaction',
      ),
    });
  }

  const avoidPayment = [
    'text.payment.wire_transfer',
    'text.payment.crypto',
    'text.payment.advance_deposit',
    'payment.exposure.full_prepayment',
    'text.payment.off_platform',
  ].filter((id) => triggered.has(id));

  if (avoidPayment.length > 0) {
    recommendations.push({
      id: 'avoid-irreversible-payment',
      kind: 'payment',
      priority: 'critical',
      title: 'Refusez tout paiement irréversible',
      detail:
        "Virement bancaire, cryptomonnaie, mandat cash et transfert d'argent ne se récupèrent pas. Si le bien n'arrive jamais, vous n'aurez aucun levier — ni auprès de la banque, ni auprès de la plateforme. Exigez un moyen offrant un recours : paiement sécurisé, carte bancaire, ou espèces à la remise.",
      because: because(...avoidPayment),
    });
  }

  // ── Rencontre ────────────────────────────────────────────────────────
  const meetingBlocked = [
    'text.excuse.no_visit',
    'text.excuse.abroad',
    'text.excuse.military_or_mission',
  ].filter((id) => triggered.has(id));

  if (meetingBlocked.length > 0) {
    recommendations.push({
      id: 'insist-on-meeting',
      kind: 'meeting',
      priority: 'critical',
      title: 'Exigez une rencontre — et tirez les conséquences du refus',
      detail:
        "Le vendeur avance des raisons pour exclure toute rencontre. Proposez malgré tout une remise en main propre dans un lieu public, ou à défaut un appel vidéo en direct pendant lequel il manipule l'objet. Un refus sur les deux propositions ne laisse qu'une explication : le bien n'existe pas.",
      because: because(...meetingBlocked),
    });
  } else if (!triggered.has('payment.method.cash_on_delivery')) {
    recommendations.push({
      id: 'prefer-handover',
      kind: 'meeting',
      priority: 'medium',
      title: 'Privilégiez la remise en main propre',
      detail:
        'Voir le bien, le tester, puis payer sur place supprime la quasi-totalité du risque financier. Choisissez un lieu public et fréquenté ; certains commissariats proposent des points de rencontre dédiés aux transactions entre particuliers.',
      because: because('text.positive.meeting_offered', 'payment.method.cash_on_delivery'),
    });
  }

  // ── Vérifications documentaires ──────────────────────────────────────
  const profile = getProfile(listing.domain);
  if (!triggered.has('text.positive.invoice_available')) {
    recommendations.push({
      id: 'request-invoice',
      kind: 'documentation',
      priority:
        listing.price && listing.price.amount > profile.highValueThreshold ? 'high' : 'medium',
      title: "Demandez la facture d'origine",
      detail:
        "La facture atteste de l'origine du bien et conditionne toute garantie constructeur. Demandez-en une photo avec le numéro de série lisible : un vendeur qui possède réellement l'objet la retrouve en quelques minutes, un escroc esquive.",
      because: because('text.promise.unverifiable_warranty', 'text.info.missing_key_facts'),
    });
  }

  if (
    !triggered.has('text.positive.serial_number') &&
    (listing.domain === 'electronics' || listing.domain === 'vehicle')
  ) {
    recommendations.push({
      id: 'request-serial',
      kind: 'verification',
      priority: 'high',
      title:
        listing.domain === 'vehicle'
          ? 'Demandez le numéro de châssis (VIN)'
          : 'Demandez le numéro de série ou IMEI',
      detail:
        listing.domain === 'vehicle'
          ? "Le VIN permet de vérifier l'historique du véhicule, son kilométrage déclaré et son éventuel gage ou vol via HistoVec, service gratuit de l'État français."
          : "L'IMEI ou le numéro de série permet de vérifier que l'appareil n'est ni bloqué, ni déclaré volé, ni exclu de la garantie. Un refus de le communiquer est en soi une réponse.",
      because: because('text.info.missing_key_facts', 'image.reuse.known_listing'),
    });
  }

  // ── Vérification photo ───────────────────────────────────────────────
  const imageDoubts = [
    'image.reuse.known_listing',
    'image.source.screenshot',
    'image.source.stock_or_catalogue',
    'image.quality.very_low_resolution',
    'image.count.single',
    'image.consistency.mixed_sources',
  ].filter((id) => triggered.has(id));

  if (imageDoubts.length > 0) {
    recommendations.push({
      id: 'request-proof-photo',
      kind: 'verification',
      priority: 'critical',
      title: 'Exigez une photo de preuve datée',
      detail:
        "Demandez une photo du bien accompagné d'un papier manuscrit portant votre prénom et la date du jour, prise sous un angle que vous choisissez. C'est la vérification la plus efficace qui soit : elle ne peut pas être satisfaite avec des images récupérées en ligne, et elle ne coûte rien à un vendeur honnête.",
      because: because(...imageDoubts),
    });

    recommendations.push({
      id: 'reverse-image-search',
      kind: 'verification',
      priority: 'high',
      title: "Lancez la recherche d'image inversée",
      detail:
        'Les liens vers Google Images, Bing, Yandex et TinEye sont préparés dans la section Photos du rapport. Si les mêmes images apparaissent sur un site marchand ou dans une autre annonce, la question est tranchée en trente secondes.',
      because: because('image.reuse.reverse_search_pending', 'image.reuse.known_listing'),
    });
  }

  // ── Vérification du prix ─────────────────────────────────────────────
  if (triggered.has('price.deviation.extreme_low') || triggered.has('price.discount.unexplained')) {
    recommendations.push({
      id: 'question-the-price',
      kind: 'communication',
      priority: 'high',
      title: 'Faites expliquer le prix',
      detail:
        "Demandez précisément pourquoi ce bien est vendu si en dessous du marché. Une raison concrète et vérifiable — défaut identifié, déménagement daté, besoin urgent documenté — est plausible. Une réponse vague, pressante ou qui change au fil des échanges ne l'est pas.",
      because: because(
        'price.deviation.extreme_low',
        'price.deviation.suspicious_low',
        'price.discount.unexplained',
      ),
    });
  }

  // ── Communication ────────────────────────────────────────────────────
  if (
    triggered.has('text.contact.external_channel') ||
    triggered.has('text.contact.in_description')
  ) {
    recommendations.push({
      id: 'stay-on-platform',
      kind: 'communication',
      priority: 'high',
      title: 'Gardez les échanges sur la messagerie de la plateforme',
      detail:
        "Passer sur WhatsApp ou par SMS place vos échanges hors de portée de la plateforme : en cas de litige, aucune trace ne pourra être produite à l'appui de votre réclamation. Conservez la messagerie intégrée au moins jusqu'à l'accord final.",
      because: because('text.contact.external_channel', 'text.contact.in_description'),
    });
  }

  if (triggered.has('seller.account.brand_new') || triggered.has('seller.reputation.no_reviews')) {
    recommendations.push({
      id: 'verify-new-seller',
      kind: 'verification',
      priority: 'high',
      title: "Compensez l'absence d'historique",
      detail:
        "Ce vendeur n'a pas encore d'antécédents permettant de l'évaluer. Ce n'est pas disqualifiant en soi, mais cela impose de compenser : rencontre physique, paiement à la remise, ou paiement sécurisé de la plateforme. Ne prenez aucun risque que son historique ne justifie.",
      because: because(
        'seller.account.brand_new',
        'seller.account.recent',
        'seller.reputation.no_reviews',
      ),
    });
  }

  if (listing.price && listing.price.amount >= profile.highValueThreshold * 2) {
    recommendations.push({
      id: 'high-value-precautions',
      kind: 'verification',
      priority: 'high',
      title: `Protocole renforcé pour ${formatMoney(listing.price.amount, listing.price.currency)}`,
      detail:
        listing.domain === 'vehicle'
          ? "Sur un montant de cet ordre : consultez le rapport HistoVec (gratuit), faites réaliser un contrôle technique de moins de six mois, vérifiez la concordance entre la carte grise et l'identité du vendeur, et privilégiez un paiement par chèque de banque remis en agence."
          : "Sur un montant de cet ordre, prenez le temps de tout vérifier : identité du vendeur, facture d'origine, numéro de série, essai du bien. Le coût de ces vérifications est dérisoire au regard de la somme engagée.",
      because: because('payment.exposure.high_amount'),
    });
  }

  // Ordonnancement par priorité, puis par nombre de constats qui les justifient.
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return recommendations
    .sort((a, b) => order[a.priority] - order[b.priority] || b.because.length - a.because.length)
    .slice(0, 8);
}

/**
 * Questions à poser au vendeur, calibrées sur les zones d'ombre réelles.
 *
 * L'intérêt de ces questions n'est pas seulement d'obtenir des informations :
 * c'est d'observer *comment* le vendeur y répond. Une esquive répétée sur une
 * question triviale en dit plus long que n'importe quelle réponse.
 */
export function buildQuestions(input: RecommendationInput): string[] {
  const { listing, findings } = input;
  const triggered = new Set(findings.map((f) => f.criterionId));
  const questions: string[] = [];
  const profile = getProfile(listing.domain);

  // Questions universelles, dans l'ordre où elles sont les plus discriminantes.
  questions.push(
    "Pouvez-vous m'envoyer une photo du bien avec un papier portant mon prénom et la date d'aujourd'hui ?",
  );

  if (triggered.has('text.excuse.no_visit') || triggered.has('text.excuse.abroad')) {
    questions.push(
      "Seriez-vous disponible pour un appel vidéo de deux minutes pendant lequel vous me montrez l'objet ?",
    );
  } else {
    questions.push('Quand puis-je passer voir le bien et le tester avant achat ?');
  }

  if (
    triggered.has('price.deviation.extreme_low') ||
    triggered.has('price.deviation.suspicious_low')
  ) {
    questions.push(
      'Pour quelle raison précise vendez-vous nettement en dessous du prix du marché ?',
    );
  }

  if (!triggered.has('text.positive.invoice_available')) {
    questions.push("Disposez-vous de la facture d'origine ? Pouvez-vous m'en envoyer une photo ?");
  }

  // Questions propres à la famille de bien.
  switch (listing.domain) {
    case 'vehicle':
      questions.push(
        'Pouvez-vous me communiquer le numéro de plaque et le VIN afin que je consulte le rapport HistoVec ?',
        'Le contrôle technique a-t-il moins de six mois, et présente-t-il des contre-visites ?',
        'Le véhicule est-il gagé, et êtes-vous bien le titulaire figurant sur la carte grise ?',
      );
      break;
    case 'electronics':
      questions.push(
        "Pouvez-vous m'envoyer une photo de l'écran allumé affichant le numéro de série ou l'IMEI ?",
        "L'appareil est-il désimlocké et dissocié de tout compte constructeur (iCloud, compte Google) ?",
        "Quel est l'état de santé de la batterie affiché dans les réglages ?",
      );
      break;
    case 'fashion':
      questions.push(
        "Pouvez-vous photographier l'étiquette intérieure, le numéro de série et la couture du logo ?",
        'Où et quand avez-vous acheté cet article ? Avez-vous conservé le reçu ou la boîte ?',
      );
      break;
    case 'real_estate':
    case 'rental_stay':
      questions.push(
        'Puis-je visiter le logement avant tout versement, ou le faire visiter par un proche sur place ?',
        "Pouvez-vous me communiquer l'adresse exacte afin que je vérifie le bien et son environnement ?",
        'Quel document contractuel me sera remis avant le versement de la caution ?',
      );
      break;
    case 'collectible':
      questions.push(
        "Disposez-vous d'un certificat d'authenticité ou d'une expertise ? De qui provient la pièce ?",
        "Acceptez-vous que l'authentification soit réalisée par un tiers avant paiement ?",
      );
      break;
    default:
      questions.push(
        "Pouvez-vous décrire précisément les défauts et l'usure du bien ?",
        'Depuis combien de temps le possédez-vous, et pourquoi le vendez-vous ?',
      );
  }

  if (triggered.has('text.info.missing_key_facts')) {
    const missing = profile.expectedAttributes.filter((a) => a.critical).slice(0, 2);
    for (const attribute of missing) {
      questions.push(`Pouvez-vous préciser : ${attribute.label.toLowerCase()} ?`);
    }
  }

  questions.push(
    'Quel moyen de paiement acceptez-vous, et à quel moment attendez-vous le règlement ?',
  );

  // Déduplication en conservant l'ordre de pertinence.
  return [...new Set(questions)].slice(0, 10);
}
