/** Pure translation from "what the user selected + which providers" to what the card shows. */
import { INDICATOR_LABELS, resolveSelection, type Indicator } from '../core/indicator';
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

function providersForScope(indicator: Indicator, scope: ProviderScope): ProviderInfo[] {
  // An explicitly chosen provider is kept even if it can't handle the indicator,
  // so the card can explain why instead of silently showing nothing.
  if (scope !== 'all') return [toInfo(getProvider(scope))];
  return providersFor(indicator).map(toInfo);
}

export function buildView(selection: string, scope: ProviderScope): CardView {
  const resolution = resolveSelection(selection);
  switch (resolution.kind) {
    case 'none':
      return NO_INDICATOR_NOTICE;
    case 'single': {
      const providers = providersForScope(resolution.indicator, scope);
      if (providers.length === 0) {
        return {
          kind: 'notice',
          title: 'Not supported yet',
          text: `No provider can look up a ${INDICATOR_LABELS[resolution.indicator.type]}.`,
        };
      }
      return { kind: 'lookup', indicator: resolution.indicator, providers };
    }
    case 'multiple':
      return {
        kind: 'choose',
        choices: resolution.indicators.map((indicator) => ({
          indicator,
          providers: providersForScope(indicator, scope),
        })),
        truncated: resolution.truncated,
      };
  }
}
