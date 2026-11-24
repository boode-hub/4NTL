import { describe, expect, it, vi } from 'vitest';
import { MemoryStore, NOW } from '../../tests/helpers';
import { LIBRARY_META_KEY, LibraryStore, libraryDataKey } from './library-store';

const DAY = 24 * 60 * 60 * 1000;

const BODIES: Record<string, unknown> = {
  'https://lolbas-project.github.io/api/lolbas.json': [
    { Name: 'Rundll32.exe', Description: 'Runs DLLs', Commands: [{ Usecase: 'Execute DLL' }] },
  ],
  'https://www.loldrivers.io/api/drivers.json': [
    { Id: '00561455-9da1-4f0c', Category: 'vulnerable driver', Tags: ['RTCore64.sys'] },
  ],
  'https://hijacklibs.net/api/hijacklibs.json': [{ Name: 'version.dll', Vendor: 'Microsoft' }],
};

function setup() {
  let now = NOW;
  const area = new MemoryStore();
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const tag = (init?.headers as Record<string, string> | undefined)?.['If-None-Match'];
    if (tag === `"v1:${url}"`) return Promise.resolve(new Response(null, { status: 304 }));
    return Promise.resolve(
      new Response(JSON.stringify(BODIES[url]), { status: 200, headers: { etag: `"v1:${url}"` } }),
    );
  });
  const store = new LibraryStore({ area, fetch, now: () => now });
  return {
    area,
    fetch,
    store,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('LibraryStore', () => {
  it('downloads every source at once, keeps them slim, and finds by name', async () => {
    const { store, fetch } = setup();
    expect(await store.ready()).toBe(false);
    const status = await store.refresh();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(status.lolbas).toMatchObject({ names: 1, updatedAt: NOW, checkedAt: NOW });
    expect(await store.ready()).toBe(true);
    const found = await store.find('RUNDLL32.EXE');
    expect(found.lolbas?.description).toBe('Runs DLLs');
    expect((await store.find('rtcore64.sys')).drivers).toHaveLength(1);
    expect((await store.find('version.dll')).hijack).toHaveLength(1);
    expect(await store.find('notepad.exe')).toEqual({ lolbas: undefined, drivers: [], hijack: [] });
  });

  it('checks at most once a day, sending the version it has (unchanged = tiny 304)', async () => {
    const { store, fetch, advance } = setup();
    await store.refresh();
    await store.refresh(); // same day: nothing asked
    expect(fetch).toHaveBeenCalledTimes(3);
    advance(DAY + 1);
    const status = await store.refresh();
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(fetch.mock.calls[3]?.[1]?.headers).toEqual({
      'If-None-Match': '"v1:https://lolbas-project.github.io/api/lolbas.json"',
    });
    expect(status.lolbas).toMatchObject({ checkedAt: NOW + DAY + 1, updatedAt: NOW, names: 1 });
    expect((await store.find('rundll32.exe')).lolbas).toBeDefined(); // data kept
  });

  it('"Update now" checks even if checked today', async () => {
    const { store, fetch } = setup();
    await store.refresh();
    await store.refresh(true);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('a failed check keeps the previous data and says so', async () => {
    const { store, fetch, advance } = setup();
    await store.refresh();
    advance(DAY + 1);
    fetch.mockImplementation(() => Promise.reject(new Error('offline')));
    const status = await store.refresh();
    expect(status.lolbas).toMatchObject({ names: 1, updatedAt: NOW, error: 'offline' });
    expect((await store.find('rundll32.exe')).lolbas).toBeDefined();
  });

  it('a lookup never downloads: before the first download the library just answers nothing', async () => {
    const { store, fetch } = setup();
    expect(await store.find('rundll32.exe')).toEqual({
      lolbas: undefined,
      drivers: [],
      hijack: [],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stale data is refreshed in the background, without making the lookup wait', async () => {
    const { store, fetch, advance } = setup();
    await store.refresh();
    advance(DAY + 1);
    const found = await store.find('rundll32.exe');
    expect(found.lolbas).toBeDefined();
    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(6);
    });
  });

  it('one refresh at a time', async () => {
    const { store, fetch } = setup();
    await Promise.all([store.refresh(), store.refresh(), store.refresh()]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('switching off while the first download runs leaves nothing behind', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const area = new MemoryStore();
    const store = new LibraryStore({
      area,
      fetch: async (url: string) => {
        await gate;
        return new Response(JSON.stringify(BODIES[url]), { status: 200 });
      },
    });
    const pending = store.refresh();
    await store.clear();
    release();
    expect(await pending).toEqual({});
    expect([...area.data.keys()]).toEqual([]);
  });

  it('a failed first download is retried on use, an hour later, without waiting', async () => {
    const { store, fetch, advance } = setup();
    fetch.mockImplementation(() => Promise.reject(new Error('offline')));
    await store.refresh();
    expect(await store.ready()).toBe(false);
    fetch.mockClear();
    await store.ensure(); // too soon
    expect(fetch).not.toHaveBeenCalled();
    advance(60 * 60 * 1000 + 1);
    fetch.mockImplementation((url: string) =>
      Promise.resolve(new Response(JSON.stringify(BODIES[url]), { status: 200 })),
    );
    await store.ensure();
    await vi.waitFor(async () => {
      expect(await store.ready()).toBe(true);
    });
  });

  it('cached cards are dropped only when new data arrives, not on "unchanged"', async () => {
    const area = new MemoryStore();
    const onChange = vi.fn(() => Promise.resolve());
    const store = new LibraryStore({
      area,
      onChange,
      fetch: (url: string, init?: RequestInit) =>
        Promise.resolve(
          (init?.headers as Record<string, string> | undefined)?.['If-None-Match']
            ? new Response(null, { status: 304 })
            : new Response(JSON.stringify(BODIES[url]), { status: 200, headers: { etag: '"v1"' } }),
        ),
    });
    await store.refresh();
    expect(onChange).toHaveBeenCalledTimes(1);
    await store.refresh(true); // all 304
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('never matches JavaScript built-ins', async () => {
    const { store } = setup();
    await store.refresh();
    expect(await store.find('constructor')).toEqual({ lolbas: undefined, drivers: [], hijack: [] });
    expect(await store.find('__proto__')).toEqual({ lolbas: undefined, drivers: [], hijack: [] });
  });

  it('switching off deletes the whole library', async () => {
    const { store, area } = setup();
    await store.refresh();
    await store.clear();
    expect(area.data.has(LIBRARY_META_KEY)).toBe(false);
    expect(area.data.has(libraryDataKey('lolbas'))).toBe(false);
    expect(await store.ready()).toBe(false);
    expect((await store.find('rundll32.exe')).lolbas).toBeUndefined();
  });
});
