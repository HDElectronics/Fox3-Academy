import { describe, expect, it, vi } from 'vitest';
import { Color, Mesh } from 'three';
import type { Palette } from './palette';
const state = vi.hoisted(() => ({ ready: null as (() => void) | null, release: vi.fn(), length: 4 }));
vi.mock('./assets', async () => {
  const { Group, Box3, Vector3 } = await import('three');
  class AssetVisual extends Group {
    constructor(readonly assetId: string, options: { onReady?: (v: AssetVisual) => void }) {
      super(); state.ready = () => options.onReady?.(this);
    }
    get bounds() { return new Box3(new Vector3(-.5, -.5, -state.length / 2), new Vector3(.5, .5, state.length / 2)); }
    setTint() {}
    override dispose() { state.release(); }
  }
  return { AssetVisual };
});
import { MissileVisual } from './missileVisual';
const palette = { missile: new Color('white'), dark: new Color('black') } as Palette;
describe('missile exterior adoption', () => {
  it('keeps the fallback until ready and fits SAM geometry to its display length', () => {
    state.length = 4;
    const visual = new MissileVisual('aim54c', 'sa10-missile', palette, 7);
    const fallback = visual.children[0] as Mesh, asset = visual.children[1]!;
    expect(fallback.visible).toBe(true);
    state.ready?.();
    expect(fallback.visible).toBe(false);
    expect(asset.scale.toArray()).toEqual([1.75, 1.75, 1.75]);
    visual.dispose();
  });
  it('keeps fallback for invalid loaded extents', () => {
    state.length = 0;
    const visual = new MissileVisual('aim7m', 'aim7m', palette, 3.66);
    state.ready?.();
    expect(visual.children[0]!.visible).toBe(true);
    visual.dispose();
  });
  it('releases the exterior once without disposing shared procedural geometry', () => {
    state.length = 4; state.release.mockClear();
    const visual = new MissileVisual('aim7m', 'aim7m', palette, 3.66);
    const spy = vi.spyOn((visual.children[0] as Mesh).geometry, 'dispose');
    visual.dispose(); visual.dispose();
    expect(state.release).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
  });
});
