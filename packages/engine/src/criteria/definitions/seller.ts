import { defineCriteria } from '../registry';

/** Critères portant sur le profil et le comportement du vendeur. */
export const SELLER_CRITERIA = defineCriteria('seller', [
  // ── Ancienneté ───────────────────────────────────────────────────────
  {
    id: 'seller.account.brand_new',
    label: 'Compte créé très récemment',
    rationale:
      'Les comptes frauduleux sont jetables : ils sont créés, exploités quelques jours, puis abandonnés après signalement.',
    severity: 'high',
  },
  {
    id: 'seller.account.recent',
    label: 'Compte récent',
    rationale:
      "Un compte de moins de trois mois n'a pas encore d'historique permettant d'évaluer sa fiabilité.",
    severity: 'medium',
  },
  {
    id: 'seller.account.established',
    label: 'Compte ancien',
    rationale:
      "Une ancienneté de plusieurs années représente un investissement qu'un escroc ne consent presque jamais.",
    polarity: 'positive',
    severity: 'high',
  },
  {
    id: 'seller.account.age_unknown',
    label: 'Ancienneté du compte inconnue',
    rationale:
      "La date d'inscription n'a pas pu être récupérée : ce pilier de l'évaluation du vendeur est indisponible.",
    severity: 'info',
    polarity: 'neutral',
    weight: 0,
  },

  // ── Réputation ───────────────────────────────────────────────────────
  {
    id: 'seller.reputation.no_reviews',
    label: 'Aucun avis',
    rationale:
      "Sans historique de transaction, rien ne permet de distinguer un nouveau vendeur légitime d'un compte créé pour une fraude unique.",
    severity: 'medium',
  },
  {
    id: 'seller.reputation.few_reviews',
    label: "Très peu d'avis",
    rationale:
      "Un échantillon d'avis trop faible ne constitue pas une preuve de fiabilité : la moyenne affichée n'a pas de valeur statistique.",
    severity: 'low',
  },
  {
    id: 'seller.reputation.unknown',
    label: 'Réputation non récupérée',
    rationale:
      "Les avis du vendeur n'ont pas pu être lus depuis cette source : leur absence dans les données extraites ne signifie pas que le vendeur n'en a pas. On ne sanctionne pas une donnée manquante.",
    severity: 'info',
    polarity: 'neutral',
    weight: 0,
  },
  {
    id: 'seller.reputation.strong',
    label: 'Réputation solide',
    rationale:
      "Une note élevée sur un volume d'avis significatif est difficile à fabriquer et constitue un signal de confiance robuste.",
    polarity: 'positive',
    severity: 'high',
  },
  {
    id: 'seller.reputation.poor',
    label: 'Note dégradée',
    rationale:
      "Une note basse sur un volume d'avis suffisant traduit des litiges récurrents avec les acheteurs précédents.",
    severity: 'high',
  },
  {
    id: 'seller.reputation.suspicious_pattern',
    label: "Profil d'avis atypique",
    rationale:
      "Une note parfaite sur un très grand nombre d'avis récents et concentrés dans le temps évoque des évaluations achetées.",
    severity: 'medium',
  },

  // ── Activité ─────────────────────────────────────────────────────────
  {
    id: 'seller.activity.bulk_listings',
    label: "Volume d'annonces incompatible avec un particulier",
    rationale:
      "Des dizaines d'annonces simultanées sous un compte particulier signalent soit une activité professionnelle non déclarée, soit une opération de masse.",
    severity: 'medium',
  },
  {
    id: 'seller.activity.burst_publishing',
    label: 'Publication en rafale',
    rationale:
      'Publier de nombreuses annonces en quelques heures est le mode opératoire des comptes automatisés.',
    severity: 'high',
  },
  {
    id: 'seller.activity.incoherent_catalogue',
    label: 'Catalogue incohérent',
    rationale:
      "Vendre simultanément un tracteur, un iPhone et une robe de mariée n'a de sens ni pour un particulier ni pour un professionnel : c'est le profil d'un compte piraté ou automatisé.",
    severity: 'high',
  },
  {
    id: 'seller.activity.consistent_catalogue',
    label: 'Catalogue cohérent',
    rationale:
      "Un ensemble d'annonces relevant d'un même univers correspond au profil d'un vendeur réel.",
    polarity: 'positive',
    severity: 'low',
  },

  // ── Identité ─────────────────────────────────────────────────────────
  {
    id: 'seller.identity.verified',
    label: 'Identité vérifiée par la plateforme',
    rationale:
      "La vérification d'identité oppose une barrière réelle à la fraude : elle rattache le compte à une pièce officielle.",
    polarity: 'positive',
    severity: 'high',
  },
  {
    id: 'seller.identity.unverified',
    label: 'Identité non vérifiée',
    rationale:
      'Sans vérification, le compte peut être créé avec une identité fictive et recréé indéfiniment après signalement.',
    severity: 'low',
  },
  {
    id: 'seller.identity.generic_name',
    label: 'Pseudonyme généré automatiquement',
    rationale:
      "Un pseudonyme composé d'un prénom suivi de chiffres aléatoires est le format produit par la création automatisée de comptes.",
    severity: 'low',
  },
  {
    id: 'seller.identity.location_mismatch',
    label: 'Localisation du vendeur incohérente',
    rationale:
      "Une divergence entre la localisation du profil, celle de l'annonce et le discours du vendeur signale une annonce délocalisée.",
    severity: 'high',
  },
  {
    id: 'seller.identity.no_profile',
    label: 'Aucune information vendeur accessible',
    rationale:
      "Aucune donnée sur le vendeur n'a pu être récupérée : toute une dimension de l'analyse reste aveugle.",
    severity: 'info',
    polarity: 'neutral',
    weight: 0,
  },

  // ── Réactivité ───────────────────────────────────────────────────────
  {
    id: 'seller.responsiveness.high',
    label: 'Taux de réponse élevé',
    rationale: 'Un vendeur qui répond systématiquement entretient une relation client réelle.',
    polarity: 'positive',
    severity: 'low',
  },
  {
    id: 'seller.responsiveness.low',
    label: 'Taux de réponse faible',
    rationale:
      "Un vendeur peu réactif complique toute vérification et rend la résolution d'un litige improbable.",
    severity: 'low',
  },

  // ── Statut professionnel ─────────────────────────────────────────────
  {
    id: 'seller.pro.declared',
    label: 'Vendeur professionnel déclaré',
    rationale:
      'Un professionnel identifié engage sa responsabilité légale et vous ouvre droit à la garantie de conformité.',
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'seller.pro.hidden',
    label: 'Activité professionnelle dissimulée',
    rationale:
      "Un volume d'activité professionnel sous un statut particulier vous prive des protections légales attachées à l'achat auprès d'un professionnel.",
    severity: 'medium',
  },
]);
