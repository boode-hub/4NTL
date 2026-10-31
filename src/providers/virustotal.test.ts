import { describe, expect, it } from 'vitest';
import domainFixture from '../../tests/fixtures/virustotal/domain.json';
import fileFixture from '../../tests/fixtures/virustotal/file.json';
import ipFixture from '../../tests/fixtures/virustotal/ip.json';
import notFoundFixture from '../../tests/fixtures/virustotal/not-found.json';
import quotasFixture from '../../tests/fixtures/virustotal/overall-quotas.json';
import quotaFixture from '../../tests/fixtures/virustotal/quota.json';
import urlFixture from '../../tests/fixtures/virustotal/url.json';
import wrongKeyFixture from '../../tests/fixtures/virustotal/wrong-key.json';
import { fakeFetch, jsonResponse, NOW, providerContext } from '../../tests/helpers';
import { LookupError } from '../core/errors';
import type { Indicator } from '../core/indicator';
import { urlId, verdictFor, virustotal } from './virustotal';

const IP: Indicator = { type: 'ipv4', value: '185.220.101.4' };
const SHA256: Indicator = {
  type: 'sha256',
  value: '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f',
};
const DOMAIN: Indicator = { type: 'domain', value: 'example.com' };
const URL_IOC: Indicator = { type: 'url', value: 'http://malware.wicar.org/data/eicar.com' };

function lookup(
  indicator: Indicator,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  const fetch = fakeFetch(() => jsonResponse(status, body, headers));
  return {
    fetch,
    result: virustotal.lookup(indicator, providerContext(fetch, { apiKey: 'vt-key' })),
  };
}

describe('VirusTotal request', () => {
  const cases: [Indicator, string][] = [
    [IP, 'https://www.virustotal.com/api/v3/ip_addresses/185.220.101.4'],
    [
      { type: 'ipv6', value: '2001:db8::1' },
      'https://www.virustotal.com/api/v3/ip_addresses/2001:db8::1',
    ],
    [DOMAIN, 'https://www.virustotal.com/api/v3/domains/example.com'],
    [SHA256, `https://www.virustotal.com/api/v3/files/${SHA256.value}`],
    [
      { type: 'md5', value: 'd41d8cd98f00b204e9800998ecf8427e' },
      'https://www.virustotal.com/api/v3/files/d41d8cd98f00b204e9800998ecf8427e',
    ],
    [URL_IOC, `https://www.virustotal.com/api/v3/urls/${urlId(URL_IOC.value)}`],
  ];
  it.each(cases)('%j → %s', async (indicator, expectedUrl) => {
    const { fetch, result } = lookup(indicator, 200, ipFixture);
    await result.catch(() => undefined);
    const [calledUrl, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(expectedUrl);
    expect(init.headers).toMatchObject({ 'x-apikey': 'vt-key', Accept: 'application/json' });
    expect(init.credentials).toBe('omit');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('encodes URL ids as unpadded base64url, including non-ASCII', () => {
    expect(urlId('http://a.com/?x=~~~')).toBe('aHR0cDovL2EuY29tLz94PX5-fg');
    expect(urlId('https://xn--e1afmkfd.xn--p1ai/путь')).not.toMatch(/[+/=]/);
  });
});

describe('VirusTotal reports', () => {
  it('maps an IP report', async () => {
    const { result } = lookup(IP, 200, ipFixture);
    expect(await result).toEqual({
      verdict: 'malicious',
      headline: '14 / 94',
      caption: 'security vendors flagged it as malicious',
      tags: ['2 suspicious'],
      facts: [
        { label: 'Owner', value: 'Zwiebelfreunde e.V. · AS208294' },
        { label: 'Country', value: '🇩🇪 Germany (DE)' },
        { label: 'Network', value: '185.220.101.0/24' },
        { label: 'Reputation', value: '-41' },
        { label: 'Last analysis', value: '18 hours ago' },
      ],
      reportUrl: 'https://www.virustotal.com/gui/ip-address/185.220.101.4',
    });
  });

  it('maps a file report (ignoring unsupported/timeout engines in the total)', async () => {
    const report = await lookup(SHA256, 200, fileFixture).result;
    expect(report.verdict).toBe('malicious');
    expect(report.headline).toBe('64 / 67');
    expect(report.facts).toEqual([
      { label: 'Threat label', value: 'virus.eicar/test' },
      { label: 'Name', value: 'eicar.com' },
      { label: 'Type', value: 'Text' },
      { label: 'Size', value: '68 B' },
      { label: 'First seen', value: '20 years ago' },
    ]);
    expect(report.reportUrl).toBe(`https://www.virustotal.com/gui/file/${SHA256.value}`);
  });

  it('maps a clean domain report', async () => {
    const report = await lookup(DOMAIN, 200, domainFixture).result;
    expect(report.verdict).toBe('clean');
    expect(report.headline).toBe('0 / 94');
    expect(report.tags).toEqual([]);
    expect(report.facts.map((f) => f.label)).toEqual([
      'Registrar',
      'Created',
      'Categories',
      'Reputation',
      'Last analysis',
    ]);
    expect(report.facts[2]?.value).toBe('reference materials, reference');
  });

  it('maps a URL report and links to its GUI page by object id', async () => {
    const report = await lookup(URL_IOC, 200, urlFixture).result;
    expect(report.verdict).toBe('suspicious');
    expect(report.facts).toContainEqual({
      label: 'Final URL',
      value: 'https://malware.wicar.org/data/eicar.com',
    });
    expect(report.reportUrl).toBe(`https://www.virustotal.com/gui/url/${urlFixture.data.id}`);
  });

  it('reports unknown indicators as "not found" rather than an error', async () => {
    const report = await lookup(IP, 404, notFoundFixture).result;
    expect(report).toMatchObject({ verdict: 'unknown', headline: 'Not found', facts: [] });
    expect(report.reportUrl).toBe('https://www.virustotal.com/gui/ip-address/185.220.101.4');
    const urlReport = await lookup(URL_IOC, 404, notFoundFixture).result;
    expect(urlReport.caption).toContain('URL');
    expect(urlReport.reportUrl).toBe(
      `https://www.virustotal.com/gui/search/${encodeURIComponent(URL_IOC.value)}`,
    );
  });

  it('handles never-analysed objects and missing fields', async () => {
    const report = await lookup(IP, 200, {
      data: { id: 'x', attributes: { last_analysis_stats: {} } },
    }).result;
    expect(report).toMatchObject({ verdict: 'unknown', headline: 'No scans', facts: [] });
  });

  it.each<{ label: string; body: unknown }>([
    { label: 'empty body', body: {} },
    { label: 'no attributes', body: { data: { attributes: {} } } },
    { label: 'array', body: [1, 2] },
  ])('rejects malformed 200 responses ($label)', async ({ body }) => {
    await expect(lookup(IP, 200, body).result).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('never trusts response strings as anything but text', async () => {
    const hostile = structuredClone(fileFixture);
    hostile.data.attributes.meaningful_name = '<img src=x onerror=alert(1)>';
    const report = await lookup(SHA256, 200, hostile).result;
    expect(report.facts).toContainEqual({ label: 'Name', value: '<img src=x onerror=alert(1)>' });
  });
});

describe('VirusTotal errors', () => {
  it.each([
    [401, wrongKeyFixture, {}, 'auth', 'VirusTotal rejected the API key (Wrong API key).'],
    [429, quotaFixture, {}, 'rate_limited', 'VirusTotal quota reached. Try again shortly.'],
    [
      429,
      quotaFixture,
      { 'retry-after': '42' },
      'rate_limited',
      'VirusTotal quota reached. Try again in 42 s.',
    ],
    [400, { error: { message: 'Invalid IP' } }, {}, 'bad_request', 'Invalid IP'],
    [503, null, {}, 'server', 'VirusTotal is having problems (HTTP 503). Try again later.'],
  ])('HTTP %i → %s', async (status, body, headers, code, message) => {
    await expect(lookup(IP, status, body, headers).result).rejects.toMatchObject({ code, message });
  });

  it('refuses indicator types it does not support', async () => {
    const fetch = fakeFetch(() => jsonResponse(200, {}));
    const bogus = { type: 'email', value: 'a@b.c' } as unknown as Indicator;
    await expect(virustotal.lookup(bogus, providerContext(fetch))).rejects.toBeInstanceOf(
      LookupError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('VirusTotal key check', () => {
  it('reports quota usage without spending a lookup', async () => {
    const fetch = fakeFetch(() => jsonResponse(200, quotasFixture));
    const message = await virustotal.checkKey({
      apiKey: 'k/1',
      fetch,
      timeoutMs: 1000,
      now: () => NOW,
    });
    expect(message).toBe('Key is valid · 37 of 500 daily lookups used.');
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://www.virustotal.com/api/v3/users/k%2F1/overall_quotas',
    );
  });

  it('still succeeds when the quota shape is unexpected', async () => {
    const fetch = fakeFetch(() => jsonResponse(200, { data: {} }));
    expect(await virustotal.checkKey({ apiKey: 'k', fetch, timeoutMs: 1000, now: () => NOW })).toBe(
      'Key is valid.',
    );
  });

  it('surfaces a rejected key', async () => {
    const fetch = fakeFetch(() => jsonResponse(401, wrongKeyFixture));
    await expect(
      virustotal.checkKey({ apiKey: 'k', fetch, timeoutMs: 1000, now: () => NOW }),
    ).rejects.toMatchObject({
      code: 'auth',
    });
  });
});

describe('verdictFor', () => {
  it.each([
    [0, 0, 0, 'unknown'],
    [0, 0, 70, 'clean'],
    [0, 1, 70, 'suspicious'],
    [2, 0, 70, 'suspicious'],
    [3, 0, 70, 'malicious'],
  ] as const)('%i malicious, %i suspicious of %i → %s', (malicious, suspicious, total, verdict) => {
    expect(verdictFor(malicious, suspicious, total)).toBe(verdict);
  });
});
