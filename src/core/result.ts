/**
 * Provider-agnostic result model. Providers translate their raw API responses
 * into a Report; the UI renders Reports without knowing which provider made them.
 * Everything here must stay JSON-serialisable (it crosses extension messaging).
 */

export const VERDICTS = ['malicious', 'suspicious', 'clean', 'unknown'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const VERDICT_LABELS: Readonly<Record<Verdict, string>> = {
  malicious: 'Malicious',
  suspicious: 'Suspicious',
  clean: 'Clean',
  unknown: 'Unknown',
};

export interface Fact {
  readonly label: string;
  readonly value: string;
}

export interface Report {
  readonly verdict: Verdict;
  /** The one number that matters, e.g. "87" or "12 / 94". */
  readonly headline: string;
  /** What the headline means, e.g. "abuse confidence" or "vendors flagged it". */
  readonly caption: string;
  /** Optional 0–1 value drawn as a gauge. */
  readonly score?: number;
  /** Short badges such as "Tor exit node". */
  readonly tags: readonly string[];
  /** A handful of already-formatted details. */
  readonly facts: readonly Fact[];
  /** Link to the provider's full report for this indicator. */
  readonly reportUrl: string;
}

export const ERROR_CODES = [
  'no_api_key',
  'unsupported',
  'private_address',
  'invalid_indicator',
  'auth',
  'rate_limited',
  'bad_request',
  'timeout',
  'network',
  'server',
  'bad_response',
  'internal',
  'payment_required',
] as const;
export type LookupErrorCode = (typeof ERROR_CODES)[number];

/** Errors the user can fix by trying again. */
export const RETRYABLE_ERRORS: ReadonlySet<LookupErrorCode> = new Set([
  'rate_limited',
  'timeout',
  'network',
  'server',
  'bad_response',
  'internal',
]);

/** Errors the user fixes in the settings page. */
export const SETTINGS_ERRORS: ReadonlySet<LookupErrorCode> = new Set([
  'no_api_key',
  'auth',
  'payment_required',
]);

export interface LookupFailure {
  readonly code: LookupErrorCode;
  readonly message: string;
  readonly retryAfterSec?: number;
  /** The provider's web page for the indicator, when opening it could still help. */
  readonly reportUrl?: string;
}

export type LookupOutcome =
  | {
      readonly ok: true;
      readonly report: Report;
      readonly fetchedAt: number;
      readonly cached: boolean;
    }
  | { readonly ok: false; readonly error: LookupFailure };
