import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../tests/helpers';
import {
  addToList,
  clearList,
  loadList,
  normalizeList,
  removeFromList,
  SAVED_LIST_KEY,
  SAVED_LIST_MAX,
  toCsv,
  type SavedEntry,
} from './saved-list';

const entry = (value: string, savedAt = 1): SavedEntry => ({
  value,
  type: 'ipv4',
  verdict: 'malicious',
  summary: 'AbuseIPDB: Malicious 100%',
  country: '🇩🇪 Germany (DE)',
  savedAt,
});

describe('saved list', () => {
  it('adds newest first and keeps one entry per indicator', async () => {
    const store = new MemoryStore();
    await addToList(entry('1.1.1.1', 1), store);
    await addToList(entry('2.2.2.2', 2), store);
    const list = await addToList(entry('1.1.1.1', 3), store);
    expect(list.map((e) => [e.value, e.savedAt])).toEqual([
      ['1.1.1.1', 3],
      ['2.2.2.2', 2],
    ]);
    expect(await loadList(store)).toEqual(list);
  });

  it('removes and clears', async () => {
    const store = new MemoryStore();
    await addToList(entry('1.1.1.1'), store);
    await addToList(entry('2.2.2.2'), store);
    expect((await removeFromList('1.1.1.1', store)).map((e) => e.value)).toEqual(['2.2.2.2']);
    expect(await clearList(store)).toEqual([]);
  });

  it('is capped', async () => {
    const store = new MemoryStore();
    await store.set({
      [SAVED_LIST_KEY]: Array.from({ length: SAVED_LIST_MAX }, (_, i) => entry(`10.0.0.${i}`)),
    });
    const list = await addToList(entry('8.8.8.8'), store);
    expect(list).toHaveLength(SAVED_LIST_MAX);
    expect(list[0]?.value).toBe('8.8.8.8');
  });

  it('drops malformed stored entries', () => {
    expect(
      normalizeList([
        entry('1.1.1.1'),
        null,
        { value: '', type: 'ipv4' },
        { value: 'x', type: 'nope' },
        { value: '2.2.2.2', type: 'ipv4', verdict: 'evil', savedAt: 'soon' },
      ]),
    ).toEqual([
      entry('1.1.1.1'),
      { value: '2.2.2.2', type: 'ipv4', summary: '', country: '', savedAt: 0 },
    ]);
    expect(normalizeList('nope')).toEqual([]);
  });

  it('exports CSV that is quoted and safe to open in a spreadsheet', () => {
    const csv = toCsv([
      { ...entry('1.1.1.1', 0), summary: 'a, "b"' },
      { ...entry('2.2.2.2', 0), summary: '=HYPERLINK("x")' },
    ]);
    expect(csv.split('\r\n')).toEqual([
      'indicator,type,verdict,country,summary,saved_at',
      '1.1.1.1,ipv4,malicious,🇩🇪 Germany (DE),"a, ""b""",1970-01-01T00:00:00.000Z',
      `2.2.2.2,ipv4,malicious,🇩🇪 Germany (DE),"'=HYPERLINK(""x"")",1970-01-01T00:00:00.000Z`,
    ]);
  });
});
