// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deepestHovered, findLinkTargets, findTargetsAt, textOf } from './link-target';

const PAGE = 'https://intranet-app.com/inbox?id=7';

/** Builds markup with DOM APIs (no innerHTML) and returns the element with id "start". */
function mount(build: (body: HTMLElement) => void): Element {
  build(document.body);
  const start = document.getElementById('start');
  if (!start) throw new Error('no #start');
  return start;
}

function el(tag: string, attrs: Record<string, string> = {}, ...children: Node[]): HTMLElement {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  element.append(...children);
  return element;
}

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(document, 'elementsFromPoint');
});

/** Fakes what is stacked under the pointer (happy-dom has no elementsFromPoint). */
function stack(elements: Element[]): void {
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: vi.fn(() => elements),
  });
}

describe('findLinkTargets', () => {
  it('reads plain and relative links', () => {
    const start = mount((b) => {
      b.append(el('a', { id: 'start', href: '/reports/9' }));
    });
    expect(findLinkTargets(start, PAGE)).toEqual(['https://intranet-app.com/reports/9']);
  });

  it('looks past a "#" link to the URL in its click handler', () => {
    const start = mount((b) => {
      b.append(
        el('a', { id: 'start', href: '#', onclick: "window.location.href='https://evil.com/x'" }),
      );
    });
    expect(findLinkTargets(start, PAGE)).toEqual(['https://evil.com/x']);
  });

  it.each([
    ["location.assign('/go?to=1')", 'https://intranet-app.com/go?to=1'],
    ['location.replace("https://evil.com/r")', 'https://evil.com/r'],
    ["window.open('https://evil.com/popup', '_blank')", 'https://evil.com/popup'],
    ['navigateTo(`/app/item`)', 'https://intranet-app.com/app/item'],
    ['track(); go("https://evil.com/abs")', 'https://evil.com/abs'],
  ])('reads %s from javascript: links and handlers', (handler, expected) => {
    const start = mount((b) => {
      b.append(el('a', { id: 'start', href: 'javascript:void(0)', onclick: handler }));
    });
    expect(findLinkTargets(start, PAGE)).toEqual([expected]);
  });

  it.each(['data-href', 'data-url', 'data-link', 'data-redirect', 'routerlink', 'href'])(
    'reads a button/card with %s',
    (attribute) => {
      const start = mount((b) => {
        b.append(el('div', { [attribute]: '/card/42', role: 'link' }, el('span', { id: 'start' })));
      });
      expect(findLinkTargets(start, PAGE)).toEqual(['https://intranet-app.com/card/42']);
    },
  );

  it('reads any attribute holding an absolute URL, but not image sources', () => {
    const start = mount((b) => {
      b.append(
        el(
          'custom-tile',
          { 'data-analytics-target': 'https://evil.com/tile' },
          el('img', { id: 'start', src: 'https://cdn.com/a.png' }),
        ),
      );
    });
    expect(findLinkTargets(start, PAGE)).toEqual(['https://evil.com/tile']);
  });

  it('reads form submit buttons', () => {
    const start = mount((b) => {
      const form = el('form', { action: 'https://evil.com/collect' });
      form.append(
        el('button', { id: 'start', type: 'submit' }, document.createTextNode('Sign in')),
      );
      b.append(form);
    });
    expect(findLinkTargets(start, PAGE)).toEqual(['https://evil.com/collect']);
  });

  it('prefers formaction over the form action', () => {
    const start = mount((b) => {
      const form = el('form', { action: '/a' });
      form.append(el('button', { id: 'start', type: 'submit', formaction: '/b' }));
      b.append(form);
    });
    expect(findLinkTargets(start, PAGE)).toEqual(['https://intranet-app.com/b']);
  });

  it('reads SVG links', () => {
    const start = mount((b) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const a = document.createElementNS('http://www.w3.org/2000/svg', 'a');
      a.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', 'https://evil.com/svg');
      const shape = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      shape.id = 'start';
      a.append(shape);
      svg.append(a);
      b.append(svg);
    });
    expect(findLinkTargets(start, PAGE)).toEqual(['https://evil.com/svg']);
  });

  it('climbs out of shadow DOM to the host', () => {
    const host = el('fancy-button', { 'data-url': 'https://evil.com/shadow' });
    const root = host.attachShadow({ mode: 'open' });
    const inner = el('span');
    root.append(inner);
    document.body.append(host);
    expect(findLinkTargets(inner, PAGE)).toEqual(['https://evil.com/shadow']);
  });

  it('uses the nearest element that has a destination', () => {
    const start = mount((b) => {
      b.append(
        el(
          'a',
          { href: 'https://outer.com/' },
          el('div', { 'data-href': 'https://inner.com/', id: 'start' }),
        ),
      );
    });
    expect(findLinkTargets(start, PAGE)).toEqual(['https://inner.com/']);
  });

  it.each([
    ['in-page anchors', { href: '#section' }],
    ['mail and phone links', { href: 'mailto:a@b.c', 'data-url': 'tel:123' }],
    ['handlers without URLs', { onclick: 'toggleMenu()' }],
    ['plain elements', {}],
  ])('finds nothing for %s', (_name, attrs) => {
    const start = mount((b) => {
      b.append(el('button', { id: 'start', ...attrs }));
    });
    expect(findLinkTargets(start, PAGE)).toEqual([]);
  });

  it('de-duplicates and caps results', () => {
    const urls = Array.from({ length: 8 }, (_, i) => `https://evil.com/${i}`);
    const start = mount((b) => {
      b.append(
        el('div', {
          id: 'start',
          onclick: urls.map((u) => `open('${u}')`).join(';') + `;open('${urls[0] ?? ''}')`,
        }),
      );
    });
    expect(findLinkTargets(start, PAGE)).toEqual(urls.slice(0, 5));
  });
});

describe('deepestHovered', () => {
  it('is undefined when nothing is hovered', () => {
    expect(deepestHovered(document)).toBeUndefined();
  });
});

describe('findTargetsAt', () => {
  it('finds the link under a transparent overlay (the "whole card is clickable" pattern)', () => {
    const link = el('a', { href: 'https://evil.com/offer' });
    const start = mount((b) => {
      b.append(el('div', {}, link, el('div', { id: 'start', class: 'overlay' })));
    });
    // The overlay is on top; the real link is underneath it at the pointer.
    stack([start, link, document.body]);
    expect(findTargetsAt(start, { x: 10, y: 10 }, PAGE)).toEqual(['https://evil.com/offer']);
  });

  it('finds the link inside the box that was clicked (a card’s padding)', () => {
    const start = mount((b) => {
      b.append(
        el(
          'div',
          { id: 'start', class: 'card' },
          el('h3', {}, el('a', { href: '/post/42' })),
          el('p', {}, document.createTextNode('Read more about it')),
        ),
      );
    });
    expect(findTargetsAt(start, undefined, PAGE)).toEqual(['https://intranet-app.com/post/42']);
  });

  it('does not guess inside a whole menu or list of links', () => {
    const start = mount((b) => {
      b.append(
        el(
          'nav',
          { id: 'start' },
          ...Array.from({ length: 8 }, (_, i) => el('a', { href: `/page/${String(i)}` })),
        ),
      );
    });
    expect(findTargetsAt(start, undefined, PAGE)).toEqual([]);
  });

  it('never borrows a link from around a button (its destination is its own click)', () => {
    const start = mount((b) => {
      b.append(
        el(
          'section',
          {},
          el('p', {}, el('a', { href: 'https://unrelated.example/download' })),
          el('p', {}, el('button', { id: 'start' })),
        ),
      );
    });
    expect(findTargetsAt(start, undefined, PAGE)).toEqual([]);
  });

  it('does not search a whole page section for a link', () => {
    const start = mount((b) => {
      b.append(
        el(
          'article',
          {},
          el('a', { href: 'https://far.example/' }),
          el('p', {}, document.createTextNode('long text '.repeat(60))),
          el('span', { id: 'start' }),
        ),
      );
    });
    expect(findTargetsAt(start, undefined, PAGE)).toEqual([]);
  });

  it('still prefers the clicked element and its ancestors', () => {
    const start = mount((b) => {
      b.append(el('a', { href: 'https://near.example/' }, el('span', { id: 'start' })));
    });
    stack([el('a', { href: 'https://far.example/' })]);
    expect(findTargetsAt(start, { x: 1, y: 1 }, PAGE)).toEqual(['https://near.example/']);
  });
});

describe('textOf', () => {
  it('reads a table cell, and a text field by its value', () => {
    const cell = el('td', {}, document.createTextNode(' 185.220.101.4 '));
    const input = document.createElement('input');
    input.value = 'src=10.0.0.1 dst=8.8.8.8';
    document.body.append(el('table', {}, el('tr', {}, cell)), input);
    expect(textOf(cell)).toBe('185.220.101.4');
    expect(textOf(input)).toBe('src=10.0.0.1 dst=8.8.8.8');
  });

  it('ignores empty elements and whole page regions', () => {
    const empty = el('div');
    const huge = el('main', {}, document.createTextNode('x '.repeat(3000)));
    document.body.append(empty, huge);
    expect(textOf(empty)).toBeUndefined();
    expect(textOf(huge)).toBeUndefined();
  });
});
