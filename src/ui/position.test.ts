import { describe, expect, it } from 'vitest';
import { GAP, MARGIN, placeCard, pointRect } from './position';

const VIEWPORT = { width: 1000, height: 800 };
const CARD = { width: 320, height: 200 };

describe('placeCard', () => {
  it('opens just below the anchor, left edges aligned', () => {
    expect(placeCard(pointRect(100, 100), CARD, VIEWPORT)).toEqual({ left: 100, top: 100 + GAP });
  });

  it('sits below a selection rect, not over it', () => {
    const selection = { left: 50, top: 300, right: 180, bottom: 318 };
    expect(placeCard(selection, CARD, VIEWPORT)).toEqual({ left: 50, top: 318 + GAP });
  });

  it('shifts left to stay inside the right edge', () => {
    expect(placeCard(pointRect(900, 100), CARD, VIEWPORT).left).toBe(1000 - 320 - MARGIN);
  });

  it('respects the left margin', () => {
    expect(placeCard(pointRect(0, 100), CARD, VIEWPORT).left).toBe(MARGIN);
  });

  it('flips above the anchor near the bottom edge', () => {
    expect(placeCard(pointRect(100, 700), CARD, VIEWPORT).top).toBe(700 - GAP - 200);
  });

  it('clamps into the viewport when it fits on neither side', () => {
    const tall = { width: 320, height: 700 };
    const nearTop = placeCard(pointRect(100, 300), tall, VIEWPORT);
    expect(nearTop.top).toBeGreaterThanOrEqual(MARGIN);
    expect(nearTop.top + tall.height).toBeLessThanOrEqual(VIEWPORT.height - MARGIN);
    const nearBottom = placeCard(pointRect(100, 500), tall, VIEWPORT);
    expect(nearBottom.top).toBe(MARGIN);
  });

  it('pins to the margin when the card is larger than the viewport', () => {
    expect(placeCard(pointRect(10, 10), { width: 2000, height: 2000 }, VIEWPORT)).toEqual({
      left: MARGIN,
      top: MARGIN,
    });
  });
});
