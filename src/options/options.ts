/** Settings page. Changes save automatically; provider key fields are generated from the registry. */
import { REPORT_CACHE, TtlCache } from '../core/cache';
import { toFailure } from '../core/errors';
import ExtPay from 'extpay';
import { describeAccess, EXTPAY_ID, PAID_FROM_LABEL, type Access } from '../core/license';
import type { BackgroundMessage, CardView, LicenseResponse } from '../core/messages';
import { PROVIDER_IDS, type ProviderId } from '../core/provider-ids';
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

/** Sample results for the live preview: nothing is looked up. */
const PREVIEW_VIEW: CardView = {
  kind: 'lookup',
  indicator: { type: 'ipv4', value: '185.220.101.4' },
  providers: PROVIDER_LIST.map(toInfo),
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
  const fields = {} as Record<ProviderId, KeyField>;
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), SAVE_DELAY_MS);
  };
  for (const provider of PROVIDER_LIST) {
    const { element, field } = renderKeyField(provider, scheduleSave);
    fields[provider.id] = field;
    byId('providers').append(element);
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
        apiKeys: Object.fromEntries(PROVIDER_IDS.map((id) => [id, fields[id].input.value])),
        abuseIpdbMaxAgeDays: maxAge.value,
        cacheTtlMinutes: cacheTtl.value,
        appearance,
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
