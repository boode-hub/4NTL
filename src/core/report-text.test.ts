import { describe, expect, it } from 'vitest';
import { countryOf, formatReportText, summarize, worstVerdict } from './report-text';
import type { LookupOutcome, Report } from './result';

const report = (over: Partial<Report> = {}): LookupOutcome => ({
  ok: true,
  fetchedAt: 0,
  cached: false,
  report: {
    verdict: 'malicious',
    headline: '100%',
    caption: 'abuse confidence',
    tags: ['Tor exit node'],
    facts: [{ label: 'Country', value: '🇩🇪 Germany (DE)' }],
    reportUrl: 'https://www.abuseipdb.com/check/185.220.101.4',
    ...over,
  },
});

const RESULTS = [
  { name: 'AbuseIPDB', outcome: report() },
  {
    name: 'VirusTotal',
    outcome: report({
      verdict: 'clean',
      headline: '0 / 94',
      caption: 'flagged',
      tags: [],
      facts: [],
    }),
  },
];

describe('report text', () => {
  it('formats every provider, including failures and pending lookups', () => {
    const failed: LookupOutcome = { ok: false, error: { code: 'timeout', message: 'Timed out.' } };
    expect(
      formatReportText(
        { type: 'ipv4', value: '185.220.101.4' },
        [...RESULTS, { name: 'X', outcome: failed }, { name: 'Y' }],
        Date.UTC(2026, 9, 31, 9, 5),
      ),
    ).toBe(
      [
        '185.220.101.4 (IPv4)',
        'Checked with 4NTL, 2026-10-31 09:05 UTC',
        '',
        'AbuseIPDB: Malicious, 100% abuse confidence',
        '  Tags: Tor exit node',
        '  Country: 🇩🇪 Germany (DE)',
        '  https://www.abuseipdb.com/check/185.220.101.4',
        '',
        'VirusTotal: Clean, 0 / 94 flagged',
        '  https://www.abuseipdb.com/check/185.220.101.4',
        '',
        'X: Timed out.',
        '',
        'Y: still checking',
      ].join('\n'),
    );
  });

  it('summarizes for the saved list', () => {
    expect(worstVerdict(RESULTS)).toBe('malicious');
    expect(worstVerdict([{ name: 'A' }])).toBeUndefined();
    expect(summarize(RESULTS)).toBe('AbuseIPDB: Malicious 100% · VirusTotal: Clean 0 / 94');
    expect(countryOf(RESULTS)).toBe('🇩🇪 Germany (DE)');
    expect(countryOf([])).toBe('');
  });
});

describe('EchoTrail in the copied details', () => {
  it('uses its own badge word and lists the ancestry', () => {
    const text = formatReportText(
      { type: 'process', value: 'putty.exe' },
      [
        {
          name: 'EchoTrail',
          outcome: report({
            verdict: 'unknown',
            pill: 'Known',
            headline: '82%',
            caption: 'of runs started by explorer.exe',
            tags: [],
            facts: [],
            lists: [{ label: 'Top parents', items: [{ name: 'explorer.exe', detail: '82%' }] }],
            note: 'Top grandparents come with a Team key.',
            reportUrl: 'https://echotrail.io/insights/putty.exe/',
          }),
        },
      ],
      0,
    );
    expect(text).toContain('putty.exe (Process)');
    expect(text).toContain('EchoTrail: Known, 82% of runs started by explorer.exe');
    expect(text).toContain('  Top parents: explorer.exe 82%');
    expect(text).toContain('  Top grandparents come with a Team key.');
  });
});
