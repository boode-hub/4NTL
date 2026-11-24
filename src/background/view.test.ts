import { describe, expect, it } from 'vitest';
import { buildView, NO_INDICATOR_NOTICE, viewForIndicators } from './view';

const VT = { id: 'virustotal', name: 'VirusTotal' };
const ABUSE = { id: 'abuseipdb', name: 'AbuseIPDB' };

const ECHO = { id: 'echotrail', name: 'EchoTrail' };

describe('buildView with EchoTrail', () => {
  it('a process goes to EchoTrail only, and only while it is on', () => {
    expect(buildView('svchost.exe', 'all')).toBe(NO_INDICATOR_NOTICE);
    expect(buildView('svchost.exe', 'all', { processes: true })).toEqual({
      kind: 'lookup',
      indicator: { type: 'process', value: 'svchost.exe' },
      providers: [ECHO],
    });
    // Everything else still goes to the same providers as before.
    expect(buildView('8.8.8.8', 'all', { processes: true })).toMatchObject({
      providers: [ABUSE, VT],
    });
  });

  it('"EchoTrail only" takes any one name, e.g. a service', () => {
    expect(buildView('Spooler', 'echotrail')).toEqual({
      kind: 'lookup',
      indicator: { type: 'process', value: 'spooler' },
      providers: [ECHO],
    });
    expect(buildView('two words', 'echotrail')).toBe(NO_INDICATOR_NOTICE);
  });
});

describe('buildView', () => {
  it('shows every applicable provider for "all"', () => {
    expect(buildView('8.8.8.8', 'all')).toEqual({
      kind: 'lookup',
      indicator: { type: 'ipv4', value: '8.8.8.8' },
      providers: [ABUSE, VT],
    });
    expect(buildView('evil[.]com', 'all')).toMatchObject({ providers: [VT] });
  });

  it('keeps an explicitly chosen provider even when it cannot handle the indicator', () => {
    expect(buildView('evil.com', 'abuseipdb')).toEqual({
      kind: 'lookup',
      indicator: { type: 'domain', value: 'evil.com' },
      providers: [ABUSE],
    });
  });

  it('offers a choice for multi-indicator selections', () => {
    expect(buildView('8.8.8.8 evil.com', 'all')).toEqual({
      kind: 'choose',
      truncated: false,
      choices: [
        { indicator: { type: 'ipv4', value: '8.8.8.8' }, providers: [ABUSE, VT] },
        { indicator: { type: 'domain', value: 'evil.com' }, providers: [VT] },
      ],
    });
    expect(buildView('8.8.8.8 evil.com', 'virustotal')).toMatchObject({
      choices: [{ providers: [VT] }, { providers: [VT] }],
    });
  });

  it('explains when nothing usable was selected', () => {
    expect(buildView('hello', 'all')).toBe(NO_INDICATOR_NOTICE);
  });
});

describe('viewForIndicators', () => {
  it('caps long lists and marks them truncated', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      type: 'url' as const,
      value: `https://e${i}.com/`,
    }));
    const view = viewForIndicators(many, 'all');
    expect(view).toMatchObject({ kind: 'choose', truncated: true });
    expect(view.kind === 'choose' && view.choices).toHaveLength(12);
  });

  it('explains when nobody supports a forced provider/type pair', () => {
    expect(viewForIndicators([], 'all')).toBe(NO_INDICATOR_NOTICE);
  });
});
