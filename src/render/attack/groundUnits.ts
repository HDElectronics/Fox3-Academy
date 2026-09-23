/**
 * Ground targets for the attack scene: low-poly tank, APC, truck, bunker, building, SAM launcher and AAA, placed
 * on the terrain from `world.groundUnits`. Authored in metres: add the layer under a 0.001-scaled root.
 * Drawing choices only (shape, colour): the sim's `sizeM` scales the model so the Shkval size rule matches.
 */
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { EntityId, GroundUnit, GroundUnitKind } from '../../sim/types';
import { GROUND_UNIT_SIZE } from '../../sim/ground';
import type { Palette } from '../palette';

/** Longest dimension (m) each model is authored at; the sim size scales it. */
const MODEL_SIZE: Record<GroundUnitKind, number> = { tank: 9.5, apc: 7.5, truck: 8, bunker: 14, building: 40, 'sam-site': 9, aaa: 6.5 };

/** Model scale so the drawn size follows the sim's `sizeM` (clamped 0.5..5). */
export function unitModelScale(u: Pick<GroundUnit, 'kind' | 'sizeM'>): number {
  return Math.max(0.5, Math.min(5, (u.sizeM || GROUND_UNIT_SIZE[u.kind]) / MODEL_SIZE[u.kind]));
}

type Part = [geo: BufferGeometry, mat: 'hull' | 'dark' | 'wall' | 'roof', x: number, y: number, z: number, rx?: number];

export class GroundUnitLayer extends Group {
  private readonly geos: BufferGeometry[] = [];
  private readonly mats: Record<'hull' | 'dark' | 'wall' | 'roof' | 'dead', MeshStandardMaterial>;
  private readonly items = new Map<EntityId, { obj: Group; dead: boolean }>();
  private readonly parts: Record<GroundUnitKind, Part[]>;

  constructor(palette: Palette) {
    super();
    this.name = 'attack-ground-units';
    const std = (c: Color) => new MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });
    this.mats = {
      hull: std(palette.dark.clone().lerp(palette.earth, 0.35)),
      dark: std(palette.dark.clone()),
      wall: std(palette.smoke.clone().lerp(palette.earth, 0.3)),
      roof: std(palette.dark.clone().lerp(palette.smoke, 0.4)),
      dead: std(palette.soot.clone()),
    };
    const box = (w: number, h: number, d: number) => this.keep(new BoxGeometry(w, h, d));
    const cyl = (rt: number, rb: number, len: number, n = 8) => this.keep(new CylinderGeometry(rt, rb, len, n));
    const barrel = cyl(0.12, 0.12, 4.6, 6);
    this.parts = {
      tank: [[box(3.4, 1.2, 6.8), 'hull', 0, 0.8, 0], [box(2.4, 0.8, 3), 'dark', 0, 1.8, 0.4], [barrel, 'dark', 0, 1.9, -2.6, Math.PI / 2]],
      apc: [[box(2.9, 1.9, 7.2), 'hull', 0, 1.2, 0], [box(1, 0.5, 1), 'dark', 0, 2.4, -1]],
      truck: [[box(2.4, 2, 2.2), 'dark', 0, 1.6, -2.7], [box(2.4, 2.4, 5), 'hull', 0, 1.8, 1], [box(2.2, 0.6, 7.6), 'dark', 0, 0.5, 0]],
      bunker: [[cyl(5.5, 7, 3, 8), 'wall', 0, 1.5, 0], [box(4, 1.2, 1), 'dark', 0, 1.6, -6.4]],
      building: [[box(24, 11, 40), 'wall', 0, 5.5, 0], [box(25, 1.2, 41), 'roof', 0, 11.6, 0]],
      'sam-site': [[box(2.8, 1.6, 8), 'hull', 0, 1.1, 0], [cyl(0.35, 0.35, 5.5, 6), 'dark', -0.6, 3, 0.4, 1.1], [cyl(0.35, 0.35, 5.5, 6), 'dark', 0.6, 3, 0.4, 1.1]],
      aaa: [[box(3, 1.4, 6.5), 'hull', 0, 0.9, 0], [box(2, 0.9, 2), 'dark', 0, 2, 0.5], [barrel, 'dark', 0, 2.8, -1.2, 1.1]],
    };
  }

  private keep<T extends BufferGeometry>(g: T): T { this.geos.push(g); return g; }

  private build(u: GroundUnit): Group {
    const g = new Group();
    for (const [geo, mat, x, y, z, rx] of this.parts[u.kind]) {
      const m = new Mesh(geo, this.mats[mat]);
      m.position.set(x, y, z);
      if (rx) m.rotation.x = rx;
      g.add(m);
    }
    g.scale.setScalar(unitModelScale(u));
    return g;
  }

  /** Follow the sim: create, move, char and drop unit models. */
  sync(units: Iterable<GroundUnit>): void {
    const seen = new Set<EntityId>();
    for (const u of units) {
      seen.add(u.id);
      let it = this.items.get(u.id);
      if (!it) { it = { obj: this.build(u), dead: false }; this.items.set(u.id, it); this.add(it.obj); }
      it.obj.position.set(u.pos.x, u.pos.y, u.pos.z);
      it.obj.rotation.y = -u.heading;
      if (!u.alive && !it.dead) {
        it.dead = true;
        it.obj.traverse(o => { if (o instanceof Mesh) o.material = this.mats.dead; });
        it.obj.scale.y *= 0.55;
      }
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { it.obj.removeFromParent(); this.items.delete(id); }
  }

  reset(): void { for (const it of this.items.values()) it.obj.removeFromParent(); this.items.clear(); }

  override dispose(): void {
    this.reset();
    for (const g of this.geos) g.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.removeFromParent();
  }
}
