/**
 * Ground-attack scene for the Su-25T pages: height-map terrain wired as `world.terrain`, ground units on it,
 * air-to-ground weapons in flight (Vikhr and rocket smoke, bombs, gun tracers), impacts, the laser line from the
 * jet to the Shkval aim point while lasing, the Shkval field-of-view cone and (optional) the lock gimbal volume.
 * It reads the World and never changes it (except installing the terrain hook in the constructor / setWorld).
 */
import { CylinderGeometry, Group, Mesh, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three';
import type { World } from '../../sim/world';
import type { AgWeapon, Aircraft, EntityId } from '../../sim/types';
import type { AgWeaponId } from '../../data/types';
import { AG_WEAPONS } from '../../data/agWeapons';
import { shkvalAimPoint, shkvalFovDeg } from '../../sim/shkval';
import { D2R, dirFrom } from '../../sim/math';
import type { Stage } from '../stage';
import type { WorldView } from '../worldView';
import { LineBatch } from '../lines';
import { Shape, SymbolLayer } from '../symbols';
import { ORDER } from '../shared';
import { UNIT_PER_M } from '../units';
import { TerrainMesh, TerrainProps, type HeightField } from '../terrain';
import { GroundUnitLayer } from './groundUnits';
import { terrainHook } from './terrainHook';

export interface AttackLayers {
  /** Laser line jet → aim point while ЛД is on. */
  laser: boolean;
  /** Shkval field-of-view cone and ground footprint. */
  fov: boolean;
  /** Shkval lock gimbal volume (±35° azimuth, +15..−85° elevation), 5 km shell. */
  gimbal: boolean;
  /** Screen-size markers over ground units (visible from far away). */
  markers: boolean;
  smoke: boolean;
}

export interface AttackSceneOptions {
  field: HeightField;
  /** The attack jet whose Shkval and laser are drawn. */
  shooterId?: EntityId | null;
  layers?: Partial<AttackLayers>;
  /** TerrainProps density (0 = none). Default 0.5. */
  propDensity?: number;
}

interface Puff { x: number; y: number; z: number; t0: number; life: number; s0: number; s1: number; a: number }

const MOTOR_S: Partial<Record<AgWeaponId, number>> = { vikhr: 30, kh25ml: 6, kh29l: 6, kh29t: 6, kh58: 8, s8: 1.2, s13: 1.4 };
const LOCK_GIMBAL = { az: 35, up: 15, down: -85 };

export class AttackScene {
  readonly root = new Group();
  readonly overlay = new Group();
  readonly terrain: TerrainMesh;
  readonly props: TerrainProps;
  readonly units: GroundUnitLayer;
  readonly layers: AttackLayers;
  private world: World;
  private shooterId: EntityId | null;
  private readonly weapons = new Group();
  private readonly wMeshes = new Map<EntityId, { mesh: Mesh; lastPuff: number }>();
  private readonly geo: Record<'missile' | 'bomb' | 'rocket', CylinderGeometry>;
  private readonly wMat: MeshBasicMaterial;
  private readonly lines: LineBatch;
  private readonly symbols: SymbolLayer;
  private readonly marks: SymbolLayer;
  private puffs: Puff[] = [];
  private evCursor = 0;
  private focusClock = 0;
  private readonly offs: (() => void)[] = [];
  private readonly v = new Vector3();
  private readonly q = new Quaternion();
  private readonly zAxis = new Vector3(0, 0, 1);
  private disposed = false;

  constructor(private readonly stage: Stage, world: World, private view: WorldView | null, opts: AttackSceneOptions) {
    this.world = world;
    this.shooterId = opts.shooterId ?? null;
    this.layers = { laser: true, fov: true, gimbal: false, markers: true, smoke: true, ...opts.layers };
    world.terrain = terrainHook(opts.field);
    const p = stage.palette;
    this.root.name = 'attack-root';
    this.root.scale.setScalar(UNIT_PER_M);
    this.terrain = new TerrainMesh(opts.field, p, { lodDistancesM: [6000, 16000] });
    this.props = new TerrainProps(opts.field, p, { density: opts.propDensity ?? 0.5, viewDistanceM: 6000 });
    this.units = new GroundUnitLayer(p);
    this.geo = {
      missile: new CylinderGeometry(0.13, 0.13, 3, 6).rotateX(Math.PI / 2),
      bomb: new CylinderGeometry(0.2, 0.2, 2.2, 8).rotateX(Math.PI / 2),
      rocket: new CylinderGeometry(0.06, 0.06, 1.6, 5).rotateX(Math.PI / 2),
    };
    this.wMat = new MeshBasicMaterial({ color: p.smoke.clone().lerp(p.sun, 0.4) });
    this.root.add(this.terrain, this.props, this.units, this.weapons);
    stage.scene.add(this.root);

    this.overlay.name = 'attack-overlay';
    this.lines = new LineBatch(stage.shared, { capacity: 256 });
    this.symbols = new SymbolLayer(stage.shared, { capacity: 900 });
    this.marks = new SymbolLayer(stage.shared, { capacity: 96, depthTest: false, renderOrder: ORDER.overlay });
    this.overlay.add(this.lines, this.symbols, this.marks);
    stage.scene.add(this.overlay);
    this.evCursor = world.events.length;

    this.offs.push(stage.onFrame(() => this.sync(), { priority: 110, always: true }));
    this.setFocusNow();
  }

  /** Swap the World (drill restart). Installs the same terrain hook on the new world. */
  setWorld(world: World, field?: HeightField): void {
    world.terrain = field ? terrainHook(field) : this.world.terrain;
    this.world = world;
    this.evCursor = world.events.length;
    this.units.reset();
    for (const w of this.wMeshes.values()) w.mesh.removeFromParent();
    this.wMeshes.clear();
    this.puffs = [];
    this.setFocusNow();
  }

  setView(view: WorldView | null): void { this.view = view; }
  setShooter(id: EntityId | null): void { this.shooterId = id; }
  setLayer(k: keyof AttackLayers, on: boolean): void { this.layers[k] = on; }

  /** Scene objects the Shkval TV picture must not show (symbology, the tactical layer with the own jet, clouds). */
  tvHidden(): Object3D[] {
    const out: Object3D[] = [this.overlay];
    if (this.view) out.push(this.view.group);
    if (this.stage.env) out.push(this.stage.env.clouds);
    return out;
  }

  private shooter(): Aircraft | null {
    const a = this.shooterId ? this.world.aircraft.get(this.shooterId) : undefined;
    return a && a.ag ? a : null;
  }

  private setFocusNow(): void {
    const ac = this.shooter();
    const aim = ac ? shkvalAimPoint(this.world, ac) : null;
    const f = aim ?? ac?.pos ?? { x: 0, z: 0 };
    this.terrain.setFocus(f.x, f.z);
    this.props.setFocus(f.x, f.z);
  }

  private sync(): void {
    if (this.disposed) return;
    const w = this.world, t = w.t, pal = this.stage.palette;
    this.units.sync(w.groundUnits.values());

    // Weapons in flight.
    const seen = new Set<EntityId>();
    this.lines.reset();
    for (const wp of w.agWeapons.values()) {
      if (!wp.alive) continue;
      seen.add(wp.id);
      this.syncWeapon(wp, t);
    }
    for (const [id, it] of this.wMeshes) if (!seen.has(id)) { it.mesh.removeFromParent(); this.wMeshes.delete(id); }

    // Impacts.
    const ev = w.events;
    if (this.evCursor > ev.length) this.evCursor = 0;
    for (; this.evCursor < ev.length; this.evCursor++) {
      const e = ev[this.evCursor]!;
      if (e.type !== 'ag-impact') continue;
      const [x, y, z] = e.pos;
      const kind = AG_WEAPONS[e.weapon].kind;
      if (kind === 'gun') { this.puff(x, y + 1, z, t, 1.5, 3, 8, 0.7); continue; }
      this.view?.addExplosion({ x, y: y + 3, z }, e.t, kind !== 'rocket');
      for (let i = 0; i < 7; i++) this.puff(x + (i % 3 - 1) * 4, y + 4 + i * 5, z + ((i * 7) % 3 - 1) * 4, t + i * 0.2, 10, 12, 40 + i * 4, 0.7);
    }

    // Laser, field of view, gimbal.
    const ac = this.shooter();
    const sh = ac?.ag?.shkval;
    if (ac && sh?.on && ac.alive) {
      const aim = shkvalAimPoint(w, ac);
      const ax = ac.pos.x * UNIT_PER_M, ay = ac.pos.y * UNIT_PER_M, az = ac.pos.z * UNIT_PER_M;
      if (this.layers.laser && sh.laserOn && aim) {
        this.lines.seg(ax, ay - 0.002, az, aim.x * UNIT_PER_M, aim.y * UNIT_PER_M, aim.z * UNIT_PER_M,
          pal.warning.r, pal.warning.g, pal.warning.b, 0.95, pal.warning.r, pal.warning.g, pal.warning.b, 0.95, 2, 14, 90, 0.6);
      }
      if (this.layers.fov) {
        const fov = shkvalFovDeg(sh.zoom);
        const R = aim ? ac.pos.distanceTo(aim) : 8000;
        const corners: [number, number, number][] = [];
        for (const [sx, sy] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
          dirFrom(ac.heading + sh.az + sx * fov.h * D2R / 2, sh.el + sy * fov.v * D2R / 2, this.v);
          corners.push([ax + this.v.x * R * UNIT_PER_M, ay + this.v.y * R * UNIT_PER_M, az + this.v.z * R * UNIT_PER_M]);
        }
        const c = pal.symHi;
        for (let i = 0; i < 4; i++) {
          const a = corners[i]!, b = corners[(i + 1) % 4]!;
          this.lines.seg(ax, ay, az, a[0], a[1], a[2], c.r, c.g, c.b, 0.1, c.r, c.g, c.b, 0.55, 1, 0, 0, 1);
          this.lines.seg(a[0], a[1], a[2], b[0], b[1], b[2], c.r, c.g, c.b, 0.85, c.r, c.g, c.b, 0.85, 1.5, 0, 0, 1);
        }
      }
      if (this.layers.gimbal) this.drawGimbal(ac);
    }
    this.lines.commit();

    // Smoke and markers.
    this.symbols.reset();
    if (this.layers.smoke) {
      this.puffs = this.puffs.filter(p => t - p.t0 < p.life);
      const s = pal.smoke;
      for (const p of this.puffs) {
        const k = (t - p.t0) / p.life;
        if (k < 0) continue;
        this.symbols.put(p.x, p.y, p.z, Shape.puff, 3, s, p.a * (1 - k) * Math.min(1, k * 8 + 0.3), (p.s0 + (p.s1 - p.s0) * k) * UNIT_PER_M, (p.x * 997) % 1);
      }
    }
    for (const wp of w.agWeapons.values()) {
      if (!wp.alive || wp.type === 'gun25t') continue;
      this.symbols.put(wp.pos.x * UNIT_PER_M, wp.pos.y * UNIT_PER_M, wp.pos.z * UNIT_PER_M, Shape.glow, 10, pal.sun, 0.95);
    }
    this.symbols.commit();

    this.marks.reset();
    if (this.layers.markers) {
      const locked = sh?.lockedUnitId ?? null;
      for (const u of w.groundUnits.values()) {
        const x = u.pos.x * UNIT_PER_M, y = (u.pos.y + 14) * UNIT_PER_M, z = u.pos.z * UNIT_PER_M;
        if (u.alive) this.marks.put(x, y, z, Shape.diamond, 8, pal.hostile, 0.85);
        else this.marks.put(x, y, z, Shape.cross, 7, pal.symDim, 0.7);
        if (u.id === locked) this.marks.put(x, y, z, Shape.brackets, 18, pal.symHi, 1);
      }
      if (sh?.on && sh.groundStab && sh.stabPoint && !locked) {
        const sp = sh.stabPoint;
        this.marks.put(sp.x * UNIT_PER_M, (sp.y + 5) * UNIT_PER_M, sp.z * UNIT_PER_M, Shape.cross, 12, pal.symHi, 0.9);
      }
    }
    this.marks.commit();

    this.focusClock += 1;
    if (this.focusClock % 15 === 0) this.setFocusNow();
  }

  private syncWeapon(wp: AgWeapon, t: number): void {
    const kind = AG_WEAPONS[wp.type].kind;
    const pal = this.stage.palette;
    if (kind === 'gun') {
      const k = 0.03;
      const x = wp.pos.x, y = wp.pos.y, z = wp.pos.z;
      this.lines.seg(x * UNIT_PER_M, y * UNIT_PER_M, z * UNIT_PER_M, (x - wp.vel.x * k) * UNIT_PER_M, (y - wp.vel.y * k) * UNIT_PER_M, (z - wp.vel.z * k) * UNIT_PER_M,
        pal.sun.r, pal.sun.g, pal.sun.b, 1, pal.caution.r, pal.caution.g, pal.caution.b, 0.2, 2, 0, 0, 1);
      return;
    }
    let it = this.wMeshes.get(wp.id);
    if (!it) {
      it = { mesh: new Mesh(this.geo[kind === 'bomb' ? 'bomb' : kind === 'rocket' ? 'rocket' : 'missile'], this.wMat), lastPuff: -1 };
      this.wMeshes.set(wp.id, it);
      this.weapons.add(it.mesh);
    }
    it.mesh.position.copy(wp.pos);
    const sp = wp.vel.length();
    if (sp > 1) it.mesh.quaternion.copy(this.q.setFromUnitVectors(this.zAxis, this.v.copy(wp.vel).divideScalar(sp)));
    const motor = MOTOR_S[wp.type] ?? 0;
    const age = t - wp.launchedAt;
    if (motor > 0 && age < motor && t - it.lastPuff >= 0.05) {
      it.lastPuff = t;
      const thin = wp.type === 'vikhr' ? 0.45 : 0.6;
      this.puff(wp.pos.x, wp.pos.y, wp.pos.z, t, wp.type === 'vikhr' ? 7 : 4, 4, 22, thin);
    }
  }

  private puff(x: number, y: number, z: number, t0: number, life: number, s0: number, s1: number, a: number): void {
    if (this.puffs.length > 800) this.puffs.shift();
    this.puffs.push({ x: x * UNIT_PER_M, y: y * UNIT_PER_M, z: z * UNIT_PER_M, t0, life, s0, s1, a });
  }

  private drawGimbal(ac: Aircraft): void {
    const c = this.stage.palette.sym, R = 5000 * UNIT_PER_M;
    const ox = ac.pos.x * UNIT_PER_M, oy = ac.pos.y * UNIT_PER_M, oz = ac.pos.z * UNIT_PER_M;
    const at = (azDeg: number, elDeg: number): [number, number, number] => {
      dirFrom(ac.heading + azDeg * D2R, elDeg * D2R, this.v);
      return [ox + this.v.x * R, oy + this.v.y * R, oz + this.v.z * R];
    };
    const edge: [number, number, number][] = [];
    for (let a = -LOCK_GIMBAL.az; a <= LOCK_GIMBAL.az; a += 7) edge.push(at(a, LOCK_GIMBAL.up));
    for (let e = LOCK_GIMBAL.up; e >= LOCK_GIMBAL.down; e -= 10) edge.push(at(LOCK_GIMBAL.az, e));
    for (let a = LOCK_GIMBAL.az; a >= -LOCK_GIMBAL.az; a -= 7) edge.push(at(a, LOCK_GIMBAL.down));
    for (let e = LOCK_GIMBAL.down; e <= LOCK_GIMBAL.up; e += 10) edge.push(at(-LOCK_GIMBAL.az, e));
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i]!, b = edge[i + 1]!;
      this.lines.seg(a[0], a[1], a[2], b[0], b[1], b[2], c.r, c.g, c.b, 0.45, c.r, c.g, c.b, 0.45, 1, 6, 0, 0.5);
    }
    for (const [a, e] of [[-LOCK_GIMBAL.az, LOCK_GIMBAL.up], [LOCK_GIMBAL.az, LOCK_GIMBAL.up], [LOCK_GIMBAL.az, LOCK_GIMBAL.down], [-LOCK_GIMBAL.az, LOCK_GIMBAL.down]] as const) {
      const p = at(a, e);
      this.lines.seg(ox, oy, oz, p[0], p[1], p[2], c.r, c.g, c.b, 0.3, c.r, c.g, c.b, 0.1, 1, 0, 0, 1);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs) off();
    this.units.dispose();
    this.terrain.dispose();
    this.props.dispose();
    for (const g of Object.values(this.geo)) g.dispose();
    this.wMat.dispose();
    this.lines.geometry.dispose(); this.lines.material.dispose();
    this.symbols.geometry.dispose(); this.symbols.material.dispose();
    this.marks.geometry.dispose(); this.marks.material.dispose();
    this.root.removeFromParent();
    this.overlay.removeFromParent();
  }
}
