/** Toolbar badge: a "!" until at least one API key is configured. */
import { hasAnyApiKey, type Settings } from '../core/settings';

export async function refreshBadge(settings: Settings): Promise<void> {
  const ready = hasAnyApiKey(settings);
  await Promise.all([
    chrome.action.setBadgeText({ text: ready ? '' : '!' }),
    chrome.action.setBadgeBackgroundColor({ color: '#d97706' }),
    chrome.action.setTitle({
      title: ready ? '4NTL – settings' : '4NTL – add your API keys to get started',
    }),
  ]);
}
