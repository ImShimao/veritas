/**
 * Forensique visuelle.
 *
 * `sharp` est une dépendance **optionnelle** : sa compilation native échoue sur
 * certaines plateformes, et il serait absurde qu'une analyse d'annonce devienne
 * impossible pour cette raison. Le module se charge donc paresseusement et,
 * s'il est absent, l'analyse bascule sur un mode dégradé — empreinte
 * cryptographique, dimensions lues dans les en-têtes, métadonnées EXIF — au
 * lieu d'échouer. Le rapport signale alors explicitement ce qui n'a pas pu
 * être calculé.
 *
 * Le module n'importe volontairement **aucune** dépendance Node au niveau
 * racine (`node:crypto` en particulier) : c'est cette pureté qui permet de
 * bundler tout le moteur dans une extension navigateur et de l'y exécuter,
 * sans serveur.
 */

type SharpModule = typeof import('sharp');

let sharpPromise: Promise<SharpModule | undefined> | undefined;

/** Charge `sharp` une seule fois ; retourne `undefined` s'il est indisponible. */
export async function loadSharp(): Promise<SharpModule | undefined> {
  if (!sharpPromise) {
    sharpPromise = import('sharp')
      .then((module) => (module.default ?? module) as SharpModule)
      .catch(() => undefined);
  }
  return sharpPromise;
}

export interface ImageProbe {
  sha256: string;
  bytes: number;
  width?: number;
  height?: number;
  format?: string;
  /** Empreinte perceptuelle 64 bits en hexadécimal (dHash). */
  perceptualHash?: string;
  /** Estimation du taux de compression : octets par pixel. */
  bytesPerPixel?: number;
  /** Score d'anomalie ELA, 0 à 1. */
  elaScore?: number;
  /** Proportion de la surface occupée par des zones parfaitement uniformes. */
  uniformRatio?: number;
  /** Bandes uniformes détectées sur les bords (recadrage / letterbox). */
  borderBands?: boolean;
  /** Vrai si l'analyse fine n'a pas pu être menée (sharp absent ou décodage impossible). */
  degraded: boolean;
  degradedReason?: string;
}

// Constantes de tour de SHA-256 (racines cubiques des 64 premiers premiers).
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/**
 * SHA-256 en JavaScript pur.
 *
 * Volontairement sans `node:crypto` ni `SubtleCrypto` : synchrone, identique en
 * Node et dans un navigateur, et donc bundlable dans l'extension. Vérifié
 * contre les vecteurs de référence (« abc », chaîne vide) par les tests.
 */
export function sha256(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const length = bytes.length;

  // Bourrage : un bit à 1, des zéros, puis la longueur sur 64 bits big-endian.
  const withOne = length + 1;
  const padZeros = (56 - (withOne % 64) + 64) % 64;
  const total = withOne + padZeros + 8;
  const message = new Uint8Array(total);
  message.set(bytes);
  message[length] = 0x80;

  const view = new DataView(message.buffer);
  const bitLength = length * 8;
  view.setUint32(total - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(total - 4, bitLength >>> 0);

  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const hex = (x: number): string => (x >>> 0).toString(16).padStart(8, '0');
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

/**
 * Extrait les dimensions depuis les en-têtes du fichier, sans décodeur.
 * Permet de conserver un minimum d'analyse quand `sharp` n'est pas disponible.
 */
export function readDimensionsFromHeader(
  buffer: Buffer,
): { width: number; height: number; format: string } | undefined {
  // PNG : signature 8 octets, puis IHDR avec largeur et hauteur en big-endian.
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
  }

  // GIF : dimensions en little-endian aux octets 6 à 9.
  if (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), format: 'gif' };
  }

  // JPEG : parcours des segments jusqu'au marqueur SOF.
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1]!;
      // SOF0 à SOF15, en excluant DHT (c4), DAC (c8) et DRI (cc).
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
          format: 'jpeg',
        };
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }

  // WebP : conteneur RIFF, bloc VP8X.
  if (
    buffer.length > 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      const width = 1 + (buffer.readUIntLE(24, 3) & 0xffffff);
      const height = 1 + (buffer.readUIntLE(27, 3) & 0xffffff);
      return { width, height, format: 'webp' };
    }
    return { width: 0, height: 0, format: 'webp' };
  }

  return undefined;
}

/** Taille de la grille utilisée pour le dHash : 8×8 bits comparés horizontalement. */
const HASH_SIZE = 8;
/** Côté de l'image de travail pour l'ELA et les statistiques de blocs. */
const WORK_SIZE = 256;
/** Côté d'un bloc d'analyse. */
const BLOCK = 16;

export async function probeImage(buffer: Buffer): Promise<ImageProbe> {
  const probe: ImageProbe = {
    sha256: sha256(buffer),
    bytes: buffer.length,
    degraded: true,
  };

  const header = readDimensionsFromHeader(buffer);
  if (header && header.width > 0) {
    probe.width = header.width;
    probe.height = header.height;
    probe.format = header.format;
    probe.bytesPerPixel = buffer.length / (header.width * header.height);
  }

  const sharp = await loadSharp();
  if (!sharp) {
    probe.degradedReason =
      "Le module d'analyse d'image n'est pas installé : seules les vérifications de base ont été effectuées.";
    return probe;
  }

  try {
    const image = sharp(buffer, { failOn: 'none' });
    const metadata = await image.metadata();
    if (metadata.width && metadata.height) {
      probe.width = metadata.width;
      probe.height = metadata.height;
      probe.bytesPerPixel = buffer.length / (metadata.width * metadata.height);
    }
    if (metadata.format) probe.format = metadata.format;

    probe.perceptualHash = await computeDHash(sharp, buffer);

    const analysis = await analyzeBlocks(sharp, buffer);
    probe.elaScore = analysis.elaScore;
    probe.uniformRatio = analysis.uniformRatio;
    probe.borderBands = analysis.borderBands;

    probe.degraded = false;
    return probe;
  } catch (error) {
    probe.degradedReason = `L'image n'a pas pu être décodée (${error instanceof Error ? error.message : 'erreur inconnue'}).`;
    return probe;
  }
}

/**
 * dHash : compare chaque pixel à son voisin de droite sur une vignette 9×8 en
 * niveaux de gris. Robuste au redimensionnement, à la recompression et aux
 * légers ajustements de luminosité — exactement les transformations que
 * subit une photo réutilisée d'une annonce à l'autre.
 */
async function computeDHash(sharp: SharpModule, buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer, { failOn: 'none' })
    .greyscale()
    .resize(HASH_SIZE + 1, HASH_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bits: number[] = [];
  for (let row = 0; row < HASH_SIZE; row++) {
    for (let col = 0; col < HASH_SIZE; col++) {
      const index = row * (HASH_SIZE + 1) + col;
      bits.push((data[index] ?? 0) > (data[index + 1] ?? 0) ? 1 : 0);
    }
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i]! << 3) | (bits[i + 1]! << 2) | (bits[i + 2]! << 1) | bits[i + 3]!;
    hex += nibble.toString(16);
  }
  return hex;
}

/**
 * Analyse par blocs.
 *
 * ELA (Error Level Analysis) : l'image est recompressée en JPEG à qualité
 * connue puis comparée à elle-même. Les zones ayant subi un traitement
 * différent du reste — collage, effacement, texte incrusté — se recompressent
 * différemment et ressortent comme des blocs à forte erreur relative.
 *
 * Cette méthode ne prouve rien à elle seule : un logo net sur fond lisse
 * produit le même effet qu'un montage. Elle est donc rapportée comme un
 * indice à vérifier, jamais comme une preuve.
 */
async function analyzeBlocks(
  sharp: SharpModule,
  buffer: Buffer,
): Promise<{ elaScore: number; uniformRatio: number; borderBands: boolean }> {
  const base = sharp(buffer, { failOn: 'none' })
    .greyscale()
    .resize(WORK_SIZE, WORK_SIZE, { fit: 'fill' });

  const original = await base.clone().raw().toBuffer();
  const recompressed = await base.clone().jpeg({ quality: 90 }).toBuffer();
  const decoded = await sharp(recompressed, { failOn: 'none' }).greyscale().raw().toBuffer();

  const blocksPerSide = Math.floor(WORK_SIZE / BLOCK);
  const blockErrors: number[] = [];
  const blockVariances: number[] = [];

  for (let by = 0; by < blocksPerSide; by++) {
    for (let bx = 0; bx < blocksPerSide; bx++) {
      let errorSum = 0;
      let sum = 0;
      let sumSquares = 0;
      let count = 0;

      for (let y = 0; y < BLOCK; y++) {
        for (let x = 0; x < BLOCK; x++) {
          const px = bx * BLOCK + x;
          const py = by * BLOCK + y;
          const index = py * WORK_SIZE + px;
          const a = original[index] ?? 0;
          const b = decoded[index] ?? 0;
          errorSum += Math.abs(a - b);
          sum += a;
          sumSquares += a * a;
          count += 1;
        }
      }

      blockErrors.push(errorSum / count);
      const mean = sum / count;
      blockVariances.push(sumSquares / count - mean * mean);
    }
  }

  // Score ELA : proportion de blocs dont l'erreur dépasse largement la médiane,
  // en ignorant les blocs plats où l'erreur est structurellement nulle.
  const sortedErrors = [...blockErrors].sort((a, b) => a - b);
  const medianError = sortedErrors[Math.floor(sortedErrors.length / 2)] ?? 0;
  const threshold = Math.max(medianError * 2.6, 3);
  const textured = blockErrors.filter((_, i) => (blockVariances[i] ?? 0) > 25);
  const anomalous = textured.filter((e) => e > threshold).length;
  const elaScore = textured.length > 0 ? anomalous / textured.length : 0;

  // Zones parfaitement uniformes : effacement au tampon, remplissage, fond ajouté.
  const uniformRatio =
    blockVariances.filter((v) => v < 1.5).length / Math.max(1, blockVariances.length);

  // Bandes uniformes sur les bords : recadrage destiné à retirer un filigrane.
  const edgeIndices: number[] = [];
  for (let i = 0; i < blocksPerSide; i++) {
    edgeIndices.push(i); // ligne du haut
    edgeIndices.push((blocksPerSide - 1) * blocksPerSide + i); // ligne du bas
    edgeIndices.push(i * blocksPerSide); // colonne de gauche
    edgeIndices.push(i * blocksPerSide + blocksPerSide - 1); // colonne de droite
  }
  const flatEdges = edgeIndices.filter((i) => (blockVariances[i] ?? 0) < 1).length;
  const borderBands = flatEdges / edgeIndices.length > 0.55;

  return { elaScore, uniformRatio, borderBands };
}

/** Distance de Hamming entre deux empreintes perceptuelles hexadécimales. */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    const x = Number.parseInt(a[i]!, 16) ^ Number.parseInt(b[i]!, 16);
    distance += POPCOUNT[x & 0xf]!;
  }
  return distance;
}

const POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Similarité perceptuelle 0–1.
 * Une distance de Hamming inférieure à 10 bits sur 64 correspond en pratique à
 * la même photo ayant subi un redimensionnement ou une recompression.
 */
export function perceptualSimilarity(a: string, b: string): number {
  const distance = hammingDistance(a, b);
  if (!Number.isFinite(distance)) return 0;
  return Math.max(0, 1 - distance / 64);
}

/** Seuil au-delà duquel deux images sont considérées comme la même photo. */
export const SAME_IMAGE_THRESHOLD = 0.86;

/** Construit les liens de recherche d'image inversée pour une URL publique. */
export function reverseSearchLinks(imageUrl: string): { engine: string; url: string }[] {
  const encoded = encodeURIComponent(imageUrl);
  return [
    { engine: 'Google Images', url: `https://lens.google.com/uploadbyurl?url=${encoded}` },
    {
      engine: 'Bing',
      url: `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${encoded}`,
    },
    { engine: 'Yandex', url: `https://yandex.com/images/search?rpt=imageview&url=${encoded}` },
    { engine: 'TinEye', url: `https://tineye.com/search?url=${encoded}` },
  ];
}
