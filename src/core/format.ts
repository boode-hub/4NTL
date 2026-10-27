/** Display formatting shared by providers. Fixed to English until the UI is localised. */

const LOCALE = 'en';
const numberFormat = new Intl.NumberFormat(LOCALE);
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
const regionNames = new Intl.DisplayNames([LOCALE], { type: 'region', fallback: 'code' });

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 days ago", "yesterday", "just now". */
export function formatRelativeTime(timestampMs: number, nowMs: number): string {
  const seconds = Math.round((timestampMs - nowMs) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.trunc(seconds / size), unit);
  }
  return 'just now';
}

/** "DE" → "Germany (DE)"; unknown codes are returned unchanged. */
export function formatCountry(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return code;
  try {
    const name = regionNames.of(upper);
    // CLDR names the reserved code ZZ (and unassigned ones) "Unknown Region".
    return name && name !== upper && name !== 'Unknown Region' ? `${name} (${upper})` : upper;
  } catch {
    return upper;
  }
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${BYTE_UNITS[unit] ?? 'B'}`;
}

/** For past events: a timestamp slightly ahead of the local clock (skew) reads "just now". */
export function formatAgo(timestampMs: number, nowMs: number): string {
  return formatRelativeTime(Math.min(timestampMs, nowMs), nowMs);
}
