/**
 * Catches where a JavaScript-only button goes, without letting it go there.
 *
 * Armed for a short time after the user asks 4NTL to check such a button. The
 * next navigation the page starts (link click, `location = …`, form submit,
 * SPA route change) is cancelled through the Navigation API and reported
 * instead; `window.open(…)` is caught by a page-world hook that dispatches
 * CAPTURED_OPEN_EVENT (see background/capture-hook.ts).
 */
import { CAPTURE_MS, CAPTURED_OPEN_EVENT } from '../core/messages';

interface NavigateEvent extends Event {
  readonly cancelable: boolean;
  readonly destination: { readonly url: string };
}

/** The parts of the Navigation API used here (not yet in TypeScript's DOM types). */
interface NavigationLike {
  addEventListener(type: 'navigate', listener: (event: NavigateEvent) => void): void;
  removeEventListener(type: 'navigate', listener: (event: NavigateEvent) => void): void;
}

/** Resolves with the caught URL, or undefined if nothing navigated in time. Returns a canceller. */
export function armCapture(
  onDone: (url: string | undefined) => void,
  win: Window = window,
  ms = CAPTURE_MS,
): () => void {
  const navigation = (win as unknown as { navigation?: NavigationLike }).navigation;
  let finished = false;

  const finish = (url?: string) => {
    if (finished) return;
    finished = true;
    navigation?.removeEventListener('navigate', onNavigate);
    win.removeEventListener(CAPTURED_OPEN_EVENT, onOpen);
    clearTimeout(timer);
    onDone(url);
  };
  const onNavigate = (event: NavigateEvent) => {
    // Stop the page from actually going there: that's the whole point.
    if (event.cancelable) event.preventDefault();
    finish(event.destination.url);
  };
  const onOpen = (event: Event) => {
    const detail: unknown = (event as CustomEvent).detail;
    if (typeof detail === 'string') finish(detail);
  };

  navigation?.addEventListener('navigate', onNavigate);
  win.addEventListener(CAPTURED_OPEN_EVENT, onOpen);
  const timer = setTimeout(() => {
    finish();
  }, ms);
  return () => {
    finish();
  };
}
