/**
 * [OWNER: sim] What the pilot sees and hears in the groove (issue #26): the optical landing aid (IFLOLS ball
 * or Luna-3 colour) and the LSO calls, as a rule table built on the Supercarrier guide thresholds.
 * Gameplay rules only (AGENTS.md rule 1). Deterministic; call timing lives in a WeakMap per state.
 *
 * Ball: cell = round(glide error / BALL_CELL_DEG), clamped to ±5 (+ = high). Cells at or below IFLOLS_RED_CELL
 * are the red low cells. Luna-3 (Kuznetsov): green inside ±LUNA_ON_DEG, yellow high, red low.
 * Waveoff lights follow the LSO waveoff; cut lights flash briefly with "Roger ball" and "Power" (IFLOLS only).
 *
 * LSO (ships with `lso.value` only), active in the groove once the ball is called or inside the ball range:
 * - Glide: low beyond 1.5° → "Power"; high beyond 2.5° → "You're high" (wording not verified).
 * - Lineup: left of centreline beyond 1.7° → "Right for lineup"; right beyond 1.7° → "Come left".
 * - Far off (2.7° low, 4.9° high, 2.9° lineup) or gear not down inside WAVEOFF_RANGE_NM → "Wave off" (sets
 *   `lso.waveoff`, once per pass).
 * - Technique (after the ball call, outside AT_RAMP_M): pitch rate above 5°/s → "Easy with the nose"; bank above 20° → "Easy with
 *   your wings"; throttle change above 30 %/s → "Easy with it".
 * - Hysteresis: a call fires when its metric passes the threshold, re-arms once the metric is back below
 *   REARM_FRACTION of it, and repeats after LSO_REPEAT_S while it stays beyond. At most one call every
 *   LSO_MIN_INTERVAL_S. "Roger ball" answers the ball call; "Bolter, bolter, bolter" on a bolter.
 */
import { M_PER_NM, R2D, clamp } from '../math';
import { carrierGeometry, shipData, type CarrierGeometry } from './carrier';
import type { BallState, FlightOpsJetData, FlightOpsState, LsoCall } from './types';

/** Supercarrier guide thresholds, degrees, %/s, °/s. */
export const LSO_THRESHOLDS = {
  lineupDeg: 1.7, lineupFarDeg: 2.9,
  lowDeg: 1.5, highDeg: 2.5, lowFarDeg: 2.7, highFarDeg: 4.9,
  pitchRateDegS: 5, bankDeg: 20, throttlePctS: 30,
} as const;
export const LSO_CALLS = {
  rogerBall: 'Roger ball', power: 'Power', high: "You're high", right: 'Right for lineup', left: 'Come left',
  waveoff: 'Wave off', bolter: 'Bolter, bolter, bolter', nose: 'Easy with the nose', wings: 'Easy with your wings',
  it: 'Easy with it',
} as const;
type CallKey = Exclude<keyof typeof LSO_CALLS, 'rogerBall' | 'waveoff' | 'bolter'>;

export const BALL_CELL_DEG = 0.3;
export const BALL_CELLS = 5;
export const IFLOLS_RED_CELL = -4;
export const LUNA_ON_DEG = 0.5;
export const LSO_MIN_INTERVAL_S = 2;
export const LSO_REPEAT_S = 4;
export const REARM_FRACTION = 0.8;
export const WAVEOFF_RANGE_NM = 0.35;
/** No technique calls this close to the ramp (power goes on at touchdown). */
export const AT_RAMP_M = 150;
const CUT_LIGHT_S = 1;

interface Memory {
  lastT: number;
  armed: Record<CallKey, boolean>;
  firedT: Partial<Record<CallKey, number>>;
  prevPitch: number | null;
  prevThrottle: number | null;
  rogered: boolean;
  boltered: boolean;
  cutUntil: number;
}
const memory = new WeakMap<FlightOpsState, Memory>();

function mem(s: FlightOpsState): Memory {
  let m = memory.get(s);
  if (!m) {
    m = {
      lastT: -Infinity, armed: { power: true, high: true, right: true, left: true, nose: true, wings: true, it: true },
      firedT: {}, prevPitch: null, prevThrottle: null, rogered: false, boltered: false, cutUntil: -Infinity,
    };
    memory.set(s, m);
  }
  return m;
}

/** Ball picture from the glide and lineup errors. */
export function ballFrom(glideDevDeg: number, lineupDevDeg: number, lights: 'iflols' | 'luna3', waveoff: boolean, cut: boolean): BallState {
  const cell = clamp(Math.round(glideDevDeg / BALL_CELL_DEG), -BALL_CELLS, BALL_CELLS);
  const luna = lights === 'luna3' ? (Math.abs(glideDevDeg) <= LUNA_ON_DEG ? 'green' : glideDevDeg > 0 ? 'yellow' : 'red') : null;
  const iflols = lights === 'iflols';
  return { glideDevDeg, lineupDevDeg, cell, luna, waveoffLights: iflols && waveoff, cutLights: iflols && cut };
}

/** Whether the jet's ball call is due (inside the ball range, in the groove). */
export function ballInRange(s: FlightOpsState, d: FlightOpsJetData, g: CarrierGeometry = carrierGeometry(s)): boolean {
  return g.inGroove && g.rangeM <= (d.carrier?.pattern.ballNm.value ?? 0.75) * M_PER_NM;
}

/** Update `s.lso` (ball and calls) for this step. Called by stepFlightOps for carrier states. */
export function updateLso(s: FlightOpsState, d: FlightOpsJetData, dt: number): void {
  const lso = s.lso;
  if (!lso || !s.ship) return;
  const ship = shipData(s);
  const m = mem(s);
  const g = carrierGeometry(s);
  const pitchRate = m.prevPitch === null || dt <= 0 ? 0 : Math.abs(s.pitch - m.prevPitch) / dt * R2D;
  const thrRate = m.prevThrottle === null || dt <= 0 ? 0 : Math.abs(s.throttle - m.prevThrottle) / dt * 100;
  m.prevPitch = s.pitch; m.prevThrottle = s.throttle;

  const talk = ship.lso.value;
  const say = (text: string, kind: LsoCall['kind']) => { lso.calls.push({ t: s.t, text, kind }); m.lastT = s.t; };

  if (s.trap?.bolter && !m.boltered) {
    m.boltered = true;
    if (talk) say(LSO_CALLS.bolter, 'bolter');
  }
  lso.ball = g.inGroove ? ballFrom(g.glideErrDeg, g.lineupErrDeg, ship.lights, lso.waveoff, s.t < m.cutUntil) : null;
  if (!talk || !g.inGroove) return;

  if (lso.ballCalled && !m.rogered) {
    m.rogered = true;
    say(LSO_CALLS.rogerBall, 'info');
    m.cutUntil = s.t + CUT_LIGHT_S;
    return;
  }
  const active = lso.ballCalled || ballInRange(s, d, g);
  if (!active || lso.waveoff) return;

  const T = LSO_THRESHOLDS;
  const low = -g.glideErrDeg, high = g.glideErrDeg;
  const gearDown = s.gearPos > 0.95;
  if (g.rangeM <= WAVEOFF_RANGE_NM * M_PER_NM && (low > T.lowFarDeg || high > T.highFarDeg
    || Math.abs(g.lineupErrDeg) > T.lineupFarDeg || !gearDown)) {
    lso.waveoff = true;
    say(LSO_CALLS.waveoff, 'waveoff');
    if (lso.ball) lso.ball.waveoffLights = ship.lights === 'iflols';
    return;
  }

  // Technique calls follow the ball call, and stop at the ramp (power goes on at touchdown).
  const close = g.rangeM <= AT_RAMP_M || !lso.ballCalled;
  const metrics: Record<CallKey, [number, number]> = {
    power: [low, T.lowDeg],
    high: [high, T.highDeg],
    right: [-g.lineupErrDeg, T.lineupDeg],
    left: [g.lineupErrDeg, T.lineupDeg],
    nose: [close ? 0 : pitchRate, T.pitchRateDegS],
    wings: [close ? 0 : Math.abs(s.bank) * R2D, T.bankDeg],
    it: [close ? 0 : thrRate, T.throttlePctS],
  };
  const order: CallKey[] = ['power', 'high', 'right', 'left', 'nose', 'wings', 'it'];
  for (const k of order) {
    const [v, th] = metrics[k];
    if (v < REARM_FRACTION * th) m.armed[k] = true;
  }
  if (s.t - m.lastT < LSO_MIN_INTERVAL_S) return;
  for (const k of order) {
    const [v, th] = metrics[k];
    if (v <= th) continue;
    const repeat = s.t - (m.firedT[k] ?? -Infinity) >= LSO_REPEAT_S;
    if (!m.armed[k] && !repeat) continue;
    m.armed[k] = false;
    m.firedT[k] = s.t;
    say(LSO_CALLS[k], 'correction');
    if (k === 'power') m.cutUntil = s.t + CUT_LIGHT_S;
    return;
  }
}
