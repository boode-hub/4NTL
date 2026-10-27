import { describe, expect, it } from 'vitest';
import { buildView, NO_INDICATOR_NOTICE } from './view';

const VT = { id: 'virustotal', name: 'VirusTotal' };
const ABUSE = { id: 'abuseipdb', name: 'AbuseIPDB' };

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
