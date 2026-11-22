/**
 * Renders the extension icons to public/icons/*.png by drawing an SVG in
 * Chromium, so the logo matches the eye in the card. The logo: a Mangekyo
 * (three curved blades, three long points, a red ring) sealed inside a band
 * of hieroglyphs. Below 48 px the glyphs would only blur, so they're left out;
 * at 16 px the band goes too, so the Mangekyo can fill the eye.
 *
 *   npm run icons
 *   node scripts/make-icons.mjs <dir> <size>…   (previews, e.g. a 512 px one)
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [dirArg, ...sizeArgs] = process.argv.slice(2);
const SIZES = sizeArgs.length > 0 ? sizeArgs.map(Number) : [16, 32, 48, 128];
const outDir =
  dirArg ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BLACK = '#0a0506';
const RED = '#e3101f';
/** Same shapes as sharinganEye() in src/ui/dom.ts. */
const BLADE = 'M8.80 10.15C6.91 6.91 10.47 3.33 19.20 5.96C13.58 4.57 13.92 6.74 13.74 8.73Z';
const POINT = 'M14.17 9.01Q16.42 7.10 19.97 7.02Q16.98 7.67 14.92 9.72Z';
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

const rotated = (shape, count, offset = 0) =>
  Array.from(
    { length: count },
    (_, i) => `<g transform="rotate(${offset + (i * 360) / count} 12 12)">${shape}</g>`,
  ).join('');

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
  <g transform="translate(12 12) scale(${tiny ? 1 : detailed ? 0.74 : 0.78}) translate(-12 -12)" fill="${BLACK}">
    ${rotated(`<path d="${BLADE}"/><path d="${POINT}"/>`, 3)}
    <circle cx="12" cy="12" r="3.9"/>
    <circle cx="12" cy="12" r="2.75" fill="none" stroke="${RED}" stroke-width="${detailed ? 0.55 : 0.75}"/>
    <circle cx="12" cy="12" r="1.5"/>
  </g>
  ${detailed ? '<ellipse cx="8.6" cy="7.6" rx="2.4" ry="1" fill="rgba(255,255,255,.16)" transform="rotate(-38 8.6 7.6)"/>' : ''}
</svg>`;
}

await mkdir(outDir, { recursive: true });
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
