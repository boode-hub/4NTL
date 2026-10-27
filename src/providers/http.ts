/** HTTP plumbing shared by providers: timeouts, JSON parsing and status → LookupError mapping. */
import { LookupError } from '../core/errors';
import type { FetchLike } from './types';

export interface JsonResponse {
  readonly status: number;
  readonly headers: Headers;
  /** Parsed JSON body, or null when the body was empty or not JSON. */
  readonly body: unknown;
}

export interface RequestOptions {
  readonly providerName: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly fetch: FetchLike;
  readonly timeoutMs: number;
}

function isAbort(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

export async function getJson(url: string, options: RequestOptions): Promise<JsonResponse> {
  const { providerName: name, timeoutMs } = options;
  const timeoutError = () =>
    new LookupError('timeout', `${name} didn't answer within ${Math.round(timeoutMs / 1000)} s.`);
  try {
    const response = await options.fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', ...options.headers },
      signal: AbortSignal.timeout(timeoutMs),
      // Never mix the user's logged-in web session with API calls.
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        if (response.ok)
          throw new LookupError('bad_response', `${name} sent a response 4NTL couldn't read.`);
      }
    }
    return { status: response.status, headers: response.headers, body };
  } catch (error) {
    if (error instanceof LookupError) throw error;
    if (isAbort(error)) throw timeoutError();
    throw new LookupError('network', `Couldn't reach ${name}. Check your connection or proxy.`);
  }
}

/** Seconds until a rate limit resets, from `Retry-After` (seconds or HTTP date). */
export function retryAfterSeconds(headers: Headers, nowMs: number): number | undefined {
  const raw = headers.get('retry-after')?.trim();
  if (!raw) return undefined;
  const seconds = /^\d+$/.test(raw) ? Number(raw) : (Date.parse(raw) - nowMs) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

export function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds} s`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

/** Throws the LookupError matching a non-success HTTP status. */
export function failForStatus(
  response: JsonResponse,
  name: string,
  detail: string | undefined,
  nowMs: number,
): never {
  const { status } = response;
  if (status === 401 || status === 403) {
    throw new LookupError('auth', `${name} rejected the API key${detail ? ` (${detail})` : ''}.`);
  }
  if (status === 429) {
    const wait = retryAfterSeconds(response.headers, nowMs);
    const suffix =
      wait === undefined ? ' Try again shortly.' : ` Try again in ${formatWait(wait)}.`;
    throw new LookupError('rate_limited', `${name} quota reached.${suffix}`, wait);
  }
  if (status >= 500) {
    throw new LookupError(
      'server',
      `${name} is having problems (HTTP ${status}). Try again later.`,
    );
  }
  if (status >= 400) {
    throw new LookupError(
      'bad_request',
      detail ?? `${name} couldn't process this request (HTTP ${status}).`,
    );
  }
  throw new LookupError('bad_response', `Unexpected HTTP ${status} response from ${name}.`);
}
