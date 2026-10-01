/**
 * Situation: one DCS frame turned into the pilot's units and simple flags the copilot rules read.
 * Knots, feet, pounds, degrees. Undefined = DCS did not export it (multiplayer block or module gap).
 */
import type { DcsFrame } from '../dcs/protocol';
import { M_PER_FT, MPS_PER_KT } from '../sim/math';
import { decodeHornet, type HornetCockpit } from './hornetCockpit';

export const LB_PER_KG = 2.20462;
const R2D = 180 / Math.PI;

/** Where the flight is, as the copilot sees it. */
export type Phase = 'ground' | 'airborne' | 'approach';

export interface Situation {
  /** DCS unit type, e.g. "FA-18C_hornet". */
  type?: string;
  iasKt?: number;
  mach?: number;
  aglFt?: number;
  vviFpm?: number;
  aoaDeg?: number;
  g?: number;
  /** 0..1 positions from LoGetMechInfo. */
  gear?: number;
  flaps?: number;
  hook?: number;
  speedbrake?: number;
  /** Internal + external, lb. */
  fuelLb?: number;
  /** Both engines, lb per hour. */
  fuelFlowLbH?: number;
  masterWarning: boolean;
  /** Decoded module cockpit (switches, lamps, IFEI), when the export script sends it. */
  cockpit?: HornetCockpit;
  phase: Phase;
}

const sum = (a?: number, b?: number) => (a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0));

/** Gear is "down" above this position value, "up" below GEAR_UP. Positions move 0..1 while cycling. */
export const GEAR_DOWN = 0.95;
export const GEAR_UP = 0.05;

/**
 * The ED reference Export.lua gives LoGetAngleOfAttack in radians; that is not verified in game, so the page
 * lets the pilot compare with the HUD and switch to degrees.
 */
export type AoaUnit = 'rad' | 'deg';

export function situationOf(f: DcsFrame | null, aoaUnit: AoaUnit = 'rad'): Situation {
  if (!f) return { masterWarning: false, phase: 'ground' };
  const fuelKg = sum(f.engine?.fuelInt, f.engine?.fuelExt);
  const ffKgS = sum(f.engine?.ffL, f.engine?.ffR);
  const s: Situation = {
    type: f.self?.name,
    iasKt: f.ias === undefined ? undefined : f.ias / MPS_PER_KT,
    mach: f.mach,
    aglFt: f.altAgl === undefined ? undefined : f.altAgl / M_PER_FT,
    vviFpm: f.vv === undefined ? undefined : (f.vv / M_PER_FT) * 60,
    aoaDeg: f.aoa === undefined ? undefined : aoaUnit === 'rad' ? f.aoa * R2D : f.aoa,
    g: f.acc?.y,
    gear: f.mech?.gear, flaps: f.mech?.flaps, hook: f.mech?.hook, speedbrake: f.mech?.speedbrakes,
    fuelLb: fuelKg === undefined ? undefined : fuelKg * LB_PER_KG,
    fuelFlowLbH: ffKgS === undefined ? undefined : ffKgS * LB_PER_KG * 3600,
    masterWarning: f.mcp?.includes('MasterWarning') ?? false,
    cockpit: f.self?.name === 'FA-18C_hornet' ? decodeHornet(f) ?? undefined : undefined,
    phase: 'ground',
  };
  if (!s.cockpit) delete s.cockpit;
  s.phase = phaseOf(s);
  return s;
}

/**
 * Ground: below 10 ft AGL and slower than 80 kt (taxi, takeoff roll start, after landing).
 * Approach: airborne, gear down, below 5000 ft AGL. Airborne: anything else.
 * A simple rule, good enough to choose which checks apply; it is not DCS's weight-on-wheels.
 */
export function phaseOf(s: Pick<Situation, 'aglFt' | 'iasKt' | 'gear'>): Phase {
  if ((s.aglFt ?? 0) < 10 && (s.iasKt ?? 0) < 80) return 'ground';
  if ((s.gear ?? 0) >= GEAR_DOWN && (s.aglFt ?? Infinity) < 5000) return 'approach';
  return 'airborne';
}

/** Minutes of fuel at the current flow; undefined when there is no flow. */
export function enduranceMin(s: Situation, reserveLb = 0): number | undefined {
  if (s.fuelLb === undefined || !s.fuelFlowLbH || s.fuelFlowLbH < 1) return undefined;
  return (Math.max(0, s.fuelLb - reserveLb) / s.fuelFlowLbH) * 60;
}
