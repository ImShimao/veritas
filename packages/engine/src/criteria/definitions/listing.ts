import { defineCriteria } from '../registry';

/** Critères structurels : cohérence globale de l'annonce en tant qu'objet. */
export const LISTING_CRITERIA = defineCriteria('listing', [
  {
    id: 'listing.title.keyword_stuffing',
    label: 'Titre saturé de mots-clés',
    rationale:
      'Un titre accumulant des marques et modèles sans rapport vise le référencement plutôt que la description du bien.',
    severity: 'medium',
  },
  {
    id: 'listing.title.mismatch_description',
    label: 'Titre et description divergents',
    rationale:
      'Le titre annonce un bien que la description ne décrit pas. Un tel écart traduit une annonce assemblée à partir de sources différentes.',
    severity: 'high',
  },
  {
    id: 'listing.title.too_generic',
    label: 'Titre trop générique',
    rationale:
      'Un titre sans marque ni modèle empêche toute comparaison de marché et est typique des annonces produites en volume.',
    severity: 'low',
  },
  {
    id: 'listing.freshness.very_recent',
    label: "Annonce publiée à l'instant",
    rationale:
      "Une annonce très récente n'a pas encore été soumise à la modération ni aux signalements de la communauté.",
    severity: 'low',
  },
  {
    id: 'listing.freshness.stale',
    label: 'Annonce ancienne toujours en ligne',
    rationale:
      "Une annonce à prix attractif restée longtemps en ligne interroge : soit le bien présente un défaut, soit l'annonce sert d'appât permanent.",
    severity: 'low',
  },
  {
    id: 'listing.freshness.republished',
    label: 'Annonce republiée à répétition',
    rationale:
      "La republication systématique dissimule l'ancienneté réelle et efface l'historique des échanges précédents.",
    severity: 'medium',
  },
  {
    id: 'listing.location.missing',
    label: 'Localisation absente',
    rationale:
      'Sans localisation, aucune rencontre ne peut être organisée et la cohérence géographique ne peut être vérifiée.',
    severity: 'medium',
  },
  {
    id: 'listing.location.inconsistent',
    label: 'Localisation incohérente',
    rationale:
      'La ville, le code postal et la région annoncés ne concordent pas entre eux : les informations ont été saisies sans lien avec un lieu réel.',
    severity: 'high',
  },
  {
    id: 'listing.location.far_from_seller',
    label: 'Bien éloigné du vendeur',
    rationale:
      "Une distance importante entre le vendeur et le bien complique toute remise en main propre et justifie commodément une expédition payée d'avance.",
    severity: 'medium',
  },
  {
    id: 'listing.attributes.missing_critical',
    label: 'Caractéristiques déterminantes manquantes',
    rationale:
      "Les attributs indispensables à l'évaluation de ce type de bien (année, kilométrage, taille, capacité…) sont absents.",
    severity: 'medium',
  },
  {
    id: 'listing.attributes.complete',
    label: 'Fiche complète',
    rationale:
      'Toutes les caractéristiques attendues sont renseignées, ce qui permet une comparaison de marché fiable.',
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'listing.attributes.contradictory',
    label: 'Caractéristiques contradictoires',
    rationale:
      "Deux attributs déclarés sont incompatibles entre eux ou avec la description : l'annonce n'a pas été remplie à partir d'un bien réel.",
    severity: 'high',
  },
  {
    id: 'listing.category.mismatch',
    label: 'Catégorie inadaptée',
    rationale:
      "Publier dans une catégorie sans rapport permet d'échapper à la modération spécialisée et aux comparaisons de prix.",
    severity: 'medium',
  },
  {
    id: 'listing.extraction.degraded',
    label: 'Extraction partielle',
    rationale:
      "La page n'a pu être lue que partiellement. Les conclusions reposent sur un sous-ensemble des informations disponibles.",
    severity: 'info',
    polarity: 'neutral',
    weight: 0,
  },
  {
    id: 'listing.platform.high_risk_context',
    label: 'Plateforme sans protection intégrée',
    rationale:
      "Certaines plateformes ne proposent ni paiement sécurisé ni vérification d'identité, ce qui accroît mécaniquement l'exposition de l'acheteur.",
    severity: 'low',
  },
  {
    id: 'listing.platform.protected_transaction',
    label: 'Paiement protégé disponible',
    rationale:
      "La plateforme propose un paiement sécurisé avec protection acheteur : l'utiliser réduit considérablement le risque financier.",
    polarity: 'positive',
    severity: 'medium',
  },
]);
