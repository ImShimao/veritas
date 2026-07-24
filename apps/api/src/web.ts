import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Logger } from './logger';

/**
 * Service de l'interface web.
 *
 * Quand `webDir` est défini, l'API sert le build de l'interface en plus du JSON.
 * L'application devient alors **auto-suffisante** : un seul serveur, un seul
 * port, aucune dépendance à un serveur de développement séparé. C'est ce qui
 * permet de l'empaqueter en application de bureau ou de la lancer d'un seul
 * exécutable.
 *
 * Le repli SPA (Single Page Application) est essentiel : une interface React
 * gère ses routes côté client. Recharger `/analyse/xyz` doit renvoyer
 * `index.html` — sinon l'utilisateur tombe sur un 404 dès qu'il rafraîchit une
 * page autre que l'accueil.
 */
export async function registerWeb(
  app: FastifyInstance,
  webDir: string,
  logger: Logger,
): Promise<boolean> {
  const indexPath = join(webDir, 'index.html');
  if (!existsSync(indexPath)) {
    logger.warn(
      { webDir },
      "Interface web introuvable : l'API ne sert que le JSON. Lancez d'abord `npm run build`.",
    );
    return false;
  }

  const fastifyStatic = (await import('@fastify/static')).default;
  await app.register(fastifyStatic, {
    root: webDir,
    // Les assymptotes JS/CSS de Vite portent une empreinte dans leur nom :
    // ils peuvent être mis en cache agressivement. Le reste ne l'est pas.
    setHeaders(res, path) {
      if (path.includes(`${join('assets')}`) || /\.[0-9a-f]{8,}\.(js|css)$/i.test(path)) {
        res.setHeader('cache-control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('cache-control', 'no-cache');
      }
    },
  });

  logger.info({ webDir }, "Interface web servie par l'API");
  return true;
}

/**
 * Détermine si une requête non trouvée doit recevoir le `index.html` (repli SPA)
 * plutôt qu'un 404 JSON.
 *
 * Règle : seules les requêtes GET/HEAD d'un navigateur (qui acceptent du HTML)
 * et qui ne visent ni l'API ni un fichier statique méritent le repli. Une
 * requête `POST /api/...` mal routée doit rester un 404 franc.
 */
export function isSpaNavigation(method: string, url: string, accept: string | undefined): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (url.startsWith('/api/')) return false;
  // Un chemin qui ressemble à un fichier (a une extension) n'est pas une route SPA.
  const path = url.split('?')[0] ?? url;
  if (/\.[a-z0-9]{2,5}$/i.test(path)) return false;
  return (accept ?? '').includes('text/html');
}
