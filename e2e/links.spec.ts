import type { Page, Worker } from '@playwright/test';
import {
  ABUSE_KEY,
  APP_URL,
  expect,
  fixture,
  PAGE_URL,
  PHISH_URL,
  SAFE_LINK,
  test,
  VT_KEY,
  type FakeRoute,
} from './fixtures';

const URL_ROUTES: FakeRoute[] = [
  {
    prefix: 'https://www.virustotal.com/api/v3/urls/',
    responses: [{ status: 200, body: fixture('virustotal/url.json') }],
  },
  {
    prefix: 'https://api.abuseipdb.com/',
    responses: [{ status: 200, body: fixture('abuseipdb/check.json') }],
  },
  {
    prefix: 'https://www.virustotal.com/api/v3/ip_addresses/',
    responses: [{ status: 200, body: fixture('virustotal/ip.json') }],
  },
];

type Hook =
  | 'simulateElementClick'
  | 'simulateLinkClick'
  | 'simulateActionClick'
  | 'simulateOmnibox'
  | 'simulateMenuClick'
  | 'describeOmnibox';

/** Calls a test hook in the service worker (see src/background/index.ts). */
function hook(worker: Worker, name: Hook, ...args: unknown[]): Promise<unknown> {
  return worker.evaluate(
    ([fn, params]) =>
      (
        globalThis as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>
      ).__4ntl?.[fn]?.(...params),
    [name, args] as const,
  );
}

const card = (page: Page) => page.locator('x-4ntl-card .card');

test.beforeEach(async ({ settings, api }) => {
  await settings({ apiKeys: { virustotal: VT_KEY, abuseipdb: ABUSE_KEY } });
  await api.routes(URL_ROUTES);
});

test.describe('links that are not plain links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
  });

  test('a card or button with a data-href', async ({ page, worker }) => {
    await page.locator('#card').hover();
    await hook(worker, 'simulateElementClick', APP_URL);
    await expect(card(page).locator('.ioc')).toHaveText('https://evil.com/card');
    await expect(card(page).locator('[data-provider="virustotal"] .pill')).toHaveText('Suspicious');
  });

  test('a "#" link whose real target is in its click handler', async ({ page, worker }) => {
    await page.locator('#fake').hover();
    await hook(worker, 'simulateLinkClick', APP_URL, `${APP_URL}#`);
    await expect(card(page).locator('.ioc')).toHaveText('https://evil.com/fake');
  });

  test('Safe Links wrappers are unwrapped to the real destination', async ({ page, worker }) => {
    await page.locator('#wrapped').hover();
    await hook(worker, 'simulateLinkClick', APP_URL, SAFE_LINK);
    await expect(card(page).locator('.ioc')).toHaveText('https://evil.com/login');
  });

  test('a JavaScript-only button: catches the click and stops the navigation', async ({
    page,
    worker,
    api,
  }) => {
    await page.locator('#js-nav').hover();
    await hook(worker, 'simulateElementClick', APP_URL);
    await expect(card(page).locator('.title')).toHaveText('Click it to check where it goes');

    await page.locator('#js-nav').click();
    await expect(card(page).locator('.ioc')).toHaveText('https://evil.com/next-step');
    await expect(card(page).locator('[data-provider="virustotal"] .pill')).toHaveText('Suspicious');
    // The page never went there.
    expect(page.url()).toBe(APP_URL);
    expect((await api.calls()).map((call) => call.url)).toEqual([
      `https://www.virustotal.com/api/v3/urls/${Buffer.from('https://evil.com/next-step').toString('base64url')}`,
    ]);
  });

  test('a window.open button: caught without opening a window', async ({
    page,
    context,
    worker,
  }) => {
    await page.locator('#js-open').hover();
    await hook(worker, 'simulateElementClick', APP_URL);
    await expect(card(page).locator('.title')).toHaveText('Click it to check where it goes');

    const pagesBefore = context.pages().length;
    await page.locator('#js-open').click();
    await expect(card(page).locator('.ioc')).toHaveText('https://evil.com/popup');
    expect(context.pages()).toHaveLength(pagesBefore);
  });
});

test.describe('toolbar icon and address bar', () => {
  test('the toolbar icon checks the page you are on, top-right', async ({ page, worker }) => {
    await page.goto(PHISH_URL);
    await hook(worker, 'simulateActionClick', PHISH_URL);
    await expect(card(page).locator('.ioc')).toHaveText(PHISH_URL);
    await page.waitForTimeout(200); // let the 120 ms entrance animation finish
    const box = await card(page).boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) - (width - 8))).toBeLessThan(4);
    expect(Math.abs((box?.y ?? 0) - 8)).toBeLessThan(2);
  });

  test('"4ntl <link>" in the address bar looks it up in the current tab', async ({
    page,
    worker,
  }) => {
    await page.goto(PAGE_URL);
    await page.bringToFront();
    await hook(worker, 'simulateOmnibox', 'hxxps://evil[.]com/x');
    await expect(card(page).locator('.ioc')).toHaveText('https://evil.com/x');
  });

  test('address-bar suggestions escape what you type', async ({ worker }) => {
    const text = await hook(worker, 'describeOmnibox', 'https://evil.com/?a=1&b=<2>');
    expect(text).toContain('https://evil.com/?a=1&amp;b=&lt;2');
    expect(text).not.toContain('b=<2');
    expect(await hook(worker, 'describeOmnibox', '')).toContain('Paste an IP');
  });
});

test('the card opens ~5 cm from the pointer and can be dragged anywhere', async ({
  page,
  worker,
}) => {
  await page.goto(PAGE_URL);
  await page.locator('#ip').selectText();
  await hook(worker, 'simulateMenuClick', PAGE_URL, '185.220.101.4', 'all');
  const header = card(page).locator('.header');
  await expect(card(page).locator('[data-provider="virustotal"][data-verdict]')).toBeVisible();
  await page.waitForTimeout(200); // entrance animation

  const before = await card(page).boundingBox();
  const grip = await card(page).locator('.ioc').boundingBox();
  if (!before || !grip) throw new Error('card not visible');
  await page.mouse.move(grip.x + 10, grip.y + 5);
  await page.mouse.down();
  await page.mouse.move(grip.x + 10 - 300, grip.y + 5 + 120, { steps: 8 });
  await page.mouse.up();

  const after = await card(page).boundingBox();
  expect(Math.round((after?.x ?? 0) - before.x)).toBe(-300);
  expect(Math.round((after?.y ?? 0) - before.y)).toBe(120);
  await expect(header).toBeVisible(); // still open: dragging isn't a click outside
});
