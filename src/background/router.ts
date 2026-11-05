/** Handles messages from the extension's own UI surfaces. Everything else is ignored. */
import { parseIndicator } from '../core/indicator';
import type { Access } from '../core/license';
import {
  isBackgroundMessage,
  type CaptureResponse,
  type CardRect,
  type LicenseResponse,
  type LookupResponse,
} from '../core/messages';
import type { LookupService } from './lookup-service';

export interface RouterDeps {
  readonly extensionId: string;
  readonly service: Pick<LookupService, 'lookup'>;
  readonly openOptions: () => Promise<void>;
  readonly openList: () => Promise<void>;
  /** Stores the card width the user resized to. */
  readonly saveCardWidth: (width: number) => Promise<void>;
  /** Store edition; the GitHub edition answers 'open' and never opens a checkout. */
  readonly license: {
    readonly access: (refresh: boolean) => Promise<Access>;
    readonly unlock: () => Promise<void>;
    readonly restore: () => Promise<void>;
  };
  /** "Copy card as image": a PNG data: URL of that box of the window's visible tab. */
  readonly captureCard: (
    windowId: number | undefined,
    rect: CardRect,
    viewportWidth: number,
  ) => Promise<string>;
  /** A content script caught where a JavaScript-only button was going. */
  readonly onCaptured: (url: string, sender: chrome.runtime.MessageSender) => Promise<void>;
}

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: LookupResponse | LicenseResponse | CaptureResponse) => void,
) => boolean;

export function createMessageRouter(deps: RouterDeps): Listener {
  return (message, sender, sendResponse) => {
    if (sender.id !== deps.extensionId || !isBackgroundMessage(message)) return false;

    switch (message.type) {
      case '4ntl:lookup': {
        // Re-validate: only canonical indicators produced by our own parser are looked up.
        const indicator = parseIndicator(message.indicator.value);
        if (
          indicator?.type !== message.indicator.type ||
          indicator.value !== message.indicator.value
        ) {
          sendResponse({
            ok: false,
            error: { code: 'invalid_indicator', message: 'Not a valid indicator.' },
          });
          return false;
        }
        void deps.license
          .access(false)
          .then((access) =>
            access.status === 'locked'
              ? {
                  ok: false as const,
                  error: {
                    code: 'payment_required' as const,
                    message: 'Unlock 4NTL in its settings to keep looking things up.',
                  },
                }
              : deps.service.lookup(message.provider, indicator, { force: message.force }),
          )
          .then(sendResponse);
        return true; // keep the channel open for the async response
      }
      case '4ntl:open-options':
        void deps.openOptions();
        return false;
      case '4ntl:card-width':
        void deps.saveCardWidth(message.width);
        return false;
      case '4ntl:open-list':
        void deps.openList();
        return false;
      case '4ntl:unlock':
        void deps.license.unlock();
        return false;
      case '4ntl:restore':
        void deps.license.restore();
        return false;
      case '4ntl:license':
        void deps.license.access(message.refresh).then((access) => {
          sendResponse({ access });
        });
        return true;
      case '4ntl:capture-card': {
        // Not in a regular tab (an app or side window): the focused window is where it was clicked.
        void deps.captureCard(sender.tab?.windowId, message.rect, message.viewportWidth).then(
          (dataUrl) => {
            sendResponse({ dataUrl });
          },
          (error: unknown) => {
            sendResponse({ error: error instanceof Error ? error.message : String(error) });
          },
        );
        return true;
      }
      case '4ntl:captured':
        // Only content scripts in a tab can catch a click.
        if (sender.tab?.id !== undefined) void deps.onCaptured(message.url, sender);
        return false;
    }
  };
}
