import type { FastifyPluginAsync } from 'fastify';
import {
  analysisInputSchema,
  compareRequestSchema,
  feedbackSchema,
  listQuerySchema,
} from '@veritas/core';
import type { AnalysisService } from '../services/analysis.service';

interface Options {
  analyses: AnalysisService;
}

/**
 * Routes d'analyse.
 *
 * Toute entrée traverse un schéma zod avant d'atteindre un service : c'est la
 * seule frontière de confiance du système.
 */
export const analysesRoutes: FastifyPluginAsync<Options> = async (app, { analyses }) => {
  /** Lance une analyse depuis une URL, un texte, un HTML ou des images. */
  app.post('/analyses', async (request, reply) => {
    const input = analysisInputSchema.parse(request.body);
    const report = await analyses.analyze(input);
    return reply.code(201).send(report);
  });

  /** Historique paginé, filtrable. */
  app.get('/analyses', async (request) => {
    const query = listQuerySchema.parse(request.query);
    return analyses.list(query);
  });

  /** Rapport complet. */
  app.get<{ Params: { id: string } }>('/analyses/:id', async (request) => {
    return analyses.get(request.params.id);
  });

  app.delete<{ Params: { id: string } }>('/analyses/:id', async (request, reply) => {
    analyses.delete(request.params.id);
    return reply.code(204).send();
  });

  /** Bascule le marque-page sur une analyse. */
  app.post<{ Params: { id: string } }>('/analyses/:id/favorite', async (request) => {
    const favorite = analyses.toggleFavorite(request.params.id);
    return { favorite };
  });

  /** Retour utilisateur : alimente l'apprentissage. */
  app.post('/feedback', async (request, reply) => {
    const dto = feedbackSchema.parse(request.body);
    const result = analyses.recordFeedback(dto);
    return reply.code(201).send(result);
  });

  /** Comparaison de deux à cinq analyses. */
  app.post('/analyses/compare', async (request) => {
    const { analysisIds } = compareRequestSchema.parse(request.body);
    return analyses.compare(analysisIds);
  });

  /** État de l'apprentissage, exposé pour rendre le moteur lisible. */
  app.get('/learning', async () => analyses.learningStats());
};
