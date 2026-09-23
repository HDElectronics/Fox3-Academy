/**
 * [OWNER: page-flight-ops] Pure helpers for the pattern and landing page: supported jets, indexer lamps,
 * planned gate positions for the 3D overlay, trail error levels and the lesson step completion.
 * No DOM here, so it is unit tested (flightOps.page.test.ts).
 */
import type { AircraftId } from '../../data/types';
import { FLIGHT_OPS } from '../../data/flightOps';
import type { Units } from '../../app/format';
import { M_PER_FT, M_PER_NM, MPS_PER_KT, R2D, clamp, wrapPi } from '../../sim/math';
import {
  NAV_AUTO_SWITCH_M, aimPointM, finalTurnGeometry, type AoaCue, type ApproachGeometry, type FlightOpsJetData, type FlightOpsJetId,
  type FlightOpsState, type GateId, type GateResult, type IndexerColor, type NavState,
} from '../../sim/flightOps';

/** Every jet with flight-ops data (all ten). */
export const FLIGHT_OPS_JETS: readonly FlightOpsJetId[] = Object.keys(FLIGHT_OPS) as FlightOpsJetId[];

export function isFlightOpsJet(id: AircraftId | string | null | undefined): id is FlightOpsJetId {
  return !!id && Object.prototype.hasOwnProperty.call(FLIGHT_OPS, id);
}

/**
 * Jets without a flap selector in the cockpit whose data still carries a landing flap (M-2000C: no flap
 * control, no flap parts on the model). The page lowers that flap with the gear so grading works, and shows
 * the flaps as n/a.
 */
export const NO_FLAP_SELECTOR: readonly FlightOpsJetId[] = ['m2000c'];
export type FlapControl = 'selector' | 'with-gear' | 'none';
export function flapControl(d: FlightOpsJetData): FlapControl {
  return d.flapsWithGear ? 'with-gear' : NO_FLAP_SELECTOR.includes(d.id) ? 'none' : 'selector';
}

/** Scoring tolerances the lesson teaches (from the evaluator): corridor half-angles for the 3D view. */
export const GLIDE_TOL_DEG = 0.7;
export const LINEUP_TOL_DEG = 1.0;

// ------------------------------------------------------------------ AoA indexer

export type LampPos = 'top' | 'mid' | 'bottom';
export interface IndexerLamp {
  pos: LampPos;
  /** What the lamp means: top = slow (high AoA), middle = on speed, bottom = fast. */
  cue: AoaCue;
  /** Manual colour; null = the manual does not give it (drawn neutral grey). */
  color: IndexerColor;
  lit: boolean;
}

/** Three indexer lamps, top to bottom, for the current cue. Only the lamp for the cue is lit. */
export function indexerLamps(d: FlightOpsJetData, cue: AoaCue | null): IndexerLamp[] {
  const c = d.aoa.colors;
  return [
    { pos: 'top', cue: 'slow', color: c.slow, lit: cue === 'slow' },
    { pos: 'mid', cue: 'on', color: c.on, lit: cue === 'on' },
    { pos: 'bottom', cue: 'fast', color: c.fast, lit: cue === 'fast' },
  ];
}

/** Token name for a lamp colour (tokens.css has no separate yellow: caution covers yellow and amber). */
export function lampToken(color: IndexerColor): 'ok' | 'caution' | 'warning' | 'neutral' {
  return color === 'green' ? 'ok' : color === 'yellow' || color === 'amber' ? 'caution' : color === 'red' ? 'warning' : 'neutral';
}

// ------------------------------------------------------------------ planned gates

export interface PlannedGate {
  id: GateId;
  label: string;
  /** Runway frame, metres. */
  pos: { x: number; y: number; z: number };
  headingRad: number;
  radiusM: number;
}

/** Where each gate sits in the demo pattern (for the 3D rings and the top-down trace). */
export function plannedGates(d: FlightOpsJetData): PlannedGate[] {
  const aim = aimPointM(d);
  const initY = d.pattern.initialAltFt.value * M_PER_FT;
  const dwY = d.pattern.downwindAltFt.value * M_PER_FT;
  const breakZ = -d.pattern.initialKt.value * MPS_PER_KT * 7;
  const turn = finalTurnGeometry(d);
  const glide = Math.tan(d.glideDeg.value * Math.PI / 180);
  const groove = M_PER_NM;
  return [
    { id: 'initial', label: 'Initial', pos: { x: 0, y: initY, z: 0 }, headingRad: 0, radiusM: 90 },
    { id: 'break', label: 'Break', pos: { x: 0, y: initY, z: breakZ }, headingRad: 0, radiusM: 90 },
    { id: 'abeam', label: 'Abeam', pos: { x: -d.pattern.abeamNm.value * M_PER_NM, y: dwY, z: -aim }, headingRad: Math.PI, radiusM: 80 },
    { id: 'ninety', label: 'Ninety', pos: { x: turn.cx, y: Math.max(dwY * 0.7, 60), z: turn.cz + turn.r }, headingRad: Math.PI / 2, radiusM: 70 },
    { id: 'groove', label: 'Groove', pos: { x: 0, y: groove * glide, z: groove - aim }, headingRad: 0, radiusM: 45 },
    { id: 'touchdown', label: 'Touchdown', pos: { x: 0, y: 4, z: -aim }, headingRad: 0, radiusM: 25 },
  ];
}

/** Gates shown for a start: the return to base joins on a straight-in final (groove and touchdown only). */
export function gatesForStart(plan: readonly PlannedGate[], rtb: boolean): PlannedGate[] {
  return rtb ? plan.filter(g => g.id === 'groove' || g.id === 'touchdown') : [...plan];
}

/** A flown track point (runway frame, metres) with its sim time. */
export interface FlownPoint { t: number; x: number; y: number; z: number; heading: number }

/** Flown point nearest in time to `t` (track sorted by time), or null for an empty track. */
export function pointAt(track: readonly FlownPoint[], t: number): FlownPoint | null {
  if (!track.length) return null;
  let lo = 0, hi = track.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (track[mid]!.t <= t) lo = mid; else hi = mid; }
  return Math.abs(track[lo]!.t - t) <= Math.abs(track[hi]!.t - t) ? track[lo]! : track[hi]!;
}

export interface PlacedGate extends PlannedGate { state: 'pending' | 'ok' | 'miss'; flown: boolean }

/**
 * Gate rings for the 3D view and the trace: a reached gate sits where the jet actually passed it (the flown
 * point at the result's time), coloured ok / miss; a pending gate keeps its planned geometry.
 */
export function placeGates(plan: readonly PlannedGate[], results: readonly GateResult[], track: readonly FlownPoint[]): PlacedGate[] {
  return plan.map(g => {
    const state = gateState(g.id, results);
    const ids: GateId[] = g.id === 'abeam' ? ['downwind', 'abeam'] : [g.id];
    const hit = results.filter(r => ids.includes(r.id)).sort((a, b) => b.passedAt - a.passedAt)[0];
    const p = hit ? pointAt(track, hit.passedAt) : null;
    if (state === 'pending' || !p || Math.abs(p.t - hit!.passedAt) > 1) return { ...g, state, flown: false };
    return { ...g, pos: { x: p.x, y: Math.max(g.id === 'touchdown' ? 4 : 0, p.y), z: p.z }, headingRad: p.heading, state, flown: true };
  });
}

/** Gate state from the evaluator's results. The downwind result shares the abeam ring. */
export function gateState(id: GateId, results: readonly GateResult[]): 'pending' | 'ok' | 'miss' {
  const ids: GateId[] = id === 'abeam' ? ['downwind', 'abeam'] : [id];
  const hit = results.filter(r => ids.includes(r.id));
  if (!hit.length) return 'pending';
  return hit.every(r => r.ok) ? 'ok' : 'miss';
}

// ------------------------------------------------------------------ trail colour

/** 0 ok, 1 caution, 2 warning. On final: glide and lineup error against the scoring tolerance. */
export function errLevel(g: ApproachGeometry, s: FlightOpsState, cue: AoaCue): 0 | 1 | 2 {
  if (g.onFinal && s.gearDown) {
    const k = Math.max(Math.abs(g.glideErrDeg) / GLIDE_TOL_DEG, Math.abs(g.lineupErrDeg) / (LINEUP_TOL_DEG * 1.5));
    return k < 1 ? 0 : k < 2 ? 1 : 2;
  }
  return s.gearDown && s.phase === 'air' && cue !== 'on' ? 1 : 0;
}

// ------------------------------------------------------------------ lesson steps

export type StepId = 'navmode' | 'steer' | 'glidepath' | 'initial' | 'break' | 'configure' | 'abeam' | 'onspeed' | 'groove' | 'touchdown';
export const STEP_ORDER: readonly StepId[] = ['initial', 'break', 'configure', 'abeam', 'onspeed', 'groove', 'touchdown'];
/** Return-to-base lesson (nav jets, 'rtb' start): nav steps, then configure and the final. */
export const NAV_STEP_ORDER: readonly StepId[] = ['navmode', 'steer', 'glidepath', 'configure', 'onspeed', 'groove', 'touchdown'];
export const stepOrder = (rtb: boolean): readonly StepId[] => (rtb ? NAV_STEP_ORDER : STEP_ORDER);

export interface LessonSnapshot {
  gates: readonly GateResult[];
  /** Gear down and landing flaps, with the speed at or below the gear limit. */
  configured: boolean;
  /** Seconds in a row on-speed with the gear down. */
  onSpeedRunS: number;
  /** Return to base only: latched nav milestones. */
  nav?: NavMilestones;
}

export interface NavMilestones {
  /** The steering mode is selected: ВЗВ (return) on Russian jets, NAV on the IAF without a return mode. */
  steering: boolean;
  /** Reached the intercept point (inside the auto-switch distance) or in landing mode. */
  intercept: boolean;
  /** Seconds in a row in landing mode with the glide-path error inside the tolerance. */
  onGlideRunS: number;
}

/** Nav milestones for this step (not latched; the page latches them). */
export function navMilestones(nav: NavState | undefined, d: FlightOpsJetData, prevGlideRunS: number, dt: number): NavMilestones {
  if (!nav || !d.nav) return { steering: false, intercept: false, onGlideRunS: 0 };
  const hasReturn = d.nav.modes.some(m => m.id === 'return');
  const atIcpt = Math.abs(nav.target.x) < 1 && Math.abs(nav.target.z - d.nav.interceptPointM.value) < 1;
  const landing = nav.mode === 'landing';
  const steering = landing || (hasReturn ? nav.mode === 'return' : atIcpt);
  const intercept = landing || (atIcpt && nav.distM < NAV_AUTO_SWITCH_M);
  const onGlide = landing && nav.glideDevDeg !== null && Math.abs(nav.glideDevDeg) <= GLIDE_TOL_DEG;
  return { steering, intercept, onGlideRunS: onGlide ? prevGlideRunS + dt : 0 };
}

/** Steps done so far. Gates count once reached (a start on final skips the pattern steps). */
export function stepsDone(snap: LessonSnapshot): Set<StepId> {
  const done = new Set<StepId>();
  const passed = (id: GateId) => snap.gates.some(g => g.id === id);
  const ok = (id: GateId) => snap.gates.some(g => g.id === id && g.ok);
  if (snap.nav?.steering) done.add('navmode');
  if (snap.nav?.intercept) done.add('steer');
  if (snap.nav && snap.nav.onGlideRunS >= 3) done.add('glidepath');
  if (passed('initial')) done.add('initial');
  if (passed('break')) done.add('break');
  if (snap.configured) done.add('configure');
  if (passed('abeam')) done.add('abeam');
  if (snap.onSpeedRunS >= 3) done.add('onspeed');
  if (passed('groove')) done.add('groove');
  if (ok('touchdown')) done.add('touchdown');
  return done;
}

/** First step not done, in order, or null when all are done. */
export function currentStep(done: ReadonlySet<StepId>, order: readonly StepId[] = STEP_ORDER): StepId | null {
  return order.find(id => !done.has(id)) ?? null;
}

/** Progress threshold: a scored landing at or above this marks the lesson done. */
export const PASS_SCORE = 70;
export const lessonPassed = (total: number | null) => total !== null && total >= PASS_SCORE;

// ------------------------------------------------------------------ formatting

export const kt = (ms: number) => Math.round(ms / MPS_PER_KT);
export const ftOf = (m: number) => Math.round(m / M_PER_FT);
/** Pattern numbers from the data (feet, knots) in the app's units. */
export const altFtText = (ft: number, u: Units) => (u === 'metric' ? `${Math.round((ft * M_PER_FT) / 10) * 10} m` : `${ft} ft`);
export const ktText = (k: number, u: Units) => (u === 'metric' ? `${Math.round((k * MPS_PER_KT * 3.6) / 10) * 10} km/h` : `${k} kt`);
export const spdVal = (ms: number, u: Units) => (u === 'metric' ? Math.round(ms * 3.6) : kt(ms));
export const altVal = (m: number, u: Units) => (u === 'metric' ? Math.round(m) : ftOf(m));
export const spdUnit = (u: Units) => (u === 'metric' ? 'KM/H' : 'KT');
export const altUnit = (u: Units) => (u === 'metric' ? 'M' : 'FT');

// ------------------------------------------------------------------ nav display

/** Full-scale deflection of the deviation bars (display choices, not DCS numbers). */
export const GS_FULL_DEG = 1.4;
export const LOC_FULL_DEG = 2.5;

export interface NavPicture {
  mode: string;
  point: string;
  /** Bearing to the steer point relative to the nose, radians (+ right). */
  relBearing: number;
  /** Commanded steering heading minus the current heading, degrees (+ turn right). */
  steerErrDeg: number;
  dist: string;
  cmdAlt: string | null;
  landing: boolean;
  /** Bars: −1..1, where the path is from the jet. glideBar + = path above (fly up); locBar + = path right (fly right). */
  glideBar: number | null;
  locBar: number | null;
  call: string | null;
}

export function navPicture(nav: NavState, heading: number, u: Units): NavPicture {
  const dist = u === 'metric' ? `${(nav.distM / 1000).toFixed(nav.distM < 10000 ? 1 : 0)} km` : `${(nav.distM / M_PER_NM).toFixed(nav.distM < 18520 ? 1 : 0)} nm`;
  const cmdAlt = nav.commandAltM === null ? null : u === 'metric' ? `${Math.round(nav.commandAltM / 10) * 10} m` : `${Math.round(nav.commandAltM / M_PER_FT / 10) * 10} ft`;
  return {
    mode: nav.label,
    point: nav.target.name,
    relBearing: wrapPi(nav.bearing - heading),
    steerErrDeg: wrapPi(nav.steerHeading - heading) * R2D,
    dist, cmdAlt,
    landing: nav.mode === 'landing',
    glideBar: nav.glideDevDeg === null ? null : clamp(-nav.glideDevDeg / GS_FULL_DEG, -1, 1),
    locBar: nav.locDevDeg === null ? null : clamp(-nav.locDevDeg / LOC_FULL_DEG, -1, 1),
    call: nav.call,
  };
}

export const aoaText = (d: FlightOpsJetData, v: number) => d.aoa.unit === 'deg' ? `${v.toFixed(1)}°` : `${v.toFixed(1)} units`;
