/**
 * Content script. Injected on demand (never declared in the manifest), so it
 * costs nothing on pages where 4NTL isn't used. It only renders: API keys and
 * network access stay in the service worker.
 */
import { isContentMessage, type CardView } from '../core/messages';
import { normalizeAppearance, type Appearance } from '../core/settings';
import { HOST_TAG, ResultCard } from '../ui/card';
import { runtimeClient } from '../ui/runtime-client';
import { chooseAnchor, hoveredRect, selectionRect, type PointerMark } from './anchor';

let card: ResultCard | undefined;
let pointer: PointerMark | undefined;

// Remember where the user right-clicks, so later cards open at the pointer.
// (The very first card in a page anchors to the selection: the script isn't
// running yet when that first right-click happens.)
document.addEventListener(
  'contextmenu',
  (event) => {
    pointer = { x: event.clientX, y: event.clientY, at: Date.now() };
  },
  { capture: true, passive: true },
);

function show(view: CardView, appearance: Appearance): void {
  card?.close();
  // Remove cards left behind by a previous extension version (orphaned script).
  for (const stale of document.querySelectorAll(HOST_TAG)) stale.remove();

  const anchor = chooseAnchor(
    pointer,
    selectionRect(document),
    hoveredRect(document),
    document.documentElement.clientWidth || window.innerWidth,
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

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isContentMessage(message)) return false;
  if (message.type === '4ntl:ping') {
    sendResponse('pong');
  } else {
    // Re-validated even from our own worker: the accent ends up in CSS.
    show(message.view, normalizeAppearance(message.appearance));
    sendResponse(true);
  }
  return false;
});
