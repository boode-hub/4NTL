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
    ]);
    expect(created.every((item) => item.contexts?.join() === 'selection')).toBe(true);
  });

  it('surfaces creation errors', async () => {
    stubChrome({ message: 'duplicate id' });
    await expect(registerMenus()).rejects.toThrow('duplicate id');
  });
});
