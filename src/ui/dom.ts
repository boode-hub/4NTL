/**
 * Tiny DOM builder. Text is only ever assigned through text nodes, so data from
 * APIs or web pages can never be interpreted as markup.
 */

type Child = Node | string | false | null | undefined;

export interface Props {
  readonly class?: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly on?: {
    readonly [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void;
  };
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  for (const [name, value] of Object.entries(props.attrs ?? {})) element.setAttribute(name, value);
  for (const [type, listener] of Object.entries(props.on ?? {})) {
    element.addEventListener(type, listener as EventListener);
  }
  for (const child of children) {
    if (child === false || child === null || child === undefined) continue;
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A 16×16 stroked icon from a path definition. */
export function icon(pathData: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', pathData);
  svg.append(path);
  return svg;
}

function svgChild(tag: string, className: string, attrs: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  element.setAttribute('class', className);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  return element;
}

/** The logo's Mangekyo: three curved blades and three long points (same as scripts/make-icons.mjs). */
const BLADE = 'M8.80 10.15C6.91 6.91 10.47 3.33 19.20 5.96C13.58 4.57 13.92 6.74 13.74 8.73Z';
const POINT = 'M14.17 9.01Q16.42 7.10 19.97 7.02Q16.98 7.67 14.92 9.72Z';

/** The 4NTL eye (Sharingan theme decoration): the logo without its hieroglyphs. Colors come from the card's CSS. */
export function sharinganEye(): HTMLElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  const mangekyo = document.createElementNS(SVG_NS, 'g');
  mangekyo.setAttribute('transform', 'translate(12 12) scale(.78) translate(-12 -12)');
  mangekyo.append(
    ...[0, 120, 240].flatMap((angle) => [
      svgChild('path', 'blade', { d: BLADE, transform: `rotate(${angle} 12 12)` }),
      svgChild('path', 'blade', { d: POINT, transform: `rotate(${angle} 12 12)` }),
    ]),
    svgChild('circle', 'pupil', { cx: '12', cy: '12', r: '3.9' }),
    svgChild('circle', 'ring', { cx: '12', cy: '12', r: '2.75' }),
    svgChild('circle', 'pupil', { cx: '12', cy: '12', r: '1.5' }),
  );
  svg.append(
    svgChild('circle', 'iris', { cx: '12', cy: '12', r: '11' }),
    svgChild('circle', 'band', { cx: '12', cy: '12', r: '8.55' }),
    mangekyo,
  );
  const wrapper = document.createElement('span');
  wrapper.className = 'eye';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.append(svg);
  return wrapper;
}

export const ICONS = {
  close: 'M4 4l8 8M12 4l-8 8',
  copy: 'M5.5 5.5V3.5a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-2M3.5 5.5h6a1 1 0 011 1v6a1 1 0 01-1 1h-6a1 1 0 01-1-1v-6a1 1 0 011-1z',
  check: 'M3.5 8.5l3 3 6-7',
  save: 'M4.5 2.5h7a.5.5 0 01.5.5v10.5l-4-2.75-4 2.75V3a.5.5 0 01.5-.5z',
} as const;
