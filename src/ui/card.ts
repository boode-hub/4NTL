/**
 * The result card: a self-contained widget that renders a CardView, runs the
 * lookups it needs through a CardClient, and cleans up every listener and
 * timer when closed. Used floating in web pages and inline in the fallback window.
 */
import type { Indicator } from '../core/indicator';
import type { CardView, ProviderInfo } from '../core/messages';
import type { ProviderId } from '../core/provider-ids';
import {
  countryOf,
  formatReportText,
  summarize,
  worstVerdict,
  type ProviderResult,
} from '../core/report-text';
import type { LookupOutcome } from '../core/result';
import type { SavedEntry } from '../core/saved-list';
import { DEFAULT_SETTINGS, type Appearance } from '../core/settings';
import { h, icon, ICONS } from './dom';
import { ensureFlagFont } from './flags';
import { clampToViewport, placeCard, type Point, type Rect } from './position';
import {
  renderChoices,
  renderIndicatorHeader,
  renderMenu,
  renderNotice,
  renderSection,
  renderTitleHeader,
  type MenuItem,
  type SectionActions,
  type SectionState,
} from './render';
import { CARD_CSS } from './styles';

export interface CardClient {
  /** Must resolve (never reject) with an outcome. */
  lookup(provider: ProviderId, indicator: Indicator, force: boolean): Promise<LookupOutcome>;
  openOptions(): void;
  /** Adds (or refreshes) an entry in the saved list. */
  save(entry: SavedEntry): Promise<void>;
  openList(): void;
}

export type CardPlacement =
  | { readonly mode: 'floating'; readonly anchor: Rect }
  /** `fill`: take the container's full width without card chrome (the result window). */
  | { readonly mode: 'inline'; readonly container: HTMLElement; readonly fill?: boolean };

export interface CardOptions {
  readonly client: CardClient;
  readonly placement: CardPlacement;
  readonly appearance?: Appearance;
  readonly onClose?: () => void;
  readonly now?: () => number;
}

export const HOST_TAG = 'x-4ntl-card';
const COPY_FEEDBACK_MS = 1200;
const LOADING: SectionState = { status: 'loading' };

/** Whether a user-chosen background needs dark text (WCAG relative luminance). */
export function isLightColor(hex: string): boolean {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18;
}

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
  /** Where the user dragged the card; from then on it stays there. */
  #dragged: Point | undefined;
  /** Finished lookups of the current view, for "Copy full report" and the saved list. */
  #results = new Map<ProviderId, LookupOutcome>();
  #menu: { readonly element: HTMLElement; readonly button: HTMLElement } | undefined;
  /** Set once the current view is saved: keeps its entry up to date as results arrive. */
  #resave: (() => void) | undefined;

  constructor(options: CardOptions) {
    this.#options = options;
    const { placement } = options;
    const fill = placement.mode === 'inline' && placement.fill !== false;
    const { theme, accent, background } = options.appearance ?? DEFAULT_SETTINGS.appearance;
    ensureFlagFont();
    this.#host = document.createElement(HOST_TAG);
    // Closed: page scripts can't reach into the card. Open in e2e builds so tests can.
    const root = this.#host.attachShadow({ mode: __E2E__ ? 'open' : 'closed' });
    this.#card = h('div', {
      class: fill ? 'card inline' : 'card',
      attrs: { role: 'dialog', 'aria-label': '4NTL lookup', 'data-theme': theme },
    });
    if (accent) this.#card.style.setProperty('--accent', accent);
    if (background) {
      this.#card.style.setProperty('--bg', background);
      this.#card.dataset.surface = isLightColor(background) ? 'light' : 'dark';
    }
    root.append(h('style', {}, CARD_CSS), this.#card);

    this.#listen(window, 'keydown', (event) => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      event.stopPropagation();
      if (!this.#closeMenu()) this.close();
    });
    // A click anywhere else in the card closes the copy menu.
    this.#card.addEventListener('pointerdown', (event) => {
      const menu = this.#menu;
      const path = event.composedPath();
      if (menu && !path.includes(menu.element) && !path.includes(menu.button)) this.#closeMenu();
    });

    if (options.placement.mode === 'floating') {
      const style = this.#host.style;
      for (const [name, value] of Object.entries({
        // First reset everything the page's stylesheets could do to us
        // (`* { opacity: 0 !important }`, transforms, pointer-events…)…
        all: 'initial',
        // …then set just what we need.
        position: 'fixed',
        'z-index': '2147483647',
        inset: 'auto',
        left: '0',
        top: '0',
        margin: '0',
        display: 'block',
        visibility: 'hidden',
      })) {
        // !important inline via CSSOM: beats page stylesheets, and isn't subject to page CSP.
        style.setProperty(name, value, 'important');
      }
      document.documentElement.append(this.#host);
      // The top layer sits above everything (even max z-index overlays) and is
      // positioned against the viewport even when the page transforms <html>.
      if (typeof this.#host.showPopover === 'function') {
        this.#host.popover = 'manual';
        try {
          this.#host.showPopover();
        } catch {
          // Already shown or not supported: plain fixed positioning still works.
        }
      }
      this.#listen(document, 'pointerdown', (event) => {
        if (!event.composedPath().includes(this.#host)) this.close();
      });
      this.#enableDragging();
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
    this.#menu = undefined;
    this.#resave = undefined;
    this.#results = new Map();

    switch (view.kind) {
      case 'lookup': {
        const { indicator, providers } = view;
        const results = (): ProviderResult[] =>
          providers.map((p) => ({ name: p.name, outcome: this.#results.get(p.id) }));
        const sections = providers.map((provider) =>
          this.#mountSection(viewId, provider, indicator),
        );
        this.#card.replaceChildren(
          renderIndicatorHeader(indicator, {
            save: (event) => void this.#save(indicator, results, event),
            copy: (event) => {
              const button = event.currentTarget as HTMLElement;
              this.#toggleMenu(button, [
                { label: 'Copy indicator', select: () => void this.#copy(indicator.value, button) },
                {
                  label: 'Copy full report',
                  select: () =>
                    void this.#copy(formatReportText(indicator, results(), this.#now()), button),
                },
              ]);
            },
            close,
          }),
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

  #now(): number {
    return (this.#options.now ?? Date.now)();
  }

  /** Renders one provider's section and keeps it updated through loading → result → retry. */
  #mountSection(viewId: number, provider: ProviderInfo, indicator: Indicator): HTMLElement {
    const actions: SectionActions = {
      retry: () => {
        run(true);
      },
      openOptions: () => {
        this.#options.client.openOptions();
      },
    };
    let element = renderSection(provider, LOADING, actions, this.#now());
    const swap = (next: HTMLElement) => {
      element.replaceWith(next);
      element = next;
      this.#place();
    };
    const run = (force: boolean) => {
      if (force) {
        this.#results.delete(provider.id);
        swap(renderSection(provider, LOADING, actions, this.#now()));
      }
      void this.#options.client
        .lookup(provider.id, indicator, force)
        .catch((): LookupOutcome => ({
          ok: false,
          error: { code: 'internal', message: 'Lookup failed.' },
        }))
        .then((outcome) => {
          if (this.#closed || viewId !== this.#viewId) return;
          this.#results.set(provider.id, outcome);
          swap(renderSection(provider, { status: 'done', outcome }, actions, this.#now()));
          this.#resave?.();
        });
    };
    run(false);
    return element;
  }

  #toggleMenu(button: HTMLElement, items: readonly MenuItem[]): void {
    if (this.#closeMenu()) return;
    const element = renderMenu(
      items.map(({ label, select }) => ({
        label,
        select: () => {
          this.#closeMenu();
          select();
        },
      })),
    );
    this.#menu = { element, button };
    button.setAttribute('aria-expanded', 'true');
    this.#card.append(element);
    element.querySelector('button')?.focus();
  }

  /** Returns whether a menu was open. */
  #closeMenu(): boolean {
    if (!this.#menu) return false;
    this.#menu.element.remove();
    this.#menu.button.setAttribute('aria-expanded', 'false');
    this.#menu = undefined;
    return true;
  }

  /** The first click saves; once saved, the button opens the list. */
  async #save(
    indicator: Indicator,
    results: () => ProviderResult[],
    event: MouseEvent,
  ): Promise<void> {
    const button = event.currentTarget as HTMLElement;
    const { client } = this.#options;
    if (this.#resave) {
      client.openList();
      return;
    }
    const savedAt = this.#now();
    const entry = (): SavedEntry => {
      const current = results();
      const verdict = worstVerdict(current);
      return {
        value: indicator.value,
        type: indicator.type,
        ...(verdict ? { verdict } : {}),
        summary: summarize(current),
        country: countryOf(current),
        savedAt,
      };
    };
    const viewId = this.#viewId;
    try {
      await client.save(entry());
    } catch {
      button.title = 'Could not save. Try again.';
      return;
    }
    if (this.#closed || viewId !== this.#viewId) return;
    this.#resave = () => {
      client.save(entry()).catch(() => undefined);
    };
    button.classList.add('on');
    button.title = 'Saved · open the list';
    button.setAttribute('aria-label', button.title);
  }

  async #copy(value: string, button: HTMLElement): Promise<void> {
    const ok = await copyText(value, this.#card);
    if (this.#closed) return;
    button.replaceChildren(icon(ok ? ICONS.check : ICONS.copy));
    const label = (text: string) => {
      button.title = text;
      button.setAttribute('aria-label', text);
    };
    label(ok ? 'Copied' : 'Copy failed');
    const timer = setTimeout(() => {
      button.replaceChildren(icon(ICONS.copy));
      label('Copy…');
    }, COPY_FEEDBACK_MS);
    this.#cleanup.push(() => {
      clearTimeout(timer);
    });
  }

  #place(): void {
    const { placement } = this.#options;
    if (placement.mode !== 'floating' || this.#closed) return;
    const { width, height } = this.#card.getBoundingClientRect();
    const size = { width, height };
    const viewport = {
      width: document.documentElement.clientWidth || window.innerWidth,
      height: window.innerHeight,
    };
    // Once dragged, the card stays put (only kept inside the window as it grows).
    this.#moveTo(
      this.#dragged
        ? clampToViewport(this.#dragged, size, viewport)
        : placeCard(placement.anchor, size, viewport),
    );
  }

  #moveTo({ left, top }: Point): void {
    this.#host.style.setProperty('left', `${Math.round(left)}px`, 'important');
    this.#host.style.setProperty('top', `${Math.round(top)}px`, 'important');
    this.#host.style.setProperty('visibility', 'visible', 'important');
  }

  /** Drag the card by its header (not by its buttons) anywhere in the window. */
  #enableDragging(): void {
    let grab: { dx: number; dy: number; pointerId: number } | undefined;
    const viewport = () => ({
      width: document.documentElement.clientWidth || window.innerWidth,
      height: window.innerHeight,
    });

    this.#card.addEventListener('pointerdown', (event) => {
      const target = event.target as Element | null;
      if (event.button !== 0 || !target?.closest('.header') || target.closest('button, a')) return;
      event.preventDefault(); // no text selection while dragging
      const box = this.#host.getBoundingClientRect();
      grab = {
        dx: event.clientX - box.left,
        dy: event.clientY - box.top,
        pointerId: event.pointerId,
      };
      this.#card.setPointerCapture(event.pointerId);
      this.#card.classList.add('dragging');
    });
    this.#card.addEventListener('pointermove', (event) => {
      if (grab?.pointerId !== event.pointerId) return;
      const { width, height } = this.#card.getBoundingClientRect();
      this.#dragged = clampToViewport(
        { left: event.clientX - grab.dx, top: event.clientY - grab.dy },
        { width, height },
        viewport(),
      );
      this.#moveTo(this.#dragged);
    });
    const release = (event: PointerEvent) => {
      if (grab?.pointerId !== event.pointerId) return;
      grab = undefined;
      this.#card.classList.remove('dragging');
    };
    this.#card.addEventListener('pointerup', release);
    this.#card.addEventListener('pointercancel', release);
  }

  #listen(target: EventTarget, type: string, listener: (event: Event) => void): void {
    target.addEventListener(type, listener, true);
    this.#cleanup.push(() => {
      target.removeEventListener(type, listener, true);
    });
  }
}
