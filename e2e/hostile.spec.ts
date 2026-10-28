/** The card on a page built to break extensions (see HOSTILE in fixtures.ts). */
import { ABUSE_KEY, expect, fixture, HOSTILE_URL, test, VT_KEY, type FakeRoute } from './fixtures';

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

test('the card stays usable, visible and on top on a sabotaging page', async ({
  page,
  worker,
  api,
  settings,
}) => {
  await settings({ apiKeys: { virustotal: VT_KEY, abuseipdb: ABUSE_KEY } });
  await api.routes(ROUTES);
  await page.goto(HOSTILE_URL);
  await worker.evaluate(
    ([url]) =>
      (
        globalThis as unknown as {
          __4ntl: { simulateMenuClick(u: string, s: string, p: string): Promise<unknown> };
        }
      ).__4ntl.simulateMenuClick(url, '185.220.101.4', 'all'),
    [HOSTILE_URL] as const,
  );

  const card = page.locator('x-4ntl-card .card');
  // Works despite JSON.parse, Array.prototype.map, attachShadow and createElement being broken.
  await expect(card.locator('[data-provider="virustotal"] .headline-value')).toHaveText('14 / 94');
  await page.waitForTimeout(300); // let the page's sabotage timer run a few times

  const state = await page.evaluate(() => {
    const host = document.querySelector('x-4ntl-card');
    if (!host) return null;
    const box = host.getBoundingClientRect();
    const style = getComputedStyle(host);
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + 20);
    return {
      inViewport:
        box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight,
      onTop: top === host,
      opacity: style.opacity,
      transform: style.transform,
      pointerEvents: style.pointerEvents,
      filter: style.filter,
    };
  });
  expect(state).toEqual({
    inViewport: true,
    onTop: true, // above the max-z-index overlay
    opacity: '1',
    transform: 'none',
    pointerEvents: 'auto',
    filter: 'none',
  });

  // Clickable through the page's overlay and pointer-events sabotage.
  await card.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('x-4ntl-card')).toHaveCount(0);
});
