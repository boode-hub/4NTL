/** Stateless DOM rendering for the card's pieces. All event wiring comes in as callbacks. */
import { formatAgo } from '../core/format';
import { INDICATOR_LABELS, type Indicator } from '../core/indicator';
import type { Choice, ProviderInfo } from '../core/messages';
import {
  RETRYABLE_ERRORS,
  SETTINGS_ERRORS,
  VERDICT_LABELS,
  type LookupErrorCode,
  type LookupFailure,
  type LookupOutcome,
} from '../core/result';
import { h, icon, ICONS, sharinganEye } from './dom';

export const ERROR_LABELS: Readonly<Record<LookupErrorCode, string>> = {
  no_api_key: 'No API key',
  unsupported: 'Not supported',
  private_address: 'Skipped',
  invalid_indicator: 'Invalid',
  auth: 'Key rejected',
  rate_limited: 'Rate limited',
  bad_request: 'Rejected',
  timeout: 'Timed out',
  network: 'Offline',
  server: 'Service error',
  bad_response: 'Bad response',
  internal: 'Error',
};

export type SectionState =
  { readonly status: 'loading' } | { readonly status: 'done'; readonly outcome: LookupOutcome };

export interface SectionActions {
  readonly retry: () => void;
  readonly openOptions: () => void;
}

export function iconButton(
  label: string,
  path: string,
  onClick: (event: MouseEvent) => void,
): HTMLButtonElement {
  return h(
    'button',
    {
      class: 'icon-btn',
      attrs: { type: 'button', title: label, 'aria-label': label },
      on: { click: onClick },
    },
    icon(path),
  );
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  return h('button', { class: 'btn', attrs: { type: 'button' }, on: { click: onClick } }, label);
}

/** External links are only ever https and always open isolated from the page. */
function link(url: string | undefined, label: string): HTMLAnchorElement | null {
  if (!url?.startsWith('https://')) return null;
  return h(
    'a',
    { class: 'link', attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' } },
    `${label} ↗`,
  );
}

export function renderIndicatorHeader(
  indicator: Indicator,
  onCopy: (event: MouseEvent) => void,
  onClose: () => void,
): HTMLElement {
  return h(
    'div',
    { class: 'header' },
    sharinganEye(),
    h('span', { class: 'ioc', attrs: { title: indicator.value } }, indicator.value),
    h('span', { class: 'type' }, INDICATOR_LABELS[indicator.type]),
    iconButton('Copy indicator', ICONS.copy, onCopy),
    iconButton('Close', ICONS.close, onClose),
  );
}

export function renderTitleHeader(title: string, onClose: () => void): HTMLElement {
  return h(
    'div',
    { class: 'header' },
    sharinganEye(),
    h('span', { class: 'title' }, title),
    iconButton('Close', ICONS.close, onClose),
  );
}

function sectionHead(provider: ProviderInfo, pill: string): HTMLElement {
  return h(
    'div',
    { class: 'provider-head' },
    h('span', { class: 'provider-name' }, provider.name),
    h('span', { class: 'pill' }, pill),
  );
}

function gauge(score: number): HTMLElement {
  const fill = h('div', { class: 'gauge-fill' });
  // CSSOM assignment is not subject to the page's style-src CSP.
  fill.style.width = `${Math.round(Math.min(1, Math.max(0, score)) * 100)}%`;
  return h('div', { class: 'gauge', attrs: { 'aria-hidden': 'true' } }, fill);
}

function failureSection(
  provider: ProviderInfo,
  error: LookupFailure,
  actions: SectionActions,
): HTMLElement {
  const fix = SETTINGS_ERRORS.has(error.code)
    ? button('Open settings', actions.openOptions)
    : RETRYABLE_ERRORS.has(error.code)
      ? button('Retry', actions.retry)
      : null;
  return h(
    'section',
    {
      class: 'provider v-unknown',
      attrs: { 'data-provider': provider.id, 'data-error': error.code },
    },
    sectionHead(provider, ERROR_LABELS[error.code]),
    h('p', { class: 'message' }, error.message),
    (fix ?? error.reportUrl) &&
      h(
        'div',
        { class: 'foot' },
        h('div', { class: 'actions' }, fix, link(error.reportUrl, `Open ${provider.name}`)),
      ),
  );
}

export function renderSection(
  provider: ProviderInfo,
  state: SectionState,
  actions: SectionActions,
  nowMs: number,
): HTMLElement {
  if (state.status === 'loading') {
    return h(
      'section',
      { class: 'provider', attrs: { 'data-provider': provider.id, 'aria-busy': 'true' } },
      sectionHead(provider, 'Checking…'),
      h(
        'div',
        { class: 'skeleton', attrs: { 'aria-hidden': 'true' } },
        h('span'),
        h('span'),
        h('span'),
      ),
    );
  }

  const { outcome } = state;
  if (!outcome.ok) return failureSection(provider, outcome.error, actions);

  const { report } = outcome;
  return h(
    'section',
    {
      class: `provider v-${report.verdict}`,
      attrs: { 'data-provider': provider.id, 'data-verdict': report.verdict },
    },
    sectionHead(provider, VERDICT_LABELS[report.verdict]),
    h(
      'div',
      { class: 'headline' },
      h('span', { class: 'headline-value' }, report.headline),
      h('span', { class: 'headline-caption' }, report.caption),
    ),
    report.score !== undefined && gauge(report.score),
    report.tags.length > 0 &&
      h('div', { class: 'tags' }, ...report.tags.map((tag) => h('span', { class: 'tag' }, tag))),
    report.facts.length > 0 &&
      h(
        'dl',
        { class: 'facts' },
        ...report.facts.flatMap((fact) => [h('dt', {}, fact.label), h('dd', {}, fact.value)]),
      ),
    h(
      'div',
      { class: 'foot' },
      h(
        'span',
        { class: 'meta' },
        outcome.cached ? `Cached · ${formatAgo(outcome.fetchedAt, nowMs)}` : '',
      ),
      h('div', { class: 'actions' }, link(report.reportUrl, 'Full report')),
    ),
  );
}

export function renderChoices(
  choices: readonly Choice[],
  truncated: boolean,
  onPick: (choice: Choice) => void,
): HTMLElement {
  const intro = truncated
    ? `Many indicators selected — here are the first ${choices.length}. Pick one:`
    : `${choices.length} indicators selected. Pick one:`;
  return h(
    'div',
    { class: 'notice' },
    h('p', { class: 'notice-text' }, intro),
    h(
      'ul',
      { class: 'choices' },
      ...choices.map((choice) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              class: 'choice',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  onPick(choice);
                },
              },
            },
            h('span', { class: 'ioc' }, choice.indicator.value),
            h('span', { class: 'type' }, INDICATOR_LABELS[choice.indicator.type]),
          ),
        ),
      ),
    ),
  );
}

export function renderNotice(text: string): HTMLElement {
  return h('div', { class: 'notice' }, h('p', { class: 'notice-text' }, text));
}
