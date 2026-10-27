import type { Indicator, IndicatorType } from '../core/indicator';
import type { ProviderId } from '../core/provider-ids';
import type { Report } from '../core/result';
import type { Settings } from '../core/settings';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Everything a provider may use; injected so providers stay pure and testable. */
export interface ProviderContext {
  readonly apiKey: string;
  readonly settings: Settings;
  readonly fetch: FetchLike;
  readonly timeoutMs: number;
  readonly now: () => number;
}

export type KeyCheckContext = Omit<ProviderContext, 'settings'>;

/**
 * A threat-intelligence source. Implementations translate one service's API
 * into the provider-agnostic Report model; they never touch the DOM, storage
 * or caching. To add a source, see docs/ADDING_A_PROVIDER.md.
 */
export interface Provider {
  readonly id: ProviderId;
  readonly name: string;
  readonly supports: ReadonlySet<IndicatorType>;
  /** Plain-language scope, shown when an unsupported indicator is selected. */
  readonly supportsLabel: string;
  /** Shape of a well-formed key; only used to warn about paste mistakes. */
  readonly apiKeyPattern: RegExp;
  /** Where users create/find their key. */
  readonly apiKeyUrl: string;
  reportUrl(indicator: Indicator): string;
  /** Resolves to a Report or rejects with a LookupError. */
  lookup(indicator: Indicator, ctx: ProviderContext): Promise<Report>;
  /** Verifies a key; resolves to a short status line or rejects with a LookupError. */
  checkKey(ctx: KeyCheckContext): Promise<string>;
}
