/**
 * "4NTL: check this link / what this opens": works out where a right-clicked
 * link, button or card leads, in order of reliability:
 *   1. the browser's own link address, when it's a real one;
 *   2. what the page says (handlers, data attributes, forms…), via the content script;
 *   3. catching the navigation when the user clicks it (JavaScript-only buttons).
 * Wrapped links (Safe Links, Proofpoint…) are unwrapped by the indicator parser.
 */
import { parseIndicator, type Indicator } from '../core/indicator';
import type { CardView } from '../core/messages';
import type { FrameTarget } from './present';
import { CAPTURE_NOTICE, NO_LINK_NOTICE, viewForIndicators } from './view';

export interface LinkCheck {
  readonly target: FrameTarget | undefined;
  /** What the browser reports as the link address (only set on real links). */
  readonly linkUrl?: string | undefined;
  /** The page the right-click happened on. */
  readonly pageUrl?: string | undefined;
}

export interface LinkDeps {
  readonly inspect: (target: FrameTarget) => Promise<string[]>;
  readonly capture: (target: FrameTarget) => Promise<boolean>;
  readonly present: (view: CardView, target: FrameTarget | undefined) => Promise<void>;
}

/** The browser's link address, unless it's a `javascript:`/`mailto:` link or a "#" on this page. */
export function directLink(
  linkUrl: string | undefined,
  pageUrl: string | undefined,
): string | undefined {
  if (!linkUrl) return undefined;
  let url: URL;
  try {
    url = new URL(linkUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  const stripHash = (href: string) => href.split('#', 1)[0];
  if (pageUrl && url.href.includes('#') && stripHash(url.href) === stripHash(pageUrl)) {
    return undefined;
  }
  return url.href;
}

export function indicatorsFromUrls(urls: readonly string[]): Indicator[] {
  const seen = new Set<string>();
  return urls.flatMap((raw) => {
    const indicator = parseIndicator(raw);
    if (!indicator || seen.has(indicator.value)) return [];
    seen.add(indicator.value);
    return [indicator];
  });
}

export async function checkLink(check: LinkCheck, deps: LinkDeps): Promise<CardView> {
  const { target } = check;
  const direct = directLink(check.linkUrl, check.pageUrl);
  const urls = direct ? [direct] : target ? await deps.inspect(target) : [];
  const indicators = indicatorsFromUrls(urls);

  let view: CardView;
  if (indicators.length > 0) view = viewForIndicators(indicators, 'all');
  else if (target && (await deps.capture(target))) view = CAPTURE_NOTICE;
  else view = NO_LINK_NOTICE;
  await deps.present(view, target);
  return view;
}

/** The content script caught where a clicked button was going. */
export async function checkCaptured(
  url: string,
  target: FrameTarget | undefined,
  present: LinkDeps['present'],
): Promise<CardView> {
  const view = viewForIndicators(indicatorsFromUrls([url]), 'all');
  await present(view.kind === 'notice' ? NO_LINK_NOTICE : view, target);
  return view;
}
