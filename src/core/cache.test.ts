import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../tests/helpers';
import { TtlCache } from './cache';

function setup(options: { maxEntries?: number; pruneEvery?: number } = {}) {
  const store = new MemoryStore();
  let now = 1_000;
  const cache = new TtlCache<string>(store, {
    prefix: 'c:',
    maxEntries: options.maxEntries ?? 10,
    pruneEvery: options.pruneEvery ?? 1,
    now: () => now,
  });
  return {
    store,
    cache,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('TtlCache', () => {
  it('returns stored values with their timestamp until they expire', async () => {
    const { cache, advance } = setup();
    await cache.set('k', 'v', 100);
    expect(await cache.get('k')).toEqual({ value: 'v', storedAt: 1_000 });
    advance(99);
    expect(await cache.get('k')).toBeDefined();
    advance(1);
    expect(await cache.get('k')).toBeUndefined();
  });

  it('deletes expired entries when read', async () => {
    const { cache, store, advance } = setup();
    await cache.set('k', 'v', 10);
    advance(10);
    await cache.get('k');
    expect(store.data.has('c:k')).toBe(false);
  });

  it('does not store anything when the TTL is zero (caching disabled)', async () => {
    const { cache, store } = setup();
    await cache.set('k', 'v', 0);
    expect(store.data.size).toBe(0);
  });

  it('ignores malformed entries', async () => {
    const { cache, store } = setup();
    await store.set({ 'c:bad': 'not an entry', 'c:worse': { value: 1 } });
    expect(await cache.get('bad')).toBeUndefined();
    expect(await cache.get('worse')).toBeUndefined();
  });

  it('evicts the oldest entries beyond maxEntries', async () => {
    const { cache, advance } = setup({ maxEntries: 2 });
    await cache.set('a', '1', 1_000);
    advance(1);
    await cache.set('b', '2', 1_000);
    advance(1);
    await cache.set('c', '3', 1_000);
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeDefined();
    expect(await cache.get('c')).toBeDefined();
  });

  it('sweeps expired entries during pruning', async () => {
    const { cache, store, advance } = setup({ pruneEvery: 2 });
    await cache.set('old', 'x', 5); // first write prunes (nothing to do)
    advance(10);
    await cache.set('new1', 'y', 1_000);
    expect(store.data.has('c:old')).toBe(true); // not yet: prunes every 2nd write
    await cache.set('new2', 'z', 1_000);
    expect(store.data.has('c:old')).toBe(false);
  });

  it('clear() only removes its own namespace', async () => {
    const { cache, store } = setup();
    await store.set({ 'settings.v1': { keep: true } });
    await cache.set('a', '1', 1_000);
    await cache.clear();
    expect([...store.data.keys()]).toEqual(['settings.v1']);
    await cache.clear(); // no-op when empty
  });
});
