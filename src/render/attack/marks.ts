/**
 * Target marks in 3D (sim/marks.ts): the JTAC's smoke column, laser spot and IR pointer, as the DCS player sees them.
 * Game level only (AGENTS.md rule 1): a smoke column is a stream of billboard puffs, the laser spot a glow, the IR
 * pointer a line. No plume physics, no laser or pointer detail.
 *
 * - Smoke is a real scene object (instanced camera-facing quads, one draw call), so the Shkval TV picture shows it.
 *   It uses no screen-size uniform, so it is sized correctly for any camera, including the TV's narrow zoom.
 * - The laser spot and the IR pointer live in `truth`, which the TV pass must hide (`AttackScene.tvHidden()` does):
 *   the Su-25T has no laser spot tracker, and the IR pointer is only visible through NVGs. The IR layer is off by
 *   default (`show.ir`).
 *
 * Positions are in render units (1 unit = 1 km, like the rest of the overlay); the layer itself is unscaled.
 */
import {
  BufferAttribute, Color, Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NormalBlending, ShaderMaterial,
} from 'three';
import type { World } from '../../sim/world';
import type { EntityId, MarkColour, MarkKind, RecordFrame } from '../../sim/types';
import { FRAG_END, FRAG_PRELUDE, ORDER, VERT_END, VERT_PRELUDE, type SharedUniforms } from '../shared';
import type { Palette } from '../palette';
import { LineBatch } from '../lines';
import { Shape, SymbolLayer } from '../symbols';
import { UNIT_PER_M } from '../units';

/** Puffs per smoke column. */
export const SMOKE_PUFFS = 28;
/** Height the column tops out at (m). Trainer look, not a DCS number. */
export const SMOKE_TOP_M = 95;
/** Seconds a puff takes from the ground to the top of the column. */
export const SMOKE_RISE_S = 14;
/** Seconds an ended mark takes to fade out. */
export const MARK_FADE_S = 4;

/** One puff of a smoke column: offset from the mark point (m), diameter (m) and opacity (0..1). */
export interface SmokePuff { x: number; y: number; z: number; size: number; alpha: number }

/**
 * Puff `i` of `n` in a column `ageS` seconds after the smoke went down. Puffs stream up continuously; while the
 * column is still building (ageS < SMOKE_RISE_S) the puffs that would be higher than the stream has reached are
 * transparent. The column leans downwind (direction from `seed`) and widens as it rises. Writes into `out`.
 */
export function smokePuff(i: number, n: number, ageS: number, seed: number, out: SmokePuff): SmokePuff {
  const age = Math.max(0, ageS);
  const u = age / SMOKE_RISE_S + i / n;
  const p = u - Math.floor(u);                       // 0 at the ground, 1 at the top
  const born = age - p * SMOKE_RISE_S >= 0;
  const rise = 1 - Math.pow(1 - p, 1.6);             // fast off the ground, slowing near the top
  const windDir = seed * Math.PI * 2;
  const lean = Math.pow(p, 1.5) * 28;
  const wob = Math.sin(i * 2.39996 + seed * 17 + age * 0.6) * (1.5 + p * 5);
  out.x = Math.sin(windDir) * lean + Math.cos(windDir) * wob;
  out.z = -Math.cos(windDir) * lean + Math.sin(windDir) * wob;
  out.y = 2 + rise * SMOKE_TOP_M;
  out.size = 7 + p * 30;
  out.alpha = born ? Math.min(1, p / 0.04) * Math.pow(1 - p, 0.9) * 0.92 : 0;
  return out;
}

/** Opacity of a mark `sinceEndS` seconds after it ended (1 while alive, i.e. for null). */
export function markFade(sinceEndS: number | null): number {
  if (sinceEndS == null) return 1;
  return Math.max(0, 1 - sinceEndS / MARK_FADE_S);
}

export interface MarkLayers {
  /** Smoke columns (visible to the eye and in the Shkval TV). */
  smoke: boolean;
  /** Laser spot glow (truth only: hidden in the TV). */
  laser: boolean;
  /** IR pointer line and spot (NVG only; off by default). */
  ir: boolean;
}

/** The mark fields the layer draws; both GroundMark and a RecordFrame mark have them. */
interface MarkLike { id: EntityId; type: MarkKind; colour: MarkColour | null; alive: boolean }

interface Track { t0: number; deadAt: number | null; seed: number }

const vert = /* glsl */ `
${VERT_PRELUDE}
attribute vec3 iPos;
attribute vec4 iPar; // diameter (units), alpha, seed, -
attribute vec3 iCol;
varying vec2 vP;
varying vec4 vCol;
varying float vSeed;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iPar.x;
  gl_Position = projectionMatrix * mv;
  if (iPar.y <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vP = position.xy * 2.0;
  vCol = vec4(iCol * (0.8 + 0.2 * (position.y + 0.5)), iPar.y);
  vSeed = iPar.z;
  ${VERT_END}
}`;

const frag = /* glsl */ `
${FRAG_PRELUDE}
varying vec2 vP;
varying vec4 vCol;
varying float vSeed;
void main() {
  float r = length(vP);
  float ang = atan(vP.y, vP.x);
  float lump = 0.82 + 0.1 * sin(ang * 5.0 + vSeed * 6.283) + 0.06 * sin(ang * 9.0 - vSeed * 11.0);
  float d = r / lump;
  float a = (1.0 - smoothstep(0.5, 1.0, d)) * (0.8 + 0.2 * (1.0 - d)) * vCol.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol.rgb, a);
  ${FRAG_END}
}`;

/** Smoke colours from the palette tokens: white (missile white), orange (caution), red (warning), green (ok). */
export function smokeColours(p: Palette): Record<MarkColour, Color> {
  return {
    white: p.missile.clone().lerp(p.skyHorizon, 0.1),
    orange: p.caution.clone().lerp(p.smoke, 0.15),
    red: p.warning.clone().lerp(p.smoke, 0.15),
    green: p.ok.clone().lerp(p.smoke, 0.2),
  };
}

export class MarkLayer extends Group {
  readonly show: MarkLayers;
  /** Laser spot and IR pointer: add to the TV pass's hidden list. */
  readonly truth = new Group();
  private readonly smoke: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly spots: SymbolLayer;
  private readonly lines: LineBatch;
  private readonly colours: Record<MarkColour, Color>;
  private readonly tracks = new Map<EntityId, Track>();
  private cap = 0;
  private iPos!: Float32Array;
  private iPar!: Float32Array;
  private iCol!: Float32Array;
  private lastT = -Infinity;
  private n = 0;
  private readonly pf: SmokePuff = { x: 0, y: 0, z: 0, size: 0, alpha: 0 };

  constructor(shared: SharedUniforms, private readonly palette: Palette, layers: Partial<MarkLayers> = {}) {
    super();
    this.name = 'attack-marks';
    this.show = { smoke: true, laser: true, ir: false, ...layers };
    this.colours = smokeColours(palette);
    const mat = new ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, depthTest: true, blending: NormalBlending, toneMapped: false,
    });
    this.smoke = new Mesh(this.makeGeometry(SMOKE_PUFFS * 4), mat);
    this.smoke.name = 'mark-smoke';
    this.smoke.frustumCulled = false;
    this.smoke.renderOrder = ORDER.points;
    this.spots = new SymbolLayer(shared, { capacity: 16, depthTest: false, renderOrder: ORDER.overlay });
    this.lines = new LineBatch(shared, { capacity: 8 });
    this.truth.name = 'mark-truth';
    this.truth.add(this.lines, this.spots);
    this.add(this.smoke, this.truth);
  }

  private makeGeometry(cap: number): InstancedBufferGeometry {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.iPos = new Float32Array(cap * 3);
    this.iPar = new Float32Array(cap * 4);
    this.iCol = new Float32Array(cap * 3);
    g.setAttribute('iPos', new InstancedBufferAttribute(this.iPos, 3).setUsage(35048));
    g.setAttribute('iPar', new InstancedBufferAttribute(this.iPar, 4).setUsage(35048));
    g.setAttribute('iCol', new InstancedBufferAttribute(this.iCol, 3).setUsage(35048));
    g.instanceCount = 0;
    this.cap = cap;
    return g;
  }

  setLayer(k: keyof MarkLayers, on: boolean): void { this.show[k] = on; }

  /** Forget fade state (world swap, replay seek). */
  reset(): void { this.tracks.clear(); this.lastT = -Infinity; }

  /** Draw the live marks of `world`. */
  sync(world: World): void {
    const t = world.t;
    if (t < this.lastT) this.reset();
    this.lastT = t;
    this.begin(world.marks.size);
    for (const m of world.marks.values()) {
      const tr = this.track(m, m.t0, t);
      if (!tr) continue;
      const owner = m.ownerId ? world.groundUnits.get(m.ownerId) : undefined;
      this.draw(m, m.pos.x, m.pos.y, m.pos.z, t, tr, owner ? owner.pos : null);
    }
    this.end();
  }

  /** Draw the marks of a recorded frame (replay). Mark age counts from the first frame that showed it. */
  syncFrame(frame: RecordFrame): void {
    const t = frame.t;
    if (t < this.lastT) this.reset();
    this.lastT = t;
    const marks = frame.marks ?? [];
    this.begin(marks.length);
    for (const m of marks) {
      const tr = this.track(m, this.tracks.get(m.id)?.t0 ?? t, t);
      if (!tr) continue;
      this.draw(m, m.pos[0], m.pos[1], m.pos[2], t, tr, null);
    }
    this.end();
  }

  private track(m: MarkLike, t0: number, t: number): Track | null {
    let tr = this.tracks.get(m.id);
    if (!tr) {
      let h = 0;
      for (let i = 0; i < m.id.length; i++) h = (h * 31 + m.id.charCodeAt(i)) >>> 0;
      tr = { t0, deadAt: null, seed: (h % 1000) / 1000 };
      this.tracks.set(m.id, tr);
    }
    if (!m.alive && tr.deadAt == null) tr.deadAt = t;
    if (m.alive) tr.deadAt = null;
    return markFade(tr.deadAt == null ? null : t - tr.deadAt) > 0 ? tr : null;
  }

  private begin(marks: number): void {
    const need = marks * SMOKE_PUFFS;
    if (need > this.cap) {
      const old = this.smoke.geometry;
      this.smoke.geometry = this.makeGeometry(Math.max(need, this.cap * 2));
      old.dispose();
    }
    this.n = 0;
    this.spots.reset();
    this.lines.reset();
  }

  private draw(m: MarkLike, x: number, y: number, z: number, t: number, tr: Track, owner: { x: number; y: number; z: number } | null): void {
    const fade = markFade(tr.deadAt == null ? null : t - tr.deadAt);
    const U = UNIT_PER_M, pal = this.palette;
    if (m.type === 'smoke') {
      if (!this.show.smoke) return;
      const c = this.colours[m.colour ?? 'white'];
      for (let i = 0; i < SMOKE_PUFFS; i++) {
        const p = smokePuff(i, SMOKE_PUFFS, t - tr.t0, tr.seed, this.pf);
        if (p.alpha <= 0) continue;
        const k = this.n++, k3 = k * 3, k4 = k * 4;
        this.iPos[k3] = (x + p.x) * U; this.iPos[k3 + 1] = (y + p.y) * U; this.iPos[k3 + 2] = (z + p.z) * U;
        this.iPar[k4] = p.size * U; this.iPar[k4 + 1] = p.alpha * fade; this.iPar[k4 + 2] = (tr.seed + i * 0.137) % 1;
        this.iCol[k3] = c.r; this.iCol[k3 + 1] = c.g; this.iCol[k3 + 2] = c.b;
      }
    } else if (m.type === 'laser') {
      if (!this.show.laser) return;
      const c = pal.warning;
      this.spots.put(x * U, (y + 1) * U, z * U, Shape.glow, 22, c, 0.95 * fade, 6 * U);
      this.spots.put(x * U, (y + 1) * U, z * U, Shape.ring, 18, c, 0.9 * fade);
      this.spots.put(x * U, (y + 1) * U, z * U, Shape.dot, 5, pal.missile, 0.95 * fade);
    } else {
      if (!this.show.ir) return;
      const c = pal.ok;
      this.spots.put(x * U, (y + 1) * U, z * U, Shape.glow, 12, c, 0.8 * fade, 4 * U);
      if (owner) {
        this.lines.seg(owner.x * U, (owner.y + 2) * U, owner.z * U, x * U, (y + 1) * U, z * U,
          c.r, c.g, c.b, 0.7 * fade, c.r, c.g, c.b, 0.9 * fade, 1.5);
      }
    }
  }

  private end(): void {
    const g = this.smoke.geometry;
    g.instanceCount = this.n;
    if (this.n > 0) {
      for (const [k, size] of [['iPos', 3], ['iPar', 4], ['iCol', 3]] as const) {
        const a = g.getAttribute(k) as InstancedBufferAttribute;
        a.clearUpdateRanges();
        a.addUpdateRange(0, this.n * size);
        a.needsUpdate = true;
      }
    }
    this.spots.commit();
    this.lines.commit();
  }

  /** Number of smoke puffs drawn by the last sync (tests, stats). */
  get puffCount(): number { return this.n; }

  override dispose(): void {
    this.smoke.geometry.dispose();
    this.smoke.material.dispose();
    this.spots.dispose();
    this.lines.geometry.dispose(); this.lines.material.dispose();
    this.tracks.clear();
    this.removeFromParent();
  }
}
