import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Chiffrement des données au repos.
 *
 * AES-256-GCM : chiffrement authentifié, donc toute altération du fichier est
 * détectée à la lecture plutôt que de produire silencieusement des données
 * corrompues.
 *
 * Ce que cela protège réellement : un accès en lecture au disque — sauvegarde
 * égarée, dossier synchronisé dans le cloud, machine partagée. Ce que cela ne
 * protège pas : un attaquant capable d'exécuter du code sous l'identité de
 * l'utilisateur, puisque la clé lui est alors accessible. Il est important de
 * ne pas surestimer cette garantie.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
/** Marqueur de format, pour reconnaître un fichier chiffré et gérer les migrations. */
const MAGIC = 'VRTS1';

export function encrypt(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from(MAGIC, 'utf8'), iv, tag, encrypted]);
}

export function decrypt(payload: Buffer, key: Buffer): string {
  const magic = payload.subarray(0, MAGIC.length).toString('utf8');
  if (magic !== MAGIC) {
    // Fichier écrit avant l'activation du chiffrement : on le lit tel quel,
    // il sera réécrit chiffré à la prochaine sauvegarde.
    return payload.toString('utf8');
  }

  const iv = payload.subarray(MAGIC.length, MAGIC.length + IV_LENGTH);
  const tag = payload.subarray(MAGIC.length + IV_LENGTH, MAGIC.length + IV_LENGTH + TAG_LENGTH);
  const encrypted = payload.subarray(MAGIC.length + IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
