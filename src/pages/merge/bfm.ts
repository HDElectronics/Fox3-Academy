/**
 * [OWNER: page-merge] Pure BFM helpers for the Merge & guns page: pursuit classification (lead / pure / lag),
 * corner-speed test, the keyboard "stick" that turns held keys into a sim BFM command, a steering law used by the
 * scripted bandit and the screenshot pre-rolls, and the simplified radar auto-lock for the gun sight.
 * Game-tutorial scope: geometry and pilot inputs only, no flight-model or weapon engineering.
 */
import { Vector3 } from 'three';
import type { Aircraft, BfmCommand, BfmThrottle } from '../../sim/types';
import { availableG } from '../../sim/flight';
import { sigma } from '../../sim/atmosphere';
import { D2R, G0, MPS_PER_KT, R2D, clamp, wrapPi } from '../../sim/math';

export type Pursuit = 'lead' | 'pure' | 'lag';

/** Nose within this angle of the bandit counts as pure pursuit (trainer choice). */
export const PURE_DEG = 5;
/** Speed band around corner speed that counts as "at corner" (kt, trainer choice). */
export const CORNER_BAND_KT = 25;
/** A turn this hard (g) counts as turning for the corner drill. */
export const TURNING_G = 3;

export interface PursuitRead {
  kind: Pursuit;
  /** Angle between your velocity and the line of sight (deg). */
  offDeg: number;
  /** Signed: + ahead of the bandit (lead), − behind it (lag), deg. */
  leadDeg: number;
}

const _los = new Vector3(), _v = new Vector3(), _lat = new Vector3(), _off = new Vector3();

/**
 * Pursuit class from geometry: where your velocity vector points against the line of sight, measured toward the
 * bandit's motion across the line of sight. Pure inside PURE_DEG, lead ahead of him, lag behind.
 */
export function classifyPursuit(mePos: Vector3, meVel: Vector3, bPos: Vector3, bVel: Vector3, pureDeg = PURE_DEG): PursuitRead {
  const los = _los.subVectors(bPos, mePos).normalize();
  const v = _v.copy(meVel).normalize();
  const offDeg = Math.acos(clamp(v.dot(los), -1, 1)) * R2D;
  const off = _off.copy(v).addScaledVector(los, -v.dot(los));
  const lat = _lat.copy(bVel).addScaledVector(los, -bVel.dot(los));
  const latLen = lat.length();
  const across = latLen > 0.05 * Math.max(1, bVel.length()) ? off.dot(lat) / latLen : 0;
  const sign = across >= 0 ? 1 : -1;
  const kind: Pursuit = offDeg <= pureDeg ? 'pure' : across > 0 ? 'lead' : 'lag';
  return { kind, offDeg, leadDeg: sign * offDeg };
}

/** Equivalent airspeed (m/s), the speed the corner-speed number and the lift limit use. */
export function eas(ac: Aircraft): number {
  return ac.vel.length() * Math.sqrt(sigma(Math.max(0, ac.pos.y)));
}

/** Within CORNER_BAND_KT of corner speed while turning at least TURNING_G. */
export function atCorner(easMps: number, cornerKts: number, g: number): boolean {
  return g >= TURNING_G && Math.abs(easMps / MPS_PER_KT - cornerKts) <= CORNER_BAND_KT;
}

/** Load factor that holds a level turn at this bank (hands-off aid), capped at what is available. */
export function levelG(bank: number, pitch: number, avail: number): number {
  const c = Math.cos(bank);
  if (Math.abs(bank) > 80 * D2R) return Math.min(avail, 1);
  return clamp(Math.cos(pitch) / Math.max(0.17, c), 0, avail);
}

// ---- keyboard / touch stick --------------------------------------------------------------------------------

export interface Stick {
  /** −1 roll left, +1 roll right. */
  roll: -1 | 0 | 1;
  /** +1 pull, −1 unload. */
  pitch: -1 | 0 | 1;
  throttle: BfmThrottle;
  speedbrake: boolean;
  trigger: boolean;
  /** Commanded lift-vector bank (rad) and load factor. */
  bank: number;
  g: number;
  rolling: boolean;
}

/** Lift-vector roll rate the keys command (the sim rolls up to 150°/s). */
export const ROLL_CMD_RATE = 140 * D2R;
/** g onset while pulling or unloading (g per second). */
export const G_RATE = 6;

export function newStick(throttle: BfmThrottle = 'mil'): Stick {
  return { roll: 0, pitch: 0, throttle, speedbrake: false, trigger: false, bank: 0, g: 1, rolling: false };
}

/**
 * Advance the stick one step and return the BFM command. Held roll keys roll the lift vector; hands off the roll
 * keys the jet keeps its bank. Pull ramps to the available g, unload toward 0 g, hands off relaxes toward a level
 * turn at the current bank (a trainer aid, not a DCS behaviour).
 */
export function stepStick(s: Stick, ac: Aircraft, dt: number): BfmCommand {
  if (s.roll !== 0) {
    if (!s.rolling) s.bank = ac.roll;
    s.bank = wrapPi(s.bank + s.roll * ROLL_CMD_RATE * dt);
    s.rolling = true;
  } else {
    s.bank = ac.roll;
    s.rolling = false;
  }
  const avail = availableG(ac);
  const want = s.pitch > 0 ? avail : s.pitch < 0 ? 0 : levelG(ac.roll, ac.pitch, avail);
  const step = G_RATE * dt;
  s.g = clamp(s.g + clamp(want - s.g, -step, step), 0, Math.max(avail, 1));
  return { bank: s.bank, g: s.g, throttle: s.throttle, speedbrake: s.speedbrake };
}

// ---- steering law (scripted bandit, pre-rolls) ---------------------------------------------------------------

const _u = new Vector3(), _e = new Vector3(), _l0 = new Vector3(), _r0 = new Vector3();

/**
 * Roll the lift vector onto `dir` (unit, world) and pull to bring the nose there: turn rate = gain × angle.
 * Unloads while the bank is far off (roll first, then pull). `maxG` caps the pull.
 */
export function steerTo(ac: Aircraft, dir: Vector3, throttle: BfmThrottle, gain = 1.2, maxG = Infinity): BfmCommand {
  const v = Math.max(1, ac.vel.length());
  const u = _u.copy(ac.vel).divideScalar(v);
  const e = _e.copy(dir).addScaledVector(u, -u.dot(dir));
  const angle = Math.acos(clamp(u.dot(dir), -1, 1));
  const avail = Math.min(availableG(ac), maxG);
  const h = 1 - u.y * u.y;
  if (e.length() < 1e-4 || h < 0.002) return { bank: ac.roll, g: Math.min(avail, 1), throttle };
  const k = 1 / Math.sqrt(h);
  _l0.set(-u.y * u.x * k, h * k, -u.y * u.z * k);
  _r0.crossVectors(u, _l0);
  const bank = Math.atan2(e.dot(_r0), e.dot(_l0));
  const liftUp = Math.cos(bank) * Math.sqrt(h);        // lift vector's share against gravity
  let g = gain * angle * v / G0 + Math.max(0, liftUp);
  if (Math.abs(wrapPi(bank - ac.roll)) > 60 * D2R) g = Math.min(g, 1);
  return { bank, g: clamp(g, 0, avail), throttle };
}

/** Direction to fly for a pursuit kind against `bandit`: lead ahead of him, pure at him, lag behind him. */
export function pursuitAim(me: Aircraft, bandit: Aircraft, kind: Pursuit, out = new Vector3()): Vector3 {
  const range = me.pos.distanceTo(bandit.pos);
  const lookS = kind === 'lead' ? Math.max(1.2, range / 500) : kind === 'lag' ? -Math.max(1.2, range / 500) : 0;
  return out.copy(bandit.pos).addScaledVector(bandit.vel, lookS).sub(me.pos).normalize();
}

// ---- radar auto-lock for the gun sight (simplified) -----------------------------------------------------------

/** Lock inside this range and off-boresight (trainer simplification of the close-combat lock modes). */
export const LOCK_RANGE_M = 9260;
export const LOCK_OFF_DEG = 20;

/** Close-combat auto-lock: acquire inside 5 nm and 20° of the nose, hold while inside 10 nm and 60°. */
export function autoLock(me: Aircraft, bandit: Aircraft | null, prev: boolean): boolean {
  if (!bandit || !bandit.alive || !me.alive) return false;
  const rel = _e.subVectors(bandit.pos, me.pos);
  const range = rel.length();
  const off = Math.acos(clamp(rel.dot(_u.copy(me.vel).normalize()) / Math.max(1, range), -1, 1)) * R2D;
  return prev ? range < 2 * LOCK_RANGE_M && off < 60 : range < LOCK_RANGE_M && off < LOCK_OFF_DEG;
}
