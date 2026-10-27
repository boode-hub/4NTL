/**
 * The one place lookups happen: validation, API-key resolution, caching and
 * de-duplication of concurrent identical requests. Every dependency is
 * injected so the whole policy is unit-testable without a browser.
 */
import type { CacheHit } from '../core/cache';
import { LookupError, toFailure } from '../core/errors';
import { indicatorKey, type Indicator } from '../core/indicator';
import { isPublicAddress } from '../core/ip';
import type { ProviderId } from '../core/provider-ids';
import type { LookupFailure, LookupOutcome, Report } from '../core/result';
import type { Settings } from '../core/settings';
import { PROVIDERS } from '../providers/registry';
import type { FetchLike, Provider } from '../providers/types';

export interface ReportCache {
  get(key: string): Promise<CacheHit<Report> | undefined>;
  set(key: string, value: Report, ttlMs: number): Promise<void>;
}

export interface LookupServiceDeps {
  readonly cache: ReportCache;
  readonly loadSettings: () => Promise<Settings>;
  readonly fetch: FetchLike;
  readonly providers?: Readonly<Record<ProviderId, Provider>>;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

/** Failures that don't involve the provider's servers; linking to its site wouldn't help. */
const LOCAL_FAILURES = new Set<LookupFailure['code']>([
  'unsupported',
  'private_address',
  'invalid_indicator',
]);

export interface LookupOptions {
  /** Skip the cache (an explicit "Retry"). */
  readonly force?: boolean;
}

/**
 * A settled outcome is shared with identical requests for this long. The card
 * asks for the lookups the service worker already started on click; if one of
 * those failed (rate limit, bad key…) it must get that failure, not trigger a
 * second request that burns more quota.
 */
export const SHARE_WINDOW_MS = 5_000;

interface SharedLookup {
  readonly promise: Promise<LookupOutcome>;
  settledAt?: number;
}

export class LookupService {
  readonly #deps: Required<LookupServiceDeps>;
  readonly #shared = new Map<string, SharedLookup>();

  constructor(deps: LookupServiceDeps) {
    this.#deps = { providers: PROVIDERS, now: Date.now, timeoutMs: DEFAULT_TIMEOUT_MS, ...deps };
  }

  /**
   * Never rejects: every failure is reported as `{ ok: false }`. Identical
   * requests share one in-flight call; `force` (Retry) only skips outcomes that
   * have already settled.
   */
  lookup(
    providerId: ProviderId,
    indicator: Indicator,
    options: LookupOptions = {},
  ): Promise<LookupOutcome> {
    const key = `${providerId}|${indicatorKey(indicator)}`;
    const force = options.force ?? false;
    const now = this.#deps.now();
    this.#forgetSettled(now);

    const shared = this.#shared.get(key);
    if (shared && (shared.settledAt === undefined || !force)) return shared.promise;

    const entry: SharedLookup = {
      promise: this.#run(this.#deps.providers[providerId], indicator, key, force),
    };
    void entry.promise.then(() => {
      entry.settledAt = this.#deps.now();
    });
    this.#shared.set(key, entry);
    return entry.promise;
  }

  #forgetSettled(now: number): void {
    for (const [key, entry] of this.#shared) {
      if (entry.settledAt !== undefined && now - entry.settledAt >= SHARE_WINDOW_MS) {
        this.#shared.delete(key);
      }
    }
  }

  async #run(
    provider: Provider,
    indicator: Indicator,
    key: string,
    force: boolean,
  ): Promise<LookupOutcome> {
    const { cache, loadSettings, fetch, now, timeoutMs } = this.#deps;
    try {
      if (!provider.supports.has(indicator.type)) {
        throw new LookupError(
          'unsupported',
          `${provider.name} only checks ${provider.supportsLabel}.`,
        );
      }
      if (!isPublicAddress(indicator)) {
        throw new LookupError(
          'private_address',
          'Private or reserved address — never sent to third-party services.',
        );
      }
      const settings = await loadSettings();
      const apiKey = settings.apiKeys[provider.id];
      if (!apiKey) {
        throw new LookupError('no_api_key', `Add your ${provider.name} API key to look this up.`);
      }

      if (!force) {
        const hit = await cache.get(key);
        if (hit) return { ok: true, report: hit.value, fetchedAt: hit.storedAt, cached: true };
      }

      const report = await provider.lookup(indicator, { apiKey, settings, fetch, now, timeoutMs });
      const fetchedAt = now();
      // A cache failure (e.g. quota) must never cost the user a result they already paid for.
      await cache.set(key, report, settings.cacheTtlMinutes * 60_000).catch((error: unknown) => {
        console.warn('[4NTL] could not cache result', error);
      });
      return { ok: true, report, fetchedAt, cached: false };
    } catch (error) {
      const failure = toFailure(error);
      return LOCAL_FAILURES.has(failure.code)
        ? { ok: false, error: failure }
        : { ok: false, error: { ...failure, reportUrl: provider.reportUrl(indicator) } };
    }
  }
}
