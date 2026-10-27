/**
 * Content script. Injected on demand (never declared in the manifest), so it
 * costs nothing on pages where 4NTL isn't used. It renders cards, tells the
 * worker where a right-clicked element leads, and catches JavaScript-only
 * navigations on request. API keys and network access stay in the worker.
 */
import {
  isContentMessage,
  type BackgroundMessage,
  type CardView,
  type InspectResponse,
} from '../core/messages';
import { normalizeAppearance, type Appearance } from '../core/settings';
import { HOST_TAG, ResultCard } from '../ui/card';
import { pointRect } from '../ui/position';
import { runtimeClient } from '../ui/runtime-client';
import {
  chooseAnchor,
  hoveredRect,
  POINTER_MAX_AGE_MS,
  selectionRect,
  type PointerMark,
} from './anchor';
import { armCapture } from './capture';
import { deepestHovered, findLinkTargets } from './link-target';

let card: ResultCard | undefined;
let pointer: PointerMark | undefined;
/** The element of the last right-click (exact, unlike :hover). */
let rightClicked: { element: Element; at: number } | undefined;
let cancelCapture: (() => void) | undefined;

// Remember what and where the user right-clicks. (The first right-click in a
// page happens before this script exists; :hover and the selection cover it.)
document.addEventListener(
  'contextmenu',
  (event) => {
    pointer = { x: event.clientX, y: event.clientY, at: Date.now() };
    const [target] = event.composedPath();
    if (target instanceof Element) rightClicked = { element: target, at: Date.now() };
  },
  { capture: true, passive: true },
);

const viewportWidth = () => document.documentElement.clientWidth || window.innerWidth;

function show(view: CardView, appearance: Appearance, corner: boolean): void {
  card?.close();
  // Remove cards left behind by a previous extension version (orphaned script).
  for (const stale of document.querySelectorAll(HOST_TAG)) stale.remove();

  const anchor = corner
    ? pointRect(viewportWidth(), 0)
    : chooseAnchor(
        pointer,
        selectionRect(document),
        hoveredRect(document),
        viewportWidth(),
        Date.now(),
      );
  pointer = undefined; // one right-click, one card

  const current = new ResultCard({
    client: runtimeClient,
    placement: { mode: 'floating', anchor },
    appearance,
    onClose: () => {
      if (card === current) card = undefined;
    },
  });
  card = current;
  current.show(view);
}

function inspect(): InspectResponse {
  const recent = rightClicked && Date.now() - rightClicked.at <= POINTER_MAX_AGE_MS;
  const element = recent ? rightClicked?.element : deepestHovered(document);
  rightClicked = undefined;
  return { urls: element ? findLinkTargets(element, document.baseURI) : [] };
}

function capture(): void {
  cancelCapture?.();
  cancelCapture = armCapture((url) => {
    cancelCapture = undefined;
    if (!url) return;
    const message: BackgroundMessage = { type: '4ntl:captured', url };
    chrome.runtime.sendMessage(message).catch(() => undefined);
  });
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isContentMessage(message)) return false;
  switch (message.type) {
    case '4ntl:ping':
      sendResponse('pong');
      break;
    case '4ntl:show':
      // Re-validated even from our own worker: the accent ends up in CSS.
      show(message.view, normalizeAppearance(message.appearance), message.corner);
      sendResponse(true);
      break;
    case '4ntl:inspect':
      sendResponse(inspect());
      break;
    case '4ntl:capture':
      capture();
      sendResponse(true);
      break;
  }
  return false;
});
