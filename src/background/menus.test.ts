import { describe, expect, it, vi } from 'vitest';
import { menuItemId, registerMenus, scopeFromMenuItem } from './menus';

describe('menu ids', () => {
  it('round-trip scopes', () => {
    for (const scope of ['all', 'virustotal', 'abuseipdb'] as const) {
      expect(scopeFromMenuItem(menuItemId(scope))).toBe(scope);
    }
  });

  it.each([42, 'other', '4ntl:lookup:shodan', '4ntl'])('ignores %j', (id) => {
    expect(scopeFromMenuItem(id)).toBeUndefined();
  });
});

describe('registerMenus', () => {
  function stubChrome(lastError?: { message: string }) {
    const created: chrome.contextMenus.CreateProperties[] = [];
    const runtime = { lastError: undefined as { message: string } | undefined };
    vi.stubGlobal('chrome', {
      runtime,
      contextMenus: {
        removeAll: vi.fn(() => Promise.resolve()),
        create: vi.fn((props: chrome.contextMenus.CreateProperties, done: () => void) => {
          created.push(props);
          runtime.lastError = lastError;
          done();
          runtime.lastError = undefined;
        }),
      },
    });
    return created;
  }

  it('builds a selection submenu with one entry per provider plus "All providers"', async () => {
    const created = stubChrome();
    await registerMenus();
    expect(created.map((item) => [item.id, item.title, item.type ?? 'normal'])).toEqual([
      ['4ntl', '4NTL: look up “%s”', 'normal'],
      ['4ntl:lookup:abuseipdb', 'AbuseIPDB', 'normal'],
      ['4ntl:lookup:virustotal', 'VirusTotal', 'normal'],
      ['4ntl:separator', undefined, 'separator'],
      ['4ntl:lookup:all', 'All providers', 'normal'],
      ['4ntl:link', '4NTL: check this link', 'normal'],
      ['4ntl:element', '4NTL: check what this opens', 'normal'],
      ['4ntl:saved-list', 'Saved list', 'normal'],
    ]);
    expect(created.slice(0, -3).every((item) => item.contexts?.join() === 'selection')).toBe(true);
    expect(created.at(-3)?.contexts).toEqual(['link']);
    expect(created.at(-2)?.contexts).toEqual(['page', 'image', 'frame', 'video', 'audio']);
    expect(created.at(-1)?.contexts).toEqual(['action']);
  });

  it('surfaces creation errors', async () => {
    stubChrome({ message: 'duplicate id' });
    await expect(registerMenus()).rejects.toThrow('duplicate id');
  });
});
