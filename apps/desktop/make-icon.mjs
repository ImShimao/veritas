// @ts-check
/**
 * Génère l'icône de l'application (bouclier blanc sur fond accent).
 *
 * Produit un PNG 512×512 sans dépendance externe. electron-builder le convertit
 * automatiquement en .ico (Windows) et .icns (macOS) lors de l'empaquetage.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 512;
const ACCENT = [59, 92, 246];
const WHITE = [246, 248, 252];

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
const cx = SIZE / 2;

for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0; // octet de filtre PNG (aucun)
  for (let x = 0; x < SIZE; x++) {
    // Silhouette de bouclier : arc en haut, pointe arrondie en bas.
    const nx = (x - cx) / (SIZE * 0.32);
    const topY = (y - SIZE * 0.42) / (SIZE * 0.34);
    const inTop = nx * nx + topY * topY < 1 && y < SIZE * 0.56;
    const taper = 1 - (y - SIZE * 0.5) / (SIZE * 0.42);
    const inBottom = y >= SIZE * 0.5 && Math.abs(nx) < taper && y < SIZE * 0.86;
    const inside = (inTop || inBottom) && y > SIZE * 0.16;

    // Coche centrale, en creux dans le bouclier.
    const checkX = (x - SIZE * 0.44) / SIZE;
    const checkY = (y - SIZE * 0.5) / SIZE;
    const onCheck =
      inside &&
      ((checkX > -0.09 && checkX < -0.02 && checkY > checkX + 0.02 && checkY < checkX + 0.09) ||
        (checkX >= -0.02 && checkX < 0.12 && checkY > -checkX - 0.02 && checkY < -checkX + 0.05));

    const color = !inside ? ACCENT : onCheck ? ACCENT : WHITE;
    const o = y * (SIZE * 4 + 1) + 1 + x * 4;
    raw[o] = color[0];
    raw[o + 1] = color[1];
    raw[o + 2] = color[2];
    raw[o + 3] = inside || true ? 255 : 0;
  }
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // profondeur 8 bits
ihdr[9] = 6; // RGBA
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), 'build', 'icon.png');
writeFileSync(out, png);
console.log(`Icône générée : ${out} (${SIZE}×${SIZE})`);
