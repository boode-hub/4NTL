/**
 * The message protocol between the service worker and the UI surfaces
 * (in-page card, fallback result window). Every incoming message is validated
 * with the guards below before it is acted on.
 */
import { isIndicatorType, type Indicator } from './indicator';
import { isProviderId, type ProviderId } from './provider-ids';
import type { LookupOutcome } from './result';

export interface ProviderInfo {
  readonly id: ProviderId;
  readonly name: string;
}

export interface Choice {
  readonly indicator: Indicator;
  readonly providers: readonly ProviderInfo[];
}

/** What the result card should display. */
export type CardView =
  | {
      readonly kind: 'lookup';
      readonly indicator: Indicator;
      readonly providers: readonly ProviderInfo[];
    }
  | { readonly kind: 'choose'; readonly choices: readonly Choice[]; readonly truncated: boolean }
  | { readonly kind: 'notice'; readonly title: string; readonly text: string };

/** Service worker → content script. */
export type ContentMessage =
  { readonly type: '4ntl:ping' } | { readonly type: '4ntl:show'; readonly view: CardView };

/** UI surface → service worker. */
export type BackgroundMessage =
  | {
      readonly type: '4ntl:lookup';
      readonly provider: ProviderId;
      readonly indicator: Indicator;
      /** Bypass the cache (the "Retry" button). */
      readonly force: boolean;
    }
  | { readonly type: '4ntl:open-options' };

export type LookupResponse = LookupOutcome;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isIndicator(value: unknown): value is Indicator {
  return isObject(value) && isIndicatorType(value.type) && typeof value.value === 'string';
}

export function isBackgroundMessage(value: unknown): value is BackgroundMessage {
  if (!isObject(value)) return false;
  switch (value.type) {
    case '4ntl:lookup':
      return (
        isProviderId(value.provider) &&
        isIndicator(value.indicator) &&
        typeof value.force === 'boolean'
      );
    case '4ntl:open-options':
      return true;
    default:
      return false;
  }
}

export function isContentMessage(value: unknown): value is ContentMessage {
  if (!isObject(value)) return false;
  // `view` is produced by our own service worker; checking its discriminant is enough.
  return (
    value.type === '4ntl:ping' ||
    (value.type === '4ntl:show' &&
      isObject(value.view) &&
      ['lookup', 'choose', 'notice'].includes(String(value.view.kind)))
  );
}
