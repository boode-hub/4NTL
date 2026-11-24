/**
 * EchoTrail (Windows processes): off, 4NTL behaves exactly as without it; on, a
 * process name gets EchoTrail's card, which is wider for the ancestry lists.
 */
import type { Page } from '@playwright/test';
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
const OFF = { apiKeys: { virustotal: VT_KEY, abuseipdb: ABUSE_KEY } };
const ON = {
  apiKeys: { virustotal: VT_KEY, abuseipdb: ABUSE_KEY, echotrail: ECHO_KEY },
  echotrail: true,
};

const FULL_RECORD = {
  process_name: 'svchost.exe',
  description: 'Host process for Windows services.',
  classification: { category: 'System', publisher: 'Microsoft Windows', is_lolbin: false },
  executions: { total: 900000 },
  parents: { total: 900000, top: [{ name: 'services.exe', count: 880000, percentage: 97.8 }] },
  children: { top: [{ name: 'wermgr.exe', count: 1200 }] },
  grandparents: { top: [{ name: 'wininit.exe', count: 870000 }] },
  paths: { total: 900000, top: [{ path: 'C:/Windows/System32', count: 899000, percentage: 99.9 }] },
  hashes: { top: [{ sha256: 'c'.repeat(64), count: 500000, percentage: 55.5 }] },
};

const ROUTES: FakeRoute[] = [
  { prefix: 'https://api.echotrail.io/', responses: [{ status: 200, body: FULL_RECORD }] },
  {
    prefix: 'https://api.abuseipdb.com/',
    responses: [{ status: 200, body: fixture('abuseipdb/check.json') }],
  },
  {
    prefix: 'https://www.virustotal.com/api/v3/ip_addresses/',
    responses: [{ status: 200, body: fixture('virustotal/ip.json') }],
  },
];

test.beforeEach(async ({ page, api }) => {
  await api.routes(ROUTES);
  await page.goto(PAGE_URL);
});

const card = (page: Page) => page.locator('x-4ntl-card .card');

test('EchoTrail off: a process name is not an indicator, as before', async ({
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

test('EchoTrail on: a process path gets EchoTrail’s wider card with the ancestry', async ({
  page,
  settings,
  menuClick,
  api,
}) => {
  await settings(ON);
  await menuClick('C:\\Windows\\System32\\svchost.exe', 'all');
  const echo = card(page).locator('[data-provider="echotrail"]');
  await expect(card(page).locator('.ioc')).toHaveText('svchost.exe');
  await expect(card(page).locator('.type')).toHaveText('Process');
  await expect(echo.locator('.headline-value')).toHaveText('98%');
  await expect(echo.locator('.list-label')).toHaveText([
    'Top grandparents',
    'Top parents',
    'Top children',
    'Top paths',
    'Top hashes (SHA-256)',
  ]);
  await expect(echo.locator('.list.wide .list-name')).toHaveText([
    'C:/Windows/System32',
    'c'.repeat(64),
  ]);
  await expect(card(page).locator('[data-provider]')).toHaveCount(1); // EchoTrail only
  expect((await card(page).boundingBox())?.width).toBeGreaterThanOrEqual(455);
  const [call] = await api.calls();
  expect(call?.url).toBe('https://api.echotrail.io/v1/process/svchost.exe');
});

test('EchoTrail on: everything else keeps its usual providers and width', async ({
  page,
  settings,
  menuClick,
}) => {
  await settings(ON);
  await menuClick('185.220.101.4', 'all');
  await expect(card(page).locator('[data-provider]')).toHaveCount(2);
  await expect(card(page).locator('[data-provider="echotrail"]')).toHaveCount(0);
  expect((await card(page).boundingBox())?.width).toBeLessThan(400);
});

test('"EchoTrail only" looks up a service name', async ({ page, settings, menuClick, api }) => {
  await settings(ON);
  await menuClick('Spooler', 'echotrail');
  await expect(card(page).locator('.ioc')).toHaveText('spooler');
  await expect(card(page).locator('[data-provider="echotrail"] .pill')).toBeVisible();
  expect((await api.calls())[0]?.url).toBe('https://api.echotrail.io/v1/process/spooler');
});

test('the settings switch shows EchoTrail’s key field and saves on and off', async ({
  context,
  extensionId,
  worker,
}) => {
  const options = await openSettings(context, extensionId);
  const toggle = options.getByLabel('Look up Windows processes on EchoTrail');
  const keyField = options.locator('#echotrail-key');
  await expect(toggle).not.toBeChecked();
  await expect(keyField).toBeHidden();

  const stored = () =>
    worker.evaluate(async () => {
      const value = (await chrome.storage.local.get('settings.v1'))['settings.v1'] as
        { echotrail?: boolean } | undefined;
      return value?.echotrail;
    });
  await toggle.check();
  await expect(keyField).toBeVisible();
  await expect.poll(stored).toBe(true);
  await toggle.uncheck();
  await expect(keyField).toBeHidden();
  await expect.poll(stored).toBe(false);
});
