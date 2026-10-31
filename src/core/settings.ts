/**
 * User settings, stored in chrome.storage.local (never .sync: API keys must not
 * be copied to the browser vendor's cloud). The storage key carries a schema
 * version so a future breaking change can migrate `settings.v1` explicitly.
 */
import type { KeyValueStore } from './cache';
import { PROVIDER_IDS, type ProviderId } from './provider-ids';

export const SETTINGS_KEY = 'settings.v1';

export const THEMES = ['auto', 'light', 'dark', 'sharingan'] as const;
export type Theme = (typeof THEMES)[number];

export interface Appearance {
  readonly theme: Theme;
  /** `#rrggbb`, or '' for the theme's own accent color. */
  readonly accent: string;
  /** The card's inside color, `#rrggbb`, or '' for the theme's own. */
  readonly background: string;
}

export interface Settings {
  readonly apiKeys: Readonly<Record<ProviderId, string>>;
  /** AbuseIPDB only counts reports newer than this many days (API limit: 1–365). */
  readonly abuseIpdbMaxAgeDays: number;
  /** Results are reused for this long; 0 disables caching. */
  readonly cacheTtlMinutes: number;
  readonly appearance: Appearance;
}

export const SETTINGS_LIMITS = {
  abuseIpdbMaxAgeDays: { min: 1, max: 365 },
  cacheTtlMinutes: { min: 0, max: 1440 },
} as const;

export const DEFAULT_SETTINGS: Settings = {
  apiKeys: { abuseipdb: '', virustotal: '' },
  abuseIpdbMaxAgeDays: 90,
  cacheTtlMinutes: 30,
  appearance: { theme: 'auto', accent: '', background: '' },
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeAppearance(raw: unknown): Appearance {
  const input = asRecord(raw);
  const theme = THEMES.find((name) => name === input.theme) ?? 'auto';
  // Validated: both colors end up in the card's CSS.
  const color = (value: unknown) =>
    typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : '';
  return { theme, accent: color(input.accent), background: color(input.background) };
}

function clampInt(value: unknown, limits: { min: number; max: number }, fallback: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(n)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** Turns anything (stored data, form input) into valid Settings, falling back to defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const input = asRecord(raw);
  const keys = asRecord(input.apiKeys);
  const apiKeys = Object.fromEntries(
    PROVIDER_IDS.map((id) => {
      const key = keys[id];
      return [id, typeof key === 'string' ? key.trim() : ''];
    }),
  ) as Record<ProviderId, string>;
  return {
    apiKeys,
    abuseIpdbMaxAgeDays: clampInt(
      input.abuseIpdbMaxAgeDays,
      SETTINGS_LIMITS.abuseIpdbMaxAgeDays,
      DEFAULT_SETTINGS.abuseIpdbMaxAgeDays,
    ),
    cacheTtlMinutes: clampInt(
      input.cacheTtlMinutes,
      SETTINGS_LIMITS.cacheTtlMinutes,
      DEFAULT_SETTINGS.cacheTtlMinutes,
    ),
    appearance: normalizeAppearance(input.appearance),
  };
}

/** True when two settings can produce different lookup results (so cached ones are stale). */
export function affectsResults(before: Settings, after: Settings): boolean {
  return (
    before.abuseIpdbMaxAgeDays !== after.abuseIpdbMaxAgeDays ||
    PROVIDER_IDS.some((id) => before.apiKeys[id] !== after.apiKeys[id])
  );
}

export function hasAnyApiKey(settings: Settings): boolean {
  return PROVIDER_IDS.some((id) => settings.apiKeys[id] !== '');
}

type StorageArea = Pick<KeyValueStore, 'get' | 'set'>;

export async function loadSettings(area: StorageArea = chrome.storage.local): Promise<Settings> {
  const stored = await area.get(SETTINGS_KEY);
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(
  settings: Settings,
  area: StorageArea = chrome.storage.local,
): Promise<Settings> {
  const normalized = normalizeSettings(settings);
  await area.set({ [SETTINGS_KEY]: normalized });
  return normalized;
}
