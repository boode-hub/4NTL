/**
 * Service-worker entry point: only wiring. All listeners are registered
 * synchronously at top level, as MV3 requires for events to wake the worker.
 * The worker holds no timers or long-lived state, so the browser can (and
 * does) shut it down whenever it's idle.
 */
import ExtPay from 'extpay';
import { REPORT_CACHE, TtlCache } from '../core/cache';
import { INDICATOR_LABELS, parseIndicator, resolveSelection } from '../core/indicator';
import { EXTPAY_ID, type Access } from '../core/license';
import type { CardView } from '../core/messages';
import type { Report } from '../core/result';
import {
  affectsResults,
  hasAnyApiKey,
  loadSettings,
  normalizeSettings,
  SETTINGS_KEY,
} from '../core/settings';
import { refreshBadge } from './badge';
import { handleLookupRequest, presentView, type ControllerDeps } from './controller';
import { checkCaptured, checkLink, type LinkDeps } from './links';
import { LookupService } from './lookup-service';
import { Payments } from './payments';
import {
  ELEMENT_ITEM_ID,
  LINK_ITEM_ID,
  LIST_ITEM_ID,
  menuItemId,
  registerMenus,
  scopeFromMenuItem,
} from './menus';
import {
  captureInPage,
  inspectInPage,
  presentInPage,
  presentInWindow,
  type FrameTarget,
} from './present';
import { createMessageRouter } from './router';
import { readSelection } from './selection';
import {
  buildView,
  NO_INDICATOR_NOTICE,
  NOT_A_WEB_PAGE_NOTICE,
  viewForIndicators,
  type ProviderScope,
} from './view';

const cache = new TtlCache<Report>(chrome.storage.session, REPORT_CACHE);

const service = new LookupService({
  cache,
  loadSettings: () => loadSettings(),
  // Resolved at call time, so tests can substitute the global fetch.
  fetch: (input, init) => fetch(input, init),
});

/** e2e builds can move the clock (to test the paid period); otherwise always 0. */
let clockOffset = 0;
const now = () => Date.now() + clockOffset;

/** Store edition only. In the GitHub edition the build swaps 'extpay' for a stub that is never called. */
function startPayments(): Payments {
  const extpay = ExtPay(EXTPAY_ID);
  extpay.startBackground(); // must run once, at top level
  const payments = new Payments({
    extpay,
    area: chrome.storage.local,
    sync: chrome.storage.sync,
    now,
    builtAt: __BUILT_AT__,
  });
  extpay.onPaid.addListener(() => {
    void payments.markPaid().catch(report);
  });
  return payments;
}
const payments = __STORE__ ? startPayments() : undefined;
/**
 * Every edition records when it was first installed, so people who install the
 * free store version before the paid one exists keep their "early" (free for
 * life) status when the paid update arrives. No network involved.
 */
const installDate =
  payments ??
  new Payments({
    extpay: { getUser: () => Promise.resolve({ paid: false }) },
    area: chrome.storage.local,
    sync: chrome.storage.sync,
    now,
    builtAt: __BUILT_AT__,
  });
const OPEN: Access = { status: 'open' };
const license = {
  access: (refresh: boolean): Promise<Access> =>
    payments ? (refresh ? payments.refresh() : payments.access()) : Promise.resolve(OPEN),
  // The settings page opens the checkout (see payments.ts for why not the worker).
  unlock: () => openSettingsFor('unlock'),
  restore: () => openSettingsFor('restore'),
};

async function openSettingsFor(action: 'unlock' | 'restore'): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#${action}`) });
}

const deps: ControllerDeps = {
  service,
  presentInPage,
  presentInWindow,
  access: () => license.access(false),
  now,
};
const linkDeps: LinkDeps = {
  inspect: inspectInPage,
  capture: captureInPage,
  present: (view, target) => presentView(view, target, deps),
};
const openOptions = () => chrome.runtime.openOptionsPage();
const openList = async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL('list.html') });
};

function report(error: unknown) {
  console.error('[4NTL]', error);
}

function frameOf(tab: chrome.tabs.Tab | undefined, frameId = 0): FrameTarget | undefined {
  return tab?.id === undefined || tab.id < 0 ? undefined : { tabId: tab.id, frameId };
}

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    await installDate.remember();
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
  'menuItemId' | 'selectionText' | 'linkUrl' | 'pageUrl' | 'frameId'
>;

async function onMenuClick(info: MenuClick, tab: chrome.tabs.Tab | undefined): Promise<void> {
  const target = frameOf(tab, info.frameId);
  if (info.menuItemId === LIST_ITEM_ID) {
    await openList();
    return;
  }
  if (info.menuItemId === LINK_ITEM_ID || info.menuItemId === ELEMENT_ITEM_ID) {
    await checkLink({ target, linkUrl: info.linkUrl, pageUrl: info.pageUrl }, linkDeps);
    return;
  }
  const scope = scopeFromMenuItem(info.menuItemId);
  if (scope)
    await handleLookupRequest({ target, selection: info.selectionText ?? '', scope }, deps);
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

/** Toolbar icon: check the page you're on (or open settings until a key is set). */
async function onActionClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!hasAnyApiKey(await loadSettings())) {
    await openOptions();
    return;
  }
  const indicator = tab.url ? parseIndicator(tab.url) : null;
  const view =
    indicator?.type === 'url' ? viewForIndicators([indicator], 'all') : NOT_A_WEB_PAGE_NOTICE;
  await presentView(view, frameOf(tab), deps, true);
}

chrome.action.onClicked.addListener((tab) => {
  void onActionClick(tab).catch(report);
});

/** Omnibox descriptions are XML: user text must be escaped. */
function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function describeOmnibox(text: string): string {
  const resolution = resolveSelection(text);
  switch (resolution.kind) {
    case 'single':
      return `Look up <match>${xml(resolution.indicator.value)}</match> <dim>(${INDICATOR_LABELS[resolution.indicator.type]}) with 4NTL</dim>`;
    case 'multiple':
      return `Pick one of <match>${resolution.indicators.length}</match> indicators <dim>with 4NTL</dim>`;
    case 'none':
      return 'Paste an IP, hash, domain or link to look it up with 4NTL';
  }
}

/** Address bar: "4ntl <anything>" → card in the current tab (or a small window). */
async function lookupFromOmnibox(text: string): Promise<CardView> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const view = buildView(text, 'all');
  await presentView(view, frameOf(tab), deps, true);
  return view;
}

void chrome.omnibox.setDefaultSuggestion({ description: describeOmnibox('') });
chrome.omnibox.onInputChanged.addListener((text) => {
  void chrome.omnibox.setDefaultSuggestion({ description: describeOmnibox(text) });
});
chrome.omnibox.onInputEntered.addListener((text) => {
  void lookupFromOmnibox(text).catch(report);
});

chrome.runtime.onMessage.addListener(
  createMessageRouter({
    extensionId: chrome.runtime.id,
    service,
    openOptions,
    openList,
    license,
    onCaptured: async (url, sender) => {
      await checkCaptured(url, frameOf(sender.tab, sender.frameId), linkDeps.present);
    },
  }),
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
        const found = await tabFor(tab);
        await onMenuClick({ menuItemId: LINK_ITEM_ID, linkUrl, pageUrl: found.url ?? '' }, found);
      },
      async simulateElementClick(tab: string | number) {
        const found = await tabFor(tab);
        await onMenuClick({ menuItemId: ELEMENT_ITEM_ID, pageUrl: found.url ?? '' }, found);
      },
      async simulateShortcut(tab: string | number) {
        await lookupFromShortcut((await tabFor(tab)).id ?? -1, 'all');
      },
      async simulateActionClick(tab: string | number) {
        await onActionClick(await tabFor(tab));
      },
      simulateOmnibox: lookupFromOmnibox,
      setClock(ms: number) {
        clockOffset = ms - Date.now();
      },
      licenseAccess: () => license.access(false),
      describeOmnibox,
    },
  });
}
