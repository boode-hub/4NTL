/**
 * The local process library on this computer: downloads LOLBAS, LOLDrivers and
 * HijackLibs, keeps them small (by file name) in extension storage, and answers
 * lookups from memory.
 *
 * Updating: once when the user switches Windows processes on (or presses
 * "Update now"), then at most once a day, and only when the library is used:
 * nothing runs in the background otherwise. Each check sends the version tag
 * (ETag) it already has, so an unchanged source costs a tiny "304 Not Modified"
 * instead of the full download (LOLDrivers is 36 MB raw).
 *
 * A lookup never waits for a download: before the first download finishes,
 * the library simply isn't used (see `ready`).
 */
import type { KeyValueStore } from '../core/cache';
import {
  own,
  slimHijacklibs,
  slimLolbas,
  slimLoldrivers,
  type DriverIndex,
  type HijackIndex,
  type LibraryMatch,
  type LolbasIndex,
} from '../providers/library-data';

export const LIBRARY_SOURCES = [
  { id: 'lolbas', name: 'LOLBAS', url: 'https://lolbas-project.github.io/api/lolbas.json' },
  { id: 'loldrivers', name: 'LOLDrivers', url: 'https://www.loldrivers.io/api/drivers.json' },
  { id: 'hijacklibs', name: 'HijackLibs', url: 'https://hijacklibs.net/api/hijacklibs.json' },
] as const;
export type LibrarySourceId = (typeof LIBRARY_SOURCES)[number]['id'];

export const LIBRARY_META_KEY = 'library.meta.v1';
export const libraryDataKey = (id: LibrarySourceId) => `library.${id}.v1`;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A source that has never downloaded (offline when switched on) is retried this often, on use. */
const RETRY_MS = 60 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 120_000;

export interface SourceStatus {
  readonly etag?: string;
  /** When the source was last asked whether it changed. */
  readonly checkedAt: number;
  /** When new data last arrived. */
  readonly updatedAt: number;
  /** File names indexed. */
  readonly names: number;
  /** The last check failed (the previous data, if any, is kept). */
  readonly error?: string;
}
export type LibraryStatus = Partial<Record<LibrarySourceId, SourceStatus>>;

interface LibraryData {
  readonly lolbas: LolbasIndex;
  readonly loldrivers: DriverIndex;
  readonly hijacklibs: HijackIndex;
}

const SLIM: Record<LibrarySourceId, (raw: unknown) => Record<string, unknown>> = {
  lolbas: slimLolbas,
  loldrivers: slimLoldrivers,
  hijacklibs: slimHijacklibs,
};

export interface LibraryStoreDeps {
  readonly area: KeyValueStore;
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;
  readonly now?: () => number;
  /** New data arrived: cached cards built from the old library are out of date. */
  readonly onChange?: () => Promise<void>;
}

export class LibraryStore {
  readonly #deps: Required<LibraryStoreDeps>;
  /** Bumped by clear(): a download still running when the user switches off must not write. */
  #generation = 0;
  /** The whole library in memory, loaded once per service-worker life. */
  #data: Promise<LibraryData> | undefined;
  #refreshing: Promise<LibraryStatus> | undefined;

  constructor(deps: LibraryStoreDeps) {
    this.#deps = { now: Date.now, onChange: () => Promise.resolve(), ...deps };
  }

  async status(): Promise<LibraryStatus> {
    const raw = (await this.#deps.area.get(LIBRARY_META_KEY))[LIBRARY_META_KEY];
    return typeof raw === 'object' && raw !== null ? raw : {};
  }

  /** At least one source has been downloaded. */
  async ready(): Promise<boolean> {
    const status = await this.status();
    return LIBRARY_SOURCES.some(({ id }) => (status[id]?.updatedAt ?? 0) > 0);
  }

  /**
   * Checks every source (all at once) and stores what changed. `force`: check
   * even if checked today ("Update now"). One refresh at a time.
   */
  refresh(force = false): Promise<LibraryStatus> {
    this.#refreshing ??= this.#refresh(force).finally(() => {
      this.#refreshing = undefined;
    });
    return this.#refreshing;
  }

  async #refresh(force: boolean): Promise<LibraryStatus> {
    const { area, fetch, now } = this.#deps;
    const generation = this.#generation;
    const cleared = () => generation !== this.#generation;
    // Set from inside the per-source downloads below.
    const outcome = { changed: false };
    const before = await this.status();
    const results = await Promise.all(
      LIBRARY_SOURCES.map(async ({ id, url }): Promise<[LibrarySourceId, SourceStatus]> => {
        const previous = before[id];
        if (!force && previous && now() - previous.checkedAt < DAY_MS && !previous.error) {
          return [id, previous];
        }
        try {
          const response = await fetch(url, {
            headers: previous?.etag ? { 'If-None-Match': previous.etag } : {},
            credentials: 'omit',
            cache: 'no-cache',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
          });
          if (response.status === 304 && previous) {
            // Unchanged: keep the data, note the check (and clear an old error).
            return [
              id,
              {
                ...(previous.etag ? { etag: previous.etag } : {}),
                checkedAt: now(),
                updatedAt: previous.updatedAt,
                names: previous.names,
              },
            ];
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const index = SLIM[id]((await response.json()) as unknown);
          const names = Object.keys(index).length;
          if (names === 0) throw new Error('empty or unreadable data');
          if (cleared()) throw new Error('switched off');
          await area.set({ [libraryDataKey(id)]: index });
          outcome.changed = true;
          const etag = response.headers.get('etag') ?? undefined;
          return [id, { ...(etag ? { etag } : {}), checkedAt: now(), updatedAt: now(), names }];
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return [
            id,
            {
              ...(previous ?? { updatedAt: 0, names: 0 }),
              checkedAt: now(),
              error: message.slice(0, 200),
            },
          ];
        }
      }),
    );
    const status: LibraryStatus = Object.fromEntries(results);
    // Switched off while downloading: leave nothing behind (clear() already removed it all).
    if (cleared()) {
      await area.remove(LIBRARY_SOURCES.map(({ id }) => libraryDataKey(id)));
      return {};
    }
    await area.set({ [LIBRARY_META_KEY]: status });
    this.#data = undefined; // reload from storage on the next lookup
    if (outcome.changed) await this.#deps.onChange().catch(() => undefined);
    return status;
  }

  /** Forgets the whole library (Windows processes switched off). */
  async clear(): Promise<void> {
    this.#generation++;
    this.#data = undefined;
    await this.#deps.area.remove([
      LIBRARY_META_KEY,
      ...LIBRARY_SOURCES.map(({ id }) => libraryDataKey(id)),
    ]);
  }

  /** What the library knows about a file name. Never downloads; refreshes stale data in the background. */
  async find(name: string): Promise<LibraryMatch> {
    await this.ensure();
    const data = await this.#load();
    const key = name.toLowerCase();
    return {
      lolbas: own(data.lolbas, key),
      drivers: own(data.loldrivers, key) ?? [],
      hijack: own(data.hijacklibs, key) ?? [],
    };
  }

  /**
   * On use: refreshes in the background (never waits) when a source is a day
   * old, or when one never downloaded and an hour has passed since it tried.
   */
  async ensure(): Promise<void> {
    const status = await this.status();
    const now = this.#deps.now();
    const due = LIBRARY_SOURCES.some(({ id }) => {
      const source = status[id];
      if (!source) return false; // never switched on: nothing to keep fresh
      return source.updatedAt > 0
        ? now - source.checkedAt >= DAY_MS
        : now - source.checkedAt >= RETRY_MS;
    });
    if (due) void this.refresh().catch(() => undefined);
  }

  #load(): Promise<LibraryData> {
    this.#data ??= (async () => {
      const keys = LIBRARY_SOURCES.map(({ id }) => libraryDataKey(id));
      const stored = await this.#deps.area.get(keys);
      // Written only by #refresh, from the slim* functions.
      const pick = (id: LibrarySourceId): object => {
        const value = stored[libraryDataKey(id)];
        return typeof value === 'object' && value !== null ? value : {};
      };
      return {
        lolbas: pick('lolbas') as LolbasIndex,
        loldrivers: pick('loldrivers') as DriverIndex,
        hijacklibs: pick('hijacklibs') as HijackIndex,
      };
    })().catch((error: unknown) => {
      this.#data = undefined;
      throw error;
    });
    return this.#data;
  }
}
