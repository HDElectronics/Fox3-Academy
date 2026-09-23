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
  NAV_AUTO_SWITCH_M, TAKEOFF_CLIMB_FT, aimPointM, finalTurnGeometry, noFlapControl, rotateAtKt, type AoaCue, type ApproachGeometry, type FlightOpsJetData, type FlightOpsJetId,
  type FlightOpsState, type GateId, type GateResult, type IndexerColor, type NavState,
  BALL_CELLS, IFLOLS_RED_CELL, aimPointU, ballInRange, hasCarrierStart, landingFrame,
  type BallState, type CarrierGradeMark, type CarrierScore,
} from '../../sim/flightOps';
import { SHIPS } from '../../data/ships';

/** Every jet with flight-ops data (all ten). */
export const FLIGHT_OPS_JETS: readonly FlightOpsJetId[] = Object.keys(FLIGHT_OPS) as FlightOpsJetId[];

export function isFlightOpsJet(id: AircraftId | string | null | undefined): id is FlightOpsJetId {
  return !!id && Object.prototype.hasOwnProperty.call(FLIGHT_OPS, id);
}

/**
 * How the pilot sets the flaps: a selector, with the gear handle (F-16C), or not at all (M-2000C,
 * `noFlapControl`: no flap lamp, keys, labels or grading).
 */
export type FlapControl = 'selector' | 'with-gear' | 'none';
export function flapControl(d: FlightOpsJetData): FlapControl {
  return noFlapControl(d) ? 'none' : d.flapsWithGear ? 'with-gear' : 'selector';
}

/** Landing configuration for the lesson: gear down and locked, landing flaps where the jet has flap control. */
export function landingConfigured(d: FlightOpsJetData, s: FlightOpsState): boolean {
  if (!s.gearDown || s.gearPos < 0.99) return false;
  return flapControl(d) === 'none' || s.flapIndex >= d.landingFlap;
}

/** OVERSPEED lamp title: the M-2000C has no flaps to overspeed. */
export function overspeedTitle(d: FlightOpsJetData, limit: string): string {
  return flapControl(d) === 'none' ? `Gear above ${limit}` : `Gear or landing flaps above ${limit}`;
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

/**
 * Gates shown for a start: the return to base joins on a straight-in final (groove and touchdown only);
 * the takeoff has no pattern rings.
 */
export function gatesForStart(plan: readonly PlannedGate[], kind: boolean | LessonKind): PlannedGate[] {
  if (kind === 'takeoff') return [];
  return kind === true || kind === 'rtb' ? plan.filter(g => g.id === 'groove' || g.id === 'touchdown') : [...plan];
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

export type StepId = 'navmode' | 'steer' | 'glidepath' | 'initial' | 'break' | 'configure' | 'abeam' | 'onspeed' | 'groove' | 'touchdown'
  | TakeoffItem | 'pitch' | 'ninety' | 'ball' | 'trap';
/** Carrier Case I lesson (#26): the pattern around the ship, then the ball and the trap. */
export const CARRIER_STEP_ORDER: readonly StepId[] = ['initial', 'break', 'configure', 'abeam', 'ninety', 'ball', 'onspeed', 'trap'];
/** Carrier start in the groove: the ball, the AoA and the trap. */
export const GROOVE_STEP_ORDER: readonly StepId[] = ['ball', 'onspeed', 'trap'];
export const STEP_ORDER: readonly StepId[] = ['initial', 'break', 'configure', 'abeam', 'onspeed', 'groove', 'touchdown'];
/** Return-to-base lesson (nav jets, 'rtb' start): nav steps, then configure and the final. */
export const NAV_STEP_ORDER: readonly StepId[] = ['navmode', 'steer', 'glidepath', 'configure', 'onspeed', 'groove', 'touchdown'];
/** Runway takeoff lesson (#24). 'flapsup' is dropped for jets without flap control. */
export const TAKEOFF_STEP_ORDER: readonly StepId[] = ['brakes', 'power', 'release', 'rotate', 'pitch', 'gearup', 'flapsup'];
/** Which lesson a start teaches. `true` / `false` are the older rtb flag. */
export type LessonKind = 'pattern' | 'rtb' | 'takeoff' | 'carrier' | 'groove';
export const isCarrierKind = (k: LessonKind | boolean) => k === 'carrier' || k === 'groove';
export function stepOrder(kind: LessonKind | boolean, d?: FlightOpsJetData): readonly StepId[] {
  const k: LessonKind = kind === true ? 'rtb' : kind === false ? 'pattern' : kind;
  if (k === 'carrier') return CARRIER_STEP_ORDER;
  if (k === 'groove') return GROOVE_STEP_ORDER;
  if (k === 'takeoff') return d && flapControl(d) === 'none' ? TAKEOFF_STEP_ORDER.filter(id => id !== 'flapsup') : TAKEOFF_STEP_ORDER;
  return k === 'rtb' ? NAV_STEP_ORDER : STEP_ORDER;
}

// ------------------------------------------------------------------ takeoff checklist strip

export type TakeoffItem = 'brakes' | 'power' | 'release' | 'rotate' | 'gearup' | 'flapsup';
export interface TakeoffCheck { id: TakeoffItem; label: string; state: 'done' | 'current' | 'pending' }

/** Strip items for the jet: BRAKES · POWER (MIL or AB) · RELEASE · ROTATE · GEAR UP · FLAPS (not on the M-2000C). */
export function takeoffItems(d: FlightOpsJetData): { id: TakeoffItem; label: string }[] {
  const fc = flapControl(d);
  const items: { id: TakeoffItem; label: string }[] = [
    { id: 'brakes', label: 'BRAKES' },
    { id: 'power', label: d.takeoff.afterburner.value ? 'POWER AB' : 'POWER MIL' },
    { id: 'release', label: 'RELEASE' },
    { id: 'rotate', label: 'ROTATE' },
    { id: 'gearup', label: 'GEAR UP' },
  ];
  if (fc !== 'none') items.push({ id: 'flapsup', label: fc === 'selector' ? `FLAPS ${d.flapLabels[0]}` : 'FLAPS (GEAR)' });
  return items;
}

/**
 * Items the state shows done this step (not latched: the page latches them). `brakesHeld` is the wheel-brake
 * input; the rest comes from `s.takeoff` records and the throttle.
 */
export function takeoffItemsNow(d: FlightOpsJetData, s: FlightOpsState, brakesHeld: boolean): Set<TakeoffItem> {
  const r = s.takeoff, done = new Set<TakeoffItem>();
  if (!r) return done;
  if (brakesHeld && s.phase === 'ready') done.add('brakes');
  const beforeLiftoff = r.liftoffT === undefined;
  if (beforeLiftoff && s.throttle >= 0.9 && (!d.takeoff.afterburner.value || s.afterburner)) done.add('power');
  if (r.brakeReleaseT !== undefined) done.add('release');
  if (r.rotateT !== undefined) done.add('rotate');
  if (r.gearUpT !== undefined) done.add('gearup');
  if (!beforeLiftoff && flapControl(d) !== 'none' && s.flapIndex === 0 && s.flapPos < 0.05) done.add('flapsup');
  return done;
}

/** Strip state: done items lit, the first open one current. */
export function takeoffChecklist(d: FlightOpsJetData, done: ReadonlySet<TakeoffItem>): TakeoffCheck[] {
  let cur = false;
  return takeoffItems(d).map(i => {
    if (done.has(i.id)) return { ...i, state: 'done' as const };
    if (!cur) { cur = true; return { ...i, state: 'current' as const }; }
    return { ...i, state: 'pending' as const };
  });
}

/** Takeoff HUD cues (Vr bug, pitch bracket) show from the brakes to the 1000 ft climb gate. */
export function showTakeoffCues(s: FlightOpsState): boolean {
  if (!s.takeoff) return false;
  return s.phase === 'ready' || s.phase === 'roll' || (s.phase === 'air' && s.pos.y < TAKEOFF_CLIMB_FT * M_PER_FT);
}

/** Vr and the pull speed in the display unit (kt or km/h), for the speed tape bugs. */
export function takeoffSpeeds(d: FlightOpsJetData, u: Units): { vr: number; pull: number | null } {
  const conv = (k: number) => (u === 'metric' ? Math.round(k * MPS_PER_KT * 3.6) : Math.round(k));
  const at = rotateAtKt(d);
  return { vr: conv(d.takeoff.vrKt.value), pull: at !== d.takeoff.vrKt.value ? conv(at) : null };
}

/** Screen y of a value on a moving tape centred on the current value (larger values higher). */
export const tapeY = (value: number, current: number, centreY: number, pxPerUnit: number) => centreY - (value - current) * pxPerUnit;

export interface LessonSnapshot {
  gates: readonly GateResult[];
  /** Gear down and landing flaps, with the speed at or below the gear limit. */
  configured: boolean;
  /** Seconds in a row on-speed with the gear down. */
  onSpeedRunS: number;
  /** Return to base only: latched nav milestones. */
  nav?: NavMilestones;
  /** Takeoff only: latched checklist items. */
  takeoff?: ReadonlySet<TakeoffItem>;
  /** Carrier only (undefined elsewhere): the ball has been called. */
  ballCalled?: boolean;
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
  for (const id of snap.takeoff ?? []) done.add(id);
  if (passed('liftoff')) done.add('pitch');
  if (passed('ninety')) done.add('ninety');
  if (snap.ballCalled) done.add('ball');
  if (snap.ballCalled !== undefined && ok('touchdown')) done.add('trap');
  return done;
}

/** First step not done, in order, or null when all are done. */
export function currentStep(done: ReadonlySet<StepId>, order: readonly StepId[] = STEP_ORDER): StepId | null {
  return order.find(id => !done.has(id)) ?? null;
}

/** Progress key for a passed lesson: the pattern / landing key is unchanged, takeoff has its own. */
export const progressKey = (ac: FlightOpsJetId, kind: LessonKind) => (kind === 'takeoff' ? `flight-ops:${ac}:takeoff`
  : isCarrierKind(kind) ? `flight-ops:${ac}:carrier` : `flight-ops:${ac}:done`);

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

// ------------------------------------------------------------------ carrier Case I (#26)

/** Carrier starts for the jet: Case I and In the groove for the jets that go to the boat (hasCarrierStart). */
export type CarrierStart = 'caseI' | 'carrierGroove';
export function carrierStarts(d: FlightOpsJetData): CarrierStart[] {
  return hasCarrierStart(d) ? ['caseI', 'carrierGroove'] : [];
}

/** Overlay frame of the carrier scene: x = right of the landing axis, y = height above the deck, z = −u (metres). */
export function toLandingOverlay(s: FlightOpsState): { x: number; y: number; z: number } {
  const f = landingFrame(s);
  return { x: f.v, y: f.h, z: -f.u };
}

/**
 * Where each Case I gate sits, in the carrier overlay frame (moves with the ship). Ship-frame points (a ahead of
 * the ramp, c to starboard) turn through the angled deck. The ninety is approximate (a pending marker only;
 * a reached gate snaps to the flown point).
 */
export function carrierPlannedGates(d: FlightOpsJetData, groove = false): PlannedGate[] {
  const c = d.carrier;
  if (!c) return [];
  const ship = SHIPS[c.ship];
  const t = ship.angledDeckDeg.value * Math.PI / 180;
  const H = ship.deckHeightM;
  const aim = aimPointU(ship);
  const glide = Math.tan(ship.glideDeg.value * Math.PI / 180);
  const fromShip = (a: number, cc: number, altM: number) => {
    const u = a * Math.cos(t) - cc * Math.sin(t), v = a * Math.sin(t) + cc * Math.cos(t);
    return { x: v, y: altM - H, z: -u };
  };
  const p = c.pattern;
  const abeam = ((p.abeamNm.value[0] + p.abeamNm.value[1]) / 2) * M_PER_NM;
  const ballU = -p.ballNm.value * M_PER_NM;
  const r = abeam / 2;
  const grooveGates: PlannedGate[] = [
    { id: 'groove', label: 'Groove', pos: { x: 0, y: (aim - ballU) * glide, z: -ballU }, headingRad: 0, radiusM: 30 },
    { id: 'touchdown', label: 'Wire', pos: { x: 0, y: 3, z: -aim }, headingRad: 0, radiusM: 12 },
  ];
  if (groove) return grooveGates;
  const initAlt = p.initialAltFt.value * M_PER_FT, dwAlt = p.downwindAltFt.value * M_PER_FT;
  const ninetyAlt = ((p.ninetyAltFt.value[0] + p.ninetyAltFt.value[1]) / 2) * M_PER_FT;
  return [
    { id: 'initial', label: 'Initial', pos: fromShip(0, 150, initAlt), headingRad: t, radiusM: 70 },
    { id: 'break', label: 'Break', pos: fromShip(2000, 150, initAlt), headingRad: t, radiusM: 70 },
    { id: 'abeam', label: 'Abeam', pos: fromShip(0, -abeam, dwAlt), headingRad: Math.PI + t, radiusM: 60 },
    { id: 'ninety', label: 'Ninety', pos: { x: -r, y: ninetyAlt - H, z: -(ballU - r) }, headingRad: Math.PI / 2, radiusM: 50 },
    ...grooveGates,
  ];
}

/** Prompt "Call the ball": in the groove within the ball range, not yet called, flying. */
export function ballPrompt(s: FlightOpsState, d: FlightOpsJetData): boolean {
  return !!s.ship && s.phase === 'air' && !!s.lso && !s.lso.ballCalled && !s.trap && ballInRange(s, d);
}

export type BallTone = 'ok' | 'caution' | 'warning';
/**
 * What the landing aid shows, for the close-up display. IFLOLS: the ball's lens cell (+ high), amber, or red
 * in the red low cells, with the green datum bars, the waveoff and cut lights. Luna-3: one colour light.
 */
export interface BallPicture {
  lights: 'iflols' | 'luna3';
  /** Lens cell −5..+5 (IFLOLS), or null off the lens and on Luna-3. */
  cell: number | null;
  tone: BallTone | null;
  waveoff: boolean;
  cut: boolean;
  /** Plain words for the picture, e.g. "Centred ball", "Low ball, 2 cells", "Green: on glide slope". */
  words: string;
}
export function ballPicture(ball: BallState | null, lights: 'iflols' | 'luna3'): BallPicture {
  if (!ball) return { lights, cell: null, tone: null, waveoff: false, cut: false, words: 'No ball' };
  if (lights === 'luna3') {
    const tone: BallTone = ball.luna === 'red' ? 'warning' : ball.luna === 'yellow' ? 'caution' : 'ok';
    const words = ball.luna === 'red' ? 'Red: low' : ball.luna === 'yellow' ? 'Yellow: high' : 'Green: on glide slope';
    return { lights, cell: null, tone, waveoff: false, cut: false, words };
  }
  const cell = clamp(Math.round(ball.cell), -BALL_CELLS, BALL_CELLS);
  const red = cell <= IFLOLS_RED_CELL;
  const words = red ? 'Red ball: very low' : cell === 0 ? 'Centred ball'
    : cell > 0 ? `High ball, ${cell} cell${cell > 1 ? 's' : ''}` : `Low ball, ${-cell} cell${cell < -1 ? 's' : ''}`;
  return { lights, cell, tone: red ? 'warning' : 'caution', waveoff: ball.waveoffLights, cut: ball.cutLights, words };
}

const CODE_WORDS: Record<string, string> = {
  H: 'high', LO: 'low', F: 'fast', SLO: 'slow', LUL: 'lined up left', LUR: 'lined up right',
  NERD: 'not enough rate of descent', TMRD: 'too much rate of descent',
};
const MARK_WORDS: Record<string, string> = { X: 'at the start', IM: 'in the middle', IC: 'in close', AR: 'at the ramp' };

/** Plain words for a DCS LSO comment: "(LO)IC" → "a little low in close", "_F_X" → "very fast at the start". */
export function commentPlain(code: string): string {
  const m = /^([(_])?(NERD|TMRD|SLO|LUL|LUR|LO|H|F)[)_]?(X|IM|IC|AR)$/.exec(code);
  if (!m) return code;
  const mag = m[1] === '(' ? 'a little ' : m[1] === '_' ? 'very ' : '';
  return `${mag}${CODE_WORDS[m[2]!]} ${MARK_WORDS[m[3]!]}`;
}

/** What each grade mark means (DCS LSO grades). */
export const GRADE_WORDS: Record<CarrierGradeMark, string> = {
  _OK_: 'Perfect pass', OK: 'Reasonable deviations, good corrections', '(OK)': 'Fair: reasonable deviations',
  '---': 'No grade: below average but safe', C: 'Cut: unsafe pass', B: 'Bolter: the hook missed the wires',
  WO: 'LSO waveoff', OWO: 'Own waveoff',
};

export interface GradeCard {
  mark: string;
  tone: BallTone;
  meaning: string;
  /** "3 wire", "Bolter", "Waved off", "Own waveoff", "Crashed", "No trap". */
  result: string;
  comments: { code: string; text: string }[];
}
export function gradeCard(sc: CarrierScore): GradeCard {
  const g = sc.grade;
  const tone: BallTone = g === '_OK_' || g === 'OK' ? 'ok' : g === '(OK)' || g === '---' || g === 'B' || g === 'OWO' ? 'caution' : 'warning';
  const result = g === 'C' && sc.total === 0 ? 'Crashed' : sc.wire !== null ? `${sc.wire} wire`
    : sc.bolter ? 'Bolter' : sc.waveoff ? 'Waved off' : g === 'OWO' ? 'Own waveoff' : 'No trap';
  return {
    mark: g ?? '—', tone, result,
    meaning: g ? GRADE_WORDS[g] : '',
    comments: sc.comments.map(code => ({ code, text: commentPlain(code) })),
  };
}
