/**
 * Catches where a JavaScript-only button goes, without letting it go there.
 *
 * Armed for a short time after the user asks 4NTL to check such a button. The
 * next navigation that follows one of the user's own clicks (link click,
 * `location = …`, form submit, SPA route change) is cancelled through the
 * Navigation API and reported instead; `window.open(…)` is caught by a
 * page-world hook that dispatches CAPTURED_OPEN_EVENT (background/capture-hook.ts).
 * Navigations the page makes on its own (auto-refresh, URL updates while
 * scrolling) are left alone.
 */
import { CAPTURE_MS, CAPTURED_OPEN_EVENT, GESTURE_WINDOW_MS } from '../core/messages';

interface NavigateEvent extends Event {
  readonly cancelable: boolean;
  readonly userInitiated?: boolean;
  readonly destination: { readonly url: string };
}

/** The parts of the Navigation API used here (not yet in TypeScript's DOM types). */
interface NavigationLike {
  addEventListener(type: 'navigate', listener: (event: NavigateEvent) => void): void;
  removeEventListener(type: 'navigate', listener: (event: NavigateEvent) => void): void;
}

/** A click, or Enter/Space (which activate buttons and links). */
function isActivation(event: Event): boolean {
  if (event.type === 'pointerdown') return true;
  const key = (event as KeyboardEvent).key;
  return key === 'Enter' || key === ' ';
}

/** Calls back with the caught URL, or undefined if nothing navigated in time. Returns a canceller. */
export function armCapture(
  onDone: (url: string | undefined) => void,
  win: Window = window,
  ms = CAPTURE_MS,
): () => void {
  const navigation = (win as unknown as { navigation?: NavigationLike }).navigation;
  let finished = false;
  let lastGesture = Number.NEGATIVE_INFINITY;

  const finish = (url?: string) => {
    if (finished) return;
    finished = true;
    navigation?.removeEventListener('navigate', onNavigate);
    win.removeEventListener(CAPTURED_OPEN_EVENT, onOpen);
    win.removeEventListener('pointerdown', onGesture, true);
    win.removeEventListener('keydown', onGesture, true);
    clearTimeout(timer);
    onDone(url);
  };
  const onGesture = (event: Event) => {
    if (isActivation(event)) lastGesture = Date.now();
  };
  const onNavigate = (event: NavigateEvent) => {
    const followsUser =
      event.userInitiated === true || Date.now() - lastGesture <= GESTURE_WINDOW_MS;
    if (!followsUser) return; // the page navigating by itself: not what the user asked about
    // Stop the page from actually going there: that's the whole point.
    if (event.cancelable) event.preventDefault();
    finish(event.destination.url);
  };
  const onOpen = (event: Event) => {
    const detail: unknown = (event as CustomEvent).detail;
    if (typeof detail === 'string') finish(detail);
  };

  win.addEventListener('pointerdown', onGesture, true);
  win.addEventListener('keydown', onGesture, true);
  navigation?.addEventListener('navigate', onNavigate);
  win.addEventListener(CAPTURED_OPEN_EVENT, onOpen);
  const timer = setTimeout(() => {
    finish();
  }, ms);
  return () => {
    finish();
  };
}
