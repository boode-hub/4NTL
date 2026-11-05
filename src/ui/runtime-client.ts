/** CardClient backed by extension messaging to the service worker (which holds the API keys). */
import type { BackgroundMessage, CaptureResponse } from '../core/messages';
import type { LookupOutcome } from '../core/result';
import { addToList } from '../core/saved-list';
import { NO_ANSWER, type CardClient } from './card';

function isOutcome(value: unknown): value is LookupOutcome {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === 'boolean'
  );
}

function contextAlive(): boolean {
  try {
    return Boolean(chrome.runtime.id);
  } catch {
    return false;
  }
}

function lostContact(): LookupOutcome {
  return {
    ok: false,
    error: contextAlive()
      ? { code: 'internal', message: 'Lost contact with the extension. Try again.' }
      : {
          code: 'internal',
          message: '4NTL was updated or reloaded. Refresh this page to keep using it.',
        },
  };
}

export const runtimeClient: CardClient = {
  async lookup(provider, indicator, force) {
    const message: BackgroundMessage = { type: '4ntl:lookup', provider, indicator, force };
    try {
      const response: unknown = await chrome.runtime.sendMessage(message);
      return isOutcome(response) ? response : lostContact();
    } catch {
      return lostContact();
    }
  },
  openOptions() {
    const message: BackgroundMessage = { type: '4ntl:open-options' };
    chrome.runtime.sendMessage(message).catch(() => undefined);
  },
  async save(entry) {
    await addToList(entry);
  },
  saveWidth(width) {
    const message: BackgroundMessage = { type: '4ntl:card-width', width };
    chrome.runtime.sendMessage(message).catch(() => undefined);
  },
  openList() {
    const message: BackgroundMessage = { type: '4ntl:open-list' };
    chrome.runtime.sendMessage(message).catch(() => undefined);
  },
  async captureCard(rect, viewportWidth) {
    const message: BackgroundMessage = { type: '4ntl:capture-card', rect, viewportWidth };
    const response = await chrome.runtime.sendMessage<
      BackgroundMessage,
      CaptureResponse | undefined
    >(message);
    // No answer: the running background predates this request (rebuilt but not reloaded).
    if (!response) throw new Error(NO_ANSWER);
    if ('error' in response) throw new Error(response.error);
    const data = response.dataUrl.slice(response.dataUrl.indexOf(',') + 1);
    return new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type: 'image/png' });
  },
  unlock() {
    const message: BackgroundMessage = { type: '4ntl:unlock' };
    chrome.runtime.sendMessage(message).catch(() => undefined);
  },
  restore() {
    const message: BackgroundMessage = { type: '4ntl:restore' };
    chrome.runtime.sendMessage(message).catch(() => undefined);
  },
};
