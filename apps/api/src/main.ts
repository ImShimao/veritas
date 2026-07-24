import { buildServer } from './server';

/**
 * Point d'entrée du serveur.
 *
 * L'arrêt propre est traité sérieusement : les collections écrivent de façon
 * différée, un `SIGTERM` non intercepté ferait perdre les dernières analyses.
 */
async function main(): Promise<void> {
  const { app, config, logger, shutdown } = await buildServer();

  const close = (signal: string) => {
    void (async () => {
      logger.info({ signal }, 'Signal reçu');
      try {
        await shutdown();
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, "Échec de l'arrêt propre");
        process.exit(1);
      }
    })();
  };

  process.on('SIGINT', () => close('SIGINT'));
  process.on('SIGTERM', () => close('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Promesse rejetée sans gestionnaire');
  });

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    logger.info(
      { url: `http://${config.HOST}:${config.PORT}/api/v1`, brain: config.BRAIN_DRIVER },
      'Veritas API démarrée',
    );
  } catch (error) {
    logger.error({ err: error }, 'Impossible de démarrer le serveur');
    process.exit(1);
  }
}

void main();
