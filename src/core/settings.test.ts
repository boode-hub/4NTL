import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../tests/helpers';
import {
  affectsResults,
  DEFAULT_SETTINGS,
  hasAnyApiKey,
  loadSettings,
  normalizeAppearance,
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

describe('appearance', () => {
  it('defaults to the automatic theme with its own accent', () => {
    expect(normalizeAppearance(undefined)).toEqual({ theme: 'auto', accent: '', background: '' });
  });

  it('keeps known themes and valid hex colors (lower-cased)', () => {
    expect(
      normalizeAppearance({ theme: 'sharingan', accent: '#FF2D3D', background: '#1A1B2C' }),
    ).toEqual({ theme: 'sharingan', accent: '#ff2d3d', background: '#1a1b2c' });
  });

  it.each(['red', '#fff', '#12345g', 'red;} body{display:none', '#ff2d3d ', 42])(
    'rejects color %j (it ends up in CSS)',
    (color) => {
      expect(normalizeAppearance({ theme: 'dark', accent: color, background: color })).toEqual({
        theme: 'dark',
        accent: '',
        background: '',
      });
    },
  );

  it('falls back to auto for unknown themes', () => {
    expect(normalizeAppearance({ theme: 'mangekyo' }).theme).toBe('auto');
  });
});

describe('affectsResults', () => {
  const base = normalizeSettings({ apiKeys: { virustotal: 'k' } });

  it('is true when keys or the AbuseIPDB window change', () => {
    expect(affectsResults(base, normalizeSettings({ apiKeys: { virustotal: 'other' } }))).toBe(
      true,
    );
    expect(affectsResults(base, { ...base, abuseIpdbMaxAgeDays: 30 })).toBe(true);
  });

  it('is false for appearance and cache-lifetime changes', () => {
    expect(
      affectsResults(base, {
        ...base,
        cacheTtlMinutes: 5,
        appearance: { theme: 'sharingan', accent: '#123456', background: '#000000' },
      }),
    ).toBe(false);
  });
});
