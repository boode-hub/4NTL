import { describe, expect, it } from 'vitest';
import { cropFor } from './screenshot';

describe('cropFor', () => {
  const rect = { x: 900, y: 40, width: 320, height: 500 };

  it('maps CSS pixels to the screenshot (1x)', () => {
    expect(cropFor(rect, 1280, { width: 1280, height: 720 })).toEqual({
      sx: 900,
      sy: 40,
      width: 320,
      height: 500,
    });
  });

  it('scales for high-DPI screens and zoom', () => {
    expect(cropFor(rect, 1280, { width: 1920, height: 1080 })).toEqual({
      sx: 1350,
      sy: 60,
      width: 480,
      height: 750,
    });
  });

  it('clamps to the image when the card runs off screen', () => {
    expect(
      cropFor({ x: 1100, y: -20, width: 320, height: 800 }, 1280, { width: 1280, height: 720 }),
    ).toEqual({
      sx: 1100,
      sy: 0,
      width: 180,
      height: 720,
    });
  });

  it('refuses nonsense', () => {
    expect(cropFor(rect, 0, { width: 1280, height: 720 })).toBeUndefined();
    expect(
      cropFor({ x: 5000, y: 0, width: 10, height: 10 }, 1280, { width: 1280, height: 720 }),
    ).toBeUndefined();
  });
});
