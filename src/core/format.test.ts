import { describe, expect, it } from 'vitest';
import { formatAgo, formatBytes, formatCountry, formatNumber, formatRelativeTime } from './format';

const NOW = Date.parse('2026-10-27T12:00:00Z');
const ago = (seconds: number) => NOW - seconds * 1000;

describe('formatRelativeTime', () => {
  it.each([
    [ago(5), 'just now'],
    [ago(90), '1 minute ago'],
    [ago(150), '2 minutes ago'],
    [ago(3 * 3600), '3 hours ago'],
    [ago(24 * 3600), 'yesterday'],
    [ago(3 * 24 * 3600), '3 days ago'],
    [ago(14 * 24 * 3600), '2 weeks ago'],
    [ago(65 * 24 * 3600), '2 months ago'],
    [ago(800 * 24 * 3600), '2 years ago'],
    [NOW + 2 * 3600 * 1000, 'in 2 hours'],
  ])('%#', (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, NOW)).toBe(expected);
  });
});

describe('formatCountry', () => {
  it('expands ISO codes', () => {
    expect(formatCountry('DE')).toBe('🇩🇪 Germany (DE)');
    expect(formatCountry('us')).toBe('🇺🇸 United States (US)');
  });

  it('passes through anything that is not a known ISO code', () => {
    expect(formatCountry('Europe')).toBe('Europe');
    expect(formatCountry('ZZ')).toBe('ZZ');
  });
});

describe('formatNumber / formatBytes', () => {
  it('formats', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(734208)).toBe('717.0 KB');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    expect(formatBytes(3 * 1024 ** 5)).toBe('3072.0 TB');
  });
});

describe('formatAgo', () => {
  it('never describes a past event as being in the future', () => {
    expect(formatAgo(NOW + 3_600_000, NOW)).toBe('just now');
    expect(formatAgo(ago(7200), NOW)).toBe('2 hours ago');
  });
});
