import { describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightmap';
import { createAttackField, terrainHook, LOS_LIFT_M } from './terrainHook';
import { toGreyImage, tvLut } from './shkvalTv';
import { unitModelScale } from './groundUnits';

describe('attack terrain hook', () => {
  it('flattens the pads and samples the same heights as the field', () => {
    const field = createAttackField({ seed: 7, pads: [{ x: 0, z: 0, radiusM: 500 }] });
    const hook = terrainHook(field);
    const h0 = hook.heightAt(0, 0);
    expect(hook.heightAt(300, -200)).toBeCloseTo(h0, 6);
    expect(hook.heightAt(4000, 3000)).toBe(heightAt(field, 4000, 3000));
  });

  it('sees a unit sitting on flat ground (ground-level end points are lifted)', () => {
    const field = createAttackField({ maxReliefM: 0 });
    const hook = terrainHook(field);
    expect(hook.lineOfSight({ x: 0, y: 1500, z: 12000 }, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(LOS_LIFT_M).toBeGreaterThan(0);
  });

  it('keeps ridges blocking', () => {
    const field = createAttackField({ seed: 3, maxReliefM: 600 });
    const hook = terrainHook(field);
    // Look along a low line through the whole map: some ridge must block a 5 m high ray.
    let blocked = false;
    for (let x = -15000; x <= 15000 && !blocked; x += 3000) {
      blocked = !hook.lineOfSight({ x, y: hook.heightAt(x, 15000) + 5, z: 15000 }, { x, y: hook.heightAt(x, -15000) + 5, z: -15000 });
    }
    expect(blocked).toBe(true);
  });
});

describe('Shkval TV picture', () => {
  it('maps luma monotonically from black to white', () => {
    const lut = tvLut();
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    for (let i = 1; i < 256; i++) expect(lut[i]!).toBeGreaterThanOrEqual(lut[i - 1]!);
  });

  it('flips GL rows and writes grey RGBA', () => {
    // 1 × 2 picture: bottom row (first in GL order) white, top row black.
    const src = [255, 255, 255, 255, 0, 0, 0, 255];
    const out = new Uint8ClampedArray(8);
    const id = Uint8ClampedArray.from({ length: 256 }, (_, i) => i);
    toGreyImage(src, 1, 2, id, out);
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect(out[4]).toBeGreaterThan(250);
    expect(out[4]).toBe(out[5]);
  });
});

describe('ground unit models', () => {
  it('scale with the sim size so a 60 m bunker draws larger than a 20 m one', () => {
    expect(unitModelScale({ kind: 'bunker', sizeM: 60 })).toBeGreaterThan(unitModelScale({ kind: 'bunker', sizeM: 20 }));
    expect(unitModelScale({ kind: 'tank', sizeM: 10 })).toBeCloseTo(10 / 9.5, 5);
  });
});
