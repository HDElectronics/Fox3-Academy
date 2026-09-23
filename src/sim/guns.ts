/**
 * [OWNER: sim-physics] Guns: an arcade hit rule and simplified sight geometry for the WVR lessons (issue #11).
 * Game-tutorial abstraction, not ballistics (AGENTS.md rule 1):
 * - Bullets leave along the flight path (the sim has no AoA) at BULLET_SPEED on top of the jet's own velocity,
 *   in a straight line, with a flat time of flight TOF = range / BULLET_SPEED. No gravity drop, no drag.
 * - While `cmd.trigger` is held the gun uses rounds at the data rate of fire. Each tick, for every jet inside the
 *   gun's max range (data/wvr.ts), the lead point is the target's relative motion over the TOF; a round can hit
 *   when the angle between the gun line and the lead point is inside the target's angular size, with a chance
 *   that falls off toward the edge (world.rand, deterministic). Hits fill a damage pool; at 1 the jet dies.
 * - Sight helpers give the HUD where a pipper or funnel point sits for a range, from the jet's own turn rate
 *   (lead-computing idea). Simplified, not verified against any DCS sight.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { Aircraft, GunState } from './types';
import { gunSpecFor, type GunSpec } from '../data/wvr';
import { liftVector } from './flight';
import { G0 } from './math';

/** Bullet speed added to the shooter's velocity (m/s). Simplified: one value for every gun. */
export const BULLET_SPEED = 1000;
/** Target span used for the hit cone (m). */
export const GUN_TARGET_SPAN_M = 13;
/** One tracer event every this many seconds of firing. */
export const GUN_TRACER_S = 0.1;
/** Chance per round that passes through the centre of the target. Falls to 0 at the edge of the target. */
export const GUN_P_CENTRE = 0.35;

/** Arcade damage per hit by calibre; the damage pool is 1. */
export function hitDamage(calibreMm: number): number {
  return calibreMm >= 30 ? 0.25 : calibreMm >= 23 ? 0.14 : 0.1;
}

export function createGunState(type: string): GunState {
  return { rounds: gunSpecFor(type)?.rounds.value ?? 0, firing: false, burst: 0, hits: 0 };
}

/** Gun data of this jet (null: no gun in the sim). */
export function gunOf(ac: Aircraft): GunSpec | null {
  return gunSpecFor(ac.type);
}

export interface GunSolution {
  targetId: string;
  /** m */
  range: number;
  /** Flat time of flight, s. */
  tof: number;
  /** Unit vector (world) from the shooter to the lead point: where the gun line must point. */
  lead: Vector3;
  /** Angle between the gun line and the lead point, rad. */
  missAngle: number;
  /** Predicted miss distance at the target, m. */
  missM: number;
  /** Half the target's angular size, rad. */
  sizeAngle: number;
  /** Inside the gun's max range. */
  inRange: boolean;
  /** In range and the gun line on the target: rounds fired now can hit. */
  inSolution: boolean;
}

const _u = new Vector3(), _rel = new Vector3(), _lift = new Vector3(), _rate = new Vector3(), _right = new Vector3();

/** Lead geometry of `shooter`'s gun against `target` right now (simplified, flat TOF). */
export function gunSolution(shooter: Aircraft, target: Aircraft): GunSolution {
  const spec = gunOf(shooter);
  const maxR = spec?.maxRangeM.value ?? 0;
  _rel.subVectors(target.pos, shooter.pos);
  const range = _rel.length();
  const tof = range / BULLET_SPEED;
  const lead = new Vector3().copy(_rel).addScaledVector(target.vel, tof).addScaledVector(shooter.vel, -tof);
  const leadLen = Math.max(1e-6, lead.length());
  lead.divideScalar(leadLen);
  const u = _u.copy(shooter.vel).normalize();
  const missAngle = Math.acos(Math.max(-1, Math.min(1, u.dot(lead))));
  const sizeAngle = Math.atan2(GUN_TARGET_SPAN_M / 2, Math.max(1, range));
  const inRange = range <= maxR;
  return {
    targetId: target.id, range, tof, lead, missAngle, missM: Math.sin(missAngle) * leadLen, sizeAngle,
    inRange, inSolution: inRange && missAngle < sizeAngle,
  };
}

interface Priv { acc: number; tracer: number; burstActive: boolean }
const priv = new WeakMap<Aircraft, Priv>();

/** Fire every gun whose trigger is held; score hits. World calls this each tick after flight. */
export function stepGuns(world: World, dt: number): void {
  if (dt <= 0) return;
  for (const ac of world.aircraft.values()) {
    const gun = ac.gun;
    gun.firing = false;
    const spec = gunOf(ac);
    if (!spec) continue;
    let p = priv.get(ac);
    if (!p) { p = { acc: 1, tracer: 0, burstActive: false }; priv.set(ac, p); }
    p.acc += spec.rateRpm.value / 60 * dt;
    if (!ac.alive || !ac.cmd.trigger) {
      if (p.burstActive) world.emit({ t: world.t, type: 'gun', shooterId: ac.id, what: 'cease' });
      p.burstActive = false;
      p.acc = Math.min(1, p.acc);              // cooldown elapses while released; no stockpile of shots
      gun.burst = 0;
      continue;
    }
    if (gun.rounds <= 0) {
      if (p.burstActive) world.emit({ t: world.t, type: 'gun', shooterId: ac.id, what: 'empty' });
      p.burstActive = false;
      p.acc = Math.min(1, p.acc);
      continue;
    }
    if (!p.burstActive) {
      world.emit({ t: world.t, type: 'gun', shooterId: ac.id, what: 'burst' });
      p.burstActive = true;
      gun.burst = 0;
      p.tracer = 0;
    }
    gun.burst += dt;
    p.tracer -= dt;                            // elapsed firing time includes ticks between rounds
    const n = Math.min(gun.rounds, Math.floor(p.acc));
    p.acc -= n;
    gun.rounds -= n;
    gun.firing = n > 0;
    if (n === 0) continue;

    if (p.tracer <= 0) {
      p.tracer += GUN_TRACER_S;
      const u = _u.copy(ac.vel).normalize();
      world.emit({
        t: world.t, type: 'tracer', shooterId: ac.id, pos: [ac.pos.x, ac.pos.y, ac.pos.z],
        vel: [ac.vel.x + u.x * BULLET_SPEED, ac.vel.y + u.y * BULLET_SPEED, ac.vel.z + u.z * BULLET_SPEED],
      });
    }

    for (const tgt of world.aircraft.values()) {
      if (tgt === ac || !tgt.alive) continue;
      if (tgt.pos.distanceToSquared(ac.pos) > spec.maxRangeM.value ** 2) continue;
      const sol = gunSolution(ac, tgt);
      if (!sol.inSolution) continue;
      const r = sol.missAngle / sol.sizeAngle;
      const ph = GUN_P_CENTRE * (1 - r * r);
      let hits = 0;
      for (let i = 0; i < n; i++) if (world.rand() < ph) hits++;
      if (!hits) continue;
      const dmg = hits * hitDamage(spec.calibreMm);
      gun.hits += hits;
      const damage = tgt.damage + dmg;
      // Decimal hit increments can sum just below 1 (e.g. ten 20 mm hits).
      tgt.damage = damage >= 1 - 1e-12 ? 1 : damage;
      world.emit({ t: world.t, type: 'gun-hit', shooterId: ac.id, targetId: tgt.id, hits, damage: tgt.damage });
      if (tgt.damage >= 1) world.kill(tgt.id, ac.id);
    }
  }
}

// ---- sight geometry (simplified, for the HUD) -----------------------------------------------------------------

/** A sight point in HUD angles relative to the gun line: + right, + up (toward the canopy), rad. */
export interface SightPoint {
  range: number;
  tof: number;
  right: number;
  up: number;
  /** Half the angular size of `spanM` at this range (funnel half-width), rad. */
  halfSpan: number;
}

/**
 * Where a lead-computing pipper (or one funnel point) for `range` sits: the gun line displaced against the
 * jet's own turn by turn rate × TOF, so a target in the same turn under the pipper is in the hit rule's
 * solution. Uses the nose's rate of turn from the load factor, lift vector and gravity. Simplified.
 */
export function sightPoint(ac: Aircraft, range: number, spanM = GUN_TARGET_SPAN_M): SightPoint {
  const v = Math.max(1, ac.vel.length());
  const u = _u.copy(ac.vel).divideScalar(v);
  const lift = liftVector(ac, _lift);
  // du/dt = (n·g·lift − gravity across the flight path) / v
  _rate.copy(lift).multiplyScalar(ac.g * G0);
  _rate.y -= G0 * (1 - u.y * u.y);
  _rate.x += G0 * u.y * u.x;
  _rate.z += G0 * u.y * u.z;
  _rate.divideScalar(v);
  _right.crossVectors(u, lift);
  const tof = range / BULLET_SPEED;
  return {
    range, tof,
    right: -_rate.dot(_right) * tof,
    up: -_rate.dot(lift) * tof,
    halfSpan: Math.atan2(spanM / 2, Math.max(1, range)),
  };
}

/** Funnel points from the jet's data near to far range (`steps` + 1 points), sized for its default wingspan. */
export function funnelPoints(ac: Aircraft, steps = 6, spanM?: number): SightPoint[] {
  const spec = gunOf(ac);
  if (!spec) return [];
  const [near, far] = spec.funnelM.value;
  const span = spanM ?? spec.wingspanM.value;
  const out: SightPoint[] = [];
  for (let i = 0; i <= steps; i++) out.push(sightPoint(ac, near + (far - near) * i / steps, span));
  return out;
}
