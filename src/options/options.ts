/** Settings page. Changes save automatically; provider key fields are generated from the registry. */
import { REPORT_CACHE, TtlCache } from '../core/cache';
import { toFailure } from '../core/errors';
import ExtPay from 'extpay';
import { describeAccess, EXTPAY_ID, PAID_FROM_LABEL, type Access } from '../core/license';
import type { BackgroundMessage, CardView, LicenseResponse } from '../core/messages';
import { PROVIDER_IDS, type ProviderId } from '../core/provider-ids';
import { LIBRARY_META_KEY, LIBRARY_SOURCES, type LibraryStatus } from '../background/library-store';
import type { Report } from '../core/result';
import {
  loadSettings,
  normalizeAppearance,
  normalizeSettings,
  saveSettings,
  type Appearance,
  type Settings,
  type Theme,
} from '../core/settings';
import { PROVIDER_LIST, toInfo } from '../providers/registry';
import type { Provider } from '../providers/types';
import { ResultCard } from '../ui/card';
import { h } from '../ui/dom';
import { THEME_ACCENTS, THEME_BACKGROUNDS } from '../ui/styles';

const SAVE_DELAY_MS = 400;
const TOAST_MS = 1500;
const CHECK_TIMEOUT_MS = 15_000;
const PREVIEW_DELAY_MS = 900;

type Tone = 'ok' | 'warn' | 'error' | '';

interface KeyField {
  readonly input: HTMLInputElement;
  readonly status: HTMLElement;
}

function keyFormatWarning(provider: Provider, key: string): string {
  return key && !provider.apiKeyPattern.test(key)
    ? `This doesn't look like a ${provider.name} key. Check for missing or extra characters.`
    : '';
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from options.html`);
  return element;
}

function inputById(id: string): HTMLInputElement {
  const element = byId(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`#${id} is not an <input>`);
  return element;
}

function setStatus(element: HTMLElement, text: string, tone: Tone = ''): void {
  element.textContent = text;
  element.className = tone ? `status ${tone}` : 'status';
}

async function checkKey(
  provider: Provider,
  field: KeyField,
  button: HTMLButtonElement,
): Promise<void> {
  const apiKey = field.input.value.trim();
  if (!apiKey) {
    setStatus(field.status, 'Paste a key first.', 'warn');
    return;
  }
  button.disabled = true;
  setStatus(field.status, 'Checking…');
  try {
    // Sites granted with a switch: the browser blocks them until allowed, so ask now
    // (this click counts as the user's go-ahead) instead of failing as if offline.
    if (provider.hosts) {
      // request() first, straight from the click: Firefox refuses it after an await.
      // (Already allowed: it resolves at once, with no prompt.)
      if (!(await chrome.permissions.request({ origins: [...provider.hosts] }))) {
        setStatus(field.status, `Not allowed: 4NTL can’t contact ${provider.name}.`, 'error');
        return;
      }
    }
    const message = await provider.checkKey({
      apiKey,
      fetch: (input, init) => fetch(input, init),
      timeoutMs: CHECK_TIMEOUT_MS,
      now: Date.now,
    });
    setStatus(field.status, message, 'ok');
  } catch (error) {
    setStatus(field.status, toFailure(error).message, 'error');
  } finally {
    button.disabled = false;
  }
}

function renderKeyField(
  provider: Provider,
  onEdit: () => void,
): { element: HTMLElement; field: KeyField } {
  const id = `key-${provider.id}`;
  const status = h('small', { class: 'status', attrs: { id: `${id}-status`, role: 'status' } });
  const input = h('input', {
    class: 'key',
    attrs: {
      id,
      type: 'password',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: `Paste your ${provider.name} API key`,
      'aria-describedby': status.id,
    },
  });
  const field: KeyField = { input, status };
  input.addEventListener('input', () => {
    setStatus(status, keyFormatWarning(provider, input.value.trim()), 'warn');
    onEdit();
  });

  const reveal = h(
    'button',
    { class: 'btn', attrs: { type: 'button', 'aria-pressed': 'false' } },
    'Show',
  );
  reveal.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    reveal.textContent = show ? 'Hide' : 'Show';
    reveal.setAttribute('aria-pressed', String(show));
  });

  const test = h(
    'button',
    { class: 'btn', attrs: { type: 'button', 'data-test': provider.id } },
    'Test',
  );
  test.addEventListener('click', () => void checkKey(provider, field, test));

  const element = h(
    'div',
    { class: 'field' },
    h(
      'div',
      { class: 'field-head' },
      h('label', { attrs: { for: id } }, provider.name),
      h(
        'a',
        { attrs: { href: provider.apiKeyUrl, target: '_blank', rel: 'noopener noreferrer' } },
        'Get a free key ↗',
      ),
    ),
    h('div', { class: 'input-row' }, input, reveal, test),
    status,
  );
  return { element, field };
}

/** Sample results for the live preview: nothing is looked up (EchoTrail doesn't check IPs). */
const PREVIEW_VIEW: CardView = {
  kind: 'lookup',
  indicator: { type: 'ipv4', value: '185.220.101.4' },
  providers: PROVIDER_LIST.filter((provider) => provider.supports.has('ipv4')).map(toInfo),
};

const PREVIEW_REPORTS: Record<ProviderId, Report> = {
  abuseipdb: {
    verdict: 'malicious',
    headline: '100%',
    caption: 'abuse confidence',
    score: 1,
    tags: ['Tor exit node'],
    facts: [
      { label: 'Reports (90 d)', value: '1,243 from 312 users' },
      { label: 'ISP', value: 'Zwiebelfreunde e.V.' },
      { label: 'Country', value: '🇩🇪 Germany (DE)' },
    ],
    reportUrl: 'https://www.abuseipdb.com/check/185.220.101.4',
  },
  virustotal: {
    verdict: 'malicious',
    headline: '14 / 94',
    caption: 'security vendors flagged it as malicious',
    tags: ['2 suspicious'],
    facts: [{ label: 'Owner', value: 'Zwiebelfreunde e.V. · AS208294' }],
    reportUrl: 'https://www.virustotal.com/gui/ip-address/185.220.101.4',
  },
  library: {
    verdict: 'unknown',
    pill: 'LOLBin',
    headline: '6',
    caption: 'abuse techniques on LOLBAS',
    tags: [],
    facts: [],
    reportUrl: '',
  },
  echotrail: {
    verdict: 'unknown',
    pill: 'Known',
    headline: '82%',
    caption: 'of runs started by explorer.exe',
    tags: ['Productivity'],
    facts: [{ label: 'Publisher', value: 'Simon Tatham' }],
    reportUrl: 'https://echotrail.io/insights/putty.exe/',
  },
};

/** The theme's own accent, as the color picker should show it. */
function themeAccent(theme: Theme): string {
  if (theme !== 'auto') return THEME_ACCENTS[theme];
  return matchMedia('(prefers-color-scheme: dark)').matches
    ? THEME_ACCENTS.dark
    : THEME_ACCENTS.light;
}

/** The theme's own card background, as the color picker should show it. */
function themeBackground(theme: Theme): string {
  if (theme !== 'auto') return THEME_BACKGROUNDS[theme];
  return matchMedia('(prefers-color-scheme: dark)').matches
    ? THEME_BACKGROUNDS.dark
    : THEME_BACKGROUNDS.light;
}

function applyToPage({ theme, accent }: Appearance): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (accent) root.style.setProperty('--accent', accent);
  else root.style.removeProperty('--accent');
}

/** Live preview: the real card with sample results (delayed to show the loading state). */
function createPreview(container: HTMLElement): (appearance: Appearance, delayMs: number) => void {
  let current: ResultCard | undefined;
  const render = (appearance: Appearance, delayMs: number) => {
    const previous = current;
    current = undefined;
    previous?.close();
    const card: ResultCard = new ResultCard({
      placement: { mode: 'inline', container, fill: false },
      appearance,
      client: {
        lookup: (provider) =>
          new Promise((resolve) =>
            setTimeout(() => {
              resolve({ ok: true, report: PREVIEW_REPORTS[provider], fetchedAt: 0, cached: false });
            }, delayMs),
          ),
        openOptions: () => undefined,
        save: () => Promise.resolve(),
        openList: () => undefined,
        unlock: () => undefined,
        restore: () => undefined,
      },
      // Closing the preview (× or Esc) just brings it back.
      onClose: () => {
        if (current === card) render(appearance, 0);
      },
    });
    current = card;
    card.show(PREVIEW_VIEW);
  };
  return render;
}

/** Store edition: the license panel (status, unlock, restore). */
function startLicensePanel(): void {
  byId('license-panel').hidden = false;
  const status = byId('license-status');
  const unlock = byId('unlock');
  const extpay = ExtPay(EXTPAY_ID);
  const send = (message: BackgroundMessage) => chrome.runtime.sendMessage(message);
  const open = (page: 'unlock' | 'restore') => {
    const opening = page === 'unlock' ? extpay.openPaymentPage() : extpay.openLoginPage();
    opening.catch(() => {
      status.textContent = 'Couldn’t reach the payment page. Check your connection and try again.';
    });
  };
  const show = (access: Access) => {
    const paid = access.status === 'paid';
    const early = access.status === 'early';
    status.textContent = paid
      ? 'Unlocked for life. Thank you for supporting 4NTL!'
      : early
        ? `You installed 4NTL before ${PAID_FROM_LABEL}, so it's free for you, for life. Thank you for being early!`
        : describeAccess(access, Date.now());
    // Paid and early users have nothing to unlock; the Support panel below is for everyone.
    unlock.hidden = paid || early;
    byId('restore').hidden = paid || early;
  };
  const check = async (refresh: boolean) => {
    const response = (await send({ type: '4ntl:license', refresh })) as LicenseResponse | undefined;
    if (response) show(response.access);
  };
  unlock.addEventListener('click', () => {
    open('unlock');
  });
  byId('restore').addEventListener('click', () => {
    open('restore');
  });
  byId('refresh-license').addEventListener('click', () => void check(true));
  // Back from the checkout tab: see whether the purchase went through.
  window.addEventListener('focus', () => void check(true));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'license.v1' in changes) void check(false);
  });
  void check(false);
  // Sent here by the card's Unlock / Restore purchase buttons.
  const action = location.hash.slice(1);
  if (action === 'unlock' || action === 'restore') {
    history.replaceState(null, '', location.pathname);
    byId('license-panel').scrollIntoView({ block: 'center' });
    open(action);
  }
}

async function main(): Promise<void> {
  if (__STORE__) startLicensePanel();
  const maxAge = inputById('max-age');
  const cacheTtl = inputById('cache-ttl');
  const toast = byId('toast');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const accentInput = inputById('accent');
  const backgroundInput = inputById('background');
  const themeInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="theme"]')];
  const renderPreview = createPreview(byId('preview'));
  const fields: Partial<Record<ProviderId, KeyField>> = {};
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), SAVE_DELAY_MS);
  };
  // EchoTrail's key lives in the Windows processes panel; the local library needs none.
  const processesOn = inputById('processes-on');
  const processesDetails = byId('processes-details');
  for (const provider of PROVIDER_LIST) {
    if (provider.keyless) continue;
    const { element, field } = renderKeyField(provider, scheduleSave);
    fields[provider.id] = field;
    (provider.id === 'echotrail' ? byId('echotrail-key') : byId('providers')).append(element);
  }

  const showNumbers = (settings: Settings) => {
    maxAge.value = String(settings.abuseIpdbMaxAgeDays);
    cacheTtl.value = String(settings.cacheTtlMinutes);
  };

  async function save(): Promise<Settings> {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    const saved = await saveSettings(
      normalizeSettings({
        apiKeys: Object.fromEntries(PROVIDER_IDS.map((id) => [id, fields[id]?.input.value ?? ''])),
        abuseIpdbMaxAgeDays: maxAge.value,
        cacheTtlMinutes: cacheTtl.value,
        appearance,
        processes: processesOn.checked,
      }),
    );
    toast.textContent = 'Saved';
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, TOAST_MS);
    return saved;
  }

  const settings = await loadSettings();
  for (const provider of PROVIDER_LIST) {
    const field = fields[provider.id];
    if (!field) continue;
    field.input.value = settings.apiKeys[provider.id];
    setStatus(field.status, keyFormatWarning(provider, field.input.value), 'warn');
  }
  showNumbers(settings);

  let appearance = settings.appearance;
  const showAppearance = (delayMs: number) => {
    for (const input of themeInputs) input.checked = input.value === appearance.theme;
    accentInput.value = appearance.accent || themeAccent(appearance.theme);
    backgroundInput.value = appearance.background || themeBackground(appearance.theme);
    applyToPage(appearance);
    renderPreview(appearance, delayMs);
  };
  const setAppearance = (next: Partial<Appearance>, delayMs: number) => {
    appearance = normalizeAppearance({ ...appearance, ...next });
    showAppearance(delayMs);
    scheduleSave();
  };
  showAppearance(PREVIEW_DELAY_MS);
  for (const input of themeInputs) {
    input.addEventListener('change', () => {
      setAppearance({ theme: input.value as Theme }, PREVIEW_DELAY_MS);
    });
  }
  accentInput.addEventListener('input', () => {
    setAppearance({ accent: accentInput.value }, 0);
  });
  byId('accent-reset').addEventListener('click', () => {
    setAppearance({ accent: '' }, 0);
  });
  backgroundInput.addEventListener('input', () => {
    setAppearance({ background: backgroundInput.value }, 0);
  });
  byId('background-reset').addEventListener('click', () => {
    setAppearance({ background: '' }, 0);
  });

  for (const input of [maxAge, cacheTtl]) {
    input.addEventListener('input', scheduleSave);
    // On commit, show the value as actually saved (clamped to the allowed range).
    input.addEventListener('change', () => void save().then(showNumbers));
  }
  // Don't lose an edit made just before closing the tab.
  window.addEventListener('pagehide', () => {
    if (saveTimer !== undefined) void save();
  });

  // Windows processes: off unless switched on; switching on asks the browser for the
  // sources' sites (EchoTrail and the library's), and the background downloads the library.
  const processesStatus = byId('processes-status');
  const processHosts = {
    origins:
      (chrome.runtime.getManifest() as chrome.runtime.ManifestV3).optional_host_permissions?.filter(
        (origin) => origin !== '<all_urls>',
      ) ?? [],
  };
  const showProcesses = (on: boolean) => {
    processesOn.checked = on;
    processesDetails.hidden = !on;
  };
  showProcesses(settings.processes);
  // On, but the browser isn't allowing the sites (never granted, withdrawn, or held
  // back by the browser's site-access setting): offer Allow right here.
  const processesAccess = byId('processes-access');
  const checkProcessAccess = async () => {
    processesAccess.hidden =
      !processesOn.checked || (await chrome.permissions.contains(processHosts));
  };
  byId('processes-allow').addEventListener('click', () => {
    void chrome.permissions
      .request(processHosts)
      .then(async (granted) => {
        await checkProcessAccess();
        if (granted)
          await chrome.runtime.sendMessage({
            type: '4ntl:library-update',
          } satisfies BackgroundMessage);
      })
      .catch((error: unknown) => {
        setStatus(processesStatus, String(error), 'error');
      });
  });
  await checkProcessAccess();
  processesOn.addEventListener('change', () => {
    setStatus(processesStatus, '');
    if (!processesOn.checked) {
      // Off always works: save first (the library is deleted); giving permissions back is best effort.
      showProcesses(false);
      void save();
      chrome.permissions.remove(processHosts).catch(() => undefined);
      return;
    }
    void chrome.permissions
      .request(processHosts)
      .then(async (granted) => {
        showProcesses(granted);
        if (!granted) setStatus(processesStatus, 'Not allowed, so this stays off.', 'warn');
        else showLibrary({}, 'Downloading the local library…');
        await checkProcessAccess();
        return save();
      })
      .catch((error: unknown) => {
        showProcesses(false);
        setStatus(processesStatus, String(error), 'error');
        return save();
      });
  });

  // The local library: what's downloaded, and "Update now".
  const libraryStatus = byId('library-status');
  const libraryUpdateStatus = byId('library-update-status');
  const showLibrary = (status: LibraryStatus, pending = '') => {
    const parts = LIBRARY_SOURCES.flatMap(({ id, name }) => {
      const source = status[id];
      if (!source?.updatedAt)
        return source?.error ? [`${name}: not downloaded (${source.error})`] : [];
      return [
        `${name} ${source.names.toLocaleString()}${source.error ? ' (last check failed)' : ''}`,
      ];
    });
    const checked = Math.max(0, ...LIBRARY_SOURCES.map(({ id }) => status[id]?.checkedAt ?? 0));
    libraryStatus.textContent =
      pending ||
      (parts.length > 0
        ? `${parts.join(' · ')} · checked ${new Date(checked).toLocaleString()}`
        : 'Not downloaded yet: press Update now.');
  };
  const readLibrary = async () =>
    ((await chrome.storage.local.get(LIBRARY_META_KEY))[LIBRARY_META_KEY] ?? {}) as LibraryStatus;
  showLibrary(await readLibrary());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && LIBRARY_META_KEY in changes)
      void readLibrary().then((s) => {
        showLibrary(s);
      });
  });
  const update = byId('library-update') as HTMLButtonElement;
  update.addEventListener('click', () => {
    update.disabled = true;
    setStatus(libraryUpdateStatus, 'Checking for updates…');
    // The library's sites must be allowed first (this click counts as the go-ahead).
    void chrome.permissions
      .request(processHosts)
      .then(async (granted) => {
        await checkProcessAccess();
        if (!granted) throw new Error('Not allowed to contact the library’s sites.');
        const response: unknown = await chrome.runtime.sendMessage({
          type: '4ntl:library-update',
        } satisfies BackgroundMessage);
        return response;
      })
      .then((response: unknown) => {
        const status = (response as { status?: LibraryStatus } | undefined)?.status ?? {};
        const failed = LIBRARY_SOURCES.filter(({ id }) => status[id]?.error).map((s) => s.name);
        setStatus(
          libraryUpdateStatus,
          failed.length > 0 ? `Couldn't reach ${failed.join(', ')}.` : 'Up to date.',
          failed.length > 0 ? 'warn' : 'ok',
        );
      })
      .catch((error: unknown) => {
        setStatus(libraryUpdateStatus, String(error), 'error');
      })
      .finally(() => {
        update.disabled = false;
      });
  });

  // "Work inside embedded frames": the optional all-sites permission.
  const allFrames = inputById('all-frames');
  const allFramesStatus = byId('all-frames-status');
  const everywhere = { origins: ['<all_urls>'] };
  allFrames.checked = await chrome.permissions.contains(everywhere);
  allFrames.addEventListener('change', () => {
    const want = allFrames.checked;
    void (want ? chrome.permissions.request(everywhere) : chrome.permissions.remove(everywhere))
      .then((changed) => {
        allFrames.checked = want === changed ? want : !want;
        setStatus(
          allFramesStatus,
          want && !changed ? 'Not allowed. 4NTL keeps working on the page itself.' : '',
          'warn',
        );
      })
      .catch((error: unknown) => {
        allFrames.checked = !want;
        setStatus(allFramesStatus, String(error), 'error');
      });
  });

  const cacheStatus = byId('cache-status');
  byId('clear-cache').addEventListener('click', () => {
    void new TtlCache(chrome.storage.session, REPORT_CACHE)
      .clear()
      .then(() => {
        setStatus(cacheStatus, 'Cached results cleared.', 'ok');
      })
      .catch((error: unknown) => {
        setStatus(cacheStatus, String(error), 'error');
      });
  });

  const command = (await chrome.commands.getAll()).find((c) => c.name === 'lookup-selection');
  byId('shortcut').textContent = command?.shortcut || 'not set';
  byId('change-shortcut').addEventListener('click', () => {
    // Firefox has its own shortcut page (and no chrome:// URLs); Chromium browsers map this one.
    const commands = chrome.commands as { openShortcutSettings?: () => Promise<void> };
    if (commands.openShortcutSettings) void commands.openShortcutSettings();
    else void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  // Firefox lets users withdraw the API hosts' permission; offer it back.
  const manifest = chrome.runtime.getManifest() as chrome.runtime.ManifestV3;
  const origins: string[] = manifest.host_permissions ?? [];
  const hostAccess = byId('host-access');
  const checkAccess = async () => {
    hostAccess.hidden = await chrome.permissions.contains({ origins });
  };
  byId('grant-access').addEventListener('click', () => {
    void chrome.permissions.request({ origins }).then(checkAccess);
  });
  await checkAccess();
  byId('version').textContent = chrome.runtime.getManifest().version;
}

void main().catch((error: unknown) => {
  console.error('[4NTL] settings page failed to start', error);
});
