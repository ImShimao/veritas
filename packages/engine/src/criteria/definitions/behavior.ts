import { defineCriteria } from '../registry';

/**
 * Critères comportementaux et contextuels.
 *
 * Ils exploitent le contexte fourni par l'utilisateur (notes libres) et
 * l'observation dans la durée quand l'annonce est sous surveillance.
 */
export const BEHAVIOR_CRITERIA = defineCriteria('behavior', [
  {
    id: 'behavior.reported.user_context',
    label: "Élément signalé par l'utilisateur",
    rationale:
      "Le contexte que vous avez décrit contient un signal qui n'apparaît pas dans l'annonce publiée. Votre observation directe prime sur le texte.",
    severity: 'high',
  },
  {
    id: 'behavior.escalation.pressure_after_contact',
    label: 'Pression exercée après le premier contact',
    rationale:
      "Une insistance apparue après la prise de contact, absente de l'annonce, est le moment où la fraude se révèle habituellement.",
    severity: 'critical',
    weight: 2.0,
  },
  {
    id: 'behavior.evasion.refuses_verification',
    label: 'Refus de vérification simple',
    rationale:
      "Refuser une photo supplémentaire, une vidéo ou un appel alors que la demande est triviale ne s'explique que par l'absence du bien.",
    severity: 'critical',
    weight: 2.1,
  },
  {
    id: 'behavior.monitoring.price_dropped',
    label: 'Prix baissé pendant la surveillance',
    rationale:
      "Une baisse successive du prix sur une annonce déjà sous le marché accentue l'appât et signale une urgence à écouler.",
    severity: 'medium',
  },
  {
    id: 'behavior.monitoring.content_edited',
    label: 'Annonce modifiée après publication',
    rationale:
      'Une réécriture du texte ou un remplacement des photos après publication sert souvent à recycler une annonce signalée.',
    severity: 'medium',
  },
  {
    id: 'behavior.monitoring.disappeared',
    label: 'Annonce retirée',
    rationale:
      "La disparition rapide d'une annonce peut signaler une vente conclue comme une suppression par la modération après signalements.",
    severity: 'medium',
  },
  {
    id: 'behavior.monitoring.stable',
    label: 'Annonce stable dans le temps',
    rationale:
      "Une annonce inchangée depuis plusieurs relevés correspond au comportement d'un vendeur patient et réel.",
    polarity: 'positive',
    severity: 'low',
  },
]);
