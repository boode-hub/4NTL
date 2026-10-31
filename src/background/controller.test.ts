import { describe, expect, it, vi } from 'vitest';
import type { LookupOutcome } from '../core/result';
import { handleLookupRequest, type ControllerDeps } from './controller';

function deps(inPage: boolean) {
  const lookup = vi.fn((): Promise<LookupOutcome> =>
    Promise.resolve({ ok: false, error: { code: 'internal', message: '' } }),
  );
  const presentInPage = vi.fn<ControllerDeps['presentInPage']>(() => Promise.resolve(inPage));
  const presentInWindow = vi.fn(() => Promise.resolve());
  const value: ControllerDeps = { service: { lookup }, presentInPage, presentInWindow };
  return { value, lookup, presentInPage, presentInWindow };
}

const target = { tabId: 7, frameId: 3 };

describe('handleLookupRequest', () => {
  it('starts every lookup before showing the card in the page', async () => {
    const d = deps(true);
    const view = await handleLookupRequest({ target, selection: '8.8.8.8', scope: 'all' }, d.value);
    expect(d.lookup.mock.calls.map((call) => call as unknown[])).toEqual([
      ['abuseipdb', { type: 'ipv4', value: '8.8.8.8' }],
      ['virustotal', { type: 'ipv4', value: '8.8.8.8' }],
    ]);
    expect(d.lookup.mock.invocationCallOrder[0]).toBeLessThan(
      d.presentInPage.mock.invocationCallOrder[0] ?? 0,
    );
    expect(d.presentInPage).toHaveBeenCalledWith(target, view, false);
    expect(d.presentInWindow).not.toHaveBeenCalled();
  });

  it('falls back to a window when the page cannot host the card', async () => {
    const d = deps(false);
    const view = await handleLookupRequest(
      { target, selection: 'evil.com', scope: 'virustotal' },
      d.value,
    );
    expect(d.presentInWindow).toHaveBeenCalledWith(view);
  });

  it('tries the top page when an embedded frame cannot host the card', async () => {
    const d = deps(false);
    d.presentInPage.mockImplementation((t) => Promise.resolve(t.frameId === 0));
    const view = await handleLookupRequest({ target, selection: '8.8.8.8', scope: 'all' }, d.value);
    expect(d.presentInPage).toHaveBeenLastCalledWith({ tabId: 7, frameId: 0 }, view, true);
    expect(d.presentInWindow).not.toHaveBeenCalled();
  });

  it('uses the window directly when there is no tab', async () => {
    const d = deps(true);
    await handleLookupRequest({ target: undefined, selection: 'evil.com', scope: 'all' }, d.value);
    expect(d.presentInPage).not.toHaveBeenCalled();
    expect(d.presentInWindow).toHaveBeenCalled();
  });

  it('does not start lookups for choices or notices', async () => {
    const d = deps(true);
    await handleLookupRequest({ target, selection: '1.1.1.1 8.8.8.8', scope: 'all' }, d.value);
    await handleLookupRequest({ target, selection: 'nothing', scope: 'all' }, d.value);
    expect(d.lookup).not.toHaveBeenCalled();
    expect(d.presentInPage).toHaveBeenCalledTimes(2);
  });
});
