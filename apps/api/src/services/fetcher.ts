import { redact, VeritasError } from '@veritas/core';
import type { FetchedPage } from '@veritas/extractors';
import type { Config } from '../config';

/**
 * Récupération réseau.
 *
 * Ce module concentre toute la politique de sortie réseau : délais, taille
 * maximale, protocoles autorisés, respect de `robots.txt`. Le moteur et les
 * extracteurs n'accèdent jamais directement au réseau — ils reçoivent une
 * fonction de récupération, ce qui rend cette politique modifiable en un seul
 * endroit et testable sans réseau.
 *
 * ## Sur les protections anti-robot
 *
 * Plusieurs plateformes bloquent les requêtes serveur. Veritas ne cherche pas
 * à contourner ces protections : ni rotation d'adresses, ni navigateur
 * automatisé, ni usurpation d'agent utilisateur. Quand la récupération échoue,
 * l'utilisateur est redirigé vers l'extension navigateur — qui lit la page
 * déjà ouverte, dans sa propre session — ou vers le collage de texte. C'est
 * moins spectaculaire qu'un contournement, mais c'est tenable dans la durée
 * et défendable vis-à-vis des plateformes.
 */

/** Signatures de pages anti-robot, distinguées d'une véritable annonce. */
const BLOCK_SIGNATURES = [
  /datadome/i,
  /captcha/i,
  /cf-browser-verification/i,
  /just a moment/i,
  /access denied/i,
  /vous avez été bloqué/i,
  /are you a robot/i,
  /enable javascript and cookies to continue/i,
];

/** Adresses internes, jamais atteignables depuis une URL fournie par l'utilisateur. */
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /\.local$/i,
  /\.internal$/i,
];

/**
 * Refuse les adresses du réseau interne.
 *
 * Sans ce contrôle, une URL comme `http://169.254.169.254/` transformerait
 * l'analyseur d'annonces en outil de reconnaissance du réseau qui l'héberge.
 */
function assertPublicUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new VeritasError('INVALID_INPUT', 'Seules les adresses http et https sont acceptées.');
  }
  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
    throw new VeritasError(
      'INVALID_INPUT',
      'Cette adresse ne pointe pas vers une annonce publique.',
    );
  }
}

export class Fetcher {
  /** Cache des directives robots.txt, par origine. */
  private readonly robotsCache = new Map<string, { disallow: string[]; fetchedAt: number }>();
  private static readonly ROBOTS_TTL_MS = 3_600_000;

  constructor(private readonly config: Config) {}

  /** Récupère une page HTML. */
  async fetchPage(rawUrl: string): Promise<FetchedPage> {
    const url = new URL(rawUrl);
    assertPublicUrl(url);

    if (this.config.RESPECT_ROBOTS) {
      const allowed = await this.isAllowedByRobots(url);
      if (!allowed) {
        throw new VeritasError(
          'ROBOTS_DISALLOWED',
          'Le fichier robots.txt de ce site interdit la récupération automatique de cette page.',
          {
            hint: "Utilisez l'extension navigateur sur la page ouverte, ou collez le texte de l'annonce.",
          },
        );
      }
    }

    const response = await this.request(url, 'text/html,application/xhtml+xml');
    const html = await this.readBounded(response);

    const blocked =
      response.status === 403 ||
      response.status === 429 ||
      (html.length < 60_000 && BLOCK_SIGNATURES.some((pattern) => pattern.test(html)));

    return { html, finalUrl: response.url || rawUrl, status: response.status, blocked };
  }

  /** Récupère une image pour la forensique visuelle. */
  async fetchImage(rawUrl: string): Promise<Buffer | undefined> {
    try {
      const url = new URL(rawUrl);
      assertPublicUrl(url);
      const response = await this.request(url, 'image/*');
      if (!response.ok) return undefined;

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) return undefined;

      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer.length > this.config.FETCH_MAX_BYTES ? undefined : buffer;
    } catch {
      // Une image inaccessible dégrade l'analyse visuelle sans l'interrompre.
      return undefined;
    }
  }

  private async request(url: URL, accept: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.FETCH_TIMEOUT_MS);

    try {
      return await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          accept,
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8',
          'user-agent': this.config.FETCH_USER_AGENT,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new VeritasError(
          'FETCH_TIMEOUT',
          `La page n'a pas répondu dans le délai imparti (${Math.round(this.config.FETCH_TIMEOUT_MS / 1000)} s).`,
          { hint: "Réessayez, ou collez directement le texte de l'annonce." },
        );
      }
      throw new VeritasError('FETCH_BLOCKED', "La page n'a pas pu être récupérée.", {
        details: { reason: redact(error instanceof Error ? error.message : String(error)) },
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Lit le corps de la réponse en s'arrêtant à la taille maximale autorisée. */
  private async readBounded(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return response.text();

    const chunks: Uint8Array[] = [];
    let total = 0;

    while (total < this.config.FETCH_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    await reader.cancel().catch(() => undefined);

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  }

  /**
   * Vérifie `robots.txt` pour l'agent utilisateur de Veritas.
   *
   * Implémentation volontairement conservatrice : en cas de doute ou d'erreur
   * de lecture, on autorise — un `robots.txt` inaccessible ne doit pas bloquer
   * l'utilisateur — mais toute règle `Disallow` explicite est respectée.
   */
  private async isAllowedByRobots(url: URL): Promise<boolean> {
    const origin = url.origin;
    const cached = this.robotsCache.get(origin);
    const now = Date.now();

    let rules =
      cached && now - cached.fetchedAt < Fetcher.ROBOTS_TTL_MS ? cached.disallow : undefined;

    if (!rules) {
      rules = await this.loadRobots(origin);
      this.robotsCache.set(origin, { disallow: rules, fetchedAt: now });
    }

    const path = url.pathname + url.search;
    return !rules.some((rule) => rule.length > 0 && path.startsWith(rule));
  }

  private async loadRobots(origin: string): Promise<string[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${origin}/robots.txt`, {
        signal: controller.signal,
        headers: { 'user-agent': this.config.FETCH_USER_AGENT },
      });
      if (!response.ok) return [];

      const text = (await response.text()).slice(0, 100_000);
      return parseRobots(text);
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Extrait les règles `Disallow` applicables à tous les agents (`User-agent: *`). */
export function parseRobots(content: string): string[] {
  const disallow: string[] = [];
  let applies = false;

  for (const line of content.split('\n')) {
    const cleaned = line.split('#')[0]?.trim() ?? '';
    if (cleaned.length === 0) continue;

    const [rawKey, ...rest] = cleaned.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      applies = value === '*';
    } else if (key === 'disallow' && applies && value.length > 0) {
      disallow.push(value);
    }
  }

  return disallow;
}
