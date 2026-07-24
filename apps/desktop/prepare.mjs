// @ts-check
/**
 * Préparation des ressources de l'application de bureau.
 *
 * Trois étapes, dans l'ordre :
 *   1. Bundler le serveur Veritas en un unique `build/server.mjs`.
 *   2. Construire l'interface web et la copier dans `build/web`.
 *   3. Générer l'icône de l'application.
 *
 * Les outils (tsup, vite) et les dépendances (`@veritas/*`, fastify…) sont
 * résolus depuis le `node_modules` racine du monorepo : ce paquet de bureau
 * reste volontairement hors des workspaces pour ne pas imposer Electron à
 * quiconque installe simplement le projet.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const buildDir = join(here, 'build');

/** Exécute une commande à la racine du dépôt, en héritant de la sortie. */
function run(command, cwd = repoRoot) {
  console.log(`\n▶ ${command}`);
  execSync(command, { cwd, stdio: 'inherit', shell: true });
}

console.log('Préparation des ressources de bureau Veritas…');

// Repartir d'un dossier de build propre, sauf l'icône déjà générée.
if (existsSync(join(buildDir, 'web')))
  rmSync(join(buildDir, 'web'), { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

// 1. Bundler le serveur en un seul fichier CommonJS.
run(`npx tsup --config "${join(here, 'tsup.config.ts')}"`, here);
if (!existsSync(join(buildDir, 'server.cjs'))) {
  throw new Error('Le bundling du serveur a échoué : build/server.cjs est absent.');
}

// 2. Construire l'interface web puis la copier.
run('npm run build --workspace @veritas/web');
const webDist = join(repoRoot, 'apps', 'web', 'dist');
if (!existsSync(join(webDist, 'index.html'))) {
  throw new Error("Le build de l'interface a échoué : apps/web/dist/index.html est absent.");
}
cpSync(webDist, join(buildDir, 'web'), { recursive: true });

// 3. Générer l'icône si elle n'existe pas déjà.
if (!existsSync(join(buildDir, 'icon.png'))) {
  run(`node "${join(here, 'make-icon.mjs')}"`, here);
}

console.log('\n✓ Ressources prêtes dans apps/desktop/build/');
console.log("  → `npm run dist` pour produire l'installeur Windows (.exe).");
