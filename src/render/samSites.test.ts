import { describe, expect, it, vi } from 'vitest';
import { Color, Group, Mesh, PerspectiveCamera, Vector3, type Box3, type Material } from 'three';
import { SAMS } from '../data/sams';
import { World } from '../sim/world';
import { samDrill } from '../sim/scenarios';
import { SamSiteLayer, circlePoints, samMissileLike, samShortName, samTagText, type SamDrawContext, type SamSiteLike } from './samSites';
import { LabelPriority } from './tags';
import type { Stage } from './stage';
import type { Palette } from './palette';

const assets = vi.hoisted(() => [] as { id: string; group: Group; material: Material | null; disposed: boolean; resolve(): void }[]);
vi.mock('./assets', async () => {
  const { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial } = await import('three');
  return { AssetVisual: class extends Group {
    content: Group | null = null;
    bounds: Box3 | null = null;
    private entry: typeof assets[number];
    constructor(id: string, opts: { onReady(v: Group): void }) {
      super();
      this.entry = { id, group: this, material: null, disposed: false, resolve: () => {
        if (this.entry.disposed) return;
        this.content = new Group();
        this.content.add(new Mesh(new BoxGeometry(4, 8, 12), this.entry.material ?? new MeshStandardMaterial()));
        this.bounds = new Box3().setFromObject(this.content);
        this.add(this.content); opts.onReady(this);
      } }; assets.push(this.entry);
    }
    setTint(): void {}
    setMaterial(material: Material | null): void { this.entry.material = material; }
    override dispose(): void { this.entry.disposed = true; this.removeFromParent(); }
  } };
});
vi.mock('./tags', async importOriginal => {
  const original = await importOriginal<typeof import('./tags')>();
  const { Group } = await import('three');
  return { ...original, Tag: class {
    obj = new Group(); visible = false;
    set(): void {} setTone(): void {} setDead(): void {} dispose(): void {}
  } };
});

const site = (o: Partial<SamSiteLike> = {}): SamSiteLike => ({
  id: 'sam1', type: 'sa11', side: 'red', pos: { x: 0, y: 0, z: 0 }, state: 'search', targetId: null, active: true, ...o,
});

describe('SAM site rendering helpers', () => {
  it('names sites by their NATO short name', () => {
    expect(samShortName('sa10')).toBe('SA-10');
    expect(samShortName('sa15')).toBe('SA-15');
  });

  it('tags the radar state and the ring radius in the chosen units', () => {
    expect(samTagText(site(), 'metric')).toMatchObject({ title: 'SA-11', sub: 'SEARCH · RING 35 km', tone: null });
    expect(samTagText(site({ state: 'track' }), 'metric').tone).toBe('caution');
    expect(samTagText(site({ state: 'engage' }), 'metric')).toMatchObject({ tone: 'warning' });
    expect(samTagText(site({ state: 'engage' }), 'metric').sub).toContain('LAUNCH');
    expect(samTagText(site({ active: false }), 'metric').sub).toContain('SILENT');
    expect(samTagText(site({ alive: false }), 'metric').sub).toContain('DESTROYED');
    expect(samTagText(site(), 'imperial').sub).toMatch(/nm$/);
  });

  it('draws a closed ring at the requested radius', () => {
    const pts = circlePoints(10, 0.1, -5, SAMS.sa15.threatRingKm, 32);
    expect(pts).toHaveLength(33);
    for (const [x, y, z] of pts) {
      expect(Math.hypot(x - 10, z + 5)).toBeCloseTo(12, 6);
      expect(y).toBe(0.1);
    }
    expect(pts[0][0]).toBeCloseTo(pts[32][0], 9);
  });

  it('ranks site tags below aircraft and missiles, above annotations', () => {
    expect(LabelPriority.site).toBeGreaterThan(LabelPriority.missile);
    expect(LabelPriority.site).toBeLessThan(LabelPriority.annotation);
  });

  it('adapts a SAM in flight to the missile renderer, reusing the object', () => {
    const w = new World(3);
    const d = samDrill(w, 'f15c', 'sa11', { range: 25000 });
    for (let i = 0; i < 60 * 40 && !d.missiles().length; i++) w.step(1 / 60);
    const m = d.missiles()[0];
    expect(m).toBeDefined();
    const like = samMissileLike(m);
    expect(like.display?.name).toBe('SA-11');
    expect(like.display).toHaveProperty('visualAssetId', 'sa11-missile');
    expect(like.shooterId).toBe(d.siteId);
    expect(like.guidance).toBe(m.guided ? 'sarh' : 'ballistic');
    expect(like.pos).toBeInstanceOf(Vector3);
    expect(like.pos.distanceTo(m.pos)).toBe(0);
    expect(samMissileLike(m, like)).toBe(like);
  });
});


describe('reviewed SAM site visuals', () => {
  it('retains ground placement and boosted size through late loading, wreck state and removal', () => {
    assets.length = 0;
    const p = Object.fromEntries(['dark', 'friendly', 'hostile', 'soot', 'caution', 'warning'].map(k => [k, new Color()])) as unknown as Palette;
    const stage = { palette: p, camera: new PerspectiveCamera(), pxPerUnit: () => 100, requestRender: vi.fn() } as unknown as Stage;
    const group = new Group();
    const unregister = vi.fn();
    const layer = new SamSiteLayer(stage, group, () => unregister);
    const s = site({ pos: { x: 1000, y: 200, z: 3000 } });
    layer.sync([s]);
    const mesh = group.children[0]!;
    const fallback = mesh.children[0]!;
    expect(fallback.visible).toBe(true);
    const context = { palette: p, units: 'metric', rings: false, labels: false, illumination: false,
      showSide: () => true, minPx: 10, labelTick: false, symbols: { put: vi.fn() } } as unknown as SamDrawContext;
    layer.draw(context);
    expect(mesh.position.toArray()).toEqual([1, 0.2, 3]);
    s.alive = false;
    layer.draw(context);
    expect(mesh.scale.y / mesh.scale.x).toBeCloseTo(0.55);
    expect(assets[0]!.material).not.toBeNull();
    assets[0]!.resolve();
    expect(assets[0]!.id).toBe('sa11');
    expect(stage.requestRender).toHaveBeenCalledOnce();
    expect(fallback.visible).toBe(false);
    expect(assets[0]!.group.scale.x).toBeCloseTo(9 / 12);
    assets[0]!.group.traverse(o => { if (o instanceof Mesh) expect(o.material).toBe(assets[0]!.material); });
    layer.sync([]);
    expect(assets[0]!.disposed).toBe(true);
    expect(group.children).toHaveLength(0);
    expect(unregister).toHaveBeenCalledOnce();
    layer.sync([s]); layer.clear(); assets[1]!.resolve();
    expect(assets[1]!.disposed).toBe(true);
    expect(group.children).toHaveLength(0);
  });
});
