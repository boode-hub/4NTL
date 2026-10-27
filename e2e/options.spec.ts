import { expect, fixture, optionsUrl, test, VT_KEY } from './fixtures';

test.describe('settings page', () => {
  test('saves keys and options automatically and clears the setup badge', async ({
    context,
    extensionId,
    worker,
  }) => {
    const page = await context.newPage();
    await page.goto(optionsUrl(extensionId));

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
    const page = await context.newPage();
    // Options-page requests go through the page's own fetch; fake the provider there.
    await context.route('https://www.virustotal.com/api/v3/users/**', (route) =>
      route.fulfill({ json: fixture('virustotal/overall-quotas.json') }),
    );
    await page.goto(optionsUrl(extensionId));

    const status = page.locator('#key-virustotal-status');
    await page.getByLabel('VirusTotal').fill('too-short');
    await expect(status).toContainText("doesn't look like a VirusTotal key");

    await page.getByLabel('VirusTotal').fill(VT_KEY);
    await expect(status).toHaveText('');
    await page.locator('[data-test="virustotal"]').click();
    await expect(status).toHaveText('Key is valid · 37 of 500 daily lookups used.');
  });

  test('shows the keyboard shortcut and version', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(optionsUrl(extensionId));
    await expect(page.locator('#shortcut')).toHaveText(/Alt\+Shift\+L|not set/);
    await expect(page.locator('#version')).toHaveText(/^\d+\.\d+\.\d+$/);
  });
});

test('the Sharingan theme and a custom color apply to the preview and to page cards', async ({
  context,
  extensionId,
  worker,
  page,
  api,
  menuClick,
}) => {
  const options = await context.newPage();
  await options.goto(optionsUrl(extensionId));

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

  await options.getByRole('button', { name: 'Use theme color' }).click();
  await expect(options.getByLabel('Accent color')).toHaveValue('#ff2d3d');
});
