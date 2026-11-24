/** Pure translation from "what the user selected + which providers" to what the card shows. */
import {
  INDICATOR_LABELS,
  MAX_CHOICES,
  parseIndicator,
  processFromText,
  resolveSelection,
  type Indicator,
  type ParseOptions,
} from '../core/indicator';
import type { CardView, ProviderInfo } from '../core/messages';
import type { ProviderId } from '../core/provider-ids';
import { getProvider, providersFor, toInfo } from '../providers/registry';

/**
 * A single provider, every provider that supports the indicator, or "process":
 * the selection is a Windows process or service name, whatever it looks like.
 */
export type ProviderScope = ProviderId | 'all' | 'process';

/** How to read a selection, and which providers can't answer right now. */
export interface ViewOptions extends ParseOptions {
  /** No EchoTrail key, or the local library isn't downloaded yet. */
  readonly skip?: readonly ProviderId[];
}

/** A process with nothing to check it against yet. */
export const NO_PROCESS_SOURCE_NOTICE: CardView = {
  kind: 'notice',
  title: 'Nothing to check this with yet',
  text: 'Download the local library (Settings → Windows processes → Update now) or add an EchoTrail key.',
};

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

/** "Type an IP or domain…" in the right-click menu. */
export const ASK_VIEW: CardView = { kind: 'ask' };

function providersForScope(
  indicator: Indicator,
  scope: ProviderScope,
  skip: readonly ProviderId[] = [],
): ProviderInfo[] {
  // An explicitly chosen provider is kept even if it can't handle the indicator,
  // so the card can explain why instead of silently showing nothing.
  if (scope !== 'all' && scope !== 'process') return [toInfo(getProvider(scope))];
  return providersFor(indicator)
    .filter((provider) => !skip.includes(provider.id))
    .map(toInfo);
}

/** One indicator → its lookup; several → a picker (at most MAX_CHOICES). */
export function viewForIndicators(
  indicators: readonly Indicator[],
  scope: ProviderScope,
  truncated = false,
  skip: readonly ProviderId[] = [],
): CardView {
  const [first] = indicators;
  if (!first) return NO_INDICATOR_NOTICE;
  if (indicators.length === 1) {
    const providers = providersForScope(first, scope, skip);
    if (providers.length === 0 && first.type === 'process') return NO_PROCESS_SOURCE_NOTICE;
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
      .map((indicator) => ({ indicator, providers: providersForScope(indicator, scope, skip) })),
    truncated: truncated || indicators.length > MAX_CHOICES,
  };
}

export function buildView(
  selection: string,
  scope: ProviderScope,
  options: ViewOptions = {},
): CardView {
  const skip = options.skip ?? [];
  // "Look up as a process or service": the selection is a name, whatever it looks like.
  if (scope === 'process') {
    const indicator = parseIndicator(selection, { processes: true }) ?? processFromText(selection);
    return indicator ? viewForIndicators([indicator], scope, false, skip) : NO_INDICATOR_NOTICE;
  }
  const resolution = resolveSelection(selection, options);
  switch (resolution.kind) {
    case 'none':
      return NO_INDICATOR_NOTICE;
    case 'single':
      return viewForIndicators([resolution.indicator], scope, false, skip);
    case 'multiple':
      return viewForIndicators(resolution.indicators, scope, resolution.truncated, skip);
  }
}
