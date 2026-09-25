import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Color, Group, Material, Mesh, MeshBasicMaterial, Object3D, PropertyBinding, Vector3 } from 'three';
import { JetMesh, jetMaterials } from './jets';
import type { Palette } from './palette';

vi.mock('./assets', async () => {
  const { Box3, Group, Vector3 } = await import('three');
  return { AssetVisual: class extends Group {
    ready = false;
    content: Group | null = null;
    bounds = new Box3(new Vector3(-9, -1, -10), new Vector3(9, 4, 10));
    tint: Color | null = null;
    material: Material | null = null;
    disposed = false;
    constructor(_id: string, private opts: { onReady?: () => void }) { super(); }
    async finish(content = new Group()) {
      await Promise.resolve();
      if (this.disposed) return;
      this.content = content; this.add(content); this.ready = true; this.opts.onReady?.();
    }
    setTint(tint: Color | null) { this.tint = tint; }
    setMaterial(material: Material | null) { this.material = material; }
    override dispose() { this.disposed = true; this.clear(); }
  } };
});

type TestAsset = Group & {
  ready: boolean; content: Group | null; tint: Color | null; material: Material | null;
  disposed: boolean; finish(content?: Group): Promise<void>;
};
const palette = new Proxy({}, { get: (_, key) => new Color(key === 'friendly' ? 'blue' : key === 'hostile' ? 'red' : 'grey') }) as Palette;
const jets: JetMesh[] = [];
function jet(id: ConstructorParameters<typeof JetMesh>[0] = 'fa18c', opts = {}) {
  const j = new JetMesh(id, 'blue', palette, opts); jets.push(j); return j;
}
function exterior(j: JetMesh) { return j.getObjectByName('exterior:' + j.aircraft) as TestAsset; }
afterEach(() => { for (const j of jets.splice(0)) j.dispose(); });

describe('aircraft asset adoption', () => {
  it('keeps the procedural jet while pending and replaces it only after load; normalizes length', async () => {
    const onReady = vi.fn();
    const j = jet('fa18c', { onReady }); const a = exterior(j);
    expect(j.body.visible).toBe(true); expect(j.usingAsset).toBe(false);
    await a.finish();
    expect(j.body.visible).toBe(false); expect(j.usingAsset).toBe(true);
    expect(a.scale.x).toBeCloseTo(j.lengthM / 20);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('keeps every procedural part usable when loading does not complete', () => {
    const j = jet();
    j.setConfig({ gear: 1, flaps: 1, speedbrake: 1 });
    expect(j.body.visible).toBe(true); expect(j.usingAsset).toBe(false);
    expect(j.children.filter(c => c.name.startsWith('part:')).every(c => c.visible)).toBe(true);
  });

  it.each(['gear', 'flaps', 'speedbrake'] as const)('switches the complete airframe for deployed %s and restores the asset clean', async drive => {
    const j = jet(); const a = exterior(j);
    j.setConfig({ [drive]: 1 });
    await a.finish();
    expect(j.usingAsset).toBe(false); expect(j.body.visible).toBe(true);
    expect(j.children.some(c => c.name.startsWith('part:') && c.visible)).toBe(true);
    j.setConfig({ [drive]: 0 });
    expect(j.usingAsset).toBe(true); expect(j.body.visible).toBe(false);
    expect(j.children.filter(c => c.name.startsWith('part:')).some(c => c.visible)).toBe(false);
  });

  it('keeps asset material slots separate from procedural side and borrowed ghost materials', async () => {
    const j = jet(); const a = exterior(j); const content = new Group();
    const original = [new MeshBasicMaterial(), new MeshBasicMaterial()];
    const mesh = new Mesh(new BoxGeometry(), original); content.add(mesh);
    await a.finish(content);
    j.setSide('red', palette);
    expect(j.body.material).toBe(jetMaterials(palette, 'red'));
    expect(mesh.material).toBe(original);
    expect(a.tint).toEqual(palette.hostile);
    const ghost = new MeshBasicMaterial(); const dispose = vi.spyOn(ghost, 'dispose');
    j.setMaterial(ghost);
    expect(j.body.material).toBe(ghost); expect(a.material).toBe(ghost);
    j.setSide('neutral', palette);
    expect(a.material).toBe(null); expect(a.tint).toBe(null);
    j.dispose(); expect(dispose).not.toHaveBeenCalled();
    mesh.geometry.dispose(); original.forEach(m => m.dispose()); ghost.dispose();
  });

  it('does not attach late results or request rendering after disposal', async () => {
    const onReady = vi.fn(); const j = jet('f15c', { onReady }); const a = exterior(j);
    const dispose = vi.spyOn(a, 'dispose'); const parent = new Group(); parent.add(j);
    const pending = a.finish();
    j.dispose(); j.dispose(); await pending;
    expect(dispose).toHaveBeenCalledOnce(); expect(onReady).not.toHaveBeenCalled();
    expect(a.content).toBe(null); expect(j.parent).toBe(null); expect(j.usingAsset).toBe(false);
  });

  it('applies pre-load F-14 sweep to both asset pivots and narrows span without moving the fixed body', async () => {
    const j = jet('f14b'); const a = exterior(j); const content = new Group();
    const pivots: Object3D[] = [];
    for (const sign of [-1, 1]) {
      const pivot = new Group();
      pivot.name = PropertyBinding.sanitizeNodeName('wing.swing.' + (sign < 0 ? 'port' : 'starboard'));
      pivot.position.set(sign * 2.8, 0.18, 1.55);
      const tip = new Object3D(); tip.position.set(sign * 7, 0, 1); pivot.add(tip);
      pivots.push(pivot); content.add(pivot);
    }
    j.setSweep(68); await a.finish(content);
    expect(j.usingAsset).toBe(true);
    expect(pivots[0].rotation.y).toBeCloseTo(48 * Math.PI / 180);
    expect(pivots[1].rotation.y).toBeCloseTo(-48 * Math.PI / 180);
    const tipX = () => Math.abs(pivots[0].children[0].getWorldPosition(new Vector3()).x);
    const swept = tipX(); j.setSweep(20); const spread = tipX();
    expect(swept).toBeLessThan(spread);
    expect(content.position).toEqual(new Vector3());
    j.setSweep(NaN); expect(j.sweepDeg).toBe(20);
  });

  it('keeps the F-14 procedural fallback if a loaded model is missing wing pivots', async () => {
    const j = jet('f14b'); await exterior(j).finish();
    expect(j.usingAsset).toBe(false); expect(j.body.visible).toBe(true);
  });
});
