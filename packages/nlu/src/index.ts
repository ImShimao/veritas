/**
 * @veritas/nlu — la couche conversationnelle de Veritas.
 *
 * Aucune clé d'API, aucun appel vers un service tiers. L'assistant s'appuie
 * intégralement sur le rapport produit par le moteur : il sélectionne,
 * hiérarchise et met en mots des constats qui existent déjà, plutôt que de
 * générer une opinion. C'est ce qui garantit qu'il ne peut pas affirmer sur
 * une annonce quelque chose que le moteur n'a pas établi.
 */

export { detectIntent, INTENTS } from './intents';
export type { Intent, IntentMatch } from './intents';

export { LocalBrain, SelfHostedBrain, createBrain } from './brains';
export { RESPONDERS, categoryLabel } from './responders';
export type { ResponderContext } from './responders';
export { buildSellerMessage, draftMessageReply } from './drafts';
export type { DraftOptions } from './drafts';

/** Questions proposées à l'ouverture d'une conversation. */
export const STARTER_QUESTIONS = [
  'Est-ce que tu achèterais ce produit ?',
  'Quels sont les risques ?',
  'Pourquoi ce score ?',
  'Que dois-je demander au vendeur ?',
  'Rédige un message au vendeur',
  'Comment payer en sécurité ?',
] as const;
