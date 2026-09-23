/** Shared ACM/HUD frame: flight path and lift vector, simplified (no angle of attack). */
import { Vector3 } from 'three';
import type { Aircraft } from './types';
import { liftVector } from './flight';

const u = new Vector3(), l = new Vector3(), r = new Vector3(), rel = new Vector3();

/** Aircraft-relative angles in radians: az + right, el + canopy. */
export function aircraftAngles(me: Aircraft, p: Vector3) {
  u.copy(me.vel).normalize();
  liftVector(me, l);
  r.crossVectors(u, l);
  rel.subVectors(p, me.pos);
  const f = rel.dot(u);
  return { az: Math.atan2(rel.dot(r), f), el: Math.atan2(rel.dot(l), f), range: rel.length(), ahead: f > 0 };
}
