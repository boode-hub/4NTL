/**
 * Runs in the page's own JavaScript world (chrome.scripting, world: 'MAIN')
 * while a capture is armed: the next window.open(url) is reported to the
 * content script instead of opening a window. Must be self-contained.
 */
export function hookWindowOpen(eventName: string, ms: number): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- always called via .call(window)
  const original = window.open;
  const restore = () => {
    if (window.open !== original) window.open = original;
  };
  window.open = function (url?: string | URL, ...rest: [string?, string?]) {
    restore();
    if (url === undefined || String(url) === '') return original.call(window, url, ...rest);
    window.dispatchEvent(
      new CustomEvent(eventName, { detail: new URL(String(url), document.baseURI).href }),
    );
    return null;
  };
  setTimeout(restore, ms);
}
