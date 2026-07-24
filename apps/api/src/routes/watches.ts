import type { FastifyPluginAsync } from 'fastify';
import { watchRequestSchema } from '@veritas/core';
import type { WatchService } from '../services/watch.service';

interface Options {
  watches: WatchService;
}

export const watchRoutes: FastifyPluginAsync<Options> = async (app, { watches }) => {
  /** Met une annonce sous surveillance. */
  app.post('/watches', async (request, reply) => {
    const dto = watchRequestSchema.parse(request.body);
    const watch = watches.create(dto.analysisId, dto.intervalMs);
    return reply.code(201).send(watch);
  });

  app.get('/watches', async () => ({ items: watches.list() }));

  app.delete<{ Params: { id: string } }>('/watches/:id', async (request, reply) => {
    watches.stop(request.params.id);
    return reply.code(204).send();
  });

  /** Alertes produites par la surveillance. */
  app.get<{ Querystring: { unread?: string; limit?: string } }>('/alerts', async (request) => {
    const items = watches.alerts({
      unreadOnly: request.query.unread === 'true',
      limit: request.query.limit ? Number(request.query.limit) : undefined,
    });
    return { items, unread: items.filter((alert) => !alert.read).length };
  });

  app.post<{ Params: { id: string } }>('/alerts/:id/read', async (request, reply) => {
    watches.markRead(request.params.id);
    return reply.code(204).send();
  });

  /**
   * Déclenche manuellement un tour de vérification.
   * Utile en développement et pour permettre à l'utilisateur de forcer un contrôle.
   */
  app.post('/watches/run', async () => {
    const checked = await watches.runDueChecks();
    return { checked };
  });
};
