import { readFile } from 'node:fs/promises';
import {
  ABUSE_KEY,
  expect,
  fixture,
  optionsUrl,
  PAGE_URL,
  FRAMED_URL,
  SECURE_URL,
  test,
  VT_KEY,
  type FakeRoute,
} from './fixtures';

/** Width and height from a PNG's header. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
import type { Worker } from '@playwright/test';

const KEYS = { apiKeys: { virustotal: VT_KEY, abuseipdb: ABUSE_KEY } };

const HAPPY_ROUTES: FakeRoute[] = [
  {
    prefix: 'https://api.abuseipdb.com/',
    responses: [{ status: 200, body: fixture('abuseipdb/check.json') }],
  },
  {
    prefix: 'https://www.virustotal.com/api/v3/ip_addresses/',
    responses: [{ status: 200, body: fixture('virustotal/ip.json') }],
  },
  {
    prefix: 'https://www.virustotal.com/api/v3/domains/',
    responses: [{ status: 200, body: fixture('virustotal/domain.json') }],
  },
  {
    prefix: 'https://www.virustotal.com/api/v3/files/',
    responses: [{ status: 200, body: fixture('virustotal/file.json') }],
  },
];

test.describe('in-page lookups', () => {
  test.beforeEach(async ({ api, settings }) => {
    await settings(KEYS);
    await api.routes(HAPPY_ROUTES);
  });

  test('shows every provider’s verdict next to the selection, despite a strict page CSP', async ({
    page,
    api,
    menuClick,
  }) => {
    await page.locator('#ip').selectText();
    await menuClick('185.220.101.4', 'all');

    const card = page.locator('x-4ntl-card .card');
    await expect(card).toBeVisible();
    await expect(card.locator('.ioc')).toHaveText('185.220.101.4');

    const abuse = card.locator('[data-provider="abuseipdb"]');
    await expect(abuse.locator('.pill')).toHaveText('Malicious');
    await expect(abuse.locator('.headline-value')).toHaveText('100%');
    await expect(abuse.locator('.tag')).toHaveText('Tor exit node');

    const vt = card.locator('[data-provider="virustotal"]');
    await expect(vt.locator('.headline-value')).toHaveText('14 / 94');
    await expect(vt.locator('a')).toHaveAttribute(
      'href',
      'https://www.virustotal.com/gui/ip-address/185.220.101.4',
    );

    // Styled (shadow-DOM styles are not blocked by the page's style-src 'none')...
    await expect(card).toHaveCSS('width', '320px');
    // ...and placed ~3 cm to the right of the selection, so it doesn't cover it.
    const [box, ip] = await Promise.all([card.boundingBox(), page.locator('#ip').boundingBox()]);
    expect(Math.abs((box?.x ?? 0) - ((ip?.x ?? 0) + (ip?.width ?? 0) + 113))).toBeLessThan(4);

    const calls = await api.calls();
    expect(calls.map((call) => call.url).sort()).toEqual([
      'https://api.abuseipdb.com/api/v2/check?ipAddress=185.220.101.4&maxAgeInDays=90',
      'https://www.virustotal.com/api/v3/ip_addresses/185.220.101.4',
    ]);
    expect(calls.find((call) => call.url.includes('abuseipdb'))?.headers.Key).toBe(ABUSE_KEY);
    expect(calls.find((call) => call.url.includes('virustotal'))?.headers['x-apikey']).toBe(VT_KEY);
  });

  test('reuses cached results instead of spending API quota', async ({ page, api, menuClick }) => {
    await menuClick('185.220.101.4', 'virustotal');
    await expect(page.locator('x-4ntl-card [data-verdict="malicious"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('x-4ntl-card')).toHaveCount(0);

    await menuClick('185.220.101.4', 'virustotal');
    await expect(page.locator('x-4ntl-card [data-verdict="malicious"]')).toBeVisible();
    expect(await api.calls()).toHaveLength(1);
  });

  test('lets the user pick when several indicators are selected', async ({
    page,
    api,
    menuClick,
  }) => {
    await page.locator('#multi').selectText();
    await menuClick('Seen 185.220.101.4 talking to evil[.]com', 'virustotal');

    const choices = page.locator('x-4ntl-card .choice');
    await expect(choices).toHaveCount(2);
    await choices.filter({ hasText: 'evil.com' }).click();

    await expect(page.locator('x-4ntl-card .ioc')).toHaveText('evil.com');
    await expect(page.locator('x-4ntl-card [data-provider="virustotal"] .pill')).toHaveText(
      'Clean',
    );
    expect((await api.calls()).map((call) => call.url)).toEqual([
      'https://www.virustotal.com/api/v3/domains/evil.com',
    ]);
  });

  test('never sends private addresses anywhere', async ({ page, api, menuClick }) => {
    await menuClick('10.0.0.1', 'all');
    const sections = page.locator('x-4ntl-card [data-error="private_address"]');
    await expect(sections).toHaveCount(2);
    await expect(sections.first().locator('.pill')).toHaveText('Skipped');
    expect(await api.calls()).toEqual([]);
  });

  test('explains unsupported combinations and empty selections', async ({ page, menuClick }) => {
    await menuClick(
      '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f',
      'abuseipdb',
    );
    await expect(page.locator('x-4ntl-card .message')).toHaveText(
      'AbuseIPDB only checks IP addresses.',
    );

    await menuClick('Nothing to see here', 'all');
    await expect(page.locator('x-4ntl-card .title')).toHaveText('No indicator found');
    await expect(page.locator('x-4ntl-card')).toHaveCount(1);
  });

  test('closes on Escape and on a click elsewhere', async ({ page, menuClick }) => {
    await menuClick('185.220.101.4', 'abuseipdb');
    await expect(page.locator('x-4ntl-card .card')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('x-4ntl-card')).toHaveCount(0);

    await menuClick('185.220.101.4', 'abuseipdb');
    await expect(page.locator('x-4ntl-card .card')).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.locator('x-4ntl-card')).toHaveCount(0);
  });

  test('shows country flags with the bundled font', async ({ page, menuClick }) => {
    await menuClick('185.220.101.4', 'abuseipdb');
    const card = page.locator('x-4ntl-card .card');
    await expect(card.locator('dd', { hasText: 'Germany (DE)' })).toHaveText('🇩🇪 Germany (DE)');
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.fonts].some((f) => f.family.includes('4NTL Flags') && f.status === 'loaded'),
        ),
      )
      .toBe(true);
  });

  test('saves to the list, offers both copy choices, and the list exports', async ({
    page,
    context,
    extensionId,
    menuClick,
  }) => {
    await menuClick('185.220.101.4', 'all');
    const card = page.locator('x-4ntl-card .card');
    await expect(card.locator('[data-provider="virustotal"][data-verdict]')).toBeVisible();

    await card.getByRole('button', { name: 'Copy…' }).click();
    await expect(card.getByRole('menuitem')).toHaveText([
      'Copy indicator',
      'Copy card as image',
      'Copy details as text',
    ]);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await card.getByRole('menuitem', { name: 'Copy details as text' }).click();
    await expect(card.getByRole('menu')).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Copied' })).toBeVisible();

    await card.getByRole('button', { name: 'Save to list' }).click();
    const opened = context.waitForEvent('page');
    await card.getByRole('button', { name: 'Saved · open the list' }).click();
    const list = await opened;
    await expect(list).toHaveURL(`chrome-extension://${extensionId}/list.html`);
    // What the card copied (on a plain-http page, via the fallback) is the full report.
    const report = await list.evaluate(() => navigator.clipboard.readText());
    expect(report).toContain('185.220.101.4 (IPv4)');
    expect(report).toContain('AbuseIPDB: Malicious, 100% abuse confidence');
    expect(report).toContain('VirusTotal: Malicious, 14 / 94');
    expect(report).toContain('Country: 🇩🇪 Germany (DE)');
    const row = list.locator('#rows tr');
    await expect(row).toHaveCount(1);
    await expect(row.locator('td').first()).toHaveText('185.220.101.4');
    await expect(row.locator('.verdict')).toHaveText('Malicious');
    await expect(row).toContainText('🇩🇪 Germany (DE)');

    await list.locator('#filter').selectOption('hash');
    await expect(list.locator('#rows tr')).toHaveCount(0);
    await list.locator('#filter').selectOption('ip');
    const download = list.waitForEvent('download');
    await list.getByRole('button', { name: 'Download CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/^4ntl-saved-\d{4}-\d{2}-\d{2}\.csv$/);

    await list.getByRole('button', { name: 'Remove 185.220.101.4' }).click();
    await expect(list.locator('#rows tr')).toHaveCount(0);
    await expect(list.locator('#empty')).toBeVisible();
  });

  test('copies the card itself as a picture (https page: to the clipboard)', async ({
    page,
    context,
    worker,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SECURE_URL });
    await page.goto(SECURE_URL);
    await worker.evaluate(
      (url) =>
        (
          globalThis as unknown as {
            __4ntl: { simulateMenuClick(u: string, s: string, p: string): Promise<unknown> };
          }
        ).__4ntl.simulateMenuClick(url, '185.220.101.4', 'all'),
      SECURE_URL,
    );
    const card = page.locator('x-4ntl-card .card');
    await expect(card.locator('[data-verdict]')).toHaveCount(2);
    const box = await card.boundingBox();
    await card.getByRole('button', { name: 'Copy…' }).click();
    await card.getByRole('menuitem', { name: 'Copy card as image' }).click();
    await expect(card.getByRole('button', { name: 'Copied' })).toBeVisible();
    const image = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read();
      if (!item?.types.includes('image/png')) return null;
      const bitmap = await createImageBitmap(await item.getType('image/png'));
      return { width: bitmap.width, height: bitmap.height };
    });
    expect(image).not.toBeNull();
    // The picture is the card: its size (at this window's 1x scale), within a pixel.
    expect(Math.abs((image?.width ?? 0) - Math.round(box?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((image?.height ?? 0) - Math.round(box?.height ?? 0))).toBeLessThanOrEqual(1);
  });

  test('a card inside a frame: the picture is still the card, not the area around it', async ({
    page,
    context,
    worker,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SECURE_URL });
    // The whole frame inside the window, whatever the OS fonts: the picture shows only what is on screen.
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto(FRAMED_URL);
    await page.frameLocator('iframe').locator('#ip').selectText();
    await worker.evaluate(
      (url) =>
        (
          globalThis as unknown as { __4ntl: { simulateShortcut(u: string): Promise<unknown> } }
        ).__4ntl.simulateShortcut(url),
      FRAMED_URL,
    );
    const card = page.frameLocator('iframe').locator('x-4ntl-card .card');
    await expect(card.locator('[data-verdict]')).toHaveCount(2);
    await page.waitForTimeout(200); // entrance animation
    const expected = (await card.screenshot()).toString('base64');
    await card.getByRole('button', { name: 'Copy…' }).click();
    await card.getByRole('menuitem', { name: 'Copy card as image' }).click();
    await expect(card.getByRole('status')).toHaveText(
      'Picture of the card copied: paste it into a ticket or chat.',
    );
    // Same size as the card, and the same pixels (a wrong crop differs everywhere).
    const diff = await page.evaluate(async (want) => {
      const [item] = await navigator.clipboard.read();
      if (!item) return null;
      const got = await createImageBitmap(await item.getType('image/png'));
      const ref = await createImageBitmap(
        new Blob([Uint8Array.from(atob(want), (c) => c.charCodeAt(0))], { type: 'image/png' }),
      );
      const pixels = (bitmap: ImageBitmap) => {
        const canvas = new OffscreenCanvas(ref.width, ref.height);
        const context2d = canvas.getContext('2d');
        if (!context2d) throw new Error('no canvas');
        context2d.drawImage(bitmap, 0, 0);
        return context2d.getImageData(0, 0, ref.width, ref.height).data;
      };
      const a = pixels(got);
      const b = pixels(ref);
      let total = 0;
      for (let i = 0; i < a.length; i++) total += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
      return {
        width: got.width - ref.width,
        height: got.height - ref.height,
        mean: total / a.length,
      };
    }, expected);
    expect(diff).not.toBeNull();
    expect(Math.abs(diff?.width ?? 99)).toBeLessThanOrEqual(1);
    expect(Math.abs(diff?.height ?? 99)).toBeLessThanOrEqual(1);
    expect(diff?.mean ?? 255).toBeLessThan(3);
  });

  test('on a plain http page, the card picture is saved as a file instead', async ({
    page,
    menuClick,
  }) => {
    await menuClick('185.220.101.4', 'all');
    const card = page.locator('x-4ntl-card .card');
    await expect(card.locator('[data-verdict]')).toHaveCount(2);
    const box = await card.boundingBox();
    await card.getByRole('button', { name: 'Copy…' }).click();
    const download = page.waitForEvent('download');
    await card.getByRole('menuitem', { name: 'Copy card as image' }).click();
    const file = await download;
    // The button label lasts 1.2 s, so check it before the (slower) file read.
    await expect(card.getByRole('button', { name: 'Saved to Downloads' })).toBeVisible();
    await expect(card.getByRole('status')).toContainText(
      'saved to Downloads as 4ntl-185.220.101.4.png',
    );
    expect(file.suggestedFilename()).toBe('4ntl-185.220.101.4.png');
    const size = pngSize(await readFile(await file.path()));
    expect(Math.abs(size.width - Math.round(box?.width ?? 0))).toBeLessThanOrEqual(1);
    expect(size.height).toBeGreaterThan(200);
  });

  test('the keyboard shortcut looks up the current selection', async ({ page, worker }) => {
    await page.locator('#hash').selectText();
    await worker.evaluate(
      (url) =>
        (
          globalThis as unknown as { __4ntl: { simulateShortcut(u: string): Promise<void> } }
        ).__4ntl.simulateShortcut(url),
      PAGE_URL,
    );
    await expect(page.locator('x-4ntl-card .type')).toHaveText('SHA-256');
    await expect(
      page.locator('x-4ntl-card [data-provider="virustotal"] .headline-value'),
    ).toHaveText('64 / 67');
    // AbuseIPDB can't check hashes, so "all" only asks VirusTotal.
    await expect(page.locator('x-4ntl-card [data-provider]')).toHaveCount(1);
  });
});

test.describe('failures', () => {
  test('rate limits offer a retry that bypasses the cache', async ({
    page,
    api,
    settings,
    menuClick,
  }) => {
    await settings(KEYS);
    await api.routes([
      {
        prefix: 'https://www.virustotal.com/',
        responses: [
          { status: 429, body: fixture('virustotal/quota.json') },
          { status: 200, body: fixture('virustotal/ip.json') },
        ],
      },
    ]);
    await menuClick('185.220.101.4', 'virustotal');
    const section = page.locator('x-4ntl-card [data-provider="virustotal"]');
    await expect(section.locator('.pill')).toHaveText('Rate limited');
    await section.getByRole('button', { name: 'Retry' }).click();
    await expect(section.locator('.pill')).toHaveText('Malicious');
  });

  test('a missing API key leads to the settings page', async ({
    page,
    context,
    extensionId,
    api,
    menuClick,
  }) => {
    await api.routes([]);
    await menuClick('185.220.101.4', 'virustotal');
    const button = page.locator('x-4ntl-card').getByRole('button', { name: 'Open settings' });
    await expect(button).toBeVisible();
    const settingsTabs = () => context.pages().filter((p) => p.url() === optionsUrl(extensionId));
    await Promise.all(settingsTabs().map((tab) => tab.close()));
    await button.click();
    await expect.poll(() => settingsTabs().length).toBe(1);
    expect(await api.calls()).toEqual([]);
  });

  test('pages that cannot host the card get a small result window instead', async ({
    context,
    worker,
    api,
    settings,
  }) => {
    await settings(KEYS);
    await api.routes(HAPPY_ROUTES);
    const [popup] = await Promise.all([
      context.waitForEvent('page', { predicate: (p) => p.url().includes('/result.html#') }),
      worker.evaluate(async () => {
        // Browser pages (like the PDF viewer or the Web Store) can't be scripted by extensions.
        const tab = await chrome.tabs.create({ url: 'chrome://version/' });
        await new Promise((resolve) => setTimeout(resolve, 300));
        const state = globalThis as unknown as {
          __4ntl: { simulateMenuClick(t: number, s: string, p: string): Promise<unknown> };
        };
        await state.__4ntl.simulateMenuClick(tab.id ?? -1, '185.220.101.4', 'abuseipdb');
      }),
    ]);
    await expect(popup).toHaveURL(/result\.html#/);
    await expect(popup.locator('x-4ntl-card [data-provider="abuseipdb"] .pill')).toHaveText(
      'Malicious',
    );
  });
});

test.describe('links', () => {
  const linkClick = (worker: Worker, linkUrl: string) =>
    worker.evaluate(
      ([url, link]) =>
        (
          globalThis as unknown as {
            __4ntl: { simulateLinkClick(t: string, l: string): Promise<void> };
          }
        ).__4ntl.simulateLinkClick(url, link),
      [PAGE_URL, linkUrl] as const,
    );

  test('right-clicking a link checks its URL on VirusTotal, next to the link', async ({
    page,
    worker,
    api,
    settings,
  }) => {
    await settings(KEYS);
    await api.routes([
      {
        prefix: 'https://www.virustotal.com/api/v3/urls/',
        responses: [{ status: 200, body: fixture('virustotal/url.json') }],
      },
    ]);
    const link = page.locator('#link');
    await link.hover();
    await linkClick(worker, 'http://malware.wicar.org/data/eicar.com');

    const card = page.locator('x-4ntl-card .card');
    await expect(card.locator('.type')).toHaveText('URL');
    await expect(card.locator('[data-provider]')).toHaveCount(1);
    await expect(card.locator('[data-provider="virustotal"] .pill')).toHaveText('Suspicious');
    const [cardBox, linkBox] = await Promise.all([card.boundingBox(), link.boundingBox()]);
    // ~3 cm to the right of the link, level with it.
    expect(
      Math.abs((cardBox?.x ?? 0) - ((linkBox?.x ?? 0) + (linkBox?.width ?? 0) + 113)),
    ).toBeLessThan(4);
    expect(Math.abs((cardBox?.y ?? 0) - ((linkBox?.y ?? 0) - 24))).toBeLessThan(4);
  });

  test('links to internal hosts never leave the network', async ({
    page,
    worker,
    api,
    settings,
  }) => {
    await settings(KEYS);
    await api.routes([]);
    await page.locator('#intranet').hover();
    await linkClick(worker, 'https://siem.corp/search?q=ws-0442');
    await expect(page.locator('x-4ntl-card [data-error="private_address"] .pill')).toHaveText(
      'Skipped',
    );
    expect(await api.calls()).toEqual([]);
  });
});
