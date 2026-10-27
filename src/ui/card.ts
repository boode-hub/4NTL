/**
 * The result card: a self-contained widget that renders a CardView, runs the
 * lookups it needs through a CardClient, and cleans up every listener and
 * timer when closed. Used floating in web pages and inline in the fallback window.
 */
import type { Indicator } from '../core/indicator';
import type { CardView, ProviderInfo } from '../core/messages';
import type { ProviderId } from '../core/provider-ids';
import type { LookupOutcome } from '../core/result';
import { h, icon, ICONS } from './dom';
import { placeCard, type Rect } from './position';
import {
  renderChoices,
  renderIndicatorHeader,
  renderNotice,
  renderSection,
  renderTitleHeader,
  type SectionActions,
  type SectionState,
} from './render';
import { CARD_CSS } from './styles';

export interface CardClient {
  /** Must resolve (never reject) with an outcome. */
  lookup(provider: ProviderId, indicator: Indicator, force: boolean): Promise<LookupOutcome>;
  openOptions(): void;
}

export type CardPlacement =
  | { readonly mode: 'floating'; readonly anchor: Rect }
  | { readonly mode: 'inline'; readonly container: HTMLElement };

export interface CardOptions {
  readonly client: CardClient;
  readonly placement: CardPlacement;
  readonly onClose?: () => void;
  readonly now?: () => number;
}

export const HOST_TAG = 'x-4ntl-card';
const COPY_FEEDBACK_MS = 1200;
const LOADING: SectionState = { status: 'loading' };

async function copyText(text: string, scratch: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The async Clipboard API is unavailable on http:// pages and in some frames.
    const area = h('textarea', { attrs: { 'aria-hidden': 'true' } });
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    scratch.append(area);
    area.select();
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the only fallback that works there
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export class ResultCard {
  readonly #options: CardOptions;
  readonly #host: HTMLElement;
  readonly #card: HTMLElement;
  readonly #cleanup: (() => void)[] = [];
  /** Bumped on every show(); responses for an older view are dropped. */
  #viewId = 0;
  #closed = false;

  constructor(options: CardOptions) {
    this.#options = options;
    const floating = options.placement.mode === 'floating';
    this.#host = document.createElement(HOST_TAG);
    // Closed: page scripts can't reach into the card. Open in e2e builds so tests can.
    const root = this.#host.attachShadow({ mode: __E2E__ ? 'open' : 'closed' });
    this.#card = h('div', {
      class: floating ? 'card' : 'card inline',
      attrs: { role: 'dialog', 'aria-label': '4NTL lookup' },
    });
    root.append(h('style', {}, CARD_CSS), this.#card);

    this.#listen(window, 'keydown', (event) => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      event.stopPropagation();
      this.close();
    });

    if (options.placement.mode === 'floating') {
      const style = this.#host.style;
      for (const [name, value] of Object.entries({
        position: 'fixed',
        'z-index': '2147483647',
        left: '0',
        top: '0',
        margin: '0',
        display: 'block',
        visibility: 'hidden',
      })) {
        // !important via CSSOM: immune to the page's stylesheets and to its style-src CSP.
        style.setProperty(name, value, 'important');
      }
      document.documentElement.append(this.#host);
      this.#listen(document, 'pointerdown', (event) => {
        if (!event.composedPath().includes(this.#host)) this.close();
      });
      this.#listen(window, 'resize', () => {
        this.#place();
      });
    } else {
      options.placement.container.append(this.#host);
    }
  }

  get closed(): boolean {
    return this.#closed;
  }

  show(view: CardView): void {
    if (this.#closed) return;
    const viewId = ++this.#viewId;
    const close = () => {
      this.close();
    };

    switch (view.kind) {
      case 'lookup': {
        const { indicator } = view;
        const sections = view.providers.map((provider) =>
          this.#mountSection(viewId, provider, indicator),
        );
        this.#card.replaceChildren(
          renderIndicatorHeader(
            indicator,
            (event) => void this.#copy(indicator.value, event),
            close,
          ),
          ...sections,
        );
        break;
      }
      case 'choose':
        this.#card.replaceChildren(
          renderTitleHeader('Choose an indicator', close),
          renderChoices(view.choices, view.truncated, (choice) => {
            this.show({ kind: 'lookup', indicator: choice.indicator, providers: choice.providers });
          }),
        );
        break;
      case 'notice':
        this.#card.replaceChildren(renderTitleHeader(view.title, close), renderNotice(view.text));
        break;
    }
    this.#place();
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const dispose of this.#cleanup.splice(0)) dispose();
    this.#host.remove();
    this.#options.onClose?.();
  }

  /** Renders one provider's section and keeps it updated through loading → result → retry. */
  #mountSection(viewId: number, provider: ProviderInfo, indicator: Indicator): HTMLElement {
    const now = this.#options.now ?? Date.now;
    const actions: SectionActions = {
      retry: () => {
        run(true);
      },
      openOptions: () => {
        this.#options.client.openOptions();
      },
    };
    let element = renderSection(provider, LOADING, actions, now());
    const swap = (next: HTMLElement) => {
      element.replaceWith(next);
      element = next;
      this.#place();
    };
    const run = (force: boolean) => {
      if (force) swap(renderSection(provider, LOADING, actions, now()));
      void this.#options.client
        .lookup(provider.id, indicator, force)
        .catch((): LookupOutcome => ({
          ok: false,
          error: { code: 'internal', message: 'Lookup failed.' },
        }))
        .then((outcome) => {
          if (this.#closed || viewId !== this.#viewId) return;
          swap(renderSection(provider, { status: 'done', outcome }, actions, now()));
        });
    };
    run(false);
    return element;
  }

  async #copy(value: string, event: MouseEvent): Promise<void> {
    const button = event.currentTarget;
    if (!(button instanceof HTMLElement)) return;
    const ok = await copyText(value, this.#card);
    if (this.#closed) return;
    button.replaceChildren(icon(ok ? ICONS.check : ICONS.copy));
    button.title = ok ? 'Copied' : 'Copy failed';
    const timer = setTimeout(() => {
      button.replaceChildren(icon(ICONS.copy));
      button.title = 'Copy indicator';
    }, COPY_FEEDBACK_MS);
    this.#cleanup.push(() => {
      clearTimeout(timer);
    });
  }

  #place(): void {
    const { placement } = this.#options;
    if (placement.mode !== 'floating' || this.#closed) return;
    const { width, height } = this.#card.getBoundingClientRect();
    const viewport = {
      width: document.documentElement.clientWidth || window.innerWidth,
      height: window.innerHeight,
    };
    const { left, top } = placeCard(placement.anchor, { width, height }, viewport);
    this.#host.style.setProperty('left', `${Math.round(left)}px`, 'important');
    this.#host.style.setProperty('top', `${Math.round(top)}px`, 'important');
    this.#host.style.setProperty('visibility', 'visible', 'important');
  }

  #listen(target: EventTarget, type: string, listener: (event: Event) => void): void {
    target.addEventListener(type, listener, true);
    this.#cleanup.push(() => {
      target.removeEventListener(type, listener, true);
    });
  }
}
