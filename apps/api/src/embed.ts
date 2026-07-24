/**
 * Point d'entrée d'intégration.
 *
 * Contrairement à `main.ts` (qui démarre le serveur et gère les signaux),
 * ce module se contente d'exposer la fabrique. C'est ce qu'importe
 * l'application de bureau pour démarrer le serveur à l'intérieur de son
 * propre processus, sans dupliquer la logique de cycle de vie.
 */
export { buildServer } from './server';
export type { Application } from './server';
export { loadConfig } from './config';
export type { Config } from './config';
