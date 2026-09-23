/**
 * TankerMesh: low-poly tankers for the air-to-air refuelling trainer (issue #28), in the sim's tanker frame
 * (src/sim/flightOps/aar.ts) turned into three.js local metres: x = right, y = up, z = aft (forward is −z,
 * like every model in the kit). The scene adds it to `FlightOpsScene.root` and drives it from
 * `FlightOpsState.aar` with `update(aar, tip?)`.
 *
 * What the receiver pilot meets: the airframe (IL-78M high wing and T-tail with UPAZ pods under the outer wings;
 * KC-135 low swept wing with the boom under the tail, or hose pods on the KC-135 MPRS; KC-130 high straight wing),
 * the hose from the pod to the basket (at rest at `basketRest`, riding on the probe tip when connected) and, on the
 * IL-78M only, the coloured hose bands the Su-33 manual describes. The boom follows `aar.boom` (elevation, azimuth,
 * extension). The airframe banks with the tanker; the hose, basket and boom stay in the level tanker frame the
 * sim uses. Drawing values, not aircraft drawings; no hose or boom mechanics (AGENTS.md rule 1).
 */
import {
  BufferGeometry, ConeGeometry, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Quaternion,
  Shape, TorusGeometry, Vector3, type Material,
} from 'three';
import { TANKERS } from '../../data/tankers';
import { basketRest, boomPoint } from '../../sim/flightOps/aar';
import type { AarState, HoseBand, TankerData, TankerFrameVec, TankerId } from '../../sim/flightOps/types';
import { LineBatch } from '../lines';
import type { Palette } from '../palette';
import type { SharedUniforms } from '../shared';
import { orientationQuaternion } from '../units';

const D2R = Math.PI / 180;

/** Airframe layout, metres (drawing values). Wing: leading edge at the root (aft +), chords, semi-span, sweep. */
export interface TankerLayout {
  noseAft: number;
  tailAft: number;
  fuseR: number;
  wing: { y: number; rootLe: number; rootChord: number; tipChord: number; semi: number; sweepDeg: number; dihedralDeg: number };
  /** Engine nacelles (right of the centreline) and their radius; props on the KC-130. */
  engines: { right: number[]; r: number; prop?: boolean };
  tTail: boolean;
  /** Boom under the tail (KC-135). */
  boom: boolean;
  /** Extra hose pod on the rear fuselage (IL-78M: three UPAZ). */
  tailPod?: TankerFrameVec;
}

export const TANKER_LAYOUT: Record<TankerId, TankerLayout> = {
  il78m: {
    noseAft: -24, tailAft: 23, fuseR: 2.4,
    wing: { y: 1.9, rootLe: -6, rootChord: 9, tipChord: 3.5, semi: 25, sweepDeg: 25, dihedralDeg: -3 },
    engines: { right: [6, 10], r: 0.8 }, tTail: true, boom: false, tailPod: { aft: 17, right: 2.4, up: -0.4 },
  },
  kc135: {
    noseAft: -21, tailAft: 20, fuseR: 1.9,
    wing: { y: -1.1, rootLe: -5, rootChord: 8.5, tipChord: 3, semi: 20, sweepDeg: 35, dihedralDeg: 7 },
    engines: { right: [7, 12.5], r: 0.8 }, tTail: false, boom: true,
  },
  kc135mprs: {
    noseAft: -21, tailAft: 20, fuseR: 1.9,
    wing: { y: -1.1, rootLe: -5, rootChord: 8.5, tipChord: 3, semi: 20, sweepDeg: 35, dihedralDeg: 7 },
    engines: { right: [7, 12.5], r: 0.8 }, tTail: false, boom: true,
  },
  kc130: {
    noseAft: -15, tailAft: 15, fuseR: 2.1,
    wing: { y: 1.8, rootLe: -2, rootChord: 4.6, tipChord: 3, semi: 20, sweepDeg: 3, dihedralDeg: 1 },
    engines: { right: [5, 9.5], r: 0.6, prop: true }, tTail: false, boom: false,
  },
};

/** Tanker frame → local model coordinates (x right, y up, z aft). */
export const tankerLocal = (v: TankerFrameVec) => ({ x: v.right, y: v.up, z: v.aft });

/** A tanker-frame point rolled with the airframe (bank right + puts the right wing down). */
export function rollPoint(v: TankerFrameVec, bankRad: number): TankerFrameVec {
  const c = Math.cos(bankRad), s = Math.sin(bankRad);
  return { aft: v.aft, right: v.right * c + v.up * s, up: -v.right * s + v.up * c };
}

/** Hose from the pod to the basket: a sagging curve (`sagM` below the straight line at the middle), n segments. */
export function hosePoints(pod: TankerFrameVec, basket: TankerFrameVec, n = 24, sagM = 0.8): TankerFrameVec[] {
  const out: TankerFrameVec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const sag = 4 * t * (1 - t) * sagM;
    out.push({
      aft: pod.aft + (basket.aft - pod.aft) * t,
      right: pod.right + (basket.right - pod.right) * t,
      up: pod.up + (basket.up - pod.up) * t - sag,
    });
  }
  return out;
}

/**
 * Colour mark on the hose `fromConeM` metres from the basket. The bands are painted by distance from the cone,
 * so the mark at the pod exit (fromConeM = cone-to-pod distance) is the band the pilot reads: yellow 3–13 m,
 * yellow+green 13–16, green 16–22, green+red 22–24, red 24–26. Null nearer the cone than the first band.
 */
export function hoseMarkAt(bands: readonly { from: number; to: number; band: HoseBand }[], fromConeM: number): HoseBand | null {
  for (const b of bands) if (fromConeM >= b.from && fromConeM <= b.to) return b.band;
  return null;
}

/** Hose band → one or two colour stripes (token names): yellow = caution, green = ok, red = warning. */
export function bandStripes(b: HoseBand): ('caution' | 'ok' | 'warning')[] {
  return b === 'yellow' ? ['caution'] : b === 'yellowGreen' ? ['caution', 'ok'] : b === 'green' ? ['ok']
    : b === 'greenRed' ? ['ok', 'warning'] : ['warning'];
}

const _q = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const Z = new Vector3(0, 0, 1);

export class TankerMesh extends Group {
  readonly tankerId: TankerId;
  readonly tanker: TankerData;
  readonly layout: TankerLayout;
  /** Banked airframe. */
  readonly airframe = new Group();
  /** Level tanker frame: hose, basket, boom. */
  readonly rig = new Group();
  private readonly geoms: BufferGeometry[] = [];
  private readonly mats: Material[] = [];
  private readonly palette: Palette;
  private readonly hose: LineBatch | null = null;
  private readonly basket: Group | null = null;
  private readonly boom: Group | null = null;
  private readonly boomInner: Mesh | null = null;
  private readonly boomOuter: Mesh | null = null;
  private key = '';

  constructor(shared: SharedUniforms, palette: Palette, id: TankerId) {
    super();
    this.name = `flightOps:tanker:${id}`;
    this.tankerId = id;
    this.tanker = TANKERS[id];
    this.layout = TANKER_LAYOUT[id];
    this.palette = palette;
    const L = this.layout;
    const skin = this.mat(new MeshStandardMaterial({ color: palette.smoke.clone().lerp(palette.dark, 0.35), roughness: 0.8, metalness: 0.15, side: DoubleSide }));
    const dark = this.mat(new MeshStandardMaterial({ color: palette.dark.clone().lerp(palette.smoke, 0.2), roughness: 0.85, metalness: 0.1, side: DoubleSide }));
    const glass = this.mat(new MeshStandardMaterial({ color: palette.canopy.clone(), roughness: 0.3, metalness: 0.4 }));
    this.add(this.airframe, this.rig);

    // Fuselage: nose cone, barrel, tail taper (axis along z, aft +).
    const r = L.fuseR, len = L.tailAft - L.noseAft;
    const noseLen = r * 2.2, tailLen = len * 0.3, barrel = len - noseLen - tailLen;
    this.part(new CylinderGeometry(r, r, barrel, 14).rotateX(Math.PI / 2).translate(0, 0, L.noseAft + noseLen + barrel / 2), skin);
    this.part(new CylinderGeometry(r * 0.25, r, noseLen, 14).rotateX(-Math.PI / 2).translate(0, 0, L.noseAft + noseLen / 2), skin);
    this.part(new CylinderGeometry(r * 0.3, r, tailLen, 14).rotateX(Math.PI / 2).translate(0, r * 0.35, L.tailAft - tailLen / 2), skin);
    this.part(new CylinderGeometry(r * 0.55, r * 0.55, 1.2, 10).rotateX(Math.PI / 2).translate(0, r * 0.62, L.noseAft + noseLen * 0.95), glass);

    // Wings with dihedral (right half, mirrored).
    const w = L.wing, sw = Math.tan(w.sweepDeg * D2R);
    const plan: [number, number][] = [[0, w.rootLe], [w.semi, w.rootLe + w.semi * sw], [w.semi, w.rootLe + w.semi * sw + w.tipChord], [0, w.rootLe + w.rootChord]];
    for (const side of [1, -1]) {
      const g = this.plate(plan, 0.45);
      const m = new Mesh(g, skin);
      m.position.y = w.y;
      m.rotation.z = side * w.dihedralDeg * D2R;
      m.scale.x = side;
      this.airframe.add(m);
    }
    const wingY = (x: number) => w.y + Math.abs(x) * Math.tan(w.dihedralDeg * D2R);
    const leAt = (x: number) => w.rootLe + Math.abs(x) * sw;

    // Engines under the wing.
    for (const e of L.engines.right) for (const side of [1, -1]) {
      const x = side * e, z = leAt(e) - (L.engines.prop ? 1 : 2.2), y = wingY(e) - L.engines.r * (L.engines.prop ? 0.3 : 1.6);
      this.part(new CylinderGeometry(L.engines.r, L.engines.r * 0.85, L.engines.prop ? 4 : 5, 10).rotateX(Math.PI / 2).translate(x, y, z + 2), dark);
      if (L.engines.prop) this.part(new CylinderGeometry(2, 2, 0.05, 20).rotateX(Math.PI / 2).translate(x, y, z - 0.1), this.mat(new MeshStandardMaterial({ color: palette.dark.clone(), transparent: true, opacity: 0.25, side: DoubleSide })));
    }

    // Tail: fin and stabiliser (T-tail on the IL-78M).
    const finRoot = L.tailAft - 9, finH = L.tTail ? 8 : 7.5;
    this.fin([[finRoot, r * 0.6], [finRoot + 4.5, r * 0.6 + finH], [L.tailAft - 0.5, r * 0.6 + finH], [L.tailAft, r * 0.6]], 0.35, skin);
    const stabY = L.tTail ? r * 0.6 + finH : r * 0.4, stabSemi = L.tTail ? 8.5 : 7;
    const stab: [number, number][] = [[0, L.tailAft - 6], [stabSemi, L.tailAft - 3], [stabSemi, L.tailAft - 1.2], [0, L.tailAft - 0.8]];
    for (const side of [1, -1]) {
      const m = new Mesh(this.plate(stab, 0.3), skin);
      m.position.y = stabY;
      m.scale.x = side;
      this.airframe.add(m);
    }

    // Hose pods: the one the trainer uses and its mirror, plus the IL-78M's fuselage pod.
    const dr = this.tanker.drogue;
    if (dr) {
      const pods = [dr.pod, { ...dr.pod, right: -dr.pod.right }, ...(L.tailPod ? [L.tailPod] : [])];
      for (const p of pods) {
        this.part(new CylinderGeometry(0.45, 0.35, 4, 10).rotateX(Math.PI / 2).translate(p.right, p.up + 0.1, p.aft - 2), dark);
        const top = L.tailPod === p ? 0 : wingY(p.right);
        if (top > p.up + 0.6) this.part(new CylinderGeometry(0.12, 0.12, top - p.up - 0.4, 6).translate(p.right, (top + p.up + 0.4) / 2, p.aft - 2.5), dark);
      }
      // Hose (screen-space lines) and basket (open cone with a rim).
      this.hose = new LineBatch(shared, { capacity: 64 });
      this.hose.name = 'flightOps:hose';
      this.hose.frustumCulled = false;
      this.rig.add(this.hose);
      const basket = new Group();
      basket.name = 'flightOps:basket';
      const cone = new Mesh(this.geom(new CylinderGeometry(0.38, 0.12, 0.7, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.35)), dark);
      const rim = new Mesh(this.geom(new TorusGeometry(0.38, 0.05, 6, 20).translate(0, 0, 0)), skin);
      rim.position.z = 0.7;
      const hub = new Mesh(this.geom(new CylinderGeometry(0.1, 0.1, 0.35, 8).rotateX(Math.PI / 2)), dark);
      basket.add(cone, rim, hub);
      this.basket = basket;
      this.rig.add(basket);
    }

    // Boom (KC-135; the MPRS keeps its boom stowed), with ruddevators.
    if (L.boom) {
      const boom = new Group();
      boom.name = 'flightOps:boom';
      const outer = new Mesh(this.geom(new CylinderGeometry(0.32, 0.38, 1, 10).rotateX(Math.PI / 2).translate(0, 0, 0.5)), skin);
      const inner = new Mesh(this.geom(new CylinderGeometry(0.14, 0.14, 1, 8).rotateX(Math.PI / 2).translate(0, 0, 0.5)), dark);
      const nozzle = new Mesh(this.geom(new ConeGeometry(0.16, 0.5, 8).rotateX(Math.PI / 2)), dark);
      nozzle.name = 'flightOps:boomNozzle';
      inner.add(nozzle);
      for (const side of [1, -1]) {
        const rv = new Mesh(this.plate([[0, 0], [2.2, 0.7], [2.2, 1.4], [0, 1.6]], 0.08), skin);
        rv.position.z = 5.5;
        rv.rotation.z = side * 35 * D2R;
        rv.scale.x = side;
        boom.add(rv);
      }
      boom.add(outer, inner);
      this.boom = boom; this.boomOuter = outer; this.boomInner = inner;
      boom.position.set(this.tanker.boom?.pivot.right ?? 0, this.tanker.boom?.pivot.up ?? -2, this.tanker.boom?.pivot.aft ?? 18);
      this.rig.add(boom);
      if (!this.tanker.boom) this.setBoom({ aft: 18 + 9, right: 0, up: -2 - 0.8 });   // MPRS: stowed
    }
    if (this.tanker.boom) this.setBoom(boomPoint(this.tanker));
    this.setBasket(this.tanker.drogue ? basketRest(this.tanker) : null);
  }

  private geom<T extends BufferGeometry>(g: T): T { this.geoms.push(g); return g; }
  private mat<T extends Material>(m: T): T { this.mats.push(m); return m; }
  private part(g: BufferGeometry, m: Material): Mesh {
    const mesh = new Mesh(this.geom(g), m);
    this.airframe.add(mesh);
    return mesh;
  }
  /** Flat plate from a plan outline (x right, z aft), thickness in y. */
  private plate(pts: [number, number][], thick: number): BufferGeometry {
    const shape = new Shape();
    pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    shape.closePath();
    return this.geom(new ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, steps: 1 }).rotateX(-Math.PI / 2).translate(0, -thick / 2, 0));
  }
  /** Vertical fin from a side outline (z aft, y up), thickness in x. */
  private fin(pts: [number, number][], thick: number, m: Material): void {
    const shape = new Shape();
    pts.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
    shape.closePath();
    this.part(new ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, steps: 1 }).rotateY(Math.PI / 2).translate(-thick / 2, 0, 0), m);
  }

  /** Boom nozzle at a tanker-frame point (from the pivot). */
  private setBoom(tip: TankerFrameVec): void {
    if (!this.boom || !this.boomInner || !this.boomOuter) return;
    const p = this.boom.position;
    _a.set(tip.right - p.x, tip.up - p.y, tip.aft - p.z);
    const ext = Math.max(1, _a.length());
    this.boom.quaternion.copy(_q.setFromUnitVectors(Z, _a.normalize()));
    this.boomOuter.scale.z = Math.min(8, ext - 0.5);
    this.boomInner.scale.set(1, 1, ext);
    const nozzle = this.boomInner.children[0];
    if (nozzle) { nozzle.position.z = 1; nozzle.scale.z = 1 / ext; }
  }

  /** Basket at a tanker-frame point (null = no hose), the hose drawn from the pod (rolled with the airframe). */
  private setBasket(at: TankerFrameVec | null): void {
    const dr = this.tanker.drogue;
    if (!dr || !this.hose || !this.basket) return;
    this.basket.visible = !!at;
    const L = this.hose;
    L.reset();
    if (at) {
      const pod = rollPoint(dr.pod, -this.airframe.rotation.z);
      const pts = hosePoints(pod, at, 24, Math.max(0.1, 0.035 * Math.hypot(at.aft - pod.aft, at.up - pod.up)));
      // Basket axis along the last hose segment, wide end aft.
      const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!;
      _a.set(b.right - a.right, b.up - a.up, b.aft - a.aft).normalize();
      this.basket.position.set(at.right, at.up, at.aft);
      this.basket.quaternion.copy(_q.setFromUnitVectors(Z, _a));
      // Stripes by distance from the cone (IL-78M only); plain hose elsewhere.
      const p = this.palette;
      const plain = p.dark.clone().lerp(p.smoke, 0.35);
      let fromCone = 0;
      for (let i = pts.length - 1; i > 0; i--) {
        const q0 = pts[i]!, q1 = pts[i - 1]!;
        const seg = Math.hypot(q1.aft - q0.aft, q1.right - q0.right, q1.up - q0.up);
        const mark = dr.gauge ? hoseMarkAt(dr.bands.value, fromCone + seg / 2) : null;
        const stripes = mark ? bandStripes(mark) : null;
        const col = stripes ? p[stripes[(i % stripes.length)]!] : plain;
        L.line({ x: q0.right, y: q0.up, z: q0.aft }, { x: q1.right, y: q1.up, z: q1.aft }, { color: col, alpha: 1, width: 4 });
        fromCone += seg;
      }
    }
    L.commit();
  }

  /**
   * Place the tanker and drive the hose, basket and boom from the refuelling state. `tip` (tanker frame) is where
   * the scene drew the receiver's probe tip; the basket rides on it while connected (defaults to `aar.tip`).
   */
  update(a: AarState, tip?: TankerFrameVec): void {
    this.position.set(a.tankerPos.x, a.tankerPos.y, a.tankerPos.z);
    this.quaternion.copy(orientationQuaternion(a.tankerHeading, 0, 0, _q));
    this.airframe.rotation.set(0, 0, -a.tankerBank);
    if (this.tanker.drogue) {
      const at = a.connected ? (tip ?? a.tip) : basketRest(this.tanker);
      const key = `${at.aft.toFixed(2)}|${at.right.toFixed(2)}|${at.up.toFixed(2)}|${a.tankerBank.toFixed(3)}`;
      if (key !== this.key) { this.key = key; this.setBasket(at); }
    }
    if (this.tanker.boom && a.boom) {
      const b = a.boom;
      this.setBoom(a.connected ? (tip ?? a.tip) : boomPoint(this.tanker, b.elevDeg, b.extM, b.azDeg));
    }
  }

  /** World (root metres) point of a tanker-frame point, level frame. */
  toWorld(v: TankerFrameVec, out = new Vector3()): Vector3 {
    return out.set(v.right, v.up, v.aft).applyQuaternion(this.quaternion).add(this.position);
  }

  /** Tanker-frame point of a root-metres point. */
  toFrame(p: Vector3): TankerFrameVec {
    _b.copy(p).sub(this.position).applyQuaternion(_q.copy(this.quaternion).invert());
    return { aft: _b.z, right: _b.x, up: _b.y };
  }

  override dispose(): void {
    for (const g of this.geoms) g.dispose();
    for (const m of this.mats) m.dispose();
    this.hose?.dispose();
    this.removeFromParent();
  }
}
