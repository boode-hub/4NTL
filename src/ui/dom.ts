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

/** Comma-shaped tomoe, drawn at the top of the ring and rotated into place. */
const TOMOE = 'M12 4.3a1.7 1.7 0 1 1-1.3 2.8C9.6 6 9.3 4.9 8.4 4.4c1.2-.5 2.4-.4 3.6-.1z';

/** The Sharingan eye (theme decoration). Colors come from the card's CSS. */
export function sharinganEye(): HTMLElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.append(
    svgChild('circle', 'iris', { cx: '12', cy: '12', r: '11' }),
    svgChild('circle', 'ring', { cx: '12', cy: '12', r: '6' }),
    ...[0, 120, 240].map((angle) =>
      svgChild('path', 'tomoe', { d: TOMOE, transform: `rotate(${angle} 12 12)` }),
    ),
    svgChild('circle', 'pupil', { cx: '12', cy: '12', r: '2.4' }),
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
