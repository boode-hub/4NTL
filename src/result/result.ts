/**
 * The toolbar popup (a box to type an IP, domain, URL or hash), and the
 * fallback window for pages that can't host the in-page card (browser pages,
 * the PDF viewer, the Web Store…). Renders the same card, inline.
 */
import { VIEW_KINDS, type CardView } from '../core/messages';
import { loadSettings } from '../core/settings';
import { ResultCard, type CardClient } from '../ui/card';
import { runtimeClient } from '../ui/runtime-client';

function viewFromHash(processes: boolean): CardView {
  try {
    const parsed = JSON.parse(decodeURIComponent(location.hash.slice(1))) as Partial<CardView>;
    if ((VIEW_KINDS as readonly unknown[]).includes(parsed.kind)) {
      return parsed as CardView;
    }
  } catch {
    // fall through
  }
  // Nothing passed in: the toolbar popup.
  return { kind: 'ask', processes };
}

void loadSettings().then(({ appearance, processes }) => {
  document.documentElement.dataset.theme = appearance.theme;
  new ResultCard({
    client: location.hash ? runtimeClient : popupClient(runtimeClient),
    placement: { mode: 'inline', container: document.body },
    appearance,
    onClose: () => {
      window.close();
    },
  }).show(viewFromHash(processes));
});

/**
 * No hash: this is the toolbar popup. A popup isn't part of the tab's screenshot
 * (that would picture the page under it), so "Copy card as image" isn't offered.
 */
function popupClient(client: CardClient): CardClient {
  const copy: CardClient = { ...client };
  delete copy.captureCard;
  return copy;
}

// Behave like a popup: go away once the user moves on.
window.addEventListener('blur', () => {
  window.close();
});
