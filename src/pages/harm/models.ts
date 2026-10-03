/**
 * [OWNER: page-harm] Original low-poly art for the HARM page: the SAM vehicles it teaches and the AGM-88C.
 * Artist approximations from public photographs and the sizes in docs/research/fa18c-harm.md (S2); no copied
 * geometry, no internals. Metres, base at y = 0, nose toward −z, up +y. SA-11 TELAR, SA-15 and the SA-10 launcher
 * use the bundled library exteriors (AssetVisual) over a procedural fallback, exactly as render/samSites.ts does.
 * Every other vehicle is procedural: parts merged per moving piece with ModelBuilder, a handful of meshes each.
 */
import {
  CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry, BoxGeometry,
  type BufferGeometry, type Material, type Object3D,
} from 'three';
import { ModelBuilder, S, Slot, type SlotId } from '../../render/modelBuilder';
import { AssetVisual } from '../../render/assets';
import { fitGroundAsset } from '../../render/attack/groundUnits';
import type { Palette } from '../../render/palette';
import type { VehicleId } from './types';

// ------------------------------------------------------------------------------------------ catalogue

export interface VehicleInfo {
  /** Display name, e.g. '1S91 Straight Flush'. */
  name: string;
  /** Length × width × height (m) from S2; absent when the research gives no size. */
  dims?: [number, number, number];
  /** RWR symbol for vehicles with a radar (S1 ALIC table); null for launchers and the command post. */
  rwr: string | null;
}

export const VEHICLE_IDS: readonly VehicleId[] = [
  'sa6-str', 'sa6-tel', 'sa8', 'sa11-sr', 'sa11-telar', 'sa11-cp', 'sa15', 'sa10-sr', 'sa10-tr', 'sa10-ln',
];

export const VEHICLE_INFO: Readonly<Record<VehicleId, VehicleInfo>> = {
  'sa6-str': { name: '1S91 Straight Flush', dims: [7.38, 3.73, 5.88], rwr: '6' },
  'sa6-tel': { name: '2P25 launcher', dims: [7.389, 3.18, 3.45], rwr: null },
  sa8: { name: '9A33 Osa', dims: [9.14, 2.8, 4.2], rwr: '8' },
  'sa11-sr': { name: '9S18M1 Snow Drift', rwr: 'SD' },
  'sa11-telar': { name: '9A310M1 TELAR', rwr: '11' },
  'sa11-cp': { name: '9S470M1 command post', rwr: null },
  sa15: { name: '9A331 Tor', dims: [7.5, 3.3, 4.1], rwr: '15' },
  'sa10-sr': { name: '64N6E Big Bird', dims: [20.2, 5.75, 8.68], rwr: 'BB' },
  'sa10-tr': { name: '30N6 Flap Lid', rwr: '10' },
  'sa10-ln': { name: '5P85 launcher', dims: [9.4, 3.1, 3.7], rwr: null },
};

/**
 * Drawn size of each model, L × W × H (m). The sourced dims where S2 gives them; the others are the art's own
 * proportions (display only, not data). Scenes use it for pixel floors and label heights.
 */
export const VEHICLE_SIZE: Readonly<Record<VehicleId, [number, number, number]>> = {
  'sa6-str': [7.38, 3.73, 5.88],
  'sa6-tel': [7.389, 3.18, 3.45],
  sa8: [9.14, 2.8, 4.2],
  'sa11-sr': [9.6, 6.2, 5.6],
  'sa11-telar': [9.3, 3.25, 4.2],
  'sa11-cp': [9, 3.25, 5.7],
  sa15: [7.5, 3.3, 4.1],
  'sa10-sr': [20.2, 5.75, 8.68],
  'sa10-tr': [14.5, 3.6, 9.2],
  'sa10-ln': [9.4, 3.1, 3.7],
};

/** AGM-88C drawn length and body diameter (m, S2). */
export const HARM_LENGTH_M = 4.17;
export const HARM_DIAMETER_M = 0.254;

/** Library exterior used for a vehicle, if any. */
const ASSET: Partial<Record<VehicleId, 'sa11' | 'sa15' | 'sa10'>> = { 'sa11-telar': 'sa11', sa15: 'sa15', 'sa10-ln': 'sa10' };

/** True when the vehicle draws a library exterior (procedural fallback until it loads). */
export function usesAsset(id: VehicleId): boolean { return ASSET[id] !== undefined; }

// ------------------------------------------------------------------------------------------ rig

/** A rotating antenna: continuous spin (sweep 0) or a sector sweep of ±sweep rad. */
export interface SpinPart { obj: Object3D; rate: number; sweep: number }

/** Everything a scene needs to animate, wreck and dispose a model. Stored on `group.userData.rig`. */
export interface ModelRig {
  kind: VehicleId | 'harm';
  /** Squashed for wrecks; the caller owns the outer group's position, rotation and scale. */
  body: Group;
  fallback: Group;
  asset: AssetVisual | null;
  spin: SpinPart[];
  mats: Material[];
  /** Wreck (vehicles) or guidance-lost (HARM) material. */
  alt: Material;
  geos: BufferGeometry[];
  state: boolean;
}

export function modelRig(g: Object3D): ModelRig | null {
  return (g.userData.rig as ModelRig | undefined) ?? null;
}

// Material slots (ModelBuilder's six slots, re-used with page meanings).
const HULL = Slot.body, ACCENT = Slot.accent, STORE = Slot.canopy, DARK = Slot.dark, FACE = Slot.navRed;

function std(c: MeshStandardMaterial['color']): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: c, roughness: 0.88, metalness: 0.06, flatShading: true, side: DoubleSide });
}

/** Ground-unit colours (render/attack/groundUnits.ts conventions), indexed by slot. */
function vehicleMaterials(P: Palette): Material[] {
  const hull = P.dark.clone().lerp(P.earth, 0.35);
  const accent = hull.clone().lerp(P.smoke, 0.18);
  const dark = std(P.dark.clone());
  return [std(hull), std(accent), std(P.missile.clone().lerp(P.smoke, 0.25)), dark, std(P.smoke.clone().lerp(P.dark, 0.35)), dark];
}

class Kit {
  readonly geos: BufferGeometry[] = [];
  readonly spin: SpinPart[] = [];
  constructor(readonly mats: Material[]) {}
  /** Merge a builder into one mesh under `parent` (raw coordinates, no centring). */
  mesh(b: ModelBuilder, parent: Object3D, name = ''): Mesh {
    const g = b.build(undefined, false);
    this.geos.push(g);
    const m = new Mesh(g, this.mats);
    m.name = name;
    parent.add(m);
    return m;
  }
  /** A pivot group; with a rate it is an animated antenna. */
  pivot(parent: Object3D, x: number, y: number, z: number, name: string, rate = 0, sweep = 0): Group {
    const g = new Group();
    g.position.set(x, y, z);
    g.name = name;
    parent.add(g);
    if (rate) this.spin.push({ obj: g, rate, sweep });
    return g;
  }
}

interface Xf { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; pre?: [number, number, number] }

/** Add a primitive: optional pre-offset, rotate (x, y, z order), then translate. */
function put(b: ModelBuilder, slot: SlotId, g: BufferGeometry, t: Xf = {}): void {
  if (t.pre) g.translate(t.pre[0], t.pre[1], t.pre[2]);
  if (t.rx) g.rotateX(t.rx);
  if (t.ry) g.rotateY(t.ry);
  if (t.rz) g.rotateZ(t.rz);
  g.translate(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  b.add(slot, g);
}

/** Wheel or road wheel: axle along x. */
function wheel(b: ModelBuilder, x: number, z: number, r: number, w: number): void {
  put(b, DARK, new CylinderGeometry(r, r, w, 12), { rz: Math.PI / 2, x, y: r, z });
}

/** Tracked chassis: two tracks with rounded ends and a boxy hull with a sloped glacis, deck at `deck`. */
function tracked(b: ModelBuilder, L: number, W: number, deck: number): void {
  const tw = 0.62, tx = W / 2 - tw / 2;
  for (const s of [-1, 1]) {
    b.box(s * tx, 0.55, 0, tw, 0.9, L - 1, DARK);
    wheel(b, s * tx, -(L / 2 - 0.5), 0.5, tw);
    wheel(b, s * tx, L / 2 - 0.5, 0.5, tw);
  }
  const mid = (0.75 + deck) / 2, hh = (deck - 0.75) / 2;
  b.loft([
    S(-L / 2 + 0.05, W / 2 - 0.05, 0.12, 0.12, 0.92, 8),
    S(-L / 2 + 1.2, W / 2 - 0.02, hh, hh, mid, 8),
    S(L / 2 - 0.25, W / 2 - 0.02, hh, hh, mid, 8),
    S(L / 2 - 0.05, W / 2 - 0.1, hh * 0.8, hh * 0.8, mid, 8),
  ], { slot: HULL, seg: 12 });
}

/**
 * Parabolic-looking dish (a spherical cap) facing −z: rim half-width rx, half-height ry, centre of the rim at
 * (x, y, z), tilted face-up by `tilt` rad. Back of the dish bulges toward +z.
 */
function dish(b: ModelBuilder, rx: number, ry: number, x: number, y: number, z: number, tilt = 0, slot: SlotId = FACE): void {
  const phi = 0.62, k = 1 / Math.sin(phi);
  const g = new SphereGeometry(1, 14, 4, 0, Math.PI * 2, 0, phi);
  const depth = 0.3 * Math.min(rx, ry);
  const sy = depth / (1 - Math.cos(phi));
  g.scale(rx * k, sy, ry * k);
  g.translate(0, -Math.cos(phi) * sy, 0);
  g.rotateX(Math.PI / 2); // cap axis +y → +z: rim in the xy plane, concave side toward −z
  if (tilt) g.rotateX(tilt);
  g.translate(x, y, z);
  b.add(slot, g);
}

/** A missile lying along z, nose at zNose, with cruciform wings and tail fins (canister-free SAM shapes). */
function missileShape(b: ModelBuilder, x: number, y: number, zNose: number, len: number, r: number): void {
  const zc = zNose + len * 0.14;
  b.cone(zNose, zc, r, { x, y, slot: STORE, seg: 8, mirror: false });
  b.cyl(zc, zNose + len, r, r, { x, y, slot: STORE, seg: 8, mirror: false });
  for (const [f, span, chord] of [[0.45, r * 5.2, len * 0.16], [0.9, r * 4.4, len * 0.12]] as const) {
    for (const rz of [Math.PI / 4, -Math.PI / 4]) put(b, STORE, new BoxGeometry(span, 0.03, chord), { rz, x, y, z: zNose + len * f });
  }
}

/** Flat rectangular antenna (face toward −z) with a back frame, rotated face-up by tilt about its centre. */
function panel(b: ModelBuilder, w: number, h: number, x: number, y: number, z: number, tilt: number, depth = 0.3): void {
  put(b, FACE, new BoxGeometry(w, h, depth * 0.5), { pre: [0, 0, -depth * 0.25], rx: tilt, x, y, z });
  put(b, ACCENT, new BoxGeometry(w * 0.94, h * 0.94, depth * 0.5), { pre: [0, 0, depth * 0.25], rx: tilt, x, y, z });
}

// ------------------------------------------------------------------------------------------ vehicles

type Builder = (k: Kit, root: Group) => void;

/** 1S91 Straight Flush: tracked chassis, tall rotating turret, search dish above a tracking dish. */
const sa6Str: Builder = (k, root) => {
  const L = 7.38, deck = 1.75;
  const b = new ModelBuilder();
  tracked(b, L, 3.2, deck);
  b.box(0, deck + 0.35, 2, 2.6, 0.7, 2.4, ACCENT);
  k.mesh(b, root, 'chassis');
  const tur = k.pivot(root, 0, deck, -0.6, 'antenna:turret', 1.1);
  const t = new ModelBuilder();
  put(t, ACCENT, new CylinderGeometry(1.15, 1.25, 0.9, 12), { y: 0.45 });
  t.box(0, 2.25, 0.6, 0.5, 2.7, 0.5, DARK);
  dish(t, 0.85, 0.85, 0, 1.85, -0.45, 0.05);
  dish(t, 1.85, 0.82, 0, 3.3, 0.15, 0.12);
  t.box(0, 3.3, 0.55, 0.4, 0.4, 0.5, DARK);
  k.mesh(t, tur, 'turret');
};

/** 2P25: tracked chassis, turntable launcher with three missiles. */
const sa6Tel: Builder = (k, root) => {
  const L = 7.1, deck = 1.7;
  const b = new ModelBuilder();
  tracked(b, L, 3.18, deck);
  put(b, ACCENT, new CylinderGeometry(1.2, 1.25, 0.4, 12), { y: deck + 0.2, z: 0.6 });
  k.mesh(b, root, 'chassis');
  const ln = k.pivot(root, 0, deck + 0.45, 0.6, 'launcher');
  ln.rotation.x = 0.12;
  const m = new ModelBuilder();
  m.box(0, 0.2, 0, 2.5, 0.25, 3.6, DARK);
  for (const x of [-0.85, 0, 0.85]) missileShape(m, x, 0.55, -3.5, 5.8, 0.165);
  k.mesh(m, ln, 'missiles');
};

/** 9A33 Osa: six-wheeled boat hull, turret with a folding search antenna, tracking dish and two triple banks. */
const sa8: Builder = (k, root) => {
  const b = new ModelBuilder();
  b.loft([
    S(-4.57, 1.0, 0.2, 0.2, 1.1, 4),
    S(-3.6, 1.4, 0.65, 0.55, 1.25, 4),
    S(4.3, 1.4, 0.65, 0.55, 1.25, 4),
    S(4.57, 1.3, 0.5, 0.4, 1.3, 4),
  ], { slot: HULL, seg: 12 });
  for (const s of [-1, 1]) for (const z of [-2.9, 0.1, 3]) wheel(b, s * 1.15, z, 0.62, 0.45);
  k.mesh(b, root, 'hull');
  const tur = k.pivot(root, 0, 1.9, 0.4, 'turret');
  const t = new ModelBuilder();
  put(t, ACCENT, new CylinderGeometry(1.0, 1.08, 0.95, 12), { y: 0.47 });
  dish(t, 0.6, 0.6, 0, 0.75, -1.15, 0.15);
  t.box(0, 1.35, 0.35, 0.4, 0.9, 0.4, DARK);
  for (const s of [-1, 1]) for (const y of [0.3, 0.62, 0.94]) missileShape(t, s * 1.18, y, -1.6, 3.15, 0.1);
  k.mesh(t, tur, 'turret');
  const ant = k.pivot(tur, 0, 1.78, 0.35, 'antenna:search', 1.6);
  const a = new ModelBuilder();
  panel(a, 2.4, 0.95, 0, 0.05, 0, 0.25, 0.2);
  k.mesh(a, ant, 'search');
};

/** 9S18M1 Snow Drift: tracked chassis with a large raised rectangular antenna on a turntable. */
const sa11Sr: Builder = (k, root) => {
  const L = 9.6, deck = 1.8;
  const b = new ModelBuilder();
  tracked(b, L, 3.25, deck);
  b.box(0, deck + 0.45, -3.3, 3.0, 0.9, 2.2, ACCENT);
  k.mesh(b, root, 'chassis');
  const ant = k.pivot(root, 0, deck, 1.6, 'antenna:search', 0.9);
  const a = new ModelBuilder();
  put(a, ACCENT, new CylinderGeometry(1.2, 1.3, 0.5, 12), { y: 0.25 });
  for (const s of [-1, 1]) a.box(s * 1.1, 1.3, 0.2, 0.3, 1.7, 0.3, DARK);
  panel(a, 6.2, 2.3, 0, 2.6, 0, 0.3);
  k.mesh(a, ant, 'antenna');
};

/** 9S470M1 command post: tracked box body with small masts. No radar. */
const sa11Cp: Builder = (k, root) => {
  const L = 9, deck = 1.7;
  const b = new ModelBuilder();
  tracked(b, L, 3.25, deck);
  b.box(0, deck + 0.8, 0.8, 3.1, 1.6, 5.6, ACCENT);
  b.box(0, deck + 0.4, -3.2, 3.0, 0.8, 2.0, ACCENT);
  const top = deck + 1.6;
  put(b, DARK, new CylinderGeometry(0.05, 0.07, 2.4, 6), { x: 1.15, y: top + 1.2, z: 3.1 });
  put(b, DARK, new CylinderGeometry(0.05, 0.07, 2.0, 6), { x: -1.15, y: top + 1.0, z: 2.4 });
  put(b, DARK, new CylinderGeometry(0.08, 0.1, 1.4, 6), { x: 0, y: top + 0.7, z: -0.8 });
  b.box(0, top + 1.6, -0.8, 0.9, 0.5, 0.15, FACE);
  k.mesh(b, root, 'body');
};

/** Tractor unit for the SA-10 trailers: cab, engine deck and two axles; front at zFront. */
function tractor(b: ModelBuilder, zFront: number): void {
  b.box(0, 1.1, zFront + 3, 2.6, 0.6, 6, DARK);
  b.box(0, 2.5, zFront + 1.3, 2.9, 2.2, 2.6, HULL);
  b.box(0, 2.0, zFront + 3.8, 2.6, 1.4, 2.2, HULL);
  for (const s of [-1, 1]) for (const dz of [1.7, 4.9]) wheel(b, s * 1.2, zFront + dz, 0.75, 0.5);
}

/** 64N6E Big Bird: tractor and trailer carrying a big double-sided rectangular antenna. */
const sa10Sr: Builder = (k, root) => {
  const b = new ModelBuilder();
  tractor(b, -10.1);
  b.box(0, 1.7, 2.75, 3.2, 0.8, 14.7, HULL);
  b.box(0, 2.35, -5, 2.6, 0.5, 2.5, DARK);
  b.box(0, 3.3, -1.5, 3.0, 2.4, 4.0, ACCENT);
  for (const s of [-1, 1]) for (const z of [6.9, 8.1, 9.3]) wheel(b, s * 1.25, z, 0.6, 0.5);
  k.mesh(b, root, 'vehicle');
  const ant = k.pivot(root, 0, 2.1, 3.6, 'antenna:search', 0.6);
  const a = new ModelBuilder();
  put(a, ACCENT, new CylinderGeometry(1.5, 1.6, 0.6, 14), { y: 0.3 });
  a.box(0, 1.5, 0, 1.0, 1.8, 1.0, DARK);
  a.box(0, 4.48, 0, 5.75, 4.2, 0.35, DARK);
  a.box(0, 4.48, -0.3, 5.6, 4.05, 0.25, FACE);
  a.box(0, 4.48, 0.3, 5.6, 4.05, 0.25, FACE);
  k.mesh(a, ant, 'antenna');
};

/** 30N6 Flap Lid: tractor and trailer, flat square phased-array panel on a short mast over the cabin. */
const sa10Tr: Builder = (k, root) => {
  const b = new ModelBuilder();
  tractor(b, -7.25);
  b.box(0, 1.5, 2.4, 3.0, 0.7, 9.7, HULL);
  b.box(0, 3.15, 3.2, 3.0, 2.6, 5.0, ACCENT);
  for (const s of [-1, 1]) for (const z of [5.4, 6.6]) wheel(b, s * 1.25, z, 0.6, 0.5);
  k.mesh(b, root, 'vehicle');
  const ant = k.pivot(root, 0, 4.45, 2.2, 'antenna:track', 0.5, 0.6);
  const a = new ModelBuilder();
  put(a, ACCENT, new CylinderGeometry(0.9, 1.0, 0.4, 12), { y: 0.2 });
  a.box(0, 1.0, 0.3, 0.7, 1.4, 0.7, DARK);
  panel(a, 3.6, 3.6, 0, 3.0, 0, 0.35, 0.4);
  k.mesh(a, ant, 'antenna');
};

/** SA-15 fallback: tracked chassis, turret with a search antenna on top and a tracking panel in front. */
const sa15: Builder = (k, root) => {
  const deck = 1.6;
  const b = new ModelBuilder();
  tracked(b, 7.5, 3.3, deck);
  k.mesh(b, root, 'chassis');
  const tur = k.pivot(root, 0, deck, 0.6, 'turret');
  const t = new ModelBuilder();
  t.box(0, 0.8, 0, 2.6, 1.6, 3.0, ACCENT);
  panel(t, 1.8, 1.4, 0, 0.9, -1.6, -0.15, 0.2);
  k.mesh(t, tur, 'turret');
  const ant = k.pivot(tur, 0, 1.6, 0.3, 'antenna:search', 1.5);
  const a = new ModelBuilder();
  panel(a, 2.6, 0.9, 0, 0.5, 0, 0.3, 0.16);
  k.mesh(a, ant, 'search');
};

/** SA-11 TELAR fallback: tracked chassis, turntable with four rails and a front dish (sector sweep). */
const sa11Telar: Builder = (k, root) => {
  const deck = 1.7;
  const b = new ModelBuilder();
  tracked(b, 9.3, 3.25, deck);
  k.mesh(b, root, 'chassis');
  const tur = k.pivot(root, 0, deck, 0.5, 'antenna:turret', 0.4, 0.5);
  const t = new ModelBuilder();
  put(t, ACCENT, new CylinderGeometry(1.2, 1.3, 0.5, 12), { y: 0.25 });
  for (const x of [-0.9, -0.3, 0.3, 0.9]) put(t, STORE, new CylinderGeometry(0.2, 0.2, 5.5, 8), { rx: -(Math.PI / 2 - 0.35), x, y: 1.4, z: 0.8 });
  dish(t, 1.0, 1.0, 0, 1.2, -1.9, 0.1);
  k.mesh(t, tur, 'turret');
};

/** SA-10 launcher fallback: 8×8 truck with four transport canisters laid on the back. */
const sa10Ln: Builder = (k, root) => {
  const b = new ModelBuilder();
  b.box(0, 1.3, 0.2, 3.0, 1.2, 9.0, HULL);
  b.box(0, 2.6, -3.7, 3.0, 1.4, 2.0, ACCENT);
  for (const s of [-1, 1]) for (const z of [-3.5, -2, 1.6, 3.1]) wheel(b, s * 1.2, z, 0.6, 0.5);
  for (const [x, y] of [[-0.45, 2.35], [0.45, 2.35], [-0.45, 3.25], [0.45, 3.25]] as const) {
    put(b, STORE, new CylinderGeometry(0.42, 0.42, 7.2, 10), { rx: Math.PI / 2 - 0.06, x, y, z: 1 });
  }
  k.mesh(b, root, 'vehicle');
};

const BUILDERS: Record<VehicleId, Builder> = {
  'sa6-str': sa6Str, 'sa6-tel': sa6Tel, sa8, 'sa11-sr': sa11Sr, 'sa11-telar': sa11Telar, 'sa11-cp': sa11Cp,
  sa15, 'sa10-sr': sa10Sr, 'sa10-tr': sa10Tr, 'sa10-ln': sa10Ln,
};

/**
 * Build one vehicle (metres). The returned group's userData.rig (modelRig) holds the antenna pivots, the
 * materials and the library exterior; userData.spin lists the antenna pivots. `onReady` fires when a
 * library exterior has loaded (request a render).
 */
export function buildVehicle(id: VehicleId, palette: Palette, opts: { onReady?: () => void } = {}): Group {
  const mats = vehicleMaterials(palette);
  const k = new Kit(mats);
  const group = new Group();
  group.name = 'harm-vehicle:' + id;
  const body = new Group();
  const fallback = new Group();
  fallback.name = 'fallback';
  body.add(fallback);
  group.add(body);
  BUILDERS[id](k, fallback);
  let asset: AssetVisual | null = null;
  const assetId = ASSET[id];
  if (assetId) {
    const len = VEHICLE_SIZE[id][0];
    asset = new AssetVisual(assetId, { onReady: visual => {
      fitGroundAsset(visual, len);
      fallback.visible = false;
      opts.onReady?.();
    } });
    body.add(asset);
  }
  const rig: ModelRig = {
    kind: id, body, fallback, asset, spin: k.spin, mats, alt: std(palette.soot.clone()), geos: k.geos, state: false,
  };
  group.userData.rig = rig;
  group.userData.spin = k.spin.map(s => s.obj);
  return group;
}

/** Turn the antennas to their pose at time t (s). Wrecks stay still. */
export function animateVehicle(group: Object3D, t: number): void {
  const rig = modelRig(group);
  if (!rig || rig.state || rig.kind === 'harm') return;
  for (const s of rig.spin) {
    s.obj.rotation.y = s.sweep ? Math.sin(t * s.rate) * s.sweep : (t * s.rate) % (Math.PI * 2);
  }
}

/** Wreck look: soot material and a squashed body. Idempotent. */
export function setVehicleWreck(group: Object3D, dead: boolean): void {
  const rig = modelRig(group);
  if (!rig || rig.kind === 'harm' || rig.state === dead) return;
  rig.state = dead;
  rig.body.scale.y = dead ? 0.55 : 1;
  rig.fallback.traverse(o => { if (o instanceof Mesh) o.material = dead ? rig.alt : rig.mats; });
  rig.asset?.setMaterial(dead ? rig.alt : null);
}

// ------------------------------------------------------------------------------------------ HARM

/** AGM-88C: slender body with an ogive nose, four mid-body delta wings and four tail fins. One mesh. */
export function buildHarm(palette: Palette): Group {
  const L = HARM_LENGTH_M, r = HARM_DIAMETER_M / 2;
  const b = new ModelBuilder();
  b.loft([
    S(0, 0.004, 0.004), S(0.12, r * 0.42, r * 0.42), S(0.3, r * 0.72, r * 0.72), S(0.52, r * 0.92, r * 0.92),
    S(0.78, r, r), S(L - 0.02, r, r), S(L, r * 0.85, r * 0.85),
  ], { slot: HULL, seg: 12, rearCap: DARK });
  b.cone(0, 0.3, r * 0.73, { slot: DARK, seg: 12, mirror: false });
  // Mid-body delta wings (planform: x outward from the body, z aft of the nose) and tail fins.
  const wing: [number, number][] = [[r, 1.45], [0.42, 2.25], [0.42, 2.38], [r, 2.38]];
  const tail: [number, number][] = [[r, 3.7], [0.3, 4.02], [0.3, 4.14], [r, 4.14]];
  for (const p of [wing, tail]) {
    b.plate(p, { t: 0.02, slot: ACCENT });
    const up = p.map(([x, z]) => [z, x] as [number, number]);
    b.fin(up, { t: 0.02, slot: ACCENT });
    b.fin(up.map(([z, h]) => [z, -h] as [number, number]), { t: 0.02, slot: ACCENT });
  }
  const geo = b.build(L);
  const body = std(palette.missile.clone());
  const accent = std(palette.missile.clone().lerp(palette.smoke, 0.3));
  const dark = std(palette.dark.clone());
  const mats: Material[] = [body, accent, body, dark, body, body];
  const mesh = new Mesh(geo, mats);
  mesh.name = 'harm';
  const group = new Group();
  group.name = 'harm';
  const inner = new Group();
  inner.add(mesh);
  group.add(inner);
  const alt = new MeshBasicMaterial({ color: palette.smoke.clone(), transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
  const rig: ModelRig = { kind: 'harm', body: inner, fallback: inner, asset: null, spin: [], mats, alt, geos: [geo], state: false };
  group.userData.rig = rig;
  group.userData.spin = [];
  return group;
}

/** Guidance lost: grey, translucent HARM. Idempotent. */
export function setHarmLost(group: Object3D, lost: boolean): void {
  const rig = modelRig(group);
  if (!rig || rig.kind !== 'harm' || rig.state === lost) return;
  rig.state = lost;
  rig.body.traverse(o => { if (o instanceof Mesh) o.material = lost ? rig.alt : rig.mats; });
}

// ------------------------------------------------------------------------------------------ dispose

/**
 * Free a vehicle or HARM built here: its own geometries and materials and the library exterior (shared
 * library geometry is released by AssetVisual, never disposed here). Removes the group from its parent.
 */
export function disposeVehicle(group: Object3D): void {
  const rig = modelRig(group);
  group.removeFromParent();
  if (!rig) return;
  rig.asset?.dispose();
  for (const g of rig.geos) g.dispose();
  for (const m of new Set([...rig.mats, rig.alt])) m.dispose();
  rig.geos.length = 0;
  rig.spin.length = 0;
  delete group.userData.rig;
}

export const disposeHarm = disposeVehicle;

/** Number of meshes drawn by a model's procedural parts (tests and budgets). */
export function meshCount(group: Object3D): number {
  let n = 0;
  modelRig(group)?.fallback.traverse(o => { if (o instanceof Mesh) n++; });
  return n;
}
