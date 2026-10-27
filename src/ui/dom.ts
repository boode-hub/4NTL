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

export const ICONS = {
  close: 'M4 4l8 8M12 4l-8 8',
  copy: 'M5.5 5.5V3.5a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-2M3.5 5.5h6a1 1 0 011 1v6a1 1 0 01-1 1h-6a1 1 0 01-1-1v-6a1 1 0 011-1z',
  check: 'M3.5 8.5l3 3 6-7',
} as const;
