// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, NOW } from '../../tests/helpers';
import type { Indicator } from '../core/indicator';
import type { CardView } from '../core/messages';
import type { LookupOutcome, Report } from '../core/result';
import type { SavedEntry } from '../core/saved-list';
import type { Appearance } from '../core/settings';
import { HOST_TAG, isLightColor, ResultCard, type CardClient } from './card';
import { pointRect } from './position';

const IP: Indicator = { type: 'ipv4', value: '185.220.101.4' };
const PROVIDERS = [
  { id: 'abuseipdb', name: 'AbuseIPDB' },
  { id: 'virustotal', name: 'VirusTotal' },
] as const;
const LOOKUP_VIEW: CardView = { kind: 'lookup', indicator: IP, providers: PROVIDERS };

const REPORT: Report = {
  verdict: 'malicious',
  headline: '100%',
  caption: 'abuse confidence',
  score: 1,
  tags: ['Tor exit node'],
  facts: [{ label: 'ISP', value: 'Example ISP' }],
  reportUrl: 'https://www.abuseipdb.com/check/185.220.101.4',
};

let root: ShadowRoot | undefined;

beforeEach(() => {
  // The card's shadow root is closed; capture it so tests can look inside.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound with .call below
  const attach = HTMLElement.prototype.attachShadow;
  vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function (
    this: HTMLElement,
    init,
  ) {
    root = attach.call(this, init);
    return root;
  });
});

afterEach(() => {
  document.querySelectorAll(HOST_TAG).forEach((host) => {
    host.remove();
  });
  document.body.replaceChildren();
});

function deferred() {
  let resolve: (outcome: LookupOutcome) => void = () => undefined;
  const promise = new Promise<LookupOutcome>((r) => (resolve = r));
  return { promise, resolve };
}

function client(
  lookup: CardClient['lookup'] = () =>
    Promise.resolve({ ok: true, report: REPORT, fetchedAt: NOW, cached: false }),
) {
  return {
    lookup: vi.fn(lookup),
    openOptions: vi.fn(),
    save: vi.fn<(entry: SavedEntry) => Promise<void>>(() => Promise.resolve()),
    openList: vi.fn(),
    unlock: vi.fn(),
    restore: vi.fn(),
  };
}

function mount(c = client(), options: { inline?: boolean; onClose?: () => void } = {}) {
  const card = new ResultCard({
    client: c,
    placement: options.inline
      ? { mode: 'inline', container: document.body }
      : { mode: 'floating', anchor: pointRect(40, 50) },
    now: () => NOW,
    ...(options.onClose ? { onClose: options.onClose } : {}),
  });
  const $ = (selector: string) => root?.querySelector<HTMLElement>(selector) ?? null;
  const $$ = (selector: string) => [...(root?.querySelectorAll<HTMLElement>(selector) ?? [])];
  return { card, client: c, $, $$ };
}

describe('ResultCard – lookup view', () => {
  it('shows the indicator and a loading section per provider, then the results', async () => {
    const pending = [deferred(), deferred()];
    const {
      card,
      client: c,
      $,
      $$,
    } = mount(
      client(
        () => pending[c.lookup.mock.calls.length - 1]?.promise ?? new Promise(() => undefined),
      ),
    );
    card.show(LOOKUP_VIEW);

    expect($('.ioc')?.textContent).toBe('185.220.101.4');
    expect($('.type')?.textContent).toBe('IPv4');
    expect($$('section[aria-busy="true"]')).toHaveLength(2);
    expect(c.lookup.mock.calls).toEqual([
      ['abuseipdb', IP, false],
      ['virustotal', IP, false],
    ]);

    pending[0]?.resolve({ ok: true, report: REPORT, fetchedAt: NOW - 120_000, cached: true });
    await flush();
    const abuse = $('[data-provider="abuseipdb"]');
    expect(abuse?.dataset.verdict).toBe('malicious');
    expect(abuse?.querySelector('.pill')?.textContent).toBe('Malicious');
    expect(abuse?.querySelector('.headline-value')?.textContent).toBe('100%');
    expect(abuse?.querySelector('.tag')?.textContent).toBe('Tor exit node');
    expect(abuse?.querySelector('dt')?.textContent).toBe('ISP');
    expect(abuse?.querySelector('.meta')?.textContent).toBe('Cached · 2 minutes ago');
    expect(abuse?.querySelector<HTMLElement>('.gauge-fill')?.style.width).toBe('100%');
    const link = abuse?.querySelector('a');
    expect(link?.getAttribute('href')).toBe(REPORT.reportUrl);
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect($('[data-provider="virustotal"]')?.getAttribute('aria-busy')).toBe('true');
  });

  it('renders hostile API strings as inert text', async () => {
    const hostile: Report = {
      ...REPORT,
      headline: '<b>1</b>',
      tags: ['<script>alert(1)</script>'],
      facts: [{ label: '<i>x</i>', value: '<img src=x onerror=alert(1)>' }],
      reportUrl: 'javascript:alert(1)',
    };
    const { card, $, $$ } = mount(
      client(() => Promise.resolve({ ok: true, report: hostile, fetchedAt: NOW, cached: false })),
    );
    card.show(LOOKUP_VIEW);
    await flush();
    expect($$('img, script, b, i')).toHaveLength(0);
    expect($('dd')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect($$('a:not(.support)')).toHaveLength(0); // non-https links are dropped
  });

  it('offers Retry for transient errors and re-runs the lookup bypassing the cache', async () => {
    let calls = 0;
    const c = client(() =>
      Promise.resolve(
        ++calls === 1
          ? {
              ok: false,
              error: {
                code: 'rate_limited',
                message: 'VirusTotal quota reached.',
                reportUrl: 'https://vt/x',
              },
            }
          : { ok: true, report: { ...REPORT, verdict: 'clean' }, fetchedAt: NOW, cached: false },
      ),
    );
    const { card, $ } = mount(c);
    card.show({ kind: 'lookup', indicator: IP, providers: [PROVIDERS[1]] });
    await flush();
    const section = $('[data-provider="virustotal"]');
    expect(section?.dataset.error).toBe('rate_limited');
    expect(section?.querySelector('.pill')?.textContent).toBe('Rate limited');
    expect(section?.querySelector('.message')?.textContent).toBe('VirusTotal quota reached.');
    expect(section?.querySelector('a')?.textContent).toBe('Open VirusTotal ↗');

    section?.querySelector<HTMLButtonElement>('.btn')?.click();
    expect($('[data-provider="virustotal"]')?.getAttribute('aria-busy')).toBe('true');
    expect(c.lookup).toHaveBeenLastCalledWith('virustotal', IP, true);
    await flush();
    expect($('[data-provider="virustotal"]')?.dataset.verdict).toBe('clean');
  });

  it('sends the user to settings for key problems', async () => {
    const c = client(() =>
      Promise.resolve({ ok: false, error: { code: 'no_api_key', message: 'Add your key.' } }),
    );
    const { card, $ } = mount(c);
    card.show(LOOKUP_VIEW);
    await flush();
    const button = $('.btn');
    expect(button?.textContent).toBe('Open settings');
    button?.click();
    expect(c.openOptions).toHaveBeenCalled();
  });

  it('shows no action for problems a retry cannot fix', async () => {
    const c = client(() =>
      Promise.resolve({ ok: false, error: { code: 'unsupported', message: 'IPs only.' } }),
    );
    const { card, $ } = mount(c);
    card.show(LOOKUP_VIEW);
    await flush();
    expect($('.foot')).toBeNull();
  });

  it('survives a client that rejects', async () => {
    const { card, $ } = mount(client(() => Promise.reject(new Error('port closed'))));
    card.show(LOOKUP_VIEW);
    await flush();
    expect($('[data-provider="abuseipdb"]')?.dataset.error).toBe('internal');
  });

  it('drops responses that arrive after the view changed or the card closed', async () => {
    const pending = deferred();
    const { card, $ } = mount(client(() => pending.promise));
    card.show(LOOKUP_VIEW);
    card.show({ kind: 'notice', title: 'Other', text: 'view' });
    pending.resolve({ ok: true, report: REPORT, fetchedAt: NOW, cached: false });
    await flush();
    expect($('[data-provider]')).toBeNull();
    expect($('.title')?.textContent).toBe('Other');

    card.close();
    card.show(LOOKUP_VIEW); // no-op once closed
    expect(card.closed).toBe(true);
  });
});

describe('ResultCard – other views', () => {
  it('lets the user pick one of several indicators', async () => {
    const { card, client: c, $, $$ } = mount();
    card.show({
      kind: 'choose',
      truncated: false,
      choices: [
        { indicator: { type: 'ipv4', value: '1.1.1.1' }, providers: [PROVIDERS[0]] },
        { indicator: { type: 'domain', value: 'evil.com' }, providers: [PROVIDERS[1]] },
      ],
    });
    expect($('.notice-text')?.textContent).toBe('2 indicators selected. Pick one:');
    const choices = $$('.choice');
    expect(choices.map((b) => b.querySelector('.ioc')?.textContent)).toEqual([
      '1.1.1.1',
      'evil.com',
    ]);
    choices[1]?.click();
    await flush();
    expect($('.ioc')?.textContent).toBe('evil.com');
    expect(c.lookup).toHaveBeenCalledWith(
      'virustotal',
      { type: 'domain', value: 'evil.com' },
      false,
    );
  });

  it('mentions truncation', () => {
    const { card, $ } = mount();
    card.show({ kind: 'choose', truncated: true, choices: [{ indicator: IP, providers: [] }] });
    expect($('.notice-text')?.textContent).toContain('first 1');
  });

  it('shows notices', () => {
    const { card, $ } = mount();
    card.show({ kind: 'notice', title: 'No indicator found', text: 'Select an IP…' });
    expect($('.title')?.textContent).toBe('No indicator found');
    expect($('.notice-text')?.textContent).toBe('Select an IP…');
  });
});

describe('ResultCard – lifecycle', () => {
  it('floats above the page, positioned once rendered', () => {
    const { card } = mount();
    card.show(LOOKUP_VIEW);
    const host = document.querySelector<HTMLElement>(HOST_TAG);
    expect(host?.parentElement).toBe(document.documentElement);
    expect(host?.style.getPropertyValue('position')).toBe('fixed');
    expect(host?.style.getPropertyPriority('position')).toBe('important');
    expect(host?.style.getPropertyValue('visibility')).toBe('visible');
    expect(host?.style.getPropertyValue('top')).toMatch(/px$/);
  });

  it('closes on Escape and cleans up', () => {
    const onClose = vi.fn();
    const { card } = mount(client(), { onClose });
    card.show(LOOKUP_VIEW);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(card.closed).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card.closed).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector(HOST_TAG)).toBeNull();
    card.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a click outside, but not inside', () => {
    const { card, $ } = mount();
    card.show(LOOKUP_VIEW);
    $('.ioc')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(card.closed).toBe(false);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(card.closed).toBe(true);
  });

  it('closes from its close button', () => {
    const { card, $ } = mount();
    card.show(LOOKUP_VIEW);
    $('[aria-label="Close"]')?.click();
    expect(card.closed).toBe(true);
  });

  it('renders inline into a container without outside-click dismissal', () => {
    const { card } = mount(client(), { inline: true });
    card.show(LOOKUP_VIEW);
    expect(document.body.querySelector(HOST_TAG)).not.toBeNull();
    expect(root?.querySelector('.card')?.classList.contains('inline')).toBe(true);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    expect(card.closed).toBe(false);
  });

  const pick = ($$: (s: string) => HTMLElement[], label: string) =>
    $$('.menu-item').find((item) => item.textContent === label);

  it('copies the indicator from the copy menu and confirms', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.useFakeTimers();
    try {
      const { card, $, $$ } = mount();
      card.show(LOOKUP_VIEW);
      const button = $('[aria-label="Copy…"]');
      button?.click();
      expect(button?.getAttribute('aria-expanded')).toBe('true');
      pick($$, 'Copy indicator')?.click();
      expect($('.menu')).toBeNull();
      await vi.waitFor(() => {
        expect(button?.title).toBe('Copied');
      });
      expect(writeText).toHaveBeenCalledWith('185.220.101.4');
      vi.advanceTimersByTime(1500);
      expect(button?.title).toBe('Copy…');
    } finally {
      vi.useRealTimers();
    }
  });

  it('copies the whole report as text', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { card, $, $$ } = mount();
    card.show(LOOKUP_VIEW);
    await flush();
    $('[aria-label="Copy…"]')?.click();
    pick($$, 'Copy full report')?.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    const text = writeText.mock.calls[0]?.[0] ?? '';
    expect(text).toContain('185.220.101.4 (IPv4)');
    expect(text).toContain('AbuseIPDB: Malicious, 100% abuse confidence');
    expect(text).toContain('  ISP: Example ISP');
    expect(text).toContain('https://www.abuseipdb.com/check/185.220.101.4');
  });

  it('closes the copy menu on Escape before closing the card', () => {
    const { card, $ } = mount();
    card.show(LOOKUP_VIEW);
    $('[aria-label="Copy…"]')?.click();
    expect($('.menu')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect($('.menu')).toBeNull();
    expect(card.closed).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(card.closed).toBe(true);
  });

  it('saves to the list, keeps the entry current, then opens the list', async () => {
    const pending = deferred();
    const c = client(() => pending.promise);
    const { card, $ } = mount(c);
    card.show({ ...LOOKUP_VIEW, providers: [PROVIDERS[0]] });
    const save = $('[aria-label="Save to list"]');
    save?.click();
    await flush();
    expect(c.save).toHaveBeenCalledWith({
      value: '185.220.101.4',
      type: 'ipv4',
      summary: '',
      country: '',
      savedAt: NOW,
    });
    expect(save?.classList.contains('on')).toBe(true);

    pending.resolve({ ok: true, report: REPORT, fetchedAt: NOW, cached: false });
    await flush();
    expect(c.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ verdict: 'malicious', summary: 'AbuseIPDB: Malicious 100%' }),
    );

    save?.click();
    expect(c.openList).toHaveBeenCalled();
  });

  it('every lookup card has a small support link, in both editions', () => {
    const { card, $ } = mount();
    card.show(LOOKUP_VIEW);
    const support = $('a.support');
    expect(support?.textContent).toBe('♥ Support 4NTL');
    expect(support?.getAttribute('href')).toBe('https://github.com/sponsors/boode-hub');
    expect(support?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('shows the store banner under the results, with Unlock', () => {
    const c = client();
    const { card, $ } = mount(c);
    card.show({ ...LOOKUP_VIEW, banner: 'Trial: 3 days left, then $2 once for life.' });
    const banner = $('.banner');
    expect(banner?.textContent).toContain('3 days left');
    banner?.querySelector('button')?.click();
    expect(c.unlock).toHaveBeenCalled();
  });

  it('keeps the banner when picking from several indicators', () => {
    const { card, $, $$ } = mount();
    card.show({
      kind: 'choose',
      truncated: false,
      banner: 'Trial: 2 days left, then $2 once for life.',
      choices: [{ indicator: IP, providers: PROVIDERS }],
    });
    expect($('.banner')).not.toBeNull();
    $$('.choice')[0]?.click();
    expect($('.ioc')?.textContent).toBe(IP.value);
    expect($('.banner')).not.toBeNull();
  });

  it('shows the unlock offer instead of results once locked', () => {
    const c = client();
    const { card, $, $$ } = mount(c);
    card.show({ kind: 'locked', text: 'Unlock 4NTL for life for $2.' });
    expect($('.title')?.textContent).toBe('Unlock 4NTL');
    expect($$('[data-provider]')).toHaveLength(0);
    expect(c.lookup).not.toHaveBeenCalled();
    $$('button')
      .find((b) => b.textContent === 'Unlock for $2')
      ?.click();
    $$('button')
      .find((b) => b.textContent === 'Restore purchase')
      ?.click();
    expect(c.unlock).toHaveBeenCalled();
    expect(c.restore).toHaveBeenCalled();
    expect($('a.link')?.getAttribute('href')).toBe(
      'https://github.com/boode-hub/4NTL/releases/latest',
    );
  });

  it('stays unsaved when saving fails, and can try again', async () => {
    const c = client();
    c.save.mockRejectedValueOnce(new Error('quota'));
    const { card, $ } = mount(c);
    card.show(LOOKUP_VIEW);
    const save = $('[aria-label="Save to list"]');
    save?.click();
    await flush();
    expect(save?.classList.contains('on')).toBe(false);
    expect(save?.title).toBe('Could not save. Try again.');
    save?.click();
    await flush();
    expect(save?.classList.contains('on')).toBe(true);
    expect(c.save).toHaveBeenCalledTimes(2);
    expect(c.openList).not.toHaveBeenCalled();
  });

  it('a new lookup in the same card starts unsaved', async () => {
    const c = client();
    const { card, $ } = mount(c);
    card.show(LOOKUP_VIEW);
    $('[aria-label="Save to list"]')?.click();
    await flush();
    card.show({ ...LOOKUP_VIEW, indicator: { type: 'ipv4', value: '8.8.4.4' } });
    const save = $('[aria-label="Save to list"]');
    expect(save?.classList.contains('on')).toBe(false);
    save?.click();
    await flush();
    expect(c.save).toHaveBeenLastCalledWith(expect.objectContaining({ value: '8.8.4.4' }));
    expect(c.openList).not.toHaveBeenCalled();
  });

  it('closing the card while a save is in flight is harmless', async () => {
    let finish: () => void = () => undefined;
    const c = client();
    c.save.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    const { card, $ } = mount(c);
    card.show(LOOKUP_VIEW);
    $('[aria-label="Save to list"]')?.click();
    card.close();
    finish();
    await flush();
    expect(card.closed).toBe(true);
  });

  it('a retry drops the old result from the copied report until the new one arrives', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const outcomes: LookupOutcome[] = [
      { ok: false, error: { code: 'timeout', message: 'Timed out.' } },
    ];
    const pending = deferred();
    const c = client(() => {
      const next = outcomes.shift();
      return next ? Promise.resolve(next) : pending.promise;
    });
    const { card, $, $$ } = mount(c);
    card.show({ ...LOOKUP_VIEW, providers: [PROVIDERS[0]] });
    await flush();
    $$('button')
      .find((b) => b.textContent === 'Retry')
      ?.click();
    $('[aria-label="Copy…"]')?.click();
    pick($$, 'Copy full report')?.click();
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalled();
    });
    expect(writeText.mock.calls[0]?.[0]).toContain('AbuseIPDB: still checking');
    expect(writeText.mock.calls[0]?.[0]).not.toContain('Timed out');
  });

  it('falls back to execCommand when the Clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    const { card, $ } = mount();
    card.show(LOOKUP_VIEW);
    const button = $('[aria-label="Copy…"]');
    button?.click();
    root?.querySelector<HTMLElement>('.menu-item')?.click();
    await vi.waitFor(() => {
      expect(button?.title).toBe('Copied');
    });
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(root?.querySelector('textarea')).toBeNull();
  });
});

describe('ResultCard – appearance', () => {
  const themed = (appearance?: Appearance, fill?: boolean) => {
    const card = new ResultCard({
      client: client(),
      placement:
        fill === undefined
          ? { mode: 'floating', anchor: pointRect(0, 0) }
          : { mode: 'inline', container: document.body, fill },
      ...(appearance ? { appearance } : {}),
    });
    card.show(LOOKUP_VIEW);
    return root?.querySelector<HTMLElement>('.card');
  };

  it('uses the automatic theme with its own accent by default', () => {
    const card = themed();
    expect(card?.dataset.theme).toBe('auto');
    expect(card?.style.getPropertyValue('--accent')).toBe('');
  });

  it.each([
    ['#f5f0e6', 'light'],
    ['#1a1b2c', 'dark'],
  ])('uses background %s with %s text', (background, surface) => {
    const card = themed({ theme: 'dark', accent: '', background });
    expect(card?.style.getPropertyValue('--bg')).toBe(background);
    expect(card?.dataset.surface).toBe(surface);
  });

  it.each([
    ['#ffffff', true],
    ['#f5f0e6', true],
    ['#9ca3af', true],
    ['#6b7280', false],
    ['#ff2d3d', true],
    ['#b91c1c', false],
    ['#000000', false],
  ])('%s needs dark text: %s', (color, light) => {
    expect(isLightColor(color)).toBe(light);
  });

  it('keeps the theme background by default', () => {
    const card = themed({ theme: 'dark', accent: '', background: '' });
    expect(card?.style.getPropertyValue('--bg')).toBe('');
    expect(card?.dataset.surface).toBeUndefined();
  });

  it('applies the chosen theme and accent', () => {
    const card = themed({ theme: 'sharingan', accent: '#8b5cf6', background: '' });
    expect(card?.dataset.theme).toBe('sharingan');
    expect(card?.style.getPropertyValue('--accent')).toBe('#8b5cf6');
  });

  it('draws the Sharingan in the header (CSS shows it only in that theme)', () => {
    const card = themed({ theme: 'sharingan', accent: '', background: '' });
    const eye = card?.querySelector('.header .eye');
    expect(eye?.getAttribute('aria-hidden')).toBe('true');
    expect(eye?.querySelectorAll('.tomoe')).toHaveLength(3);
  });

  it('can render inline without filling the container (settings preview)', () => {
    expect(themed(undefined, false)?.classList.contains('inline')).toBe(false);
    document.querySelectorAll(HOST_TAG).forEach((host) => {
      host.remove();
    });
    expect(themed(undefined, true)?.classList.contains('inline')).toBe(true);
  });
});

describe('ResultCard – dragging', () => {
  it('moves with the pointer when dragged by the header, and stays there', async () => {
    const { card, $ } = mount();
    card.show(LOOKUP_VIEW);
    const host = document.querySelector<HTMLElement>(HOST_TAG);
    const cardEl = $('.card');
    const header = $('.header .ioc');
    if (!host || !cardEl || !header) throw new Error('card not rendered');
    cardEl.setPointerCapture = () => undefined;

    header.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        composed: true,
        clientX: 50,
        clientY: 60,
        button: 0,
        pointerId: 1,
      }),
    );
    expect(cardEl.classList.contains('dragging')).toBe(true);
    cardEl.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: 150, clientY: 200, pointerId: 1 }),
    );
    cardEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 }));
    expect(cardEl.classList.contains('dragging')).toBe(false);
    const dragged = [host.style.getPropertyValue('left'), host.style.getPropertyValue('top')];
    expect(dragged).not.toEqual(['0px', '0px']);

    // New results arriving don't snap it back to the pointer.
    await flush();
    expect([host.style.getPropertyValue('left'), host.style.getPropertyValue('top')]).toEqual(
      dragged,
    );
  });

  it('does not start a drag from header buttons', () => {
    const { card, $ } = mount();
    card.show(LOOKUP_VIEW);
    const button = $('[aria-label="Copy…"]');
    button?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, composed: true, button: 0, pointerId: 2 }),
    );
    expect($('.card')?.classList.contains('dragging')).toBe(false);
  });
});
