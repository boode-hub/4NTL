/**
 * Renders the extension icons (a reticle on a dark tile) to public/icons/*.png.
 * Dependency-free: shapes are signed-distance functions, anti-aliased by
 * supersampling, and encoded with node:zlib. Run with `npm run icons`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 32, 48, 128];
const SUPERSAMPLE = 6;
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const TILE_TOP = [15, 30, 56];
const TILE_BOTTOM = [9, 16, 32];
const RING = [56, 189, 248];
const DOT = [249, 115, 22];

const sdRoundedSquare = (x, y, half, radius) => {
  const qx = Math.abs(x) - half + radius;
  const qy = Math.abs(y) - half + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};
const sdBox = (x, y, hw, hh) => Math.max(Math.abs(x) - hw, Math.abs(y) - hh);

/** Colour of the icon at (x, y) in [-0.5, 0.5]², or null when transparent. */
function sample(x, y, size) {
  if (sdRoundedSquare(x, y, 0.47, 0.2) > 0) return null;
  const t = y + 0.5;
  let colour = TILE_TOP.map((c, i) => c + (TILE_BOTTOM[i] - c) * t);

  const small = size < 32;
  const ringRadius = small ? 0.25 : 0.24;
  const ringWidth = small ? 0.11 : 0.065;
  const r = Math.hypot(x, y);
  const onRing = Math.abs(r - ringRadius) <= ringWidth / 2;
  const tickHalfWidth = 0.032;
  const onTick =
    !small &&
    [
      sdBox(x, y - 0.33, tickHalfWidth, 0.07),
      sdBox(x, y + 0.33, tickHalfWidth, 0.07),
      sdBox(x - 0.33, y, 0.07, tickHalfWidth),
      sdBox(x + 0.33, y, 0.07, tickHalfWidth),
    ].some((d) => d <= 0);
  if (onRing || onTick) colour = RING;
  if (r <= (small ? 0.09 : 0.075)) colour = DOT;
  return colour;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLE) / size - 0.5;
          const y = (py + (sy + 0.5) / SUPERSAMPLE) / size - 0.5;
          const colour = sample(x, y, size);
          if (!colour) continue;
          red += colour[0];
          green += colour[1];
          blue += colour[2];
          alpha++;
        }
      }
      const offset = (py * size + px) * 4;
      if (alpha > 0) {
        pixels[offset] = Math.round(red / alpha);
        pixels[offset + 1] = Math.round(green / alpha);
        pixels[offset + 2] = Math.round(blue / alpha);
      }
      pixels[offset + 3] = Math.round((alpha / SUPERSAMPLE ** 2) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  await writeFile(path.join(outDir, `icon-${size}.png`), encodePng(size, render(size)));
}
console.log(`Wrote ${SIZES.length} icons to ${path.relative(process.cwd(), outDir)}`);
