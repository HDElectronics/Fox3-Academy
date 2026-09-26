import { describe, expect, it } from 'vitest';
import { heightAt } from '../terrain/heightmap';
import { createAttackField, terrainHook, LOS_LIFT_M } from './terrainHook';
import { toGreyImage, tvLut } from './shkvalTv';
import { unitModelScale } from './groundUnits';
import { MARK_FADE_S, MarkLayer, markFade, SMOKE_PUFFS, SMOKE_TOP_M, smokePuff } from './marks';
import { approachBearingsDeg } from './attackScene';
import { World } from '../../sim/world';
import { createSharedUniforms } from '../shared';
import { paletteFromTheme } from '../palette';

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

describe('target marks', () => {
  const pal = paletteFromTheme(Object.fromEntries(['friendly', 'hostile', 'missile', 'caution', 'warning', 'ok', 'skyHorizon'].map(k => [k, '#808080'])) as never);

  it('streams smoke puffs up a column that builds, widens and fades toward the top', () => {
    const out = { x: 0, y: 0, z: 0, size: 0, alpha: 0 };
    // Just after the smoke goes down only the lowest puffs are visible.
    let shown = 0, top = 0;
    for (let i = 0; i < SMOKE_PUFFS; i++) {
      const p = smokePuff(i, SMOKE_PUFFS, 2, 0.3, out);
      if (p.alpha > 0) { shown++; top = Math.max(top, p.y); }
    }
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(SMOKE_PUFFS);
    expect(top).toBeLessThan(SMOKE_TOP_M * 0.6);
    // A developed column reaches near the top; higher puffs are wider.
    const ps = Array.from({ length: SMOKE_PUFFS }, (_, i) => ({ ...smokePuff(i, SMOKE_PUFFS, 120, 0.3, out) })).sort((a, b) => a.y - b.y);
    expect(ps.at(-1)!.y).toBeGreaterThan(SMOKE_TOP_M * 0.8);
    expect(ps.at(-1)!.size).toBeGreaterThan(ps[0]!.size);
    for (const p of ps) { expect(p.alpha).toBeGreaterThanOrEqual(0); expect(p.alpha).toBeLessThanOrEqual(1); }
  });

  it('fades an ended mark out over MARK_FADE_S', () => {
    expect(markFade(null)).toBe(1);
    expect(markFade(0)).toBe(1);
    expect(markFade(MARK_FADE_S / 2)).toBeCloseTo(0.5, 5);
    expect(markFade(MARK_FADE_S + 1)).toBe(0);
  });

  it('draws live smoke, keeps it through the fade and drops it after', () => {
    const w = new World(1);
    const layer = new MarkLayer(createSharedUniforms(), pal);
    const m = w.spawnMark({ type: 'smoke', colour: 'orange', side: 'blue', pos: { x: 0, y: 0, z: 0 } });
    w.spawnMark({ type: 'laser', side: 'blue', pos: { x: 100, y: 0, z: 0 } });
    for (let i = 0; i < 60 * 20; i++) w.step(1 / 60);
    layer.sync(w);
    expect(layer.puffCount).toBe(SMOKE_PUFFS);
    w.endMark(m.id);
    w.step(1 / 60); layer.sync(w);
    expect(layer.puffCount).toBeGreaterThan(0);
    for (let i = 0; i < 60 * (MARK_FADE_S + 1); i++) w.step(1 / 60);
    layer.sync(w);
    expect(layer.puffCount).toBe(0);
    layer.dispose();
  });
});

describe('attack heading wedge', () => {
  it('turns allowed headings into approach bearings, wrapping through north', () => {
    const b = approachBearingsDeg(350, 20, 5);
    expect(b[0]).toBe(170);
    expect(b.at(-1)).toBe(200);
    expect(b.length).toBe(7);
    expect(approachBearingsDeg(90, 90)).toEqual([270, 270]);
  });
});
