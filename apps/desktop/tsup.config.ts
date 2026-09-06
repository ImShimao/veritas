import { defineConfig } from 'tsup';

/**
 * Bundling du serveur pour l'application de bureau.
 *
 * On inline **tout** — le serveur Fastify, les paquets `@veritas/*`, leurs
 * dépendances — dans un unique fichier `build/server.mjs`. L'empaquetage n'a
 * alors qu'un fichier à embarquer, sans arborescence `node_modules` à traîner.
 *
 * Seul `sharp` reste externe : c'est un module natif (`.node`) qui ne peut pas
 * être bundlé. Il n'est pas pour autant absent de l'application empaquetée :
 * `prepare.mjs` copie sharp et son binaire natif dans `build/vendor/node_modules`,
 * embarqué comme ressource à côté de ce bundle, si bien que `require('sharp')`
 * s'y résout à l'exécution. La forensique d'image fine fonctionne donc aussi en
 * production ; le mode dégradé ne subsiste que si le binaire natif manque.
 */
export default defineConfig({
  entry: { server: '../api/src/embed.ts' },
  outDir: 'build',
  // Sortie CommonJS : Fastify, avvio et pino sont des modules CJS qui
  // utilisent `require()`. Les bundler vers de l'ESM déclenche
  // « Dynamic require of "events" is not supported ». Le CJS est leur format
  // natif ; le processus principal Electron l'importe via `await import()`,
  // ce qui fonctionne sur un fichier `.cjs`.
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  target: 'node18',
  platform: 'node',
  bundle: true,
  // Tout est inliné sauf le module natif.
  noExternal: [/.*/],
  external: ['sharp'],
  splitting: false,
  sourcemap: false,
  clean: false,
  // Fastify et pino s'appuient sur des accès dynamiques ; on évite une
  // minification agressive qui casserait leur résolution interne.
  minify: false,
  shims: false,
});
