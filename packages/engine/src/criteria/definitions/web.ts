import { defineCriteria } from '../registry';

/**
 * Critères de recoupement.
 *
 * Ces critères comparent l'annonce au corpus déjà analysé localement et
 * préparent les vérifications externes (recherche inversée, bases de
 * signalement) que l'utilisateur déclenche d'un clic depuis le rapport.
 */
export const WEB_CRITERIA = defineCriteria('web', [
  {
    id: 'web.duplicate.text_exact',
    label: 'Description identique à une autre annonce',
    rationale:
      "Un texte repris à l'identique signale soit une annonce copiée, soit une diffusion en masse du même contenu par un même acteur.",
    severity: 'critical',
    weight: 2.2,
  },
  {
    id: 'web.duplicate.text_partial',
    label: 'Description fortement similaire',
    rationale:
      'De larges passages coïncident avec une annonce déjà analysée. Les escrocs recyclent leurs textes en modifiant quelques détails.',
    severity: 'high',
  },
  {
    id: 'web.duplicate.title',
    label: 'Titre déjà rencontré',
    rationale:
      "Un titre identique sur une autre annonce peut refléter un produit courant, ou la republication d'une annonce supprimée.",
    severity: 'low',
  },
  {
    id: 'web.duplicate.cross_platform',
    label: 'Annonce présente sur plusieurs plateformes',
    rationale:
      "La multidiffusion est légitime, mais des prix ou des descriptions divergents d'une plateforme à l'autre révèlent une manipulation.",
    severity: 'medium',
  },
  {
    id: 'web.reuse.seller_alias',
    label: 'Pseudonyme déjà rencontré',
    rationale:
      "Ce pseudonyme apparaît dans d'autres analyses de votre historique : consultez leur verdict avant de poursuivre.",
    severity: 'medium',
  },
  {
    id: 'web.reuse.contact_reported',
    label: 'Coordonnées déjà associées à une annonce à risque',
    rationale:
      "Le numéro ou l'adresse figurant dans cette annonce apparaît dans une analyse précédente conclue comme risquée.",
    severity: 'critical',
    weight: 2.3,
  },
  {
    id: 'web.reputation.check_pending',
    label: 'Vérification de réputation à effectuer',
    rationale:
      'Des recherches ciblées sont proposées pour confronter les coordonnées du vendeur aux bases publiques de signalement.',
    severity: 'info',
    polarity: 'neutral',
    weight: 0,
  },
  {
    id: 'web.unique.no_duplicate_found',
    label: 'Aucun doublon détecté',
    rationale:
      "Ni le texte ni les images ne correspondent à une annonce déjà analysée : rien n'indique un contenu recyclé.",
    polarity: 'positive',
    severity: 'medium',
  },
  {
    id: 'web.corpus.too_small',
    label: 'Base de comparaison insuffisante',
    rationale:
      "Trop peu d'analyses ont été réalisées pour que la détection de doublons soit significative. Elle gagnera en valeur à l'usage.",
    severity: 'info',
    polarity: 'neutral',
    weight: 0,
  },
]);
