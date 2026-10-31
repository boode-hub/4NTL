import type { Access } from '../core/license';
import { describe, expect, it, vi } from 'vitest';
import { flush } from '../../tests/helpers';
import type { LookupOutcome } from '../core/result';
import { createMessageRouter } from './router';

const OK: LookupOutcome = {
  ok: true,
  report: {
    verdict: 'clean',
    headline: '0',
    caption: '',
    tags: [],
    facts: [],
    reportUrl: 'https://x',
  },
  fetchedAt: 1,
  cached: false,
};

function setup() {
  const lookup = vi.fn(() => Promise.resolve(OK));
  const openOptions = vi.fn(() => Promise.resolve());
  const openList = vi.fn(() => Promise.resolve());
  const access = vi.fn<(refresh: boolean) => Promise<Access>>(() =>
    Promise.resolve({ status: 'open' }),
  );
  const license = {
    access,
    unlock: vi.fn(() => Promise.resolve()),
    restore: vi.fn(() => Promise.resolve()),
  };
  const onCaptured = vi.fn(() => Promise.resolve());
  const route = createMessageRouter({
    extensionId: 'ext',
    service: { lookup },
    openOptions,
    openList,
    license,
    onCaptured,
  });
  const sendResponse = vi.fn();
  const fromUs = { id: 'ext' } as chrome.runtime.MessageSender;
  return { route, lookup, openOptions, openList, license, onCaptured, sendResponse, fromUs };
}

const lookupMessage = (value: string, type = 'ipv4', force = false) => ({
  type: '4ntl:lookup',
  provider: 'virustotal',
  indicator: { type, value },
  force,
});

describe('message router', () => {
  it('runs lookups and answers asynchronously', async () => {
    const { route, lookup, sendResponse, fromUs } = setup();
    expect(route(lookupMessage('8.8.8.8', 'ipv4', true), fromUs, sendResponse)).toBe(true);
    await flush();
    expect(lookup).toHaveBeenCalledWith(
      'virustotal',
      { type: 'ipv4', value: '8.8.8.8' },
      { force: true },
    );
    expect(sendResponse).toHaveBeenCalledWith(OK);
  });

  it('rejects indicators that are not canonical output of the parser', () => {
    const { route, lookup, sendResponse, fromUs } = setup();
    for (const message of [
      lookupMessage('not an ip'),
      lookupMessage('evil.com', 'ipv4'),
      lookupMessage('8.8.8.8:53'),
    ]) {
      expect(route(message, fromUs, sendResponse)).toBe(false);
    }
    expect(lookup).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: { code: 'invalid_indicator', message: 'Not a valid indicator.' },
    });
  });

  it('opens the settings page', () => {
    const { route, openOptions, sendResponse, fromUs } = setup();
    expect(route({ type: '4ntl:open-options' }, fromUs, sendResponse)).toBe(false);
    expect(openOptions).toHaveBeenCalled();
  });

  it('refuses card lookups while locked, without touching the providers', async () => {
    const { route, lookup, license, sendResponse, fromUs } = setup();
    license.access.mockResolvedValue({ status: 'locked' });
    const message = {
      type: '4ntl:lookup',
      provider: 'virustotal',
      indicator: { type: 'ipv4', value: '8.8.8.8' },
      force: false,
    };
    expect(route(message, fromUs, sendResponse)).toBe(true);
    await flush();
    expect(lookup).not.toHaveBeenCalled();
    const [response] = sendResponse.mock.calls[0] as [{ ok: boolean; error?: { code: string } }];
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('payment_required');
  });

  it('answers license questions and opens the checkout / restore pages', async () => {
    const { route, license, sendResponse, fromUs } = setup();
    license.access.mockResolvedValue({ status: 'paid' });
    expect(route({ type: '4ntl:license', refresh: true }, fromUs, sendResponse)).toBe(true);
    await flush();
    expect(license.access).toHaveBeenCalledWith(true);
    expect(sendResponse).toHaveBeenCalledWith({ access: { status: 'paid' } });
    route({ type: '4ntl:unlock' }, fromUs, sendResponse);
    route({ type: '4ntl:restore' }, fromUs, sendResponse);
    expect(license.unlock).toHaveBeenCalled();
    expect(license.restore).toHaveBeenCalled();
    expect(route({ type: '4ntl:license' }, fromUs, sendResponse)).toBe(false);
  });

  it('opens the saved list', () => {
    const { route, openList, sendResponse, fromUs } = setup();
    expect(route({ type: '4ntl:open-list' }, fromUs, sendResponse)).toBe(false);
    expect(openList).toHaveBeenCalled();
  });

  it('ignores other extensions and malformed messages', () => {
    const { route, lookup, sendResponse } = setup();
    expect(route(lookupMessage('8.8.8.8'), { id: 'other' }, sendResponse)).toBe(false);
    expect(route({ type: 'nope' }, { id: 'ext' }, sendResponse)).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('captured navigations', () => {
  it('hands URLs caught in a tab to the link checker', async () => {
    const { route, onCaptured, sendResponse } = setup();
    const fromTab = { id: 'ext', tab: { id: 4 }, frameId: 1 } as chrome.runtime.MessageSender;
    route({ type: '4ntl:captured', url: 'https://evil.com/' }, fromTab, sendResponse);
    await flush();
    expect(onCaptured).toHaveBeenCalledWith('https://evil.com/', fromTab);
  });

  it('ignores captures that did not come from a tab', () => {
    const { route, onCaptured, sendResponse, fromUs } = setup();
    route({ type: '4ntl:captured', url: 'https://evil.com/' }, fromUs, sendResponse);
    expect(onCaptured).not.toHaveBeenCalled();
  });
});
