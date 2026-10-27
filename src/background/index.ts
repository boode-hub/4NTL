/**
 * Service-worker entry point: only wiring. All listeners are registered
 * synchronously at top level, as MV3 requires for events to wake the worker.
 * The worker holds no timers or long-lived state, so the browser can (and
 * does) shut it down whenever it's idle.
 */
import { REPORT_CACHE, TtlCache } from '../core/cache';
import type { Report } from '../core/result';
import {
  affectsResults,
  hasAnyApiKey,
  loadSettings,
  normalizeSettings,
  SETTINGS_KEY,
} from '../core/settings';
import { refreshBadge } from './badge';
import { handleLookupRequest, type ControllerDeps } from './controller';
import { LookupService } from './lookup-service';
import { LINK_ITEM_ID, menuItemId, registerMenus, scopeFromMenuItem } from './menus';
import { presentInPage, presentInWindow } from './present';
import { createMessageRouter } from './router';
import { readSelection } from './selection';
import { NO_INDICATOR_NOTICE, type ProviderScope } from './view';

const cache = new TtlCache<Report>(chrome.storage.session, REPORT_CACHE);

const service = new LookupService({
  cache,
  loadSettings: () => loadSettings(),
  // Resolved at call time, so tests can substitute the global fetch.
  fetch: (input, init) => fetch(input, init),
});

const deps: ControllerDeps = { service, presentInPage, presentInWindow };
const openOptions = () => chrome.runtime.openOptionsPage();

function report(error: unknown) {
  console.error('[4NTL]', error);
}

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    await registerMenus();
    const settings = await loadSettings();
    await refreshBadge(settings);
    if (details.reason === 'install' && !hasAnyApiKey(settings)) {
      await openOptions();
    }
  })().catch(report);
});

chrome.runtime.onStartup.addListener(() => {
  void loadSettings().then(refreshBadge).catch(report);
});

type MenuClick = Pick<
  chrome.contextMenus.OnClickData,
  'menuItemId' | 'selectionText' | 'linkUrl' | 'frameId'
>;

async function onMenuClick(info: MenuClick, tab: chrome.tabs.Tab | undefined): Promise<void> {
  const isLink = info.menuItemId === LINK_ITEM_ID;
  const scope = isLink ? 'all' : scopeFromMenuItem(info.menuItemId);
  if (!scope) return;
  const selection = (isLink ? info.linkUrl : info.selectionText) ?? '';
  const target =
    tab?.id === undefined || tab.id < 0 ? undefined : { tabId: tab.id, frameId: info.frameId ?? 0 };
  await handleLookupRequest({ target, selection, scope }, deps);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void onMenuClick(info, tab).catch(report);
});

async function lookupFromShortcut(tabId: number, scope: ProviderScope): Promise<void> {
  const selection = await readSelection(tabId);
  if (!selection) {
    // The page can't be scripted, so its selection is unreadable; the context menu still works there.
    await presentInWindow({
      kind: 'notice',
      title: 'Can’t read this page',
      text: 'The browser doesn’t let extensions read selections here. Right-click the selection and use the 4NTL menu instead.',
    });
    return;
  }
  if (!selection.text) {
    await presentInPage(selection, NO_INDICATOR_NOTICE);
    return;
  }
  await handleLookupRequest({ target: selection, selection: selection.text, scope }, deps);
}

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'lookup-selection' || tab?.id === undefined) return;
  void lookupFromShortcut(tab.id, 'all').catch(report);
});

chrome.action.onClicked.addListener(() => {
  void openOptions().catch(report);
});

chrome.runtime.onMessage.addListener(
  createMessageRouter({ extensionId: chrome.runtime.id, service, openOptions }),
);

chrome.storage.onChanged.addListener((changes, area) => {
  const change = changes[SETTINGS_KEY];
  if (area !== 'local' || !change) return;
  const after = normalizeSettings(change.newValue);
  // New keys or report window: cached results are stale. (A theme change isn't.)
  if (affectsResults(normalizeSettings(change.oldValue), after)) void cache.clear().catch(report);
  void refreshBadge(after).catch(report);
});

if (__E2E__) {
  // Test-only hooks (compiled out of release builds): browser UI such as the
  // context menu can't be clicked from automation, so tests enter here instead.
  const tabFor = async (tab: string | number): Promise<chrome.tabs.Tab> => {
    const [match] =
      typeof tab === 'number'
        ? [await chrome.tabs.get(tab)]
        : await chrome.tabs.query({ url: tab });
    if (match?.id === undefined) throw new Error(`no tab matches ${String(tab)}`);
    return match;
  };
  Object.assign(globalThis, {
    __4ntl: {
      async simulateMenuClick(tab: string | number, selection: string, scope: ProviderScope) {
        await onMenuClick(
          { menuItemId: menuItemId(scope), selectionText: selection },
          await tabFor(tab),
        );
      },
      async simulateLinkClick(tab: string | number, linkUrl: string) {
        await onMenuClick({ menuItemId: LINK_ITEM_ID, linkUrl }, await tabFor(tab));
      },
      async simulateShortcut(tab: string | number) {
        await lookupFromShortcut(await tabFor(tab).then((t) => t.id ?? -1), 'all');
      },
    },
  });
}
