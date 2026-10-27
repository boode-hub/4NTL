import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../tests/helpers';
import {
  DEFAULT_SETTINGS,
  hasAnyApiKey,
  loadSettings,
  normalizeSettings,
  saveSettings,
  SETTINGS_KEY,
} from './settings';

describe('normalizeSettings', () => {
  it('falls back to defaults for missing or malformed input', () => {
    for (const raw of [undefined, null, 'x', 42, [], {}]) {
      expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('trims keys and ignores unknown providers and non-string keys', () => {
    expect(
      normalizeSettings({ apiKeys: { virustotal: '  abc \n', abuseipdb: 42, shodan: 'x' } })
        .apiKeys,
    ).toEqual({ virustotal: 'abc', abuseipdb: '' });
  });

  it('clamps, rounds and parses numeric options', () => {
    expect(normalizeSettings({ abuseIpdbMaxAgeDays: 0, cacheTtlMinutes: 99999 })).toMatchObject({
      abuseIpdbMaxAgeDays: 1,
      cacheTtlMinutes: 1440,
    });
    expect(normalizeSettings({ abuseIpdbMaxAgeDays: '30', cacheTtlMinutes: 12.6 })).toMatchObject({
      abuseIpdbMaxAgeDays: 30,
      cacheTtlMinutes: 13,
    });
    expect(
      normalizeSettings({ abuseIpdbMaxAgeDays: '', cacheTtlMinutes: Number.NaN }),
    ).toMatchObject({
      abuseIpdbMaxAgeDays: DEFAULT_SETTINGS.abuseIpdbMaxAgeDays,
      cacheTtlMinutes: DEFAULT_SETTINGS.cacheTtlMinutes,
    });
    expect(normalizeSettings({ cacheTtlMinutes: 0 }).cacheTtlMinutes).toBe(0);
  });
});

describe('hasAnyApiKey', () => {
  it('is true once any provider has a key', () => {
    expect(hasAnyApiKey(DEFAULT_SETTINGS)).toBe(false);
    expect(hasAnyApiKey(normalizeSettings({ apiKeys: { abuseipdb: 'k' } }))).toBe(true);
  });
});

describe('load/save', () => {
  it('round-trips through storage under a versioned key', async () => {
    const store = new MemoryStore();
    expect(await loadSettings(store)).toEqual(DEFAULT_SETTINGS);

    const saved = await saveSettings(
      normalizeSettings({ apiKeys: { virustotal: 'vt' }, cacheTtlMinutes: 5 }),
      store,
    );
    expect(store.data.has(SETTINGS_KEY)).toBe(true);
    expect(await loadSettings(store)).toEqual(saved);
    expect(saved.apiKeys.virustotal).toBe('vt');
    expect(saved.cacheTtlMinutes).toBe(5);
  });
});
