// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickSelection, readSelection, readSelectionInPage } from './selection';

afterEach(() => {
  document.body.replaceChildren();
});

describe('readSelectionInPage', () => {
  it('reads the document selection', () => {
    const p = document.createElement('p');
    p.textContent = 'IOC 8.8.8.8 here';
    document.body.append(p);
    const range = document.createRange();
    const text = p.firstChild as Text;
    range.setStart(text, 4);
    range.setEnd(text, 11);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    expect(readSelectionInPage().text).toBe('8.8.8.8');
  });

  it('reads the selected part of a focused text field', () => {
    const input = document.createElement('textarea');
    input.value = 'see evil.com now';
    document.body.append(input);
    input.focus();
    input.setSelectionRange(4, 12);
    expect(readSelectionInPage().text).toBe('evil.com');
  });
});

describe('pickSelection', () => {
  it('prefers the focused frame, then any frame with a selection', () => {
    expect(
      pickSelection([
        { frameId: 0, result: { text: 'a', focused: false } },
        { frameId: 5, result: { text: 'b', focused: true } },
      ]),
    ).toEqual({ frameId: 5, text: 'b' });
    expect(
      pickSelection([
        { frameId: 0, result: { text: '', focused: true } },
        { frameId: 2, result: { text: 'c', focused: false } },
        { frameId: 3 },
      ]),
    ).toEqual({ frameId: 2, text: 'c' });
    expect(pickSelection([{ frameId: 0, result: null }])).toBeUndefined();
  });
});

describe('readSelection', () => {
  it('injects into all frames and picks the selection', async () => {
    const executeScript = vi.fn(() =>
      Promise.resolve([{ frameId: 4, result: { text: '1.1.1.1', focused: true } }]),
    );
    vi.stubGlobal('chrome', { scripting: { executeScript } });
    expect(await readSelection(9)).toEqual({ tabId: 9, frameId: 4, text: '1.1.1.1' });
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 9, allFrames: true }, func: readSelectionInPage }),
    );
  });

  it('returns an empty selection in the top frame when nothing is selected', async () => {
    vi.stubGlobal('chrome', { scripting: { executeScript: () => Promise.resolve([]) } });
    expect(await readSelection(9)).toEqual({ tabId: 9, frameId: 0, text: '' });
  });

  it('returns undefined on pages that cannot be scripted', async () => {
    vi.stubGlobal('chrome', {
      scripting: { executeScript: () => Promise.reject(new Error('chrome:// URL')) },
    });
    expect(await readSelection(9)).toBeUndefined();
  });
});

describe('readSelection with cross-origin frames', () => {
  it('falls back to the top frame when reading all frames is refused', async () => {
    const executeScript = vi.fn((options: { target: { allFrames?: boolean } }) =>
      options.target.allFrames
        ? Promise.reject(new Error('Cannot access contents of url "https://ads.example/"'))
        : Promise.resolve([{ frameId: 0, result: { text: '8.8.8.8', focused: true } }]),
    );
    vi.stubGlobal('chrome', { scripting: { executeScript } });
    expect(await readSelection(9)).toEqual({ tabId: 9, frameId: 0, text: '8.8.8.8' });
    expect(executeScript).toHaveBeenCalledTimes(2);
  });
});
