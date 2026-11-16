import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { pictureSize, placeBoresight, srgbLut, toColourImage, vFovDeg } from './forwardView';
import { orientationQuaternion } from './units';

/** Picture position (0..1 from the top left) of the point `dist` units along a camera's boresight. */
function boresightOnPicture(cam: PerspectiveCamera, q: Quaternion): { x: number; y: number } {
  cam.position.set(0, 0, 0);
  cam.quaternion.copy(q);
  cam.updateMatrixWorld();
  const p = new Vector3(0, 0, -10).applyQuaternion(q).project(cam);
  return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
}

describe('forward view geometry', () => {
  it('square pictures have equal horizontal and vertical fields of view', () => {
    expect(vFovDeg(26, 1)).toBeCloseTo(26, 6);
    expect(vFovDeg(26, 2)).toBeLessThan(26);
  });

  it('puts the boresight exactly where the HUD draws it, level or banked', () => {
    const cases = [
      { boreX: 0.5, boreY: 0.42, heading: 0.3, pitch: 0.1, roll: 0 },      // Su-25T ИЛС
      { boreX: 0.5, boreY: 0.61, heading: 2.0, pitch: -0.05, roll: 0.6 },  // landing HUD, banked
      { boreX: 0.5, boreY: 0.32, heading: -1, pitch: 0.4, roll: -1.2 },    // gun sight
    ];
    for (const c of cases) {
      const cam = new PerspectiveCamera(26, 4 / 3, 0.01, 100);
      placeBoresight(cam, 224, 168, c.boreX, c.boreY);
      cam.updateProjectionMatrix();
      const at = boresightOnPicture(cam, orientationQuaternion(c.heading, c.pitch, c.roll));
      expect(at.x).toBeCloseTo(c.boreX, 6);
      expect(at.y).toBeCloseTo(c.boreY, 6);
    }
  });

  it('banks the horizon the same way the HUD ladder turns (right bank: horizon rolls left, counter-clockwise)', () => {
    const cam = new PerspectiveCamera(26, 1, 0.01, 100);
    placeBoresight(cam, 100, 100, 0.5, 0.5);
    cam.updateProjectionMatrix();
    cam.quaternion.copy(orientationQuaternion(0, 0, 0.5));
    cam.updateMatrixWorld();
    // Two horizon points far ahead, left and right of the nose.
    const l = new Vector3(-10, 0, -100).project(cam), r = new Vector3(10, 0, -100).project(cam);
    // Right bank: the right side of the horizon rises on the picture (canvas rotate(-bank) turns it the same way).
    expect(r.y).toBeGreaterThan(l.y);
  });
});

describe('picture shape follows the HUD glass', () => {
  it('keeps the constructor size for the matching shape', () => {
    expect(pictureSize(192 * 192, 1)).toEqual({ width: 192, height: 192 });
    expect(pictureSize(224 * 168, 4 / 3)).toEqual({ width: 224, height: 168 });
  });

  it('gives a wide glass a wide picture at about the same pixel count (no stretch when drawn over the glass)', () => {
    for (const a of [0.7, 1.18, 2.64, 3.5]) {
      const s = pictureSize(192 * 192, a);
      expect(s.width / s.height).toBeCloseTo(a, 1);
      expect(Math.abs(s.width * s.height - 192 * 192) / (192 * 192)).toBeLessThan(0.02);
    }
  });

  it('holds odd shapes and bad input to sane sizes', () => {
    expect(pictureSize(192 * 192, 40).width / pictureSize(192 * 192, 40).height).toBeCloseTo(4, 1);
    expect(pictureSize(192 * 192, 0)).toEqual({ width: 192, height: 192 });
    expect(pictureSize(192 * 192, NaN)).toEqual({ width: 192, height: 192 });
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
