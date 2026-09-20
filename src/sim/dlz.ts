/**
 * [OWNER: sim-physics] Launch zones.
 * - dlzFor(): FAST (called every frame by displays). Interpolates precomputed tables (dlzTables.ts,
 *   generated offline by flying the game missile model) by shooter altitude, shooter Mach, target aspect
 *   and target altitude offset, then corrects for target speed and nose-off-target.
 * - simulateShot(): flies one missile in a private World against a scripted target manoeuvre. Used by the
 *   Missile Lab page and by the table generator.
 * - findRange(): binary-searches the launch range for given conditions (Rmax: target flies straight;
 *   Rne: target turns cold at launch). Used by the generator and the Missile Lab's "compute exactly".
 */
import { Vector3 } from 'three';
import type { AircraftId, MissileId } from '../data/types';
import type { Aircraft, Dlz, Missile, SimEvent, PhoenixLaunchMode } from './types';
import { MISSILES } from '../data/missiles';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../data/aircraft';
import { World } from './world';
import { irAcquisitionRange } from './launch';
import { lockTarget, setRadarMode, stepRadar } from './radar';
import { stepAircraft } from './flight';
import { createMissile, stepMissile } from './missile';
import { dropChaff, dropFlare, stepCountermeasures } from './countermeasures';
import { aspectAngle, bearingTo, clamp, D2R, R2D, relBearing, wrap2Pi, wrapPi } from './math';
import { mach as machOf, sigma, soundSpeed, speedFromMach } from './atmosphere';
import { missileModel, REF_HIGH_ALT, REF_LOW_ALT, REF_SPEED } from './missileModel';
import { DLZ_TABLES, type DlzTable } from './dlzTables';

export type TargetManeuver = 'none' | 'turn-cold' | 'beam' | 'crank' | 'notch-chaff';

export interface ShotSetup {
  missile: MissileId;
  shooterAlt: number;     // m
  shooterMach: number;
  targetAlt: number;      // m
  targetMach: number;
  range: number;          // m at launch
  aspectDeg: number;      // 0 = target hot (nose-on), 180 = cold
  maneuver: TargetManeuver;
  /** Seconds after launch the target starts its manoeuvre (reaction time). Default 0. */
  reactAfter?: number;
  /** Seed for the chaff / flare rolls (same seed → same shot). Default 1. */
  seed?: number;
  /** Target jet type (turn and acceleration performance). Default: dlzTargetType(missile), the jet the tables were flown against. */
  targetType?: AircraftId;
  /** Shooter radar/platform for the lab; default first carrier used by the range tables. */
  shooterType?: AircraftId;
  /** false: fly this shot without the loft (what-if). Default: the missile lofts if it does in DCS. */
  loft?: boolean;
  /** Default perfect support preserves kinematic comparisons; radar steps the shooter's actual radar. */
  support?: 'perfect' | 'radar';
  /** Phoenix launch selection. Default TWS for standalone comparisons. */
  phoenixLaunchMode?: PhoenixLaunchMode;
}

export interface ShotResult {
  hit: boolean;
  /** 'hit' or the miss reason ('kinematic', 'notched', 'chaff', ... see MissReason). */
  reason: string;
  timeOfFlight: number;
  /** Sampled trace for plots (every ~0.25 s). */
  trace: { t: number; range: number; missileAlt: number; missileMach: number; targetAlt: number; guidance: string }[];
  missilePath: Vector3[];
  targetPath: Vector3[];
  impactMach: number | null;
  missDistance: number;
  /** Shooter positions at the same samples. */
  shooterPath: Vector3[];
  /** Where and when the seeker went active (ARH), else null. */
  pitbull: null | { t: number; pos: Vector3 };
  /** Missile events of the shot (launch, pitbull, seeker-lost, hit/miss, chaff...). Times from launch. */
  events: SimEvent[];
}

const SAMPLE_DT = 0.25;
const SIM_DT = 1 / 60;
const MAX_SHOT_S = 260;
/** Scripted defence: one cartridge a second while on the beam, once the missile is inside this range. */
const CM_EVERY_S = 1.0;
const CM_START_M = 15000;

/**
 * The jets the launch-zone tables are flown with: the first jet (AIRCRAFT_ORDER) that carries the missile
 * as the shooter, and a typical opponent as the target (F-15C for Russian / Chinese missiles, Su-27 for the rest).
 */
export function platformsFor(missile: MissileId): { shooter: AircraftId; target: AircraftId } {
  const shooter = AIRCRAFT_ORDER.find(id => AIRCRAFT[id].missiles.includes(missile)) ?? 'f15c';
  const east = AIRCRAFT[shooter].nation === 'ru' || AIRCRAFT[shooter].nation === 'cn';
  return { shooter, target: east ? 'f15c' : 'su27' };
}

/** The target jet the DLZ tables (and simulateShot by default) assume for this missile. */
export function dlzTargetType(missile: MissileId): AircraftId {
  return platformsFor(missile).target;
}

interface RunOpts { dt: number; sample: boolean; requireIrLock?: boolean }
interface RunOut { hit: boolean; reason: string; tof: number; missDistance: number; impactMach: number | null }

/** Scripted defensive flying for the target, per ShotSetup.maneuver. */
function makeScript(setup: ShotSetup, world: World, target: Aircraft, shooter: Aircraft, m: Missile) {
  const react = Math.max(0, setup.reactAfter ?? 0);
  const perf = AIRCRAFT[target.type].perf;
  let side = 0;
  // a pilot is never exactly on the beam: a seeded heading error of up to ±6° (±5° for the crank)
  let headingErr = NaN;
  let lastChaff = -Infinity;
  const radar = MISSILES[setup.missile].seeker !== 'ir';
  return (t: number) => {
    if (setup.maneuver === 'none' || t < react || !target.alive) return;
    target.cmd.maxG = perf.maxG;
    if (Number.isNaN(headingErr)) headingErr = (world.rand() * 2 - 1) * (setup.maneuver === 'crank' ? 5 : 6) * D2R;
    switch (setup.maneuver) {
      case 'turn-cold': {
        target.cmd.heading = bearingTo(shooter.pos, target.pos);
        target.cmd.afterburner = true;
        target.cmd.speed = speedFromMach(perf.maxMach, Math.max(0, target.pos.y));
        break;
      }
      case 'crank': {
        const brg = bearingTo(target.pos, shooter.pos);
        if (!side) side = wrapPi(brg + 55 * D2R - target.heading) ** 2 < wrapPi(brg - 55 * D2R - target.heading) ** 2 ? 1 : -1;
        target.cmd.heading = wrap2Pi(brg + side * 55 * D2R + headingErr);
        break;
      }
      case 'beam':
      case 'notch-chaff': {
        const threat = setup.support === 'radar' && m.guidance === 'sarh' ? shooter.pos : m.alive ? m.pos : shooter.pos;
        const brg = bearingTo(target.pos, threat);
        if (!side) side = Math.abs(wrapPi(brg + Math.PI / 2 - target.heading)) < Math.abs(wrapPi(brg - Math.PI / 2 - target.heading)) ? 1 : -1;
        target.cmd.heading = wrap2Pi(brg + side * Math.PI / 2 + headingErr);
        if (setup.maneuver === 'notch-chaff') {
          target.cmd.altitude = Math.max(world.groundAlt + 300, setup.targetAlt - 4000);
          const offBeam = Math.abs(Math.abs(relBearing(target.pos, target.heading, threat)) - Math.PI / 2);
          if (m.alive && offBeam < 15 * D2R && target.pos.distanceTo(threat) < CM_START_M && t - lastChaff >= CM_EVERY_S) {
            lastChaff = t;
            if (radar) dropChaff(world, target); else dropFlare(world, target);
          }
        }
        break;
      }
    }
  };
}

function runShot(setup: ShotSetup, opts: RunOpts, out?: ShotResult): RunOut {
  const world = new World(setup.seed ?? 1);
  world.record = false;
  const plat = platformsFor(setup.missile);
  const shooterAlt = Math.max(0, setup.shooterAlt), targetAlt = Math.max(0, setup.targetAlt);
  const vS = speedFromMach(setup.shooterMach, shooterAlt);
  const vT = speedFromMach(setup.targetMach, targetAlt);
  const dh = targetAlt - shooterAlt;
  const horiz = Math.sqrt(Math.max(1, setup.range * setup.range - dh * dh));
  const shooter = world.spawnAircraft({ id: 'shooter', side: 'blue', type: setup.shooterType ?? plat.shooter, controller: 'script', pos: { x: 0, y: shooterAlt, z: 0 }, heading: 0, speed: vS });
  const target = world.spawnAircraft({
    id: 'target', side: 'red', type: setup.targetType ?? plat.target, controller: 'script',
    pos: { x: 0, y: targetAlt, z: -horiz }, heading: wrap2Pi(Math.PI + setup.aspectDeg * D2R), speed: vT,
  });
  // The launch zone assumes the shooter points at the target (dlzFor penalises nose-off shots separately).
  shooter.vel.copy(target.pos).sub(shooter.pos).setLength(vS);
  shooter.pitch = Math.asin(clamp(shooter.vel.y / Math.max(vS, 1), -1, 1));
  shooter.cmd.afterburner = setup.shooterMach > 0.95;
  target.cmd.afterburner = setup.targetMach > 0.95;
  const blocked = (reason: string): RunOut => ({ hit: false, reason, tof: 0, missDistance: setup.range, impactMach: null });
  if (opts.requireIrLock && MISSILES[setup.missile].seeker === 'ir'
    && shooter.pos.distanceTo(target.pos) > irAcquisitionRange(setup.missile, aspectAngle(target.pos, target.vel, shooter.pos))) {
    return blocked('no-ir-lock');
  }
  const phoenix = setup.missile === 'aim54a' || setup.missile === 'aim54c';
  const phoenixMode = phoenix ? setup.phoenixLaunchMode ?? 'tws' : undefined;
  if (setup.support === 'radar' && MISSILES[setup.missile].seeker !== 'ir') {
    // Start with an acquired track, then let the normal radar model lose it to geometry / notching.
    if (!lockTarget(world, shooter, target.id)) return blocked('no-radar-lock');
    if (phoenixMode === 'tws') setRadarMode(world, shooter, 'tws');
  } else {
    world.supportOverride = () => ({ datalink: true, illuminating: true, estimate: { pos: target.pos, vel: target.vel } });
    shooter.radar.mode = phoenixMode === 'tws' ? 'tws' : 'stt';
  }
  let pitbullSeen = false;
  let mRef: Missile | null = null;
  if (out) {
    world.on(e => {
      if (e.type === 'pitbull' && !pitbullSeen && mRef) { pitbullSeen = true; out.pitbull = { t: e.t, pos: mRef.pos.clone() }; }
      if (e.type !== 'spawn') out.events.push(e);
    });
  }
  const m = createMissile(world, shooter, setup.missile, target.id, { loft: setup.loft, phoenixLaunchMode: phoenixMode });
  mRef = m;
  world.missiles.set(m.id, m);
  world.emit({ t: world.t, type: 'launch', missileId: m.id, shooterId: shooter.id, targetId: target.id, missile: setup.missile, range: setup.range, radarMode: shooter.radar.mode });
  const script = makeScript(setup, world, target, shooter, m);
  const dt = opts.dt;
  let nextSample = 0;
  const sample = () => {
    if (!out) return;
    const sp = m.vel.length();
    out.trace.push({
      t: world.t, range: m.pos.distanceTo(target.pos), missileAlt: m.pos.y,
      missileMach: sp / soundSpeed(Math.max(0, m.pos.y)), targetAlt: target.pos.y, guidance: m.guidance,
    });
    out.missilePath.push(m.pos.clone());
    out.targetPath.push(target.pos.clone());
    out.shooterPath.push(shooter.pos.clone());
  };
  let impactMach: number | null = null;
  while (m.alive && world.t < MAX_SHOT_S) {
    if (out && world.t >= nextSample - 1e-9) { sample(); nextSample += SAMPLE_DT; }
    script(world.t);
    world.t += dt;
    stepAircraft(world, shooter, dt);
    if (target.alive) stepAircraft(world, target, dt);
    stepCountermeasures(world, dt);
    if (setup.support === 'radar') stepRadar(world, shooter, dt);
    const speedBefore = m.vel.length();
    stepMissile(world, m, dt);
    if (m.result?.kind === 'hit') impactMach = speedBefore / soundSpeed(Math.max(0, m.pos.y));
  }
  if (out) sample();
  const hit = m.result?.kind === 'hit';
  return {
    hit,
    reason: m.result ? String(m.result.reason) : 'timeout',
    tof: (m.result?.t ?? world.t) - m.launchedAt,
    missDistance: m.closestApproach,
    impactMach,
  };
}

/** Fly one shot at 60 Hz with full trace, paths and events (Missile Lab). */
export function simulateShot(setup: ShotSetup): ShotResult {
  const out: ShotResult = {
    hit: false, reason: '', timeOfFlight: 0, trace: [], missilePath: [], targetPath: [], impactMach: null,
    missDistance: Infinity, shooterPath: [], pitbull: null, events: [],
  };
  const r = runShot(setup, { dt: SIM_DT, sample: true, requireIrLock: true }, out);
  out.hit = r.hit;
  out.reason = r.reason;
  out.timeOfFlight = r.tof;
  out.impactMach = r.impactMach;
  out.missDistance = r.hit ? Math.min(r.missDistance, missileModel(setup.missile).hitRadiusM) : r.missDistance;
  return out;
}

/** Kinematic hit/miss for DLZ searches (no trace, no IR acquisition gate). */
export function shotHits(setup: ShotSetup, dt = SIM_DT): { hit: boolean; tof: number; reason: string } {
  const r = runShot(setup, { dt, sample: false });
  return { hit: r.hit, tof: r.tof, reason: r.reason };
}

export interface FindRangeOptions {
  /** Integration step (s). Default 1/60; the table generator uses a coarser step. */
  dt?: number;
  /** Relative tolerance of the answer. Default 0.01. */
  tol?: number;
  /** Starting guess (m). Default: from the current DLZ. */
  guess?: number;
}

/**
 * Longest launch range (m) that still hits for these conditions, and the time of flight there.
 * kind 'rmax': the target keeps flying straight. kind 'rne': it turns cold at launch (after reactAfter).
 * Returns range 0 when nothing hits.
 */
export function findRange(
  base: Omit<ShotSetup, 'range' | 'maneuver'>, kind: 'rmax' | 'rne', opts: FindRangeOptions = {},
): { range: number; tof: number } {
  const dt = opts.dt ?? SIM_DT;
  const tol = opts.tol ?? 0.01;
  const setup: ShotSetup = { ...base, range: 0, maneuver: kind === 'rmax' ? 'none' : 'turn-cold' };
  const at = (r: number) => { setup.range = r; return shotHits(setup, dt); };
  const model = missileModel(base.missile);
  // never closer than the altitude gap allows (a target straight overhead is not a launch geometry)
  const floor = Math.max(model.rminM * 1.3, 800, 1.2 * Math.abs(base.targetAlt - base.shooterAlt));
  let guess = opts.guess ?? fallbackGuess(base, kind);
  guess = Math.max(guess, floor * 1.5);
  let lo = 0, hi = 0, loTof = 0;
  // bracket
  const g = at(guess);
  if (g.hit) {
    lo = guess; loTof = g.tof;
    hi = guess * 1.3;
    for (let i = 0; i < 12; i++) {
      const h = at(hi);
      if (!h.hit) break;
      lo = hi; loTof = h.tof; hi *= 1.4;
      if (hi > 600000) return { range: lo, tof: loTof };
    }
  } else {
    hi = guess;
    let probe = guess * 0.7;
    for (let i = 0; i < 16 && probe >= floor * 0.99; i++) {
      const p = at(probe);
      if (p.hit) { lo = probe; loTof = p.tof; break; }
      hi = probe; probe *= 0.7;
    }
    if (!lo) {
      // hit/miss is not always monotone close in (steep or crossing geometry): scan before giving up
      const top = Math.min(hi, guess);
      for (let i = 0; i <= 8 && !lo; i++) {
        const r = floor + (top - floor) * (i / 8);
        const p = at(r);
        if (p.hit) { lo = r; loTof = p.tof; hi = i < 8 ? floor + (top - floor) * ((i + 1) / 8) : top; }
      }
      if (!lo) return { range: 0, tof: 0 };
      // walk up past the scan step while it keeps hitting
      while (hi - lo > Math.max(60, tol * lo)) {
        const mid = (lo + hi) / 2;
        const r = at(mid);
        if (r.hit) { lo = mid; loTof = r.tof; } else hi = mid;
      }
      return { range: lo, tof: loTof };
    }
  }
  while (hi - lo > Math.max(60, tol * lo)) {
    const mid = (lo + hi) / 2;
    const r = at(mid);
    if (r.hit) { lo = mid; loTof = r.tof; } else hi = mid;
  }
  return { range: lo, tof: loTof };
}

function fallbackGuess(base: Omit<ShotSetup, 'range' | 'maneuver'>, kind: 'rmax' | 'rne'): number {
  const f = fallbackRanges(base.missile, base.shooterAlt, (base.shooterAlt + base.targetAlt) / 2, base.aspectDeg);
  return kind === 'rmax' ? f.rmax : f.rne;
}

/** Rough ranges straight from the data's reference numbers (used when no table exists, and as search guesses). */
function fallbackRanges(missile: MissileId, shooterAlt: number, meanAlt: number, aspectDeg: number): { rmax: number; rne: number } {
  const ref = MISSILES[missile].ref;
  const sHi = sigma(REF_HIGH_ALT), sLo = sigma(REF_LOW_ALT), s = sigma(clamp(meanAlt, 0, 20000));
  const k = (sLo - s) / (sLo - sHi);
  const headOn = Math.max(0.5 * ref.lowHeadOnKm, ref.lowHeadOnKm + (ref.highHeadOnKm - ref.lowHeadOnKm) * k) * 1000;
  const coldRatio = ref.highColdKm / ref.highHeadOnKm;
  const w = (1 - Math.cos(aspectDeg * D2R)) / 2;
  return { rmax: headOn * (1 + (coldRatio - 1) * w), rne: headOn * coldRatio * 0.85 };
}

// ---- table lookup ---------------------------------------------------------------------------------------

const _idx = [0, 0, 0, 0];
const _w = [0, 0, 0, 0];

/** Index and weight of x on a sorted axis (clamped), written into _idx[d] / _w[d]. */
function axisPos(d: number, axis: number[], x: number): void {
  const n = axis.length;
  if (n === 1 || x <= axis[0]) { _idx[d] = 0; _w[d] = 0; return; }
  if (x >= axis[n - 1]) { _idx[d] = n - 2; _w[d] = 1; return; }
  let i = 0;
  while (i < n - 2 && x > axis[i + 1]) i++;
  _idx[d] = i;
  _w[d] = (x - axis[i]) / (axis[i + 1] - axis[i]);
}

const _dims = [0, 0, 0, 0];

/** 4-D multilinear interpolation of a flattened table field. */
function interp4(t: DlzTable, field: number[]): number {
  _dims[0] = t.alts.length; _dims[1] = t.machs.length; _dims[2] = t.aspects.length; _dims[3] = t.offsets.length;
  const dims = _dims;
  let sum = 0;
  for (let c = 0; c < 16; c++) {
    let w = 1, flat = 0;
    for (let d = 0; d < 4; d++) {
      const bit = (c >> d) & 1;
      const i = Math.min(_idx[d] + bit, dims[d] - 1);
      w *= bit ? _w[d] : 1 - _w[d];
      flat = flat * dims[d] + i;
    }
    if (w > 0) sum += w * field[flat];
  }
  return sum;
}

/** Rescale for data/missiles.ts ref values that changed after the tables were generated. */
function refDrift(missile: MissileId, t: DlzTable, meanAlt: number, aspectRad: number): number {
  const now = MISSILES[missile].ref, then = t.ref;
  if (now.highHeadOnKm === then.highHeadOnKm && now.highColdKm === then.highColdKm && now.lowHeadOnKm === then.lowHeadOnKm) return 1;
  const w = (1 - Math.cos(aspectRad)) / 2;
  const high = (now.highHeadOnKm / then.highHeadOnKm) * (1 - w) + (now.highColdKm / then.highColdKm) * w;
  const low = now.lowHeadOnKm / then.lowHeadOnKm;
  const sHi = sigma(REF_HIGH_ALT), sLo = sigma(REF_LOW_ALT);
  const k = clamp((sLo - sigma(clamp(meanAlt, 0, 20000))) / (sLo - sHi), 0, 1);
  return low + (high - low) * k;
}

/**
 * Launch zone (m) for `missile` from this shooter against this target, right now. Fast (table lookup).
 * Rmax: target keeps flying as it is. Rne: target turns cold at launch. Rmin: gameplay minimum.
 * Assumes the shooter supports the missile to the end (lock / datalink held).
 */
export function dlzFor(shooterPos: Vector3, shooterVel: Vector3, targetPos: Vector3, targetVel: Vector3, missile: MissileId): Dlz {
  const model = missileModel(missile);
  const alt = Math.max(0, shooterPos.y);
  const vS = shooterVel.length();
  const machS = machOf(vS, alt);
  const off = targetPos.y - shooterPos.y;
  const vT = targetVel.length();
  const aspect = vT > 1 ? aspectAngle(targetPos, targetVel, shooterPos) : Math.PI / 2;
  const aspectDeg = aspect * R2D;
  let rmax: number, rne: number;
  const t = DLZ_TABLES[missile];
  if (t) {
    axisPos(0, t.alts, alt);
    axisPos(1, t.machs, machS);
    axisPos(2, t.aspects, aspectDeg);
    axisPos(3, t.offsets, off);
    const tofMax = interp4(t, t.tofMax), tofNe = interp4(t, t.tofNe);
    rmax = interp4(t, t.rmaxKm) * 1000 + (vT - t.refTargetSpeed) * Math.cos(aspect) * tofMax;
    rne = interp4(t, t.rneKm) * 1000 - (vT - t.refTargetSpeed) * tofNe;
    const f = refDrift(missile, t, alt + off / 2, aspect);
    rmax *= f; rne *= f;
  } else {
    const fb = fallbackRanges(missile, alt, alt + off / 2, aspectDeg);
    rmax = fb.rmax; rne = fb.rne;
  }
  // Nose off the target: the missile spends energy turning (a crank shot is shorter).
  const lx = targetPos.x - shooterPos.x, ly = targetPos.y - shooterPos.y, lz = targetPos.z - shooterPos.z;
  const l = Math.hypot(lx, ly, lz) || 1;
  const cosOff = vS > 1 ? clamp((shooterVel.x * lx + shooterVel.y * ly + shooterVel.z * lz) / (vS * l), -1, 1) : 1;
  const pen = 1 - 0.3 * (1 - cosOff) / 2;
  rmax *= pen; rne *= pen;
  const rmin = model.rminM * (1 + 0.6 * aspectDeg / 180);
  rmax = Math.max(rmax, rmin);
  rne = clamp(rne, rmin, rmax);
  return { rmax, rne, rmin, rpi: rmax, rtr: rne };
}

/** Grid used by the table generator (radar missiles fine, IR coarse). Includes ED's 1 / 5 / 10 km reference altitudes. */
export const DLZ_GRID = {
  radar: {
    alts: [500, 1000, 3000, 5000, 7500, 10000, 12500, 15000],
    machs: [0.5, 0.8, 1.1, 1.5],
    aspects: [0, 45, 90, 135, 180],
    offsets: [-6000, -3000, 0, 3000, 6000],
  },
  ir: {
    alts: [500, 3000, 6000, 10000, 15000],
    machs: [0.6, 1.2],
    aspects: [0, 90, 180],
    offsets: [-3000, 0, 3000],
  },
  refTargetSpeed: REF_SPEED,
};

/** The target altitude used for a grid cell (kept inside the flyable band). */
export function gridTargetAlt(shooterAlt: number, offset: number): number {
  return clamp(shooterAlt + offset, 300, 20000);
}
