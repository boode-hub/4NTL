import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, NOW, TEST_SETTINGS } from '../../tests/helpers';
import { LookupError } from '../core/errors';
import type { Indicator } from '../core/indicator';
import { echotrail, percent, TEAM_KEY_NOTE, toReport } from './echotrail';

const PUTTY: Indicator = { type: 'process', value: 'putty.exe' };
const KEY = 'et_live_abcdefghijklmnop';

/** Free plan: the summary (shape from https://echotrail.io/docs). */
const SUMMARY = {
  name: 'putty.exe',
  known: true,
  category: 'Productivity',
  publisher: 'Simon Tatham',
  description: 'putty.exe (SSH, Telnet, Rlogin, and SUPDUP client) is part of PuTTY suite.',
  most_common_parent: { name: 'explorer.exe', share_pct: 81.69, verdict: 'normal' },
  full_record_available: true,
  lab: {
    observed: true,
    signature_status: 'Valid',
    persistence: { present: false },
    network: { present: true, destinations: 1 },
  },
};

/** Team and up: the full record. */
const FULL = {
  process_name: 'putty.exe',
  description: 'putty.exe is part of PuTTY suite.',
  classification: {
    category: 'Productivity',
    publisher: 'Simon Tatham',
    is_lolbin: false,
    risk_level: 'medium',
    expected_parent: 'explorer.exe (user launch).',
  },
  executions: { total: 4545 },
  parents: {
    total: 4545,
    top: [
      { name: 'explorer.exe', count: 3713, percentage: 81.6942 },
      { name: 'putty.exe', count: 628, percentage: 13.8174 },
      { name: 'runtimebroker.exe', count: 62, percentage: 1.3641 },
    ],
  },
  children: { top: [{ name: 'putty.exe', count: 628 }] },
  grandparents: {
    top: [
      { name: 'userinit.exe', count: 2683 },
      { name: 'explorer.exe', count: 347 },
    ],
  },
  paths: {
    total: 585,
    top: [
      { path: 'C:\\Program Files\\PuTTY', count: 364, percentage: 62.2222 },
      { path: 'C:\\Program Files (x86)\\PuTTY', count: 118, percentage: 20.1709 },
    ],
  },
  hashes: {
    top: [
      { sha256: 'a'.repeat(64), count: 3000, percentage: 66.1 },
      // Seen only in EchoTrail's lab: no count, runs under behavior.
      { sha256: 'b'.repeat(64), count: null, percentage: null, behavior: { executions: 2 } },
    ],
  },
};

function ctx(response: Response) {
  const fetch = vi.fn(() => Promise.resolve(response));
  return {
    fetch,
    value: {
      apiKey: KEY,
      settings: { ...TEST_SETTINGS, echotrail: true },
      fetch,
      timeoutMs: 1000,
      now: () => NOW,
    },
  };
}

describe('EchoTrail', () => {
  it('asks for the process by name with the key as a Bearer token', async () => {
    const c = ctx(jsonResponse(200, SUMMARY));
    await echotrail.lookup(PUTTY, c.value);
    expect(c.fetch).toHaveBeenCalledWith(
      'https://api.echotrail.io/v1/process/putty.exe',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${KEY}` }) as unknown,
        credentials: 'omit',
      }),
    );
  });

  it('free plan: the usual parent as the headline, lab facts, and what a Team key adds', () => {
    const report = toReport(PUTTY, SUMMARY);
    expect(report).toMatchObject({
      verdict: 'unknown',
      pill: 'Known',
      headline: '82%',
      caption: 'of runs started by explorer.exe',
      tags: ['Productivity', 'Network activity'],
      note: TEAM_KEY_NOTE,
      reportUrl: 'https://echotrail.io/insights/putty.exe/',
    });
    expect(report.facts).toEqual([
      { label: 'Publisher', value: 'Simon Tatham' },
      { label: 'Signature', value: 'Valid' },
      { label: 'About', value: SUMMARY.description },
    ]);
    expect(report.lists).toBeUndefined();
  });

  it('full record: grandparents, parents and children lists, no upgrade note', () => {
    const report = toReport(PUTTY, FULL);
    expect(report.lists).toEqual([
      {
        label: 'Top grandparents',
        items: [
          { name: 'userinit.exe', detail: '2,683×' },
          { name: 'explorer.exe', detail: '347×' },
        ],
      },
      {
        label: 'Top parents',
        items: [
          { name: 'explorer.exe', detail: '82%' },
          { name: 'putty.exe', detail: '14%' },
          { name: 'runtimebroker.exe', detail: '1.4%' },
        ],
      },
      { label: 'Top children', items: [{ name: 'putty.exe', detail: '628×' }] },
      {
        label: 'Top paths',
        wide: true,
        items: [
          { name: 'C:\\Program Files\\PuTTY', detail: '62%' },
          { name: 'C:\\Program Files (x86)\\PuTTY', detail: '20%' },
        ],
      },
      {
        label: 'Top hashes (SHA-256)',
        wide: true,
        items: [
          { name: 'a'.repeat(64), detail: '66%' },
          { name: 'b'.repeat(64), detail: '2×' },
        ],
      },
    ]);
    expect(report.note).toBeUndefined();
    expect(report.tags).toEqual(['Productivity', 'Risk: medium']);
    expect(report.facts).toContainEqual({ label: 'Executions', value: '4,545' });
    // The path list replaces the single "Typical path" line.
    expect(report.facts.map((fact) => fact.label)).not.toContain('Typical path');
  });

  it.each([
    [81.69, '82%'],
    [1.36, '1.4%'],
    [0.04, '<0.1%'],
    [99.96, '99.9%'],
    [100, '100%'],
    [0, '0%'],
  ])('shows a %s share as %s', (value, text) => {
    expect(percent(value)).toBe(text);
  });

  it('a LOLBin or a high-risk process says so', () => {
    const lolbin = toReport(PUTTY, {
      ...FULL,
      classification: { ...FULL.classification, is_lolbin: true, risk_level: 'high' },
    });
    expect(lolbin).toMatchObject({ verdict: 'suspicious', pill: 'LOLBin' });
    expect(lolbin.tags).toContain('LOLBin');
  });

  it('untrusted answers degrade to plain values, never throw', () => {
    for (const body of [null, 42, 'x', [], { parents: { top: [null, { name: 7 }, 'x'] } }]) {
      expect(() => toReport(PUTTY, body)).not.toThrow();
    }
    expect(toReport(PUTTY, { parents: { top: [{ name: 'a.exe' }] } }).lists).toEqual([
      { label: 'Top parents', items: [{ name: 'a.exe', detail: '' }] },
    ]);
  });

  it('a process EchoTrail has never seen is an answer, not an error', async () => {
    const body = {
      error: { code: 'not_found', message: 'No data', name: 'x.exe', queued_for_lab: true },
    };
    const report = await echotrail.lookup(PUTTY, ctx(jsonResponse(404, body)).value);
    expect(report).toMatchObject({ verdict: 'unknown', pill: 'Not seen', headline: 'New' });
    expect(report.facts).toEqual([{ label: 'Status', value: 'Queued for EchoTrail’s lab' }]);
  });

  it('maps a bad key, the plan gate and the rate limit to clear errors', async () => {
    const fail = async (status: number, body: unknown) =>
      echotrail.lookup(PUTTY, ctx(jsonResponse(status, body)).value).catch((e: unknown) => e);
    expect(await fail(401, { error: { code: 'unauthorized', message: 'bad' } })).toMatchObject({
      code: 'auth',
    });
    expect(await fail(403, { error: { code: 'forbidden', message: 'Team only' } })).toEqual(
      new LookupError('bad_request', 'Team only'),
    );
    expect(
      await fail(429, { error: { code: 'rate_limited', message: 'slow down' } }),
    ).toMatchObject({ code: 'rate_limited' });
  });

  it('Test key: tells a free key from a full one', async () => {
    const check = (body: unknown, status = 200) =>
      echotrail.checkKey({ ...ctx(jsonResponse(status, body)).value });
    expect(await check(SUMMARY)).toContain('free plan');
    expect(await check(FULL)).toContain('full records');
    await expect(
      check({ error: { message: 'Missing or invalid API key' } }, 401),
    ).rejects.toMatchObject({ code: 'auth' });
  });

  it('only process names, and a key that looks like EchoTrail’s', () => {
    expect([...echotrail.supports]).toEqual(['process']);
    expect(echotrail.apiKeyPattern.test(KEY)).toBe(true);
    expect(echotrail.apiKeyPattern.test('a'.repeat(64))).toBe(false);
  });
});
