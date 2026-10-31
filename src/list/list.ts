/** Saved list page: review, filter, export and prune the indicators saved from cards. */
import { formatAgo } from '../core/format';
import { INDICATOR_LABELS } from '../core/indicator';
import { VERDICT_LABELS } from '../core/result';
import {
  clearList,
  loadList,
  removeFromList,
  SAVED_LIST_KEY,
  toCsv,
  type SavedEntry,
} from '../core/saved-list';
import { loadSettings } from '../core/settings';
import { h } from '../ui/dom';
import { ensureFlagFont } from '../ui/flags';

const TOAST_MS = 1500;

const FILTERS: Readonly<Record<string, (e: SavedEntry) => boolean>> = {
  all: () => true,
  ip: (e) => e.type === 'ipv4' || e.type === 'ipv6',
  domain: (e) => e.type === 'domain',
  url: (e) => e.type === 'url',
  hash: (e) => e.type === 'md5' || e.type === 'sha1' || e.type === 'sha256',
  malicious: (e) => e.verdict === 'malicious' || e.verdict === 'suspicious',
};

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from list.html`);
  return element;
}

async function main(): Promise<void> {
  ensureFlagFont();
  const { appearance } = await loadSettings();
  document.documentElement.dataset.theme = appearance.theme;
  if (appearance.accent) document.documentElement.style.setProperty('--accent', appearance.accent);

  const filter = byId('filter') as HTMLSelectElement;
  const rows = byId('rows');
  const toast = byId('toast');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let list: SavedEntry[] = [];

  const notify = (text: string) => {
    toast.textContent = text;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, TOAST_MS);
  };
  const visible = () => list.filter(FILTERS[filter.value] ?? (() => true));

  const render = () => {
    const shown = visible();
    const now = Date.now();
    rows.replaceChildren(
      ...shown.map((entry) =>
        h(
          'tr',
          {},
          h('td', { class: 'ioc' }, entry.value),
          h('td', {}, INDICATOR_LABELS[entry.type]),
          h(
            'td',
            {},
            entry.verdict &&
              h('span', { class: `verdict ${entry.verdict}` }, VERDICT_LABELS[entry.verdict]),
          ),
          h('td', { class: 'country' }, entry.country),
          h('td', { class: 'summary' }, entry.summary),
          h(
            'td',
            { attrs: { title: new Date(entry.savedAt).toLocaleString() } },
            formatAgo(entry.savedAt, now),
          ),
          h(
            'td',
            {},
            h(
              'button',
              {
                class: 'remove',
                attrs: { type: 'button', title: 'Remove', 'aria-label': `Remove ${entry.value}` },
                on: {
                  click: () => {
                    void removeFromList(entry.value).then(show);
                  },
                },
              },
              '×',
            ),
          ),
        ),
      ),
    );
    byId('count').textContent =
      shown.length === list.length ? `${list.length} saved` : `${shown.length} of ${list.length}`;
    byId('empty').hidden = list.length > 0;
  };
  const show = (next: SavedEntry[]) => {
    list = next;
    render();
  };

  filter.addEventListener('change', render);
  byId('copy').addEventListener('click', () => {
    const values = visible().map((e) => e.value);
    if (values.length === 0) return;
    void navigator.clipboard.writeText(values.join('\n')).then(
      () => {
        notify(`Copied ${values.length}`);
      },
      () => {
        notify('Copy failed');
      },
    );
  });
  byId('csv').addEventListener('click', () => {
    const entries = visible();
    if (entries.length === 0) return;
    const url = URL.createObjectURL(new Blob([toCsv(entries)], { type: 'text/csv' }));
    const stamp = new Date().toISOString().slice(0, 10);
    const link = h('a', { attrs: { href: url, download: `4ntl-saved-${stamp}.csv` } });
    document.body.append(link); // Firefox ignores clicks on detached links
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);
  });
  byId('clear').addEventListener('click', () => {
    if (list.length > 0 && confirm(`Remove all ${list.length} saved indicators?`)) {
      void clearList().then(show);
    }
  });
  // Saves from cards in other tabs show up live.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && SAVED_LIST_KEY in changes) void loadList().then(show);
  });

  show(await loadList());
}

void main().catch((error: unknown) => {
  console.error('[4NTL] saved list failed to start', error);
});
