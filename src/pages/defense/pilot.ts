/**
 * [OWNER: page-defense] The player's tactical autopilot (pure logic, no DOM). The page flies the jet by
 * writing ac.cmd; World moves it. A maneuver is flown continuously against a reference point (the
 * threat the RWR ranks first: the shooter, or the missile once its seeker is active), so "notch" keeps
 * the threat on the 3/9 line while the geometry changes. A/D trim the heading on top of it.
 */
import type { Aircraft } from '../../sim/types';
import type { Vector3 } from 'three';
import { AIRCRAFT } from '../../data/aircraft';
import { D2R, bearingTo, clamp, relBearing, wrap2Pi, wrapPi } from '../../sim/math';
import { speedFromMach } from '../../sim/atmosphere';
import { cruiseFor } from '../../sim/scenarios';

export type Maneuver = 'hold' | 'notch-l' | 'notch-r' | 'drag' | 'crank' | 'hot';
export type Throttle = 'idle' | 'cruise' | 'mil' | 'ab';
export const THROTTLES: Throttle[] = ['idle', 'cruise', 'mil', 'ab'];

export interface Pilot {
  man: Maneuver;
  /** Heading held in 'hold' (rad). */
  hold: number;
  /** Heading trim on top of an automatic maneuver (rad). */
  trim: number;
  /** Altitude target (m). */
  alt: number;
  thr: Throttle;
  /** Crank: +1 keeps the threat on the right, -1 on the left. */
  crankSide: 1 | -1;
  /** Last true bearing to the reference (rad), used when the reference disappears. */
  lastBrg: number | null;
}

/** Crank angle: threat 50° off the nose (inside every radar gimbal, as DCS pilots fly it). */
export const CRANK_DEG = 50;
/** How far a notch or drag descends by default (m). */
export const NOTCH_DESCENT_M = 3000;
export const DRAG_DESCENT_M = 2500;
/** Lowest altitude the autopilot will descend to on its own (m). */
export const NOTCH_FLOOR_M = 700;
export const DRAG_FLOOR_M = 1500;
/** Altitude-hold window: descends at roughly 60 m/s (about 13° nose-low), climbs a bit slower. */
const DESCENT_STEP_M = 500;
const CLIMB_STEP_M = 400;

export function newPilot(ac: Aircraft): Pilot {
  return { man: 'hold', hold: ac.heading, trim: 0, alt: ac.pos.y, thr: 'cruise', crankSide: 1, lastBrg: null };
}

export const MANEUVER_LABEL: Record<Maneuver, string> = {
  hold: 'Hold heading', 'notch-l': 'Notch left', 'notch-r': 'Notch right', drag: 'Drag cold', crank: 'Crank', hot: 'Hot',
};

/** Select a maneuver: sets the altitude target and the throttle the way a DCS pilot flies it. */
export function pressManeuver(p: Pilot, man: Maneuver, me: Aircraft, ref: Vector3 | null): void {
  const was = p.man;
  p.man = man;
  p.trim = 0;
  const alt = me.pos.y;
  const notching = (m: Maneuver) => m === 'notch-l' || m === 'notch-r';
  switch (man) {
    case 'notch-l': case 'notch-r':
      // Going to the other beam keeps the descent already chosen.
      if (!notching(was)) p.alt = Math.min(p.alt, Math.max(NOTCH_FLOOR_M, alt - NOTCH_DESCENT_M));
      p.thr = 'mil';
      break;
    case 'drag':
      if (was !== 'drag') p.alt = Math.min(p.alt, Math.max(DRAG_FLOOR_M, alt - DRAG_DESCENT_M));
      p.thr = 'ab';
      break;
    case 'crank':
      p.crankSide = ref && relBearing(me.pos, me.heading, ref) < 0 ? -1 : 1;
      p.thr = 'mil';
      break;
    case 'hot':
      p.thr = 'mil';
      break;
    case 'hold':
      p.hold = me.heading;
      break;
  }
}

/** Heading the maneuver wants now (rad, 0..2π). */
export function pilotHeading(p: Pilot, me: Aircraft, ref: Vector3 | null): number {
  if (p.man === 'hold') return wrap2Pi(p.hold);
  const brg = ref ? bearingTo(me.pos, ref) : p.lastBrg;
  if (ref) p.lastBrg = brg;
  if (brg === null) return wrap2Pi(me.heading + p.trim);
  let h: number;
  switch (p.man) {
    case 'notch-l': h = brg - Math.PI / 2; break;   // turn left: threat ends at 3 o'clock
    case 'notch-r': h = brg + Math.PI / 2; break;   // turn right: threat ends at 9 o'clock
    case 'drag': h = brg + Math.PI; break;          // threat at 6 o'clock
    case 'crank': h = brg - p.crankSide * CRANK_DEG * D2R; break;
    case 'hot': h = brg; break;
  }
  return wrap2Pi(h + p.trim);
}

/** Throttle detent to a speed command (m/s) and afterburner. */
export function throttleCommand(thr: Throttle, me: Aircraft): { speed: number; ab: boolean } {
  const perf = AIRCRAFT[me.type].perf;
  switch (thr) {
    case 'idle': return { speed: 150, ab: false };
    case 'cruise': return { speed: cruiseFor(me.type).speed, ab: false };
    case 'mil': return { speed: speedFromMach(0.95, me.pos.y), ab: false };
    case 'ab': return { speed: speedFromMach(perf.maxMach, me.pos.y), ab: true };
  }
}

/** Write the jet's command for this frame. */
export function applyPilot(p: Pilot, me: Aircraft, ref: Vector3 | null): void {
  me.cmd.heading = pilotHeading(p, me, ref);
  me.cmd.altitude = clamp(p.alt, me.pos.y - DESCENT_STEP_M, me.pos.y + CLIMB_STEP_M);
  const t = throttleCommand(p.thr, me);
  me.cmd.speed = t.speed;
  me.cmd.afterburner = t.ab;
  me.cmd.maxG = Math.min(AIRCRAFT[me.type].perf.maxG, 7.5);
}

/** Heading trim (A/D): in 'hold' it turns the held heading, otherwise it offsets the maneuver. */
export function trimHeading(p: Pilot, deltaRad: number): void {
  if (p.man === 'hold') p.hold = wrap2Pi(p.hold + deltaRad);
  else p.trim = clamp(wrapPi(p.trim + deltaRad), -60 * D2R, 60 * D2R);
}

export function trimAltitude(p: Pilot, deltaM: number, ceilingM: number): void {
  p.alt = clamp(p.alt + deltaM, 300, ceilingM);
}

export function stepThrottle(p: Pilot, dir: 1 | -1): void {
  const i = THROTTLES.indexOf(p.thr);
  p.thr = THROTTLES[clamp(i + dir, 0, THROTTLES.length - 1)];
}
