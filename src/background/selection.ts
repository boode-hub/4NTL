/** Reads the current selection for the keyboard shortcut (context menus get it for free). */
import type { FrameTarget } from './present';

export interface FrameSelection {
  readonly text: string;
  readonly focused: boolean;
  /** Nothing was selected: this is the text of what the pointer is over. */
  readonly hovered?: boolean;
}

/**
 * Runs inside the page via chrome.scripting, so it must be self-contained:
 * no imports, no closures over module scope.
 */
export function readSelectionInPage(): FrameSelection {
  const active = document.activeElement;
  let text = '';
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    try {
      text = active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0);
    } catch {
      // Input types without selection support (e.g. type=email) throw.
    }
  }
  if (!text) text = document.getSelection()?.toString() ?? '';
  text = text.trim();
  if (text) return { text, focused: document.hasFocus() };

  // Nothing selected (or the app blocks selecting): use what the pointer is over,
  // e.g. a table cell in a console whose own right-click menu hides the browser's.
  let scope: Document | ShadowRoot = document;
  let hovered: Element | undefined;
  for (let depth = 0; depth < 10; depth++) {
    const list: NodeListOf<Element> = scope.querySelectorAll(':hover');
    const last = list[list.length - 1];
    if (!last) break;
    hovered = last;
    if (!last.shadowRoot) break;
    scope = last.shadowRoot;
  }
  const value =
    hovered instanceof HTMLInputElement || hovered instanceof HTMLTextAreaElement
      ? hovered.value
      : hovered instanceof HTMLElement
        ? hovered.innerText
        : '';
  const under = value.trim();
  // A whole page region isn't "the thing under the pointer".
  return under && under.length <= 2000
    ? { text: under, focused: document.hasFocus(), hovered: true }
    : { text: '', focused: document.hasFocus() };
}

/** Picks the frame the user is most plausibly acting on: focused with a selection first. */
export function pickSelection(
  results: readonly { frameId: number; result?: unknown }[],
): { frameId: number; text: string } | undefined {
  const candidates = results.flatMap(({ frameId, result }) => {
    const selection = result as Partial<FrameSelection> | undefined;
    return typeof selection?.text === 'string' && selection.text !== ''
      ? [
          {
            frameId,
            text: selection.text,
            focused: selection.focused === true,
            hovered: selection.hovered === true,
          },
        ]
      : [];
  });
  // A real selection beats the text under the pointer; the focused frame beats others.
  const selected = candidates.filter((c) => !c.hovered);
  const pool = selected.length > 0 ? selected : candidates;
  const best = pool.find((c) => c.focused) ?? pool[0];
  return best && { frameId: best.frameId, text: best.text };
}

/** Resolves undefined when the page can't be scripted (browser pages, Web Store…). */
export async function readSelection(
  tabId: number,
): Promise<(FrameTarget & { text: string }) | undefined> {
  // All frames first (the selection may be in an iframe); frames 4NTL may not
  // read (cross-origin ads/embeds under activeTab) can make that fail, so fall
  // back to the top frame alone.
  for (const target of [
    { tabId, allFrames: true },
    { tabId, frameIds: [0] },
  ]) {
    try {
      const results = await chrome.scripting.executeScript({ target, func: readSelectionInPage });
      const picked = pickSelection(results);
      return { tabId, frameId: picked?.frameId ?? 0, text: picked?.text ?? '' };
    } catch {
      // try the next, narrower target
    }
  }
  return undefined;
}
