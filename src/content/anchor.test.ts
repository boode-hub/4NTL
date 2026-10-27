// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { pointRect } from '../ui/position';
import { chooseAnchor, hoveredRect, POINTER_MAX_AGE_MS, selectionRect } from './anchor';

const NOW = 1_000_000;
const SELECTION = { left: 10, top: 20, right: 110, bottom: 38 };

describe('chooseAnchor', () => {
  it('prefers a recent right-click position', () => {
    expect(chooseAnchor({ x: 5, y: 6, at: NOW - 1000 }, SELECTION, undefined, 800, NOW)).toEqual(
      pointRect(5, 6),
    );
  });

  it('falls back to the selection when the right-click is stale or unknown', () => {
    expect(
      chooseAnchor(
        { x: 5, y: 6, at: NOW - POINTER_MAX_AGE_MS - 1 },
        SELECTION,
        undefined,
        800,
        NOW,
      ),
    ).toBe(SELECTION);
    expect(chooseAnchor(undefined, SELECTION, undefined, 800, NOW)).toBe(SELECTION);
  });

  it('uses the top-right corner when there is nothing to anchor to', () => {
    expect(chooseAnchor(undefined, undefined, undefined, 800, NOW)).toEqual(pointRect(800, 0));
    expect(chooseAnchor(undefined, pointRect(0, 0), undefined, 800, NOW)).toEqual(
      pointRect(800, 0),
    );
  });
});

describe('selectionRect', () => {
  it('is undefined without a selection', () => {
    document.getSelection()?.removeAllRanges();
    expect(selectionRect(document)).toBeUndefined();
  });

  it('uses the focused text field', () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(selectionRect(document)).toEqual(input.getBoundingClientRect());
    input.remove();
  });

  it('measures the selected range', () => {
    const p = document.createElement('p');
    p.textContent = 'evil.com';
    document.body.append(p);
    const range = document.createRange();
    range.selectNodeContents(p);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    expect(selectionRect(document)).toBeDefined();
    p.remove();
  });
});

describe('hovered element (right-clicked links)', () => {
  const LINK = { left: 40, top: 60, right: 140, bottom: 78 };

  it('anchors to the hovered element when nothing is selected', () => {
    expect(chooseAnchor(undefined, undefined, LINK, 800, NOW)).toBe(LINK);
  });

  it('still prefers a selection over the hovered element', () => {
    expect(chooseAnchor(undefined, SELECTION, LINK, 800, NOW)).toBe(SELECTION);
  });

  it('ignores the page itself as a hover target', () => {
    expect(hoveredRect(document)).toBeUndefined();
  });
});
