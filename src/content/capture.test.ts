// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTURED_OPEN_EVENT, GESTURE_WINDOW_MS } from '../core/messages';
import { armCapture } from './capture';

/** A window with a minimal Navigation API (happy-dom has none). */
function fakeWindow() {
  const navigation = new EventTarget();
  const win = Object.assign(new EventTarget(), { navigation }) as unknown as Window;
  const navigate = (
    url: string,
    options: { cancelable?: boolean; userInitiated?: boolean } = {},
  ) => {
    const event = Object.assign(new Event('navigate', { cancelable: options.cancelable ?? true }), {
      destination: { url },
      userInitiated: options.userInitiated ?? false,
    });
    navigation.dispatchEvent(event);
    return event;
  };
  const click = () => win.dispatchEvent(new Event('pointerdown'));
  return { win, navigate, click };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('armCapture', () => {
  it('cancels the navigation that follows the click and reports where it was going', () => {
    const { win, navigate, click } = fakeWindow();
    const done = vi.fn();
    armCapture(done, win, 1000);
    click();
    const event = navigate('https://evil.com/next');
    expect(event.defaultPrevented).toBe(true);
    expect(done).toHaveBeenCalledWith('https://evil.com/next');
    click();
    navigate('https://evil.com/later');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('leaves navigations the page makes by itself alone', () => {
    vi.useFakeTimers();
    const { win, navigate, click } = fakeWindow();
    const done = vi.fn();
    armCapture(done, win, 60_000);

    // No click yet: an auto-refresh or replaceState is not cancelled.
    expect(navigate('https://site.com/?page=2').defaultPrevented).toBe(false);
    // A click long ago doesn't count either.
    click();
    vi.advanceTimersByTime(GESTURE_WINDOW_MS + 1);
    expect(navigate('https://site.com/?page=3').defaultPrevented).toBe(false);
    expect(done).not.toHaveBeenCalled();

    // Browser-reported user navigations (link clicks, form submits) always count.
    expect(navigate('https://evil.com/link', { userInitiated: true }).defaultPrevented).toBe(true);
    expect(done).toHaveBeenCalledWith('https://evil.com/link');
  });

  it('counts Enter and Space as activation, but not other keys', () => {
    const { win, navigate } = fakeWindow();
    const done = vi.fn();
    armCapture(done, win, 1000);
    win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    navigate('https://site.com/x');
    expect(done).not.toHaveBeenCalled();
    win.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    navigate('https://evil.com/space');
    expect(done).toHaveBeenCalledWith('https://evil.com/space');
  });

  it('reports navigations it cannot cancel', () => {
    const { win, navigate, click } = fakeWindow();
    const done = vi.fn();
    armCapture(done, win, 1000);
    click();
    navigate('https://evil.com/browser-ui', { cancelable: false });
    expect(done).toHaveBeenCalledWith('https://evil.com/browser-ui');
  });

  it('catches window.open via the page hook event', () => {
    const { win } = fakeWindow();
    const done = vi.fn();
    armCapture(done, win, 1000);
    win.dispatchEvent(new CustomEvent(CAPTURED_OPEN_EVENT, { detail: 'https://evil.com/popup' }));
    expect(done).toHaveBeenCalledWith('https://evil.com/popup');
  });

  it('gives up after the timeout, removes its listeners, and can be cancelled', () => {
    vi.useFakeTimers();
    const { win, navigate, click } = fakeWindow();
    const done = vi.fn();
    armCapture(done, win, 1000);
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledWith(undefined);
    click();
    expect(navigate('https://evil.com/too-late').defaultPrevented).toBe(false);

    const cancelled = vi.fn();
    const cancel = armCapture(cancelled, win, 1000);
    cancel();
    expect(cancelled).toHaveBeenCalledWith(undefined);
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
