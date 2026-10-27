import { describe, expect, it, vi } from 'vitest';
import { fakeFetch, jsonResponse, NOW } from '../../tests/helpers';
import { LookupError } from '../core/errors';
import { failForStatus, formatWait, getJson, retryAfterSeconds } from './http';

const options = (fetch: ReturnType<typeof fakeFetch>) => ({
  providerName: 'Svc',
  headers: { 'x-key': 'k' },
  fetch,
  timeoutMs: 2000,
});

describe('getJson', () => {
  it('returns status, headers and parsed JSON', async () => {
    const fetch = fakeFetch(() => jsonResponse(200, { a: 1 }, { 'x-test': 'yes' }));
    const response = await getJson('https://svc/x', options(fetch));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ a: 1 });
    expect(response.headers.get('x-test')).toBe('yes');
  });

  it('treats an empty body as null', async () => {
    const fetch = fakeFetch(() => new Response(null, { status: 204 }));
    expect((await getJson('https://svc/x', options(fetch))).body).toBeNull();
  });

  it('tolerates non-JSON error bodies (e.g. an HTML 502 page)', async () => {
    const fetch = fakeFetch(() => new Response('<html>Bad gateway</html>', { status: 502 }));
    expect(await getJson('https://svc/x', options(fetch))).toMatchObject({
      status: 502,
      body: null,
    });
  });

  it('rejects non-JSON success bodies', async () => {
    const fetch = fakeFetch(() => new Response('<html>captive portal</html>', { status: 200 }));
    await expect(getJson('https://svc/x', options(fetch))).rejects.toMatchObject({
      code: 'bad_response',
    });
  });

  it('maps network failures', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));
    await expect(
      getJson('https://svc/x', { ...options(fakeFetch(() => jsonResponse(200))), fetch }),
    ).rejects.toMatchObject({
      code: 'network',
      message: "Couldn't reach Svc. Check your connection or proxy.",
    });
  });

  it.each(['TimeoutError', 'AbortError'])('maps %s to a timeout', async (name) => {
    const fetch = vi.fn(() => Promise.reject(new DOMException('aborted', name)));
    await expect(
      getJson('https://svc/x', { ...options(fakeFetch(() => jsonResponse(200))), fetch }),
    ).rejects.toMatchObject({
      code: 'timeout',
      message: "Svc didn't answer within 2 s.",
    });
  });

  it('times out for real when the server never answers', async () => {
    const fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error);
          });
        }),
    );
    await expect(
      getJson('https://svc/x', { providerName: 'Svc', headers: {}, fetch, timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: 'timeout' });
  });
});

describe('retryAfterSeconds', () => {
  const headers = (value?: string) =>
    new Headers(value === undefined ? {} : { 'retry-after': value });

  it.each([
    [undefined, undefined],
    ['', undefined],
    ['30', 30],
    ['0', undefined],
    ['soon', undefined],
    [new Date(NOW + 90_000).toUTCString(), 90],
    [new Date(NOW - 5_000).toUTCString(), undefined],
  ])('%j → %j', (value, expected) => {
    expect(retryAfterSeconds(headers(value), NOW)).toBe(expected);
  });
});

describe('formatWait', () => {
  it.each([
    [5, '5 s'],
    [89, '89 s'],
    [90, '2 min'],
    [3600, '60 min'],
    [7200, '2 h'],
  ])('%i → %s', (seconds, text) => {
    expect(formatWait(seconds)).toBe(text);
  });
});

describe('failForStatus', () => {
  const fail = (status: number, detail?: string) => () =>
    failForStatus({ status, headers: new Headers(), body: null }, 'Svc', detail, NOW);

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limited'],
    [404, 'bad_request'],
    [500, 'server'],
    [302, 'bad_response'],
  ])('%i → %s', (status, code) => {
    expect(fail(status)).toThrow(LookupError);
    try {
      fail(status)();
    } catch (error) {
      expect((error as LookupError).code).toBe(code);
    }
  });

  it('uses provider details when given', () => {
    expect(fail(400, 'Bad IP')).toThrow('Bad IP');
    expect(fail(400)).toThrow("Svc couldn't process this request (HTTP 400).");
    expect(fail(403, 'Forbidden')).toThrow('Svc rejected the API key (Forbidden).');
  });
});
