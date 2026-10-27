/**
 * Service-worker entry point: only wiring. All listeners are registered
 * synchronously at top level, as MV3 requires for events to wake the worker.
 * The worker holds no timers or long-lived state, so the browser can (and
 * does) shut it down whenever it's idle.
 */
import { REPORT_CACHE, TtlCache } from '../core/cache';
import type { Report } from '../core/result';
import { loadSettings, SETTINGS_KEY, hasAnyApiKey } from '../core/settings';
import { refreshBadge } from './badge';
import { handleLookupRequest, type ControllerDeps } from './controller';
import { LookupService } from './lookup-service';
import { registerMenus, scopeFromMenuItem } from './menus';
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const scope = scopeFromMenuItem(info.menuItemId);
  if (!scope) return;
  const target =
    tab?.id === undefined || tab.id < 0 ? undefined : { tabId: tab.id, frameId: info.frameId ?? 0 };
  void handleLookupRequest({ target, selection: info.selectionText ?? '', scope }, deps).catch(
    report,
  );
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
  if (area !== 'local' || !(SETTINGS_KEY in changes)) return;
  // New keys or options may change results: start fresh.
  void cache.clear().catch(report);
  void loadSettings().then(refreshBadge).catch(report);
});

if (__E2E__) {
  // Test-only hooks (compiled out of release builds): browser UI such as the
  // context menu can't be clicked from automation, so tests enter here instead.
  const tabIdFor = async (tab: string | number) => {
    if (typeof tab === 'number') return tab;
    const [match] = await chrome.tabs.query({ url: tab });
    if (match?.id === undefined) throw new Error(`no tab matches ${tab}`);
    return match.id;
  };
  Object.assign(globalThis, {
    __4ntl: {
      async simulateMenuClick(tab: string | number, selection: string, scope: ProviderScope) {
        const target = { tabId: await tabIdFor(tab), frameId: 0 };
        return handleLookupRequest({ target, selection, scope }, deps);
      },
      async simulateShortcut(tab: string | number) {
        await lookupFromShortcut(await tabIdFor(tab), 'all');
      },
    },
  });
}
