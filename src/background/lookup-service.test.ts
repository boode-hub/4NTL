import { describe, expect, it, vi } from 'vitest';
import { MemoryStore, NOW, TEST_SETTINGS } from '../../tests/helpers';
import { TtlCache } from '../core/cache';
import { LookupError } from '../core/errors';
import type { Indicator } from '../core/indicator';
import type { Report } from '../core/result';
import { normalizeSettings, type Settings } from '../core/settings';
import { PROVIDERS } from '../providers/registry';
import type { Provider } from '../providers/types';
import { LookupService, SHARE_WINDOW_MS } from './lookup-service';

const IP: Indicator = { type: 'ipv4', value: '185.220.101.4' };
const DOMAIN: Indicator = { type: 'domain', value: 'evil.com' };

const REPORT: Report = {
  verdict: 'malicious',
  headline: '9 / 90',
  caption: 'x',
  tags: [],
  facts: [],
  reportUrl: 'https://example.test/report',
};

function setup(options: { settings?: Settings; lookup?: Provider['lookup'] } = {}) {
  let now = NOW;
  const lookup = vi.fn(options.lookup ?? (() => Promise.resolve(REPORT)));
  const fake: Provider = { ...PROVIDERS.virustotal, lookup };
  const cache = new TtlCache<Report>(new MemoryStore(), {
    prefix: 'c:',
    maxEntries: 50,
    now: () => now,
  });
  const service = new LookupService({
    cache,
    loadSettings: () => Promise.resolve(options.settings ?? TEST_SETTINGS),
    fetch: vi.fn(),
    providers: { ...PROVIDERS, virustotal: fake },
    now: () => now,
    timeoutMs: 1234,
  });
  return {
    service,
    lookup,
    cache,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('LookupService', () => {
  it('calls the provider with the key, settings and injected dependencies', async () => {
    const { service, lookup } = setup();
    const outcome = await service.lookup('virustotal', IP);
    expect(outcome).toEqual({ ok: true, report: REPORT, fetchedAt: NOW, cached: false });
    expect(lookup).toHaveBeenCalledWith(
      IP,
      expect.objectContaining({
        apiKey: TEST_SETTINGS.apiKeys.virustotal,
        settings: TEST_SETTINGS,
        timeoutMs: 1234,
      }),
    );
  });

  it('serves repeat lookups from the cache until the TTL passes', async () => {
    const { service, lookup, advance } = setup();
    await service.lookup('virustotal', IP);
    advance(60_000);
    expect(await service.lookup('virustotal', IP)).toEqual({
      ok: true,
      report: REPORT,
      fetchedAt: NOW,
      cached: true,
    });
    expect(lookup).toHaveBeenCalledTimes(1);

    advance(TEST_SETTINGS.cacheTtlMinutes * 60_000);
    expect(await service.lookup('virustotal', IP)).toMatchObject({ ok: true, cached: false });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache when forced (Retry)', async () => {
    const { service, lookup } = setup();
    await service.lookup('virustotal', IP);
    expect(await service.lookup('virustotal', IP, { force: true })).toMatchObject({
      cached: false,
    });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('does not cache when caching is disabled', async () => {
    const { service, lookup, advance } = setup({
      settings: { ...TEST_SETTINGS, cacheTtlMinutes: 0 },
    });
    await service.lookup('virustotal', IP);
    advance(SHARE_WINDOW_MS);
    await service.lookup('virustotal', IP);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent identical lookups into one request', async () => {
    let release: (report: Report) => void = () => undefined;
    const { service, lookup } = setup({
      lookup: () => new Promise((resolve) => (release = resolve)),
    });
    const first = service.lookup('virustotal', IP);
    const second = service.lookup('virustotal', IP);
    expect(second).toBe(first);
    // A forced retry still joins a request that hasn't finished yet.
    expect(service.lookup('virustotal', IP, { force: true })).toBe(first);
    await vi.waitFor(() => {
      expect(lookup).toHaveBeenCalled();
    });
    release(REPORT);
    await Promise.all([first, second]);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('shares a just-settled failure instead of calling the API again', async () => {
    const { service, lookup, advance } = setup({
      lookup: () => Promise.reject(new LookupError('rate_limited', 'Slow down')),
    });
    const prewarm = await service.lookup('virustotal', IP); // started on click
    advance(SHARE_WINDOW_MS - 1);
    expect(await service.lookup('virustotal', IP)).toBe(prewarm); // asked by the card
    expect(lookup).toHaveBeenCalledTimes(1);

    expect(await service.lookup('virustotal', IP, { force: true })).not.toBe(prewarm); // Retry
    expect(lookup).toHaveBeenCalledTimes(2);

    advance(SHARE_WINDOW_MS);
    await service.lookup('virustotal', IP);
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it('never sends private or reserved addresses to a provider', async () => {
    const { service, lookup } = setup();
    for (const value of ['10.0.0.1', '192.168.1.1', '127.0.0.1']) {
      expect(await service.lookup('virustotal', { type: 'ipv4', value })).toEqual({
        ok: false,
        error: {
          code: 'private_address',
          message: expect.stringContaining('never sent') as unknown,
        },
      });
    }
    expect(await service.lookup('virustotal', { type: 'ipv6', value: 'fe80::1' })).toMatchObject({
      error: { code: 'private_address' },
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('explains unsupported indicator types without calling anything', async () => {
    const { service } = setup();
    expect(await service.lookup('abuseipdb', DOMAIN)).toEqual({
      ok: false,
      error: { code: 'unsupported', message: 'AbuseIPDB only checks IP addresses.' },
    });
  });

  it('asks for a missing API key and links to the provider', async () => {
    const { service, lookup } = setup({ settings: normalizeSettings({}) });
    expect(await service.lookup('virustotal', IP)).toEqual({
      ok: false,
      error: {
        code: 'no_api_key',
        message: 'Add your VirusTotal API key to look this up.',
        reportUrl: 'https://www.virustotal.com/gui/ip-address/185.220.101.4',
      },
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('turns provider errors into failures and does not cache them', async () => {
    const { service, lookup, advance } = setup({
      lookup: () => Promise.reject(new LookupError('rate_limited', 'Slow down', 30)),
    });
    expect(await service.lookup('virustotal', IP)).toEqual({
      ok: false,
      error: {
        code: 'rate_limited',
        message: 'Slow down',
        retryAfterSec: 30,
        reportUrl: 'https://www.virustotal.com/gui/ip-address/185.220.101.4',
      },
    });
    advance(SHARE_WINDOW_MS);
    await service.lookup('virustotal', IP);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('still returns the result when caching fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { service, cache } = setup();
    vi.spyOn(cache, 'set').mockRejectedValue(new Error('QUOTA_BYTES exceeded'));
    expect(await service.lookup('virustotal', IP)).toMatchObject({ ok: true, report: REPORT });
    expect(warn).toHaveBeenCalled();
  });

  it('reports unexpected exceptions as internal errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service } = setup({ lookup: () => Promise.reject(new TypeError('boom')) });
    expect(await service.lookup('virustotal', IP)).toMatchObject({
      ok: false,
      error: { code: 'internal' },
    });
  });

  it('uses real defaults when optional dependencies are omitted', async () => {
    const service = new LookupService({
      cache: { get: () => Promise.resolve(undefined), set: () => Promise.resolve() },
      loadSettings: () => Promise.resolve(normalizeSettings({})),
      fetch: vi.fn(),
    });
    expect(await service.lookup('abuseipdb', IP)).toMatchObject({
      ok: false,
      error: { code: 'no_api_key' },
    });
  });
});
