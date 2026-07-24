// @ts-check
/**
 * Construction de l'extension Veritas.
 *
 * Bundle le moteur (`@veritas/*`) et la logique de l'extension en fichiers
 * autonomes, puis assemble deux extensions prêtes à charger : une pour Chrome /
 * Edge (MV3 `service_worker`) et une pour Firefox (MV3 `background.scripts`).
 * L'extension ainsi produite fonctionne **toute seule**, sans serveur.
 *
 * Les paquets `@veritas/*` et esbuild sont résolus depuis le `node_modules`
 * racine du monorepo (l'extension reste hors des workspaces).
 */
import { build } from 'esbuild';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  createWriteStream,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const distRoot = join(here, 'dist');
const wantZip = process.argv.includes('--zip');

const CONTENT_MATCHES = [
  '*://*.leboncoin.fr/*',
  '*://*.vinted.fr/*',
  '*://*.vinted.com/*',
  '*://*.vinted.be/*',
  '*://*.ebay.fr/*',
  '*://*.ebay.com/*',
  '*://*.ebay.de/*',
  '*://*.facebook.com/marketplace/*',
  '*://*.airbnb.fr/*',
  '*://*.airbnb.com/*',
  '*://*.booking.com/*',
  '*://*.autoscout24.fr/*',
  '*://*.backmarket.fr/*',
  '*://*.etsy.com/*',
  '*://*.mobile.de/*',
  '*://*.rakuten.com/*',
  '*://*.selency.fr/*',
  '*://*.lacentrale.fr/*',
  '*://*.wallapop.com/*',
  '*://*.marktplaats.nl/*',
  '*://*.subito.it/*',
];

/** Manifeste de base commun aux deux navigateurs. */
function baseManifest() {
  return {
    manifest_version: 3,
    name: "Veritas — Analyse d'annonces",
    version: VERSION,
    description:
      "Analysez la fiabilité d'une annonce en un clic. 100 % local, aucun serveur, aucune donnée envoyée.",
    default_locale: 'fr',
    permissions: ['activeTab', 'scripting', 'storage', 'unlimitedStorage'],
    host_permissions: ['https://api.github.com/*'],
    action: {
      default_title: 'Analyser cette annonce avec Veritas',
      default_popup: 'popup.html',
    },
    icons: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
    content_scripts: [{ matches: CONTENT_MATCHES, js: ['content.js'], run_at: 'document_idle' }],
  };
}

function chromeManifest() {
  return { ...baseManifest(), background: { service_worker: 'background.js' } };
}

function firefoxManifest() {
  return {
    ...baseManifest(),
    background: { scripts: ['background.js'] },
    browser_specific_settings: {
      gecko: { id: 'veritas@imshimao.github.io', strict_min_version: '115.0' },
    },
  };
}

/** Bundle un point d'entrée TypeScript en IIFE autonome (compatible SW et page). */
async function bundle(entry, outfile) {
  await build({
    entryPoints: [join(here, 'src', entry)],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110', 'firefox115'],
    // `sharp` est un binaire natif : jamais dans le navigateur (mode dégradé).
    external: ['sharp'],
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning',
  });
}

async function buildTarget(name, manifest) {
  const out = join(distRoot, name);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  // Code bundlé.
  await bundle('background.ts', join(out, 'background.js'));
  await bundle('popup.ts', join(out, 'popup.js'));

  // Ressources statiques.
  cpSync(join(here, 'public'), out, { recursive: true });
  if (existsSync(join(here, 'icons'))) cpSync(join(here, 'icons'), join(out, 'icons'), { recursive: true });
  if (existsSync(join(here, '_locales'))) cpSync(join(here, '_locales'), join(out, '_locales'), { recursive: true });

  // Manifeste.
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`✓ ${name} → apps/extension/dist/${name}/`);
  return out;
}

/** Zippe un dossier d'extension (format compatible navigateur et stores). */
async function zipDir(sourceDir, zipPath) {
  // On utilise le module archiver s'il est présent, sinon on saute le zip.
  let archiver;
  try {
    archiver = (await import('archiver')).default;
  } catch {
    console.log(`  (archiver absent — zip ignoré pour ${zipPath}. Zippez le dossier manuellement.)`);
    return;
  }
  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    void archive.finalize();
  });
  console.log(`✓ paquet → ${zipPath}`);
}

async function main() {
  console.log(`Construction de l'extension Veritas v${VERSION}…\n`);
  mkdirSync(distRoot, { recursive: true });

  const chromeDir = await buildTarget('chrome', chromeManifest());
  const firefoxDir = await buildTarget('firefox', firefoxManifest());

  if (wantZip) {
    await zipDir(chromeDir, join(distRoot, `veritas-extension-chrome-${VERSION}.zip`));
    await zipDir(firefoxDir, join(distRoot, `veritas-extension-firefox-${VERSION}.zip`));
  }

  console.log('\nÀ charger :');
  console.log('  Chrome/Edge → chrome://extensions → mode dev → « Charger l\'extension non empaquetée » → apps/extension/dist/chrome');
  console.log('  Firefox     → about:debugging → « Charger un module temporaire » → apps/extension/dist/firefox/manifest.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
