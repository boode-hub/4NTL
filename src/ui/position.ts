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

/** How far the card opens from the pointer: ~3 cm (CSS pixels are 1/96 inch). */
export const DISTANCE = 113;
/** Space between the anchor and the card when it has to go above/below instead. */
export const GAP = 10;
/** Minimum distance between the card and the viewport edge. */
export const MARGIN = 8;
/** The card's top sits this far above the pointer, so its header is level with it. */
const LIFT = 24;

export function pointRect(x: number, y: number): Rect {
  return { left: x, top: y, right: x, bottom: y };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Keeps a card of `card` size fully inside the viewport. */
export function clampToViewport(point: Point, card: Size, viewport: Size): Point {
  return {
    left: clamp(point.left, MARGIN, viewport.width - card.width - MARGIN),
    top: clamp(point.top, MARGIN, viewport.height - card.height - MARGIN),
  };
}

/**
 * Places the card about 3 cm to the side of the anchor (the pointer, the
 * selection or the right-clicked element) so it never covers what you clicked:
 * to the right, else to the left. In windows too narrow for that it goes just
 * below (or above) the anchor. An anchor at or past the right edge means
 * "top-right corner" (toolbar and address-bar lookups).
 */
export function placeCard(anchor: Rect, card: Size, viewport: Size): Point {
  const maxLeft = viewport.width - card.width - MARGIN;
  const maxTop = viewport.height - card.height - MARGIN;
  if (anchor.left >= viewport.width) return { left: Math.max(MARGIN, maxLeft), top: MARGIN };

  const top = clamp(anchor.top - LIFT, MARGIN, maxTop);
  const right = anchor.right + DISTANCE;
  if (right <= maxLeft) return { left: right, top };
  const left = anchor.left - DISTANCE - card.width;
  if (left >= MARGIN) return { left, top };

  // Too narrow to sit beside it: directly below, else above, else whichever has more room.
  const x = clamp(anchor.left, MARGIN, maxLeft);
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - card.height;
  if (below <= maxTop) return { left: x, top: below };
  if (above >= MARGIN) return { left: x, top: above };
  const roomBelow = viewport.height - anchor.bottom;
  return { left: x, top: clamp(roomBelow >= anchor.top ? below : above, MARGIN, maxTop) };
}
