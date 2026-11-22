/**
 * Renders the extension icons to public/icons/*.png by drawing an SVG in
 * Chromium, so the logo matches the eye in the card. The logo: a Mangekyo of
 * three crescent blades that grow out of the ring and curl into needle tails
 * around the pupil, sealed inside a band of hieroglyphs. Below 48 px the
 * glyphs would only blur, so they're left out; at 16 px the band goes too, so
 * the Mangekyo can fill the eye.
 *
 *   npm run icons
 *   node scripts/make-icons.mjs <dir> <size>…         (previews, e.g. a 512 px one)
 *   node scripts/make-icons.mjs <dir> --svg <size>…   (the vector logo, e.g. for D:\SS\4N-HQ)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [dirArg, ...rest] = process.argv.slice(2);
const svgOnly = rest.includes('--svg');
const sizeArgs = rest.filter((arg) => arg !== '--svg');
const SIZES = sizeArgs.length > 0 ? sizeArgs.map(Number) : [16, 32, 48, 128];
const outDir =
  dirArg ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BLACK = '#0a0506';
const RED = '#e3101f';
/** Same shapes as sharinganEye() in src/ui/dom.ts. */
const BLADE =
  'M4.24 11.18C4.17 11.16 4.25 10.07 4.34 9.51C4.44 8.96 4.60 8.39 4.81 7.85C5.02 7.31 5.29 6.77 5.61 6.25C5.93 5.72 6.29 5.21 6.71 4.72C7.13 4.23 7.60 3.74 8.14 3.32C8.67 2.90 9.46 2.50 9.92 2.22C10.38 1.94 10.57 1.81 10.91 1.66C11.26 1.50 11.45 1.32 12.00 1.30C12.55 1.28 13.70 1.38 14.22 1.53C14.75 1.69 14.93 1.88 15.17 2.25C15.41 2.63 15.52 3.31 15.66 3.78C15.80 4.25 15.95 4.61 16.00 5.07C16.05 5.53 15.99 6.10 15.97 6.54C15.94 6.98 15.89 7.37 15.85 7.73C15.81 8.08 15.78 8.36 15.72 8.65C15.65 8.95 15.52 9.26 15.44 9.50C15.36 9.75 15.30 9.94 15.25 10.13C15.20 10.31 15.19 10.45 15.15 10.60C15.11 10.75 15.06 10.89 15.00 11.03C14.93 11.16 14.81 11.30 14.74 11.42C14.67 11.53 14.64 11.59 14.59 11.73C14.54 11.87 14.49 12.10 14.44 12.26C14.38 12.41 14.32 12.55 14.26 12.65C14.20 12.75 14.10 12.89 14.09 12.84C14.07 12.80 14.15 12.56 14.17 12.38C14.18 12.20 14.18 11.95 14.19 11.77C14.20 11.59 14.22 11.45 14.23 11.27C14.25 11.10 14.26 10.90 14.25 10.70C14.24 10.50 14.17 10.24 14.16 10.06C14.14 9.88 14.16 9.76 14.14 9.62C14.12 9.48 14.07 9.35 14.03 9.21C13.98 9.06 13.93 8.93 13.88 8.75C13.82 8.58 13.78 8.37 13.71 8.16C13.64 7.96 13.56 7.75 13.45 7.53C13.35 7.31 13.23 7.11 13.09 6.86C12.95 6.62 12.81 6.29 12.63 6.03C12.45 5.77 12.23 5.47 12.00 5.30C11.77 5.13 11.52 5.10 11.27 5.04C11.02 4.98 10.87 4.90 10.50 4.96C10.13 5.01 9.53 5.20 9.05 5.38C8.58 5.55 8.08 5.74 7.65 6.01C7.22 6.29 6.82 6.64 6.46 7.01C6.11 7.39 5.79 7.81 5.50 8.25C5.22 8.69 4.98 9.16 4.77 9.65C4.56 10.14 4.31 11.21 4.24 11.18Z';
/** Hieroglyphs drawn at the top of the band (ankh, eye, water, sun, djed, feather, shen, reed). */
const GLYPHS = [
  '<ellipse cx="12" cy="2.85" rx=".4" ry=".5"/><path d="M11.4 3.55H12.6M12 3.35V4.4"/>',
  '<path d="M11.2 3.5C11.6 3 12.4 3 12.8 3.5 12.4 4 11.6 4 11.2 3.5Z"/><circle cx="12" cy="3.5" r=".15" fill="currentColor"/>',
  '<path d="M11.3 3.1 11.65 3.6 12 3.1 12.35 3.6 12.7 3.1M11.3 3.8 11.65 4.3 12 3.8 12.35 4.3 12.7 3.8"/>',
  '<circle cx="12" cy="3.55" r=".55"/><circle cx="12" cy="3.55" r=".12" fill="currentColor"/>',
  '<path d="M12 2.8V4.4M11.5 3.1H12.5M11.5 3.5H12.5M11.5 3.9H12.5"/>',
  '<path d="M11.8 4.4C11.7 3.6 11.8 3 12.1 2.8 12.4 2.7 12.6 3 12.4 3.1"/>',
  '<circle cx="12" cy="3.35" r=".45"/><path d="M11.5 4.05H12.5"/>',
  '<path d="M12 4.4V2.8M12 3.3C12.4 3.1 12.6 2.8 12.6 2.6"/>',
];

function logo(size) {
  const detailed = size >= 48;
  const tiny = size < 32;
  const glyphs = detailed
    ? `<g color="${RED}" stroke="currentColor" stroke-width=".32" fill="none" stroke-linecap="round">${GLYPHS.map(
        (glyph, i) => `<g transform="rotate(${i * 45} 12 12)">${glyph}</g>`,
      ).join('')}</g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
  <defs>
    <radialGradient id="iris" cx="45%" cy="40%" r="65%">
      <stop offset="0" stop-color="#ff5a66"/><stop offset=".55" stop-color="${RED}"/><stop offset="1" stop-color="#8a0710"/>
    </radialGradient>
  </defs>
  <circle cx="12" cy="12" r="11.5" fill="${BLACK}"/>
  <circle cx="12" cy="12" r="10.2" fill="url(#iris)"/>
  ${tiny ? '' : `<circle cx="12" cy="12" r="8.55" fill="none" stroke="${BLACK}" stroke-width="2.3"/>`}
  ${glyphs}
  ${detailed ? '<ellipse cx="8.6" cy="7.6" rx="2.4" ry="1" fill="rgba(255,255,255,.16)" transform="rotate(-38 8.6 7.6)"/>' : ''}
  <g transform="translate(12 12) scale(${tiny ? 1 : 0.69}) translate(-12 -12)" fill="${BLACK}">
    ${[-18, 102, 222].map((angle) => `<path d="${BLADE}" transform="rotate(${angle} 12 12)"/>`).join('')}
    <circle cx="12" cy="12" r="1.6"/>
  </g>
</svg>`;
}

await mkdir(outDir, { recursive: true });
if (svgOnly) {
  for (const size of SIZES)
    await writeFile(
      path.join(outDir, `icon-${size}.svg`),
      `${logo(size)}
`,
    );
  console.log(`Wrote ${SIZES.length} SVG logos to ${outDir}`);
  process.exit(0);
}
const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ channel: 'chromium' });
for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${logo(size)}</body>`);
  await page.locator('svg').screenshot({
    path: path.join(outDir, `icon-${size}.png`),
    omitBackground: true,
  });
  await page.close();
}
await browser.close();
console.log(`Wrote ${SIZES.length} icons to ${path.relative(process.cwd(), outDir)}`);
