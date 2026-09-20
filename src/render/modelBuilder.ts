/**
 * Tiny procedural modelling kit for low-poly aircraft and missiles (metres, built nose-first along +z
 * from the nose, then centred so the nose points to −z). Parts are collected per material slot and
 * merged into one non-indexed geometry with flat normals and one group per slot.
 */
import { Box3, BufferAttribute, BufferGeometry, ExtrudeGeometry, Shape, SphereGeometry, CylinderGeometry, ConeGeometry } from 'three';

/** Material slots shared by every model. */
export const Slot = { body: 0, accent: 1, canopy: 2, dark: 3, navRed: 4, navGreen: 5 } as const;
export type SlotId = typeof Slot[keyof typeof Slot];
export const SLOT_COUNT = 6;

/** One lofted cross-section. */
export interface Section {
  /** Distance aft of the nose (m). */
  z: number;
  /** Half width (m). */
  w: number;
  /** Height above the section centre (m). */
  h: number;
  /** Depth below the section centre (m). Defaults to h. */
  b?: number;
  /** Centre height (m). */
  y?: number;
  /** Superellipse exponent: 2 = ellipse, 4+ = boxy. */
  p?: number;
}

export const S = (z: number, w: number, h: number, b = h, y = 0, p = 2): Section => ({ z, w, h, b, y, p });

export interface LoftOptions {
  seg?: number;
  x?: number;
  slot?: SlotId;
  mirror?: boolean;
  /** Slot for the front cap (e.g. dark intake face). Default: same slot. */
  frontCap?: SlotId | null;
  /** Slot for the rear cap (e.g. dark nozzle). Default: same slot. */
  rearCap?: SlotId | null;
}

export interface PlateOptions {
  /** Thickness (m). */
  t?: number;
  /** Height of the plate mid-plane (m). */
  y?: number;
  slot?: SlotId;
  /** Mirror to the left side. Default true. */
  mirror?: boolean;
  /** Dihedral (+) / anhedral (−), degrees, about the innermost x of the planform. */
  dihedral?: number;
}

export interface FinOptions {
  /** Lateral position of the fin root (m, right side; mirrored when `mirror`). */
  x?: number;
  y?: number;
  t?: number;
  /** Outward cant, degrees. */
  cant?: number;
  slot?: SlotId;
  mirror?: boolean;
}

export class ModelBuilder {
  private parts: BufferGeometry[][] = Array.from({ length: SLOT_COUNT }, () => []);

  add(slot: SlotId, g: BufferGeometry): this {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    for (const k of Object.keys(ng.attributes)) if (k !== 'position') ng.deleteAttribute(k);
    this.parts[slot].push(ng);
    return this;
  }

  private addMirrored(slot: SlotId, g: BufferGeometry, mirror: boolean): void {
    if (mirror) this.add(slot, g.clone().scale(-1, 1, 1));
    this.add(slot, g);
  }

  /** Lofted tube through cross-sections (nose-first). */
  loft(sections: Section[], o: LoftOptions = {}): this {
    const seg = o.seg ?? 10;
    const slot = o.slot ?? Slot.body;
    const pos: number[] = [];
    const ring = (s: Section, k: number): [number, number, number] => {
      const th = Math.PI / 2 - (k / seg) * Math.PI * 2;
      const c = Math.cos(th), sn = Math.sin(th);
      const e = 2 / (s.p ?? 2);
      const x = s.w * Math.sign(c) * Math.pow(Math.abs(c), e);
      const yy = (sn >= 0 ? s.h : (s.b ?? s.h)) * Math.sign(sn) * Math.pow(Math.abs(sn), e);
      return [(o.x ?? 0) + x, (s.y ?? 0) + yy, s.z];
    };
    for (let i = 0; i + 1 < sections.length; i++) {
      const A = sections[i], B = sections[i + 1];
      for (let k = 0; k < seg; k++) {
        const a0 = ring(A, k), a1 = ring(A, k + 1), b0 = ring(B, k), b1 = ring(B, k + 1);
        pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      }
    }
    const tube = geo(pos);
    this.addMirrored(slot, tube, !!o.mirror);
    const cap = (s: Section, front: boolean, capSlot: SlotId) => {
      if (s.w <= 1e-4 && s.h <= 1e-4) return;
      const c: [number, number, number] = [o.x ?? 0, s.y ?? 0, s.z];
      const cp: number[] = [];
      for (let k = 0; k < seg; k++) {
        const p0 = ring(s, k), p1 = ring(s, k + 1);
        if (front) cp.push(...c, ...p1, ...p0); else cp.push(...c, ...p0, ...p1);
      }
      this.addMirrored(capSlot, geo(cp), !!o.mirror);
    };
    const first = sections[0], last = sections[sections.length - 1];
    if (o.frontCap !== null) cap(first, true, o.frontCap ?? slot);
    if (o.rearCap !== null) cap(last, false, o.rearCap ?? slot);
    return this;
  }

  /** Horizontal planform [x outward, z aft] extruded to thickness t (wings, stabs, LERX, canards). */
  plate(points: [number, number][], o: PlateOptions = {}): this {
    const t = o.t ?? 0.2;
    const shape = new Shape();
    points.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
    shape.closePath();
    const g = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, (o.y ?? 0) - t / 2, 0);
    if (o.dihedral) {
      const x0 = Math.min(...points.map(p => p[0]));
      g.translate(-x0, -(o.y ?? 0), 0);
      g.rotateZ((o.dihedral * Math.PI) / 180);
      g.translate(x0, o.y ?? 0, 0);
    }
    this.addMirrored(o.slot ?? Slot.body, g, o.mirror ?? true);
    return this;
  }

  /** Vertical planform [z aft, h up] (fins, ventrals), placed at x and canted outward. */
  fin(points: [number, number][], o: FinOptions = {}): this {
    const t = o.t ?? 0.16;
    const shape = new Shape();
    points.forEach(([z, h], i) => (i === 0 ? shape.moveTo(z, h) : shape.lineTo(z, h)));
    shape.closePath();
    const g = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 1 });
    g.rotateY(-Math.PI / 2);
    g.translate(t / 2, 0, 0);
    if (o.cant) g.rotateZ((-o.cant * Math.PI) / 180);
    g.translate(o.x ?? 0, o.y ?? 0, 0);
    this.addMirrored(o.slot ?? Slot.accent, g, o.mirror ?? (o.x ?? 0) !== 0);
    return this;
  }

  /** Cylinder / frustum along z from z0 to z1 (nozzles, rails, pods). */
  cyl(z0: number, z1: number, r0: number, r1: number, o: { x?: number; y?: number; seg?: number; slot?: SlotId; mirror?: boolean } = {}): this {
    const len = Math.abs(z1 - z0);
    const g = new CylinderGeometry(r1, r0, len, o.seg ?? 8, 1, false);
    g.rotateX(Math.PI / 2); // +y → +z : top (r1) at +z
    g.translate(o.x ?? 0, o.y ?? 0, (z0 + z1) / 2);
    this.addMirrored(o.slot ?? Slot.dark, g, o.mirror ?? (o.x ?? 0) !== 0);
    return this;
  }

  /** Cone pointing forward (−z), base at zBase (shock cones, noses). */
  cone(zTip: number, zBase: number, r: number, o: { x?: number; y?: number; seg?: number; slot?: SlotId; mirror?: boolean } = {}): this {
    const len = zBase - zTip;
    const g = new ConeGeometry(r, len, o.seg ?? 8, 1, false);
    g.rotateX(-Math.PI / 2); // apex (+y) → −z
    g.translate(o.x ?? 0, o.y ?? 0, zTip + len / 2);
    this.addMirrored(o.slot ?? Slot.body, g, o.mirror ?? (o.x ?? 0) !== 0);
    return this;
  }

  /** Bubble canopy: upper half-ellipsoid from z0 to z1. */
  canopy(z0: number, z1: number, w: number, h: number, y: number, slot: SlotId = Slot.canopy): this {
    const g = new SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(w, h, (z1 - z0) / 2);
    g.translate(0, y, (z0 + z1) / 2);
    this.add(slot, g);
    return this;
  }

  /** Small box (nav lights, antennas). */
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, slot: SlotId, mirror = false): this {
    const p: number[] = [];
    const X = [x - sx / 2, x + sx / 2], Y = [y - sy / 2, y + sy / 2], Z = [z - sz / 2, z + sz / 2];
    const v = (i: number, j: number, k: number): [number, number, number] => [X[i], Y[j], Z[k]];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => p.push(...a, ...b, ...c, ...a, ...c, ...d);
    quad(v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0));
    quad(v(0, 0, 1), v(0, 1, 1), v(1, 1, 1), v(1, 0, 1));
    quad(v(0, 0, 0), v(0, 1, 0), v(0, 1, 1), v(0, 0, 1));
    quad(v(1, 0, 0), v(1, 0, 1), v(1, 1, 1), v(1, 1, 0));
    quad(v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1));
    quad(v(0, 0, 0), v(0, 0, 1), v(1, 0, 1), v(1, 0, 0));
    this.addMirrored(slot, geo(p), mirror);
    return this;
  }

  /**
   * Merge into one geometry. By default the model is centred lengthwise (nose → −z) using `length`
   * as the reference (defaults to the model's extent). Pass center = false to keep raw coordinates.
   */
  build(length?: number, center = true): BufferGeometry {
    const chunks: Float32Array[] = [];
    const groups: { start: number; count: number; slot: number }[] = [];
    let total = 0;
    for (let s = 0; s < SLOT_COUNT; s++) {
      let count = 0;
      for (const g of this.parts[s]) {
        const a = g.getAttribute('position').array as Float32Array;
        chunks.push(a);
        count += a.length / 3;
      }
      if (count) groups.push({ start: total, count, slot: s });
      total += count;
    }
    const pos = new Float32Array(total * 3);
    let o = 0;
    for (const c of chunks) { pos.set(c, o); o += c.length; }
    for (const list of this.parts) for (const g of list) g.dispose();
    this.parts = Array.from({ length: SLOT_COUNT }, () => []);
    const out = new BufferGeometry();
    out.setAttribute('position', new BufferAttribute(pos, 3));
    for (const g of groups) out.addGroup(g.start, g.count, g.slot);
    if (center) {
      const bb = new Box3().setFromBufferAttribute(out.getAttribute('position') as BufferAttribute);
      const L = length ?? bb.max.z - bb.min.z;
      const zNose = length !== undefined ? 0 : bb.min.z;
      out.translate(0, 0, -zNose - L / 2);
    }
    out.computeVertexNormals();
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
  }
}

function geo(pos: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  return g;
}
