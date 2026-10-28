/**
 * Runs in the page's own JavaScript world (chrome.scripting, world: 'MAIN')
 * while a capture is armed: the next window.open(url) that follows a user
 * click (or Enter/Space) is reported to the content script instead of opening
 * a window. Pop-ups the page opens by itself are left alone. Must be
 * self-contained: no imports, no closures over module scope.
 */
export function hookWindowOpen(eventName: string, ms: number, gestureMs: number): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- always called via .call(window)
  const original = window.open;
  let lastGesture = Number.NEGATIVE_INFINITY;
  const onGesture = (event: Event) => {
    const key = (event as KeyboardEvent).key;
    if (event.type === 'pointerdown' || key === 'Enter' || key === ' ') lastGesture = Date.now();
  };
  const hooked = function (url?: string | URL, ...rest: [string?, string?]) {
    if (url === undefined || String(url) === '' || Date.now() - lastGesture > gestureMs) {
      return original.call(window, url, ...rest);
    }
    restore();
    window.dispatchEvent(
      new CustomEvent(eventName, { detail: new URL(String(url), document.baseURI).href }),
    );
    return null;
  } as typeof window.open;
  function restore() {
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    // Only undo our own hook; never clobber a replacement the page installed since.
    if (window.open === hooked) window.open = original;
  }

  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
  window.open = hooked;
  setTimeout(restore, ms);
}
