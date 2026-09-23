/**
 * [OWNER: sim-physics] Tactical autopilot for every jet (players, AI and scripts fly through ac.cmd).
 * A point-mass "energy feel" model, not a flight model:
 * - Heading: banks toward cmd.heading the short way, with a roll-rate cap; the turn rate comes from the
 *   load factor, capped by cmd.maxG, the jet's perf.maxG, and less available below corner speed
 *   (lift falls with dynamic pressure, so high and slow jets turn poorly).
 * - Altitude: holds cmd.altitude with a limited climb angle (steeper with afterburner) and steeper
 *   allowed descents (players dive to the notch). Never below groundAlt + 150 m, never above the ceiling.
 * - Speed: autothrottle toward cmd.speed. Afterburner accelerates hard; military power tops out around
 *   Mach 1; hard turns and climbs bleed speed; thin air lets the jet go faster, so perf.maxMach is only
 *   reachable high with afterburner. Each jet's drag is set so that it tops out at perf.maxMach at 11 km.
 * - BFM mode (cmd.bfm set): rolls the lift vector to cmd.bfm.bank and pulls cmd.bfm.g in 3D, no climb or dive
 *   clamp, so loops and yo-yos fly. Same lift limit below corner, same g caps; induced drag is set per tick so
 *   that full afterburner holds speed exactly at the jet's sustained g (data/wvr.ts TURN_PERF, not verified).
 * Updates pos, vel, heading, pitch (= flight-path angle), roll (visual bank) and g. No allocations per tick.
 */
import type { World } from './world';
import type { Aircraft } from './types';
import type { AircraftId } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
import { sustainedG, turnPerfFor, type TurnPerf } from '../data/wvr';
import { Vector3 } from 'three';
import { D2R, G0, M_PER_FT, MPS_PER_KT, clamp, wrap2Pi, wrapPi } from './math';
import { sigma, soundSpeed } from './atmosphere';

const RHO0 = 1.225;
/** Static afterburner thrust as an acceleration at sea level (thrust-to-weight ≈ 1). */
const T0 = 10;
const MIL_FRACTION = 0.45;
const THRUST_LAPSE = 0.7;       // thrust ∝ σ^0.7
const RAM_AB = 0.5;             // afterburner thrust grows with Mach
const RAM_MIL = 0.2;
const IDLE_ACCEL = -1.5;        // idle + speed brake, m/s²
const ROLL_RATE = 150 * D2R;
const HEADING_GAIN = 1.0;       // rad/s of turn demanded per rad of heading error
const ALT_GAIN = 0.12;          // m/s of climb demanded per m of altitude error
const MAX_CLIMB_AB = 25 * D2R;
const MAX_CLIMB_MIL = 18 * D2R;
const MAX_DIVE = 45 * D2R;
const MAX_PITCH_RATE = 12 * D2R;
const FLOOR_AGL = 150;
const MIN_SPEED = 60;
export const MIN_ALT_AGL = FLOOR_AGL;

interface FlightConst {
  maxG: number;
  cornerEas: number;
  maxMach: number;
  ceiling: number;
  /** Parasitic drag: a = K · cd(M) · q. */
  K: number;
  /** Induced drag: a = Ci · n² / q. */
  Ci: number;
  /** Dynamic-pressure limit (Pa) above which drag climbs steeply (low-altitude speed limit). */
  qMax: number;
  /** Sustained-turn table for BFM mode (derived from maxG when the jet has none). */
  turn: TurnPerf;
}

const consts = new Map<AircraftId, FlightConst>();

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Drag rise through the sound barrier, easing off at high Mach. */
function cd(M: number): number {
  return 1 + 1.1 * smoothstep(0.85, 1.1, M) - 0.25 * smoothstep(1.2, 2.2, M);
}

function thrustAB(s: number, M: number): number {
  return T0 * Math.pow(s, THRUST_LAPSE) * (1 + RAM_AB * M);
}
function thrustMil(s: number, M: number): number {
  return MIL_FRACTION * T0 * Math.pow(s, THRUST_LAPSE) * (1 + RAM_MIL * M);
}

function constsFor(type: AircraftId): FlightConst {
  let c = consts.get(type);
  if (c) return c;
  const perf = AIRCRAFT[type].perf;
  const maxG = Math.max(2, perf.maxG);
  const cornerEas = Math.max(120, perf.cornerKts * MPS_PER_KT);
  const qc = 0.5 * RHO0 * cornerEas * cornerEas;
  // a max-g pull at corner speed costs about 1.8 g of deceleration
  const Ci = 1.8 * G0 * qc / (maxG * maxG);
  const hRef = 11000, sRef = sigma(hRef);
  const vMax = perf.maxMach * soundSpeed(hRef);
  const qRef = 0.5 * RHO0 * sRef * vMax * vMax;
  const K = Math.max(1e-6, (thrustAB(sRef, perf.maxMach) - Ci / qRef) / (cd(perf.maxMach) * qRef));
  const vEasMax = 340 * Math.min(1.15, 0.55 * perf.maxMach + 0.1);
  const turn = turnPerfFor(type) ?? {
    altFt: [5000, 20000], mach: [0.3, 0.9, 1.4],
    sustainedG: [[0.35 * maxG * 0.85, maxG * 0.85, 0.65 * maxG * 0.85], [0.35 * maxG * 0.58, maxG * 0.58, 0.65 * maxG * 0.58]],
    verified: false, note: 'Derived from perf.maxG.',
  } satisfies TurnPerf;
  c = {
    maxG, cornerEas, maxMach: perf.maxMach,
    ceiling: Math.max(8000, perf.ceilingFt * M_PER_FT),
    K, Ci, qMax: 0.5 * RHO0 * vEasMax * vEasMax, turn,
  };
  consts.set(type, c);
  return c;
}

/** Load factor the jet can pull right now (lift-limited below corner speed). */
export function availableG(ac: Aircraft): number {
  const c = constsFor(ac.type);
  const v = ac.vel.length();
  const vEas = v * Math.sqrt(sigma(Math.max(0, ac.pos.y)));
  const gLim = Math.max(1.05, Math.min(ac.cmd.maxG, c.maxG));
  return clamp(gLim * (vEas / c.cornerEas) ** 2, 1.05, gLim);
}

export function stepAircraft(world: World, ac: Aircraft, dt: number): void {
  if (!ac.alive || dt <= 0) return;
  const c = constsFor(ac.type);
  const cmd = ac.cmd;
  if (cmd.bfm) { stepBfm(world, ac, c, dt); return; }
  bfmLift.delete(ac);
  let v = Math.max(MIN_SPEED, ac.vel.length());
  let gamma = Math.asin(clamp(ac.vel.y / Math.max(v, 1e-6), -1, 1));
  const alt = Math.max(0, ac.pos.y);
  const s = sigma(alt);
  const a = soundSpeed(alt);
  const M = v / a;
  const q = Math.max(200, 0.5 * RHO0 * s * v * v);
  const vEas = v * Math.sqrt(s);
  const gLim = Math.max(1.05, Math.min(Number.isFinite(cmd.maxG) ? cmd.maxG : c.maxG, c.maxG));
  const gAvail = clamp(gLim * (vEas / c.cornerEas) ** 2, 1.05, gLim);

  // ---- vertical: altitude hold ------------------------------------------------------------------
  const floor = world.groundAlt + FLOOR_AGL;
  const altCmd = clamp(Number.isFinite(cmd.altitude) ? cmd.altitude : ac.pos.y, floor, c.ceiling);
  const err = altCmd - ac.pos.y;
  const climbScale = clamp((vEas - 90) / 60, 0, 1);
  const climbMax = (cmd.afterburner ? MAX_CLIMB_AB : MAX_CLIMB_MIL) * climbScale;
  const above = Math.max(0, ac.pos.y - floor);
  const groundLimit = -Math.atan2(above * 0.25, v);          // descent eases off near the floor
  const gammaCmd = clamp(Math.atan2(ALT_GAIN * err, v), Math.max(-MAX_DIVE, groundLimit), Math.max(0, climbMax));
  const pullUp = Math.min(MAX_PITCH_RATE, Math.max(0.2, gAvail - Math.cos(gamma)) * G0 / v);
  const pushDown = Math.min(MAX_PITCH_RATE, (0.6 * gAvail + Math.cos(gamma)) * G0 / v);
  const gammaDot = clamp(1.5 * (gammaCmd - gamma), -pushDown, pullUp);
  const nV = Math.cos(gamma) + v * gammaDot / G0;

  // ---- horizontal: bank toward the commanded heading, the short way -------------------------------
  let herr = wrapPi((Number.isFinite(cmd.heading) ? cmd.heading : ac.heading) - ac.heading);
  if (Math.abs(herr) > Math.PI - 0.03 && ac.roll !== 0 && Math.sign(ac.roll) !== Math.sign(herr)) herr = -herr;
  const nHMax = Math.sqrt(Math.max(0, gAvail * gAvail - nV * nV));
  const nHCmd = clamp(v * HEADING_GAIN * herr / G0, -nHMax, nHMax);
  const bankTarget = Math.abs(nHCmd) < 1e-4 && nV > 0 ? 0 : Math.atan2(nHCmd, nV);
  const dRoll = wrapPi(bankTarget - ac.roll);
  const maxRoll = ROLL_RATE * dt;
  ac.roll = wrapPi(ac.roll + clamp(dRoll, -maxRoll, maxRoll));
  // the turn builds up as the bank gets there
  const rollErr = Math.abs(wrapPi(bankTarget - ac.roll));
  const nH = nHCmd * clamp(1 - rollErr / 0.6, 0, 1);
  const omega = nH * G0 / v;
  const n = Math.hypot(nH, nV);

  // ---- speed: autothrottle and energy ---------------------------------------------------------------
  const drag = c.K * cd(M) * q + c.Ci * n * n / q + (q > c.qMax ? 40 * (q / c.qMax - 1) : 0);
  const grav = G0 * Math.sin(gamma);
  const tMax = cmd.afterburner ? thrustAB(s, M) : thrustMil(s, M);
  const want = Number.isFinite(cmd.speed) ? cmd.speed : v;
  const aReq = clamp(0.4 * (want - v), -6, 6);
  const thrust = clamp(aReq + drag + grav, IDLE_ACCEL, tMax);
  v = clamp(v + (thrust - drag - grav) * dt, MIN_SPEED, c.maxMach * a);

  // ---- integrate ----------------------------------------------------------------------------------------
  // (the wider bound only matters right after BFM mode left the jet steeper than the autopilot flies)
  gamma = clamp(gamma + gammaDot * dt, Math.min(-MAX_DIVE - 0.1, gamma), Math.max(MAX_CLIMB_AB + 0.1, gamma));
  ac.heading = wrap2Pi(ac.heading + omega * dt);
  const cg = Math.cos(gamma);
  ac.vel.set(Math.sin(ac.heading) * cg * v, Math.sin(gamma) * v, -Math.cos(ac.heading) * cg * v);
  ac.pos.addScaledVector(ac.vel, dt);
  if (ac.pos.y < floor) {
    ac.pos.y = floor;
    if (ac.vel.y < 0) { ac.vel.y = 0; gamma = 0; ac.vel.setLength(v); }
  }
  if (ac.pos.y > c.ceiling + 200 && ac.vel.y > 0) { ac.vel.y = 0; gamma = 0; ac.vel.setLength(v); }
  ac.pitch = gamma;
  ac.g = n;
}

// ---- BFM mode ------------------------------------------------------------------------------------------------

const IDLE_THRUST = 0.3;          // m/s², idle thrust as an acceleration
const SPEEDBRAKE_DRAG = 0.6;      // extra fraction of parasitic drag with the speed brake out
const VERTICAL = 0.9995;          // |u.y| above this: the horizon bank is undefined, the jet holds its roll
/** Lift direction (unit, perpendicular to the velocity) of each jet flying BFM. */
const bfmLift = new WeakMap<Aircraft, Vector3>();
const _u = new Vector3(), _l0 = new Vector3(), _r0 = new Vector3(), _a = new Vector3(), _tmp = new Vector3();

/** Horizon frame around unit velocity u: l0 = "lift up" at zero bank, r0 = right wing. False near the vertical. */
function horizonFrame(u: Vector3, l0: Vector3, r0: Vector3): boolean {
  const h = 1 - u.y * u.y;
  if (h < 1 - VERTICAL * VERTICAL) return false;
  const k = 1 / Math.sqrt(h);
  l0.set(-u.y * u.x * k, h * k, -u.y * u.z * k);
  r0.crossVectors(u, l0);
  return true;
}

/** Keep direction independent of the speed floor; a stopped jet resumes along its heading. */
function normalizeFlightDirection(u: Vector3, heading: number): Vector3 {
  if (u.lengthSq() < 1e-12) return u.set(Math.sin(heading), 0, -Math.cos(heading));
  return u.normalize();
}

/**
 * The jet's lift direction (unit vector, "top of the canopy") right now, for HUD and gun-sight geometry.
 * BFM mode: the flown lift vector. Autopilot: from the flight path and the visual bank.
 */
export function liftVector(ac: Aircraft, out = new Vector3()): Vector3 {
  const l = bfmLift.get(ac);
  if (l && ac.cmd.bfm) return out.copy(l);
  const u = _tmp.copy(ac.vel).normalize();
  if (!horizonFrame(u, _l0, _r0)) return out.set(0, 0, -1).projectOnPlane(u).normalize();
  return out.copy(_l0).multiplyScalar(Math.cos(ac.roll)).addScaledVector(_r0, Math.sin(ac.roll));
}

/** Sustained g at full afterburner for this jet at a Mach and altitude (m), from the data turn table. */
export function sustainedGAt(ac: Aircraft, mach: number, altM: number): number {
  return sustainedG(constsFor(ac.type).turn, mach, altM / M_PER_FT);
}

function stepBfm(world: World, ac: Aircraft, c: FlightConst, dt: number): void {
  const b = ac.cmd.bfm!;
  let v = Math.max(MIN_SPEED, ac.vel.length());
  const u = normalizeFlightDirection(_u.copy(ac.vel), ac.heading);
  const alt = Math.max(0, ac.pos.y);
  const s = sigma(alt);
  const a = soundSpeed(alt);
  const M = v / a;
  const q = Math.max(200, 0.5 * RHO0 * s * v * v);
  const vEas = v * Math.sqrt(s);
  const gLim = Math.max(1.05, Math.min(Number.isFinite(ac.cmd.maxG) ? ac.cmd.maxG : c.maxG, c.maxG));
  const gAvail = clamp(gLim * (vEas / c.cornerEas) ** 2, 1.05, gLim);

  // lift direction: continue from the last BFM tick, or start from the visual bank
  let lift = bfmLift.get(ac);
  if (!lift) { lift = liftVector(ac, new Vector3()); bfmLift.set(ac, lift); }
  lift.projectOnPlane(u);
  if (lift.lengthSq() < 1e-8) lift.set(0, 1, 0).projectOnPlane(u);
  lift.normalize();

  // roll toward the commanded bank (not near the vertical, where the bank is undefined)
  if (horizonFrame(u, _l0, _r0)) {
    const cur = Math.atan2(lift.dot(_r0), lift.dot(_l0));
    const bank = Number.isFinite(b.bank) ? b.bank : cur;
    const d = clamp(wrapPi(bank - cur), -ROLL_RATE * dt, ROLL_RATE * dt);
    lift.applyAxisAngle(u, d);    // about u, l0 turns toward r0 = u × l0: + bank = right
    ac.roll = wrapPi(cur + d);
  }

  const n = b.g === 'max' ? gAvail : clamp(Number.isFinite(b.g) ? b.g : 1, 0, gAvail);

  // speed: induced drag set so that full afterburner holds speed at the sustained g
  const tAb = thrustAB(s, M);
  const d0 = c.K * cd(M) * q + (q > c.qMax ? 40 * (q / c.qMax - 1) : 0);
  const ns = Math.max(1.05, sustainedG(c.turn, M, alt / M_PER_FT));
  const ci = Math.max(c.Ci * 0.2, (tAb - d0) * q / (ns * ns));
  const drag = d0 * (b.speedbrake ? 1 + SPEEDBRAKE_DRAG : 1) + ci * n * n / q;
  const thrust = b.throttle === 'ab' ? tAb : b.throttle === 'mil' ? thrustMil(s, M) : IDLE_THRUST;
  const vNew = clamp(v + (thrust - drag - G0 * u.y) * dt, MIN_SPEED, c.maxMach * a);

  // turn: lift plus the part of gravity across the flight path
  _a.copy(lift).multiplyScalar(n * G0);
  _a.y -= G0 * (1 - u.y * u.y);
  _a.x += G0 * u.y * u.x;
  _a.z += G0 * u.y * u.z;
  u.addScaledVector(_a, dt / v).normalize();
  lift.projectOnPlane(u).normalize();
  v = vNew;

  ac.vel.copy(u).multiplyScalar(v);
  ac.pos.addScaledVector(ac.vel, dt);
  const floor = world.groundAlt + FLOOR_AGL;
  if (ac.pos.y < floor) {
    ac.pos.y = floor;
    if (ac.vel.y < 0) { ac.vel.y = 0; normalizeFlightDirection(ac.vel, ac.heading).multiplyScalar(v); }
  }
  if (ac.pos.y > c.ceiling + 200 && ac.vel.y > 0) {
    ac.vel.y = 0; normalizeFlightDirection(ac.vel, ac.heading).multiplyScalar(v);
  }
  const hs = Math.hypot(ac.vel.x, ac.vel.z);
  if (hs > 1e-3) ac.heading = wrap2Pi(Math.atan2(ac.vel.x, -ac.vel.z));
  ac.pitch = Math.asin(clamp(ac.vel.y / v, -1, 1));
  ac.g = n;
}
