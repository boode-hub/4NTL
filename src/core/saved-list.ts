/**
 * The saved list: indicators the user set aside from a card ("Save to list"),
 * to review or export together later (e.g. a block list). Kept in
 * chrome.storage.local, newest first, one entry per indicator.
 */
import type { KeyValueStore } from './cache';
import { isIndicatorType, type IndicatorType } from './indicator';
import { VERDICTS, type Verdict } from './result';

export const SAVED_LIST_KEY = 'savedList.v1';
export const SAVED_LIST_MAX = 1000;

export interface SavedEntry {
  readonly value: string;
  readonly type: IndicatorType;
  /** Most severe verdict when saved; undefined if no lookup had finished. */
  readonly verdict?: Verdict;
  /** One line per provider, e.g. "AbuseIPDB: Malicious 100%". */
  readonly summary: string;
  readonly country: string;
  readonly savedAt: number;
}

type StorageArea = Pick<KeyValueStore, 'get' | 'set'>;

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function toEntry(raw: unknown): SavedEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.value !== 'string' || !r.value || !isIndicatorType(r.type)) return null;
  const verdict = VERDICTS.find((v) => v === r.verdict);
  return {
    value: r.value.slice(0, 4096),
    type: r.type,
    ...(verdict ? { verdict } : {}),
    summary: str(r.summary, 500),
    country: str(r.country, 100),
    // Within the range Date accepts, so exports never throw.
    savedAt: typeof r.savedAt === 'number' && Math.abs(r.savedAt) <= 8.64e15 ? r.savedAt : 0,
  };
}

export function normalizeList(raw: unknown): SavedEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => toEntry(item) ?? []).slice(0, SAVED_LIST_MAX);
}

export async function loadList(area: StorageArea = chrome.storage.local): Promise<SavedEntry[]> {
  return normalizeList((await area.get(SAVED_LIST_KEY))[SAVED_LIST_KEY]);
}

/** Writes from this page run one at a time, so none overwrites another. */
let queue: Promise<unknown> = Promise.resolve();

// ponytail: two different tabs saving in the same millisecond could still drop one.
// Route writes through the service worker if that ever matters.
function update(
  change: (list: SavedEntry[]) => SavedEntry[],
  area: StorageArea,
): Promise<SavedEntry[]> {
  const run = async () => {
    const next = change(await loadList(area)).slice(0, SAVED_LIST_MAX);
    await area.set({ [SAVED_LIST_KEY]: next });
    return next;
  };
  const result = queue.then(run, run);
  // Keep only the ordering, not the list itself (it can be large).
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Adds (or refreshes and moves to the top) an entry. */
export function addToList(
  entry: SavedEntry,
  area: StorageArea = chrome.storage.local,
): Promise<SavedEntry[]> {
  return update((list) => [entry, ...list.filter((e) => e.value !== entry.value)], area);
}

export function removeFromList(
  value: string,
  area: StorageArea = chrome.storage.local,
): Promise<SavedEntry[]> {
  return update((list) => list.filter((e) => e.value !== value), area);
}

export function clearList(area: StorageArea = chrome.storage.local): Promise<SavedEntry[]> {
  return update(() => [], area);
}

/** One CSV field; cells that a spreadsheet would run as a formula are made plain text. */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(entries: readonly SavedEntry[]): string {
  const rows = entries.map((e) => [
    e.value,
    e.type,
    e.verdict ?? '',
    e.country,
    e.summary,
    new Date(e.savedAt).toISOString(),
  ]);
  return [['indicator', 'type', 'verdict', 'country', 'summary', 'saved_at'], ...rows]
    .map((row) => row.map(csvField).join(','))
    .join('\r\n');
}
