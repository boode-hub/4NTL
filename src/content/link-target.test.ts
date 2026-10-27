// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { deepestHovered, findLinkTargets } from './link-target';

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
});

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
