import { describe, expect, it, vi } from 'vitest';
import type { CardView } from '../core/messages';
import { checkCaptured, checkLink, directLink, indicatorsFromUrls, type LinkDeps } from './links';
import { CAPTURE_NOTICE, NO_LINK_NOTICE } from './view';

const PAGE = 'https://app.example.org/inbox';
const TARGET = { tabId: 3, frameId: 0 };

function deps(inspected: string[] = [], canCapture = true) {
  const shown: CardView[] = [];
  const value: LinkDeps = {
    inspect: vi.fn(() => Promise.resolve(inspected)),
    capture: vi.fn(() => Promise.resolve(canCapture)),
    present: vi.fn((view: CardView) => {
      shown.push(view);
      return Promise.resolve();
    }),
  };
  return { value, shown };
}

describe('directLink', () => {
  it.each([
    ['https://evil.com/x', 'https://evil.com/x'],
    ['http://evil.com', 'http://evil.com/'],
    ['https://app.example.org/other#tab', 'https://app.example.org/other#tab'],
  ])('trusts real link %s', (link, expected) => {
    expect(directLink(link, PAGE)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'javascript:void(0)',
    'mailto:a@b.c',
    'https://app.example.org/inbox#',
    'https://app.example.org/inbox#section',
    'not a url',
  ])('ignores %j', (link) => {
    expect(directLink(link, PAGE)).toBeUndefined();
  });
});

describe('indicatorsFromUrls', () => {
  it('parses, unwraps and de-duplicates', () => {
    const wrapped = `https://eur01.safelinks.protection.outlook.com/?url=${encodeURIComponent('https://evil.com/')}`;
    expect(indicatorsFromUrls(['https://evil.com/', wrapped, 'nonsense'])).toEqual([
      { type: 'url', value: 'https://evil.com/' },
    ]);
  });
});

describe('checkLink', () => {
  it('uses a real link address without asking the page', async () => {
    const d = deps();
    const view = await checkLink(
      { target: TARGET, linkUrl: 'https://evil.com/a', pageUrl: PAGE },
      d.value,
    );
    expect(view).toMatchObject({ kind: 'lookup', indicator: { value: 'https://evil.com/a' } });
    expect(d.value.inspect).not.toHaveBeenCalled();
    expect(d.value.present).toHaveBeenCalledWith(view, TARGET);
  });

  it('asks the page what a fake link or button leads to', async () => {
    const d = deps(['https://evil.com/from-handler']);
    const view = await checkLink({ target: TARGET, linkUrl: `${PAGE}#`, pageUrl: PAGE }, d.value);
    expect(d.value.inspect).toHaveBeenCalledWith(TARGET);
    expect(view).toMatchObject({
      kind: 'lookup',
      indicator: { value: 'https://evil.com/from-handler' },
    });
  });

  it('offers a choice when an element leads to several places', async () => {
    const d = deps(['https://a.com/', 'https://b.com/']);
    expect(await checkLink({ target: TARGET, pageUrl: PAGE }, d.value)).toMatchObject({
      kind: 'choose',
    });
  });

  it('arms click capture when nothing is readable', async () => {
    const d = deps([]);
    expect(await checkLink({ target: TARGET, pageUrl: PAGE }, d.value)).toBe(CAPTURE_NOTICE);
    expect(d.value.capture).toHaveBeenCalledWith(TARGET);
  });

  it('says there is no link when the page cannot be scripted or there is no tab', async () => {
    expect(await checkLink({ target: TARGET, pageUrl: PAGE }, deps([], false).value)).toBe(
      NO_LINK_NOTICE,
    );
    expect(await checkLink({ target: undefined }, deps().value)).toBe(NO_LINK_NOTICE);
  });
});

describe('checkCaptured', () => {
  it('looks up the caught destination', async () => {
    const present = vi.fn(() => Promise.resolve());
    const view = await checkCaptured('https://evil.com/caught', TARGET, present);
    expect(view).toMatchObject({ kind: 'lookup', indicator: { value: 'https://evil.com/caught' } });
    expect(present).toHaveBeenCalledWith(view, TARGET);
  });

  it('explains when the caught navigation is not a web address', async () => {
    const present = vi.fn(() => Promise.resolve());
    await checkCaptured('blob:https://x/1', TARGET, present);
    expect(present).toHaveBeenCalledWith(NO_LINK_NOTICE, TARGET);
  });
});
