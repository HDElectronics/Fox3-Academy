/**
 * [OWNER: render] BfmAids: 3D teaching aids for the close-combat (WVR) lessons, drawn over a WorldView of a live
 * World. Game-tutorial symbology, not physics: tracers from the sim's `tracer` events (short fading streaks),
 * the player's lift-vector arrow, ground-projected turn circles for both jets, the bandit's plane of motion, the
 * line of sight and the player's velocity vector coloured lead / pure / lag, and sparks on `gun-hit`.
 * Every layer toggles at runtime. Positions in, like the rest of the kit, are sim metres.
 */
import { CircleGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import type { Stage } from './stage';
import { FramePriority } from './stage';
import { LineBatch } from './lines';
import { Shape, SymbolLayer } from './symbols';
import { ORDER } from './shared';
import { UNIT_PER_M } from './units';
import type { World } from '../sim/world';
import type { Aircraft, EntityId, SimEvent } from '../sim/types';
import { liftVector } from '../sim/flight';

export interface BfmAidLayers {
  tracers: boolean;
  liftVector: boolean;
  turnCircles: boolean;
  planeOfMotion: boolean;
  pursuit: boolean;
  hits: boolean;
}

export const DEFAULT_BFM_AIDS: BfmAidLayers = {
  tracers: true, liftVector: true, turnCircles: true, planeOfMotion: true, pursuit: true, hits: true,
};

export type PursuitTone = 'lead' | 'pure' | 'lag' | null;

export interface BfmAidsOptions {
  /** The player's jet (lift vector, line of sight origin, velocity vector). */
  me: EntityId;
  /** The bandit (plane of motion, line of sight target). */
  bandit: EntityId;
  layers?: Partial<BfmAidLayers>;
  /** Pursuit class for the line-of-sight colour (page logic); null draws it neutral. */
  pursuit?: () => PursuitTone;
}

/** Seconds a tracer streak stays visible. */
export const TRACER_LIFE_S = 1.4;
/** Streak length in seconds of bullet flight. */
const STREAK_S = 0.03;
const SPARK_LIFE_S = 0.6;
const LIFT_ARROW_M = 28;
const CIRCLE_SEGS = 72;
/** Skip turn circles wider than this (nearly straight flight). */
const MAX_CIRCLE_M = 25_000;

interface Tracer { t0: number; px: number; py: number; pz: number; vx: number; vy: number; vz: number; mine: boolean }
interface Spark { t0: number; target: EntityId; n: number }

const _a = new Vector3(), _b = new Vector3(), _c = new Vector3(), _u = new Vector3(), _n = new Vector3(), _l = new Vector3();
const _q = new Quaternion(), _z = new Vector3(0, 0, 1);

/**
 * Turn circle of a jet flying `ac` now: centre, radius (m) and the unit normal-acceleration direction, or null
 * when it is (nearly) straight. Uses the load factor along the lift vector plus gravity across the path.
 */
export function turnCircle(ac: Aircraft, g0 = 9.80665): { centre: Vector3; radius: number; n: Vector3; u: Vector3 } | null {
  const v = ac.vel.length();
  if (v < 1) return null;
  const u = new Vector3().copy(ac.vel).divideScalar(v);
  const lift = liftVector(ac, _l);
  // gravity component across the flight path
  const gx = u.y * u.x * g0, gy = -g0 + u.y * u.y * g0, gz = u.y * u.z * g0;
  const an = new Vector3(lift.x * ac.g * g0 + gx, lift.y * ac.g * g0 + gy, lift.z * ac.g * g0 + gz);
  const a = an.length();
  if (a < 0.5) return null;
  const radius = v * v / a;
  if (radius > MAX_CIRCLE_M) return null;
  const n = an.divideScalar(a);
  return { centre: new Vector3().copy(ac.pos).addScaledVector(n, radius), radius, n, u };
}

export class BfmAids {
  readonly layers: BfmAidLayers;
  private world: World;
  private opts: BfmAidsOptions;
  private lines: LineBatch;
  private overlayLines: LineBatch;
  private glow: SymbolLayer;
  private disc: Mesh<CircleGeometry, MeshBasicMaterial>;
  private tracers: Tracer[] = [];
  private sparks: Spark[] = [];
  private offWorld: () => void = () => {};
  private offFrame: () => void;
  private disposed = false;
  private col: { mine: Color; theirs: Color; tracer: Color; lead: Color; pure: Color; lag: Color; dim: Color; hi: Color; spark: Color };

  constructor(private stage: Stage, world: World, opts: BfmAidsOptions) {
    this.world = world;
    this.opts = opts;
    this.layers = { ...DEFAULT_BFM_AIDS, ...(opts.layers ?? {}) };
    const p = stage.palette;
    this.col = {
      mine: p.friendly, theirs: p.hostile, tracer: p.caution, lead: p.caution, pure: p.ok, lag: p.datalink,
      dim: p.symDim, hi: p.symHi, spark: p.warning,
    };
    const sh = stage.shared;
    this.lines = new LineBatch(sh, { capacity: 512 });
    this.overlayLines = new LineBatch(sh, { capacity: 64, depthTest: false, renderOrder: ORDER.overlay });
    this.glow = new SymbolLayer(sh, { capacity: 256, additive: true, renderOrder: ORDER.points + 1 });
    this.disc = new Mesh(new CircleGeometry(1, 64), new MeshBasicMaterial({
      color: p.hostile.clone(), transparent: true, opacity: 0.1, side: DoubleSide, depthWrite: false, toneMapped: false,
    }));
    this.disc.renderOrder = ORDER.volume;
    this.disc.visible = false;
    stage.scene.add(this.lines, this.overlayLines, this.glow, this.disc);
    this.listen();
    this.offFrame = stage.onFrame(() => this.update(), { priority: FramePriority.late, always: true });
    stage.track(this);
  }

  /** Swap to another World (a retry): clears tracers and sparks. */
  setWorld(world: World, ids?: { me: EntityId; bandit: EntityId }): void {
    this.world = world;
    if (ids) { this.opts.me = ids.me; this.opts.bandit = ids.bandit; }
    this.tracers.length = 0;
    this.sparks.length = 0;
    this.listen();
    this.update();
  }

  setLayer(k: keyof BfmAidLayers, on: boolean): void { this.layers[k] = on; this.update(); this.stage.requestRender(); }

  setLayers(l: Partial<BfmAidLayers>): void { Object.assign(this.layers, l); this.update(); this.stage.requestRender(); }

  /** Live tracer count (tests, debugging). */
  get tracerCount(): number { return this.tracers.length; }

  private listen(): void {
    this.offWorld();
    this.offWorld = this.world.on((e: SimEvent) => {
      if (e.type === 'tracer') {
        this.tracers.push({ t0: e.t, px: e.pos[0], py: e.pos[1], pz: e.pos[2], vx: e.vel[0], vy: e.vel[1], vz: e.vel[2], mine: e.shooterId === this.opts.me });
        if (this.tracers.length > 200) this.tracers.shift();
      } else if (e.type === 'gun-hit') {
        this.sparks.push({ t0: e.t, target: e.targetId, n: e.hits });
        if (this.sparks.length > 40) this.sparks.shift();
      }
    });
  }

  private update(): void {
    if (this.disposed) return;
    const w = this.world, t = w.t, L = this.layers, c = this.col;
    const lines = this.lines, over = this.overlayLines, glow = this.glow;
    lines.reset(); over.reset(); glow.reset();
    const k = UNIT_PER_M;
    const me = w.get(this.opts.me), bandit = w.get(this.opts.bandit);

    // ---- tracers: short streaks along the bullet path, fading out
    let keep = 0;
    for (const tr of this.tracers) {
      const age = t - tr.t0;
      if (age > TRACER_LIFE_S || age < -0.5) continue;
      this.tracers[keep++] = tr;
      if (!L.tracers) continue;
      const a0 = Math.max(0, age - STREAK_S), fade = 1 - age / TRACER_LIFE_S;
      const col = c.tracer;
      lines.seg(
        (tr.px + tr.vx * a0) * k, (tr.py + tr.vy * a0) * k, (tr.pz + tr.vz * a0) * k,
        (tr.px + tr.vx * age) * k, (tr.py + tr.vy * age) * k, (tr.pz + tr.vz * age) * k,
        col.r, col.g, col.b, 0.25 * fade, col.r, col.g, col.b, fade, 2.4);
      glow.put((tr.px + tr.vx * age) * k, (tr.py + tr.vy * age) * k, (tr.pz + tr.vz * age) * k, Shape.glow, 7, col, 0.7 * fade);
    }
    this.tracers.length = keep;

    // ---- sparks on gun hits
    keep = 0;
    for (const s of this.sparks) {
      const age = t - s.t0;
      if (age > SPARK_LIFE_S || age < -0.5) continue;
      this.sparks[keep++] = s;
      const tgt = w.get(s.target);
      if (!L.hits || !tgt) continue;
      const fade = 1 - age / SPARK_LIFE_S;
      const n = Math.min(6, 2 + s.n);
      for (let i = 0; i < n; i++) {
        const ang = (i * 2.399 + s.t0 * 7) % (Math.PI * 2), r = 3 + 5 * ((i * 0.618) % 1) + age * 20;
        glow.put((tgt.pos.x + Math.cos(ang) * r) * k, (tgt.pos.y + Math.sin(ang) * r * 0.6) * k, (tgt.pos.z + Math.sin(ang) * r) * k,
          Shape.glow, 10 + 6 * fade, i % 2 ? c.spark : c.tracer, fade);
      }
    }
    this.sparks.length = keep;

    // ---- lift vector arrow on the player's jet
    if (L.liftVector && me && me.alive) {
      const l = liftVector(me, _l);
      _a.copy(me.pos).addScaledVector(l, 6);
      _b.copy(me.pos).addScaledVector(l, LIFT_ARROW_M);
      _u.copy(me.vel).normalize();
      const hi = c.hi;
      over.seg(_a.x * k, _a.y * k, _a.z * k, _b.x * k, _b.y * k, _b.z * k, hi.r, hi.g, hi.b, 0.95, hi.r, hi.g, hi.b, 0.95, 2.5);
      for (const s of [1, -1]) {
        _c.copy(_b).addScaledVector(l, -7).addScaledVector(_u, 4.5 * s);
        over.seg(_b.x * k, _b.y * k, _b.z * k, _c.x * k, _c.y * k, _c.z * k, hi.r, hi.g, hi.b, 0.95, hi.r, hi.g, hi.b, 0.95, 2.5);
      }
    }

    // ---- turn circles, projected on the ground
    if (L.turnCircles) {
      const gy = (w.groundAlt + 3) * k;
      for (const [ac, col] of [[me, c.mine], [bandit, c.theirs]] as const) {
        if (!ac || !ac.alive) continue;
        const tc = turnCircle(ac);
        if (!tc) continue;
        let px = 0, pz = 0;
        for (let i = 0; i <= CIRCLE_SEGS; i++) {
          const th = i / CIRCLE_SEGS * Math.PI * 2;
          _a.copy(tc.centre).addScaledVector(tc.n, -tc.radius * Math.cos(th)).addScaledVector(tc.u, tc.radius * Math.sin(th));
          if (i > 0) lines.seg(px * k, gy, pz * k, _a.x * k, gy, _a.z * k, col.r, col.g, col.b, 0.55, col.r, col.g, col.b, 0.55, 1.6);
          px = _a.x; pz = _a.z;
        }
        glow.put(tc.centre.x * k, gy, tc.centre.z * k, Shape.cross, 9, col, 0.7);
      }
    }

    // ---- bandit's plane of motion: a translucent disc on its 3D turn circle
    this.disc.visible = false;
    if (L.planeOfMotion && bandit && bandit.alive) {
      const tc = turnCircle(bandit);
      if (tc) {
        _n.crossVectors(tc.u, tc.n).normalize();
        this.disc.quaternion.copy(_q.setFromUnitVectors(_z, _n));
        this.disc.position.set(tc.centre.x * k, tc.centre.y * k, tc.centre.z * k);
        this.disc.scale.setScalar(tc.radius * k);
        this.disc.visible = true;
        const col = c.theirs;
        let p0x = 0, p0y = 0, p0z = 0;
        for (let i = 0; i <= CIRCLE_SEGS; i++) {
          const th = i / CIRCLE_SEGS * Math.PI * 2;
          _a.copy(tc.centre).addScaledVector(tc.n, -tc.radius * Math.cos(th)).addScaledVector(tc.u, tc.radius * Math.sin(th));
          if (i > 0) lines.seg(p0x * k, p0y * k, p0z * k, _a.x * k, _a.y * k, _a.z * k, col.r, col.g, col.b, 0.5, col.r, col.g, col.b, 0.5, 1.2, 10, 0, 0.5);
          p0x = _a.x; p0y = _a.y; p0z = _a.z;
        }
      }
    }

    // ---- line of sight and velocity vector, coloured by pursuit
    if (L.pursuit && me && me.alive && bandit && bandit.alive) {
      const tone = this.opts.pursuit?.() ?? null;
      const col = tone === 'lead' ? c.lead : tone === 'pure' ? c.pure : tone === 'lag' ? c.lag : c.dim;
      const range = me.pos.distanceTo(bandit.pos);
      over.seg(me.pos.x * k, me.pos.y * k, me.pos.z * k, bandit.pos.x * k, bandit.pos.y * k, bandit.pos.z * k,
        col.r, col.g, col.b, 0.85, col.r, col.g, col.b, 0.85, 1.8, 12, 30, 0.6);
      _u.copy(me.vel).normalize();
      _b.copy(me.pos).addScaledVector(_u, Math.min(range, 3000));
      over.seg(me.pos.x * k, me.pos.y * k, me.pos.z * k, _b.x * k, _b.y * k, _b.z * k,
        col.r, col.g, col.b, 0.9, col.r, col.g, col.b, 0.2, 2.2);
    }

    lines.commit(); over.commit(); glow.commit();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame();
    this.offWorld();
    this.lines.dispose(); this.overlayLines.dispose(); this.glow.dispose();
    this.disc.geometry.dispose(); this.disc.material.dispose();
    this.lines.removeFromParent(); this.overlayLines.removeFromParent(); this.glow.removeFromParent(); this.disc.removeFromParent();
    this.stage.untrack(this);
  }
}
