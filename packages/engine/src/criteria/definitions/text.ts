import { defineCriteria } from '../registry';

/**
 * Critères portant sur le contenu rédactionnel de l'annonce.
 * Les identifiants correspondent 1:1 aux entrées du lexique lorsqu'un motif
 * textuel les déclenche, ou sont calculés par l'analyseur pour les métriques.
 */
export const TEXT_CRITERIA = defineCriteria('text', [
  // ── Urgence et pression ──────────────────────────────────────────────
  {
    id: 'text.urgency.artificial_deadline',
    label: 'Urgence artificielle',
    rationale:
      "Une échéance imposée par le vendeur vise à supprimer le temps de vérification. C'est le levier le plus fréquemment observé dans les fraudes entre particuliers.",
    severity: 'high',
  },
  {
    id: 'text.urgency.multiple_buyers',
    label: 'Concurrence fabriquée entre acheteurs',
    rationale:
      "Prétendre que d'autres acheteurs attendent crée une rareté artificielle et pousse au paiement immédiat.",
    severity: 'medium',
  },
  {
    id: 'text.pressure.no_negotiation',
    label: 'Questions découragées',
    rationale:
      "Un vendeur qui refuse par avance les questions cherche à éviter les vérifications qu'il ne pourrait pas soutenir.",
    severity: 'medium',
  },

  // ── Paiement ─────────────────────────────────────────────────────────
  {
    id: 'text.payment.gift_cards',
    label: 'Paiement par carte prépayée ou carte cadeau',
    rationale:
      "Les cartes prépayées sont irrécupérables et intraçables. Aucune vente légitime entre particuliers n'utilise ce moyen de paiement.",
    severity: 'critical',
    weight: 2.6,
  },
  {
    id: 'text.payment.wire_transfer',
    label: "Transfert d'argent non traçable",
    rationale:
      'Western Union, MoneyGram et le mandat cash sont définitifs et anonymes. Ils figurent dans toutes les recommandations officielles comme signal de fraude.',
    severity: 'critical',
    weight: 2.2,
  },
  {
    id: 'text.payment.crypto',
    label: 'Paiement en cryptomonnaie',
    rationale:
      'Un transfert en cryptomonnaie est irréversible et sans recours. Hors marché spécialisé, sa demande est très anormale.',
    severity: 'high',
  },
  {
    id: 'text.payment.advance_deposit',
    label: 'Acompte exigé avant vérification',
    rationale:
      "Payer avant d'avoir vu le bien ou rencontré le vendeur est la mécanique centrale des fausses locations et des faux véhicules.",
    severity: 'high',
    weight: 1.6,
  },
  {
    id: 'text.payment.fake_escrow',
    label: 'Faux service de séquestre',
    rationale:
      "Les transporteurs et les plateformes ne conservent jamais les fonds d'une transaction entre particuliers. Un tel service est toujours fabriqué par l'escroc.",
    severity: 'critical',
    weight: 2.4,
  },
  {
    id: 'text.payment.overpayment',
    label: 'Schéma de paiement excédentaire',
    rationale:
      "L'acheteur envoie un chèque d'un montant supérieur et demande le remboursement de la différence. Le chèque se révèle sans provision après le virement.",
    severity: 'critical',
    weight: 2.0,
  },
  {
    id: 'text.payment.off_platform',
    label: 'Sortie du cadre de la plateforme',
    rationale:
      'Traiter hors plateforme supprime la protection acheteur, la traçabilité des échanges et tout recours en cas de litige.',
    severity: 'high',
  },

  // ── Canal de contact ─────────────────────────────────────────────────
  {
    id: 'text.contact.external_channel',
    label: 'Redirection vers une messagerie externe',
    rationale:
      'WhatsApp ou Telegram placent la conversation hors de portée de la plateforme, qui ne pourra rien attester en cas de litige.',
    severity: 'high',
  },
  {
    id: 'text.contact.email_only',
    label: "Contact restreint à l'écrit",
    rationale:
      "Refuser tout appel permet de dissimuler une localisation, un accent ou une identité incompatibles avec l'annonce.",
    severity: 'low',
  },
  {
    id: 'text.contact.in_description',
    label: 'Coordonnées directes dans la description',
    rationale:
      "Publier un numéro ou un email dans le texte plutôt que d'utiliser la messagerie intégrée contourne la modération de la plateforme.",
    severity: 'medium',
  },

  // ── Prétextes ────────────────────────────────────────────────────────
  {
    id: 'text.excuse.abroad',
    label: "Vendeur déclaré à l'étranger",
    rationale:
      "L'éloignement géographique justifie l'impossibilité de rencontre et l'obligation de payer d'avance. C'est un prétexte récurrent.",
    severity: 'high',
  },
  {
    id: 'text.excuse.military_or_mission',
    label: 'Prétexte du militaire ou de la mission',
    rationale:
      "Scénario d'ingénierie sociale documenté : le statut invoqué rend toute rencontre impossible tout en inspirant confiance.",
    severity: 'critical',
    weight: 2.0,
  },
  {
    id: 'text.excuse.no_visit',
    label: 'Rencontre ou visite exclue',
    rationale:
      "Sans possibilité de constater l'existence du bien, l'acheteur paie pour quelque chose qu'il n'a jamais vu.",
    severity: 'high',
  },
  {
    id: 'text.logistics.shipping_only',
    label: 'Envoi uniquement pour un bien à retirer',
    rationale:
      "Refuser toute remise en main propre pour un bien qu'on récupère normalement en personne (véhicule, meuble) empêche de le constater avant paiement. Anodin, en revanche, pour un petit objet expédiable.",
    severity: 'medium',
  },
  {
    id: 'text.excuse.family_story',
    label: 'Récit personnel dramatique',
    rationale:
      "Une histoire personnelle crée de l'empathie et désamorce la méfiance. Anodin seul, préoccupant combiné à un paiement anticipé.",
    severity: 'low',
  },

  // ── Promesses ────────────────────────────────────────────────────────
  {
    id: 'text.promise.too_good',
    label: 'Promesses absolues',
    rationale:
      "Un particulier ne peut garantir ni l'authenticité ni un remboursement. Ces formules proviennent du vocabulaire publicitaire.",
    severity: 'medium',
  },
  {
    id: 'text.promise.unverifiable_warranty',
    label: 'Garantie sans justificatif',
    rationale:
      'Une garantie annoncée sans facture ni numéro de série est invérifiable, et le plus souvent inexistante.',
    severity: 'low',
  },

  // ── Manipulation ─────────────────────────────────────────────────────
  {
    id: 'text.emotional.trust_begging',
    label: "Auto-proclamation d'honnêteté",
    rationale:
      "Se défendre d'une accusation que personne n'a formulée est un réflexe caractéristique des annonces frauduleuses.",
    severity: 'medium',
  },
  {
    id: 'text.emotional.charity_appeal',
    label: 'Registre caritatif',
    rationale:
      'Le schéma « don gratuit contre frais de transport » est une fraude classique, notamment sur les animaux et le mobilier.',
    severity: 'medium',
  },

  // ── Logistique ───────────────────────────────────────────────────────
  {
    id: 'text.shipping.impossible_logistics',
    label: 'Conditions de livraison irréalistes',
    rationale:
      "Une livraison gratuite internationale sur un bien lourd ou volumineux n'est économiquement pas viable : elle sert à justifier un paiement anticipé.",
    severity: 'medium',
  },
  {
    id: 'text.shipping.fake_carrier_link',
    label: 'Faux lien de suivi transporteur',
    rationale:
      'Les pages de suivi hébergées hors du domaine officiel du transporteur imitent celui-ci pour capturer des coordonnées bancaires.',
    severity: 'critical',
    weight: 2.2,
  },

  // ── Liens ────────────────────────────────────────────────────────────
  {
    id: 'text.link.shortened_url',
    label: 'Lien raccourci',
    rationale:
      'Un raccourcisseur masque la destination réelle et empêche toute évaluation du domaine avant le clic.',
    severity: 'medium',
  },
  {
    id: 'text.link.lookalike_domain',
    label: 'Domaine imitant une plateforme connue',
    rationale:
      "Un domaine sosie est le support d'une page d'hameçonnage destinée à capturer identifiants ou carte bancaire.",
    severity: 'critical',
    weight: 2.5,
  },

  // ── Obfuscation ──────────────────────────────────────────────────────
  {
    id: 'text.obfuscation.leetspeak',
    label: 'Mots volontairement déformés',
    rationale:
      'La substitution de caractères sert à franchir les filtres automatiques de la plateforme.',
    severity: 'medium',
  },
  {
    id: 'text.obfuscation.spelled_contact',
    label: 'Coordonnées écrites en toutes lettres',
    rationale:
      "Écrire un numéro en toutes lettres n'a qu'un objectif : échapper à la détection automatique de la plateforme.",
    severity: 'high',
  },
  {
    id: 'text.obfuscation.invisible_chars',
    label: 'Caractères invisibles insérés',
    rationale:
      "Des caractères de largeur nulle placés dans les mots-clés trompent la modération. Aucun rédacteur légitime n'en produit.",
    severity: 'high',
  },

  // ── Style et rédaction ───────────────────────────────────────────────
  {
    id: 'text.style.excessive_caps',
    label: 'Majuscules excessives',
    rationale:
      'Une proportion élevée de majuscules signale une rédaction sensationnaliste, fréquente dans les annonces recyclées en masse.',
    severity: 'low',
    weight: 0.3,
  },
  {
    id: 'text.style.excessive_emoji',
    label: "Surcharge d'emojis",
    rationale:
      "Une densité d'emojis anormale caractérise les annonces produites en série pour attirer le regard.",
    severity: 'low',
    weight: 0.3,
  },
  {
    id: 'text.style.repeated_punctuation',
    label: 'Ponctuation répétée',
    rationale:
      "Les séries de points d'exclamation traduisent une pression commerciale artificielle.",
    severity: 'info',
  },
  {
    id: 'text.style.machine_translation',
    label: 'Traduction automatique',
    rationale:
      "Des tournures calquées sur l'anglais indiquent un texte traduit mécaniquement, souvent réutilisé sur plusieurs pays.",
    severity: 'medium',
  },
  {
    id: 'text.style.ai_generated',
    label: 'Texte vraisemblablement généré',
    rationale:
      "Formules de transition stéréotypées, rythme régulier et absence de détail vécu suggèrent une génération automatique plutôt qu'une description de première main.",
    severity: 'medium',
  },
  {
    id: 'text.style.uniform_rhythm',
    label: 'Rythme de phrases mécanique',
    rationale:
      "Une variance quasi nulle de la longueur des phrases est atypique d'une rédaction humaine spontanée.",
    severity: 'low',
  },
  {
    id: 'text.style.low_lexical_diversity',
    label: 'Vocabulaire répétitif',
    rationale:
      'Un vocabulaire pauvre sur un texte long évoque un remplissage automatique ou une accumulation de mots-clés.',
    severity: 'low',
  },
  {
    id: 'text.style.marketing_boilerplate',
    label: "Description recopiée d'une fiche produit",
    rationale:
      "Le texte reprend le discours commercial du fabricant au lieu de décrire l'exemplaire réellement détenu. Le vendeur ne possède peut-être pas l'objet.",
    severity: 'medium',
  },

  // ── Complétude et cohérence ──────────────────────────────────────────
  {
    id: 'text.info.too_short',
    label: 'Description trop courte',
    rationale:
      "Une description squelettique prive l'acheteur des éléments de vérification et est typique des annonces publiées en volume.",
    severity: 'medium',
  },
  {
    id: 'text.info.missing_key_facts',
    label: 'Informations essentielles absentes',
    rationale:
      "L'absence des caractéristiques attendues pour ce type de bien empêche toute comparaison sérieuse avec le marché.",
    severity: 'medium',
  },
  {
    id: 'text.info.vague_condition',
    label: 'État du bien resté vague',
    rationale:
      "Ne pas qualifier l'état permet de contester ensuite toute réclamation. Les annonces sérieuses le précisent.",
    severity: 'low',
  },
  {
    id: 'text.contradiction.condition',
    label: 'État déclaré contradictoire',
    rationale:
      "L'annonce affirme simultanément deux états incompatibles. Une incohérence interne indique un texte assemblé plutôt que vécu.",
    severity: 'high',
  },
  {
    id: 'text.contradiction.price',
    label: 'Prix contradictoires dans le texte',
    rationale:
      'Plusieurs montants incompatibles apparaissent entre le champ prix et la description : négligence ou appât.',
    severity: 'medium',
  },
  {
    id: 'text.contradiction.quantity',
    label: 'Quantité incohérente',
    rationale:
      'Une annonce présentée comme unique mais décrivant plusieurs exemplaires révèle une revente de masse déguisée en vente entre particuliers.',
    severity: 'medium',
  },

  // ── Signaux positifs ─────────────────────────────────────────────────
  {
    id: 'text.positive.invoice_available',
    label: "Justificatif d'achat mentionné",
    rationale: "La facture est un élément vérifiable qui atteste de l'origine du bien.",
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'text.positive.serial_number',
    label: 'Numéro de série communiqué',
    rationale:
      'Un identifiant unique permet de vérifier le bien auprès du constructeur et dans les bases de matériel volé.',
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'text.positive.defects_disclosed',
    label: 'Défauts signalés spontanément',
    rationale:
      'Les annonces frauduleuses décrivent un bien parfait. Reconnaître des défauts est un marqueur de sincérité fort.',
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'text.positive.meeting_offered',
    label: 'Rencontre proposée',
    rationale:
      "La remise en main propre est la meilleure protection de l'acheteur, et l'escroc l'évite systématiquement.",
    polarity: 'positive',
    severity: 'high',
  },
  {
    id: 'text.positive.technical_detail',
    label: 'Détails techniques précis',
    rationale:
      "Références, dates d'achat et historique d'entretien sont difficiles à inventer et rarement présents dans les annonces fabriquées.",
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'text.positive.detailed_description',
    label: 'Description substantielle',
    rationale:
      'Un texte long, structuré et spécifique traduit un vendeur qui connaît réellement son bien.',
    polarity: 'positive',
    severity: 'low',
  },
]);
