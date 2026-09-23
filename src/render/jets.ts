/**
 * Procedural low-poly jets for every AircraftId, plus missiles. Geometry is built once per type in
 * metres (nose → −z, right wing +x, top +y) and shared; materials are shared per Stage palette and side.
 * Silhouette cues: Flanker twin tails on booms + long stinger (Su-33 canards), Fulcrum canted tails and
 * LERX, Eagle shoulder wing + box intakes, Hornet canted tails + LEX, Viper single tail + bubble canopy +
 * belly intake, Tomcat swing wings + pancake + beaver tail, JF-17 side intakes + single tail, Mirage delta.
 */
import {
  BufferGeometry, Color, CylinderGeometry, DoubleSide, Group, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Vector3,
} from 'three';
import type { AircraftId, MissileId } from '../data/types';
import { MISSILES } from '../data/missiles';
import { ModelBuilder, S, Slot, SLOT_COUNT, type SlotId } from './modelBuilder';
import { sideColor, type Palette, type VisualSide } from './palette';

export interface JetModel {
  id: AircraftId;
  /** Shared geometry (groups by material slot). */
  geometry: BufferGeometry;
  lengthM: number;
  spanM: number;
  /** Swing wing (F-14): right outer panel, pivot in model metres (centred frame), reference sweep. */
  swing?: { geometry: BufferGeometry; pivot: [number, number, number]; refSweepDeg: number };
  /** Configurable parts (gear, flaps, speedbrake) for the jets that have them (flight ops MVP). */
  parts?: JetParts;
}

/** What drives a configurable part: gear position (leg or door), flap position or speedbrake position. */
export type JetPartDrive = 'gearLeg' | 'gearDoor' | 'flaps' | 'brake';

/**
 * One hinged part. Geometry is in metres around its hinge; `pivot` is the hinge in the centred model
 * frame, `axis` the hinge direction (right side), `maxRad` the signed rotation at full travel (gear
 * legs: the retracted angle). `mirror` adds a left copy.
 */
export interface JetPart {
  drive: JetPartDrive;
  geometry: BufferGeometry;
  pivot: [number, number, number];
  axis: [number, number, number];
  maxRad: number;
  mirror: boolean;
}

export interface JetParts {
  list: JetPart[];
  /** Height of the model origin above the wheel contact line with the gear down (m). */
  groundClearanceM: number;
}

/** Gear, flap and speedbrake positions, each 0..1 (0 = gear up, flaps up, speedbrake in). */
export interface JetConfig { gear: number; flaps: number; speedbrake: number }

/** Real overall lengths / spans (m) used for sizing and camera distances. */
export const JET_DIMENSIONS: Record<AircraftId, { length: number; span: number }> = {
  su27: { length: 21.9, span: 14.7 },
  su33: { length: 21.2, span: 14.7 },
  j11a: { length: 21.9, span: 14.7 },
  mig29s: { length: 17.3, span: 11.4 },
  f15c: { length: 19.4, span: 13.1 },
  fa18c: { length: 17.1, span: 12.3 },
  f16c: { length: 15.1, span: 9.96 },
  f14b: { length: 19.1, span: 19.55 },
  jf17: { length: 14.9, span: 9.45 },
  m2000c: { length: 14.4, span: 9.13 },
};

/** Nominal length used for the screen-size floor so relative sizes survive the Tacview scale boost. */
export const NOMINAL_JET_M = 19;
export const NOMINAL_MISSILE_M = 4;

// ------------------------------------------------------------------------------------------ builders

function navLights(b: ModelBuilder, x: number, z: number, y = 0.05): void {
  b.box(-x, y, z, 0.16, 0.12, 0.3, Slot.navRed);
  b.box(x, y, z, 0.16, 0.12, 0.3, Slot.navGreen);
}

function flanker(kind: 'su27' | 'su33' | 'j11a'): BufferGeometry {
  const b = new ModelBuilder();
  const L = kind === 'su33' ? 21.2 : 21.9;
  const tailEnd = kind === 'su33' ? 20.9 : 21.9;
  // Forward fuselage with the drooped nose, then the flat, wide lifting body between the engines.
  b.loft([
    S(0, 0, 0, 0, 0.0), S(0.7, 0.3, 0.3, 0.3, 0.02), S(2.0, 0.56, 0.55, 0.52, 0.06), S(3.5, 0.74, 0.74, 0.66, 0.1),
    S(5.0, 0.84, 0.88, 0.7, 0.14), S(6.8, 0.95, 0.94, 0.72, 0.16), S(8.8, 1.25, 0.8, 0.64, 0.12, 2.8),
    S(11.5, 1.75, 0.62, 0.5, 0.06, 3.4), S(14.5, 1.95, 0.5, 0.45, 0.02, 4), S(17, 1.7, 0.42, 0.4, 0.0, 4),
    S(18.6, 0.9, 0.38, 0.34, 0.04, 3),
  ], { seg: 12 });
  // The long tail "stinger" between the nozzles.
  b.loft([S(17.5, 0.5, 0.36, 0.32, 0.06), S(19.4, 0.44, 0.32, 0.28, 0.08), S(tailEnd - 0.4, 0.3, 0.24, 0.22, 0.1), S(tailEnd, 0.1, 0.1, 0.1, 0.1)], { seg: 8 });
  // Engine nacelles slung under the lifting body, boxy intakes under the LERX.
  b.loft([
    S(8.2, 0.5, 0.42, 0.52, -0.82, 5), S(10.0, 0.6, 0.5, 0.6, -0.8, 4), S(13.5, 0.64, 0.55, 0.62, -0.7, 3),
    S(17, 0.58, 0.55, 0.55, -0.58, 2.6), S(18.7, 0.5, 0.5, 0.5, -0.5, 2),
  ], { x: 1.3, mirror: true, frontCap: Slot.dark, seg: 10 });
  b.cyl(18.6, 19.8, 0.5, 0.44, { x: 1.3, y: -0.5 });
  // Tail booms carrying fins and stabilators outboard of the engines.
  b.loft([S(12.5, 0.08, 0.1, 0.1, -0.1), S(14, 0.26, 0.2, 0.2, -0.1), S(19.6, 0.24, 0.2, 0.18, -0.1), S(20.6, 0.1, 0.1, 0.1, -0.08)], { x: 2.18, mirror: true, seg: 6 });
  // Ogival LERX blending into the trapezoidal wing (42° LE sweep), wingtip rails.
  b.plate([[0.55, 4.6], [0.95, 6.3], [1.55, 8.2], [2.3, 10.2], [7.35, 14.8], [7.35, 16.0], [2.5, 16.9], [0.55, 17.2]], { t: 0.3, y: 0.02 });
  b.cyl(14.3, 17.1, 0.1, 0.1, { x: 7.43, y: 0.02 });
  // All-moving stabilators on the booms.
  b.plate([[2.1, 17.2], [4.95, 19.6], [4.95, 20.5], [2.1, 20.7]], { t: 0.16, y: -0.12 });
  // Twin vertical fins on the booms (not canted) + ventral fins.
  b.fin([[14.4, 0], [17.5, 3.45], [18.65, 3.45], [19.2, 0]], { x: 2.18, y: 0.08, t: 0.18 });
  b.fin([[15.4, 0], [16.8, -0.95], [17.7, -0.95], [18.0, 0]], { x: 2.18, y: -0.2, t: 0.12, slot: Slot.body });
  if (kind === 'su33') {
    // Canards on the LERX.
    b.plate([[1.0, 6.2], [3.4, 7.7], [3.4, 8.35], [1.0, 8.65]], { t: 0.14, y: 0.18, slot: Slot.accent });
  }
  b.canopy(4.0, 7.6, 0.5, 0.62, 0.76);
  navLights(b, 7.45, 16.0);
  return b.build(L);
}

function mig29(): BufferGeometry {
  const b = new ModelBuilder();
  b.loft([
    S(0, 0, 0, 0, 0.08), S(0.7, 0.26, 0.26, 0.26, 0.08), S(1.9, 0.46, 0.46, 0.43, 0.06), S(3.3, 0.6, 0.62, 0.55, 0.08),
    S(4.8, 0.66, 0.8, 0.56, 0.14), S(6.4, 0.74, 0.92, 0.52, 0.18), S(8.3, 0.86, 0.9, 0.46, 0.2, 2.6),
    S(10.8, 0.88, 0.8, 0.4, 0.15, 3), S(13.2, 0.72, 0.6, 0.35, 0.06, 3), S(15.3, 0.38, 0.34, 0.3, 0.02), S(16.1, 0.18, 0.18, 0.18, 0.02),
  ], { seg: 12 });
  // Widely spaced nacelles, wedge intakes under the LERX.
  b.loft([
    S(5.7, 0.4, 0.38, 0.46, -0.68, 6), S(7.5, 0.48, 0.45, 0.52, -0.64, 4), S(11, 0.55, 0.5, 0.52, -0.55, 3),
    S(15, 0.5, 0.48, 0.48, -0.45, 2.6), S(16.4, 0.45, 0.45, 0.45, -0.4, 2),
  ], { x: 1.18, mirror: true, frontCap: Slot.dark, seg: 10 });
  b.cyl(16.3, 17.3, 0.44, 0.4, { x: 1.18, y: -0.4 });
  // Long curved LERX, 42° wing.
  b.plate([[0.5, 3.4], [0.8, 5.0], [1.35, 7.0], [2.0, 8.4], [5.7, 11.8], [5.7, 12.8], [2.0, 13.5], [0.5, 13.7]], { t: 0.26, y: 0.02 });
  b.plate([[1.3, 13.9], [3.75, 15.9], [3.75, 16.8], [1.3, 17.0]], { t: 0.14, y: -0.3 });
  // Twin fins on the nacelles, canted out 6°, with forward fillets.
  b.fin([[10.0, 0], [11.7, 0.55], [14.0, 2.5], [14.9, 2.5], [15.6, 0]], { x: 1.26, y: 0.08, cant: 6, t: 0.16 });
  b.canopy(3.9, 6.5, 0.42, 0.5, 0.66);
  navLights(b, 5.75, 12.4);
  return b.build(17.3);
}

function f15c(): BufferGeometry {
  const b = new ModelBuilder();
  b.loft([
    S(0, 0, 0, 0, 0.2), S(0.8, 0.3, 0.3, 0.3, 0.2), S(2.1, 0.56, 0.55, 0.52, 0.16), S(3.6, 0.72, 0.72, 0.62, 0.16),
    S(5.3, 0.8, 0.86, 0.66, 0.2), S(7.0, 0.9, 0.8, 0.7, 0.2, 2.5), S(8.6, 1.55, 0.62, 0.74, 0.1, 4),
    S(12, 1.72, 0.55, 0.74, 0.04, 5), S(15.5, 1.6, 0.5, 0.66, 0.0, 5), S(17.6, 1.2, 0.45, 0.55, -0.06, 4),
    S(18.3, 0.35, 0.2, 0.2, -0.06),
  ], { seg: 12 });
  // Big rectangular side intakes.
  b.loft([S(5.5, 0.44, 0.64, 0.66, 0.0, 7), S(7.3, 0.5, 0.64, 0.7, 0.0, 6), S(9.6, 0.5, 0.58, 0.7, 0.0, 5)], { x: 1.26, mirror: true, frontCap: Slot.dark, seg: 10 });
  b.cyl(17.5, 19.4, 0.56, 0.5, { x: 0.62, y: -0.1 });
  // Shoulder-mounted 45° wing with raked tips, on top of the intakes.
  b.plate([[1.1, 8.2], [6.55, 13.6], [6.55, 14.35], [6.2, 15.1], [1.1, 15.9]], { t: 0.3, y: 0.5 });
  b.plate([[1.5, 16.0], [4.3, 18.25], [4.3, 19.15], [1.5, 19.35]], { t: 0.16, y: -0.02 });
  // Twin vertical fins.
  b.fin([[13.3, 0], [16.2, 3.15], [17.5, 3.15], [18.5, 0]], { x: 1.52, y: 0.3, t: 0.18 });
  b.canopy(3.7, 7.4, 0.5, 0.64, 0.74);
  navLights(b, 6.6, 14.1, 0.5);
  return b.build(19.4);
}

function fa18c(): BufferGeometry {
  const b = new ModelBuilder();
  b.loft([
    S(0, 0, 0, 0, 0.1), S(0.7, 0.25, 0.25, 0.25, 0.1), S(2.0, 0.45, 0.45, 0.45, 0.08), S(3.5, 0.6, 0.62, 0.55, 0.1),
    S(5.0, 0.68, 0.8, 0.58, 0.15), S(7.0, 0.8, 0.8, 0.6, 0.15, 2.5), S(9.0, 1.2, 0.65, 0.66, 0.05, 3.5),
    S(12, 1.25, 0.6, 0.62, 0.0, 3.5), S(14.5, 1.12, 0.5, 0.55, 0.0, 3), S(15.6, 0.9, 0.45, 0.5, 0.0, 2.5),
  ], { seg: 12 });
  // Intakes under the LEX.
  b.loft([S(7.0, 0.36, 0.38, 0.4, -0.58, 3), S(9.0, 0.45, 0.45, 0.46, -0.52, 3), S(11.2, 0.45, 0.42, 0.42, -0.4, 3)], { x: 0.98, mirror: true, frontCap: Slot.dark, seg: 8 });
  b.cyl(15.4, 17.07, 0.5, 0.45, { x: 0.56, y: 0 });
  // Long LEX running up to the canopy, moderately swept wing with forward-swept trailing edge.
  b.plate([[0.42, 3.3], [0.7, 5.0], [1.2, 7.0], [1.9, 8.5], [5.72, 10.3], [5.72, 11.6], [1.9, 12.6], [0.42, 12.7]], { t: 0.22, y: 0.1 });
  b.cyl(9.6, 12.6, 0.09, 0.09, { x: 5.8, y: 0.1 });
  b.plate([[1.0, 13.9], [3.35, 15.75], [3.35, 16.45], [1.0, 16.9]], { t: 0.14, y: -0.05 });
  // Twin fins canted out 20°, forward of the stabs.
  b.fin([[10.4, 0], [13.2, 3.05], [14.25, 3.05], [14.9, 0]], { x: 1.05, y: 0.3, cant: 20, t: 0.16 });
  b.canopy(3.6, 7.0, 0.45, 0.56, 0.66);
  navLights(b, 5.72, 11.3, 0.1);
  return b.build(17.07);
}

function f16c(): BufferGeometry {
  const b = new ModelBuilder();
  b.loft([
    S(0, 0, 0, 0, 0.24), S(0.6, 0.22, 0.22, 0.22, 0.24), S(1.8, 0.42, 0.42, 0.42, 0.2), S(3.0, 0.55, 0.55, 0.5, 0.15),
    S(4.6, 0.62, 0.6, 0.62, 0.1), S(6.6, 0.74, 0.62, 0.64, 0.05, 2.6), S(9.2, 0.78, 0.66, 0.6, 0.05, 2.6),
    S(12.0, 0.68, 0.6, 0.55, 0.05), S(13.9, 0.56, 0.56, 0.56, 0.05),
  ], { seg: 12 });
  // Belly ("chin") intake.
  b.loft([S(3.9, 0.52, 0.28, 0.32, -0.74, 3), S(5.6, 0.54, 0.3, 0.34, -0.72, 3), S(8.2, 0.46, 0.3, 0.3, -0.6, 3), S(10.2, 0.28, 0.24, 0.22, -0.45)], { frontCap: Slot.dark, seg: 10 });
  b.cyl(13.8, 15.06, 0.56, 0.5, { y: 0.05 });
  // Thin strakes and a 40° cropped delta; tip rails.
  b.plate([[0.42, 3.2], [0.72, 5.0], [1.2, 6.6], [4.72, 10.6], [4.72, 11.55], [0.42, 11.6]], { t: 0.2, y: 0.0 });
  b.cyl(9.4, 12.3, 0.1, 0.1, { x: 4.84, y: 0 });
  b.plate([[0.7, 12.0], [2.8, 13.85], [2.8, 14.6], [0.7, 14.95]], { t: 0.13, y: -0.05, dihedral: -10 });
  // Single fin + canted ventral fins.
  b.fin([[9.6, 0], [12.7, 3.05], [13.7, 3.05], [14.3, 0]], { x: 0, y: 0.35, t: 0.16 });
  b.fin([[11.2, 0], [11.9, -0.72], [12.8, -0.72], [13.0, 0]], { x: 0.52, y: -0.42, cant: -18, t: 0.1, slot: Slot.body });
  // Big frameless bubble canopy.
  b.canopy(2.3, 6.3, 0.42, 0.62, 0.5);
  navLights(b, 4.78, 11.2);
  return b.build(15.06);
}

function f14b(): { geometry: BufferGeometry; swing: JetModel['swing'] } {
  const b = new ModelBuilder();
  const L = 19.1;
  b.loft([
    S(0, 0, 0, 0, 0.3), S(0.8, 0.3, 0.3, 0.3, 0.3), S(2.2, 0.55, 0.55, 0.5, 0.26), S(3.8, 0.7, 0.72, 0.6, 0.26),
    S(6.0, 0.78, 0.86, 0.62, 0.3), S(8.2, 0.86, 0.8, 0.55, 0.3, 2.5), S(10.2, 1.0, 0.55, 0.42, 0.2, 3),
    S(14.0, 1.0, 0.45, 0.36, 0.1, 4), S(16.5, 0.8, 0.36, 0.3, 0.05, 3), S(17.6, 0.4, 0.2, 0.2, 0.05),
  ], { seg: 12 });
  // Box intakes and very widely spaced nacelles.
  b.loft([
    S(6.7, 0.52, 0.62, 0.64, -0.08, 7), S(8.5, 0.6, 0.62, 0.66, -0.12, 5), S(12, 0.62, 0.6, 0.62, -0.15, 3.5),
    S(16.0, 0.58, 0.55, 0.55, -0.15, 2.5), S(17.7, 0.5, 0.5, 0.5, -0.15, 2),
  ], { x: 1.62, mirror: true, frontCap: Slot.dark, seg: 10 });
  b.cyl(17.6, 19.1, 0.5, 0.45, { x: 1.62, y: -0.15 });
  // Fixed glove ("pancake") and the beaver tail between the nozzles.
  b.plate([[0.6, 4.8], [1.7, 7.4], [3.3, 10.2], [3.4, 12.4], [2.5, 14.6], [1.8, 16.8], [0.6, 17.2]], { t: 0.34, y: 0.16 });
  b.plate([[0.0, 16.4], [0.82, 16.8], [0.72, 19.5], [0.0, 19.6]], { t: 0.14, y: 0.0 });
  b.plate([[2.0, 15.3], [5.1, 17.8], [5.1, 18.6], [2.0, 19.0]], { t: 0.16, y: -0.12 });
  b.fin([[12.7, 0], [15.9, 3.05], [17.0, 3.05], [17.5, 0]], { x: 1.62, y: 0.4, cant: 5, t: 0.18 });
  b.fin([[14.0, 0], [15.0, -0.75], [16.0, -0.75], [16.3, 0]], { x: 1.62, y: -0.72, cant: -8, t: 0.12, slot: Slot.body });
  b.canopy(3.5, 8.6, 0.5, 0.64, 0.84);
  const geometry = b.build(L);

  // Outer wing (right), drawn at the 20° reference sweep, pivot at (2.8, 11.6) from the nose.
  const w = new ModelBuilder();
  const P: [number, number] = [2.8, 11.6];
  w.plate([[3.0, 10.35], [9.75, 12.8], [9.75, 14.15], [3.0, 13.9]].map(([x, z]) => [x - P[0], z - P[1]] as [number, number]), { t: 0.22, y: 0.18, mirror: false });
  w.box(9.75 - P[0], 0.18, 13.5 - P[1], 0.16, 0.12, 0.3, Slot.navGreen);
  const swingGeo = w.build(undefined, false);
  return { geometry, swing: { geometry: swingGeo, pivot: [P[0], 0, P[1] - L / 2], refSweepDeg: 20 } };
}

function jf17(): BufferGeometry {
  const b = new ModelBuilder();
  b.loft([
    S(0, 0, 0, 0, 0.14), S(0.6, 0.22, 0.22, 0.22, 0.14), S(1.8, 0.42, 0.42, 0.4, 0.12), S(3.0, 0.52, 0.56, 0.5, 0.12),
    S(4.6, 0.6, 0.74, 0.55, 0.15), S(6.5, 0.72, 0.74, 0.6, 0.15, 2.5), S(9.0, 0.8, 0.66, 0.6, 0.1, 2.5),
    S(12.0, 0.65, 0.56, 0.52, 0.05), S(13.8, 0.48, 0.48, 0.48, 0.05),
  ], { seg: 12 });
  // Side (DSI) intakes.
  b.loft([S(4.5, 0.28, 0.44, 0.46, -0.12, 3), S(6.0, 0.36, 0.5, 0.52, -0.12, 3), S(8.6, 0.3, 0.44, 0.46, -0.12, 3)], { x: 0.84, mirror: true, frontCap: Slot.dark, seg: 8 });
  b.cyl(13.7, 14.93, 0.48, 0.44, { y: 0.05 });
  // LERX + trapezoidal wing, tip rails.
  b.plate([[0.5, 4.2], [0.9, 6.0], [1.45, 7.4], [4.6, 9.95], [4.6, 10.85], [1.45, 11.4], [0.5, 11.5]], { t: 0.2, y: 0.02 });
  b.cyl(9.2, 11.7, 0.09, 0.09, { x: 4.68, y: 0.02 });
  b.plate([[0.7, 11.6], [2.7, 13.3], [2.7, 14.0], [0.7, 14.3]], { t: 0.13, y: -0.06, dihedral: -4 });
  // Tall single fin with a tip pod, ventral fins.
  b.fin([[9.2, 0], [12.3, 2.8], [13.25, 2.8], [13.7, 0]], { x: 0, y: 0.42, t: 0.16 });
  b.cyl(11.9, 13.7, 0.1, 0.1, { y: 3.18, slot: Slot.accent });
  b.fin([[11.0, 0], [11.6, -0.6], [12.6, -0.6], [12.9, 0]], { x: 0.48, y: -0.42, cant: -20, t: 0.1, slot: Slot.body });
  b.canopy(2.9, 6.0, 0.42, 0.56, 0.62);
  navLights(b, 4.62, 10.5);
  return b.build(14.93);
}

function m2000c(): BufferGeometry {
  const b = new ModelBuilder();
  b.loft([
    S(0, 0, 0, 0, 0.1), S(0.9, 0.2, 0.2, 0.2, 0.1), S(2.3, 0.42, 0.42, 0.42, 0.1), S(3.5, 0.55, 0.56, 0.52, 0.12),
    S(5.0, 0.62, 0.74, 0.55, 0.15), S(7.0, 0.7, 0.72, 0.62, 0.12, 2.5), S(9.6, 0.75, 0.64, 0.62, 0.05),
    S(12.0, 0.62, 0.55, 0.55, 0.05), S(13.0, 0.55, 0.52, 0.52, 0.05),
  ], { seg: 12 });
  // Semicircular side intakes with shock cones, small strakes above them.
  b.loft([S(5.4, 0.34, 0.46, 0.46, -0.08, 2), S(7.0, 0.4, 0.5, 0.5, -0.08, 2), S(9.6, 0.3, 0.42, 0.42, -0.08, 2)], { x: 0.92, mirror: true, frontCap: Slot.dark, seg: 8 });
  b.cone(4.9, 5.5, 0.2, { x: 0.94, y: -0.08, slot: Slot.body });
  b.plate([[1.1, 5.7], [1.55, 6.6], [1.2, 7.2]], { t: 0.08, y: 0.32 });
  // Tailless 58° delta.
  b.plate([[0.55, 6.1], [4.56, 12.3], [4.56, 12.85], [0.55, 13.15]], { t: 0.24, y: -0.06 });
  // Tall swept single fin.
  b.fin([[8.2, 0], [11.7, 3.25], [12.55, 3.25], [13.35, 0]], { x: 0, y: 0.42, t: 0.16 });
  b.cyl(12.9, 14.36, 0.52, 0.48, { y: 0.05 });
  b.canopy(3.8, 6.7, 0.44, 0.56, 0.62);
  navLights(b, 4.6, 12.6, -0.06);
  return b.build(14.36);
}

// ------------------------------------------------------------------------------------------ config parts

/*
 * Gameplay-level moving parts: what the player selects (gear, flaps, speedbrake), drawn as simple
 * low-poly plates and struts. Positions are metres from the nose, like the airframe builders.
 */
interface GearLeg { x: number; y: number; z: number; wheelR: number }
interface BrakePlate { x0: number; x1: number; z0: number; z1: number; y: number; up: boolean; mirror: boolean }
interface PartsSpec {
  L: number;
  /** Wheel contact line, model y (m). */
  groundY: number;
  nose: GearLeg;
  main: GearLeg;
  /** Trailing-edge flap (right side): inboard / outboard trailing-edge points, chord, mid-plane y, max deflection. */
  flap: { xi: number; zi: number; xo: number; zo: number; chord: number; y: number; maxDeg: number };
  /** Speedbrake plates hinged at their front edge (z0); `up` plates rise, the others drop. */
  brake: { plates: BrakePlate[]; maxDeg: number };
}

const PART_SPECS: Partial<Record<AircraftId, PartsSpec>> = {
  fa18c: {
    L: 17.07, groundY: -2.35,
    nose: { x: 0, y: -0.45, z: 3.4, wheelR: 0.3 },
    main: { x: 1.55, y: -0.7, z: 9.9, wheelR: 0.4 },
    flap: { xi: 1.95, zi: 12.58, xo: 4.4, zo: 11.95, chord: 0.8, y: 0.06, maxDeg: 40 },
    // Dorsal speedbrake between the fins.
    brake: { plates: [{ x0: -0.45, x1: 0.45, z0: 11.6, z1: 12.9, y: 0.63, up: true, mirror: false }], maxDeg: 60 },
  },
  f15c: {
    L: 19.4, groundY: -2.5,
    nose: { x: 0, y: -0.45, z: 4.2, wheelR: 0.33 },
    main: { x: 1.35, y: -0.65, z: 11.0, wheelR: 0.42 },
    flap: { xi: 1.3, zi: 15.87, xo: 3.9, zo: 15.46, chord: 0.9, y: 0.45, maxDeg: 40 },
    // Big dorsal speedbrake behind the canopy.
    brake: { plates: [{ x0: -0.6, x1: 0.6, z0: 7.6, z1: 10.2, y: 0.9, up: true, mirror: false }], maxDeg: 45 },
  },
  f16c: {
    L: 15.06, groundY: -2.05,
    nose: { x: 0, y: -1.0, z: 5.0, wheelR: 0.28 },
    main: { x: 1.18, y: -0.55, z: 8.4, wheelR: 0.36 },
    // Flaperons.
    flap: { xi: 0.95, zi: 11.6, xo: 3.7, zo: 11.57, chord: 0.7, y: -0.02, maxDeg: 25 },
    // Split petals either side of the nozzle.
    brake: {
      plates: [
        { x0: 0.62, x1: 1.07, z0: 13.3, z1: 14.6, y: 0.12, up: true, mirror: true },
        { x0: 0.62, x1: 1.07, z0: 13.3, z1: 14.6, y: -0.02, up: false, mirror: true },
      ],
      maxDeg: 60,
    },
  },
};

const DEG = Math.PI / 180;

/** Finish a part: raw builder coordinates → geometry around the hinge, pivot in the centred frame. */
function part(b: ModelBuilder, L: number, hinge: [number, number, number], drive: JetPartDrive, axis: [number, number, number], maxRad: number, mirror: boolean): JetPart {
  const geometry = b.build(undefined, false);
  geometry.translate(-hinge[0], -hinge[1], -hinge[2]);
  geometry.computeBoundingSphere();
  const n = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  return { drive, geometry, pivot: [hinge[0], hinge[1], hinge[2] - L / 2], axis: [axis[0] / n, axis[1] / n, axis[2] / n], maxRad, mirror };
}

function gearLeg(g: GearLeg, groundY: number, L: number, retractRad: number, mirror: boolean): JetPart {
  const b = new ModelBuilder();
  const len = Math.max(0.3, g.y - groundY - g.wheelR);
  const strut = new CylinderGeometry(0.07, 0.09, len, 6);
  strut.translate(g.x, g.y - len / 2, g.z);
  b.add(Slot.dark, strut);
  const wheel = new CylinderGeometry(g.wheelR, g.wheelR, g.wheelR * 0.7, 12);
  wheel.rotateZ(Math.PI / 2);
  wheel.translate(g.x, g.y - len, g.z);
  b.add(Slot.dark, wheel);
  return part(b, L, [g.x, g.y, g.z], 'gearLeg', [1, 0, 0], retractRad, mirror);
}

function gearDoor(x: number, y: number, z: number, w: number, len: number, L: number): JetPart {
  const b = new ModelBuilder();
  b.box(x + w / 2, y - 0.03, z, w, 0.04, len, Slot.body);
  // Hinged on its inboard edge (along z); the outboard edge drops to hang open.
  return part(b, L, [x, y, z], 'gearDoor', [0, 0, 1], -80 * DEG, true);
}

function buildParts(s: PartsSpec): JetParts {
  const { L } = s;
  const list: JetPart[] = [];
  // Nose leg retracts forward, main legs aft; a door beside each bay.
  list.push(gearLeg(s.nose, s.groundY, L, 90 * DEG, false));
  list.push(gearLeg(s.main, s.groundY, L, -90 * DEG, true));
  list.push(gearDoor(0.14, s.nose.y, s.nose.z, 0.28, 1.4, L));
  list.push(gearDoor(s.main.x - 0.4, s.main.y, s.main.z, 0.6, 1.8, L));
  // Trailing-edge flap: hinge along its leading edge, the trailing edge drops.
  const f = s.flap;
  const fb = new ModelBuilder();
  fb.plate([[f.xi, f.zi - f.chord], [f.xo, f.zo - f.chord], [f.xo, f.zo], [f.xi, f.zi]], { t: 0.1, y: f.y, mirror: false });
  list.push(part(fb, L, [f.xi, f.y, f.zi - f.chord], 'flaps', [f.xo - f.xi, 0, f.zo - f.zi], f.maxDeg * DEG, true));
  for (const p of s.brake.plates) {
    const b = new ModelBuilder();
    b.plate([[p.x0, p.z0], [p.x1, p.z0], [p.x1, p.z1], [p.x0, p.z1]], { t: 0.08, y: p.y, mirror: false });
    list.push(part(b, L, [p.x0, p.y, p.z0], 'brake', [1, 0, 0], (p.up ? -1 : 1) * s.brake.maxDeg * DEG, p.mirror));
  }
  return { list, groundClearanceM: -s.groundY };
}

const cache = new Map<AircraftId, JetModel>();

/** Shared model for an aircraft type (built on first use). */
export function getJetModel(id: AircraftId): JetModel {
  let m = cache.get(id);
  if (m) return m;
  const dim = JET_DIMENSIONS[id];
  switch (id) {
    case 'su27': case 'su33': case 'j11a':
      m = { id, geometry: flanker(id), lengthM: dim.length, spanM: dim.span }; break;
    case 'mig29s': m = { id, geometry: mig29(), lengthM: dim.length, spanM: dim.span }; break;
    case 'f15c': m = { id, geometry: f15c(), lengthM: dim.length, spanM: dim.span }; break;
    case 'fa18c': m = { id, geometry: fa18c(), lengthM: dim.length, spanM: dim.span }; break;
    case 'f16c': m = { id, geometry: f16c(), lengthM: dim.length, spanM: dim.span }; break;
    case 'f14b': { const t = f14b(); m = { id, geometry: t.geometry, swing: t.swing, lengthM: dim.length, spanM: dim.span }; break; }
    case 'jf17': m = { id, geometry: jf17(), lengthM: dim.length, spanM: dim.span }; break;
    case 'm2000c': m = { id, geometry: m2000c(), lengthM: dim.length, spanM: dim.span }; break;
  }
  const spec = PART_SPECS[id];
  if (spec) m.parts = buildParts(spec);
  cache.set(id, m);
  return m;
}

// ------------------------------------------------------------------------------------------ materials

const matCache = new WeakMap<Palette, Map<string, Material[]>>();

/**
 * Shared jet materials for a palette and side, indexed by Slot:
 * [body, accent (fins), canopy, dark (nozzles/intakes), nav red, nav green].
 */
export function jetMaterials(p: Palette, side: VisualSide): Material[] {
  let byKey = matCache.get(p);
  if (!byKey) { byKey = new Map(); matCache.set(p, byKey); }
  const key = 'jet:' + side;
  const hit = byKey.get(key);
  if (hit) return hit;
  const base = sideColor(p, side);
  const body = new MeshStandardMaterial({
    color: base.clone().lerp(p.missile, side === 'neutral' ? 0.15 : 0.3), roughness: 0.62, metalness: 0.08, flatShading: true, side: DoubleSide,
  });
  const accent = new MeshStandardMaterial({ color: base.clone(), roughness: 0.55, metalness: 0.05, flatShading: true, side: DoubleSide });
  const canopy = new MeshStandardMaterial({
    color: p.canopy.clone().lerp(p.skyHorizon, 0.18), roughness: 0.22, metalness: 0.35, flatShading: true, side: DoubleSide,
    emissive: p.skyTop.clone().lerp(p.skyHorizon, 0.3).multiplyScalar(0.28),
  });
  const dark = new MeshStandardMaterial({ color: p.dark.clone(), roughness: 0.8, metalness: 0.2, flatShading: true, side: DoubleSide });
  const red = new MeshBasicMaterial({ color: p.warning.clone(), toneMapped: false });
  const green = new MeshBasicMaterial({ color: p.ok.clone(), toneMapped: false });
  const list: Material[] = [body, accent, canopy, dark, red, green];
  if (list.length !== SLOT_COUNT) throw new Error('slot mismatch');
  byKey.set(key, list);
  return list;
}

/** A jet instance: shared geometry + shared materials; the F-14 gets movable outer wings. */
export class JetMesh extends Group {
  readonly aircraft: AircraftId;
  readonly model: JetModel;
  readonly body: Mesh;
  private wings: [Mesh, Mesh] | null = null;
  private sweep = 20;
  private partMeshes: { part: JetPart; mesh: Mesh; left: boolean }[] = [];
  private cfg: JetConfig = { gear: 0, flaps: 0, speedbrake: 0 };

  constructor(id: AircraftId, side: VisualSide, palette: Palette) {
    super();
    this.aircraft = id;
    this.model = getJetModel(id);
    const mats = jetMaterials(palette, side);
    this.body = new Mesh(this.model.geometry, mats);
    this.add(this.body);
    const sw = this.model.swing;
    if (sw) {
      const r = new Mesh(sw.geometry, mats);
      const l = new Mesh(sw.geometry, mats);
      r.position.set(sw.pivot[0], sw.pivot[1], sw.pivot[2]);
      l.position.set(-sw.pivot[0], sw.pivot[1], sw.pivot[2]);
      l.scale.x = -1;
      this.add(r, l);
      this.wings = [r, l];
      this.setSweep(20);
    }
    for (const p of this.model.parts?.list ?? []) {
      for (const left of p.mirror ? [false, true] : [false]) {
        const mesh = new Mesh(p.geometry, mats);
        mesh.name = 'part:' + p.drive;
        mesh.position.set(left ? -p.pivot[0] : p.pivot[0], p.pivot[1], p.pivot[2]);
        if (left) mesh.scale.x = -1;
        this.add(mesh);
        this.partMeshes.push({ part: p, mesh, left });
      }
    }
    this.name = 'jet:' + id;
    this.applyConfig();
  }

  get lengthM(): number { return this.model.lengthM; }
  get hasSwingWing(): boolean { return this.wings !== null; }
  get sweepDeg(): number { return this.sweep; }

  /** F-14 wing sweep in degrees (20 = spread, 68 = fully swept). No-op for fixed wings. */
  setSweep(deg: number): void {
    if (!this.wings || !this.model.swing) return;
    this.sweep = Math.max(20, Math.min(75, deg));
    const a = ((this.sweep - this.model.swing.refSweepDeg) * Math.PI) / 180;
    this.wings[0].rotation.y = -a;
    this.wings[1].rotation.y = a;
  }

  /** Which configurable parts this model has (setConfig is a no-op for the others). */
  get configParts(): { gear: boolean; flaps: boolean; speedbrake: boolean } {
    const has = (d: JetPartDrive) => this.partMeshes.some(p => p.part.drive === d);
    return { gear: has('gearLeg'), flaps: has('flaps'), speedbrake: has('brake') };
  }

  /** Current configuration (0..1 each). Default: gear up, flaps up, speedbrake in. */
  get config(): Readonly<JetConfig> { return this.cfg; }

  /** Wheel contact line below the model origin with the gear down (m); 0 without gear parts. */
  get groundClearanceM(): number { return this.model.parts?.groundClearanceM ?? 0; }

  /**
   * Gear, flap and speedbrake positions, 0..1 each (clamped; missing or non-finite values keep the
   * previous one). Parts at 0 are hidden, so a clean jet is exactly the BVR model. No-op without parts.
   */
  setConfig(c: Partial<JetConfig>): void {
    const clamp = (v: number | undefined, old: number) => (v === undefined || !Number.isFinite(v) ? old : Math.max(0, Math.min(1, v)));
    this.cfg = { gear: clamp(c.gear, this.cfg.gear), flaps: clamp(c.flaps, this.cfg.flaps), speedbrake: clamp(c.speedbrake, this.cfg.speedbrake) };
    this.applyConfig();
  }

  private applyConfig(): void {
    const { gear, flaps, speedbrake } = this.cfg;
    for (const { part: p, mesh, left } of this.partMeshes) {
      let k: number, visible: boolean;
      switch (p.drive) {
        case 'gearLeg': k = 1 - gear; visible = gear > 0.001; break;
        case 'gearDoor': k = Math.min(1, gear * 3); visible = gear > 0.001; break;
        case 'flaps': k = flaps; visible = flaps > 0.001; break;
        case 'brake': k = speedbrake; visible = speedbrake > 0.001; break;
      }
      mesh.visible = visible;
      // Left copies are mirrored in x: mirror the hinge axis and reverse the angle.
      _axis.set(left ? -p.axis[0] : p.axis[0], p.axis[1], p.axis[2]);
      mesh.quaternion.setFromAxisAngle(_axis, (left ? -1 : 1) * k * p.maxRad);
    }
  }

  /** Swap to another side's shared materials. */
  setSide(side: VisualSide, palette: Palette): void {
    const mats = jetMaterials(palette, side);
    this.traverse(o => { if ((o as Mesh).isMesh) (o as Mesh).material = mats; });
  }

  /** Apply one material to every part (shadows, ghosts). */
  setMaterial(m: Material): void {
    this.traverse(o => { if ((o as Mesh).isMesh) (o as Mesh).material = m; });
  }
}

const _axis = new Vector3();

/** F-14 wing sweep schedule (simplified CADC): 20° below M0.4 to 68° at M0.9 and above. */
export function f14SweepForMach(mach: number): number {
  return Math.max(20, Math.min(68, 20 + ((mach - 0.4) / 0.5) * 48));
}

// ------------------------------------------------------------------------------------------ missiles

type MissileFamily = 'amraam' | 'sparrow' | 'r27' | 'r77' | 'phoenix' | 'ir' | 'r73' | 's530';

const FAMILY: Record<MissileId, MissileFamily> = {
  r27r: 'r27', r27er: 'r27', r27t: 'r27', r27et: 'r27', r77: 'r77', r73: 'r73',
  aim120b: 'amraam', aim120c: 'amraam', aim7m: 'sparrow', aim9m: 'ir', aim9x: 'ir',
  aim54a: 'phoenix', aim54c: 'phoenix', sd10: 'amraam', pl5e: 'ir', s530d: 's530', magic2: 'ir',
};

const missileCache = new Map<MissileId, BufferGeometry>();

/** Cruciform (X) fin set: planform [z aft, span out] from the body surface at radius r. */
function finSet(b: ModelBuilder, pts: [number, number][], r: number, t: number, slot: SlotId = Slot.body): void {
  for (let i = 0; i < 4; i++) {
    const ang = Math.PI / 4 + (i * Math.PI) / 2;
    // fin() takes [z, h] with h upward; roll it around the body axis afterwards.
    const g = new ModelBuilder();
    g.fin(pts.map(([z, s]) => [z, s] as [number, number]), { x: 0, y: r * 0.9, t, slot: Slot.body, mirror: false });
    const geo = g.build(undefined, false);
    geo.rotateZ(ang - Math.PI / 2);
    b.add(slot, geo);
  }
}

/** Missile geometry in metres (nose → −z), sized from MISSILES[id] (length/diameter). */
export function getMissileGeometry(id: MissileId): BufferGeometry {
  const hit = missileCache.get(id);
  if (hit) return hit;
  const spec = MISSILES[id];
  const L = spec.lengthM, r = spec.diameterM / 2;
  const fam = FAMILY[id];
  const b = new ModelBuilder();
  const noseLen = fam === 'phoenix' ? L * 0.14 : fam === 'ir' || fam === 'r73' ? L * 0.05 : L * 0.11;
  const nose = fam === 'ir' || fam === 'r73' ? 0.85 : 0.2;
  b.loft([S(0, r * (fam === 'ir' || fam === 'r73' ? 0.7 : 0.05), r * (fam === 'ir' || fam === 'r73' ? 0.7 : 0.05)), S(noseLen * 0.5, r * (0.6 + nose * 0.3), r * (0.6 + nose * 0.3)), S(noseLen, r, r), S(L, r * 0.96, r * 0.96)], { seg: 8, rearCap: Slot.dark, frontCap: fam === 'ir' || fam === 'r73' ? Slot.dark : Slot.body });
  const t = Math.max(0.012, r * 0.12);
  const span = (k: number) => r * k;
  switch (fam) {
    case 'amraam':
      finSet(b, [[L * 0.36, 0], [L * 0.46, span(1.6)], [L * 0.52, span(1.6)], [L * 0.54, 0]], r, t);
      finSet(b, [[L * 0.86, 0], [L * 0.93, span(1.9)], [L * 0.99, span(1.9)], [L * 0.99, 0]], r, t);
      break;
    case 'sparrow':
      finSet(b, [[L * 0.3, 0], [L * 0.44, span(2.8)], [L * 0.48, span(2.8)], [L * 0.49, 0]], r, t);
      finSet(b, [[L * 0.86, 0], [L * 0.95, span(2.3)], [L * 0.99, span(2.3)], [L * 0.99, 0]], r, t);
      break;
    case 's530':
      finSet(b, [[L * 0.3, 0], [L * 0.7, span(1.3)], [L * 0.8, span(1.3)], [L * 0.82, 0]], r, t);
      finSet(b, [[L * 0.88, 0], [L * 0.94, span(2.2)], [L * 0.99, span(2.2)], [L * 0.99, 0]], r, t);
      break;
    case 'r27':
      finSet(b, [[L * 0.17, 0], [L * 0.21, span(1.3)], [L * 0.24, span(1.3)], [L * 0.24, 0]], r, t);
      finSet(b, [[L * 0.3, 0], [L * 0.33, span(3.4)], [L * 0.43, span(3.2)], [L * 0.4, 0]], r, t);
      finSet(b, [[L * 0.88, 0], [L * 0.93, span(1.9)], [L * 0.99, span(1.9)], [L * 0.99, 0]], r, t);
      break;
    case 'r77':
      finSet(b, [[L * 0.3, 0], [L * 0.5, span(1.0)], [L * 0.62, span(1.0)], [L * 0.64, 0]], r, t);
      finSet(b, [[L * 0.9, 0], [L * 0.9, span(2.2)], [L * 0.97, span(2.2)], [L * 0.97, 0]], r, t * 1.5);
      break;
    case 'phoenix':
      finSet(b, [[L * 0.5, 0], [L * 0.72, span(1.3)], [L * 0.8, span(1.3)], [L * 0.8, 0]], r, t);
      finSet(b, [[L * 0.86, 0], [L * 0.9, span(1.6)], [L * 0.99, span(1.6)], [L * 0.99, 0]], r, t);
      break;
    case 'r73':
    case 'ir':
      finSet(b, [[L * 0.08, 0], [L * 0.12, span(1.6)], [L * 0.15, span(1.6)], [L * 0.16, 0]], r, t);
      finSet(b, [[L * 0.84, 0], [L * 0.9, span(2.6)], [L * 0.98, span(2.6)], [L * 0.98, 0]], r, t);
      break;
  }
  const g = b.build(L);
  missileCache.set(id, g);
  return g;
}

/** Shared missile materials: [body (missile token), dark (seeker window / nozzle)]. Indexed by Slot. */
export function missileMaterials(p: Palette): Material[] {
  let byKey = matCache.get(p);
  if (!byKey) { byKey = new Map(); matCache.set(p, byKey); }
  const hit = byKey.get('missile');
  if (hit) return hit;
  const body = new MeshStandardMaterial({ color: p.missile.clone(), roughness: 0.5, metalness: 0.1, flatShading: true, side: DoubleSide });
  const dark = new MeshStandardMaterial({ color: p.dark.clone(), roughness: 0.6, metalness: 0.2, flatShading: true, side: DoubleSide });
  const list: Material[] = [body, body, body, dark, body, body];
  byKey.set('missile', list);
  return list;
}

export function createMissileMesh(id: MissileId, palette: Palette): Mesh {
  const m = new Mesh(getMissileGeometry(id), missileMaterials(palette));
  m.name = 'missile:' + id;
  return m;
}

/** Smoke density of a missile motor (0..1). The AIM-54C has a reduced-smoke motor (research: tomcat notes). */
export function smokeDensity(id: MissileId): number {
  return id === 'aim54c' ? 0.22 : 1;
}

/** Colour helper for a flat single-colour copy of a model (ghosts). */
export function solidMaterial(c: Color, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false, side: DoubleSide });
}
