/**
 * Who may use the store edition. Anyone who installs it before PAID_FROM keeps
 * it free for life. Installs from PAID_FROM on get TRIAL_DAYS, then need the
 * one-time unlock. The GitHub edition never asks (status 'open').
 */

/** 15 November 2026, 00:00 UTC: installs from here on pay after the trial. */
export const PAID_FROM = Date.UTC(2026, 10, 15);
export const TRIAL_DAYS = 3;
export const PRICE = '$2';
export const FREE_EDITION_URL = 'https://github.com/boode-hub/4NTL/releases/latest';
/** Anyone can support the project, any amount, any time (both editions). */
export const SUPPORT_URL = 'https://github.com/sponsors/boode-hub';
/** The extension's ID at extensionpay.com. Release checks refuse to ship the placeholder. */
export const EXTPAY_ID = 'EXTPAY-ID-PLACEHOLDER';

const DAY_MS = 24 * 60 * 60 * 1000;

export type Access =
  /** GitHub edition: free forever. */
  | { readonly status: 'open' }
  | { readonly status: 'paid' }
  /** Installed before PAID_FROM: free for life. */
  | { readonly status: 'early' }
  | { readonly status: 'trial'; readonly until: number }
  | { readonly status: 'locked' };

export interface LicenseFacts {
  readonly paid: boolean;
  /** When this user first ran the store edition (kept in synced storage too). */
  readonly firstSeen: number;
}

export function accessFor({ paid, firstSeen }: LicenseFacts, now: number): Access {
  if (paid) return { status: 'paid' };
  if (firstSeen < PAID_FROM) return { status: 'early' };
  const until = firstSeen + TRIAL_DAYS * DAY_MS;
  return now < until ? { status: 'trial', until } : { status: 'locked' };
}

/** Whole days left, rounded up ("1 day left" until the very end). */
export function daysLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / DAY_MS));
}

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export const PAID_FROM_LABEL = dateFormat.format(PAID_FROM);

/** The card's line; empty when there's nothing to say (paid, early, GitHub edition). */
export function describeAccess(access: Access, now: number): string {
  switch (access.status) {
    case 'open':
    case 'paid':
    case 'early':
      return '';
    case 'trial': {
      const days = daysLeft(access.until, now);
      return `Trial: ${days} ${days === 1 ? 'day' : 'days'} left, then ${PRICE} once for life.`;
    }
    case 'locked':
      return `Your trial has ended. Unlock 4NTL for life for ${PRICE}: one payment, no subscription.`;
  }
}
