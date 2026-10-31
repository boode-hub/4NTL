import { expect, fixture, openSettings, test, VT_KEY } from './fixtures';

test.describe('settings page', () => {
  test('saves keys and options automatically and clears the setup badge', async ({
    context,
    extensionId,
    worker,
  }) => {
    const page = await openSettings(context, extensionId);

    const badge = () => worker.evaluate(() => chrome.action.getBadgeText({}));
    await expect.poll(badge).toBe('!');

    await page.getByLabel('VirusTotal').fill(VT_KEY);
    await page.getByLabel('Reuse results for').fill('5000');
    await page.getByLabel('Reuse results for').blur();
    await expect(page.locator('#toast')).toHaveText('Saved');
    // Out-of-range numbers are clamped and shown as saved.
    await expect(page.getByLabel('Reuse results for')).toHaveValue('1440');

    const stored = await worker.evaluate(() => chrome.storage.local.get('settings.v1'));
    expect(stored['settings.v1']).toMatchObject({
      apiKeys: { virustotal: VT_KEY, abuseipdb: '' },
      cacheTtlMinutes: 1440,
      abuseIpdbMaxAgeDays: 90,
    });
    await expect.poll(badge).toBe('');

    // Reloading shows what was saved.
    await page.reload();
    await expect(page.getByLabel('VirusTotal')).toHaveValue(VT_KEY);
  });

  test('warns about malformed keys and tests a key against the provider', async ({
    context,
    extensionId,
  }) => {
    const page = await openSettings(context, extensionId);
    // Options-page requests go through the page's own fetch; fake the provider there.
    await context.route('https://www.virustotal.com/api/v3/users/**', (route) =>
      route.fulfill({ json: fixture('virustotal/overall-quotas.json') }),
    );

    const status = page.locator('#key-virustotal-status');
    await page.getByLabel('VirusTotal').fill('too-short');
    await expect(status).toContainText("doesn't look like a VirusTotal key");

    await page.getByLabel('VirusTotal').fill(VT_KEY);
    await expect(status).toHaveText('');
    await page.locator('[data-test="virustotal"]').click();
    await expect(status).toHaveText('Key is valid · 37 of 500 daily lookups used.');
  });

  test('shows the keyboard shortcut and version', async ({ context, extensionId }) => {
    const page = await openSettings(context, extensionId);
    await expect(page.locator('#shortcut')).toHaveText(/Alt\+Shift\+L|not set/);
    await expect(page.locator('#version')).toHaveText(/^\d+\.\d+\.\d+$/);
  });
});

test('the GitHub edition never mentions payment: Support instead of a license', async ({
  context,
  extensionId,
}) => {
  const page = await openSettings(context, extensionId);
  await expect(page.locator('#license-panel')).toBeHidden();
  await expect(page.getByRole('link', { name: '♥ Sponsor' })).toHaveAttribute(
    'href',
    'https://github.com/sponsors/boode-hub',
  );
  await expect(page.locator('main')).not.toContainText('$2', { useInnerText: true }); // shown text only
});

test('the free edition records the install date, so early users stay free in the paid update', async ({
  worker,
}) => {
  await expect
    .poll(() =>
      worker.evaluate(async () => (await chrome.storage.sync.get('firstSeen.v1'))['firstSeen.v1']),
    )
    .toEqual(expect.any(Number));
});

test('the Sharingan theme and a custom color apply to the preview and to page cards', async ({
  context,
  extensionId,
  worker,
  page,
  api,
  menuClick,
}) => {
  const options = await openSettings(context, extensionId);

  await options.getByLabel('Sharingan').check();
  await expect(options.locator('html')).toHaveAttribute('data-theme', 'sharingan');
  const preview = options.locator('#preview x-4ntl-card .card');
  await expect(preview).toHaveAttribute('data-theme', 'sharingan');
  await expect(preview.locator('.eye')).toBeVisible();
  await expect(preview.locator('[data-provider="virustotal"] .headline-value')).toHaveText(
    '14 / 94',
  );

  await options.getByLabel('Accent color').fill('#8b5cf6');
  await expect(preview).toHaveCSS('--accent', '#8b5cf6');
  await expect
    .poll(() => worker.evaluate(() => chrome.storage.local.get('settings.v1')))
    .toMatchObject({ 'settings.v1': { appearance: { theme: 'sharingan', accent: '#8b5cf6' } } });

  await api.routes([]);
  await menuClick('185.220.101.4', 'virustotal');
  const card = page.locator('x-4ntl-card .card');
  await expect(card).toHaveAttribute('data-theme', 'sharingan');
  await expect(card).toHaveCSS('--accent', '#8b5cf6');
  await expect(card.locator('.eye')).toBeVisible();

  await options.getByRole('button', { name: 'Reset accent' }).click();
  await expect(options.getByLabel('Accent color')).toHaveValue('#ff2d3d');

  await options.getByLabel('Card background').fill('#f5f0e6');
  await expect(preview).toHaveCSS('--bg', '#f5f0e6');
  await expect(preview).toHaveAttribute('data-surface', 'light');
  await options.getByRole('button', { name: 'Reset background' }).click();
  await expect(options.getByLabel('Card background')).toHaveValue('#0d0a0b');
  await expect(preview).not.toHaveAttribute('data-surface', /./);
});
