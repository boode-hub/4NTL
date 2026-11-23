import type { Page, Worker } from '@playwright/test';
import {
  ABUSE_KEY,
  APP_URL,
  expect,
  fixture,
  PAGE_URL,
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
  | 'simulateShortcut'
  | 'simulateAskClick'
  | 'simulateLinkClick'
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

  test('the shortcut looks up what the pointer is over when nothing is selected', async ({
    page,
    worker,
  }) => {
    await page.locator('#noselect').hover();
    await hook(worker, 'simulateShortcut', APP_URL);
    await expect(card(page).locator('.ioc')).toHaveText('185.220.101.4');
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
});

test.describe('toolbar icon and address bar', () => {
  test('the toolbar popup: an IP goes to both, a hash or domain to VirusTotal only', async ({
    page,
    api,
    extensionId,
  }) => {
    await api.routes([
      ...URL_ROUTES,
      {
        prefix: 'https://www.virustotal.com/api/v3/files/',
        responses: [{ status: 200, body: fixture('virustotal/file.json') }],
      },
      {
        prefix: 'https://www.virustotal.com/api/v3/domains/',
        responses: [{ status: 200, body: fixture('virustotal/domain.json') }],
      },
    ]);
    const popup = page.locator('x-4ntl-card .card');
    const providers = () => popup.locator('[data-provider]');
    for (const [typed, expected] of [
      ['185.220.101.4', ['abuseipdb', 'virustotal']],
      ['44d88612fea8a8f36de82e1278abb02f', ['virustotal']],
      ['evil[.]com', ['virustotal']],
    ] as const) {
      await page.goto(`chrome-extension://${extensionId}/result.html`);
      await expect(popup.locator('.ask-input')).toBeFocused();
      await page.keyboard.type(typed);
      await page.keyboard.press('Enter');
      await expect(popup.locator('[data-verdict]')).toHaveCount(expected.length);
      expect(
        await providers().evaluateAll((all) => all.map((el) => el.getAttribute('data-provider'))),
      ).toEqual(expected);
    }
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

test('the card opens ~3 cm from the pointer and can be dragged anywhere', async ({
  page,
  worker,
}) => {
  // Room for the whole card 120 px lower (it's kept inside the window), whatever the OS fonts.
  await page.setViewportSize({ width: 1280, height: 1000 });
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
  await page.mouse.move(grip.x + 10 - 150, grip.y + 5 + 120, { steps: 8 });
  await page.mouse.up();

  const after = await card(page).boundingBox();
  expect(Math.round((after?.x ?? 0) - before.x)).toBe(-150);
  expect(Math.round((after?.y ?? 0) - before.y)).toBe(120);
  await expect(header).toBeVisible(); // still open: dragging isn't a click outside
});

test('the corner grip makes the card wider, and the next card keeps that width', async ({
  page,
  worker,
}) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto(PAGE_URL);
  await hook(worker, 'simulateMenuClick', PAGE_URL, '185.220.101.4', 'all');
  await expect(card(page).locator('[data-provider="virustotal"][data-verdict]')).toBeVisible();
  await page.waitForTimeout(200); // entrance animation
  const before = await card(page).boundingBox();
  if (!before) throw new Error('card not visible');
  const corner = { x: before.x + before.width - 3, y: before.y + before.height - 3 };
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 120, corner.y, { steps: 8 });
  await page.mouse.up();
  const after = await card(page).boundingBox();
  expect(Math.round((after?.width ?? 0) - before.width)).toBeGreaterThanOrEqual(115);

  await page.waitForTimeout(800); // the width is saved once resizing stops
  await page.keyboard.press('Escape');
  await hook(worker, 'simulateMenuClick', PAGE_URL, '8.8.8.8', 'all');
  await expect(card(page)).toBeVisible();
  const next = await card(page).boundingBox();
  expect(Math.abs((next?.width ?? 0) - (after?.width ?? 0))).toBeLessThan(3);
});

test('opens ~3 cm beside the point you right-clicked', async ({ page, worker }) => {
  await page.goto(PAGE_URL);
  // The first lookup injects the page script; from then on it sees right-clicks.
  await hook(worker, 'simulateMenuClick', PAGE_URL, '185.220.101.4', 'all');
  await expect(card(page)).toBeVisible();
  await page.keyboard.press('Escape');

  const ip = await page.locator('#ip').boundingBox();
  if (!ip) throw new Error('no #ip');
  const point = { x: ip.x + ip.width / 2, y: ip.y + ip.height / 2 };
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await hook(worker, 'simulateMenuClick', PAGE_URL, '185.220.101.4', 'all');
  await expect(card(page)).toBeVisible();
  await page.waitForTimeout(200); // entrance animation

  const box = await card(page).boundingBox();
  expect(Math.abs((box?.x ?? 0) - (point.x + 113))).toBeLessThan(3);
  // Header level with the pointer, but never above the top of the window.
  expect(Math.abs((box?.y ?? 0) - Math.max(8, point.y - 24))).toBeLessThan(3);
});

test('"Type an IP or domain…": type it in the card, see the verdicts there', async ({
  page,
  worker,
}) => {
  await page.goto(APP_URL);
  await hook(worker, 'simulateAskClick', APP_URL);
  const input = card(page).locator('.ask-input');
  await expect(input).toBeFocused();
  await page.keyboard.type('not an ip');
  await page.keyboard.press('Enter');
  await expect(card(page).locator('.note')).toContainText('Select an IP address');
  await input.fill('185.220.101.4');
  await page.keyboard.press('Enter');
  await expect(card(page).locator('.ioc')).toHaveText('185.220.101.4');
  await expect(card(page).locator('[data-provider="abuseipdb"][data-verdict]')).toBeVisible();
  await expect(card(page).locator('[data-provider="virustotal"] .logo')).toBeVisible();

  // Another value without closing and reopening: the last one is there, selected.
  await card(page).getByRole('button', { name: 'Look up another' }).click();
  await expect(input).toHaveValue('185.220.101.4');
  await page.keyboard.type('8.8.8.8');
  await page.keyboard.press('Enter');
  await expect(card(page).locator('.ioc')).toHaveText('8.8.8.8');
});
