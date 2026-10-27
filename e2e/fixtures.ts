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
const EXTENSION = path.join(ROOT, 'dist-e2e');

export const PAGE_URL = 'http://4ntl.test/';

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
</body></html>`;

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

export const VT_KEY = 'a'.repeat(64);
export const ABUSE_KEY = 'b'.repeat(80);

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

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await context.route(`${PAGE_URL}**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: PAGE,
        headers: { 'content-security-policy': STRICT_CSP },
      }),
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
      routes: (routes) =>
        worker.evaluate((table) => {
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
        }, routes),
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
