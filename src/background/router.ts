/** Handles messages from the extension's own UI surfaces. Everything else is ignored. */
import { parseIndicator } from '../core/indicator';
import { isBackgroundMessage, type LookupResponse } from '../core/messages';
import type { LookupService } from './lookup-service';

export interface RouterDeps {
  readonly extensionId: string;
  readonly service: Pick<LookupService, 'lookup'>;
  readonly openOptions: () => Promise<void>;
  readonly openList: () => Promise<void>;
  /** A content script caught where a JavaScript-only button was going. */
  readonly onCaptured: (url: string, sender: chrome.runtime.MessageSender) => Promise<void>;
}

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: LookupResponse) => void,
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
        void deps.service
          .lookup(message.provider, indicator, { force: message.force })
          .then(sendResponse);
        return true; // keep the channel open for the async response
      }
      case '4ntl:open-options':
        void deps.openOptions();
        return false;
      case '4ntl:open-list':
        void deps.openList();
        return false;
      case '4ntl:captured':
        // Only content scripts in a tab can catch a click.
        if (sender.tab?.id !== undefined) void deps.onCaptured(message.url, sender);
        return false;
    }
  };
}
