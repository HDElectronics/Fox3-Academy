/**
 * Shkval TV sight (Su-25T), game level, as the ED Su-25T Flight Manual (S1, docs/research/su25t.md) describes
 * it to the player:
 *  - on / off [O]; slew [;] [,] [.] [/]; ground-stabilise [Enter]; zoom [=] / [-] in three steps (wide, 8x, 23x).
 *  - target size [RCtrl-]] / [RCtrl-[]: locks only an object within 5 m of the set size; objects larger than
 *    60 m lock at the 60 m maximum. КС = manual steering, АС = locked.
 *  - once locked the sight tracks the target inside ±35° azimuth, +15° to −85° elevation; beyond, the lock drops.
 *  - laser [RShift-O] (ЛД): S1 rule implemented: the laser switches off at its limit and cools about as long as it
 *    was on; the limit is S1's 20 minutes of use. (An earlier research pass gives 1 minute continuous: not used.)
 * Angles are relative to the jet's heading and the horizon (the trainer ignores pitch and roll for the gimbal).
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { Aircraft, EntityId, GroundUnit, GroundUnitKind, ShkvalLostReason, ShkvalState, ShkvalZoom } from './types';
import { D2R, clamp, dirFrom, elevationTo, relBearing } from './math';
import { groundIntersect, lineOfSight } from './ground';

/** Gimbal once locked (S1). */
export const SHKVAL_LOCK_GIMBAL = { azDeg: 35, elUpDeg: 15, elDownDeg: -85 } as const;
/** Slew limits: the IT-23M scales (S1: −40..+40° azimuth, +20..−90° elevation). Using them as slew stops is a trainer choice. */
export const SHKVAL_SLEW_LIMITS = { azDeg: 40, elUpDeg: 20, elDownDeg: -90 } as const;
export const SHKVAL_ZOOMS: readonly ShkvalZoom[] = [1, 8, 23];
/** Target size range and step (m). S1 gives the 60 m maximum; the 5 m step and minimum are not verified. */
export const SHKVAL_SIZE = { min: 5, max: 60, step: 5, matchM: 5 } as const;
/** S1: "should not be used for more than 20 minutes" per flight; implemented as the laser's heat limit. */
export const LASER_LIMIT_S = 20 * 60;
/** Slew rate in fields of view per second (trainer value). */
const SLEW_FOV_PER_S = 0.5;
/** Trainer start: sight looking 10° below the nose. */
const START_EL = -10 * D2R;

/** Field of view (deg) at a zoom: S1 gives 0.97 × 0.73° at 23x; other steps are scaled from it (not verified). */
export function shkvalFovDeg(zoom: ShkvalZoom): { h: number; v: number } {
  return { h: (0.97 * 23) / zoom, v: (0.73 * 23) / zoom };
}

export function createShkvalState(): ShkvalState {
  return {
    on: false, mode: 'КС', az: 0, el: START_EL, slew: { x: 0, y: 0 }, groundStab: false, stabPoint: null,
    zoom: 1, targetSizeM: 10, lockedUnitId: null, lastLost: null, laserOn: false, laserUsedS: 0, laserCoolS: 0,
  };
}

export interface ShkvalResult { ok: boolean; reason: string; unitId?: EntityId }
const ok = (unitId?: EntityId): ShkvalResult => ({ ok: true, reason: '', unitId });
const no = (reason: string): ShkvalResult => ({ ok: false, reason });

/** Line-of-sight unit vector in the world. */
export function shkvalDir(ac: Aircraft, out = new Vector3()): Vector3 {
  const sh = ac.ag!.shkval;
  return dirFrom(ac.heading + sh.az, sh.el, out);
}

/** Where the sight looks on the ground: the locked unit, the stabilised point, or the LOS ground intersection. */
export function shkvalAimPoint(world: World, ac: Aircraft): Vector3 | null {
  const sh = ac.ag?.shkval;
  if (!sh || !sh.on) return null;
  const u = sh.lockedUnitId ? world.groundUnits.get(sh.lockedUnitId) : undefined;
  if (u) return u.pos.clone();
  if (sh.groundStab && sh.stabPoint) return sh.stabPoint.clone();
  return groundIntersect(world, ac.pos, shkvalDir(ac));
}

/** Slant range (m) to the aim point, or null when the sight is off or looks above the horizon. */
export function shkvalRange(world: World, ac: Aircraft): number | null {
  const p = shkvalAimPoint(world, ac);
  return p ? ac.pos.distanceTo(p) : null;
}

export function inLockGimbal(az: number, el: number): boolean {
  const g = SHKVAL_LOCK_GIMBAL;
  return Math.abs(az) <= g.azDeg * D2R && el <= g.elUpDeg * D2R && el >= g.elDownDeg * D2R;
}

function clampSlew(sh: ShkvalState): void {
  const l = SHKVAL_SLEW_LIMITS;
  sh.az = clamp(sh.az, -l.azDeg * D2R, l.azDeg * D2R);
  sh.el = clamp(sh.el, l.elDownDeg * D2R, l.elUpDeg * D2R);
}

function lookAt(ac: Aircraft, p: Vector3): void {
  const sh = ac.ag!.shkval;
  sh.az = relBearing(ac.pos, ac.heading, p);
  sh.el = elevationTo(ac.pos, p);
}

function loseLock(world: World, ac: Aircraft, why: ShkvalLostReason): void {
  const sh = ac.ag!.shkval;
  const id = sh.lockedUnitId;
  if (!id) return;
  sh.lockedUnitId = null; sh.mode = 'КС';
  sh.lastLost = { t: world.t, unitId: id, why };
  world.emit({ t: world.t, type: 'shkval-lost', ownerId: ac.id, unitId: id, why });
}

/** Switch the Shkval on or off [O]. Off drops the lock, the laser and the ground stabilisation. */
export function setShkvalPower(world: World, ac: Aircraft, on: boolean): void {
  const sh = ac.ag?.shkval;
  if (!sh || sh.on === on) return;
  if (!on) {
    loseLock(world, ac, 'off');
    if (sh.laserOn) { sh.laserOn = false; world.emit({ t: world.t, type: 'laser', ownerId: ac.id, on: false, why: 'shkval-off' }); }
    sh.groundStab = false; sh.stabPoint = null; sh.slew = { x: 0, y: 0 };
  }
  sh.on = on;
}

/** Ground-stabilise [Enter] (or release). Needs the sight on the ground. */
export function setShkvalStab(world: World, ac: Aircraft, on: boolean): ShkvalResult {
  const sh = ac.ag?.shkval;
  if (!sh || !sh.on) return no('Shkval is off');
  if (!on) {
    if (sh.lockedUnitId) return no('Unlock first');
    sh.groundStab = false; sh.stabPoint = null; return ok();
  }
  const p = groundIntersect(world, ac.pos, shkvalDir(ac));
  if (!p) return no('The sight is above the horizon');
  sh.groundStab = true; sh.stabPoint = p;
  return ok();
}

/** Point the sight at a world position (lessons and scripted demos); keeps the ground stabilisation state. */
export function pointShkval(world: World, ac: Aircraft, p: { x: number; y: number; z: number }): void {
  const sh = ac.ag?.shkval;
  if (!sh || sh.lockedUnitId) return;
  const v = new Vector3(p.x, p.y, p.z);
  lookAt(ac, v); clampSlew(sh);
  if (sh.groundStab) sh.stabPoint = groundIntersect(world, ac.pos, shkvalDir(ac)) ?? v;
}

/** Zoom one step in (+1) or out (−1): wide, 8x, 23x. */
export function stepShkvalZoom(ac: Aircraft, dir: 1 | -1): ShkvalZoom | null {
  const sh = ac.ag?.shkval;
  if (!sh) return null;
  const i = clamp(SHKVAL_ZOOMS.indexOf(sh.zoom) + dir, 0, SHKVAL_ZOOMS.length - 1);
  return (sh.zoom = SHKVAL_ZOOMS[i]);
}

/** Set the target size (m), clamped to 5..60. */
export function setShkvalTargetSize(ac: Aircraft, m: number): number | null {
  const sh = ac.ag?.shkval;
  if (!sh) return null;
  return (sh.targetSizeM = clamp(Math.round(m), SHKVAL_SIZE.min, SHKVAL_SIZE.max));
}

/** Target size one step larger (+1) or smaller (−1). */
export function stepShkvalTargetSize(ac: Aircraft, dir: 1 | -1): number | null {
  const sh = ac.ag?.shkval;
  return sh ? setShkvalTargetSize(ac, sh.targetSizeM + dir * SHKVAL_SIZE.step) : null;
}

/** Size the lock rule compares: objects larger than 60 m count as 60 m (S1). */
export const lockSize = (u: Pick<GroundUnit, 'sizeM'>): number => Math.min(u.sizeM, SHKVAL_SIZE.max);

/** S1 lock rule: the object must be within 5 m of the set target size. */
export const sizeMatches = (u: Pick<GroundUnit, 'sizeM'>, setM: number): boolean => Math.abs(lockSize(u) - setM) <= SHKVAL_SIZE.matchM;

/** Is the unit inside the TV target frame around `aim`? The frame and the object overlap on the ground. */
function inFrame(u: GroundUnit, aim: Vector3, setM: number): boolean {
  const dx = u.pos.x - aim.x, dz = u.pos.z - aim.z;
  return Math.hypot(dx, dz) <= (setM + lockSize(u)) / 2;
}

/**
 * Try to lock [Enter with the frame on a target]: the nearest live unit in the frame whose size matches the set
 * size, in the gimbal and in line of sight. Reason in pilot words when it fails.
 */
export function shkvalLock(world: World, ac: Aircraft): ShkvalResult {
  const sh = ac.ag?.shkval;
  if (!sh || !sh.on) return no('Shkval is off');
  if (sh.lockedUnitId) return ok(sh.lockedUnitId);
  const aim = shkvalAimPoint(world, ac);
  if (!aim) return no('The sight is above the horizon');
  const inside = [...world.groundUnits.values()].filter(u => u.alive && inFrame(u, aim, sh.targetSizeM));
  if (!inside.length) return no('Nothing in the target frame');
  const matching = inside.filter(u => sizeMatches(u, sh.targetSizeM));
  if (!matching.length) {
    const s = Math.round(lockSize(inside[0]));
    return no(`Target size ${sh.targetSizeM} m does not match: object about ${s} m`);
  }
  matching.sort((a, b) => a.pos.distanceToSquared(aim) - b.pos.distanceToSquared(aim));
  let reason = '';
  for (const u of matching) {
    const az = relBearing(ac.pos, ac.heading, u.pos), el = elevationTo(ac.pos, u.pos);
    if (!inLockGimbal(az, el)) { reason ||= 'Outside the Shkval gimbal (±35°, +15° to −85°)'; continue; }
    if (!lineOfSight(world, ac.pos, u.pos)) { reason ||= 'Terrain masks the target'; continue; }
    sh.lockedUnitId = u.id; sh.mode = 'АС'; sh.az = az; sh.el = el;
    sh.groundStab = true; sh.stabPoint = u.pos.clone(); sh.slew = { x: 0, y: 0 };
    world.emit({ t: world.t, type: 'shkval-lock', ownerId: ac.id, unitId: u.id, range: ac.pos.distanceTo(u.pos) });
    return ok(u.id);
  }
  return no(reason);
}

/** Break the lock by hand; the sight stays ground-stabilised on the target's last position. */
export function shkvalUnlock(world: World, ac: Aircraft): void {
  if (ac.ag) loseLock(world, ac, 'unlocked');
}

/** Laser on / off [RShift-O]. Needs the Shkval on and the laser not cooling. */
export function setLaser(world: World, ac: Aircraft, on: boolean): ShkvalResult {
  const sh = ac.ag?.shkval;
  if (!sh) return no('No laser on this jet');
  if (sh.laserOn === on) return ok();
  if (on && !sh.on) return no('Shkval is off');
  if (on && sh.laserCoolS > 0) return no(`Laser cooling, ${Math.ceil(sh.laserCoolS)} s (ЛД flashing)`);
  sh.laserOn = on;
  world.emit({ t: world.t, type: 'laser', ownerId: ac.id, on, why: 'pilot' });
  return ok();
}

/** Every tick for attack jets: laser heat, slew, ground stabilisation, lock tracking and the lock-loss rules. */
export function stepShkval(world: World, ac: Aircraft, dt: number): void {
  const sh = ac.ag?.shkval;
  if (!sh) return;
  if (!ac.alive) { setShkvalPower(world, ac, false); return; }
  // Laser heat (S1): rises while lasing; at the limit the laser trips and cools as long as it was on.
  if (sh.laserOn) {
    sh.laserUsedS += dt;
    if (sh.laserUsedS >= LASER_LIMIT_S) {
      sh.laserOn = false; sh.laserCoolS = sh.laserUsedS;
      world.emit({ t: world.t, type: 'laser', ownerId: ac.id, on: false, why: 'limit' });
    }
  } else {
    sh.laserUsedS = Math.max(0, sh.laserUsedS - dt);
    if (sh.laserCoolS > 0) sh.laserCoolS = Math.max(0, sh.laserCoolS - dt);
  }
  if (!sh.on) return;

  if (sh.lockedUnitId) {
    const u = world.groundUnits.get(sh.lockedUnitId);
    if (!u || !u.alive) { loseLock(world, ac, 'target-dead'); return; }
    lookAt(ac, u.pos);
    sh.stabPoint = u.pos.clone();
    if (!inLockGimbal(sh.az, sh.el)) { loseLock(world, ac, 'gimbal'); clampSlew(sh); return; }
    if (!lineOfSight(world, ac.pos, u.pos)) loseLock(world, ac, 'terrain');
    return;
  }

  const rate = SLEW_FOV_PER_S * shkvalFovDeg(sh.zoom).h * D2R;
  const moving = sh.slew.x !== 0 || sh.slew.y !== 0;
  if (sh.groundStab && sh.stabPoint) {
    lookAt(ac, sh.stabPoint);
    if (moving) {
      sh.az += sh.slew.x * rate * dt; sh.el += sh.slew.y * rate * dt; clampSlew(sh);
      const p = groundIntersect(world, ac.pos, shkvalDir(ac));
      if (p) sh.stabPoint = p;
    } else {
      clampSlew(sh);
    }
  } else if (moving) {
    sh.az += sh.slew.x * rate * dt; sh.el += sh.slew.y * rate * dt; clampSlew(sh);
  }
}

// ─────────────────────────────────────────────────────────── identification ranges (S1)

/** S1: through the optics a house is recognisable at 15 km, a tank at 8–10 km, a helicopter at 6 km. */
export const SHKVAL_ID_RANGES_KM = { building: 15, tank: { min: 8, max: 10 }, helicopter: 6 } as const;

/**
 * Identification range for a ground unit kind, for the IT-23M display. `source: 'S1'` for the manual's own
 * examples (building, tank); 'simplified' where the trainer borrows the nearest S1 example.
 */
export function idRangeKm(kind: GroundUnitKind): { minKm: number; maxKm: number; source: 'S1' | 'simplified' } {
  switch (kind) {
    case 'building': return { minKm: 15, maxKm: 15, source: 'S1' };
    case 'bunker': return { minKm: 15, maxKm: 15, source: 'simplified' };
    case 'tank': return { minKm: 8, maxKm: 10, source: 'S1' };
    default: return { minKm: 8, maxKm: 10, source: 'simplified' };
  }
}

/** Can the pilot tell what the object is? Trainer rule: at 23x, inside the far end of the S1 range. */
export function canIdentify(kind: GroundUnitKind, rangeM: number, zoom: ShkvalZoom): boolean {
  return zoom === 23 && rangeM <= idRangeKm(kind).maxKm * 1000;
}
