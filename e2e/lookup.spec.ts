import {
  ABUSE_KEY,
  expect,
  fixture,
  optionsUrl,
  PAGE_URL,
  test,
  VT_KEY,
  type FakeRoute,
} from './fixtures';
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
    // ...and placed ~5 cm to the right of the selection, so it doesn't cover it.
    const [box, ip] = await Promise.all([card.boundingBox(), page.locator('#ip').boundingBox()]);
    expect(Math.abs((box?.x ?? 0) - ((ip?.x ?? 0) + (ip?.width ?? 0) + 190))).toBeLessThan(4);

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
    // ~5 cm to the right of the link, level with it.
    expect(
      Math.abs((cardBox?.x ?? 0) - ((linkBox?.x ?? 0) + (linkBox?.width ?? 0) + 190)),
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
