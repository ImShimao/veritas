import { defineCriteria } from '../registry';

/**
 * Critères de cohérence tarifaire.
 *
 * Le prix est le signal le plus discriminant de toute l'analyse : une décote
 * inexplicable est présente dans la quasi-totalité des annonces frauduleuses,
 * puisque c'est elle qui capte l'attention de la victime.
 */
export const PRICE_CRITERIA = defineCriteria('price', [
  {
    id: 'price.deviation.extreme_low',
    label: 'Prix très inférieur au marché',
    rationale:
      'Une décote supérieure à 45 % sans justification est le principal appât des annonces frauduleuses. Elle explique pourquoi la victime accepte des conditions de paiement anormales.',
    severity: 'critical',
    weight: 2.2,
    impact: { authenticity: -0.8, trust: -1, risk: 1.2 },
  },
  {
    id: 'price.deviation.suspicious_low',
    label: 'Prix nettement sous le marché',
    rationale:
      "Une décote de 25 à 45 % au-delà de ce que justifient l'état et l'ancienneté doit être expliquée par le vendeur.",
    severity: 'high',
    impact: { authenticity: -0.5, trust: -1, risk: 1 },
  },
  {
    id: 'price.deviation.below_market',
    label: 'Prix sous le marché',
    rationale:
      "Une décote modérée est courante et souvent légitime, mais mérite d'être confrontée à l'état réel du bien.",
    severity: 'low',
  },
  {
    id: 'price.deviation.above_market',
    label: 'Prix supérieur au marché',
    rationale:
      "Un prix au-dessus du marché n'est pas un signal de fraude, mais indique une mauvaise affaire potentielle.",
    severity: 'info',
    impact: { trust: -0.2, risk: 0.1 },
  },
  {
    id: 'price.deviation.fair',
    label: 'Prix cohérent avec le marché',
    rationale:
      "Un prix aligné sur les références du marché est le premier indicateur d'une vente sincère.",
    polarity: 'positive',
    severity: 'high',
    impact: { authenticity: 0.5, trust: 1, risk: -1 },
  },
  {
    id: 'price.discount.unexplained',
    label: "Décote non justifiée par l'état",
    rationale:
      "Après prise en compte de l'âge, du kilométrage et de l'état déclarés, une part importante de la remise reste inexpliquée.",
    severity: 'high',
  },
  {
    id: 'price.psychological.round_number',
    label: 'Prix rond inhabituel',
    rationale:
      'Un montant parfaitement rond sur un bien dont le marché est dispersé traduit un prix choisi arbitrairement plutôt que calculé.',
    severity: 'info',
    weight: 0.15,
  },
  {
    id: 'price.currency.mismatch',
    label: 'Devise incohérente avec la localisation',
    rationale:
      'Une devise différente de celle du pays annoncé signale une annonce recyclée depuis un autre marché.',
    severity: 'medium',
  },
  {
    id: 'price.missing',
    label: 'Prix absent',
    rationale:
      "Sans prix affiché, aucune comparaison de marché n'est possible et l'analyse perd son signal le plus discriminant.",
    severity: 'medium',
    impact: { trust: -0.4, risk: 0.4 },
  },
  {
    id: 'price.negotiation.excessive_flexibility',
    label: 'Flexibilité tarifaire excessive',
    rationale:
      "Un vendeur qui annonce accepter n'importe quelle offre ne valorise pas le bien : il n'en dispose probablement pas.",
    severity: 'medium',
  },
  {
    id: 'price.reference.unavailable',
    label: 'Aucune référence de marché disponible',
    rationale:
      "Le référentiel embarqué ne couvre pas ce type de bien : la cohérence tarifaire n'a pas pu être vérifiée automatiquement.",
    severity: 'info',
    polarity: 'neutral',
    weight: 0,
  },
  {
    id: 'price.rental.deposit_ratio',
    label: 'Dépôt de garantie disproportionné',
    rationale:
      "Une caution sans rapport avec le loyer est un moyen classique d'extraire un versement unique sur une location inexistante.",
    severity: 'high',
    domains: ['rental_stay', 'real_estate'],
  },
  {
    id: 'price.vehicle.mileage_inconsistent',
    label: 'Prix incompatible avec le kilométrage',
    rationale:
      "Le rapport entre le prix demandé et le kilométrage annoncé s'écarte fortement des références du marché automobile.",
    severity: 'high',
    domains: ['vehicle'],
  },
]);
