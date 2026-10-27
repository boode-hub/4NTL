/** Where the card should appear: at the right-click point, or next to the selection. */
import { pointRect, type Rect } from '../ui/position';

/** A right-click older than this is not the one that opened the menu. */
export const POINTER_MAX_AGE_MS = 30_000;

export interface PointerMark {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

/** Rect of the end of the current selection (or of the focused text field). */
export function selectionRect(doc: Document): Rect | undefined {
  const active = doc.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return active.getBoundingClientRect();
  }
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;
  const range = selection.getRangeAt(selection.rangeCount - 1);
  const lines = range.getClientRects();
  const last = lines.item(lines.length - 1);
  return last ?? range.getBoundingClientRect();
}

export function chooseAnchor(
  pointer: PointerMark | undefined,
  selection: Rect | undefined,
  viewportWidth: number,
  now: number,
): Rect {
  if (pointer && now - pointer.at <= POINTER_MAX_AGE_MS) return pointRect(pointer.x, pointer.y);
  if (selection && (selection.right > selection.left || selection.bottom > selection.top))
    return selection;
  // Nothing to anchor to (e.g. the selection was cleared): top-right corner.
  return pointRect(viewportWidth, 0);
}
