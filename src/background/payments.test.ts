import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../../tests/helpers';
import { PAID_FROM, TRIAL_DAYS } from '../core/license';
import { FIRST_SEEN_KEY, LICENSE_KEY, Payments, type ExtPayLike } from './payments';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NEW_USER = PAID_FROM + 30 * DAY;

function setup(
  start: number,
  options: { paid?: boolean; builtAt?: number; sync?: MemoryStore } = {},
) {
  let now = start;
  const store = new MemoryStore();
  const sync = options.sync ?? new MemoryStore();
  const extpay = {
    getUser: vi.fn<ExtPayLike['getUser']>(() => Promise.resolve({ paid: options.paid ?? false })),
  };
  const payments = new Payments({
    extpay,
    area: store,
    sync,
    now: () => now,
    builtAt: options.builtAt ?? 0,
  });
  return {
    payments,
    extpay,
    store,
    sync,
    at: (time: number) => {
      now = time;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Payments', () => {
  it('installed before 15 November: free for life, and never asks the server', async () => {
    const t = setup(PAID_FROM - 5 * DAY);
    expect(await t.payments.access()).toEqual({ status: 'early' });
    t.at(PAID_FROM + 2000 * DAY);
    expect(await t.payments.access()).toEqual({ status: 'early' });
    expect(t.extpay.getUser).not.toHaveBeenCalled();
  });

  it('early status follows the user to a new PC or a reinstall (synced storage)', async () => {
    const early = setup(PAID_FROM - 5 * DAY);
    await early.payments.access();
    expect(early.sync.data.get(FIRST_SEEN_KEY)).toBe(PAID_FROM - 5 * DAY);
    const newPc = setup(NEW_USER, { sync: early.sync });
    expect(await newPc.payments.access()).toEqual({ status: 'early' });
  });

  it('keeps the earliest date if this browser and sync disagree', async () => {
    const t = setup(NEW_USER);
    await t.store.set({ [LICENSE_KEY]: { paid: false, firstSeen: PAID_FROM - DAY, checkedAt: 0 } });
    expect(await t.payments.access()).toEqual({ status: 'early' });
    expect(t.sync.data.get(FIRST_SEEN_KEY)).toBe(PAID_FROM - DAY);
  });

  it('a clock set back cannot fake an early install of a build made after the switch', async () => {
    const t = setup(PAID_FROM - 10 * DAY, { builtAt: PAID_FROM + DAY });
    expect((await t.payments.access()).status).toBe('trial');
  });

  it('new users: 3-day trial, then locked; a purchase found on the server unlocks', async () => {
    const t = setup(NEW_USER);
    expect(await t.payments.access()).toEqual({
      status: 'trial',
      until: NEW_USER + TRIAL_DAYS * DAY,
    });
    t.at(NEW_USER + TRIAL_DAYS * DAY);
    expect((await t.payments.access()).status).toBe('locked');
    t.extpay.getUser.mockResolvedValue({ paid: true });
    expect(await t.payments.refresh()).toEqual({ status: 'paid' });
  });

  it('asks the server at most hourly during and after the trial', async () => {
    const t = setup(NEW_USER);
    await t.payments.access();
    await t.payments.access();
    expect(t.extpay.getUser).toHaveBeenCalledTimes(1);
    t.at(NEW_USER + HOUR);
    await t.payments.access();
    expect(t.extpay.getUser).toHaveBeenCalledTimes(2);
  });

  it('never asks again once paid, and works offline', async () => {
    const t = setup(NEW_USER, { paid: true });
    expect(await t.payments.refresh()).toEqual({ status: 'paid' });
    t.extpay.getUser.mockRejectedValue(new Error('offline'));
    t.at(NEW_USER + 400 * DAY);
    expect(await t.payments.access()).toEqual({ status: 'paid' });
    expect(t.extpay.getUser).toHaveBeenCalledTimes(1);
  });

  it('a later "not paid" (lost sync key, server hiccup) does not take a purchase back', async () => {
    const t = setup(NEW_USER, { paid: true });
    await t.payments.refresh();
    t.extpay.getUser.mockResolvedValue({ paid: false });
    expect(await t.payments.refresh()).toEqual({ status: 'paid' });
  });

  it('keeps the known state when ExtensionPay is unreachable or slow', async () => {
    vi.useFakeTimers();
    const t = setup(NEW_USER);
    t.extpay.getUser.mockImplementation(() => new Promise(() => undefined));
    const pending = t.payments.refresh();
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).status).toBe('trial');
  });

  it('works when synced storage is unavailable', async () => {
    const t = setup(PAID_FROM - DAY);
    vi.spyOn(t.sync, 'get').mockRejectedValue(new Error('sync disabled'));
    vi.spyOn(t.sync, 'set').mockRejectedValue(new Error('sync disabled'));
    expect(await t.payments.access()).toEqual({ status: 'early' });
  });

  it('remember() records the install date once, here and in synced storage, without the server', async () => {
    const t = setup(PAID_FROM - 20 * DAY);
    await t.payments.remember();
    t.at(PAID_FROM + 50 * DAY);
    await t.payments.remember();
    expect(t.sync.data.get(FIRST_SEEN_KEY)).toBe(PAID_FROM - 20 * DAY);
    expect(t.store.data.get(LICENSE_KEY)).toMatchObject({ firstSeen: PAID_FROM - 20 * DAY });
    expect(t.extpay.getUser).not.toHaveBeenCalled();
    expect(await t.payments.access()).toEqual({ status: 'early' });
  });

  it('onPaid unlocks immediately, without a server round trip', async () => {
    const t = setup(NEW_USER);
    await t.payments.markPaid();
    t.extpay.getUser.mockClear();
    expect(await t.payments.access()).toEqual({ status: 'paid' });
    expect(t.extpay.getUser).not.toHaveBeenCalled();
  });

  it('ignores a damaged stored record', async () => {
    const t = setup(NEW_USER);
    await t.store.set({ [LICENSE_KEY]: { paid: 'yes', firstSeen: 'never', checkedAt: null } });
    await t.sync.set({ [FIRST_SEEN_KEY]: 'yesterday' });
    expect((await t.payments.access()).status).toBe('trial');
    expect(t.store.data.get(LICENSE_KEY)).toMatchObject({ paid: false, firstSeen: NEW_USER });
  });
});
