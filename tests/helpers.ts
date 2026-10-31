/** Shared test doubles. */
import { vi } from 'vitest';
import type { KeyValueStore } from '../src/core/cache';
import type { Settings } from '../src/core/settings';
import type { FetchLike, ProviderContext } from '../src/providers/types';

export const NOW = Date.parse('2026-10-27T12:00:00Z');

export const VT_KEY = 'a'.repeat(64);
export const ABUSE_KEY = 'b'.repeat(80);

export const TEST_SETTINGS: Settings = {
  apiKeys: { abuseipdb: ABUSE_KEY, virustotal: VT_KEY },
  abuseIpdbMaxAgeDays: 90,
  cacheTtlMinutes: 30,
  appearance: { theme: 'auto', accent: '', background: '' },
};

export function jsonResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export function fakeFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): FetchLike & ReturnType<typeof vi.fn> {
  return vi.fn((url: string, init?: RequestInit) => Promise.resolve(handler(url, init)));
}

export function providerContext(
  fetch: FetchLike,
  overrides: Partial<ProviderContext> = {},
): ProviderContext {
  return {
    apiKey: 'test-key',
    settings: TEST_SETTINGS,
    fetch,
    timeoutMs: 5000,
    now: () => NOW,
    ...overrides,
  };
}

/** In-memory stand-in for chrome.storage.* areas. */
export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();

  get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    const wanted = keys === null ? [...this.data.keys()] : Array.isArray(keys) ? keys : [keys];
    const result: Record<string, unknown> = {};
    for (const key of wanted)
      if (this.data.has(key)) result[key] = structuredClone(this.data.get(key));
    return Promise.resolve(result);
  }

  set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) this.data.set(key, structuredClone(value));
    return Promise.resolve();
  }

  remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.data.delete(key);
    return Promise.resolve();
  }
}

/** Resolves once every queued microtask/promise callback has run. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
