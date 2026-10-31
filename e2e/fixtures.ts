/**
 * Playwright fixtures: a Chromium instance with the e2e build of the extension
 * loaded, a scripted fake for the provider APIs (installed inside the service
 * worker), and a test page served with a strict Content-Security-Policy.
 */
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const EXTENSIONS = { free: path.join(ROOT, 'dist-e2e'), store: path.join(ROOT, 'dist-e2e-store') };

/** ExtensionPay, faked for the store edition: its pages and the key it hands out. */
export const EXTPAY_URL = 'https://extensionpay.com/extension/EXTPAY-ID-PLACEHOLDER';
export const EXTPAY_TEST_KEY = 'test-api-key';

export const PAGE_URL = 'http://4ntl.test/';

/**
 * The settings page. On first install without keys the extension opens it by
 * itself; reuse that tab rather than racing it with a second navigation.
 */
export async function openSettings(context: BrowserContext, extensionId: string): Promise<Page> {
  const url = optionsUrl(extensionId);
  const opened =
    context.pages().find((page) => page.url() === url) ??
    (await context
      .waitForEvent('page', { predicate: (page) => page.url() === url, timeout: 2_000 })
      .catch(() => undefined));
  if (opened) {
    await opened.waitForLoadState();
    return opened;
  }
  const page = await context.newPage();
  await page.goto(url);
  return page;
}

export function optionsUrl(extensionId: string): string {
  return `chrome-extension://${extensionId}/options.html`;
}

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>4NTL e2e</title></head>
<body style="font: 16px sans-serif; padding: 40px">
  <p>Callback: <span id="ip">185.220.101.4</span></p>
  <p id="multi">Seen 185.220.101.4 talking to evil[.]com</p>
  <p>Internal host <span id="private">10.0.0.1</span></p>
  <p>Hash <span id="hash">275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f</span></p>
  <p id="prose">Nothing to see here</p>
  <p>Payload: <a id="link" href="http://malware.wicar.org/data/eicar.com">download sample</a>
     · Console: <a id="intranet" href="https://siem.corp/search?q=ws-0442">open SIEM</a></p>
</body></html>`;

/** A page with real JavaScript buttons and tricky links (no CSP, so its scripts run). */
export const APP_URL = 'http://4ntl.test/app';
export const SAFE_LINK =
  'https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fevil.com%2Flogin&data=05%7C01';

const APP = `<!doctype html>
<html><head><meta charset="utf-8"><title>4NTL app</title></head>
<body style="font: 16px sans-serif; padding: 40px">
  <div id="card" data-href="https://evil.com/card" style="padding: 12px; border: 1px solid #ccc; width: 200px">Open card</div>
  <p><a id="fake" href="#" onclick="window.location.href='https://evil.com/fake'">Fake link</a></p>
  <p><a id="wrapped" href="${SAFE_LINK}">Wrapped link</a></p>
  <p><button id="js-nav">Continue</button> <button id="js-open">Open offer</button></p>
  <script>
    document.getElementById('js-nav').addEventListener('click', () => { location.href = 'https://evil.com/next-step'; });
    document.getElementById('js-open').addEventListener('click', () => { window.open('https://evil.com/popup', '_blank'); });
  </script>
</body></html>`;

/** A public-looking page, for checking "the page I'm on". */
export const PHISH_URL = 'https://phish-demo.com/login';

/** The page forbids all styles and scripts: the card must still work. */
const STRICT_CSP = "default-src 'none'; style-src 'none'; script-src 'none'";

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(ROOT, 'tests', 'fixtures', name), 'utf8'));
}

export interface FakeResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

/** Requests whose URL starts with `prefix` get `responses` in order (the last one repeats). */
export interface FakeRoute {
  readonly prefix: string;
  readonly responses: readonly FakeResponse[];
}

export interface RecordedCall {
  readonly url: string;
  readonly headers: Record<string, string>;
}

/** Replaces the provider APIs inside the service worker with scripted responses. */
export function installFakeApi(worker: Worker, routes: readonly FakeRoute[]): Promise<void> {
  return worker.evaluate((table) => {
    const state = globalThis as unknown as {
      __routes: { prefix: string; responses: FakeResponse[] }[];
      __calls: RecordedCall[];
    };
    state.__routes = table.map((route) => ({ ...route, responses: [...route.responses] }));
    state.__calls = [];
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      state.__calls.push({ url, headers: { ...(init?.headers as Record<string, string>) } });
      const route = state.__routes.find((candidate) => url.startsWith(candidate.prefix));
      const next =
        route && (route.responses.length > 1 ? route.responses.shift() : route.responses[0]);
      if (!next) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(
        new Response(next.body === undefined ? null : JSON.stringify(next.body), {
          status: next.status,
          headers: { 'content-type': 'application/json', ...next.headers },
        }),
      );
    };
  }, routes);
}

/** A page built to break extensions: hostile CSS, an overlay wall, sabotaged built-ins. */
export const HOSTILE_URL = 'http://4ntl.test/hostile';
const HOSTILE = `<!doctype html>
<html><head><meta charset="utf-8"><title>hostile</title><style>
  * { all: unset !important; display: block !important; opacity: 0.4 !important;
      transform: rotate(4deg) !important; filter: blur(1px) !important;
      pointer-events: none !important; font-size: 30px !important; }
  html { transform: translateZ(0) !important; overflow: hidden !important; }
  #wall { position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
          background: rgba(0, 0, 0, 0.4) !important; pointer-events: auto !important; }
</style></head>
<body><p id="ip">185.220.101.4</p><div id="wall"></div>
<script>
  // Content scripts run in an isolated world: none of this may affect 4NTL.
  Array.prototype.map = () => { throw new Error('sabotaged'); };
  JSON.parse = () => { throw new Error('sabotaged'); };
  Element.prototype.attachShadow = () => { throw new Error('sabotaged'); };
  document.createElement = () => { throw new Error('sabotaged'); };
  window.addEventListener('contextmenu', (e) => e.stopImmediatePropagation(), true);
  window.addEventListener('keydown', (e) => e.stopImmediatePropagation(), true);
  setInterval(() => {
    for (const el of document.body.querySelectorAll('*')) if (el.id !== 'ip' && el.id !== 'wall') el.remove();
  }, 50);
</script></body></html>`;

export const VT_KEY = 'a'.repeat(64);
export const ABUSE_KEY = 'b'.repeat(80);

interface Options {
  /** 'free': the GitHub edition (default). 'store': the paid store edition. */
  edition: 'free' | 'store';
}

interface Fixtures {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  page: Page;
  api: {
    routes: (routes: readonly FakeRoute[]) => Promise<void>;
    calls: () => Promise<RecordedCall[]>;
  };
  settings: (value: object) => Promise<void>;
  menuClick: (selection: string, scope: 'all' | 'virustotal' | 'abuseipdb') => Promise<void>;
}

export const test = base.extend<Fixtures & Options>({
  edition: ['free', { option: true }],

  context: async ({ edition }, use) => {
    const extension = EXTENSIONS[edition];
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    // Never reach the real ExtensionPay: hand out a test key, serve blank pages.
    await context.route('https://extensionpay.com/**', (route) =>
      route.request().url().endsWith('/api/new-key')
        ? route.fulfill({ contentType: 'application/json', body: JSON.stringify(EXTPAY_TEST_KEY) })
        : route.fulfill({ contentType: 'text/html', body: '<h1>ExtensionPay (test)</h1>' }),
    );
    await context.route(`${PAGE_URL}**`, (route) =>
      route.request().url() === APP_URL
        ? route.fulfill({ contentType: 'text/html', body: APP })
        : route.request().url() === HOSTILE_URL
          ? route.fulfill({ contentType: 'text/html', body: HOSTILE })
          : route.fulfill({
              contentType: 'text/html',
              body: PAGE,
              headers: { 'content-security-policy': STRICT_CSP },
            }),
    );
    await context.route(`${PHISH_URL}**`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<h1>Sign in to your account</h1>' }),
    );
    await use(context);
    await context.close();
  },

  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },

  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },

  page: async ({ context, extensionId }, use) => {
    // On first install without API keys the extension opens its settings; close
    // that tab (if this test's setup didn't add keys first) for a known state.
    const isOptions = (candidate: Page) => candidate.url() === optionsUrl(extensionId);
    const installTab =
      context.pages().find(isOptions) ??
      (await context
        .waitForEvent('page', { predicate: isOptions, timeout: 2_000 })
        .catch(() => undefined));
    await installTab?.close();
    const page = await context.newPage();
    await page.goto(PAGE_URL);
    await use(page);
  },

  api: async ({ worker }, use) => {
    await use({
      routes: (routes) => installFakeApi(worker, routes),
      calls: () =>
        worker.evaluate(
          () => (globalThis as unknown as { __calls?: RecordedCall[] }).__calls ?? [],
        ),
    });
  },

  settings: async ({ worker }, use) => {
    await use((value) =>
      worker.evaluate((settings) => chrome.storage.local.set({ 'settings.v1': settings }), value),
    );
  },

  menuClick: async ({ worker }, use) => {
    await use(async (selection, scope) => {
      await worker.evaluate(
        ([url, text, which]) =>
          (
            globalThis as unknown as {
              __4ntl: { simulateMenuClick(u: string, s: string, p: string): Promise<unknown> };
            }
          ).__4ntl.simulateMenuClick(url, text, which),
        [PAGE_URL, selection, scope] as const,
      );
    });
  },
});

export { expect } from '@playwright/test';
