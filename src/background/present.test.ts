import { describe, expect, it, vi } from 'vitest';
import type { CardView } from '../core/messages';
import {
  captureInPage,
  inspectInPage,
  presentInPage,
  presentInWindow,
  resultPageUrl,
} from './present';

const VIEW: CardView = { kind: 'notice', title: 'Hi', text: 'there' };
const TARGET = { tabId: 1, frameId: 2 };

function stubChrome(
  options: { pong?: boolean; injectFails?: boolean; showFails?: boolean; window?: object } = {},
) {
  const sendMessage = vi.fn((_tab: number, message: { type: string }) => {
    if (message.type === '4ntl:ping') {
      return options.pong
        ? Promise.resolve('pong')
        : Promise.reject(new Error('Receiving end does not exist'));
    }
    return options.showFails ? Promise.reject(new Error('gone')) : Promise.resolve(true);
  });
  const executeScript = vi.fn(() =>
    options.injectFails
      ? Promise.reject(new Error('Cannot access a chrome:// URL'))
      : Promise.resolve([]),
  );
  const create = vi.fn(() => Promise.resolve({}));
  vi.stubGlobal('chrome', {
    tabs: { sendMessage },
    scripting: { executeScript },
    runtime: { getURL: (path: string) => `chrome-extension://id/${path}` },
    storage: {
      local: {
        get: () =>
          Promise.resolve({
            'settings.v1': { appearance: { theme: 'sharingan', accent: '#8B5CF6' } },
          }),
      },
    },
    windows: {
      create,
      getLastFocused: () =>
        options.window ? Promise.resolve(options.window) : Promise.reject(new Error('no window')),
    },
  });
  return { sendMessage, executeScript, create };
}

describe('presentInPage', () => {
  it('injects the UI on first use, then shows the view in the right frame', async () => {
    const { sendMessage, executeScript } = stubChrome();
    expect(await presentInPage(TARGET, VIEW)).toBe(true);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 1, frameIds: [2] },
      files: ['content.js'],
    });
    expect(sendMessage).toHaveBeenLastCalledWith(
      1,
      {
        type: '4ntl:show',
        view: VIEW,
        appearance: { theme: 'sharingan', accent: '#8b5cf6', background: '' },
        corner: false,
      },
      { frameId: 2 },
    );
  });

  it('does not inject twice', async () => {
    const { executeScript } = stubChrome({ pong: true });
    expect(await presentInPage(TARGET, VIEW)).toBe(true);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('reports failure on pages that cannot be scripted', async () => {
    stubChrome({ injectFails: true });
    expect(await presentInPage(TARGET, VIEW)).toBe(false);
    stubChrome({ pong: true, showFails: true });
    expect(await presentInPage(TARGET, VIEW)).toBe(false);
  });
});

describe('presentInWindow', () => {
  it('opens the result page with the view in its hash, near the focused window', async () => {
    const { create } = stubChrome({ window: { left: 100, top: 50, width: 1200 } });
    await presentInWindow(VIEW);
    expect(create).toHaveBeenCalledWith({
      url: resultPageUrl(VIEW),
      type: 'popup',
      focused: true,
      width: 380,
      height: 480,
      left: 896,
      top: 130,
    });
    expect(JSON.parse(decodeURIComponent(resultPageUrl(VIEW).split('#')[1] ?? ''))).toEqual(VIEW);
  });

  it('lets the OS place the window when there is no focused window', async () => {
    const { create } = stubChrome();
    await presentInWindow(VIEW);
    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ left: expect.anything() as unknown }),
    );
  });
});

describe('presentInWindow bounds', () => {
  it('retries without a position when the browser rejects the bounds', async () => {
    const { create } = stubChrome({ window: { left: 0, top: 0, width: 5000 } });
    create.mockRejectedValueOnce(
      new Error('Bounds must be at least 50% within visible screen space.'),
    );
    await presentInWindow(VIEW);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ left: expect.anything() as unknown }),
    );
  });
});

describe('inspectInPage / captureInPage', () => {
  it('returns the URLs the page found (ignoring junk)', async () => {
    const { sendMessage } = stubChrome({ pong: true });
    sendMessage.mockImplementation(
      (_tab: number, message: { type: string }) =>
        Promise.resolve(
          message.type === '4ntl:inspect' ? { urls: ['https://evil.com/', 42] } : 'pong',
        ) as Promise<string>,
    );
    expect(await inspectInPage(TARGET)).toEqual(['https://evil.com/']);
  });

  it('returns nothing when the page cannot be scripted', async () => {
    stubChrome({ injectFails: true });
    expect(await inspectInPage(TARGET)).toEqual([]);
    expect(await captureInPage(TARGET)).toBe(false);
  });

  it('hooks window.open in the page world and arms the content script', async () => {
    const { sendMessage, executeScript } = stubChrome({ pong: true });
    expect(await captureInPage(TARGET)).toBe(true);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ world: 'MAIN', target: { tabId: 1, frameIds: [2] } }),
    );
    expect(sendMessage).toHaveBeenLastCalledWith(1, { type: '4ntl:capture' }, { frameId: 2 });
  });
});
