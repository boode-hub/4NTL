import { describe, expect, it, vi } from 'vitest';
import { NO_ANSWER } from './card';
import { runtimeClient } from './runtime-client';

const IP = { type: 'ipv4', value: '8.8.8.8' } as const;

function stubRuntime(sendMessage: () => Promise<unknown>, alive = true) {
  const spy = vi.fn(sendMessage);
  vi.stubGlobal('chrome', { runtime: { id: alive ? 'ext' : undefined, sendMessage: spy } });
  return spy;
}

describe('runtimeClient', () => {
  it('gets the card picture, or says why not', async () => {
    const rect = { x: 1, y: 2, width: 300, height: 200 };
    stubRuntime(() => Promise.resolve({ dataUrl: 'data:image/png;base64,iVBORw==' }));
    const blob = await runtimeClient.captureCard?.(rect, 1280);
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBe(4);
    stubRuntime(() => Promise.resolve({ error: 'Cannot capture this page.' }));
    await expect(runtimeClient.captureCard?.(rect, 1280)).rejects.toThrow(
      'Cannot capture this page.',
    );
    // No answer at all: an older background still running (rebuilt but not reloaded).
    stubRuntime(() => Promise.resolve(undefined));
    await expect(runtimeClient.captureCard?.(rect, 1280)).rejects.toThrow(NO_ANSWER);
  });

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
