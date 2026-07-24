import pino from 'pino';
import { redact } from '@veritas/core';
import type { Config } from './config';

export type Logger = pino.Logger;

/**
 * Journalisation.
 *
 * Deux exigences guident cette configuration.
 *
 * **Ne jamais journaliser de données personnelles.** Les annonces contiennent
 * des numéros de téléphone, des adresses et des emails. Les champs sensibles
 * sont donc masqués, et les messages passent par `redact`. Un journal qui fuit
 * ce qu'il était censé protéger annule tout le bénéfice du chiffrement au repos.
 *
 * **Rester lisible en développement, exploitable en production.** Sortie
 * colorée et compacte en local, JSON structuré en production.
 */
export function createLogger(config: Config): Logger {
  const options: pino.LoggerOptions = {
    level: config.LOG_LEVEL,
    // Champs masqués quelle que soit leur profondeur dans l'objet journalisé.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.email',
        '*.phone',
        '*.seller.email',
        '*.seller.phone',
        '*.listing.description',
        '*.dataUri',
        'images',
      ],
      censor: '[masqué]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    hooks: {
      logMethod(args, method) {
        // Les messages libres peuvent contenir un extrait d'annonce :
        // on les nettoie systématiquement avant écriture.
        const [first, ...rest] = args;
        if (typeof first === 'string') {
          return method.apply(this, [redact(first), ...rest] as Parameters<typeof method>);
        }
        if (rest.length > 0 && typeof rest[0] === 'string') {
          return method.apply(this, [first, redact(rest[0]), ...rest.slice(1)] as Parameters<
            typeof method
          >);
        }
        return method.apply(this, args);
      },
    },
  };

  if (config.isProduction) {
    return pino(options);
  }

  return pino({
    ...options,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
      },
    },
  });
}
