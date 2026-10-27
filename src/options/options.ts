/** Settings page. Changes save automatically; provider key fields are generated from the registry. */
import { REPORT_CACHE, TtlCache } from '../core/cache';
import { toFailure } from '../core/errors';
import { PROVIDER_IDS, type ProviderId } from '../core/provider-ids';
import { loadSettings, normalizeSettings, saveSettings, type Settings } from '../core/settings';
import { PROVIDER_LIST } from '../providers/registry';
import type { Provider } from '../providers/types';
import { h } from '../ui/dom';

const SAVE_DELAY_MS = 400;
const TOAST_MS = 1500;
const CHECK_TIMEOUT_MS = 15_000;

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

async function main(): Promise<void> {
  const maxAge = inputById('max-age');
  const cacheTtl = inputById('cache-ttl');
  const toast = byId('toast');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

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
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
  byId('version').textContent = chrome.runtime.getManifest().version;
}

void main().catch((error: unknown) => {
  console.error('[4NTL] settings page failed to start', error);
});
