import { describe, expect, it } from 'vitest';
import {
  accessFor,
  daysLeft,
  describeAccess,
  PAID_FROM,
  PAID_FROM_LABEL,
  TRIAL_DAYS,
} from './license';

const DAY = 24 * 60 * 60 * 1000;

describe('accessFor', () => {
  it('installed before 15 November 2026: free for life', () => {
    expect(PAID_FROM_LABEL).toBe('15 November 2026');
    for (const now of [PAID_FROM - DAY, PAID_FROM + DAY, PAID_FROM + 5000 * DAY]) {
      expect(accessFor({ paid: false, firstSeen: PAID_FROM - 1 }, now)).toEqual({
        status: 'early',
      });
    }
  });

  it('installed from 15 November on: a 3-day trial, then locked', () => {
    const installed = PAID_FROM;
    const end = installed + TRIAL_DAYS * DAY;
    const facts = { paid: false, firstSeen: installed };
    expect(TRIAL_DAYS).toBe(3);
    expect(accessFor(facts, installed)).toEqual({ status: 'trial', until: end });
    expect(accessFor(facts, end - 1)).toEqual({ status: 'trial', until: end });
    expect(accessFor(facts, end)).toEqual({ status: 'locked' });
  });

  it('a purchase unlocks at any time, for good', () => {
    for (const now of [PAID_FROM, PAID_FROM + 1000 * DAY]) {
      expect(accessFor({ paid: true, firstSeen: PAID_FROM + DAY }, now)).toEqual({
        status: 'paid',
      });
    }
  });

  it('a corrupt install time gives no free pass', () => {
    expect(accessFor({ paid: false, firstSeen: Number.NaN }, PAID_FROM + DAY).status).toBe(
      'locked',
    );
  });
});

describe('describeAccess', () => {
  it('says what happens and when, and stays quiet for early, paid and GitHub users', () => {
    expect(describeAccess({ status: 'trial', until: PAID_FROM + 3 * DAY }, PAID_FROM)).toBe(
      'Trial: 3 days left, then $2 once for life.',
    );
    expect(describeAccess({ status: 'trial', until: PAID_FROM + 1 }, PAID_FROM)).toBe(
      'Trial: 1 day left, then $2 once for life.',
    );
    expect(describeAccess({ status: 'locked' }, 0)).toContain('$2');
    for (const status of ['early', 'paid', 'open'] as const) {
      expect(describeAccess({ status }, 0)).toBe('');
    }
  });

  it('never counts below zero days', () => {
    expect(daysLeft(PAID_FROM, PAID_FROM + DAY)).toBe(0);
  });
});
