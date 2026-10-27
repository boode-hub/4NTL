import { describe, expect, it } from 'vitest';
import { clampToViewport, DISTANCE, GAP, MARGIN, placeCard, pointRect } from './position';

const VIEWPORT = { width: 1400, height: 800 };
const CARD = { width: 320, height: 300 };

describe('placeCard', () => {
  it('opens about 5 cm to the right of the pointer, header level with it', () => {
    expect(placeCard(pointRect(200, 300), CARD, VIEWPORT)).toEqual({
      left: 200 + DISTANCE,
      top: 300 - 24,
    });
  });

  it('measures the distance from the right edge of a selection', () => {
    const selection = { left: 100, top: 300, right: 400, bottom: 318 };
    expect(placeCard(selection, CARD, VIEWPORT).left).toBe(400 + DISTANCE);
  });

  it('goes to the left when there is no room on the right', () => {
    expect(placeCard(pointRect(1200, 300), CARD, VIEWPORT)).toEqual({
      left: 1200 - DISTANCE - 320,
      top: 276,
    });
  });

  it('keeps the card vertically inside the viewport', () => {
    expect(placeCard(pointRect(200, 790), CARD, VIEWPORT).top).toBe(800 - 300 - MARGIN);
    expect(placeCard(pointRect(200, 5), CARD, VIEWPORT).top).toBe(MARGIN);
  });

  it('puts toolbar / address-bar cards in the top-right corner', () => {
    expect(placeCard(pointRect(1400, 0), CARD, VIEWPORT)).toEqual({
      left: 1400 - 320 - MARGIN,
      top: MARGIN,
    });
  });

  describe('narrow windows (no room beside the anchor)', () => {
    const narrow = { width: 600, height: 800 };

    it('opens just below the anchor', () => {
      expect(placeCard(pointRect(250, 100), CARD, narrow)).toEqual({ left: 250, top: 100 + GAP });
    });

    it('flips above near the bottom', () => {
      expect(placeCard(pointRect(250, 700), CARD, narrow).top).toBe(700 - GAP - 300);
    });

    it('clamps when it fits on neither side', () => {
      const tall = { width: 320, height: 700 };
      const placed = placeCard(pointRect(250, 300), tall, narrow);
      expect(placed.top).toBeGreaterThanOrEqual(MARGIN);
      expect(placed.top + tall.height).toBeLessThanOrEqual(narrow.height - MARGIN);
      expect(placeCard(pointRect(250, 500), tall, narrow).top).toBe(MARGIN);
    });

    it('pins to the margins when the card is larger than the viewport', () => {
      expect(placeCard(pointRect(10, 10), { width: 2000, height: 2000 }, narrow)).toEqual({
        left: MARGIN,
        top: MARGIN,
      });
    });
  });
});

describe('clampToViewport', () => {
  it('pulls a dragged card back inside the window', () => {
    expect(clampToViewport({ left: -50, top: 900 }, CARD, VIEWPORT)).toEqual({
      left: MARGIN,
      top: 800 - 300 - MARGIN,
    });
    expect(clampToViewport({ left: 300, top: 200 }, CARD, VIEWPORT)).toEqual({
      left: 300,
      top: 200,
    });
  });
});
