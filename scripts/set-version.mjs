// @ts-check
/**
 * Aligne le numéro de version de tous les paquets publiables.
 *
 * Usage : `node scripts/set-version.mjs 0.2.0`
 *
 * La cohérence des versions est essentielle pour les mises à jour automatiques :
 * le tag Git, l'application de bureau et l'extension doivent porter le même
 * numéro pour que la détection de nouvelle version fonctionne.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Usage : node scripts/set-version.mjs <x.y.z>   (ex. 0.2.0)');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  'package.json',
  'apps/desktop/package.json',
  'apps/extension/package.json',
  'apps/api/package.json',
  'apps/web/package.json',
];

for (const relative of targets) {
  const path = join(root, relative);
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  pkg.version = version;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✓ ${relative} → ${version}`);
}

console.log(`\nVersion alignée sur ${version}. Étapes suivantes :`);
console.log(`  git add -A && git commit -m "Version ${version}"`);
console.log(`  git tag v${version} && git push && git push --tags`);
console.log('\nLe workflow GitHub construit et publie alors installeur, portable et extensions.');
