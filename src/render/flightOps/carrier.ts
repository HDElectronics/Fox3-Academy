/**
 * CarrierMesh: a low-poly ship for the Case I trainer (issue #26), built from SHIPS / SHIP_HULL
 * (src/data/ships.ts) in ship-local metres. Origin at the ramp (stern on the centreline), at sea level;
 * x to starboard, y up, forward along −z (a ship heading of 0 = north). The page places it from
 * `FlightOpsState.ship` with `place(ship)`: position (ship.x, 0, ship.z), yaw −heading.
 *
 * What the pilot meets: hull and flight deck, the island, the angled landing area with edge lines and a
 * dashed centreline, four wires (the target wire drawn in the ok token), the optical landing aid on the port
 * side (IFLOLS lens with the amber ball and green datum bars, or the Luna-3 colour light on the Kuznetsov,
 * both driven by `setBall`) and, on the Kuznetsov, the ski-jump bow. Drawing values, not ship plans.
 */
import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Shape, type Material,
} from 'three';
import { SHIPS, SHIP_HULL } from '../../data/ships';
import { BALL_CELLS, IFLOLS_RED_CELL } from '../../sim/flightOps/lso';
import type { BallState, ShipData, ShipId } from '../../sim/flightOps/types';
import type { Palette } from '../palette';

const D2R = Math.PI / 180;

/** Ship-local point (x starboard, z aft) of a ship-frame point (a forward of the ramp, c to starboard). */
export const shipLocal = (a: number, c: number) => ({ x: c, z: -a });

/** Ship-local point of a landing-frame point (u along the angled axis from the ramp, v right of it). */
export function landingLocal(u: number, v: number, angledDeg: number): { x: number; z: number } {
  const t = angledDeg * D2R;
  // Landing axis is angledDeg to port of the ship heading: forward (a, c) = (cos t, −sin t), right = (sin t, cos t).
  const a = u * Math.cos(t) + v * Math.sin(t);
  const c = -u * Math.sin(t) + v * Math.cos(t);
  return shipLocal(a, c);
}

/** Landing-frame (u, v) of a ship-frame point (a, c). */
export function shipToLanding(a: number, c: number, angledDeg: number): { u: number; v: number } {
  const t = angledDeg * D2R;
  return { u: a * Math.cos(t) - c * Math.sin(t), v: a * Math.sin(t) + c * Math.cos(t) };
}

/**
 * Flight-deck outline, ship frame (a forward, c starboard, metres), counter-clockwise seen from above
 * starting at the stern, port side. The port sponson is wide enough for the whole landing area.
 */
export function deckOutline(id: ShipId): [number, number][] {
  const { lengthM: L, beamM } = SHIP_HULL[id];
  const b = beamM / 2;
  const ship = SHIPS[id];
  // The landing area's far port corner, plus a margin: the port edge must contain it.
  const far = landingCorner(ship, ship.landingAreaLengthM, -ship.landingAreaWidthM / 2);
  const portW = Math.max(b * 1.05, -far.c + 6);
  const farA = Math.min(L * 0.9, far.a + 10);
  if (id === 'kuznetsov') {
    return [[0, -b * 0.55], [0, b * 0.55], [L * 0.2, b], [L * 0.75, b * 0.95], [L * 0.9, b * 0.5], [L, b * 0.3],
      [L, -b * 0.3], [L * 0.9, -b * 0.55], [farA, -portW], [L * 0.2, -portW * 0.9], [L * 0.04, -b * 0.7]];
  }
  return [[0, -b * 0.5], [0, b * 0.55], [L * 0.2, b], [L * 0.82, b], [L * 0.96, b * 0.55], [L, b * 0.2],
    [L, -b * 0.2], [L * 0.95, -b * 0.5], [farA, -portW], [L * 0.3, -portW * 0.95], [L * 0.05, -b * 0.62]];
}

function landingCorner(ship: ShipData, u: number, v: number): { a: number; c: number } {
  const t = ship.angledDeckDeg.value * D2R;
  return { a: u * Math.cos(t) + v * Math.sin(t), c: -u * Math.sin(t) + v * Math.cos(t) };
}

/** A painted strip on the deck: landing-frame centre line from (u0, v0) to (u1, v1), `w` metres wide. */
export interface DeckStrip { u0: number; v0: number; u1: number; v1: number; w: number; kind: 'edge' | 'centre' | 'wire' | 'target' | 'ramp' }

/** Paint for the landing area in the landing frame: edges, dashed centreline, ramp line, the wires. */
export function landingPaint(ship: ShipData, targetWire: number): DeckStrip[] {
  const L = ship.landingAreaLengthM, hw = ship.landingAreaWidthM / 2;
  const out: DeckStrip[] = [
    { u0: 0, v0: -hw, u1: L, v1: -hw, w: 0.6, kind: 'edge' },
    { u0: 0, v0: hw, u1: L, v1: hw, w: 0.6, kind: 'edge' },
    { u0: 0.5, v0: -hw, u1: 0.5, v1: hw, w: 1, kind: 'ramp' },
  ];
  for (let u = 4; u + 6 < L; u += 12) out.push({ u0: u, v0: 0, u1: u + 6, v1: 0, w: 0.45, kind: 'centre' });
  const s0 = ship.firstWireFromRampM.value, ds = ship.wireSpacingM.value;
  for (let i = 1; i <= ship.wires.value; i++) {
    const u = s0 + (i - 1) * ds;
    out.push({ u0: u, v0: -hw * 0.8, u1: u, v1: hw * 0.8, w: 0.35, kind: i === targetWire ? 'target' : 'wire' });
  }
  return out;
}

/** Flat strip quads (ship-local, at height y) as one geometry with up normals. */
function stripGeometry(strips: readonly DeckStrip[], angledDeg: number, y: number): BufferGeometry {
  const pos: number[] = [];
  for (const s of strips) {
    const du = s.u1 - s.u0, dv = s.v1 - s.v0, len = Math.hypot(du, dv) || 1;
    const nu = (-dv / len) * s.w / 2, nv = (du / len) * s.w / 2;
    const p = [[s.u0 - nu, s.v0 - nv], [s.u1 - nu, s.v1 - nv], [s.u1 + nu, s.v1 + nv], [s.u0 + nu, s.v0 + nv]]
      .map(([u, v]) => landingLocal(u!, v!, angledDeg));
    for (const i of [0, 1, 2, 0, 2, 3]) pos.push(p[i]!.x, y, p[i]!.z);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new BufferAttribute(n, 3));
  g.computeBoundingSphere();
  return g;
}

/** Iflols lens cell for the ball: clamps to the lens; `red` at or below the red low cells. */
export function lensCell(ball: BallState | null): { cell: number; red: boolean } | null {
  if (!ball) return null;
  const cell = Math.max(-BALL_CELLS, Math.min(BALL_CELLS, Math.round(ball.cell)));
  return { cell, red: cell <= IFLOLS_RED_CELL };
}

export class CarrierMesh extends Group {
  readonly shipId: ShipId;
  readonly ship: ShipData;
  private readonly geoms: BufferGeometry[] = [];
  private readonly mats: Material[] = [];
  private readonly ball: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly lights: Mesh<BufferGeometry, MeshBasicMaterial>[] = [];
  private readonly palette: Palette;
  private readonly cellH = 0.45;
  private readonly lensY: number;

  constructor(palette: Palette, id: ShipId, targetWire = 3) {
    super();
    this.name = `flightOps:carrier:${id}`;
    this.shipId = id;
    this.ship = SHIPS[id];
    this.palette = palette;
    const ship = this.ship;
    const { lengthM: L, beamM } = SHIP_HULL[id];
    const H = ship.deckHeightM;
    const ang = ship.angledDeckDeg.value;

    const hullMat = this.mat(new MeshStandardMaterial({ color: palette.smoke.clone().lerp(palette.dark, 0.45), roughness: 0.9, metalness: 0.1 }));
    const deckMat = this.mat(new MeshStandardMaterial({ color: palette.dark.clone().lerp(palette.smoke, 0.18), roughness: 0.95, metalness: 0, side: DoubleSide }));
    const islandMat = this.mat(new MeshStandardMaterial({ color: palette.smoke.clone().lerp(palette.dark, 0.3), roughness: 0.85, metalness: 0.1 }));

    // Hull: the deck outline extruded from the waterline to the deck (vertical sides, low poly).
    const shape = new Shape();
    deckOutline(id).forEach(([a, c], i) => (i ? shape.lineTo(c, a) : shape.moveTo(c, a)));
    shape.closePath();
    const hullGeo = new ExtrudeGeometry(shape, { depth: H, bevelEnabled: false, steps: 1 });
    hullGeo.rotateX(-Math.PI / 2);   // shape (c, a), depth → (x = c, y = depth, z = −a)
    this.geoms.push(hullGeo);
    this.add(new Mesh(hullGeo, [deckMat, hullMat]));

    // Paint on the landing area.
    const strips = landingPaint(ship, targetWire);
    const paintMats: Record<DeckStrip['kind'], Color> = {
      edge: palette.caution, centre: palette.missile, ramp: palette.missile, wire: palette.smoke, target: palette.ok,
    };
    for (const kind of ['edge', 'centre', 'ramp', 'wire', 'target'] as const) {
      const g = stripGeometry(strips.filter(s => s.kind === kind), ang, H + 0.12);
      this.geoms.push(g);
      this.add(new Mesh(g, this.mat(new MeshBasicMaterial({ color: paintMats[kind].clone(), side: DoubleSide, toneMapped: false }))));
    }

    // Island on the starboard side.
    const isl = id === 'cvn' ? { a0: L * 0.58, a1: L * 0.7, h: 22 } : { a0: L * 0.45, a1: L * 0.62, h: 26 };
    const islGeo = new BoxGeometry(beamM * 0.1, isl.h, isl.a1 - isl.a0);
    this.geoms.push(islGeo);
    const island = new Mesh(islGeo, islandMat);
    island.position.set(beamM * 0.4, H + isl.h / 2, -(isl.a0 + isl.a1) / 2);
    this.add(island);
    const mastGeo = new BoxGeometry(1.2, 14, 1.2);
    this.geoms.push(mastGeo);
    const mast = new Mesh(mastGeo, islandMat);
    mast.position.set(beamM * 0.4, H + isl.h + 7, -(isl.a0 + isl.a1) / 2);
    this.add(mast);

    // Kuznetsov ski-jump: a curved ramp over the bow, up to about 6 m.
    if (id === 'kuznetsov') {
      const a0 = L * 0.84, rise = 6, w = beamM * 0.5;
      const prof = new Shape();
      prof.moveTo(a0, 0);
      for (let i = 1; i <= 8; i++) { const k = i / 8; prof.lineTo(a0 + (L - a0) * k, rise * k * k); }
      prof.lineTo(L, 0);
      prof.closePath();
      const sj = new ExtrudeGeometry(prof, { depth: w, bevelEnabled: false, steps: 1 });
      sj.rotateY(Math.PI / 2);        // shape (a, h), depth w → (x = w, y = h, z = −a)
      sj.translate(-w / 2, H, 0);
      this.geoms.push(sj);
      this.add(new Mesh(sj, [deckMat, hullMat]));
    }

    // Optical landing aid on the port side, abeam the wires, facing aft.
    const aimU = ship.firstWireFromRampM.value + (Math.min(3, ship.wires.value) - 1) * ship.wireSpacingM.value;
    const p = landingLocal(aimU + 15, -ship.landingAreaWidthM / 2 - 10, ang);
    const aid = new Group();
    aid.name = 'flightOps:landingAid';
    aid.position.set(p.x, H, p.z);
    aid.rotation.y = ang * D2R;       // face down the landing axis
    this.add(aid);
    this.lensY = 3;
    const panelGeo = new BoxGeometry(3.2, 5.8, 0.4);
    this.geoms.push(panelGeo);
    const panel = new Mesh(panelGeo, this.mat(new MeshBasicMaterial({ color: palette.screen.clone(), toneMapped: false })));
    panel.position.set(0, this.lensY, 0);
    aid.add(panel);
    const lamp = (w: number, hgt: number, color: Color, x: number, y: number) => {
      const g = new BoxGeometry(w, hgt, 0.2);
      this.geoms.push(g);
      const m = new Mesh(g, this.mat(new MeshBasicMaterial({ color: color.clone(), toneMapped: false })));
      m.position.set(x, y, 0.25);
      aid.add(m);
      return m;
    };
    if (ship.lights === 'iflols') {
      // Green datum bars either side of the lens centre; the amber ball moves on the lens.
      lamp(2.4, 0.25, palette.ok, -3.2, this.lensY);
      lamp(2.4, 0.25, palette.ok, 3.2, this.lensY);
      this.ball = lamp(0.9, this.cellH * 0.9, palette.caution, 0, this.lensY);
      // Waveoff (red, either side of the lens) and cut (green, above) lights: dark until lit.
      this.lights.push(lamp(0.5, 1.6, palette.warning, -1.9, this.lensY + 1.6), lamp(0.5, 1.6, palette.warning, 1.9, this.lensY + 1.6));
      this.lights.push(lamp(2.2, 0.3, palette.ok, 0, this.lensY + 3.1));
    } else {
      // Luna-3: one colour light (green on the glide slope, yellow high, red low).
      this.ball = lamp(1.6, 1.6, palette.ok, 0, this.lensY);
    }
    this.ball.visible = false;
    for (const l of this.lights) l.visible = false;
  }

  private mat<T extends Material>(m: T): T { this.mats.push(m); return m; }

  /** Place the ship from the sim: ramp at (x, z) metres, heading radians clockwise from north. */
  place(ship: { x: number; z: number; heading: number }): void {
    this.position.set(ship.x, 0, ship.z);
    this.rotation.set(0, -ship.heading, 0);
  }

  /** Drive the landing aid from `FlightOpsState.lso.ball` (null: ball off the lens). */
  setBall(ball: BallState | null): void {
    const p = this.palette;
    if (this.ship.lights === 'luna3') {
      this.ball.visible = !!ball;
      if (ball) this.ball.material.color.copy(ball.luna === 'red' ? p.warning : ball.luna === 'yellow' ? p.caution : p.ok);
      return;
    }
    const lc = lensCell(ball);
    this.ball.visible = !!lc;
    if (lc) {
      this.ball.position.y = this.lensY + lc.cell * this.cellH;
      this.ball.material.color.copy(lc.red ? p.warning : p.caution);
    }
    this.lights[0]!.visible = this.lights[1]!.visible = !!ball?.waveoffLights;
    this.lights[2]!.visible = !!ball?.cutLights;
  }

  override dispose(): void {
    for (const g of this.geoms) g.dispose();
    for (const m of this.mats) m.dispose();
    this.removeFromParent();
  }
}
