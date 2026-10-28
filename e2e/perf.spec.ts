/**
 * Speed, memory and durability in a real browser. Limits are generous (CI
 * machines vary); measured numbers are printed so regressions are visible.
 */
import type { Page, Worker } from '@playwright/test';
import {
  ABUSE_KEY,
  expect,
  fixture,
  installFakeApi,
  PAGE_URL,
  test,
  VT_KEY,
  type FakeRoute,
} from './fixtures';

const ROUTES: FakeRoute[] = [
  {
    prefix: 'https://api.abuseipdb.com/',
    responses: [{ status: 200, body: fixture('abuseipdb/check.json') }],
  },
  {
    prefix: 'https://www.virustotal.com/api/v3/ip_addresses/',
    responses: [{ status: 200, body: fixture('virustotal/ip.json') }],
  },
];

const menuClick = (worker: Worker, selection: string) =>
  worker.evaluate(
    ([url, text]) =>
      (
        globalThis as unknown as {
          __4ntl: { simulateMenuClick(u: string, s: string, p: string): Promise<unknown> };
        }
      ).__4ntl.simulateMenuClick(url, text, 'all'),
    [PAGE_URL, selection] as const,
  );

/** Milliseconds from the menu click until both verdicts are on screen; then closes the card. */
async function timedLookup(page: Page, worker: Worker, ip: string): Promise<number> {
  await page.evaluate(() => {
    (window as unknown as { t0: number }).t0 = performance.now();
  });
  await menuClick(worker, ip);
  const handle = await page.waitForFunction(
    () => {
      const root = document.querySelector('x-4ntl-card')?.shadowRoot;
      const done = root?.querySelectorAll('[data-verdict]').length === 2;
      return done ? performance.now() - (window as unknown as { t0: number }).t0 : false;
    },
    undefined,
    { polling: 'raf' },
  );
  const ms = (await handle.jsonValue()) as number;
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('x-4ntl-card'));
  return ms;
}

const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ??
  0;

test('time to card, and no memory or listener leaks over 100 lookups', async ({
  page,
  worker,
  settings,
}) => {
  test.setTimeout(120_000);
  await settings({ apiKeys: { virustotal: VT_KEY, abuseipdb: ABUSE_KEY } });
  await installFakeApi(worker, ROUTES);
  await page.goto(PAGE_URL);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => {
    // Several passes: one pass leaves recently closed cards uncollected.
    for (let pass = 0; pass < 3; pass++) await cdp.send('HeapProfiler.collectGarbage');
    const { metrics: list } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(list.map((m) => [m.name, m.value]));
  };

  const firstMs = await timedLookup(page, worker, '185.220.101.1'); // includes injecting the UI
  for (let i = 2; i <= 4; i++) await timedLookup(page, worker, `185.220.101.${i}`);
  const before = await metrics();

  const times: number[] = [];
  for (let i = 0; i < 100; i++) times.push(await timedLookup(page, worker, `185.220.102.${i}`));
  const after = await metrics();

  const report = {
    firstCardMs: Math.round(firstMs),
    medianMs: Math.round(percentile(times, 0.5)),
    p95Ms: Math.round(percentile(times, 0.95)),
    heapGrowthKB: Math.round(((after.JSHeapUsedSize ?? 0) - (before.JSHeapUsedSize ?? 0)) / 1024),
    nodeGrowth: (after.Nodes ?? 0) - (before.Nodes ?? 0),
    listenerGrowth: (after.JSEventListeners ?? 0) - (before.JSEventListeners ?? 0),
  };
  console.log('4NTL performance:', JSON.stringify(report));

  expect(report.firstCardMs).toBeLessThan(2000);
  expect(report.medianMs).toBeLessThan(500);
  expect(report.p95Ms).toBeLessThan(1000);
  // 100 cards opened and closed: nothing may accumulate.
  expect(report.nodeGrowth).toBeLessThan(100);
  expect(report.listenerGrowth).toBeLessThan(10);
  expect(report.heapGrowthKB).toBeLessThan(2048);
});

test('after an update, leftovers from the old version are replaced by one working card', async ({
  page,
  worker,
  settings,
}) => {
  // (The test harness can't reload a command-line extension in place, so the
  // old version's leftovers are planted directly: an orphaned card in the page.)
  await settings({ apiKeys: { virustotal: VT_KEY, abuseipdb: ABUSE_KEY } });
  await installFakeApi(worker, ROUTES);
  await page.goto(PAGE_URL);
  await page.evaluate(() => {
    const orphan = document.createElement('x-4ntl-card');
    orphan.textContent = 'stale card from a previous version';
    document.documentElement.append(orphan);
  });

  const ms = await timedLookup(page, worker, '185.220.101.5');
  expect(ms).toBeLessThan(3000);
  await menuClick(worker, '185.220.101.6');
  await expect(page.locator('x-4ntl-card')).toHaveCount(1);
  await expect(page.getByText('stale card from a previous version')).toHaveCount(0);
});
