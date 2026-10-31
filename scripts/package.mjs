/**
 * Zips a build folder: dist/ → 4ntl-v<version>.zip, dist-firefox/ →
 * 4ntl-firefox-v<version>.zip (the free GitHub edition), dist-store/ →
 * 4ntl-store-v<version>.zip and dist-store-firefox/ → 4ntl-store-firefox-v<version>.zip
 * (the paid store edition). Dependency-free (deflate via node:zlib).
 *
 *   node scripts/package.mjs [dist-firefox | dist-store | dist-store-firefox]
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = process.argv[2] ?? 'dist';
if (!/^dist(-store)?(-firefox)?$/.test(folder)) throw new Error(`not a release folder: ${folder}`);
const dist = path.join(root, folder);
const { version } = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
const output = path.join(root, `${folder.replace(/^dist/, '4ntl')}-v${version}.zip`);

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

// Fixed timestamp (1980-01-01) keeps archives reproducible.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const entries = (await readdir(dist, { withFileTypes: true, recursive: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(entry.parentPath, entry.name))
  .sort();

const locals = [];
const centrals = [];
let offset = 0;

for (const file of entries) {
  const name = Buffer.from(path.relative(dist, file).replaceAll('\\', '/'), 'utf8');
  const data = await readFile(file);
  const compressed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + compressed.length;
}

const centralSize = centrals.reduce((sum, buffer) => sum + buffer.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

await writeFile(output, Buffer.concat([...locals, ...centrals, end]));
console.log(`Packaged ${entries.length} files into ${path.relative(root, output)}`);
