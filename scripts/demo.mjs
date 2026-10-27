/**
 * Regenerates the README media in docs/media: an animated walkthrough
 * (demo.gif, needs ffmpeg on PATH) and screenshots of each theme.
 *
 *   npm run demo
 *
 * Uses the e2e build with recorded API responses, so no keys or quota are
 * needed and the results are always the same. The browser's own context menu
 * can't be recorded by automation, so the demo page draws a look-alike with the
 * same entries; everything after the click is the real extension.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'dist-e2e');
const media = path.join(root, 'docs', 'media');
const videoDir = path.join(root, '.cache', 'demo-video');
const DEMO_URL = 'http://4ntl.demo/';
const VIEWPORT = { width: 1000, height: 720 };

const fixture = async (name) =>
  JSON.parse(await readFile(path.join(root, 'tests', 'fixtures', name), 'utf8'));
const icon = (await readFile(path.join(root, 'public', 'icons', 'icon-16.png'))).toString('base64');

const ROUTES = [
  ['https://api.abuseipdb.com/', await fixture('abuseipdb/check.json')],
  ['https://www.virustotal.com/api/v3/ip_addresses/', await fixture('virustotal/ip.json')],
  ['https://www.virustotal.com/api/v3/files/', await fixture('virustotal/file.json')],
  ['https://www.virustotal.com/api/v3/urls/', await fixture('virustotal/url.json')],
];

const LOG_LINE =
  '2026-10-27 09:14:02 DENY src=10.0.0.5 dst=185.220.101.4 sha256=275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Incident 2026-1027</title>
<style>
  :root { color-scheme: light dark; --bg: light-dark(#ffffff, #0b0f17); --fg: light-dark(#1e293b, #e2e8f0);
    --muted: light-dark(#64748b, #94a3b8); --code: light-dark(#f1f5f9, #151b26); }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.65 'Segoe UI', system-ui, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 36px 24px; }
  .tlp { display: inline-block; font: 600 11px/1 system-ui; letter-spacing: .06em; padding: 4px 8px;
    border-radius: 4px; background: #f59e0b; color: #111; }
  h1 { font-size: 22px; margin: 10px 0 2px; } h2 { font-size: 15px; margin: 22px 0 6px; }
  .meta { color: var(--muted); margin: 0; font-size: 13px; }
  code, pre { font: 13px/1.6 Consolas, ui-monospace, monospace; background: var(--code); border-radius: 6px; }
  code { padding: 1px 5px; } pre { padding: 10px 12px; white-space: pre-wrap; word-break: break-all; }
  #menu, #sub, #lmenu, #pmenu { position: fixed; display: none; min-width: 230px; padding: 4px 0; background: #fff; color: #1f1f1f;
    border: 1px solid #d6d6d6; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,.18);
    font: 13px/1 'Segoe UI', system-ui; user-select: none; z-index: 2147483646; }
  .item { display: flex; align-items: center; gap: 8px; padding: 7px 14px 7px 12px; white-space: nowrap; }
  .item.on { background: #e8e8e8; } .item .ico { width: 16px; } .item .arrow { margin-left: auto; padding-left: 18px; }
  .sep { height: 1px; background: #e0e0e0; margin: 4px 0; }
  #cursor { position: fixed; left: 0; top: 0; width: 22px; height: 22px; pointer-events: none; z-index: 2147483647;
    transform: translate(-2px, -1px); }
</style></head><body>
<main>
  <span class="tlp">TLP:AMBER</span>
  <h1>Incident 2026-1027 · Suspicious outbound traffic</h1>
  <p class="meta">SOC analyst notes · workstation WS-0442</p>
  <h2>Summary</h2>
  <p>Shortly after a user opened an email attachment, WS-0442 connected to
     <code id="ip">185.220.101.4</code> on port 443. The dropper came from
     <a id="dl" href="http://malware.wicar.org/data/eicar.com">this download link</a> and was quarantined by EDR.</p>
  <h2>Firewall log</h2>
  <pre id="log">${LOG_LINE}</pre>
  <h2>Phishing email</h2>
  <p>The lure's button has no link at all: its address only appears when clicked.
     <button id="cta" style="font: 600 14px system-ui; padding: 8px 16px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; margin-left: 6px">Verify your account</button></p>
</main>
<div id="menu">
  <div class="item">Copy</div>
  <div class="item">Print…</div>
  <div class="sep"></div>
  <div class="item" id="ntl"><img class="ico" src="data:image/png;base64,${icon}"><span id="ntl-title"></span><span class="arrow">▸</span></div>
  <div class="sep"></div>
  <div class="item">Inspect</div>
</div>
<div id="pmenu" class="menu">
  <div class="item">Back</div>
  <div class="item">Reload</div>
  <div class="sep"></div>
  <div class="item" id="ntl-element"><img class="ico" src="data:image/png;base64,${icon}">4NTL: check what this opens</div>
  <div class="sep"></div>
  <div class="item">Inspect</div>
</div>
<div id="lmenu" class="menu">
  <div class="item">Open link in new tab</div>
  <div class="item">Copy link address</div>
  <div class="sep"></div>
  <div class="item" id="ntl-link"><img class="ico" src="data:image/png;base64,${icon}">4NTL: check this link</div>
  <div class="sep"></div>
  <div class="item">Inspect</div>
</div>
<div id="sub">
  <div class="item" data-scope="abuseipdb">AbuseIPDB</div>
  <div class="item" data-scope="virustotal">VirusTotal</div>
  <div class="sep"></div>
  <div class="item" data-scope="all">All providers</div>
</div>
<svg id="cursor" viewBox="0 0 22 22"><path d="M3 2l0 16 4.2-3.9 2.7 6.1 2.6-1.1-2.7-6 5.7-.3z" fill="#111" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>
<script>
  const menu = document.getElementById('menu'), sub = document.getElementById('sub'), lmenu = document.getElementById('lmenu'), pmenu = document.getElementById('pmenu');
  document.getElementById('cta').addEventListener('click', () => { location.href = 'https://evil.com/verify-account'; });
  const cursor = document.getElementById('cursor');
  addEventListener('mousemove', (e) => { cursor.style.left = e.clientX + 'px'; cursor.style.top = e.clientY + 'px'; }, true);
  for (const el of [menu, sub, lmenu, pmenu]) el.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
  for (const item of document.querySelectorAll('.item')) {
    item.addEventListener('mouseenter', () => {
      item.parentElement.querySelectorAll('.item').forEach((i) => i.classList.toggle('on', i === item));
      if (item.parentElement === menu) sub.style.display = item.id === 'ntl' ? 'block' : 'none';
    });
  }
  addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (e.target.closest('button')) { Object.assign(pmenu.style, { display: 'block', left: e.clientX + 'px', top: e.clientY + 'px' }); return; }
    if (e.target.closest('a')) { Object.assign(lmenu.style, { display: 'block', left: e.clientX + 'px', top: e.clientY + 'px' }); return; }
    const text = String(getSelection()).trim();
    document.getElementById('ntl-title').textContent = '4NTL: look up “' + (text.length > 24 ? text.slice(0, 24) + '…' : text) + '”';
    Object.assign(menu.style, { display: 'block', left: e.clientX + 'px', top: e.clientY + 'px' });
    const r = document.getElementById('ntl').getBoundingClientRect();
    const flip = r.right + 236 > innerWidth; // open the submenu leftwards near the edge
    Object.assign(sub.style, { left: (flip ? r.left - 234 : r.right - 2) + 'px', top: r.top - 5 + 'px' });
  });
  window.closeMenu = () => { menu.style.display = sub.style.display = lmenu.style.display = pmenu.style.display = 'none'; document.querySelectorAll('.on').forEach((i) => i.classList.remove('on')); };
</script></body></html>`;

/** Fake provider APIs inside the service worker, with latency so the loading state shows. */
async function installFakeApi(worker, delayMs) {
  await worker.evaluate(
    ([routes, delay]) => {
      globalThis.fetch = async (input) => {
        const url = String(input);
        const route = routes.find(([prefix]) => url.startsWith(prefix));
        await new Promise((resolve) => setTimeout(resolve, delay));
        return new Response(JSON.stringify(route ? route[1] : {}), {
          status: route ? 200 : 404,
          headers: { 'content-type': 'application/json' },
        });
      };
    },
    [ROUTES, delayMs],
  );
}

const setSettings = (worker, appearance) =>
  worker.evaluate(
    (value) =>
      chrome.storage.local.set({
        'settings.v1': {
          apiKeys: { virustotal: 'a'.repeat(64), abuseipdb: 'b'.repeat(80) },
          appearance: value,
        },
      }),
    appearance,
  );

const menuClick = (worker, selection, scope) =>
  worker.evaluate(
    ([url, text, which]) => globalThis.__4ntl.simulateMenuClick(url, text, which),
    [DEMO_URL, selection, scope],
  );

async function launch(record) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    viewport: VIEWPORT,
    deviceScaleFactor: record ? 1 : 2,
    ...(record ? { recordVideo: { dir: videoDir, size: VIEWPORT } } : {}),
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  await context.route(`${DEMO_URL}**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: PAGE }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // Close the settings tab opened on install.
  await context.waitForEvent('page', { timeout: 3000 }).catch(() => undefined);
  for (const page of context.pages()) if (page.url().includes('options.html')) await page.close();
  return { context, worker };
}

const pause = (page, ms) => page.waitForTimeout(ms);

async function glide(page, x, y, steps = 18) {
  await page.mouse.move(x, y, { steps });
}

/** Drag-selects an element's text, the way a person would. */
async function dragSelect(page, selector) {
  const box = await page.locator(selector).boundingBox();
  const y = box.y + Math.min(box.height / 2, 11);
  await glide(page, box.x - 1, y);
  await page.mouse.down();
  await glide(page, box.x + box.width - 2, box.y + box.height - 9, 24);
  await page.mouse.up();
  await page.locator(selector).selectText(); // normalise the exact range
}

/** Right-clicks a link and picks "4NTL: check this link". */
/** Right-clicks a JavaScript-only button, picks "check what this opens", then clicks it. */
async function useButtonCapture(page, worker, selector) {
  const button = page.locator(selector);
  const box = await button.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await glide(page, x, y, 24);
  await pause(page, 300);
  await page.mouse.click(x, y, { button: 'right' });
  await pause(page, 500);
  const entry = await page.locator('#ntl-element').boundingBox();
  await glide(page, entry.x + 60, entry.y + entry.height / 2, 14);
  await pause(page, 450);
  await page.evaluate(() => window.closeMenu());
  await worker.evaluate((url) => globalThis.__4ntl.simulateElementClick(url), DEMO_URL);
  await pause(page, 2200); // read "Click it to check where it goes"
  await glide(page, x, y, 20);
  await pause(page, 300);
  await page.mouse.click(x, y);
}

async function useLinkMenu(page, worker, selector) {
  const link = page.locator(selector);
  const box = await link.boundingBox();
  const href = await link.evaluate((a) => a.href);
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, 22);
  await pause(page, 300);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await pause(page, 500);
  const entry = await page.locator('#ntl-link').boundingBox();
  await glide(page, entry.x + 60, entry.y + entry.height / 2, 14);
  await pause(page, 450);
  await page.evaluate(() => window.closeMenu());
  await worker.evaluate(
    ([url, l]) => globalThis.__4ntl.simulateLinkClick(url, l),
    [DEMO_URL, href],
  );
}

async function useMenu(page, worker, selection, scope) {
  const { x, y } = await page.evaluate(() => {
    const r = getSelection().getRangeAt(0).getBoundingClientRect();
    return { x: r.right - 30, y: r.bottom - 6 };
  });
  await glide(page, x, y, 10);
  await page.mouse.click(x, y, { button: 'right' });
  await pause(page, 500);
  const entry = await page.locator('#ntl').boundingBox();
  await glide(page, entry.x + 40, entry.y + entry.height / 2, 12);
  await pause(page, 450);
  const target = await page.locator(`#sub [data-scope="${scope}"]`).boundingBox();
  await glide(page, target.x + 10, entry.y + entry.height / 2, 8);
  await glide(page, target.x + 30, target.y + target.height / 2, 10);
  await pause(page, 350);
  await page.evaluate(() => window.closeMenu());
  await menuClick(worker, selection, scope);
}

async function recordWalkthrough() {
  await rm(videoDir, { recursive: true, force: true });
  const { context, worker } = await launch(true);
  await setSettings(worker, { theme: 'sharingan', accent: '' });
  await installFakeApi(worker, 1100);
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(DEMO_URL);
  await page.mouse.move(520, 120);
  const sceneStart = Date.now();

  await pause(page, 700);
  await dragSelect(page, '#ip');
  await pause(page, 400);
  await useMenu(page, worker, '185.220.101.4', 'all');
  await pause(page, 3600);
  const link = page.locator('x-4ntl-card [data-provider="virustotal"] .link');
  const linkBox = await link.boundingBox();
  await glide(page, linkBox.x + 20, linkBox.y + 8, 20);
  await pause(page, 900);
  await page.keyboard.press('Escape');
  await pause(page, 600);

  await dragSelect(page, '#log');
  await pause(page, 400);
  await useMenu(page, worker, LOG_LINE, 'all');
  await pause(page, 1300);
  const choice = page.locator('x-4ntl-card .choice').nth(2);
  const choiceBox = await choice.boundingBox();
  await glide(page, choiceBox.x + 60, choiceBox.y + choiceBox.height / 2, 20);
  await pause(page, 300);
  await choice.click();
  await pause(page, 3000);
  await page.keyboard.press('Escape');
  await pause(page, 500);

  await useLinkMenu(page, worker, '#dl');
  await pause(page, 3000);
  await page.keyboard.press('Escape');
  await pause(page, 500);

  await useButtonCapture(page, worker, '#cta');
  await pause(page, 3400);

  const sceneSeconds = (Date.now() - sceneStart) / 1000;
  await page.close();
  await context.close();
  // The recording starts with the page, before the scene: keep only the scene.
  const video = await page.video().path();
  const duration = Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      video,
    ]),
  );
  return { video, start: Math.max(0, duration - sceneSeconds) };
}

function toGif(video, start, output) {
  const filters =
    'fps=12,scale=820:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=200[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle';
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    start.toFixed(2),
    '-i',
    video,
    '-vf',
    filters,
    '-loop',
    '0',
    output,
  ]);
}

async function screenshots() {
  const { context, worker } = await launch(false);
  await installFakeApi(worker, 0);
  const page = context.pages()[0] ?? (await context.newPage());
  const card = page.locator('x-4ntl-card .card');
  const shots = [
    ['card-light.png', 'light', { theme: 'light', accent: '' }],
    ['card-dark.png', 'dark', { theme: 'dark', accent: '' }],
    ['card-sharingan.png', 'dark', { theme: 'sharingan', accent: '' }],
    ['card-sharingan-violet.png', 'dark', { theme: 'sharingan', accent: '#8b5cf6' }],
  ];
  for (const [file, scheme, appearance] of shots) {
    await setSettings(worker, appearance);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(DEMO_URL);
    await page.locator('#ip').selectText();
    await menuClick(worker, '185.220.101.4', 'all');
    await card.locator('[data-provider="virustotal"][data-verdict]').waitFor();
    await pause(page, 300);
    await card.screenshot({ path: path.join(media, file) });
    await page.keyboard.press('Escape');
  }

  await setSettings(worker, { theme: 'sharingan', accent: '' });
  await page.goto(DEMO_URL);
  await page.locator('#log').selectText();
  await menuClick(worker, LOG_LINE, 'all');
  await card.locator('.choice').first().waitFor();
  await pause(page, 300);
  await card.screenshot({ path: path.join(media, 'card-choose.png') });

  const options = await context.newPage();
  await options.setViewportSize({ width: 820, height: 1400 });
  await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`);
  await options.locator('#preview [data-verdict]').first().waitFor();
  await options.locator('section[aria-labelledby="look-title"]').screenshot({
    path: path.join(media, 'settings-appearance.png'),
  });
  await context.close();
}

await mkdir(media, { recursive: true });
await screenshots();
console.log('Screenshots written to docs/media.');
const { video, start } = await recordWalkthrough();
try {
  toGif(video, start, path.join(media, 'demo.gif'));
  console.log('Walkthrough written to docs/media/demo.gif.');
} catch (error) {
  console.warn(`Skipped demo.gif (ffmpeg needed on PATH): ${error.message}`);
}
