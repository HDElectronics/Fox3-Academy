import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Vector3, type Material } from 'three';
import { World } from '../../sim/world';
import type { Palette } from '../palette';
import { GroundUnitLayer } from './groundUnits';
import { AgStoreVisual } from './attackScene';

const loads = vi.hoisted(() => [] as {
  id: string; visual: Group; resolve(): void; disposed: boolean; material: Material | null;
}[]);
vi.mock('../assets', async () => {
  const { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial } = await import('three');
  return { AssetVisual: class extends Group {
    content: Group | null = null;
    bounds: Box3 | null = null;
    private entry: typeof loads[number];
    constructor(id: string, opts: { onReady(v: Group): void }) {
      super();
      this.entry = { id, visual: this, disposed: false, material: null, resolve: () => {
        if (this.entry.disposed) return;
        this.content = new Group();
        this.content.add(new Mesh(new BoxGeometry(4, 4, 20).translate(0, 2, 0), this.entry.material ?? new MeshStandardMaterial()));
        this.bounds = new Box3().setFromObject(this.content);
        this.add(this.content);
        opts.onReady(this);
      } };
      loads.push(this.entry);
    }
    setMaterial(mat: Material | null): void {
      this.entry.material = mat;
      if (mat) this.content?.traverse(o => { if (o instanceof Mesh) o.material = mat; });
    }
    setTint(): void {}
    override dispose(): void { this.entry.disposed = true; this.removeFromParent(); }
  } };
});

const palette = {
  dark: new Color(), earth: new Color(), smoke: new Color(), soot: new Color(),
} as Palette;

beforeEach(() => { loads.length = 0; });

describe('reviewed ground visuals', () => {
  it('retains fallback until load and preserves placement, heading and target size', () => {
    const onReady = vi.fn();
    const layer = new GroundUnitLayer(palette, onReady);
    const world = new World(1);
    const unit = world.spawnGroundUnit({ kind: 'tank', side: 'red', pos: { x: 1000, y: 73, z: -2400 }, heading: Math.PI / 2, sizeM: 19 });
    layer.sync([unit]);
    const group = layer.children[0]!;
    const fallback = group.children[0]!;
    expect(fallback.visible).toBe(true);
    expect(loads[0]!.id).toBe('tank');
    loads[0]!.resolve();
    expect(fallback.visible).toBe(false);
    expect(onReady).toHaveBeenCalledOnce();
    expect(group.position.toArray()).toEqual([1000, 73, -2400]);
    expect(group.rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(group.scale.x).toBe(2);
    expect(loads[0]!.visual.scale.x).toBeCloseTo(9.5 / 20);
    layer.updateMatrixWorld(true);
    const dimensions = new Box3().setFromObject(loads[0]!.visual).getSize(new Vector3());
    expect(Math.max(dimensions.x, dimensions.z)).toBeCloseTo(19);
    layer.dispose();
  });

  it('keeps late-loaded wrecks charred and squashed and releases absent or reset units', () => {
    const layer = new GroundUnitLayer(palette);
    const world = new World(1);
    const unit = world.spawnGroundUnit({ kind: 'truck', side: 'red', pos: { x: 0, z: 0 } });
    layer.sync([unit]);
    unit.alive = false;
    layer.sync([unit]);
    const group = layer.children[0]!;
    expect(group.scale.y / group.scale.x).toBeCloseTo(0.55);
    const material = loads[0]!.material;
    expect(material).not.toBeNull();
    loads[0]!.resolve();
    loads[0]!.visual.traverse(o => { if (o instanceof Mesh) expect(o.material).toBe(material); });
    layer.sync([unit]);
    expect(group.scale.y / group.scale.x).toBeCloseTo(0.55);
    layer.sync([]);
    expect(loads[0]!.disposed).toBe(true);
    expect(layer.children).toHaveLength(0);
    layer.sync([unit]);
    layer.reset();
    loads[1]!.resolve();
    expect(loads[1]!.disposed).toBe(true);
    expect(layer.children).toHaveLength(0);
    layer.dispose();
  });
});

describe('reviewed A-G stores', () => {
  it('aligns the imported nose with flight direction and preserves that heading at zero speed', () => {
    const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
    const onReady = vi.fn();
    const store = new AgStoreVisual('kh29t', geometry, material, onReady);
    const fallback = store.children[0]!;
    expect(fallback.visible).toBe(true);
    loads[0]!.resolve();
    expect(loads[0]!.id).toBe('kh29t');
    expect(onReady).toHaveBeenCalledOnce();
    expect(fallback.visible).toBe(false);
    const velocity = new Vector3(200, -50, 30);
    store.setVelocity(velocity);
    const nose = new Vector3(0, 0, -1).applyQuaternion(store.quaternion);
    expect(nose.distanceTo(velocity.clone().normalize())).toBeLessThan(1e-8);
    const rotation = store.quaternion.clone();
    store.setVelocity(new Vector3());
    expect(store.quaternion.equals(rotation)).toBe(true);
    store.dispose(); geometry.dispose(); material.dispose();
  });

  it('cancels pending visuals without disposing shared fallback resources', () => {
    const geometry = new BoxGeometry(), material = new MeshStandardMaterial();
    const geometryDispose = vi.spyOn(geometry, 'dispose'), materialDispose = vi.spyOn(material, 'dispose');
    const store = new AgStoreVisual('fab250', geometry, material);
    const parent = new Group(); parent.add(store);
    store.dispose(); loads[0]!.resolve();
    expect(loads[0]!.disposed).toBe(true);
    expect(parent.children).toHaveLength(0);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    geometry.dispose(); material.dispose();
  });
});
