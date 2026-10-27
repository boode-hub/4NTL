/** Pure placement math for the floating card (viewport coordinates, CSS pixels). */

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly left: number;
  readonly top: number;
}

/** Space between the anchor and the card. */
export const GAP = 10;
/** Minimum distance between the card and the viewport edge. */
export const MARGIN = 8;

export function pointRect(x: number, y: number): Rect {
  return { left: x, top: y, right: x, bottom: y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Places the card just below the anchor (the pointer or the selection), left
 * edges aligned. Flips above when there's no room below, and always stays
 * fully inside the viewport.
 */
export function placeCard(anchor: Rect, card: Size, viewport: Size): Point {
  const left = clamp(anchor.left, MARGIN, viewport.width - card.width - MARGIN);

  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - card.height;
  const maxTop = viewport.height - card.height - MARGIN;
  if (below <= maxTop) return { left, top: below };
  if (above >= MARGIN) return { left, top: above };

  // Fits neither side: use the roomier side and let the viewport clamp it.
  const roomBelow = viewport.height - anchor.bottom;
  return { left, top: clamp(roomBelow >= anchor.top ? below : above, MARGIN, maxTop) };
}
