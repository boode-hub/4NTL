/**
 * Bounded TTL cache over a chrome.storage-like key/value store.
 *
 * Backed by chrome.storage.session in production: it lives in memory (never
 * written to disk), survives service-worker restarts (which happen after ~30 s
 * idle), and is wiped when the browser closes.
 */

/** The lookup-result cache, shared by the service worker and the settings page. */
export const REPORT_CACHE: TtlCacheOptions = { prefix: 'cache:', maxEntries: 500 };

export interface KeyValueStore {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

interface Entry<T> {
  readonly value: T;
  readonly storedAt: number;
  readonly expiresAt: number;
}

export interface CacheHit<T> {
  readonly value: T;
  readonly storedAt: number;
}

export interface TtlCacheOptions {
  /** Namespaces this cache's keys inside the shared store. */
  readonly prefix: string;
  readonly maxEntries: number;
  /** Expired/overflow entries are swept every N writes (and on the first write). */
  readonly pruneEvery?: number;
  readonly now?: () => number;
}

function isEntry(value: unknown): value is Entry<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<Entry<unknown>>;
  return (
    typeof entry.storedAt === 'number' && typeof entry.expiresAt === 'number' && 'value' in entry
  );
}

export class TtlCache<T> {
  readonly #store: KeyValueStore;
  readonly #prefix: string;
  readonly #maxEntries: number;
  readonly #pruneEvery: number;
  readonly #now: () => number;
  #writesUntilPrune = 0;

  constructor(store: KeyValueStore, options: TtlCacheOptions) {
    this.#store = store;
    this.#prefix = options.prefix;
    this.#maxEntries = options.maxEntries;
    this.#pruneEvery = options.pruneEvery ?? 20;
    this.#now = options.now ?? Date.now;
  }

  async get(key: string): Promise<CacheHit<T> | undefined> {
    const storeKey = this.#prefix + key;
    const entry = (await this.#store.get(storeKey))[storeKey];
    if (!isEntry(entry)) return undefined;
    if (entry.expiresAt <= this.#now()) {
      await this.#store.remove(storeKey);
      return undefined;
    }
    return { value: entry.value as T, storedAt: entry.storedAt };
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    if (ttlMs <= 0) return;
    const now = this.#now();
    const entry: Entry<T> = { value, storedAt: now, expiresAt: now + ttlMs };
    await this.#store.set({ [this.#prefix + key]: entry });
    if (--this.#writesUntilPrune <= 0) {
      this.#writesUntilPrune = this.#pruneEvery;
      await this.prune();
    }
  }

  async clear(): Promise<void> {
    const keys = Object.keys(await this.#entries());
    if (keys.length > 0) await this.#store.remove(keys);
  }

  /** Drops expired entries, then the oldest ones beyond maxEntries. */
  async prune(): Promise<void> {
    const now = this.#now();
    const live: [string, number][] = [];
    const doomed: string[] = [];
    for (const [key, entry] of Object.entries(await this.#entries())) {
      if (entry.expiresAt <= now) doomed.push(key);
      else live.push([key, entry.storedAt]);
    }
    if (live.length > this.#maxEntries) {
      live.sort((a, b) => a[1] - b[1]);
      doomed.push(...live.slice(0, live.length - this.#maxEntries).map(([key]) => key));
    }
    if (doomed.length > 0) await this.#store.remove(doomed);
  }

  async #entries(): Promise<Record<string, Entry<unknown>>> {
    const all = await this.#store.get(null);
    return Object.fromEntries(
      Object.entries(all).filter(
        (pair): pair is [string, Entry<unknown>] =>
          pair[0].startsWith(this.#prefix) && isEntry(pair[1]),
      ),
    );
  }
}
