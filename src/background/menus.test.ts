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

  it('shows a single "4NTL" entry, with the right choices inside for what was clicked', async () => {
    const created = stubChrome();
    await registerMenus();
    expect(
      created.map((item) => [item.id, item.parentId, item.title, item.type ?? 'normal']),
    ).toEqual([
      ['4ntl', undefined, '4NTL', 'normal'],
      ['4ntl:lookup:all', '4ntl', 'Look up “%s”', 'normal'],
      ['4ntl:separator', '4ntl', undefined, 'separator'],
      ['4ntl:lookup:abuseipdb', '4ntl', 'AbuseIPDB only', 'normal'],
      ['4ntl:lookup:virustotal', '4ntl', 'VirusTotal only', 'normal'],
      ['4ntl:link', '4ntl', 'Check this link', 'normal'],
      ['4ntl:element', '4ntl', 'Check what’s here', 'normal'],
      ['4ntl:saved-list', undefined, 'Saved list', 'normal'],
    ]);
    const element = ['page', 'image', 'frame', 'video', 'audio', 'editable'];
    expect(created[0]?.contexts).toEqual(['selection', 'link', ...element]);
    expect(created.slice(1, 5).every((item) => item.contexts?.join() === 'selection')).toBe(true);
    expect(created.at(-3)?.contexts).toEqual(['link']);
    expect(created.at(-2)?.contexts).toEqual(element);
    expect(created.at(-1)?.contexts).toEqual(['action']);
  });

  it('surfaces creation errors', async () => {
    stubChrome({ message: 'duplicate id' });
    await expect(registerMenus()).rejects.toThrow('duplicate id');
  });
});
