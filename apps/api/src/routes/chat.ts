import type { FastifyPluginAsync } from 'fastify';
import { chatRequestSchema } from '@veritas/core';
import { STARTER_QUESTIONS } from '@veritas/nlu';
import type { ChatService } from '../services/chat.service';

interface Options {
  chat: ChatService;
}

export const chatRoutes: FastifyPluginAsync<Options> = async (app, { chat }) => {
  /** Pose une question à Veritas sur une analyse donnée. */
  app.post('/chat', async (request) => {
    const dto = chatRequestSchema.parse(request.body);
    const { session, message } = await chat.ask(dto.analysisId, dto.question, dto.sessionId);
    return { sessionId: session.id, message };
  });

  /** Historique de la conversation rattachée à une analyse. */
  app.get<{ Params: { analysisId: string } }>('/chat/:analysisId', async (request) => {
    const session = chat.history(request.params.analysisId);
    return {
      session: session ?? null,
      starters: STARTER_QUESTIONS,
      brain: chat.brainName,
    };
  });

  app.delete<{ Params: { analysisId: string } }>('/chat/:analysisId', async (request, reply) => {
    chat.reset(request.params.analysisId);
    return reply.code(204).send();
  });
};
