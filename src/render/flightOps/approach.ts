/**
 * ApproachOverlay: teaching symbology for the final approach, in the flight-ops runway frame (metres).
 * A translucent glide corridor from the aim point back along the approach (+z), the glide-path line,
 * the extended centreline, gate rings supplied by the lesson, the aim-point marker, and the flown trail
 * coloured by error level (ok / caution / warning tokens). Tolerances are display choices of the page.
 */
import { BufferAttribute, BufferGeometry, Color, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three';
import { LineBatch } from '../lines';
import type { Palette } from '../palette';
import { ORDER, type SharedUniforms } from '../shared';
import type { XYZ } from '../units';

export type GateState = 'pending' | 'ok' | 'miss';

export interface ApproachGate {
  id: string;
  /** Runway frame, metres. */
  pos: XYZ;
  radiusM: number;
  state: GateState;
  /** Direction of flight through the gate (rad clockwise from north). Default 0 (north, on final). */
  headingRad?: number;
}

/** Trail error level: 0 ok, 1 caution, 2 warning. */
export type ErrLevel = 0 | 1 | 2;

export interface ApproachGeometryOptions {
  /** Glide-path angle, degrees. Default 3. */
  glideDeg?: number;
  /** Aim point past the threshold, metres. Default 300. */
  aimPointM?: number;
  /** Corridor length back from the aim point, metres. Default 4 nm (7408 m). */
  lengthM?: number;
  /** Corridor half-angles (display tolerance), degrees. Defaults 0.7 vertical, 1.5 lateral. */
  vTolDeg?: number;
  hTolDeg?: number;
  /** Minimum corridor half-size near the aim point, metres. Default 6. */
  minHalfM?: number;
}

const NM = 1852;
const D2R = Math.PI / 180;

/** Glide-path point `d` metres before the aim point (runway frame). */
export function glidePoint(d: number, glideDeg: number, aimPointM: number, out: XYZ = { x: 0, y: 0, z: 0 }): XYZ {
  out.x = 0;
  out.y = Math.max(0, d) * Math.tan(glideDeg * D2R);
  out.z = -aimPointM + d;
  return out;
}

export class ApproachOverlay extends Group {
  private readonly palette: Palette;
  private readonly lines: LineBatch;
  private readonly trail: LineBatch;
  private readonly corridor: Mesh<BufferGeometry, MeshBasicMaterial>;
  private geo: Required<ApproachGeometryOptions>;
  private gates: ApproachGate[] = [];
  private pts: { x: number; y: number; z: number; l: ErrLevel }[] = [];
  private static readonly TRAIL_MAX = 6000;
  /** Skip trail points closer than this to the previous one (m). */
  minTrailSpacingM = 2;

  constructor(shared: SharedUniforms, palette: Palette, opts: ApproachGeometryOptions = {}) {
    super();
    this.name = 'flightOps:approach';
    this.palette = palette;
    this.geo = { glideDeg: 3, aimPointM: 300, lengthM: 4 * NM, vTolDeg: 0.7, hTolDeg: 1.5, minHalfM: 6, ...opts };
    this.corridor = new Mesh(new BufferGeometry(), new MeshBasicMaterial({
      color: palette.sym.clone(), transparent: true, opacity: 0.07, depthWrite: false, side: DoubleSide, toneMapped: false,
    }));
    this.corridor.renderOrder = ORDER.volume;
    this.corridor.frustumCulled = false;
    this.lines = new LineBatch(shared, { capacity: 512 });
    this.trail = new LineBatch(shared, { capacity: 1024, renderOrder: ORDER.trails });
    this.add(this.corridor, this.lines, this.trail);
    this.rebuild();
  }

  get glideDeg(): number { return this.geo.glideDeg; }
  get aimPointM(): number { return this.geo.aimPointM; }
  get trailLength(): number { return this.pts.length; }

  /** Change glide angle, aim point, corridor length or tolerances. */
  setGeometry(opts: ApproachGeometryOptions): void {
    this.geo = { ...this.geo, ...opts };
    this.rebuild();
  }

  /** Replace the gate markers (colour by state). */
  setGates(gates: readonly ApproachGate[]): void {
    this.gates = gates.map(g => ({ ...g, pos: { ...g.pos } }));
    this.rebuildLines();
  }

  setCorridorVisible(on: boolean): void { this.corridor.visible = on; }

  /** Append a flown point (runway frame, metres) with its error level. */
  pushTrail(pos: XYZ, level: ErrLevel): void {
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y, pos.z - last.z) < this.minTrailSpacingM) return;
    const p = { x: pos.x, y: pos.y, z: pos.z, l: level };
    this.pts.push(p);
    if (this.pts.length > ApproachOverlay.TRAIL_MAX) {
      this.pts = this.pts.slice(-Math.floor(ApproachOverlay.TRAIL_MAX * 0.75));
      this.rebuildTrail();
      return;
    }
    if (last) { this.trailSeg(last, p); this.trail.commit(); }
  }

  clearTrail(): void {
    this.pts = [];
    this.trail.reset();
    this.trail.commit();
  }

  private levelColor(l: ErrLevel): Color {
    return l === 0 ? this.palette.ok : l === 1 ? this.palette.caution : this.palette.warning;
  }

  private trailSeg(a: { x: number; y: number; z: number; l: ErrLevel }, b: { x: number; y: number; z: number; l: ErrLevel }): void {
    const ca = this.levelColor(a.l), cb = this.levelColor(b.l);
    this.trail.seg(a.x, a.y, a.z, b.x, b.y, b.z, ca.r, ca.g, ca.b, 1, cb.r, cb.g, cb.b, 1, 3);
  }

  private rebuildTrail(): void {
    this.trail.reset();
    for (let i = 1; i < this.pts.length; i++) this.trailSeg(this.pts[i - 1], this.pts[i]);
    this.trail.commit();
  }

  /** Corridor cross-section corners at distance d before the aim point: [x0, x1, y0, y1]. */
  private section(d: number): [number, number, number, number] {
    const g = this.geo;
    const c = glidePoint(d, g.glideDeg, g.aimPointM);
    const hv = Math.max(g.minHalfM, d * Math.tan(g.vTolDeg * D2R));
    const hh = Math.max(g.minHalfM, d * Math.tan(g.hTolDeg * D2R));
    return [-hh, hh, Math.max(0.5, c.y - hv), c.y + hv];
  }

  private rebuild(): void {
    const g = this.geo;
    const N = 32;
    const pos: number[] = [];
    for (let i = 0; i < N; i++) {
      const da = (g.lengthM * i) / N, db = (g.lengthM * (i + 1)) / N;
      const za = -g.aimPointM + da, zb = -g.aimPointM + db;
      const [ax0, ax1, ay0, ay1] = this.section(da);
      const [bx0, bx1, by0, by1] = this.section(db);
      const quad = (p: number[][]) => pos.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
      quad([[ax0, ay1, za], [ax1, ay1, za], [bx1, by1, zb], [bx0, by1, zb]]); // top
      quad([[ax0, ay0, za], [ax1, ay0, za], [bx1, by0, zb], [bx0, by0, zb]]); // bottom
      quad([[ax0, ay0, za], [ax0, ay1, za], [bx0, by1, zb], [bx0, by0, zb]]); // left
      quad([[ax1, ay0, za], [ax1, ay1, za], [bx1, by1, zb], [bx1, by0, zb]]); // right
    }
    const geom = new BufferGeometry();
    geom.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    this.corridor.geometry.dispose();
    this.corridor.geometry = geom;
    this.rebuildLines();
  }

  private rebuildLines(): void {
    const g = this.geo, p = this.palette, L = this.lines;
    L.reset();
    const N = 32;
    // Corridor rails.
    const rail = { color: p.sym, alpha: 0.45, width: 1.2 };
    for (let i = 0; i < N; i++) {
      const da = (g.lengthM * i) / N, db = (g.lengthM * (i + 1)) / N;
      const za = -g.aimPointM + da, zb = -g.aimPointM + db;
      const a = this.section(da), b = this.section(db);
      for (const [xi, yi] of [[0, 2], [0, 3], [1, 2], [1, 3]]) {
        L.line({ x: a[xi], y: a[yi], z: za }, { x: b[xi], y: b[yi], z: zb }, rail);
      }
    }
    // Frames every nautical mile.
    for (let d = NM; d <= g.lengthM + 1; d += NM) {
      const [x0, x1, y0, y1] = this.section(d), z = -g.aimPointM + d;
      L.polyline([{ x: x0, y: y0, z }, { x: x1, y: y0, z }, { x: x1, y: y1, z }, { x: x0, y: y1, z }], { color: p.sym, alpha: 0.6, width: 1.2 }, true);
    }
    // Glide path and the extended centreline on the ground.
    L.line(glidePoint(0, g.glideDeg, g.aimPointM), glidePoint(g.lengthM, g.glideDeg, g.aimPointM), { color: p.symHi, alpha: 0.9, width: 1.6, dash: 12, fill: 0.6 });
    L.line({ x: 0, y: 0.6, z: 0 }, { x: 0, y: 0.6, z: -g.aimPointM + g.lengthM }, { color: p.symDim, alpha: 0.7, width: 1.2, dash: 8 });
    // Aim point: a ring and a cross on the runway.
    const ring: XYZ[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      ring.push({ x: Math.cos(a) * 14, y: 0.6, z: -g.aimPointM + Math.sin(a) * 14 });
    }
    const aimStyle = { color: p.caution, alpha: 1, width: 2 };
    L.polyline(ring, aimStyle, true);
    L.line({ x: -20, y: 0.6, z: -g.aimPointM }, { x: 20, y: 0.6, z: -g.aimPointM }, aimStyle);
    // Gates: a ring across the flight direction and a drop line to the ground.
    for (const gate of this.gates) {
      const c = gate.state === 'ok' ? p.ok : gate.state === 'miss' ? p.warning : p.sym;
      const h = gate.headingRad ?? 0;
      const rx = Math.cos(h), rz = Math.sin(h);
      const pts: XYZ[] = [];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const u = Math.cos(a) * gate.radiusM, v = Math.sin(a) * gate.radiusM;
        pts.push({ x: gate.pos.x + rx * u, y: gate.pos.y + v, z: gate.pos.z + rz * u });
      }
      L.polyline(pts, { color: c, alpha: 0.95, width: 2.4 }, true);
      L.line({ x: gate.pos.x, y: gate.pos.y - gate.radiusM, z: gate.pos.z }, { x: gate.pos.x, y: 0.6, z: gate.pos.z }, { color: c, alpha: 0.4, width: 1, dash: 6 });
    }
    L.commit();
  }

  override dispose(): void {
    this.corridor.geometry.dispose();
    this.corridor.material.dispose();
    this.lines.dispose();
    this.trail.dispose();
    this.removeFromParent();
  }
}
