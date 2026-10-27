// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { CAPTURED_OPEN_EVENT } from '../core/messages';
import { armCapture } from './capture';

/** A window with a minimal Navigation API (happy-dom has none). */
function fakeWindow() {
  const navigation = new EventTarget();
  const win = Object.assign(new EventTarget(), { navigation }) as unknown as Window;
  const navigate = (url: string, cancelable = true) => {
    const event = Object.assign(new Event('navigate', { cancelable }), { destination: { url } });
    navigation.dispatchEvent(event);
    return event;
  };
  return { win, navigate };
}

describe('armCapture', () => {
  it('cancels the next navigation and reports where it was going', () => {
    const { win, navigate } = fakeWindow();
    const done = vi.fn();
    armCapture(done, win, 1000);
    const event = navigate('https://evil.com/next');
    expect(event.defaultPrevented).toBe(true);
    expect(done).toHaveBeenCalledWith('https://evil.com/next');
    navigate('https://evil.com/later');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('reports navigations it cannot cancel', () => {
    const { win, navigate } = fakeWindow();
    const done = vi.fn();
    armCapture(done, win, 1000);
    navigate('https://evil.com/browser-ui', false);
    expect(done).toHaveBeenCalledWith('https://evil.com/browser-ui');
  });

  it('catches window.open via the page hook event', () => {
    const { win } = fakeWindow();
    const done = vi.fn();
    armCapture(done, win, 1000);
    win.dispatchEvent(new CustomEvent(CAPTURED_OPEN_EVENT, { detail: 'https://evil.com/popup' }));
    expect(done).toHaveBeenCalledWith('https://evil.com/popup');
  });

  it('gives up after the timeout, and can be cancelled', () => {
    vi.useFakeTimers();
    try {
      const { win, navigate } = fakeWindow();
      const done = vi.fn();
      armCapture(done, win, 1000);
      vi.advanceTimersByTime(1000);
      expect(done).toHaveBeenCalledWith(undefined);
      expect(navigate('https://evil.com/too-late').defaultPrevented).toBe(false);

      const cancelled = vi.fn();
      const cancel = armCapture(cancelled, win, 1000);
      cancel();
      expect(cancelled).toHaveBeenCalledWith(undefined);
    } finally {
      vi.useRealTimers();
    }
  });

  it('works without the Navigation API (window.open only)', () => {
    const win = new EventTarget() as unknown as Window;
    const done = vi.fn();
    armCapture(done, win, 1000);
    win.dispatchEvent(new CustomEvent(CAPTURED_OPEN_EVENT, { detail: 42 }));
    expect(done).not.toHaveBeenCalled();
    win.dispatchEvent(new CustomEvent(CAPTURED_OPEN_EVENT, { detail: 'https://evil.com/' }));
    expect(done).toHaveBeenCalledWith('https://evil.com/');
  });
});
