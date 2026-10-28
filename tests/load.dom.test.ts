// @vitest-environment happy-dom
/** Worst-case pages for the in-page link inspection (see tests/load.test.ts for the rationale). */
import { describe, expect, it } from 'vitest';
import { findLinkTargets } from '../src/content/link-target';

function timed(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

describe('link inspection on hostile pages', () => {
  it('copes with a 500 KB inline click handler', () => {
    const button = document.createElement('button');
    button.setAttribute(
      'onclick',
      `track(${JSON.stringify('x'.repeat(500_000))}); location.href='https://evil.com/'`,
    );
    document.body.append(button);
    expect(timed(() => findLinkTargets(button, 'https://site.com/'))).toBeLessThan(200);
    expect(findLinkTargets(button, 'https://site.com/')).toEqual(['https://evil.com/']);
    button.remove();
  });

  it('copes with thousands of attributes and deep nesting', () => {
    let element: HTMLElement = document.body;
    for (let depth = 0; depth < 2000; depth++) {
      const child = document.createElement('div');
      element.append(child);
      element = child;
    }
    for (let i = 0; i < 3000; i++) element.setAttribute(`data-x${i}`, `value ${i}`);
    // Only the nearest 10 levels are inspected, so depth costs nothing.
    expect(timed(() => findLinkTargets(element, 'https://site.com/'))).toBeLessThan(200);
    expect(findLinkTargets(element, 'https://site.com/')).toEqual([]);
    document.body.replaceChildren();
  });
});
