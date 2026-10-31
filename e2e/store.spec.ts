/**
 * The paid store edition in a real browser: early users free for life, the
 * 3-day trial for installs from 15 November 2026, the unlock offer, the
 * checkout, and a purchase being recognised. ExtensionPay is faked.
 */
import type { Worker } from '@playwright/test';
import {
  ABUSE_KEY,
  expect,
  EXTPAY_TEST_KEY,
  EXTPAY_URL,
  fixture,
  optionsUrl,
  test,
  VT_KEY,
  type FakeRoute,
} from './fixtures';

test.use({ edition: 'store' });

const DAY = 24 * 60 * 60 * 1000;
const PAID_FROM = Date.UTC(2026, 10, 15);

const PROVIDERS: FakeRoute[] = [
  {
    prefix: 'https://api.abuseipdb.com/',
    responses: [{ status: 200, body: fixture('abuseipdb/check.json') }],
  },
  {
    prefix: 'https://www.virustotal.com/api/v3/ip_addresses/',
    responses: [{ status: 200, body: fixture('virustotal/ip.json') }],
  },
];

/** Moves the extension's clock. newUser: forget any install date and run once now (a fresh install). */
async function setClock(worker: Worker, ms: number, newUser = false): Promise<void> {
  await worker.evaluate(
    async ([at, fresh]) => {
      (globalThis as unknown as { __4ntl: { setClock(t: number): void } }).__4ntl.setClock(at);
      if (fresh) {
        await chrome.storage.local.remove('license.v1');
        await chrome.storage.sync.remove('firstSeen.v1');
        await (
          globalThis as unknown as { __4ntl: { licenseAccess(): Promise<unknown> } }
        ).__4ntl.licenseAccess();
      }
    },
    [ms, newUser] as const,
  );
}

test.beforeEach(async ({ settings, api }) => {
  await settings({ apiKeys: { virustotal: VT_KEY, abuseipdb: ABUSE_KEY } });
  await api.routes(PROVIDERS);
});

test('installed before 15 November: results, no trial notice, and still free long after', async ({
  page,
  worker,
  menuClick,
}) => {
  await setClock(worker, PAID_FROM - 2 * DAY, true);
  await menuClick('185.220.101.4', 'all');
  const card = page.locator('x-4ntl-card .card');
  await expect(card.locator('[data-verdict]')).toHaveCount(2);
  await expect(card.locator('.banner')).toHaveCount(0);
  await expect(card.getByRole('link', { name: '♥ Support 4NTL' })).toBeVisible();

  await setClock(worker, PAID_FROM + 400 * DAY);
  await page.keyboard.press('Escape');
  await menuClick('185.220.101.5', 'all');
  await expect(card.locator('[data-verdict]')).toHaveCount(2);
  await expect(card.locator('.banner')).toHaveCount(0);
});

test('installed after 15 November: a 3-day trial, then the unlock offer and no lookups', async ({
  page,
  worker,
  api,
  menuClick,
}) => {
  const installed = PAID_FROM + 10 * DAY;
  await setClock(worker, installed, true);
  await menuClick('185.220.101.4', 'all');
  const card = page.locator('x-4ntl-card .card');
  await expect(card.locator('[data-verdict]')).toHaveCount(2);
  await expect(card.locator('.banner')).toContainText('Trial: 3 days left, then $2 once for life.');

  await setClock(worker, installed + 3 * DAY + 60_000);
  await page.keyboard.press('Escape');
  const before = (await api.calls()).length;
  await menuClick('185.220.101.6', 'all');
  await expect(card.locator('.title')).toHaveText('Unlock 4NTL');
  await expect(card.getByRole('button', { name: 'Unlock for $2' })).toBeVisible();
  await expect(card.getByRole('link', { name: /Free version on GitHub/ })).toHaveAttribute(
    'href',
    'https://github.com/boode-hub/4NTL/releases/latest',
  );
  // Locked: nothing is sent to VirusTotal or AbuseIPDB.
  expect(
    (await api.calls()).filter((c) => !c.url.startsWith('https://extensionpay.com')),
  ).toHaveLength(before);
});

test('Unlock on the card opens the ExtensionPay checkout via the settings page', async ({
  page,
  context,
  worker,
  menuClick,
}) => {
  await setClock(worker, PAID_FROM + 10 * DAY, true);
  await setClock(worker, PAID_FROM + 20 * DAY);
  await menuClick('185.220.101.4', 'all');
  const checkout = context.waitForEvent('page', {
    predicate: (p) => p.url().startsWith(`${EXTPAY_URL}/choose-plan`),
  });
  await page.locator('x-4ntl-card .card').getByRole('button', { name: 'Unlock for $2' }).click();
  expect((await checkout).url()).toBe(`${EXTPAY_URL}/choose-plan?api_key=${EXTPAY_TEST_KEY}`);
});

test('people who installed the free store version early stay free after the paid update', async ({
  page,
  worker,
  menuClick,
}) => {
  // What the free edition leaves behind when installed before 15 November.
  await worker.evaluate(
    (date) => chrome.storage.sync.set({ 'firstSeen.v1': date }),
    PAID_FROM - 5 * DAY,
  );
  await worker.evaluate(() => chrome.storage.local.remove('license.v1'));
  await setClock(worker, PAID_FROM + 60 * DAY);
  await menuClick('185.220.101.4', 'all');
  const card = page.locator('x-4ntl-card .card');
  await expect(card.locator('[data-verdict]')).toHaveCount(2);
  await expect(card.locator('.banner')).toHaveCount(0);
});

test('a purchase is recognised: settings say so and lookups work again', async ({
  page,
  context,
  worker,
  extensionId,
  api,
  menuClick,
}) => {
  await setClock(worker, PAID_FROM + 10 * DAY, true);
  await setClock(worker, PAID_FROM + 20 * DAY);
  // As after a real checkout: ExtensionPay's key in synced storage, and its server says "paid".
  await worker.evaluate(
    (key) => chrome.storage.sync.set({ extensionpay_api_key: key }),
    EXTPAY_TEST_KEY,
  );
  await api.routes([
    ...PROVIDERS,
    {
      prefix: `${EXTPAY_URL}/api/v2/user`,
      responses: [
        { status: 200, body: { paid: true, paidAt: '2026-12-05T10:00:00.000Z', email: null } },
      ],
    },
  ]);

  const settings = await context.newPage();
  await settings.goto(optionsUrl(extensionId));
  await settings.getByRole('button', { name: 'Check again' }).click();
  await expect(settings.locator('#license-status')).toHaveText(
    'Unlocked for life. Thank you for supporting 4NTL!',
  );
  await expect(settings.getByRole('button', { name: 'Unlock for $2' })).toBeHidden();
  await expect(settings.getByRole('link', { name: '♥ Sponsor' })).toBeVisible();

  await page.bringToFront();
  await menuClick('185.220.101.4', 'all');
  const card = page.locator('x-4ntl-card .card');
  await expect(card.locator('[data-verdict]')).toHaveCount(2);
  await expect(card.locator('.banner')).toHaveCount(0);
});
