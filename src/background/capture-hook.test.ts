// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/unbound-method -- these tests compare window.open by identity */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hookWindowOpen } from './capture-hook';

const original = window.open;
let opened: ReturnType<typeof vi.fn<() => null>>;
let caught: ReturnType<typeof vi.fn<(url: string) => void>>;
const onCaught = (event: Event) => {
  caught((event as CustomEvent<string>).detail);
};

beforeEach(() => {
  opened = vi.fn(() => null);
  window.open = opened;
  caught = vi.fn();
  window.addEventListener('4ntl:test', onCaught);
});

afterEach(() => {
  window.removeEventListener('4ntl:test', onCaught);
  window.open = original;
  vi.useRealTimers();
});

const click = () => window.dispatchEvent(new Event('pointerdown'));

describe('hookWindowOpen', () => {
  it('reports the window.open that follows a click instead of opening it, then unhooks', () => {
    hookWindowOpen('4ntl:test', 1000, 3000);
    click();
    expect(window.open('/promo?id=1', '_blank')).toBeNull();
    expect(caught).toHaveBeenCalledWith(new URL('/promo?id=1', document.baseURI).href);
    expect(opened).not.toHaveBeenCalled();
    expect(window.open).toBe(opened);
  });

  it('counts Enter and Space as activation, but not other keys', () => {
    hookWindowOpen('4ntl:test', 1000, 3000);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.open('https://evil.com/');
    expect(opened).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    window.open('https://evil.com/');
    expect(caught).toHaveBeenCalledWith('https://evil.com/');
  });

  it('lets pop-ups the page opens by itself through', () => {
    vi.useFakeTimers();
    hookWindowOpen('4ntl:test', 10_000, 3000);
    window.open('https://ads.example/'); // no click yet
    click();
    vi.advanceTimersByTime(3001);
    window.open('https://ads.example/later'); // click too long ago
    expect(opened).toHaveBeenCalledTimes(2);
    expect(caught).not.toHaveBeenCalled();
  });

  it('lets blank pop-ups through and expires', () => {
    vi.useFakeTimers();
    hookWindowOpen('4ntl:test', 1000, 3000);
    click();
    window.open();
    expect(opened).toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(window.open).toBe(opened);
  });

  it('never clobbers a window.open the page installed after the hook', () => {
    vi.useFakeTimers();
    hookWindowOpen('4ntl:test', 1000, 3000);
    const pageOwn = vi.fn(() => null) as unknown as typeof window.open;
    window.open = pageOwn;
    vi.advanceTimersByTime(1000);
    expect(window.open).toBe(pageOwn);
  });
});
