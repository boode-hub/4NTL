// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/unbound-method -- these tests compare window.open by identity */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hookWindowOpen } from './capture-hook';

const original = window.open;
afterEach(() => {
  window.open = original;
});

describe('hookWindowOpen', () => {
  it('reports the next window.open instead of opening it, then restores window.open', () => {
    const opened = vi.fn(() => null);
    window.open = opened;
    const caught = vi.fn();
    window.addEventListener('4ntl:test', (event) => {
      caught((event as CustomEvent<string>).detail);
    });

    hookWindowOpen('4ntl:test', 1000);
    expect(window.open('/promo?id=1', '_blank')).toBeNull();
    expect(caught).toHaveBeenCalledWith(new URL('/promo?id=1', document.baseURI).href);
    expect(opened).not.toHaveBeenCalled();
    expect(window.open).toBe(opened);
  });

  it('lets blank popups through and expires', () => {
    vi.useFakeTimers();
    try {
      const opened = vi.fn(() => null);
      window.open = opened;
      hookWindowOpen('4ntl:test', 1000);
      window.open();
      expect(opened).toHaveBeenCalled();

      hookWindowOpen('4ntl:test', 1000);
      vi.advanceTimersByTime(1000);
      expect(window.open).toBe(opened);
    } finally {
      vi.useRealTimers();
    }
  });
});
