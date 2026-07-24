import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Configuration du serveur.
 *
 * Toutes les valeurs ont une valeur par défaut fonctionnelle : `npm run dev`
 * doit démarrer sans fichier `.env`, sans clé d'API et sans service externe.
 */

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  DATA_DIR: z.string().default('.data'),
  ENCRYPTION_KEY: z.string().default(''),

  FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  FETCH_MAX_BYTES: z.coerce.number().int().min(65_536).default(5_242_880),
  FETCH_USER_AGENT: z.string().default('VeritasAI/0.1 (+https://veritas.local)'),
  RESPECT_ROBOTS: z.coerce.boolean().default(true),

  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  WATCH_ENABLED: z.coerce.boolean().default(true),
  WATCH_INTERVAL_MS: z.coerce.number().int().min(300_000).default(1_800_000),

  BRAIN_DRIVER: z.enum(['local', 'ollama']).default('local'),
  OLLAMA_URL: z.string().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('llama3.1'),

  // Dossier du build web à servir. Vide = l'API ne sert que le JSON
  // (l'interface tourne alors via le serveur de développement Vite).
  WEB_DIR: z.string().default(''),
});

export type RawConfig = z.infer<typeof schema>;

export interface Config extends RawConfig {
  dataDir: string;
  corsOrigins: string[];
  /** Clé AES-256-GCM utilisée pour chiffrer les données au repos. */
  encryptionKey: Buffer;
  isProduction: boolean;
  /** Chemin absolu du build web, ou undefined si l'API ne sert que le JSON. */
  webDir?: string;
}

/**
 * Charge, ou crée, la clé de chiffrement.
 *
 * En développement, générer la clé automatiquement évite d'imposer une étape
 * de configuration pour un logiciel destiné à tourner en local. En production
 * serveur, `ENCRYPTION_KEY` doit être fournie explicitement : une clé
 * auto-générée survivrait mal à un redéploiement et rendrait les données
 * illisibles.
 *
 * L'application de bureau est un cas à part : c'est une « production » qui
 * tourne sur le poste de l'utilisateur, où la clé générée est stockée à côté
 * des données et les suit naturellement. Elle active donc explicitement
 * `VERITAS_ALLOW_GENERATED_KEY` pour bénéficier de la génération automatique.
 */
function resolveEncryptionKey(raw: string, dataDir: string, isProduction: boolean): Buffer {
  if (raw.trim().length > 0) {
    const key = Buffer.from(raw.trim(), 'base64');
    if (key.length !== 32) {
      throw new Error('ENCRYPTION_KEY doit contenir 32 octets encodés en base64.');
    }
    return key;
  }

  const allowGenerated = process.env.VERITAS_ALLOW_GENERATED_KEY === 'true';
  if (isProduction && !allowGenerated) {
    throw new Error(
      "ENCRYPTION_KEY est obligatoire en production. Générez-la avec : node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }

  const keyPath = resolve(dataDir, '.key');
  if (existsSync(keyPath)) {
    const key = Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'base64');
    if (key.length === 32) return key;
  }

  const generated = randomBytes(32);
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(keyPath, generated.toString('base64'), { mode: 0o600 });
  return generated;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ');
    throw new Error(`Configuration invalide :\n  ${details}`);
  }

  const raw = parsed.data;
  const dataDir = resolve(process.cwd(), raw.DATA_DIR);
  const isProduction = raw.NODE_ENV === 'production';

  return {
    ...raw,
    dataDir,
    isProduction,
    corsOrigins: raw.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    encryptionKey: resolveEncryptionKey(raw.ENCRYPTION_KEY, dataDir, isProduction),
    webDir: raw.WEB_DIR ? resolve(process.cwd(), raw.WEB_DIR) : undefined,
  };
}
