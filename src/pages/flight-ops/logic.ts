/**
 * [OWNER: page-flight-ops] Pure helpers for the pattern and landing page: supported jets, indexer lamps,
 * planned gate positions for the 3D overlay, trail error levels and the lesson step completion.
 * No DOM here, so it is unit tested (flightOps.page.test.ts).
 */
import type { AircraftId } from '../../data/types';
import { FLIGHT_OPS } from '../../data/flightOps';
import { M_PER_FT, M_PER_NM, MPS_PER_KT } from '../../sim/math';
import {
  aimPointM, finalTurnGeometry, type AoaCue, type ApproachGeometry, type FlightOpsJetData, type FlightOpsJetId,
  type FlightOpsState, type GateId, type GateResult, type IndexerColor,
} from '../../sim/flightOps';

export const FLIGHT_OPS_JETS: readonly FlightOpsJetId[] = ['fa18c', 'f16c', 'f15c'];

export function isFlightOpsJet(id: AircraftId | string | null | undefined): id is FlightOpsJetId {
  return !!id && (FLIGHT_OPS_JETS as readonly string[]).includes(id) && id in FLIGHT_OPS;
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

export type StepId = 'initial' | 'break' | 'configure' | 'abeam' | 'onspeed' | 'groove' | 'touchdown';
export const STEP_ORDER: readonly StepId[] = ['initial', 'break', 'configure', 'abeam', 'onspeed', 'groove', 'touchdown'];

export interface LessonSnapshot {
  gates: readonly GateResult[];
  /** Gear down and landing flaps, with the speed at or below the gear limit. */
  configured: boolean;
  /** Seconds in a row on-speed with the gear down. */
  onSpeedRunS: number;
}

/** Steps done so far. Gates count once reached (a start on final skips the pattern steps). */
export function stepsDone(snap: LessonSnapshot): Set<StepId> {
  const done = new Set<StepId>();
  const passed = (id: GateId) => snap.gates.some(g => g.id === id);
  const ok = (id: GateId) => snap.gates.some(g => g.id === id && g.ok);
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
export function currentStep(done: ReadonlySet<StepId>): StepId | null {
  return STEP_ORDER.find(id => !done.has(id)) ?? null;
}

/** Progress threshold: a scored landing at or above this marks the lesson done. */
export const PASS_SCORE = 70;
export const lessonPassed = (total: number | null) => total !== null && total >= PASS_SCORE;

// ------------------------------------------------------------------ formatting

export const kt = (ms: number) => Math.round(ms / MPS_PER_KT);
export const ftOf = (m: number) => Math.round(m / M_PER_FT);
export const aoaText = (d: FlightOpsJetData, v: number) => d.aoa.unit === 'deg' ? `${v.toFixed(1)}°` : `${v.toFixed(1)} units`;
