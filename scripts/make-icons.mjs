/**
 * Renders the extension icons (a Sharingan eye) to public/icons/*.png by
 * drawing an SVG in Chromium, so the logo matches the eye in the card.
 *
 *   npm run icons
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZES = [16, 32, 48, 128];
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

/** Same tomoe as sharinganEye() in src/ui/dom.ts. */
const TOMOE = 'M12 4.3a1.7 1.7 0 1 1-1.3 2.8C9.6 6 9.3 4.9 8.4 4.4c1.2-.5 2.4-.4 3.6-.1z';

function eye(size) {
  const small = size < 32;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">
  <defs>
    <radialGradient id="iris" cx="45%" cy="40%" r="65%">
      <stop offset="0" stop-color="#ff5a66"/><stop offset=".55" stop-color="#e3101f"/><stop offset="1" stop-color="#8a0710"/>
    </radialGradient>
  </defs>
  <circle cx="12" cy="12" r="11.2" fill="#0a0506"/>
  <circle cx="12" cy="12" r="${small ? 9.6 : 10}" fill="url(#iris)"/>
  ${small ? '' : '<circle cx="12" cy="12" r="6" fill="none" stroke="rgba(10,5,6,.6)" stroke-width=".7"/>'}
  ${[0, 120, 240]
    .map(
      (a) =>
        `<path d="${TOMOE}" fill="#0a0506" transform="rotate(${a} 12 12)${small ? ' translate(0 -.2)' : ''}"/>`,
    )
    .join('')}
  <circle cx="12" cy="12" r="${small ? 2.6 : 2.3}" fill="#0a0506"/>
  ${small ? '' : '<ellipse cx="9" cy="8.2" rx="2.2" ry="1.1" fill="rgba(255,255,255,.28)" transform="rotate(-30 9 8.2)"/>'}
</svg>`;
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium' });
for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${eye(size)}</body>`);
  await page.locator('svg').screenshot({
    path: path.join(outDir, `icon-${size}.png`),
    omitBackground: true,
  });
  await page.close();
}
await browser.close();
console.log(`Wrote ${SIZES.length} icons to ${path.relative(process.cwd(), outDir)}`);
