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
 * Updates pos, vel, heading, pitch (= flight-path angle), roll (visual bank) and g. No allocations per tick.
 */
import type { World } from './world';
import type { Aircraft } from './types';
import type { AircraftId } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
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
  c = {
    maxG, cornerEas, maxMach: perf.maxMach,
    ceiling: Math.max(8000, perf.ceilingFt * M_PER_FT),
    K, Ci, qMax: 0.5 * RHO0 * vEasMax * vEasMax,
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
  gamma = clamp(gamma + gammaDot * dt, -MAX_DIVE - 0.1, MAX_CLIMB_AB + 0.1);
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
