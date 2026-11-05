/**
 * "Copy card as image": a screenshot of the visible tab, cut down to the card.
 * captureVisibleTab is allowed in the tab the user just used 4NTL in (activeTab).
 */

import type { CardRect } from '../core/messages';

export interface Crop {
  readonly sx: number;
  readonly sy: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Maps the card's CSS-pixel box onto the screenshot's device pixels (the ratio
 * covers zoom and high-DPI screens), clamped to the image.
 */
export function cropFor(
  rect: CardRect,
  viewportWidth: number,
  image: { readonly width: number; readonly height: number },
): Crop | undefined {
  const scale = image.width / viewportWidth;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  const sx = Math.max(0, Math.round(rect.x * scale));
  const sy = Math.max(0, Math.round(rect.y * scale));
  const width = Math.min(image.width - sx, Math.round(rect.width * scale));
  const height = Math.min(image.height - sy, Math.round(rect.height * scale));
  return width > 0 && height > 0 ? { sx, sy, width, height } : undefined;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** PNG of the card as a data: URL. Throws when the tab can't be captured. */
export async function captureCard(
  windowId: number | undefined,
  rect: CardRect,
  viewportWidth: number,
): Promise<string> {
  const shot =
    windowId === undefined
      ? await chrome.tabs.captureVisibleTab({ format: 'png' })
      : await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bytes = Uint8Array.from(atob(shot.slice(shot.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  try {
    const crop = cropFor(rect, viewportWidth, bitmap);
    if (!crop) throw new Error('The card is not on screen.');
    const canvas = new OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas.');
    context.drawImage(
      bitmap,
      crop.sx,
      crop.sy,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    const png = await canvas.convertToBlob({ type: 'image/png' });
    return `data:image/png;base64,${base64(new Uint8Array(await png.arrayBuffer()))}`;
  } finally {
    bitmap.close();
  }
}
