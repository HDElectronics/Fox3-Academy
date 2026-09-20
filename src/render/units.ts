/**
 * Render scale and frame helpers. The sim works in metres (x east, y up, z south); the scene works in
 * render units where 1 unit = 1 km. Every conversion goes through here, never ad hoc.
 */
import { Euler, Quaternion, Vector3 } from 'three';

/** Metres per render unit. */
export const M_PER_UNIT = 1000;
/** Render units per metre. */
export const UNIT_PER_M = 1 / M_PER_UNIT;

export interface XYZ { x: number; y: number; z: number }

/** Sim metres → render units (km). */
export function toUnits(v: XYZ, out = new Vector3()): Vector3 {
  return out.set(v.x * UNIT_PER_M, v.y * UNIT_PER_M, v.z * UNIT_PER_M);
}

/** Render units (km) → sim metres. */
export function toMetres(v: XYZ, out = new Vector3()): Vector3 {
  return out.set(v.x * M_PER_UNIT, v.y * M_PER_UNIT, v.z * M_PER_UNIT);
}

/** Metres → units for a scalar distance. */
export const mToUnits = (m: number) => m * UNIT_PER_M;
/** Units → metres for a scalar distance. */
export const unitsToM = (u: number) => u * M_PER_UNIT;

const _euler = new Euler(0, 0, 0, 'YXZ');

/**
 * Orientation of a body whose model nose points along -z (north), right wing +x, top +y.
 * heading: rad clockwise from north; pitch: rad, + nose up; roll: rad, + right wing down (bank right).
 */
export function orientationQuaternion(heading: number, pitch: number, roll: number, out = new Quaternion()): Quaternion {
  _euler.set(pitch, -heading, -roll, 'YXZ');
  return out.setFromEuler(_euler);
}

/** Yaw-only orientation (heading), for things stabilised to the horizon (radar scan volume, chase camera). */
export function headingQuaternion(heading: number, out = new Quaternion()): Quaternion {
  _euler.set(0, -heading, 0, 'YXZ');
  return out.setFromEuler(_euler);
}

/**
 * Pixels per render unit at `distance` units from a perspective camera.
 * viewportHeightPx is in CSS pixels; fovDeg is the camera's vertical field of view.
 */
export function pxPerUnitAt(distance: number, fovDeg: number, viewportHeightPx: number): number {
  const d = Math.max(distance, 1e-6);
  return viewportHeightPx / (2 * d * Math.tan((fovDeg * Math.PI) / 360));
}

/**
 * Tacview-style visibility scale: the render scale (units per model metre) for a model of
 * `nominalLengthM` so it covers at least `minPx` pixels on screen, never smaller than true size × trueScale.
 */
export function boostedScale(pxPerUnit: number, nominalLengthM: number, minPx: number, trueScale = 1): number {
  const real = UNIT_PER_M * trueScale;
  if (minPx <= 0 || nominalLengthM <= 0) return real;
  const need = minPx / Math.max(pxPerUnit, 1e-9) / nominalLengthM;
  return Math.max(real, need);
}

/** Shortest-path interpolation between two angles (rad). */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
