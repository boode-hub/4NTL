/**
 * Windows processes: off, 4NTL behaves exactly as without them. On, a process
 * is checked against whatever can answer, all at once, in one card: EchoTrail
 * (with a key) and the local library (once downloaded). The card is wider only
 * when EchoTrail is in it.
 */
import type { Page, Worker } from '@playwright/test';
import {
  ABUSE_KEY,
  expect,
  fixture,
  openSettings,
  PAGE_URL,
  test,
  VT_KEY,
  type FakeRoute,
} from './fixtures';

const ECHO_KEY = 'et_live_testkey12345';
const KEYS = { virustotal: VT_KEY, abuseipdb: ABUSE_KEY };
const OFF = { apiKeys: KEYS };
const ON = { apiKeys: KEYS, processes: true };
const ON_WITH_ECHOTRAIL = { apiKeys: { ...KEYS, echotrail: ECHO_KEY }, processes: true };

const FULL_RECORD = {
  process_name: 'rundll32.exe',
  description: 'Runs DLLs.',
  classification: { category: 'System', publisher: 'Microsoft Windows', is_lolbin: true },
  executions: { total: 900000 },
  parents: { total: 900000, top: [{ name: 'svchost.exe', count: 600000, percentage: 66.7 }] },
  children: { top: [{ name: 'conhost.exe', count: 1200 }] },
  grandparents: { top: [{ name: 'services.exe', count: 870000 }] },
  paths: { total: 900000, top: [{ path: 'C:/Windows/System32', count: 899000, percentage: 99.9 }] },
  hashes: { top: [{ sha256: 'c'.repeat(64), count: 500000, percentage: 55.5 }] },
};

// The library's sources, as their projects publish them (trimmed).
const LIBRARY_ROUTES: FakeRoute[] = [
  {
    prefix: 'https://lolbas-project.github.io/api/lolbas.json',
    responses: [
      {
        status: 200,
        body: [
          {
            Name: 'Rundll32.exe',
            Description: 'Used by Windows to execute dll files',
            Commands: [{ Usecase: 'Execute DLL file', MitreID: 'T1218.011', Category: 'Execute' }],
            Full_Path: [{ Path: 'C:\\Windows\\System32\\rundll32.exe' }],
            url: 'https://lolbas-project.github.io/lolbas/Binaries/Rundll32/',
          },
        ],
      },
    ],
  },
  {
    prefix: 'https://www.loldrivers.io/api/drivers.json',
    responses: [
      {
        status: 200,
        body: [{ Id: '00561455-9da1-4f0c', Category: 'vulnerable driver', Tags: ['RTCore64.sys'] }],
      },
    ],
  },
  {
    prefix: 'https://hijacklibs.net/api/hijacklibs.json',
    responses: [{ status: 200, body: [{ Name: 'version.dll', Vendor: 'Microsoft' }] }],
  },
  { prefix: 'https://winbindex.m417z.com/', responses: [{ status: 404 }] },
];

const ROUTES: FakeRoute[] = [
  { prefix: 'https://api.echotrail.io/', responses: [{ status: 200, body: FULL_RECORD }] },
  ...LIBRARY_ROUTES,
  {
    prefix: 'https://api.abuseipdb.com/',
    responses: [{ status: 200, body: fixture('abuseipdb/check.json') }],
  },
  {
    prefix: 'https://www.virustotal.com/api/v3/ip_addresses/',
    responses: [{ status: 200, body: fixture('virustotal/ip.json') }],
  },
];

/** Switching Windows processes on downloads the library in the background; wait for it. */
async function libraryReady(worker: Worker): Promise<void> {
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const meta = (await chrome.storage.local.get('library.meta.v1'))['library.meta.v1'] as
          Record<string, { updatedAt?: number }> | undefined;
        return Object.values(meta ?? {}).filter((s) => (s.updatedAt ?? 0) > 0).length;
      }),
    )
    .toBe(3);
}

const card = (page: Page) => page.locator('x-4ntl-card .card');

test.beforeEach(async ({ page, api }) => {
  await api.routes(ROUTES);
  await page.goto(PAGE_URL);
});

test('off: a process name is not an indicator, and nothing is downloaded', async ({
  page,
  settings,
  menuClick,
  api,
}) => {
  await settings(OFF);
  await menuClick('svchost.exe', 'all');
  await expect(card(page).locator('.title')).toHaveText('No indicator found');
  expect(await api.calls()).toEqual([]);
});

test('on, with an EchoTrail key and the library: both answer in one wider card', async ({
  page,
  settings,
  menuClick,
  worker,
}) => {
  await settings(ON_WITH_ECHOTRAIL);
  await libraryReady(worker);
  await menuClick('C:\\Windows\\System32\\rundll32.exe', 'all');
  await expect(card(page).locator('.ioc')).toHaveText('rundll32.exe');
  await expect(card(page).locator('[data-provider]')).toHaveCount(2);
  const echo = card(page).locator('[data-provider="echotrail"]');
  const local = card(page).locator('[data-provider="library"]');
  await expect(echo.locator('.headline-value')).toHaveText('67%');
  await expect(local.locator('.pill')).toHaveText('LOLBin');
  await expect(local.locator('.list-label').first()).toHaveText('Abuse (LOLBAS)');
  await expect(local.getByRole('link', { name: 'LOLBAS ↗' })).toHaveAttribute(
    'href',
    'https://lolbas-project.github.io/lolbas/Binaries/Rundll32/',
  );
  expect((await card(page).boundingBox())?.width).toBeGreaterThanOrEqual(455);
});

test('on, no EchoTrail key: only the library answers, at the normal width', async ({
  page,
  settings,
  menuClick,
  worker,
  api,
}) => {
  await settings(ON);
  await libraryReady(worker);
  await menuClick('lsass.exe', 'all');
  await expect(card(page).locator('[data-provider]')).toHaveCount(1);
  const local = card(page).locator('[data-provider="library"]');
  await expect(local.locator('.pill')).toHaveText('Core Windows');
  await expect(local.locator('.headline-value')).toHaveText('wininit.exe');
  expect((await card(page).boundingBox())?.width).toBeLessThan(400);
  expect((await api.calls()).some((call) => call.url.startsWith('https://api.echotrail.io'))).toBe(
    false,
  );
});

test('on, but no key and no library yet: says what to set up', async ({
  page,
  settings,
  menuClick,
  api,
}) => {
  await api.routes([]); // the library can't download
  await settings(ON);
  await menuClick('lsass.exe', 'all');
  await expect(card(page).locator('.title')).toHaveText('Nothing to check this with yet');
});

test('everything else keeps its usual providers and width', async ({
  page,
  settings,
  menuClick,
  worker,
}) => {
  await settings(ON_WITH_ECHOTRAIL);
  await libraryReady(worker);
  await menuClick('185.220.101.4', 'all');
  await expect(card(page).locator('[data-provider]')).toHaveCount(2);
  await expect(card(page).locator('[data-provider="library"]')).toHaveCount(0);
  expect((await card(page).boundingBox())?.width).toBeLessThan(400);
});

test('"Look up as a process or service" takes a service name', async ({
  page,
  settings,
  menuClick,
  worker,
}) => {
  await settings(ON);
  await libraryReady(worker);
  await menuClick('Spooler', 'process');
  await expect(card(page).locator('.ioc')).toHaveText('spooler');
  await expect(card(page).locator('[data-provider="library"] .pill')).toHaveText('No findings');
});

test('settings: the switch downloads the library, shows the EchoTrail key, and saves on and off', async ({
  context,
  extensionId,
  worker,
}) => {
  const options = await openSettings(context, extensionId);
  const toggle = options.getByLabel('Look up Windows processes and services');
  const details = options.locator('#processes-details');
  await expect(toggle).not.toBeChecked();
  await expect(details).toBeHidden();

  const stored = () =>
    worker.evaluate(async () => {
      const value = (await chrome.storage.local.get('settings.v1'))['settings.v1'] as
        { processes?: boolean } | undefined;
      return value?.processes;
    });
  await toggle.check();
  await expect(details).toBeVisible();
  await expect.poll(stored).toBe(true);
  await expect(options.locator('#library-status')).toContainText('LOLBAS 1');
  await expect(options.getByLabel('EchoTrail')).toBeVisible();

  await options.getByRole('button', { name: 'Update now' }).click();
  await expect(options.locator('#library-update-status')).toHaveText('Up to date.');

  await toggle.uncheck();
  await expect(details).toBeHidden();
  await expect.poll(stored).toBe(false);
  // Switched off: the library is deleted, as if it had never been added.
  await expect
    .poll(() =>
      worker.evaluate(async () =>
        Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('library.')),
      ),
    )
    .toEqual([]);
});

test('typed in by hand (right-click box or toolbar box): process and service names work too', async ({
  page,
  settings,
  worker,
  extensionId,
}) => {
  await settings(ON);
  await libraryReady(worker);

  // Right-click → 4NTL → Type an IP or domain…
  await worker.evaluate(
    (url) =>
      chrome.tabs
        .query({ url: `${url}*` })
        .then(([tab]) =>
          (
            globalThis as unknown as { __4ntl: { simulateAskClick(id: number): Promise<void> } }
          ).__4ntl.simulateAskClick(tab?.id ?? -1),
        ),
    PAGE_URL,
  );
  const input = card(page).locator('.ask-input');
  await expect(input).toHaveAttribute('placeholder', 'IP, domain, URL, hash or process name');
  await input.fill('Spooler');
  await page.keyboard.press('Enter');
  await expect(card(page).locator('.ioc')).toHaveText('spooler');
  await expect(card(page).locator('[data-provider="library"] .pill')).toHaveText('No findings');

  // The toolbar box.
  await page.goto(`chrome-extension://${extensionId}/result.html`);
  const popup = page.locator('x-4ntl-card .card');
  await expect(popup.locator('.ask-input')).toHaveAttribute(
    'placeholder',
    'IP, domain, URL, hash or process name',
  );
  await popup.locator('.ask-input').fill('lsass.exe');
  await page.keyboard.press('Enter');
  await expect(popup.locator('[data-provider="library"] .pill')).toHaveText('Core Windows');
});

test('with Windows processes off, the typing box stays as before', async ({
  page,
  settings,
  extensionId,
}) => {
  await settings(OFF);
  await page.goto(`chrome-extension://${extensionId}/result.html`);
  const popup = page.locator('x-4ntl-card .card');
  await expect(popup.locator('.ask-input')).toHaveAttribute(
    'placeholder',
    'IP, domain, URL or hash',
  );
  await popup.locator('.ask-input').fill('Spooler');
  await page.keyboard.press('Enter');
  await expect(popup.locator('.note')).toContainText('Select an IP address');
});
