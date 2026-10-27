import { describe, expect, it, vi } from 'vitest';
import { runtimeClient } from './runtime-client';

const IP = { type: 'ipv4', value: '8.8.8.8' } as const;

function stubRuntime(sendMessage: () => Promise<unknown>, alive = true) {
  const spy = vi.fn(sendMessage);
  vi.stubGlobal('chrome', { runtime: { id: alive ? 'ext' : undefined, sendMessage: spy } });
  return spy;
}

describe('runtimeClient', () => {
  it('sends lookups to the service worker and returns its outcome', async () => {
    const outcome = { ok: false, error: { code: 'auth', message: 'nope' } };
    const send = stubRuntime(() => Promise.resolve(outcome));
    expect(await runtimeClient.lookup('virustotal', IP, true)).toEqual(outcome);
    expect(send).toHaveBeenCalledWith({
      type: '4ntl:lookup',
      provider: 'virustotal',
      indicator: IP,
      force: true,
    });
  });

  it('turns a missing or malformed response into a friendly error', async () => {
    stubRuntime(() => Promise.resolve(undefined));
    expect(await runtimeClient.lookup('virustotal', IP, false)).toMatchObject({
      ok: false,
      error: { message: 'Lost contact with the extension. Try again.' },
    });
  });

  it('tells the user to refresh after the extension was reloaded', async () => {
    stubRuntime(() => Promise.reject(new Error('Extension context invalidated.')), false);
    expect(await runtimeClient.lookup('virustotal', IP, false)).toMatchObject({
      error: { message: '4NTL was updated or reloaded. Refresh this page to keep using it.' },
    });
    vi.stubGlobal('chrome', {});
    expect(await runtimeClient.lookup('virustotal', IP, false)).toMatchObject({
      error: { message: expect.stringContaining('Refresh this page') as unknown },
    });
  });

  it('asks the service worker to open settings, ignoring failures', () => {
    const send = stubRuntime(() => Promise.reject(new Error('closed')));
    runtimeClient.openOptions();
    expect(send).toHaveBeenCalledWith({ type: '4ntl:open-options' });
  });
});
