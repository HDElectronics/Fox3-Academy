/** Geometry helpers shared by every sim module. Frame: x east, y up, z south (north = -z). */
import { Vector3 } from 'three';

export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const G0 = 9.80665;

export const M_PER_NM = 1852;
export const M_PER_FT = 0.3048;
export const MPS_PER_KT = 0.514444;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Wrap to -π..π. */
export function wrapPi(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
/** Wrap to 0..2π. */
export function wrap2Pi(a: number): number {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

/** Unit vector for a heading (rad, clockwise from north) and pitch (rad, + up). */
export function dirFrom(heading: number, pitch = 0, out = new Vector3()): Vector3 {
  const c = Math.cos(pitch);
  return out.set(Math.sin(heading) * c, Math.sin(pitch), -Math.cos(heading) * c);
}

/** Heading (0..2π) of a vector's horizontal component. */
export function headingOf(v: { x: number; z: number }): number {
  return wrap2Pi(Math.atan2(v.x, -v.z));
}

/** Pitch of a vector (rad, + up). */
export function pitchOf(v: Vector3): number {
  const h = Math.hypot(v.x, v.z);
  return Math.atan2(v.y, h);
}

/** True bearing from a to b (0..2π). */
export function bearingTo(a: Vector3, b: Vector3): number {
  return wrap2Pi(Math.atan2(b.x - a.x, -(b.z - a.z)));
}

/** Bearing of b relative to a nose heading, -π..π, + right. */
export function relBearing(fromPos: Vector3, heading: number, toPos: Vector3): number {
  return wrapPi(bearingTo(fromPos, toPos) - heading);
}

/** Elevation angle of b seen from a, rad (+ above horizon). */
export function elevationTo(a: Vector3, b: Vector3): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  return Math.atan2(b.y - a.y, Math.hypot(dx, dz));
}

/** Slant range. */
export const rangeBetween = (a: Vector3, b: Vector3) => a.distanceTo(b);

/** Horizontal range. */
export function groundRange(a: Vector3, b: Vector3): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Closure rate between two bodies (m/s, positive = closing). */
export function closureRate(aPos: Vector3, aVel: Vector3, bPos: Vector3, bVel: Vector3): number {
  const lx = bPos.x - aPos.x, ly = bPos.y - aPos.y, lz = bPos.z - aPos.z;
  const r = Math.hypot(lx, ly, lz) || 1;
  const rvx = bVel.x - aVel.x, rvy = bVel.y - aVel.y, rvz = bVel.z - aVel.z;
  return -(rvx * lx + rvy * ly + rvz * lz) / r;
}

/**
 * Target aspect angle: angle between the target's velocity and the line from the target to the observer.
 * 0 = target pointing at observer (hot), π/2 = beaming, π = pointing away (cold).
 */
export function aspectAngle(tPos: Vector3, tVel: Vector3, observerPos: Vector3): number {
  const lx = observerPos.x - tPos.x, ly = observerPos.y - tPos.y, lz = observerPos.z - tPos.z;
  const l = Math.hypot(lx, ly, lz) || 1, v = tVel.length() || 1;
  return Math.acos(clamp((tVel.x * lx + tVel.y * ly + tVel.z * lz) / (l * v), -1, 1));
}

/**
 * Target speed along the line of sight, relative to the ground (m/s, absolute value).
 * This is what a pulse-Doppler radar or seeker compares against the clutter notch.
 */
export function radialSpeedVsGround(observerPos: Vector3, tPos: Vector3, tVel: Vector3): number {
  const lx = tPos.x - observerPos.x, ly = tPos.y - observerPos.y, lz = tPos.z - observerPos.z;
  const l = Math.hypot(lx, ly, lz) || 1;
  return Math.abs((tVel.x * lx + tVel.y * ly + tVel.z * lz) / l);
}

/** Is the target seen against the ground (look-down) from the observer? */
export function isLookDown(observerPos: Vector3, tPos: Vector3, groundAlt = 0): boolean {
  // Target is below the observer's horizontal plane and the line of sight, extended past the
  // target, meets the ground (i.e. clutter sits behind the target in the beam).
  return tPos.y < observerPos.y - 50 && tPos.y > groundAlt - 1;
}

export const v3 = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);

/**
 * Doppler notch test shared by radars and radar seekers.
 * A pulse-Doppler receiver rejects returns whose radial speed vs the ground is below `notchMps`
 * (main-lobe clutter filter). With `needLookDown`, it only happens when clutter is behind the target.
 */
export function inDopplerNotch(
  observerPos: Vector3, tPos: Vector3, tVel: Vector3, notchMps: number, needLookDown: boolean, groundAlt = 0,
): boolean {
  if (needLookDown && !isLookDown(observerPos, tPos, groundAlt)) return false;
  return radialSpeedVsGround(observerPos, tPos, tVel) < notchMps;
}
