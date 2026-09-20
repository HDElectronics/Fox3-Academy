/**
 * Shared helpers for the offline tuning tests: ED's reference launch geometry
 * (shooter and target both at 900 km/h = 250 m/s TAS, same altitude).
 */
import type { MissileId } from '../../src/data/types';
import { findRange } from '../../src/sim/dlz';
import { mach } from '../../src/sim/atmosphere';
import { REF_HIGH_ALT, REF_LOW_ALT, REF_MID_ALT, REF_SPEED } from '../../src/sim/missileModel';

export function refBase(missile: MissileId, alt: number, aspectDeg: number) {
  const m = mach(REF_SPEED, alt);
  return { missile, shooterAlt: alt, shooterMach: m, targetAlt: alt, targetMach: m, aspectDeg };
}

/**
 * Achieved Rmax (km) in the reference shots: a 10 km head-on, b 10 km fleeing target, c 1 km head-on,
 * m 5 km head-on.
 */
export function measureReference(missile: MissileId, dt = 1 / 30): { a: number; b: number; c: number; m: number } {
  const a = findRange(refBase(missile, REF_HIGH_ALT, 0), 'rmax', { dt, tol: 0.005 }).range / 1000;
  const b = findRange(refBase(missile, REF_HIGH_ALT, 180), 'rmax', { dt, tol: 0.005 }).range / 1000;
  const c = findRange(refBase(missile, REF_LOW_ALT, 0), 'rmax', { dt, tol: 0.005 }).range / 1000;
  const m = findRange(refBase(missile, REF_MID_ALT, 0), 'rmax', { dt, tol: 0.005 }).range / 1000;
  return { a, b, c, m };
}

/** Achieved Rmax (km) in the 10 km head-on reference shot only. */
export function measureHeadOn(missile: MissileId, dt = 1 / 30): number {
  return findRange(refBase(missile, REF_HIGH_ALT, 0), 'rmax', { dt, tol: 0.005 }).range / 1000;
}

/** Achieved Rmax (km) at 5 km head-on and fleeing (ED's table has these too; not fitted, a cross-check). */
export function measureMid(missile: MissileId, dt = 1 / 30): { head: number; tail: number } {
  const head = findRange(refBase(missile, 5000, 0), 'rmax', { dt, tol: 0.01 }).range / 1000;
  const tail = findRange(refBase(missile, 5000, 180), 'rmax', { dt, tol: 0.01 }).range / 1000;
  return { head, tail };
}
