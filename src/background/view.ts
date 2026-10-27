/** Pure translation from "what the user selected + which providers" to what the card shows. */
import { INDICATOR_LABELS, MAX_CHOICES, resolveSelection, type Indicator } from '../core/indicator';
import type { CardView, ProviderInfo } from '../core/messages';
import type { ProviderId } from '../core/provider-ids';
import { getProvider, providersFor, toInfo } from '../providers/registry';

/** A single provider, or every provider that supports the indicator. */
export type ProviderScope = ProviderId | 'all';

export const NO_INDICATOR_NOTICE: CardView = {
  kind: 'notice',
  title: 'No indicator found',
  text: 'Select an IP address, domain, URL or MD5 / SHA-1 / SHA-256 hash, then try again.',
};

/** Right-click on something that leads nowhere 4NTL can see (and catching a click isn't possible). */
export const NO_LINK_NOTICE: CardView = {
  kind: 'notice',
  title: 'No link here',
  text: 'This doesn’t lead anywhere 4NTL can see. Right-click a link or button, or select an address.',
};

/** Shown while waiting for the user to click a JavaScript-only button. */
export const CAPTURE_NOTICE: CardView = {
  kind: 'notice',
  title: 'Click it to check where it goes',
  text: 'This button has no address until it’s clicked. Click it now: 4NTL will catch where it goes and stop it from opening. (Waiting 20 seconds.)',
};

/** Toolbar / address-bar check of a page that isn't a web address (browser pages, files…). */
export const NOT_A_WEB_PAGE_NOTICE: CardView = {
  kind: 'notice',
  title: 'Not a web address',
  text: 'Only http(s) pages can be looked up.',
};

function providersForScope(indicator: Indicator, scope: ProviderScope): ProviderInfo[] {
  // An explicitly chosen provider is kept even if it can't handle the indicator,
  // so the card can explain why instead of silently showing nothing.
  if (scope !== 'all') return [toInfo(getProvider(scope))];
  return providersFor(indicator).map(toInfo);
}

/** One indicator → its lookup; several → a picker (at most MAX_CHOICES). */
export function viewForIndicators(
  indicators: readonly Indicator[],
  scope: ProviderScope,
  truncated = false,
): CardView {
  const [first] = indicators;
  if (!first) return NO_INDICATOR_NOTICE;
  if (indicators.length === 1) {
    const providers = providersForScope(first, scope);
    if (providers.length === 0) {
      return {
        kind: 'notice',
        title: 'Not supported yet',
        text: `No provider can look up a ${INDICATOR_LABELS[first.type]}.`,
      };
    }
    return { kind: 'lookup', indicator: first, providers };
  }
  return {
    kind: 'choose',
    choices: indicators
      .slice(0, MAX_CHOICES)
      .map((indicator) => ({ indicator, providers: providersForScope(indicator, scope) })),
    truncated: truncated || indicators.length > MAX_CHOICES,
  };
}

export function buildView(selection: string, scope: ProviderScope): CardView {
  const resolution = resolveSelection(selection);
  switch (resolution.kind) {
    case 'none':
      return NO_INDICATOR_NOTICE;
    case 'single':
      return viewForIndicators([resolution.indicator], scope);
    case 'multiple':
      return viewForIndicators(resolution.indicators, scope, resolution.truncated);
  }
}
