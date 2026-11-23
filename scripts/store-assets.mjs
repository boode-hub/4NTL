/**
 * Generates the Chrome Web Store images in docs/store: five 1280×800
 * screenshots of the real extension (e2e build, recorded API responses) and
 * the 440×280 / 1400×560 promo tiles. The logo is drawn at each size it's
 * shown at (scripts/make-icons.mjs → .cache/store-logo), so it stays sharp.
 *
 *   npm run store
 */
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'dist-e2e');
const out = path.join(root, 'docs', 'store');
const URL_BASE = 'http://4ntl.demo/';
const SIZE = { width: 1280, height: 800 };

const fixture = async (name) =>
  JSON.parse(await readFile(path.join(root, 'tests', 'fixtures', name), 'utf8'));
const logo = async (size) =>
  (await readFile(path.join(root, '.cache', 'store-logo', `icon-${size}.png`))).toString('base64');
const icon = await logo(48);
const pngData = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
const ROUTES = [
  ['https://api.abuseipdb.com/', await fixture('abuseipdb/check.json')],
  ['https://www.virustotal.com/api/v3/ip_addresses/', await fixture('virustotal/ip.json')],
  ['https://www.virustotal.com/api/v3/files/', await fixture('virustotal/file.json')],
  ['https://www.virustotal.com/api/v3/urls/', await fixture('virustotal/url.json')],
];
const LOG =
  '2026-10-27 09:14:02 DENY src=10.0.0.5 dst=185.220.101.4 sha256=275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f';

/** A page with a caption band on top (what the screenshot shows) and an incident report. */
/**
 * The browser's own right-click menu can't be captured, so the "type it in"
 * screenshot draws a look-alike (dark Chrome style) with 4NTL's submenu open.
 */
const MENU = `<div class="cm" style="left:150px;top:330px">
    <div class="it">Back</div><div class="it">Forward</div><div class="it">Reload</div><div class="sp"></div>
    <div class="it on"><img src="data:image/png;base64,${icon}" alt="">4NTL<span class="ar">▸</span></div><div class="sp"></div>
    <div class="it">Save as…</div><div class="it">Print…</div><div class="sp"></div><div class="it">Inspect</div></div>
  <div class="cm" style="left:392px;top:430px">
    <div class="it on">Type an IP or domain…</div></div>
  <svg class="cursor" style="left:560px;top:450px" viewBox="0 0 22 22"><path d="M3 2l0 16 4.2-3.9 2.7 6.1 2.6-1.1-2.7-6 5.7-.3z" fill="#111" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

const page = (
  caption,
  dark,
  popup = '',
  menu = false,
) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; font: 17px/1.65 'Segoe UI', system-ui, sans-serif;
    background: ${dark ? '#0b0f17' : '#ffffff'}; color: ${dark ? '#e2e8f0' : '#1e293b'}; }
  .band { background: #0d0a0b; color: #fff; padding: 22px 48px; display: flex; align-items: center; gap: 18px;
    font: 600 26px/1.3 'Segoe UI', system-ui; border-bottom: 3px solid #ff2d3d; }
  .band img { width: 44px; height: 44px; }
  main { max-width: 900px; margin: 0 auto; padding: 26px 48px; }
  h1 { font-size: 26px; margin: 6px 0 2px; } h2 { font-size: 18px; margin: 20px 0 6px; }
  .meta { color: #64748b; margin: 0; font-size: 15px; }
  .tlp { display: inline-block; font: 600 12px/1 system-ui; padding: 5px 9px; border-radius: 4px; background: #f59e0b; color: #111; }
  code, pre { font: 15px/1.6 Consolas, ui-monospace, monospace; background: ${dark ? '#151b26' : '#f1f5f9'}; border-radius: 6px; }
  code { padding: 1px 6px; } pre { padding: 12px 14px; white-space: pre-wrap; word-break: break-all; }
  a { color: #2563eb; }
  button { font: 600 15px system-ui; padding: 9px 18px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; }
  .toolbar { display: flex; align-items: center; gap: 14px; padding: 8px 16px; background: #202124; }
  .address { flex: 1; background: #303134; color: #bdc1c6; border-radius: 16px; padding: 6px 16px; font: 15px system-ui; }
  .ext { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; }
  .ext.on { background: #3c4043; outline: 2px solid #ff2d3d; }
  .ext img { width: 20px; height: 20px; }
  .popup { position: absolute; right: 12px; top: 136px; width: 380px; border-radius: 10px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, .6); border: 1px solid #3c4043; background: #0d0a0b; z-index: 2; }
  .dim { opacity: .45; }
  .cm { position: absolute; z-index: 3; min-width: 230px; padding: 6px 0; border-radius: 8px; background: #292a2d;
    color: #e8eaed; font: 15px/1 'Segoe UI', system-ui; box-shadow: 0 8px 24px rgba(0, 0, 0, .55); border: 1px solid #3c4043; }
  .cm .it { display: flex; align-items: center; gap: 10px; padding: 9px 18px; white-space: nowrap; }
  .cm .it.on { background: #3c4043; } .cm .it img { width: 18px; height: 18px; } .cm .ar { margin-left: auto; padding-left: 24px; }
  .cm .sp { height: 1px; background: #3c4043; margin: 5px 0; }
  .cursor { position: absolute; z-index: 4; width: 24px; height: 24px; }
</style></head><body>
  <div class="band"><img src="data:image/png;base64,${icon}" alt="">${caption}</div>
  ${popup ? `<div class="toolbar"><div class="address">4ntl.demo/incident-2026-1027</div><span class="ext"><img src="data:image/png;base64,${icon}" alt="" style="opacity:.35;filter:grayscale(1)"></span><span class="ext on"><img src="data:image/png;base64,${icon}" alt=""></span></div><img class="popup" src="${popup}" alt="">` : ''}
  ${menu ? MENU : ''}
  <main class="${popup ? 'dim' : ''}">
    <span class="tlp">TLP:AMBER</span>
    <h1>Incident 2026-1027 · Suspicious outbound traffic</h1>
    <p class="meta">SOC analyst notes · workstation WS-0442</p>
    <h2>Summary</h2>
    <p>Shortly after a user opened an email attachment, WS-0442 connected to
      <code id="ip">185.220.101.4</code> on port 443. The dropper came from
      <a id="dl" href="http://malware.wicar.org/data/eicar.com">this download link</a>.</p>
    <h2>Firewall log</h2>
    <pre id="log">${LOG}</pre>
    <h2>Phishing email</h2>
    <p>The lure's button has no link at all: <button id="cta">Verify your account</button></p>
  </main>
  <script>document.getElementById('cta').addEventListener('click', () => { location.href = 'https://evil.com/verify-account'; });</script>
</body></html>`;

const scenes = [
  [
    'screenshot-1.png',
    'Right-click any IP, hash, domain or URL: verdicts appear next to your cursor',
    true,
  ],
  [
    'screenshot-2.png',
    'Click the 4NTL icon, type or paste any IP, domain or hash, press Enter',
    true,
  ],
  [
    'screenshot-4.png',
    'Copy the indicator, a picture of the card, or the details; save it to your list',
    false,
  ],
  [
    'screenshot-6.png',
    'Nothing to select? Right-click, 4NTL, Type an IP or domain… and paste it',
    true,
  ],
  ['screenshot-7.png', 'Or click the 4NTL icon: type or paste an IP, domain or hash', true],
];

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: SIZE,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const bodies = new Map(
  scenes.map(([file, caption, dark]) => [
    `${URL_BASE}${file}`,
    page(caption, dark, '', file === 'screenshot-6.png'),
  ]),
);
await context.route(`${URL_BASE}**`, (route) =>
  route.fulfill({ contentType: 'text/html', body: bodies.get(route.request().url()) ?? '' }),
);
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
await context.waitForEvent('page', { timeout: 3000 }).catch(() => undefined);
for (const open of context.pages()) if (open.url().includes('options.html')) await open.close();

await worker.evaluate((routes) => {
  globalThis.fetch = async (input) => {
    const route = routes.find(([prefix]) => String(input).startsWith(prefix));
    return new Response(JSON.stringify(route ? route[1] : {}), {
      status: route ? 200 : 404,
      headers: { 'content-type': 'application/json' },
    });
  };
}, ROUTES);
const settings = (theme) =>
  worker.evaluate(
    (t) =>
      chrome.storage.local.set({
        'settings.v1': {
          apiKeys: { virustotal: 'a'.repeat(64), abuseipdb: 'b'.repeat(80) },
          appearance: { theme: t, accent: '', background: '' },
        },
      }),
    theme,
  );
const hook = (name, ...args) =>
  worker.evaluate(([fn, params]) => globalThis.__4ntl[fn](...params), [name, args]);

const tab = context.pages()[0] ?? (await context.newPage());
const card = tab.locator('x-4ntl-card .card');
const settle = () => tab.waitForTimeout(400);
const rightClickOn = async (selector) => {
  const box = await tab.locator(selector).boundingBox();
  await tab.mouse.click(box.x + box.width - 4, box.y + box.height / 2, { button: 'right' });
};

await mkdir(out, { recursive: true });
/** The result card from the first screenshot, reused on the marquee tile. */
let cardShot = '';
for (const [file, , dark] of scenes) {
  const url = `${URL_BASE}${file}`;
  await settings(dark ? 'sharingan' : 'light');
  await tab.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  await tab.goto(url);
  // Inject the UI once so later right-clicks place the card at the pointer.
  await hook('simulateMenuClick', url, '8.8.8.8', 'virustotal');
  await tab.keyboard.press('Escape');

  if (file === 'screenshot-2.png' || file === 'screenshot-7.png') {
    // The toolbar popup is the real popup page, pictured under a drawn browser toolbar:
    // with results (2), or while the indicator is being typed (7).
    const typing = file === 'screenshot-7.png';
    const popup = await context.newPage();
    await popup.emulateMedia({ colorScheme: 'dark' });
    await popup.setViewportSize({ width: 380, height: 600 });
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/result.html`);
    await popup
      .locator('x-4ntl-card .ask-input')
      .pressSequentially(typing ? 'evil-login-verify[.]com' : '185.220.101.4');
    if (!typing) {
      await popup.keyboard.press('Enter');
      await popup.locator('x-4ntl-card [data-provider="virustotal"][data-verdict]').waitFor();
    }
    await popup.waitForTimeout(300);
    const height = await popup.evaluate(() =>
      Math.ceil(document.querySelector('x-4ntl-card')?.getBoundingClientRect().height ?? 600),
    );
    await popup.setViewportSize({ width: 380, height: Math.min(height, 600) });
    const caption = scenes.find(([name]) => name === file)?.[1] ?? '';
    bodies.set(url, page(caption, true, pngData(await popup.screenshot())));
    await popup.close();
    await tab.goto(url);
  } else if (file === 'screenshot-6.png') {
    // The card opens where the right-click was; the drawn menu sits to its left.
    await tab.mouse.click(700, 260, { button: 'right' });
    await hook('simulateAskClick', url);
    await card.locator('.ask-input').waitFor();
    await tab.keyboard.type('45.155.205[.]233');
  } else if (file === 'screenshot-4.png') {
    await tab.locator('#ip').selectText();
    await rightClickOn('#ip');
    await hook('simulateMenuClick', url, '185.220.101.4', 'all');
    await card.locator('[data-provider="virustotal"][data-verdict]').waitFor();
    await card.getByRole('button', { name: 'Save to list' }).click();
    await card.getByRole('button', { name: 'Copy…' }).click();
  } else {
    await tab.locator('#ip').selectText();
    await rightClickOn('#ip');
    await hook('simulateMenuClick', url, '185.220.101.4', 'all');
    await card.locator('[data-provider="virustotal"][data-verdict]').waitFor();
    await settle();
    cardShot = pngData(await card.screenshot());
  }
  await settle();
  await tab.screenshot({ path: path.join(out, file) });
}

// Screenshot 5: the saved list, as built up during an investigation.
await settings('sharingan');
const day = Date.now();
const saved = (value, type, verdict, country, summary, minutesAgo) => ({
  value,
  type,
  verdict,
  country,
  summary,
  savedAt: day - minutesAgo * 60_000,
});
await worker.evaluate(
  (list) => chrome.storage.local.set({ 'savedList.v1': list }),
  [
    saved(
      '185.220.101.4',
      'ipv4',
      'malicious',
      '🇩🇪 Germany (DE)',
      'AbuseIPDB: Malicious 100% · VirusTotal: Malicious 14 / 94',
      2,
    ),
    saved(
      '45.155.205.233',
      'ipv4',
      'malicious',
      '🇷🇺 Russia (RU)',
      'AbuseIPDB: Malicious 96% · VirusTotal: Malicious 9 / 94',
      7,
    ),
    saved('evil-login-verify.com', 'domain', 'suspicious', '', 'VirusTotal: Suspicious 2 / 94', 12),
    saved(
      '103.145.13.70',
      'ipv4',
      'malicious',
      '🇻🇳 Vietnam (VN)',
      'AbuseIPDB: Malicious 88% · VirusTotal: Malicious 6 / 94',
      25,
    ),
    saved(
      '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f',
      'sha256',
      'malicious',
      '',
      'VirusTotal: Malicious 62 / 72',
      31,
    ),
    saved(
      '2a03:2880:f12f:83:face:b00c:0:25de',
      'ipv6',
      'clean',
      '🇺🇸 United States (US)',
      'AbuseIPDB: Clean 0% · VirusTotal: Clean 0 / 94',
      44,
    ),
  ],
);
const listPage = await context.newPage();
await listPage.goto(`chrome-extension://${new URL(worker.url()).host}/list.html`);
await listPage.locator('#rows tr').nth(5).waitFor();
await listPage.waitForTimeout(300);
await listPage.screenshot({ path: path.join(out, 'screenshot-5.png') });

// Promo tiles: the logo drawn at full size; the marquee also shows a real result card.
const [logo110, logo200] = [await logo(110), await logo(200)];
const tile = (
  w,
  h,
  big,
) => `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;
  display:flex;align-items:center;justify-content:center;gap:${big ? 48 : 20}px;
  background:radial-gradient(70% 90% at 25% 30%, #3a0a10, #0d0a0b 70%);font-family:'Segoe UI',system-ui;color:#fff">
  <img src="data:image/png;base64,${big ? logo200 : logo110}" style="width:${big ? 200 : 110}px;height:${big ? 200 : 110}px">
  <div><div style="font:700 ${big ? 92 : 52}px/1 'Segoe UI',system-ui;letter-spacing:.02em">4NTL</div>
  <div style="font:500 ${big ? 28 : 17}px/1.35 'Segoe UI',system-ui;color:#f5c2c7;max-width:${big ? 620 : 230}px;margin-top:${big ? 18 : 10}px">
  Threat-intel verdicts from the <span style="white-space:nowrap">right-click</span> menu</div>
  ${big ? '<div style="font:400 21px/1.5 system-ui;color:#a99ea0;margin-top:16px;max-width:520px">VirusTotal · AbuseIPDB<br>IPs, hashes, domains, URLs, links</div>' : ''}</div>
  ${big && cardShot ? `<img src="${cardShot}" style="height:470px;border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.65);transform:rotate(3deg)">` : ''}
</body></html>`;
for (const [file, w, h, big] of [
  ['promo-small.png', 440, 280, false],
  ['promo-marquee.png', 1400, 560, true],
]) {
  const promo = await context.newPage();
  await promo.setViewportSize({ width: w, height: h });
  await promo.setContent(tile(w, h, big));
  await promo.screenshot({ path: path.join(out, file) });
  await promo.close();
}

await context.close();
console.log('Store images written to docs/store.');
