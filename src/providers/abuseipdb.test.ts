import { describe, expect, it } from 'vitest';
import authFixture from '../../tests/fixtures/abuseipdb/auth-error.json';
import checkFixture from '../../tests/fixtures/abuseipdb/check.json';
import cleanFixture from '../../tests/fixtures/abuseipdb/clean.json';
import invalidFixture from '../../tests/fixtures/abuseipdb/invalid-ip.json';
import rateLimitFixture from '../../tests/fixtures/abuseipdb/rate-limit.json';
import { fakeFetch, jsonResponse, NOW, providerContext, TEST_SETTINGS } from '../../tests/helpers';
import type { Indicator } from '../core/indicator';
import { abuseipdb, verdictFor } from './abuseipdb';

const IP: Indicator = { type: 'ipv4', value: '185.220.101.4' };

function lookup(status: number, body: unknown, headers?: Record<string, string>, indicator = IP) {
  const fetch = fakeFetch(() => jsonResponse(status, body, headers));
  const settings = { ...TEST_SETTINGS, abuseIpdbMaxAgeDays: 30 };
  return {
    fetch,
    result: abuseipdb.lookup(indicator, providerContext(fetch, { apiKey: 'ab-key', settings })),
  };
}

describe('AbuseIPDB', () => {
  it('sends the check request with the key header and report window', async () => {
    const { fetch, result } = lookup(200, checkFixture, undefined, {
      type: 'ipv6',
      value: '2001:db8::1',
    });
    await result;
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.abuseipdb.com/api/v2/check?ipAddress=2001%3Adb8%3A%3A1&maxAgeInDays=30',
    );
    expect(init.headers).toMatchObject({ Key: 'ab-key', Accept: 'application/json' });
  });

  it('maps a malicious report', async () => {
    expect(await lookup(200, checkFixture).result).toEqual({
      verdict: 'malicious',
      headline: '100%',
      caption: 'abuse confidence',
      score: 1,
      tags: ['Tor exit node'],
      facts: [
        { label: 'Reports (30 d)', value: '1,243 from 312 users' },
        { label: 'Last reported', value: '3 hours ago' },
        { label: 'ISP', value: 'Zwiebelfreunde e.V.' },
        { label: 'Usage', value: 'Data Center/Web Hosting/Transit' },
        { label: 'Country', value: '🇩🇪 Germany (DE)' },
        { label: 'Domain', value: 'torservers.net' },
      ],
      reportUrl: 'https://www.abuseipdb.com/check/185.220.101.4',
    });
  });

  it('maps a clean, whitelisted report with no reports', async () => {
    const report = await lookup(200, cleanFixture).result;
    expect(report).toMatchObject({
      verdict: 'clean',
      headline: '0%',
      score: 0,
      tags: ['Whitelisted'],
    });
    expect(report.facts[0]).toEqual({ label: 'Reports (30 d)', value: 'None' });
    expect(report.facts.map((f) => f.label)).not.toContain('Last reported');
  });

  it('uses singular wording for a single reporter', async () => {
    const body = structuredClone(checkFixture);
    body.data.totalReports = 1;
    body.data.numDistinctUsers = 1;
    expect((await lookup(200, body).result).facts[0]?.value).toBe('1 from 1 user');
  });

  it.each([
    [401, authFixture, {}, 'auth'],
    [422, invalidFixture, {}, 'bad_request'],
    [429, rateLimitFixture, { 'retry-after': '3600' }, 'rate_limited'],
    [500, null, {}, 'server'],
  ])('HTTP %i → %s', async (status, body, headers, code) => {
    await expect(lookup(status, body, headers).result).rejects.toMatchObject({ code });
  });

  it('includes the API error detail and the wait time in messages', async () => {
    await expect(lookup(422, invalidFixture).result).rejects.toMatchObject({
      message: invalidFixture.errors[0]?.detail,
    });
    await expect(
      lookup(429, rateLimitFixture, { 'retry-after': '3600' }).result,
    ).rejects.toMatchObject({
      message: 'AbuseIPDB quota reached. Try again in 60 min.',
      retryAfterSec: 3600,
    });
  });

  it('rejects a 200 without a score', async () => {
    await expect(lookup(200, { data: {} }).result).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('refuses non-IP indicators without calling the API', async () => {
    const { fetch, result } = lookup(200, checkFixture, undefined, {
      type: 'domain',
      value: 'evil.com',
    });
    await expect(result).rejects.toMatchObject({
      code: 'unsupported',
      message: 'AbuseIPDB only checks IP addresses.',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('key check reports remaining daily quota', async () => {
    const fetch = fakeFetch(() =>
      jsonResponse(200, cleanFixture, {
        'x-ratelimit-limit': '1000',
        'x-ratelimit-remaining': '998',
      }),
    );
    const message = await abuseipdb.checkKey({
      apiKey: 'k',
      fetch,
      timeoutMs: 1000,
      now: () => NOW,
    });
    expect(message).toBe('Key is valid · 998 of 1,000 daily checks left.');
    const fallback = fakeFetch(() => jsonResponse(200, cleanFixture));
    expect(
      await abuseipdb.checkKey({ apiKey: 'k', fetch: fallback, timeoutMs: 1000, now: () => NOW }),
    ).toBe('Key is valid.');
    const rejected = fakeFetch(() => jsonResponse(401, authFixture));
    await expect(
      abuseipdb.checkKey({ apiKey: 'k', fetch: rejected, timeoutMs: 1000, now: () => NOW }),
    ).rejects.toMatchObject({ code: 'auth' });
  });

  it.each([
    [0, 'clean'],
    [24, 'clean'],
    [25, 'suspicious'],
    [74, 'suspicious'],
    [75, 'malicious'],
    [100, 'malicious'],
  ] as const)('score %i → %s', (score, verdict) => {
    expect(verdictFor(score)).toBe(verdict);
  });
});
