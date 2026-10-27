/** Reads the current selection for the keyboard shortcut (context menus get it for free). */
import type { FrameTarget } from './present';

export interface FrameSelection {
  readonly text: string;
  readonly focused: boolean;
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
  return { text: text.trim(), focused: document.hasFocus() };
}

/** Picks the frame the user is most plausibly acting on: focused with a selection first. */
export function pickSelection(
  results: readonly { frameId: number; result?: unknown }[],
): { frameId: number; text: string } | undefined {
  const candidates = results.flatMap(({ frameId, result }) => {
    const selection = result as Partial<FrameSelection> | undefined;
    return typeof selection?.text === 'string' && selection.text !== ''
      ? [{ frameId, text: selection.text, focused: selection.focused === true }]
      : [];
  });
  const best = candidates.find((c) => c.focused) ?? candidates[0];
  return best && { frameId: best.frameId, text: best.text };
}

/** Resolves undefined when the page can't be scripted (browser pages, Web Store…). */
export async function readSelection(
  tabId: number,
): Promise<(FrameTarget & { text: string }) | undefined> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: readSelectionInPage,
    });
    const picked = pickSelection(results);
    return { tabId, frameId: picked?.frameId ?? 0, text: picked?.text ?? '' };
  } catch {
    return undefined;
  }
}
