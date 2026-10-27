/**
 * Right-click menus: on a selection, "4NTL: look up “…”" ▸ one entry per provider
 * plus "All providers"; on a link, "4NTL: check this link" (every provider that
 * takes URLs).
 */
import { isProviderId } from '../core/provider-ids';
import { PROVIDER_LIST } from '../providers/registry';
import type { ProviderScope } from './view';

const ROOT_ID = '4ntl';
const ITEM_PREFIX = '4ntl:lookup:';
export const LINK_ITEM_ID = '4ntl:link';

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

/** Idempotent: safe to call on every install/update. */
export async function registerMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  const contexts: ['selection'] = ['selection'];
  await create({ id: ROOT_ID, title: '4NTL: look up “%s”', contexts });
  for (const provider of PROVIDER_LIST) {
    await create({
      id: menuItemId(provider.id),
      parentId: ROOT_ID,
      title: provider.name,
      contexts,
    });
  }
  await create({ id: `${ROOT_ID}:separator`, parentId: ROOT_ID, type: 'separator', contexts });
  await create({ id: menuItemId('all'), parentId: ROOT_ID, title: 'All providers', contexts });
  await create({ id: LINK_ITEM_ID, title: '4NTL: check this link', contexts: ['link'] });
}
