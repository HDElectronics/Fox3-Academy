/**
 * Runway mesh in the flight-ops runway frame (metres, see src/sim/flightOps/types.ts): origin at the
 * landing threshold centreline, x east, y up, z south; the runway runs north (−z) for RUNWAY.lengthM.
 * Paint is a simplified generic pattern (threshold bars, edge lines, centreline dashes, touchdown-zone
 * bars, aiming-point blocks at the lesson's aim point), not a chart of a real airfield.
 */
import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from 'three';
import { RUNWAY } from '../../sim/flightOps/types';
import type { Palette } from '../palette';

export interface RunwayOptions {
  lengthM?: number;
  widthM?: number;
  /** Aiming-point blocks centred this far past the threshold (m). Default 300. */
  aimPointM?: number;
}

/** Flat quads (x0..x1, z0..z1) at height y, one merged geometry with up normals. */
function quads(list: [number, number, number, number][], y: number): BufferGeometry {
  const pos = new Float32Array(list.length * 18);
  let o = 0;
  for (const [x0, x1, z0, z1] of list) {
    for (const [x, z] of [[x0, z0], [x0, z1], [x1, z1], [x0, z0], [x1, z1], [x1, z0]]) {
      pos[o++] = x; pos[o++] = y; pos[o++] = z;
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}

/** Marking rectangles for a runway of length L, width W, aim point A (all metres). */
export function runwayMarkings(L: number, W: number, A: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  const half = W / 2;
  // Edge lines.
  out.push([half - 1.2, half - 0.3, -L, 0], [-half + 0.3, -half + 1.2, -L, 0]);
  // Threshold bars at both ends: 6 each side of the centreline.
  const bars = (zNear: number, dir: 1 | -1) => {
    for (let i = 0; i < 6; i++) {
      const xc = 3.9 + i * 3.1;
      const z0 = zNear - dir * 6, z1 = zNear - dir * 36;
      const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
      out.push([xc - 0.9, xc + 0.9, lo, hi], [-xc - 0.9, -xc + 0.9, lo, hi]);
    }
  };
  bars(0, 1);
  bars(-L, -1);
  // Centreline dashes: 30 m paint, 20 m gap.
  for (let z = -60; z - 30 > -L + 60; z -= 50) out.push([-0.45, 0.45, z - 30, z]);
  // Aiming-point blocks.
  out.push([6, 12, -A - 22.5, -A + 22.5], [-12, -6, -A - 22.5, -A + 22.5]);
  // Touchdown-zone bars every 150 m (3, 3, 2, 2, 1, 1 stripes), skipped where the aim blocks sit.
  const counts = [3, 3, 2, 2, 1, 1];
  counts.forEach((n, k) => {
    const zc = -(150 * (k + 1));
    if (Math.abs(zc + A) < 60 || -zc > L / 2) return;
    for (let i = 0; i < n; i++) {
      const xc = 6.9 + i * 3;
      out.push([xc - 0.9, xc + 0.9, zc - 11.25, zc + 11.25], [-xc - 0.9, -xc + 0.9, zc - 11.25, zc + 11.25]);
    }
  });
  return out;
}

/** Runway, markings and a surrounding infield, built in metres. */
export class RunwayMesh extends Group {
  readonly lengthM: number;
  readonly widthM: number;
  private aim: number;
  private readonly surface: Mesh;
  private readonly infield: Mesh;
  private paint: Mesh;
  private readonly mats: MeshStandardMaterial[];

  constructor(palette: Palette, opts: RunwayOptions = {}) {
    super();
    this.name = 'flightOps:runway';
    this.lengthM = opts.lengthM ?? RUNWAY.lengthM;
    this.widthM = opts.widthM ?? RUNWAY.widthM;
    this.aim = opts.aimPointM ?? 300;
    const L = this.lengthM, W = this.widthM;
    const asphalt = new MeshStandardMaterial({ color: palette.dark.clone().lerp(palette.smoke, 0.16), roughness: 0.95, metalness: 0, side: DoubleSide });
    const paint = new MeshStandardMaterial({ color: palette.missile.clone(), roughness: 0.8, metalness: 0, side: DoubleSide });
    const grass = new MeshStandardMaterial({ color: palette.earth.clone().lerp(palette.ok, 0.04), roughness: 1, metalness: 0, side: DoubleSide });
    this.mats = [asphalt, paint, grass];
    // Heights keep each layer clear of the environment ground (log depth, no polygon offset).
    this.infield = new Mesh(quads([[-220, 220, -L - 600, 600]], 0.06), grass);
    this.surface = new Mesh(quads([[-W / 2, W / 2, -L - 60, 60]], 0.16), asphalt);
    this.paint = new Mesh(quads(runwayMarkings(L, W, this.aim), 0.26), paint);
    this.add(this.infield, this.surface, this.paint);
  }

  get aimPointM(): number { return this.aim; }

  /** Move the aiming-point blocks (m past the threshold). */
  setAimPoint(m: number): void {
    if (!Number.isFinite(m) || m === this.aim) return;
    this.aim = m;
    this.paint.geometry.dispose();
    this.paint.geometry = quads(runwayMarkings(this.lengthM, this.widthM, m), 0.26);
  }

  override dispose(): void {
    for (const m of [this.infield, this.surface, this.paint]) m.geometry.dispose();
    for (const m of this.mats) m.dispose();
    this.removeFromParent();
  }
}
