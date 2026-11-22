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

/** The logo's Mangekyo blade, drawn three times (same path as scripts/make-icons.mjs). */
export const BLADE =
  'M4.24 11.18C4.17 11.16 4.25 10.07 4.34 9.51C4.44 8.96 4.60 8.39 4.81 7.85C5.02 7.31 5.29 6.77 5.61 6.25C5.93 5.72 6.29 5.21 6.71 4.72C7.13 4.23 7.60 3.74 8.14 3.32C8.67 2.90 9.46 2.50 9.92 2.22C10.38 1.94 10.57 1.81 10.91 1.66C11.26 1.50 11.45 1.32 12.00 1.30C12.55 1.28 13.70 1.38 14.22 1.53C14.75 1.69 14.93 1.88 15.17 2.25C15.41 2.63 15.52 3.31 15.66 3.78C15.80 4.25 15.95 4.61 16.00 5.07C16.05 5.53 15.99 6.10 15.97 6.54C15.94 6.98 15.89 7.37 15.85 7.73C15.81 8.08 15.78 8.36 15.72 8.65C15.65 8.95 15.52 9.26 15.44 9.50C15.36 9.75 15.30 9.94 15.25 10.13C15.20 10.31 15.19 10.45 15.15 10.60C15.11 10.75 15.06 10.89 15.00 11.03C14.93 11.16 14.81 11.30 14.74 11.42C14.67 11.53 14.64 11.59 14.59 11.73C14.54 11.87 14.49 12.10 14.44 12.26C14.38 12.41 14.32 12.55 14.26 12.65C14.20 12.75 14.10 12.89 14.09 12.84C14.07 12.80 14.15 12.56 14.17 12.38C14.18 12.20 14.18 11.95 14.19 11.77C14.20 11.59 14.22 11.45 14.23 11.27C14.25 11.10 14.26 10.90 14.25 10.70C14.24 10.50 14.17 10.24 14.16 10.06C14.14 9.88 14.16 9.76 14.14 9.62C14.12 9.48 14.07 9.35 14.03 9.21C13.98 9.06 13.93 8.93 13.88 8.75C13.82 8.58 13.78 8.37 13.71 8.16C13.64 7.96 13.56 7.75 13.45 7.53C13.35 7.31 13.23 7.11 13.09 6.86C12.95 6.62 12.81 6.29 12.63 6.03C12.45 5.77 12.23 5.47 12.00 5.30C11.77 5.13 11.52 5.10 11.27 5.04C11.02 4.98 10.87 4.90 10.50 4.96C10.13 5.01 9.53 5.20 9.05 5.38C8.58 5.55 8.08 5.74 7.65 6.01C7.22 6.29 6.82 6.64 6.46 7.01C6.11 7.39 5.79 7.81 5.50 8.25C5.22 8.69 4.98 9.16 4.77 9.65C4.56 10.14 4.31 11.21 4.24 11.18Z';

/** The 4NTL eye (Sharingan theme decoration): the logo without its hieroglyphs. Colors come from the card's CSS. */
export function sharinganEye(): HTMLElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  const mangekyo = document.createElementNS(SVG_NS, 'g');
  mangekyo.setAttribute('transform', 'translate(12 12) scale(.69) translate(-12 -12)');
  mangekyo.append(
    ...[-18, 102, 222].map((angle) =>
      svgChild('path', 'blade', { d: BLADE, transform: `rotate(${angle} 12 12)` }),
    ),
    svgChild('circle', 'pupil', { cx: '12', cy: '12', r: '1.6' }),
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
