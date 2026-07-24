import type { FastifyPluginAsync } from 'fastify';
import { CRITERION_CATEGORIES } from '@veritas/core';
import { defaultRegistry } from '@veritas/extractors';
import { ENGINE_VERSION } from '@veritas/engine';
import type { AnalysisService } from '../services/analysis.service';
import type { ChatService } from '../services/chat.service';
import type { Store } from '../store';

interface Options {
  analyses: AnalysisService;
  chat: ChatService;
  store: Store;
  startedAt: number;
}

/**
 * Routes de métadonnées.
 *
 * Elles rendent le système lisible de l'extérieur : quels critères existent,
 * quelles plateformes sont gérées, quel cerveau conversationnel est actif.
 * L'interface s'en sert pour ne rien coder en dur, et l'utilisateur pour
 * comprendre ce qui tourne réellement chez lui.
 */
export const metaRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const { analyses, chat, store, startedAt } = options;

  app.get('/health', async () => ({
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  }));

  /** Carte d'identité de l'IA embarquée. */
  app.get('/identity', async () => {
    const identity = analyses.engine.identity;
    return {
      name: identity.name,
      version: identity.version,
      engineVersion: ENGINE_VERSION,
      criteria: identity.criteria,
      brain: chat.brainName,
      // Point important pour l'utilisateur : ce qui sort — ou non — de sa machine.
      externalServices: [],
      requiresApiKey: false,
      dataStaysLocal: true,
    };
  });

  /** Référentiel complet des critères, pour la page « Comment ça marche ». */
  app.get('/criteria', async () => {
    const registry = analyses.engine.registry;
    return {
      stats: registry.stats(),
      categories: CRITERION_CATEGORIES,
      items: registry.all().map((criterion) => ({
        id: criterion.id,
        category: criterion.category,
        label: criterion.label,
        rationale: criterion.rationale,
        severity: criterion.severity,
        polarity: criterion.polarity,
        weight: criterion.weight,
        // Poids effectif après apprentissage, pour montrer l'évolution.
        effectiveWeight: Number(
          (criterion.weight * analyses.engine.calibration.multiplier(criterion.id)).toFixed(3),
        ),
      })),
    };
  });

  /** Plateformes prises en charge, exposées au frontend et à l'extension. */
  app.get('/platforms', async () => ({
    items: defaultRegistry.catalogue(),
  }));

  app.get('/stats', async () => ({
    store: store.stats(),
    learning: analyses.learningStats(),
  }));
};
