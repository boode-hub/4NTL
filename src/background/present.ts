/**
 * Gets a CardView in front of the user: in the page next to the selection when
 * possible, otherwise (browser pages, PDF viewer, Web Store…) in a small window.
 */
import {
  CAPTURE_MS,
  CAPTURED_OPEN_EVENT,
  GESTURE_WINDOW_MS,
  type CardView,
  type ContentMessage,
  type InspectResponse,
} from '../core/messages';
import { loadSettings } from '../core/settings';
import { hookWindowOpen } from './capture-hook';

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
export async function presentInPage(
  target: FrameTarget,
  view: CardView,
  corner = false,
): Promise<boolean> {
  try {
    await ensureContentScript(target);
    const { appearance } = await loadSettings();
    const show: ContentMessage = { type: '4ntl:show', view, appearance, corner };
    await chrome.tabs.sendMessage(target.tabId, show, { frameId: target.frameId });
    return true;
  } catch {
    return false;
  }
}

/** Asks the right-clicked frame where the element under the pointer leads. */
export async function inspectInPage(target: FrameTarget): Promise<string[]> {
  try {
    await ensureContentScript(target);
    const inspect: ContentMessage = { type: '4ntl:inspect' };
    const response: unknown = await chrome.tabs.sendMessage(target.tabId, inspect, {
      frameId: target.frameId,
    });
    const urls = (response as Partial<InspectResponse> | undefined)?.urls;
    return Array.isArray(urls) ? urls.filter((url): url is string => typeof url === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Arms the frame to catch the next navigation (and window.open) instead of
 * following it. Resolves false when the page can't be scripted.
 */
export async function captureInPage(target: FrameTarget): Promise<boolean> {
  try {
    await ensureContentScript(target);
    await chrome.scripting.executeScript({
      target: { tabId: target.tabId, frameIds: [target.frameId] },
      world: 'MAIN',
      func: hookWindowOpen,
      args: [CAPTURED_OPEN_EVENT, CAPTURE_MS, GESTURE_WINDOW_MS],
    });
    const capture: ContentMessage = { type: '4ntl:capture' };
    await chrome.tabs.sendMessage(target.tabId, capture, { frameId: target.frameId });
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
