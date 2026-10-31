/**
 * Store edition only: the purchase state, from ExtensionPay (Stripe), cached in
 * chrome.storage.local so lookups never wait on the network once someone has
 * paid, and keep working offline.
 */
import type { KeyValueStore } from '../core/cache';
import { accessFor, type Access } from '../core/license';

export const LICENSE_KEY = 'license.v1';
/** While unpaid, ask ExtensionPay at most this often (purchases also arrive via onPaid). */
const RECHECK_MS = 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 4000;

/** The part of ExtPay the worker uses. (Checkout and restore open from the settings page:
 * ExtPay asks for extension info by message there, which a worker can't send to itself.) */
export interface ExtPayLike {
  getUser(): Promise<{ readonly paid: boolean }>;
}

interface Stored {
  readonly paid: boolean;
  readonly firstSeen: number;
  readonly checkedAt: number;
}

export interface PaymentsDeps {
  readonly extpay: ExtPayLike;
  readonly area: Pick<KeyValueStore, 'get' | 'set'>;
  /** chrome.storage.sync: the install date follows the user to a new PC or a reinstall. */
  readonly sync: Pick<KeyValueStore, 'get' | 'set'>;
  readonly now: () => number;
  /** When this build was made: a first run can't date itself earlier (clock set back). */
  readonly builtAt: number;
}

export const FIRST_SEEN_KEY = 'firstSeen.v1';

const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('timeout'));
      }, ms);
    }),
  ]).finally(() => {
    clearTimeout(timer);
  });
}

export class Payments {
  readonly #deps: PaymentsDeps;

  constructor(deps: PaymentsDeps) {
    this.#deps = deps;
  }

  /** The earliest install date we know of, from this browser or the user's synced storage. */
  async #firstSeen(local: number | undefined): Promise<number> {
    let synced: number | undefined;
    try {
      synced = num((await this.#deps.sync.get(FIRST_SEEN_KEY))[FIRST_SEEN_KEY]);
    } catch {
      // Sync unavailable: this browser's date still counts.
    }
    const known = [local, synced].filter((t): t is number => t !== undefined);
    const firstSeen =
      known.length > 0 ? Math.min(...known) : Math.max(this.#deps.now(), this.#deps.builtAt);
    if (synced !== firstSeen) {
      await this.#deps.sync.set({ [FIRST_SEEN_KEY]: firstSeen }).catch(() => undefined);
    }
    return firstSeen;
  }

  async #load(): Promise<Stored> {
    const raw = (await this.#deps.area.get(LICENSE_KEY))[LICENSE_KEY] as
      Partial<Record<keyof Stored, unknown>> | undefined;
    const local = num(raw?.firstSeen);
    const stored: Stored = {
      paid: raw?.paid === true,
      firstSeen: await this.#firstSeen(local),
      checkedAt: num(raw?.checkedAt) ?? 0,
    };
    if (local !== stored.firstSeen) await this.#save(stored);
    return stored;
  }

  async #save(stored: Stored): Promise<void> {
    await this.#deps.area.set({ [LICENSE_KEY]: stored });
  }

  /** Asks ExtensionPay now. A purchase is never taken back by a failed or empty answer. */
  async refresh(): Promise<Access> {
    const stored = await this.#load();
    let paid = stored.paid;
    try {
      paid ||= (await withTimeout(this.#deps.extpay.getUser(), CHECK_TIMEOUT_MS)).paid;
    } catch {
      // Offline or ExtensionPay down: keep what we knew.
    }
    const next = { ...stored, paid, checkedAt: this.#deps.now() };
    await this.#save(next);
    return accessFor(next, this.#deps.now());
  }

  /** Fast path for every lookup: the cache, re-checked at most hourly during and after a trial. */
  async access(): Promise<Access> {
    const stored = await this.#load();
    const now = this.#deps.now();
    const access = accessFor(stored, now);
    const mayHavePaid = access.status === 'trial' || access.status === 'locked';
    if (mayHavePaid && now - stored.checkedAt >= RECHECK_MS) return this.refresh();
    return access;
  }

  /** Records the install date if it isn't known yet (both editions, on install and update). */
  async remember(): Promise<void> {
    await this.#load();
  }

  /** ExtensionPay's onPaid: the user just paid, or restored a purchase. */
  async markPaid(): Promise<void> {
    await this.#save({ ...(await this.#load()), paid: true, checkedAt: this.#deps.now() });
  }
}
