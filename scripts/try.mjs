/**
 * Opens a Chromium window with the production build loaded and a demo page of
 * sample indicators, for trying the extension by hand. Lookups are real: paste
 * your API keys in the settings tab that opens on first run. The profile (and
 * so the keys) is kept in .cache/try-profile between runs.
 *
 *   npm run try
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extension = path.join(root, 'dist');
const profile = path.join(root, '.cache', 'try-profile');
const DEMO_URL = 'http://4ntl.demo/';

const DEMO_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>4NTL demo</title>
<style>
  body { font: 15px/1.6 system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 16px; color: #0f172a; }
  code { font: 14px ui-monospace, Consolas, monospace; background: #f1f5f9; padding: 1px 5px; border-radius: 4px; }
  li { margin: 6px 0; } h2 { margin-top: 28px; font-size: 17px; }
</style></head>
<body>
  <h1>4NTL demo page</h1>
  <p>Select an indicator (double-click works for most), right-click, and choose <b>4NTL</b>.
     Or select one and press <b>Alt+Shift+L</b>.</p>

  <h2>IP addresses</h2>
  <ul>
    <li>Tor exit node: <code>185.220.101.4</code></li>
    <li>Google DNS: <code>8.8.8.8</code></li>
    <li>Defanged: <code>45.155.205[.]233</code></li>
    <li>IPv6: <code>2001:4860:4860::8888</code></li>
    <li>Private (never sent anywhere): <code>192.168.1.10</code></li>
  </ul>

  <h2>Hashes (EICAR test file, harmless)</h2>
  <ul>
    <li>SHA-256: <code>275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f</code></li>
    <li>MD5: <code>44d88612fea8a8f36de82e1278abb02f</code></li>
  </ul>

  <h2>Domains and URLs</h2>
  <ul>
    <li>Domain: <code>example.com</code></li>
    <li>Defanged test-malware site: <code>malware.wicar[.]org</code></li>
    <li>Defanged URL: <code>hxxp://malware.wicar[.]org/data/eicar.com</code></li>
  </ul>

  <h2>A log line (select all of it)</h2>
  <p><code>2026-10-27 09:14:02 DENY src=10.0.0.5 dst=185.220.101.4 sha256=275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f</code></p>
</body></html>`;

const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    '--start-maximized',
  ],
});
await context.route(`${DEMO_URL}**`, (route) =>
  route.fulfill({ contentType: 'text/html', body: DEMO_PAGE }),
);

const [page] = context.pages();
await (page ?? (await context.newPage())).goto(DEMO_URL);
console.log('4NTL is running. Close the browser window to stop.');
await new Promise((resolve) => context.on('close', resolve));
