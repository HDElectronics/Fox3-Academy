import { describe, expect, it } from 'vitest';
import { aimBelowBoresightDeg, srgbLut, toColourImage, vFovDeg } from './forwardView';

describe('forward view geometry', () => {
  it('square pictures have equal horizontal and vertical fields of view', () => {
    expect(vFovDeg(26, 1)).toBeCloseTo(26, 6);
    expect(vFovDeg(26, 2)).toBeLessThan(26);
  });

  it('puts the boresight at the HUD datum height', () => {
    // Boresight 42 % down a square 26° HUD: aim the camera below it so the boresight projects to y = 0.42.
    const aspect = 1, h = 26, bore = 0.42;
    const down = aimBelowBoresightDeg(bore, h, aspect);
    expect(down).toBeGreaterThan(0);
    // Project the boresight direction (down° above the camera axis) into picture y (0 top, 1 bottom).
    const f = 0.5 / Math.tan((h * Math.PI) / 360);
    const y = 0.5 - Math.tan((down * Math.PI) / 180) * f * aspect;
    expect(y).toBeCloseTo(bore, 9);
    expect(aimBelowBoresightDeg(0.5, h, aspect)).toBeCloseTo(0, 9);
  });
});

describe('colour read-back', () => {
  it('flips GL rows and applies the sRGB transfer', () => {
    const lut = srgbLut();
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    expect(lut[64]).toBeGreaterThan(64);             // linear mid-tones brighten in sRGB
    // 1 × 2 picture: bottom row red, top row blue in GL order (bottom-up).
    const src = [255, 0, 0, 255, 0, 0, 255, 255];
    const out = new Uint8ClampedArray(8);
    toColourImage(src, 1, 2, lut, out);
    expect([...out.slice(0, 4)]).toEqual([0, 0, 255, 255]);  // top row first
    expect([...out.slice(4, 8)]).toEqual([255, 0, 0, 255]);
  });
});
