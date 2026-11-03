/**
 * Finds where a right-clicked element leads when it isn't a plain link:
 * buttons and cards wired up in JavaScript, `href="#"` or `javascript:` links
 * with the real target in a handler, data attributes, forms, SVG links and
 * web components. Walks from the element up through its ancestors (crossing
 * shadow roots) and returns the destinations found on the nearest one; also
 * looks under the pointer and inside the element (see findTargetsAt).
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const MAX_DEPTH = 10;
const MAX_TARGETS = 5;

/** Attributes that hold a destination (relative values allowed). */
const LINK_ATTRIBUTES = new Set([
  'href',
  'data-href',
  'data-url',
  'data-link',
  'data-target-url',
  'data-redirect',
  'data-redirect-url',
  'data-destination',
  'data-navigate',
  'data-action-url',
  'data-to',
  'routerlink',
  'ng-reflect-router-link',
  'data-uri',
  'data-link-url',
  'data-outbound-url',
  'data-expanded-url',
  'data-full-url',
  'data-saferedirecturl',
]);

/** Attributes that hold absolute URLs but aren't where a click goes. */
const NOT_DESTINATIONS = new Set([
  'src',
  'srcset',
  'data-src',
  'data-srcset',
  'poster',
  'style',
  'background',
  'xmlns',
  'itemtype',
  'itemprop',
  'cite',
  'manifest',
  'integrity',
]);

/** URLs handed to navigation calls inside inline handlers: location = '…', open('…'), … */
const SCRIPT_NAVIGATION =
  /(?:location(?:\.href)?\s*=|location\.(?:assign|replace)\s*\(|\bopen\s*\(|\bnavigate(?:To|ByUrl)?\s*\()\s*['"`]([^'"`]+)['"`]/g;
const ABSOLUTE_URL = /\bhttps?:\/\/[^\s'"`<>()\\]+/gi;
const NON_WEB = /^(?:javascript|mailto|tel|sms|data|blob|about|chrome|file):/i;

/** URL without its fragment (a bare "#" has an empty `hash`, so split on the href). */
function withoutHash(url: URL): string {
  return url.href.split('#', 1)[0] ?? url.href;
}

function resolve(value: string, base: URL): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || NON_WEB.test(trimmed)) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed, base);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  // "#" and "#section" stay on this page: not a destination.
  if (url.href.includes('#') && withoutHash(url) === withoutHash(base)) return undefined;
  return url.href;
}

function isSubmitControl(element: Element): element is HTMLButtonElement | HTMLInputElement {
  return (
    (element instanceof HTMLButtonElement && element.type === 'submit') ||
    (element instanceof HTMLInputElement && (element.type === 'submit' || element.type === 'image'))
  );
}

function destinationsOf(element: Element, base: URL): string[] {
  const found: string[] = [];
  const add = (value: string | null | undefined) => {
    const url = value == null ? undefined : resolve(value, base);
    if (url) found.push(url);
  };

  if (element.namespaceURI === SVG_NS && element.localName === 'a') {
    add(element.getAttribute('href') ?? element.getAttributeNS(XLINK_NS, 'href'));
  }
  if (isSubmitControl(element)) {
    add(element.getAttribute('formaction') ?? element.form?.getAttribute('action'));
  }
  for (const { name, value } of element.attributes) {
    if (name.startsWith('on')) {
      for (const match of value.matchAll(SCRIPT_NAVIGATION)) add(match[1]);
      for (const match of value.matchAll(ABSOLUTE_URL)) add(match[0]);
    } else if (LINK_ATTRIBUTES.has(name)) {
      add(value);
    } else if (!NOT_DESTINATIONS.has(name) && /^\s*https?:\/\//i.test(value)) {
      add(value);
    }
  }
  return found;
}

function parentAcrossShadow(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Destinations of the nearest element (from `start` outwards) that has any; at most five. */
export function findLinkTargets(start: Element, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const doc = start.ownerDocument;
  let element: Element | null = start;
  for (let depth = 0; element && depth < MAX_DEPTH; depth++) {
    if (element === doc.body || element === doc.documentElement) break;
    const found = destinationsOf(element, base);
    if (found.length > 0) return [...new Set(found)].slice(0, MAX_TARGETS);
    element = parentAcrossShadow(element);
  }
  return [];
}

/**
 * The innermost element under the pointer, looking inside open shadow roots.
 * The page keeps its :hover state while the browser's context menu is open.
 */
export function deepestHovered(doc: Document): Element | undefined {
  let scope: Document | ShadowRoot = doc;
  let deepest: Element | undefined;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const hovered: NodeListOf<Element> = scope.querySelectorAll(':hover');
    const last = hovered[hovered.length - 1];
    if (!last) break;
    deepest = last;
    if (!last.shadowRoot) break;
    scope = last.shadowRoot;
  }
  return deepest;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Elements stacked under a point, top first, looking into open shadow roots. */
function stackAt(doc: Document, point: Point): Element[] {
  if (typeof doc.elementsFromPoint !== 'function') return [];
  const stack = doc.elementsFromPoint(point.x, point.y);
  const inner = stack[0]?.shadowRoot?.elementsFromPoint(point.x, point.y) ?? [];
  return [...inner, ...stack].slice(0, MAX_DEPTH * 2);
}

/** A control's destination is its own click (caught by "click it once"), never a nearby link. */
const CONTROLS = 'button, input, select, textarea, [role="button"], [onclick]';
/** About a card or a table row; more text than this is a page section, not "what was clicked". */
const MAX_BOX_TEXT = 400;

/** Links inside what was clicked (a card's padding, a table row), if there are only a few. */
function linksWithin(start: Element, base: URL): string[] {
  if (start.closest(CONTROLS)) return [];
  let element: Element | null = start;
  for (let depth = 0; element && depth < 3; depth++) {
    if (element === element.ownerDocument.body) break;
    if (element.textContent.length > MAX_BOX_TEXT) break;
    const anchors = element.querySelectorAll('a[href], area[href]');
    if (anchors.length > MAX_TARGETS) break; // a whole list or menu: too vague to pick from
    const found = [...anchors].flatMap((anchor) => destinationsOf(anchor, base));
    if (found.length > 0) return [...new Set(found)].slice(0, MAX_TARGETS);
    element = parentAcrossShadow(element);
  }
  return [];
}

/**
 * Where a right-click leads, trying in turn: the clicked element and its
 * ancestors; whatever else is stacked under the pointer (a transparent layer
 * on top of a card often hides the real link from the click); links inside
 * the clicked element.
 */
export function findTargetsAt(start: Element, point: Point | undefined, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const box = start.getBoundingClientRect();
  const at = point ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const tried = new Set<Element>();
  for (const element of [start, ...stackAt(start.ownerDocument, at)]) {
    if (tried.has(element)) continue;
    tried.add(element);
    const found = findLinkTargets(element, baseUrl);
    if (found.length > 0) return found;
  }
  return linksWithin(start, base);
}

const MAX_TEXT = 2000;

/**
 * The text of what was right-clicked (a table cell, a label, a text field's
 * value), for finding an IP, domain or hash when there's no link. Undefined
 * when it's a whole page region rather than one thing.
 */
export function textOf(element: Element): string | undefined {
  const text =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? element.value
      : element instanceof HTMLElement
        ? element.innerText
        : element.textContent;
  const trimmed = text.trim();
  return trimmed && trimmed.length <= MAX_TEXT ? trimmed : undefined;
}
