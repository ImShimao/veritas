import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { toVeritasError, VeritasError } from '@veritas/core';
import { createBrain } from '@veritas/nlu';
import { loadConfig, type Config } from './config';
import { createLogger, type Logger } from './logger';
import { Store } from './store';
import { Fetcher } from './services/fetcher';
import { AnalysisService } from './services/analysis.service';
import { ChatService } from './services/chat.service';
import { WatchService } from './services/watch.service';
import { analysesRoutes } from './routes/analyses';
import { chatRoutes } from './routes/chat';
import { watchRoutes } from './routes/watches';
import { metaRoutes } from './routes/meta';
import { isSpaNavigation, registerWeb } from './web';

export interface Application {
  app: FastifyInstance;
  config: Config;
  logger: Logger;
  store: Store;
  services: {
    analyses: AnalysisService;
    chat: ChatService;
    watches: WatchService;
  };
  shutdown(): Promise<void>;
}

/** Corps maximal accepté : douze images en data-URI, plus le HTML d'une page. */
const BODY_LIMIT = 48 * 1024 * 1024;

export async function buildServer(overrides: Partial<Config> = {}): Promise<Application> {
  const config = { ...loadConfig(), ...overrides };
  const logger = createLogger(config);
  const startedAt = Date.now();

  const store = new Store(config);
  const fetcher = new Fetcher(config);

  const analyses = new AnalysisService(store, fetcher, logger);
  const brain = createBrain({
    driver: config.BRAIN_DRIVER,
    baseUrl: config.OLLAMA_URL,
    model: config.OLLAMA_MODEL,
  });
  const chat = new ChatService(store, analyses, brain);
  const watches = new WatchService(store, analyses, fetcher, config, logger);

  const app = Fastify({
    /*
     * Fastify 4 accepte une instance pino directement via `logger`
     * (renommé `loggerInstance` à partir de Fastify 5).
     *
     * L'élargissement vers `FastifyBaseLogger` est délibéré : passer le type
     * concret de pino spécialiserait le générique de `FastifyInstance` et le
     * rendrait incompatible avec le type standard utilisé par les plugins.
     */
    logger: logger as FastifyBaseLogger,
    bodyLimit: BODY_LIMIT,
    trustProxy: false,
    // Les identifiants de requête facilitent le rapprochement journal / incident.
    genReqId: () => Math.random().toString(36).slice(2, 10),
  });

  await app.register(helmet, {
    // L'API ne sert que du JSON : la politique de contenu par défaut est inutile
    // et gênerait l'interface servie depuis une autre origine en développement.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(cors, {
    origin(origin, callback) {
      // Requêtes sans origine : appels serveur à serveur, curl, tests.
      if (!origin) return callback(null, true);
      const allowed = config.corsOrigins.some((pattern) => {
        if (pattern === '*') return true;
        if (pattern.endsWith('*')) return origin.startsWith(pattern.slice(0, -1));
        return origin === pattern;
      });
      // L'extension navigateur émet depuis une origine `chrome-extension://`
      // ou `moz-extension://` que l'on autorise explicitement.
      const isExtension = /^(chrome|moz)-extension:\/\//.test(origin);
      callback(null, allowed || isExtension);
    },
    credentials: false,
  });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    // Les analyses sont coûteuses (réseau, images) : la limite protège
    // autant le serveur que les sites interrogés.
    errorResponseBuilder: () => ({
      error: {
        code: 'RATE_LIMITED',
        message: 'Trop de requêtes. Patientez quelques instants avant de relancer une analyse.',
      },
    }),
  });

  /**
   * Gestionnaire d'erreurs unique.
   *
   * Il traduit toute exception en réponse exploitable par l'interface : un code
   * stable, un message en français destiné à l'utilisateur, et une piste d'action.
   * Les détails techniques ne partent jamais au client en production.
   */
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => ({
        field: issue.path.join('.') || 'corps de la requête',
        message: issue.message,
      }));
      request.log.info({ issues }, 'Requête invalide');
      return reply.code(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: issues[0]?.message ?? 'Requête invalide.',
          details: { issues },
        },
      });
    }

    const veritasError = toVeritasError(error);

    if (veritasError.statusCode >= 500) {
      request.log.error({ err: error, code: veritasError.code }, 'Erreur serveur');
    } else {
      request.log.info({ code: veritasError.code }, veritasError.userMessage);
    }

    return reply.code(veritasError.statusCode).send({
      error: {
        code: veritasError.code,
        message: veritasError.userMessage,
        hint: veritasError.hint,
        details: config.isProduction ? undefined : veritasError.details,
      },
    });
  });

  await app.register(
    async (api) => {
      await api.register(metaRoutes, { analyses, chat, store, startedAt });
      await api.register(analysesRoutes, { analyses });
      await api.register(chatRoutes, { chat });
      await api.register(watchRoutes, { watches });
    },
    { prefix: '/api/v1' },
  );

  // Interface web servie par l'API si un build est disponible (mode auto-suffisant).
  const servingWeb = config.webDir ? await registerWeb(app, config.webDir, logger) : false;

  app.setNotFoundHandler((request, reply) => {
    // Repli SPA : une navigation navigateur vers une route côté client
    // (ex. /analyse/xyz rechargée) doit recevoir l'interface, pas un 404 JSON.
    if (servingWeb && isSpaNavigation(request.method, request.url, request.headers.accept)) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route inconnue : ${request.method} ${request.url}`,
      },
    });
  });

  watches.start();

  const shutdown = async (): Promise<void> => {
    logger.info('Arrêt en cours…');
    watches.stopAll();
    // Les collections écrivent de façon différée : on force la sauvegarde
    // avant de sortir, sinon les dernières analyses seraient perdues.
    store.flushAll();
    await app.close();
    logger.info('Arrêt terminé');
  };

  return { app, config, logger, store, services: { analyses, chat, watches }, shutdown };
}

/** Vérifie que le type d'erreur est bien celui attendu, pour les tests. */
export { VeritasError };
