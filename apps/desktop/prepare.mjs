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
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const buildDir = join(here, 'build');
const require = createRequire(import.meta.url);

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

// 1 bis. Embarquer sharp et sa fermeture de dépendances.
//   `sharp` reste externe au bundle (module natif `.node`, non bundlable). Pour
//   que la forensique d'image fonctionne dans l'application empaquetée — et non
//   plus seulement en développement — on copie sharp et toutes ses dépendances,
//   dont le binaire natif de la plateforme (`@img/sharp-<os>-<arch>`), dans
//   `build/vendor/node_modules`. Ce dossier est ensuite embarqué comme ressource
//   à côté de `server.cjs` : `require('sharp')` s'y résout naturellement.
bundleSharp();

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

/**
 * Copie sharp et sa fermeture de dépendances (binaire natif inclus) dans
 * `build/vendor/node_modules`, pour les embarquer avec l'application.
 *
 * On part de `sharp` et du paquet natif de la plateforme courante, puis on suit
 * récursivement les `dependencies` de chaque paquet. Une dépendance optionnelle
 * absente sur cette plateforme est simplement ignorée. Le binaire natif étant
 * choisi selon la machine de build, l'installeur produit est propre à sa
 * plateforme — ce qui correspond déjà au fonctionnement d'electron-builder.
 */
/**
 * Localise le dossier d'un paquet installé, sans passer par
 * `require.resolve('<pkg>/package.json')` : certains paquets (les binaires
 * `@img/*` de sharp) restreignent leur champ `exports` et interdisent la
 * résolution directe de leur `package.json`. On cible donc le node_modules
 * hoisté à la racine du monorepo, avec un repli par résolution du point d'entrée.
 */
function findPackageDir(name) {
  const direct = join(repoRoot, 'node_modules', ...name.split('/'));
  if (existsSync(join(direct, 'package.json'))) return direct;
  try {
    let dir = dirname(require.resolve(name, { paths: [repoRoot] }));
    while (dir !== dirname(dir)) {
      if (existsSync(join(dir, 'package.json'))) return dir;
      dir = dirname(dir);
    }
  } catch {
    /* Paquet absent ou sans point d'entrée résolvable : ignoré. */
  }
  return undefined;
}

function bundleSharp() {
  const vendorModules = join(buildDir, 'vendor', 'node_modules');
  rmSync(join(buildDir, 'vendor'), { recursive: true, force: true });
  mkdirSync(vendorModules, { recursive: true });

  const platformPkg = `@img/sharp-${process.platform}-${process.arch}`;
  const seen = new Set();
  const queue = ['sharp', platformPkg];
  let copied = 0;

  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);

    const source = findPackageDir(name);
    if (!source) continue; // Dépendance optionnelle absente sur cette plateforme : ignorée.

    const target = join(vendorModules, ...name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true, dereference: true });
    copied += 1;

    const pkg = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    for (const dep of Object.keys(pkg.dependencies ?? {})) queue.push(dep);
  }

  if (!existsSync(join(vendorModules, 'sharp'))) {
    throw new Error("Embarquement de sharp échoué : build/vendor/node_modules/sharp est absent.");
  }
  if (!existsSync(join(vendorModules, ...platformPkg.split('/')))) {
    console.warn(
      `\n⚠ Binaire natif « ${platformPkg} » introuvable : la forensique d'image restera dégradée.\n  Exécutez « npm install » à la racine pour l'installer.`,
    );
  } else {
    console.log(`\n✓ sharp embarqué (${copied} paquets, binaire ${platformPkg}).`);
  }
}
