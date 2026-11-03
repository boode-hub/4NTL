/**
 * Right-click menu: a single "4NTL" entry. Inside it: on a selection, "Look up “…”"
 * plus one entry per provider; on a link, "Check this link"; anywhere else
 * (buttons, cards, images, text fields), "Check what’s here". On the toolbar
 * icon, "Saved list".
 */
import { isProviderId } from '../core/provider-ids';
import { PROVIDER_LIST } from '../providers/registry';
import type { ProviderScope } from './view';

const ROOT_ID = '4ntl';
const ITEM_PREFIX = '4ntl:lookup:';
export const LINK_ITEM_ID = '4ntl:link';
export const ELEMENT_ITEM_ID = '4ntl:element';
export const LIST_ITEM_ID = '4ntl:saved-list';

export function menuItemId(scope: ProviderScope): string {
  return ITEM_PREFIX + scope;
}

export function scopeFromMenuItem(id: string | number): ProviderScope | undefined {
  if (typeof id !== 'string' || !id.startsWith(ITEM_PREFIX)) return undefined;
  const scope = id.slice(ITEM_PREFIX.length);
  return scope === 'all' || isProviderId(scope) ? scope : undefined;
}

function create(properties: chrome.contextMenus.CreateProperties): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.contextMenus.create(properties, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

/** Everything except a selection or a link: the page, images, frames, media, text fields. */
const ELEMENT_CONTEXTS: [
  `${chrome.contextMenus.ContextType}`,
  ...`${chrome.contextMenus.ContextType}`[],
] = ['page', 'image', 'frame', 'video', 'audio', 'editable'];

/** Idempotent: safe to call on every install/update. */
export async function registerMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  // One entry, "4NTL", wherever you right-click; what's inside depends on what you clicked.
  await create({
    id: ROOT_ID,
    title: '4NTL',
    contexts: ['selection', 'link', ...ELEMENT_CONTEXTS],
  });
  const selection: ['selection'] = ['selection'];
  await create({
    id: menuItemId('all'),
    parentId: ROOT_ID,
    title: 'Look up “%s”',
    contexts: selection,
  });
  await create({
    id: `${ROOT_ID}:separator`,
    parentId: ROOT_ID,
    type: 'separator',
    contexts: selection,
  });
  for (const provider of PROVIDER_LIST) {
    await create({
      id: menuItemId(provider.id),
      parentId: ROOT_ID,
      title: `${provider.name} only`,
      contexts: selection,
    });
  }
  await create({
    id: LINK_ITEM_ID,
    parentId: ROOT_ID,
    title: 'Check this link',
    contexts: ['link'],
  });
  await create({
    id: ELEMENT_ITEM_ID,
    parentId: ROOT_ID,
    title: 'Check what’s here',
    contexts: ELEMENT_CONTEXTS,
  });
  // Right-click the toolbar icon.
  await create({ id: LIST_ITEM_ID, title: 'Saved list', contexts: ['action'] });
}
