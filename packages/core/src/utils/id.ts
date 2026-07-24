/** Génération d'identifiants et horodatages. */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * Identifiant trié chronologiquement : préfixe temporel en base 36 suivi
 * d'un suffixe aléatoire. Deux analyses créées à la même milliseconde restent
 * distinctes, et le tri lexicographique équivaut au tri par date.
 */
export function createId(prefix?: string): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const bytes = randomBytes(10);
  let random = '';
  for (const byte of bytes) random += ALPHABET[byte % ALPHABET.length];
  const id = `${time}${random}`;
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Extrait l'instant de création encodé dans un identifiant produit par `createId`. */
export function idTimestamp(id: string): Date | undefined {
  const body = id.includes('_') ? id.slice(id.indexOf('_') + 1) : id;
  const time = Number.parseInt(body.slice(0, 9), 36);
  return Number.isFinite(time) && time > 0 ? new Date(time) : undefined;
}

export function daysBetween(a: string | Date, b: string | Date = new Date()): number {
  const start = typeof a === 'string' ? new Date(a) : a;
  const end = typeof b === 'string' ? new Date(b) : b;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Number.NaN;
  return (end.getTime() - start.getTime()) / 86_400_000;
}

/** Formate une durée en français : « il y a 3 jours ». */
export function relativeTime(iso: string, reference: Date = new Date()): string {
  const days = daysBetween(iso, reference);
  if (Number.isNaN(days)) return 'date inconnue';
  const abs = Math.abs(days);
  if (abs < 1 / 24) return "à l'instant";
  if (abs < 1) return `il y a ${Math.round(abs * 24)} h`;
  if (abs < 30) return `il y a ${Math.round(abs)} jour${Math.round(abs) > 1 ? 's' : ''}`;
  if (abs < 365) return `il y a ${Math.round(abs / 30)} mois`;
  const years = Math.round(abs / 365);
  return `il y a ${years} an${years > 1 ? 's' : ''}`;
}
