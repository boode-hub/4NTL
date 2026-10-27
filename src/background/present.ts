/**
 * Gets a CardView in front of the user: in the page next to the selection when
 * possible, otherwise (browser pages, PDF viewer, Web Store…) in a small window.
 */
import type { CardView, ContentMessage } from '../core/messages';
import { loadSettings } from '../core/settings';

export interface FrameTarget {
  readonly tabId: number;
  readonly frameId: number;
}

const CONTENT_SCRIPT = 'content.js';
const WINDOW_SIZE = { width: 380, height: 480 } as const;

/** Injects the UI script on first use only; it stays until the page navigates. */
async function ensureContentScript({ tabId, frameId }: FrameTarget): Promise<void> {
  const ping: ContentMessage = { type: '4ntl:ping' };
  try {
    if ((await chrome.tabs.sendMessage(tabId, ping, { frameId })) === 'pong') return;
  } catch {
    // No listener yet (or an orphan from a previous extension version): inject.
  }
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: [CONTENT_SCRIPT],
  });
}

/** Resolves false when the page can't host the card (restricted URL, closed tab…). */
export async function presentInPage(target: FrameTarget, view: CardView): Promise<boolean> {
  try {
    await ensureContentScript(target);
    const { appearance } = await loadSettings();
    const show: ContentMessage = { type: '4ntl:show', view, appearance };
    await chrome.tabs.sendMessage(target.tabId, show, { frameId: target.frameId });
    return true;
  } catch {
    return false;
  }
}

export function resultPageUrl(view: CardView): string {
  return chrome.runtime.getURL(`result.html#${encodeURIComponent(JSON.stringify(view))}`);
}

export async function presentInWindow(view: CardView): Promise<void> {
  // Open near the top-right of the window the user is looking at.
  const anchor = await chrome.windows.getLastFocused().catch(() => undefined);
  const placement =
    anchor?.left !== undefined && anchor.top !== undefined && anchor.width !== undefined
      ? {
          left: Math.max(0, anchor.left + anchor.width - WINDOW_SIZE.width - 24),
          top: anchor.top + 80,
        }
      : {};
  const window = {
    url: resultPageUrl(view),
    type: 'popup',
    focused: true,
    ...WINDOW_SIZE,
  } as const;
  try {
    await chrome.windows.create({ ...window, ...placement });
  } catch {
    // Rejected bounds (odd multi-monitor layouts, small screens): let the OS place it.
    await chrome.windows.create(window);
  }
}
