import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { VeritasError } from '@veritas/core';
import { decrypt, encrypt } from './crypto';

/**
 * Collection persistée en JSON chiffré.
 *
 * ## Pourquoi pas une base de données
 *
 * Veritas est conçu pour tourner sur la machine de l'utilisateur, avec ses
 * propres données. Imposer l'installation d'un moteur SQL, ou une dépendance
 * native qui échoue à compiler sur certaines plateformes, coûterait plus cher
 * que ce qu'il rapporterait à cette échelle.
 *
 * L'interface est délibérément celle d'un dépôt (`Repository`) : basculer vers
 * SQLite ou PostgreSQL quand le produit l'exigera ne demandera qu'une nouvelle
 * implémentation de cette classe, sans toucher aux services.
 *
 * ## Durabilité
 *
 * Les écritures passent par un fichier temporaire renommé ensuite, ce qui rend
 * le remplacement atomique : une coupure pendant l'écriture laisse l'ancienne
 * version intacte plutôt qu'un fichier tronqué.
 */

export interface Identifiable {
  id: string;
}

export interface CollectionOptions {
  /** Nombre maximal d'éléments conservés. Les plus anciens sont écartés. */
  maxItems?: number;
  /** Délai avant écriture, pour regrouper les modifications successives. */
  flushDelayMs?: number;
}

export class JsonCollection<T extends Identifiable> {
  private items = new Map<string, T>();
  private readonly filePath: string;
  private flushTimer: NodeJS.Timeout | undefined;
  private dirty = false;

  constructor(
    dataDir: string,
    private readonly name: string,
    private readonly encryptionKey: Buffer,
    private readonly options: CollectionOptions = {},
  ) {
    this.filePath = resolve(dataDir, `${name}.json`);
    this.load();
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const payload = readFileSync(this.filePath);
      const json = decrypt(payload, this.encryptionKey);
      const parsed: unknown = JSON.parse(json);
      if (Array.isArray(parsed)) {
        for (const item of parsed as T[]) {
          if (item && typeof item.id === 'string') this.items.set(item.id, item);
        }
      }
    } catch (error) {
      // Un fichier illisible ne doit pas empêcher le serveur de démarrer :
      // on repart d'une collection vide en conservant le fichier d'origine
      // pour diagnostic, plutôt que de l'écraser.
      throw new VeritasError(
        'STORAGE_ERROR',
        `La collection « ${this.name} » n'a pas pu être lue. Le fichier est peut-être chiffré avec une autre clé.`,
        { details: { path: this.filePath }, cause: error },
      );
    }
  }

  get(id: string): T | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  all(): T[] {
    return [...this.items.values()];
  }

  find(predicate: (item: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  findOne(predicate: (item: T) => boolean): T | undefined {
    return this.all().find(predicate);
  }

  put(item: T): T {
    this.items.set(item.id, item);
    this.enforceLimit();
    this.scheduleFlush();
    return item;
  }

  putMany(items: T[]): void {
    for (const item of items) this.items.set(item.id, item);
    this.enforceLimit();
    this.scheduleFlush();
  }

  update(id: string, mutate: (item: T) => T): T | undefined {
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const updated = mutate(existing);
    this.items.set(id, updated);
    this.scheduleFlush();
    return updated;
  }

  delete(id: string): boolean {
    const deleted = this.items.delete(id);
    if (deleted) this.scheduleFlush();
    return deleted;
  }

  clear(): void {
    this.items.clear();
    this.scheduleFlush();
  }

  get size(): number {
    return this.items.size;
  }

  /**
   * Écarte les éléments les plus anciens au-delà de la limite.
   * Les identifiants produits par `createId` sont triables chronologiquement,
   * ce qui rend l'éviction fiable sans champ de date supplémentaire.
   */
  private enforceLimit(): void {
    const max = this.options.maxItems;
    if (!max || this.items.size <= max) return;
    const sorted = [...this.items.keys()].sort();
    for (const id of sorted.slice(0, this.items.size - max)) this.items.delete(id);
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush();
    }, this.options.flushDelayMs ?? 400);
    // Ne pas retenir le processus si c'est le seul minuteur actif.
    this.flushTimer.unref?.();
  }

  /** Écrit immédiatement sur disque. Appelée à l'arrêt du serveur. */
  flush(): void {
    if (!this.dirty) return;
    const json = JSON.stringify(this.all());
    const payload = encrypt(json, this.encryptionKey);
    const temporary = `${this.filePath}.tmp`;

    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(temporary, payload, { mode: 0o600 });
    // Le renommage est atomique sur un même volume : soit l'ancien fichier,
    // soit le nouveau, jamais un état intermédiaire.
    renameSync(temporary, this.filePath);
    this.dirty = false;
  }
}
