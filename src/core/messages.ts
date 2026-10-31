/**
 * The message protocol between the service worker and the UI surfaces
 * (in-page card, fallback result window). Every incoming message is validated
 * with the guards below before it is acted on.
 */
import { isIndicatorType, type Indicator } from './indicator';
import { isProviderId, type ProviderId } from './provider-ids';
import type { LookupOutcome } from './result';
import type { Appearance } from './settings';

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

/** Catching where a JavaScript-only button goes: how long to wait for the click. */
export const CAPTURE_MS = 20_000;
/** Event the page-world window.open hook dispatches with the URL it caught. */
export const CAPTURED_OPEN_EVENT = '4ntl:captured-open';
/** A navigation only counts as "the click" if it follows a user click or key press this soon. */
export const GESTURE_WINDOW_MS = 3_000;
const MAX_URL_LENGTH = 4096;

/** Service worker → content script. */
export type ContentMessage =
  | { readonly type: '4ntl:ping' }
  | {
      readonly type: '4ntl:show';
      readonly view: CardView;
      readonly appearance: Appearance;
      /** Top-right corner instead of next to the pointer (toolbar / address-bar lookups). */
      readonly corner: boolean;
    }
  /** Where does the right-clicked element lead? Answered with an InspectResponse. */
  | { readonly type: '4ntl:inspect' }
  /** Catch the next navigation (the user is about to click a JavaScript-only button). */
  | { readonly type: '4ntl:capture' };

export interface InspectResponse {
  readonly urls: readonly string[];
}

/** UI surface → service worker. */
export type BackgroundMessage =
  | {
      readonly type: '4ntl:lookup';
      readonly provider: ProviderId;
      readonly indicator: Indicator;
      /** Bypass the cache (the "Retry" button). */
      readonly force: boolean;
    }
  | { readonly type: '4ntl:open-options' }
  | { readonly type: '4ntl:open-list' }
  /** The content script caught (and stopped) a navigation during capture. */
  | { readonly type: '4ntl:captured'; readonly url: string };

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
    case '4ntl:open-list':
      return true;
    case '4ntl:captured':
      return typeof value.url === 'string' && value.url.length <= MAX_URL_LENGTH;
    default:
      return false;
  }
}

export function isContentMessage(value: unknown): value is ContentMessage {
  if (!isObject(value)) return false;
  // `view` is produced by our own service worker; checking its discriminant is enough.
  return (
    value.type === '4ntl:ping' ||
    value.type === '4ntl:inspect' ||
    value.type === '4ntl:capture' ||
    (value.type === '4ntl:show' &&
      isObject(value.view) &&
      ['lookup', 'choose', 'notice'].includes(String(value.view.kind)))
  );
}
