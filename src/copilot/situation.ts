/**
 * Situation: one DCS frame turned into the pilot's units and simple flags the copilot rules read.
 * Knots, feet, pounds, degrees. Undefined = DCS did not export it (multiplayer block or module gap).
 */
import type { DcsFrame } from '../dcs/protocol';
import { M_PER_FT, MPS_PER_KT } from '../sim/math';
import { decodeHornet, type HornetCockpit } from './hornetCockpit';

export const LB_PER_KG = 2.20462;

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
  /** Total burn, lb per hour, measured from the fuel trend (FuelTrend). */
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
 * Units as observed in game (F/A-18C, 2026-10-01; docs/research/dcs-export.md, "Observed in game"):
 * LoGetAngleOfAttack is in degrees, although ED's reference Export.lua says radians. LoGetEngineInfo fuel is a
 * 0..1 fraction for the Hornet, not kg, so the Hornet's fuel comes from the IFEI total.
 */
export function situationOf(f: DcsFrame | null): Situation {
  if (!f) return { masterWarning: false, phase: 'ground' };
  const cockpit = f.self?.name === 'FA-18C_hornet' ? decodeHornet(f) ?? undefined : undefined;
  const fuelKg = sum(f.engine?.fuelInt, f.engine?.fuelExt);
  // A fraction (<= 1) is not a quantity: unknown without the tank capacity.
  const exportFuelLb = fuelKg !== undefined && fuelKg > 1 ? fuelKg * LB_PER_KG : undefined;
  const s: Situation = {
    type: f.self?.name,
    iasKt: f.ias === undefined ? undefined : f.ias / MPS_PER_KT,
    mach: f.mach,
    aglFt: f.altAgl === undefined ? undefined : f.altAgl / M_PER_FT,
    vviFpm: f.vv === undefined ? undefined : (f.vv / M_PER_FT) * 60,
    aoaDeg: f.aoa,
    g: f.acc?.y,
    gear: f.mech?.gear, flaps: f.mech?.flaps, hook: f.mech?.hook, speedbrake: f.mech?.speedbrakes,
    fuelLb: cockpit ? cockpit.ifei.fuelUpLb : exportFuelLb,
    masterWarning: f.mcp?.includes('MasterWarning') ?? false,
    cockpit,
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

/**
 * Burn rate from how fast the fuel total falls, over the last WINDOW_S seconds. The export's own fuel-flow
 * numbers are not verified for full-fidelity modules; the trend of the IFEI total is what the pilot sees.
 * Rising fuel (tanker) or a gap in data resets the window.
 */
export class FuelTrend {
  static readonly WINDOW_S = 60;
  static readonly MIN_S = 15;
  private samples: { t: number; lb: number }[] = [];

  /** Add a sample at time t (s) and return lb/h, or undefined until enough data. */
  update(t: number, fuelLb: number | undefined): number | undefined {
    if (fuelLb === undefined) return undefined;
    const last = this.samples.at(-1);
    if (last && (fuelLb > last.lb + 20 || t - last.t > 5 || t < last.t)) this.samples = [];
    this.samples.push({ t, lb: fuelLb });
    while (this.samples.length > 2 && t - this.samples[0]!.t > FuelTrend.WINDOW_S) this.samples.shift();
    const first = this.samples[0]!;
    const dt = t - first.t;
    if (dt < FuelTrend.MIN_S) return undefined;
    return Math.max(0, ((first.lb - fuelLb) / dt) * 3600);
  }

  reset(): void { this.samples = []; }
}

/** Minutes of fuel at the current flow; undefined when there is no flow. */
export function enduranceMin(s: Situation, reserveLb = 0): number | undefined {
  if (s.fuelLb === undefined || !s.fuelFlowLbH || s.fuelFlowLbH < 1) return undefined;
  return (Math.max(0, s.fuelLb - reserveLb) / s.fuelFlowLbH) * 60;
}
