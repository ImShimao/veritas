import { defineCriteria } from '../registry';

/**
 * Critères de sécurité transactionnelle.
 *
 * Distincts des critères `text.payment.*` : ceux-ci portent sur la structure
 * de la transaction telle qu'elle se dessine (mode de remise, protection
 * disponible, exposition financière), et non sur la formulation employée.
 */
export const PAYMENT_CRITERIA = defineCriteria('payment', [
  {
    id: 'payment.exposure.full_prepayment',
    label: 'Paiement intégral avant réception',
    rationale:
      "Le montage impose de payer la totalité avant de disposer du bien : l'acheteur porte seul l'intégralité du risque.",
    severity: 'high',
    weight: 1.5,
  },
  {
    id: 'payment.exposure.high_amount',
    label: 'Montant élevé en jeu',
    rationale:
      "L'enjeu financier justifie des vérifications renforcées : le coût d'une vérification est négligeable face à la perte potentielle.",
    severity: 'medium',
    impact: { trust: -0.3, risk: 0.9 },
  },
  {
    id: 'payment.protection.available',
    label: 'Protection acheteur mobilisable',
    rationale:
      'Le paiement sécurisé de la plateforme ou le paiement par carte offrent un recours réel en cas de non-réception.',
    polarity: 'positive',
    severity: 'high',
  },
  {
    id: 'payment.protection.waived',
    label: 'Protection acheteur contournée',
    rationale:
      'Le vendeur écarte le dispositif protecteur de la plateforme, ce qui supprime toute possibilité de remboursement.',
    severity: 'critical',
    weight: 2.0,
  },
  {
    id: 'payment.method.friends_and_family',
    label: 'Paiement entre proches demandé',
    rationale:
      "L'option « entre proches » de PayPal supprime volontairement la protection acheteur. La demander sur une vente est un détournement délibéré.",
    severity: 'critical',
    weight: 2.2,
  },
  {
    id: 'payment.method.cash_on_delivery',
    label: 'Paiement à la remise',
    rationale:
      'Payer en main propre au moment de la remise supprime presque intégralement le risque financier.',
    polarity: 'positive',
    severity: 'high',
  },
  {
    id: 'payment.method.unspecified',
    label: 'Modalités de paiement non précisées',
    rationale:
      "Aucune modalité n'est annoncée : c'est le point à clarifier en priorité, avant tout engagement.",
    severity: 'low',
  },
  {
    id: 'payment.identity.bank_details_requested',
    label: 'Coordonnées bancaires sollicitées',
    rationale:
      "Une demande de RIB, de numéro de carte ou de code de confirmation dans une annonce relève de l'hameçonnage.",
    severity: 'critical',
    weight: 2.6,
  },
  {
    id: 'payment.identity.documents_requested',
    label: "Pièce d'identité réclamée",
    rationale:
      "Aucune vente entre particuliers ne justifie l'envoi d'une pièce d'identité : ces documents alimentent l'usurpation d'identité.",
    severity: 'critical',
    weight: 2.3,
  },
]);
