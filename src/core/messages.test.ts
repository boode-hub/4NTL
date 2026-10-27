import { describe, expect, it } from 'vitest';
import { LookupError, toFailure } from './errors';
import { isBackgroundMessage, isContentMessage, isIndicator } from './messages';
import { isProviderId } from './provider-ids';

const indicator = { type: 'ipv4', value: '8.8.8.8' };

describe('isBackgroundMessage', () => {
  it('accepts well-formed messages', () => {
    expect(
      isBackgroundMessage({ type: '4ntl:lookup', provider: 'virustotal', indicator, force: false }),
    ).toBe(true);
    expect(isBackgroundMessage({ type: '4ntl:open-options' })).toBe(true);
  });

  it.each([
    null,
    'string',
    { type: 'other' },
    { type: '4ntl:lookup', provider: 'shodan', indicator, force: false },
    {
      type: '4ntl:lookup',
      provider: 'virustotal',
      indicator: { type: 'ipv9', value: 'x' },
      force: false,
    },
    { type: '4ntl:lookup', provider: 'virustotal', indicator: { type: 'ipv4' }, force: false },
    { type: '4ntl:lookup', provider: 'virustotal', indicator, force: 'yes' },
    { type: '4ntl:lookup', provider: 'virustotal', force: false },
  ])('rejects %j', (message) => {
    expect(isBackgroundMessage(message)).toBe(false);
  });
});

describe('isContentMessage', () => {
  it('accepts ping and show', () => {
    expect(isContentMessage({ type: '4ntl:ping' })).toBe(true);
    expect(
      isContentMessage({ type: '4ntl:show', view: { kind: 'notice', title: 't', text: 'x' } }),
    ).toBe(true);
  });

  it.each([
    undefined,
    { type: '4ntl:show' },
    { type: '4ntl:show', view: { kind: 'evil' } },
    { type: 'x' },
  ])('rejects %j', (message) => {
    expect(isContentMessage(message)).toBe(false);
  });
});

describe('small guards', () => {
  it('isIndicator / isProviderId', () => {
    expect(isIndicator(indicator)).toBe(true);
    expect(isIndicator(null)).toBe(false);
    expect(isProviderId('abuseipdb')).toBe(true);
    expect(isProviderId('toString')).toBe(false);
  });
});

describe('toFailure', () => {
  it('keeps LookupError details', () => {
    expect(toFailure(new LookupError('rate_limited', 'slow down', 30))).toEqual({
      code: 'rate_limited',
      message: 'slow down',
      retryAfterSec: 30,
    });
    expect(toFailure(new LookupError('auth', 'bad key'))).toEqual({
      code: 'auth',
      message: 'bad key',
    });
  });

  it('hides unexpected errors behind a generic message', () => {
    const consoleError = console.error;
    console.error = () => undefined;
    try {
      expect(toFailure(new TypeError('x is undefined'))).toEqual({
        code: 'internal',
        message: 'Something went wrong. Please try again.',
      });
    } finally {
      console.error = consoleError;
    }
  });
});
