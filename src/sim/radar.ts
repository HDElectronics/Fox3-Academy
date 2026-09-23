/**
 * [OWNER: sim-sensors] Airborne radar, per the jet's RadarSpec (data/aircraft.ts).
 *
 * Scan: the antenna sweeps azCenter ± azHalf at spec.scanRateDegPerS and steps to the next bar at each
 * edge (horizon-stabilised; bar elevation = elCenter + (bar − (bars−1)/2)·barSpacing). A target is
 * "looked at" when the beam crosses its azimuth during the tick while it sits in that bar's elevation band.
 * Detection: range ≤ detectionRange() (aspect, look-down, RCS), a probability roll over the last 20 %
 * of that range, and not in the Doppler notch. Painting (what an RWR hears) reaches PAINT_RANGE_FACTOR ×
 * the head-on detection range and ignores the notch.
 * Modes: RWS bricks (aged out), TWS track files (tentative → firm → coasting → dropped), STT (beam on
 * one target, memory, break), ACM auto-acquisition, VS (simplified RWS on closing targets), off.
 * Per-jet behaviour (designation, launch order, STT memory, unlock) lives in RULES below, taken from
 * docs/research/*.md. guidanceSupport() tells missile.ts whether this shooter datalinks / illuminates.
 */
import { Vector3 } from 'three';
import type { GuidanceSupport, World } from './world';
import type { Aircraft, EntityId, RadarState, TrackFile } from './types';
import type { FighterId, AircraftSpec, RadarModeId } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import {
  D2R, M_PER_NM, MPS_PER_KT, R2D, aspectAngle, clamp, closureRate, dirFrom, elevationTo, inDopplerNotch,
  isLookDown, lerp, radialSpeedVsGround, relBearing, wrapPi,
} from './math';
import { dlzFor } from './dlz';

export interface ScanChange {
  azHalf?: number;     // rad
  bars?: number;
  azCenter?: number;   // rad
  elCenter?: number;   // rad
  rangeScale?: number; // m
  /** FC3 range-angle aiming: preserve the entered height difference while changing range. */
  expectedRange?: number; // m; ignored on other radars
  cursor?: { az: number; range: number };
  /** TWS: keep the scan centred on the primary designated track (default true, as DCS does). */
  autoCenter?: boolean;
}

// ───────────────────────────────────────────────────────────── tunables (documented in docs/api/sim-sensors.md)

/** detectKm in data is against this RCS (m²); other targets scale by (rcs / REF)^0.25. */
export const REF_RCS_M2 = 5;
/** An RWR hears a radar this many times farther than the head-on detection range. */
export const PAINT_RANGE_FACTOR = 1.75;
/** STT acquisition needs range ≤ this × detection range (DCS sensor `lock_on_distance_coeff` = 0.85). */
export const LOCK_RANGE_FACTOR = 0.85;
/** Detection probability falls linearly to 0 over this last fraction of detection range. */
export const DETECT_FALLOFF = 0.2;
/** ACM auto-acquisition: 10 nm, a ±5° × (−10°..+50°) strip around the nose (boresight + vertical scan). */
export const ACM_RANGE_M = 10 * M_PER_NM;
export const ACM_AZ_HALF = 5 * D2R;
export const ACM_EL_MIN = -10 * D2R;
export const ACM_EL_MAX = 50 * D2R;
/** VS mode only shows targets closing faster than this (m/s). */
const VS_MIN_CLOSURE = 30;
/** Measurement noise (1-sigma-ish, triangular). */
const ANG_NOISE = 0.05 * D2R;
const RANGE_NOISE_FRAC = 0.0005;
const RANGE_NOISE_MIN = 15;
/** TWS alpha-beta track filter gains. */
const ALPHA = 0.6;
const BETA = 0.3;
/** FC3 auto-lock check interval (s). */
const AUTO_LOCK_EVERY = 0.25;

// ───────────────────────────────────────────────────────────── per-jet rules

export interface RadarRules {
  /** Max TWS designations kept (0 = no TWS). designated[0] is the primary (PDT / L&S / bug / HPT). */
  designationCap: number;
  /** Designate on an already designated track: 'lock' = STT on it; 'promote' = make it primary (STT if it already is). */
  redesignate: 'lock' | 'promote';
  /** Designate on a new track while the list is full. (Jets with a cap of 1 always replace.) */
  whenFull: 'ignore' | 'replace-last';
  /** Automatic TWS designation: Hornet L&S = closest hostile track; F-14 WCS fills its 6 priorities. */
  autoDesignate: 'none' | 'closest' | 'fill';
  /** Which designated target the next TWS launch goes to: 'ripple' = F-15C/F-14 order, 'primary' = always [0]. */
  launchOrder: 'ripple' | 'primary';
  /** TWS datalink support only for designated tracks (F-15C PDT/SDTs, JF-17 HPT/SPT). */
  supportNeedsDesignation: boolean;
  /** Unlock (STT → TWS) keeps the locked target designated. FC3 Russian unlock clears track and designation. */
  unlockKeepsDesignation: boolean;
  /** STT memory before a degraded lock breaks (s). */
  sttMemoryS: number;
  /** TWS scan forced around the primary while one exists (F-16 bug scan ±25° 3-bar); restored when it goes. */
  bugScan: null | { azHalfDeg: number; bars: number };
  /** Entering TWS from a scan over the limits: keep azimuth (drop bars) or keep bars (narrow azimuth, F-14 ±20° 4-bar). */
  twsEntryKeep: 'az' | 'bars';
  /** Discrete scan-centre positions (deg) for setScan; null = continuous. FC3 Russian: −30 / 0 / +30. */
  azPositionsDeg: number[] | null;
}

type RuleOverride = Partial<Omit<RadarRules, 'designationCap'>> & { maxDesignations?: number };

const DEFAULT_RULES: Omit<RadarRules, 'designationCap'> = {
  redesignate: 'lock', whenFull: 'ignore', autoDesignate: 'none', launchOrder: 'primary',
  supportNeedsDesignation: false, unlockKeepsDesignation: true,
  sttMemoryS: 3, // not published for most jets; simplified
  bugScan: null,
  twsEntryKeep: 'az',
  azPositionsDeg: null,
};

// FC3 Russian: one designated track (cursor snaps to it), Enter again forces STT (Su-27 manual),
// "Target unlock" clears the track and its data (FC3 changelog).
// The 60°-wide scan has three positions: left −60..0°, centre ±30°, right 0..+60° (FC3 manuals).
const RU_FC3: RuleOverride = {
  redesignate: 'lock', whenFull: 'replace-last', unlockKeepsDesignation: false, supportNeedsDesignation: true,
};

const RULES: Partial<Record<FighterId, RuleOverride>> = {
  su27: RU_FC3, su33: RU_FC3, j11a: RU_FC3, mig29s: RU_FC3,
  // F-15C: Enter on a new track = PDT then SDTs (max 4); Enter again on PDT/SDT = STT; ripple PDT → SDTs → PDT;
  // support split across the designated tracks.
  f15c: { redesignate: 'lock', whenFull: 'ignore', launchOrder: 'ripple', supportNeedsDesignation: true },
  // F/A-18C: L&S automatic (highest priority), DT2 by TDC depress, designate DT2 again swaps, L&S again = STT.
  fa18c: { maxDesignations: 2, redesignate: 'promote', whenFull: 'replace-last', autoDesignate: 'closest' },
  // F-16C: TMS Up upgrades/bugs, TMS Up on the bug = STT; mini-search drops the TOI after 2 s.
  f16c: { redesignate: 'promote', sttMemoryS: 2, bugScan: { azHalfDeg: 25, bars: 3 } },
  // F-14: WCS priorities 1-6, one missile per press down the list; NEXT LAUNCH promotes a track.
  // Entering TWS forces ±20° 4-bar unless ±40° 2-bar is already set (Heatblur manual).
  f14b: { redesignate: 'promote', whenFull: 'replace-last', autoDesignate: 'fill', launchOrder: 'ripple', twsEntryKeep: 'bars' },
  // JF-17: 1st TDC press = HPT, bug a second track = SPT, 2nd press on a bugged track = STT.
  jf17: { redesignate: 'lock', whenFull: 'replace-last', supportNeedsDesignation: true },
  // M-2000C: no multi-target TWS; PSIC coasts 5 s before going back to search.
  m2000c: { sttMemoryS: 5 },
};

const RULE_CACHE = new Map<FighterId, RadarRules>();

/** Per-jet radar behaviour used by radar.ts, launch.ts and picture.ts. */
export function radarRules(type: FighterId): RadarRules {
  const hit = RULE_CACHE.get(type);
  if (hit) return hit;
  const tws = AIRCRAFT[type].radar.tws;
  const { maxDesignations, ...o } = RULES[type] ?? {};
  const cap = tws ? Math.max(1, Math.min(tws.maxSimultaneousTargets, maxDesignations ?? Infinity)) : 0;
  const rules: RadarRules = { ...DEFAULT_RULES, ...o, azPositionsDeg: AIRCRAFT[type].radar.azCenterOptionsDeg ?? null, designationCap: cap };
  RULE_CACHE.set(type, rules);
  return rules;
}

// ───────────────────────────────────────────────────────────── private per-radar state

type SearchMode = 'rws' | 'tws' | 'vs';

interface TrackInternal { anchor: Vector3; anchorT: number }

interface Internal {
  /** Mode to fall back to when a lock breaks. */
  prevSearch: SearchMode | 'acm';
  /** Last BVR search mode (unlocking an ACM lock returns here). */
  prevBvr: SearchMode;
  /** targetId → last time the beam painted it (within paint range). */
  painted: Map<EntityId, number>;
  /** targetId → filter anchor for its track file. */
  trk: Map<EntityId, TrackInternal>;
  autoCenter: boolean;
  nextAutoLock: number;
  acmDir: 1 | -1;
  /** Scan saved while a bug scan is active (null = no bug scan). */
  bugSaved: { azHalf: number; bars: number } | null;
}

const INTERNAL = new WeakMap<RadarState, Internal>();

function inner(st: RadarState): Internal {
  let s = INTERNAL.get(st);
  if (!s) {
    s = { prevSearch: 'rws', prevBvr: 'rws', painted: new Map(), trk: new Map(), autoCenter: true, nextAutoLock: 0, acmDir: 1, bugSaved: null };
    INTERNAL.set(st, s);
  }
  return s;
}

const specOf = (ac: Aircraft): AircraftSpec => AIRCRAFT[ac.type];

// ───────────────────────────────────────────────────────────── scan geometry

export function createRadarState(spec: AircraftSpec): RadarState {
  const r = spec.radar;
  const azHalf = Math.min(Math.max(...r.azHalfWidthOptionsDeg), r.gimbalAzDeg) * D2R;
  const bars = r.barOptions.includes(4) ? 4 : r.barOptions[0];
  const st: RadarState = {
    mode: 'rws', snp2: false, expectedRange: spec.module === 'fc3' && spec.display === 'ru-hud' ? 50000 : null, azCenter: 0, azHalf, elCenter: 0, bars,
    rangeScale: (r.rangeScalesKm.find(k => k >= 80) ?? r.rangeScalesKm[r.rangeScalesKm.length - 1]) * 1000,
    beamAz: -azHalf, beamEl: 0, sweepDir: 1, bar: 0,
    frameTime: frameTimeFor(spec, azHalf, bars),
    bricks: [], tracks: [], designated: [], stt: { targetId: null, lostFor: 0 },
    cursor: { az: 0, range: 50000 },
  };
  st.beamEl = barElevation(spec, st, 0);
  inner(st);
  return st;
}

/** Seconds for one full scan pattern. */
export function frameTimeFor(spec: AircraftSpec, azHalf: number, bars: number): number {
  return (bars * 2 * azHalf) / (spec.radar.scanRateDegPerS * D2R);
}

/** Elevation (rad, rel horizon) of bar `bar`; bar 0 is the lowest. */
export function barElevation(spec: AircraftSpec, st: Pick<RadarState, 'elCenter' | 'bars'>, bar: number): number {
  return st.elCenter + (bar - (st.bars - 1) / 2) * spec.radar.barSpacingDeg * D2R;
}

/** Elevation band [lo, hi] (rad) that bar `bar` covers. Bands touch but never overlap, so a target gets one look per frame. */
export function barBand(spec: AircraftSpec, st: Pick<RadarState, 'elCenter' | 'bars'>, bar: number): [number, number] {
  const sp = spec.radar.barSpacingDeg * D2R, bw = spec.radar.beamWidthDeg * D2R;
  const c = barElevation(spec, st, bar);
  const inside = Math.min(sp, bw) / 2, outside = bw / 2;
  return [c - (bar === 0 ? outside : inside), c + (bar === st.bars - 1 ? outside : inside)];
}

/** Top and bottom of the whole scan pattern (rad rel horizon). */
export function scanElevationLimits(spec: AircraftSpec, st: Pick<RadarState, 'elCenter' | 'bars'>): { top: number; bottom: number } {
  const bw = spec.radar.beamWidthDeg * D2R;
  return { top: barElevation(spec, st, st.bars - 1) + bw / 2, bottom: barElevation(spec, st, 0) - bw / 2 };
}

/** Half-height of the scan pattern (rad). */
function coverageHalf(spec: AircraftSpec, bars: number): number {
  return ((bars - 1) / 2) * spec.radar.barSpacingDeg * D2R + (spec.radar.beamWidthDeg * D2R) / 2;
}

/** Longest gap between two looks at the same spot (odd bar counts alternate the sweep direction per frame). */
export function revisitTime(st: Pick<RadarState, 'frameTime' | 'bars'>): number {
  return st.frameTime * (st.bars % 2 === 1 ? 2 : 1);
}

/** How long an RWS brick stays on the display: just past the next expected look. */
export function brickLife(st: Pick<RadarState, 'frameTime' | 'bars'>): number {
  return revisitTime(st) + 1;
}

interface Seg { bar: number; a0: number; a1: number }

/** Move the antenna for dt; returns the azimuth segments swept (per bar). */
function advanceBeam(spec: AircraftSpec, st: RadarState, dt: number): Seg[] {
  const rate = spec.radar.scanRateDegPerS * D2R;
  const lo = st.azCenter - st.azHalf, hi = st.azCenter + st.azHalf;
  st.beamAz = clamp(st.beamAz, lo, hi);
  const segs: Seg[] = [];
  let left = rate * dt;
  for (let i = 0; i < 16 && left > 1e-12; i++) {
    const edge = st.sweepDir > 0 ? hi : lo;
    const dist = Math.abs(edge - st.beamAz);
    if (left < dist) {
      const a1 = st.beamAz + st.sweepDir * left;
      segs.push({ bar: st.bar, a0: st.beamAz, a1 });
      st.beamAz = a1;
      left = 0;
    } else {
      segs.push({ bar: st.bar, a0: st.beamAz, a1: edge });
      st.beamAz = edge;
      left -= dist;
      st.sweepDir = st.sweepDir > 0 ? -1 : 1;
      st.bar = (st.bar + 1) % st.bars;
    }
  }
  st.beamEl = barElevation(spec, st, st.bar);
  return segs;
}

function recomputeFrame(spec: AircraftSpec, st: RadarState): void {
  if (st.mode === 'acm') {
    st.frameTime = (ACM_EL_MAX - ACM_EL_MIN) / (spec.radar.scanRateDegPerS * D2R);
    return;
  }
  st.frameTime = frameTimeFor(spec, st.azHalf, st.bars);
  st.bar = Math.min(st.bar, st.bars - 1);
  st.beamAz = clamp(st.beamAz, st.azCenter - st.azHalf, st.azCenter + st.azHalf);
  st.beamEl = barElevation(spec, st, st.bar);
}

// ───────────────────────────────────────────────────────────── detection physics

interface Geo { az: number; el: number; range: number }

function geoOf(ac: Aircraft, p: Vector3): Geo {
  return { az: relBearing(ac.pos, ac.heading, p), el: elevationTo(ac.pos, p), range: ac.pos.distanceTo(p) };
}

/**
 * Range (m) at which `observer`'s radar detects `target` right now: spec.detectKm interpolated head-on →
 * tail by aspect, with separate look-down endpoints and the radar table's reference RCS.
 */
export function detectionRange(world: World, observer: Aircraft, target: Aircraft): number {
  const d = specOf(observer).radar.detectKm;
  const asp = aspectAngle(target.pos, target.vel, observer.pos);
  const down = isLookDown(observer.pos, target.pos, world.groundAlt);
  const hot = d.headOn * (down ? d.lookDownHeadOnFactor ?? d.lookDownFactor : 1);
  const cold = d.tail * (down ? d.lookDownFactor : 1);
  let km = lerp(hot, cold, (1 - Math.cos(asp)) / 2);
  km *= Math.pow(Math.max(specOf(target).rcsM2, 0.01) / (d.referenceRcsM2 ?? REF_RCS_M2), 0.25);
  return km * 1000;
}

/** Is `target` inside `observer`'s Doppler notch (spec.notchKts, spec.notchNeedsLookDown)? */
export function isNotched(world: World, observer: Aircraft, target: Aircraft): boolean {
  const r = specOf(observer).radar;
  return inDopplerNotch(observer.pos, target.pos, target.vel, r.notchKts * MPS_PER_KT, r.notchNeedsLookDown, world.groundAlt);
}

/** How far this emitter's beam is heard by an RWR (m). */
export function paintRange(emitter: Aircraft): number {
  return PAINT_RANGE_FACTOR * specOf(emitter).radar.detectKm.headOn * 1000;
}

/** Last time `emitter`'s beam painted `targetId` (s), or null. Used by rwr.ts. */
export function lastPainted(emitter: Aircraft, targetId: EntityId): number | null {
  return INTERNAL.get(emitter.radar)?.painted.get(targetId) ?? null;
}

export interface DetectionExplain {
  az: number; el: number; range: number;          // rad rel nose / horizon, m
  inGimbal: boolean;
  inAzimuth: boolean;                              // inside azCenter ± azHalf
  inBars: boolean;                                 // inside the bar pattern's elevation
  detectRange: number;                             // m, for this aspect / look-down / RCS
  lookDown: boolean;
  radialSpeed: number;                             // m/s vs ground, what the notch looks at
  notchGate: number;                               // m/s
  notched: boolean;
  /** A beam pass would see it (ignoring the probability roll in the last 20 % of range). */
  detectable: boolean;
  /** Pilot-language reasons it is not seen; empty when detectable. */
  reasons: string[];
}

export interface ExplainOptions {
  /** Units for the distances and speeds in `reasons` (default metric: km and kt, as before). Imperial: nm and kt. */
  units?: 'metric' | 'imperial';
}

/** Why does (or doesn't) `observer`'s search scan see `target`? For the Radar Lab. */
export function explainDetection(world: World, observer: Aircraft, target: Aircraft, opts: ExplainOptions = {}): DetectionExplain {
  const spec = specOf(observer), r = spec.radar, st = observer.radar;
  const g = geoOf(observer, target.pos);
  const inGimbal = Math.abs(g.az) <= r.gimbalAzDeg * D2R && Math.abs(g.el) <= r.gimbalElDeg * D2R;
  const inAzimuth = Math.abs(g.az - st.azCenter) <= st.azHalf;
  const lim = scanElevationLimits(spec, st);
  const inBars = g.el >= lim.bottom && g.el <= lim.top;
  const detectRange = detectionRange(world, observer, target);
  const lookDown = isLookDown(observer.pos, target.pos, world.groundAlt);
  const radialSpeed = radialSpeedVsGround(observer.pos, target.pos, target.vel);
  const notchGate = r.notchKts * MPS_PER_KT;
  const notched = isNotched(world, observer, target);
  const reasons: string[] = [];
  const deg = (a: number) => `${Math.abs(a * R2D).toFixed(1)}°`;
  const dist = (m: number) => (opts.units === 'imperial' ? `${(m / M_PER_NM).toFixed(0)} nm` : `${(m / 1000).toFixed(0)} km`);
  if (st.mode === 'off') reasons.push('Radar is off');
  if (!inGimbal) reasons.push(`Outside the gimbal: ${deg(g.az)} off the nose, limit ±${r.gimbalAzDeg}°`);
  else if (!inAzimuth) reasons.push(`Outside the scan azimuth: target ${deg(g.az - st.azCenter)} from the scan centre, scan ±${(st.azHalf * R2D).toFixed(0)}°`);
  if (!inBars) {
    const above = g.el > lim.top;
    reasons.push(`Outside the bars: target ${deg(above ? g.el - lim.top : lim.bottom - g.el)} ${above ? 'above' : 'below'} the scan`);
  }
  if (g.range > detectRange) {
    reasons.push(`Beyond detection range: ${dist(g.range)}, radar sees this target at ${dist(detectRange)}${lookDown ? ' (look-down)' : ''}`);
  }
  if (notched) {
    reasons.push(`In the notch: ${(radialSpeed / MPS_PER_KT).toFixed(0)} kt radial speed, gate ${r.notchKts.toFixed(0)} kt`);
  }
  if (observer.radar.mode === 'vs' && closureRate(observer.pos, observer.vel, target.pos, target.vel) < VS_MIN_CLOSURE) {
    reasons.push('VS only shows closing targets');
  }
  return { ...g, inGimbal, inAzimuth, inBars, detectRange, lookDown, radialSpeed, notchGate, notched, detectable: reasons.length === 0, reasons };
}

function detects(world: World, ac: Aircraft, tgt: Aircraft, g: Geo): boolean {
  const R = detectionRange(world, ac, tgt);
  if (g.range > R) return false;
  if (isNotched(world, ac, tgt)) return false;
  if (ac.radar.mode === 'vs' && closureRate(ac.pos, ac.vel, tgt.pos, tgt.vel) < VS_MIN_CLOSURE) return false;
  const edge = R * (1 - DETECT_FALLOFF);
  if (g.range > edge && world.rand() > (R - g.range) / (R - edge)) return false;
  return true;
}

/** Did the beam cross this position during the tick? `margin` (rad) shrinks each bar band (for missed-look tests). */
function looked(spec: AircraftSpec, st: RadarState, segs: Seg[], g: Geo, margin = 0): boolean {
  for (const s of segs) {
    if (g.az < Math.min(s.a0, s.a1) || g.az > Math.max(s.a0, s.a1)) continue;
    const [lo, hi] = barBand(spec, st, s.bar);
    if (g.el >= lo + margin && g.el <= hi - margin) return true;
  }
  return false;
}

interface Meas { pos: Vector3; az: number; el: number; range: number; closure: number }

const tri = (world: World) => world.rand() + world.rand() - 1;

function measure(world: World, ac: Aircraft, tgt: Aircraft, g: Geo, k = 1): Meas {
  const az = g.az + tri(world) * ANG_NOISE * k;
  const el = g.el + tri(world) * ANG_NOISE * k;
  const range = Math.max(1, g.range + tri(world) * Math.max(RANGE_NOISE_MIN, g.range * RANGE_NOISE_FRAC) * k);
  const pos = dirFrom(ac.heading + az, el).multiplyScalar(range).add(ac.pos);
  const closure = closureRate(ac.pos, ac.vel, tgt.pos, tgt.vel) + tri(world) * 2 * k;
  return { pos, az, el, range, closure };
}

// ───────────────────────────────────────────────────────────── bricks and track files

function emitTrack(world: World, ac: Aircraft, targetId: EntityId, what: 'new' | 'firm' | 'dropped'): void {
  world.emit({ t: world.t, type: 'track', ownerId: ac.id, targetId, what });
}

function emitLock(world: World, ac: Aircraft, targetId: EntityId, what: 'locked' | 'unlocked' | 'broken', why?: string): void {
  world.emit(why ? { t: world.t, type: 'lock', ownerId: ac.id, targetId, what, why } : { t: world.t, type: 'lock', ownerId: ac.id, targetId, what });
}

function addBrick(world: World, st: RadarState, targetId: EntityId, z: Meas): void {
  removeBricks(st, targetId);
  st.bricks.push({ targetId, t: world.t, pos: z.pos, az: z.az, el: z.el, range: z.range, closure: z.closure });
}

function removeBricks(st: RadarState, targetId: EntityId): void {
  for (let i = st.bricks.length - 1; i >= 0; i--) if (st.bricks[i].targetId === targetId) st.bricks.splice(i, 1);
}

function ageBricks(world: World, st: RadarState): void {
  const oldest = world.t - brickLife(st);
  for (let i = st.bricks.length - 1; i >= 0; i--) if (st.bricks[i].t < oldest) st.bricks.splice(i, 1);
}

export function trackOf(st: RadarState, targetId: EntityId | null | undefined): TrackFile | undefined {
  return targetId ? st.tracks.find(t => t.targetId === targetId) : undefined;
}

function newLabel(st: RadarState): string {
  const used = new Set(st.tracks.map(t => t.label));
  for (let n = 1; ; n++) if (!used.has(`T${n}`)) return `T${n}`;
}

function createTrack(world: World, ac: Aircraft, targetId: EntityId, pos: Vector3): TrackFile {
  const st = ac.radar;
  const trk: TrackFile = {
    label: newLabel(st), targetId, pos: pos.clone(), vel: new Vector3(),
    firstHit: world.t, lastHit: world.t, hits: 1, firm: false, coasting: false,
  };
  st.tracks.push(trk);
  inner(st).trk.set(targetId, { anchor: pos.clone(), anchorT: world.t });
  removeBricks(st, targetId);
  emitTrack(world, ac, targetId, 'new');
  return trk;
}

function anchorOf(st: RadarState, trk: TrackFile): TrackInternal {
  const ist = inner(st);
  let ti = ist.trk.get(trk.targetId);
  if (!ti) { ti = { anchor: trk.pos.clone(), anchorT: trk.lastHit }; ist.trk.set(trk.targetId, ti); }
  return ti;
}

/** TWS hit: 1st hit tentative, 2nd hit (≥ half a frame later) firm with velocity, then alpha-beta. */
function updateTrack(world: World, ac: Aircraft, trk: TrackFile, z: Vector3): void {
  const st = ac.radar, t = world.t;
  const ti = anchorOf(st, trk);
  const minGap = Math.max(0.3, 0.5 * st.frameTime);
  if (t - trk.lastHit < minGap) {
    // Same look (edge reversal / bar overlap): refresh position only.
    ti.anchor.copy(z); ti.anchorT = t;
  } else if (!trk.firm) {
    trk.vel.copy(z).sub(ti.anchor).divideScalar(Math.max(t - ti.anchorT, 1e-3));
    ti.anchor.copy(z); ti.anchorT = t;
    trk.firm = true;
    trk.hits++;
    emitTrack(world, ac, trk.targetId, 'firm');
  } else {
    const dtA = Math.max(t - ti.anchorT, 1e-3);
    const pred = ti.anchor.clone().addScaledVector(trk.vel, dtA);
    const res = z.clone().sub(pred);
    ti.anchor.copy(pred).addScaledVector(res, ALPHA);
    trk.vel.addScaledVector(res, BETA / dtA);
    ti.anchorT = t;
    trk.hits++;
  }
  trk.lastHit = t;
  trk.coasting = false;
  trk.pos.copy(ti.anchor);
}

function extrapolate(st: RadarState, trk: TrackFile, t: number): void {
  const ti = anchorOf(st, trk);
  trk.pos.copy(ti.anchor).addScaledVector(trk.vel, t - ti.anchorT);
}

function dropTrack(world: World, ac: Aircraft, targetId: EntityId): void {
  const st = ac.radar;
  const i = st.tracks.findIndex(t => t.targetId === targetId);
  if (i < 0) return;
  st.tracks.splice(i, 1);
  const d = st.designated.indexOf(targetId);
  if (d >= 0) st.designated.splice(d, 1);
  inner(st).trk.delete(targetId);
  emitTrack(world, ac, targetId, 'dropped');
}

function dropAllTracks(world: World, ac: Aircraft, except: EntityId | null = null): void {
  for (const trk of [...ac.radar.tracks]) if (trk.targetId !== except) dropTrack(world, ac, trk.targetId);
  ac.radar.designated = ac.radar.designated.filter(id => id === except);
}

/** TWS/STT housekeeping: extrapolate, coast after a missed revisit, drop after ~3 frames (≥ 6 s). */
function maintainTracks(world: World, ac: Aircraft): void {
  const st = ac.radar, t = world.t;
  const rv = revisitTime(st);
  const coastAfter = rv * 1.25 + 0.5;
  const dropAfter = Math.max(3 * st.frameTime, 2 * rv, 6);
  for (const trk of [...st.tracks]) {
    const tgt = world.get(trk.targetId);
    if (!tgt || !tgt.alive) { dropTrack(world, ac, trk.targetId); continue; }
    if (st.mode === 'stt' && st.stt.targetId === trk.targetId) continue; // STT owns this one
    extrapolate(st, trk, t);
    const age = t - trk.lastHit;
    if (age > coastAfter) trk.coasting = true;
    if (age > dropAfter) dropTrack(world, ac, trk.targetId);
  }
  if (st.mode === 'stt') for (const trk of [...st.tracks]) if (trk.targetId !== st.stt.targetId) dropTrack(world, ac, trk.targetId);
}

// ───────────────────────────────────────────────────────────── per-mode stepping

function stepSearch(world: World, ac: Aircraft, spec: AircraftSpec, dt: number): void {
  const st = ac.radar, ist = inner(st);
  const segs = advanceBeam(spec, st, dt);
  const pr = paintRange(ac);
  const tws = st.mode === 'tws' ? spec.radar.tws : null;
  const hits = new Set<EntityId>();
  for (const tgt of world.aircraft.values()) {
    if (tgt === ac || !tgt.alive) continue;
    const g = geoOf(ac, tgt.pos);
    if (!looked(spec, st, segs, g)) continue;
    if (g.range <= pr) ist.painted.set(tgt.id, world.t);
    if (!detects(world, ac, tgt, g)) continue;
    hits.add(tgt.id);
    const z = measure(world, ac, tgt, g);
    if (tws) {
      const trk = trackOf(st, tgt.id);
      if (trk) updateTrack(world, ac, trk, z.pos);
      else if (st.tracks.length < tws.maxTracks) createTrack(world, ac, tgt.id, z.pos);
      else addBrick(world, st, tgt.id, z); // track table full: raw hit only
    } else {
      addBrick(world, st, tgt.id, z);
    }
  }
  if (tws) {
    // A track whose predicted position was looked at (well inside a bar, so estimate error at a bar boundary
    // does not count) without a hit starts coasting.
    const margin = 0.25 * Math.min(spec.radar.barSpacingDeg, spec.radar.beamWidthDeg) * D2R;
    for (const trk of st.tracks) {
      if (!hits.has(trk.targetId) && looked(spec, st, segs, geoOf(ac, trk.pos), margin)) trk.coasting = true;
    }
  }
}

function stepStt(world: World, ac: Aircraft, spec: AircraftSpec, dt: number): void {
  const st = ac.radar, ist = inner(st), r = spec.radar;
  const tgt = world.get(st.stt.targetId);
  if (!tgt || !tgt.alive) { breakLock(world, ac, 'target destroyed'); return; }
  let trk = trackOf(st, tgt.id);
  if (!trk) { trk = createTrack(world, ac, tgt.id, tgt.pos); trk.firm = true; trk.vel.copy(tgt.vel); }
  const g = geoOf(ac, tgt.pos);
  const gimAz = r.gimbalAzDeg * D2R, gimEl = r.gimbalElDeg * D2R;
  const inGimbal = Math.abs(g.az) <= gimAz && Math.abs(g.el) <= gimEl;
  if (inGimbal && g.range <= paintRange(ac)) ist.painted.set(tgt.id, world.t);
  let why: string | null = null;
  if (!inGimbal) why = 'gimbal limit';
  else if (g.range > detectionRange(world, ac, tgt)) why = 'out of range';
  else if (isNotched(world, ac, tgt)) why = 'notched';
  if (why) {
    st.stt.lostFor += dt;
    trk.coasting = true;
    extrapolate(st, trk, world.t);
    const ge = geoOf(ac, trk.pos);
    st.beamAz = clamp(ge.az, -gimAz, gimAz);
    st.beamEl = clamp(ge.el, -gimEl, gimEl);
    if (st.stt.lostFor > radarRules(ac.type).sttMemoryS) breakLock(world, ac, why);
    return;
  }
  st.stt.lostFor = 0;
  const z = measure(world, ac, tgt, g, 0.3);
  const ti = anchorOf(st, trk);
  ti.anchor.copy(z.pos); ti.anchorT = world.t;
  trk.pos.copy(z.pos);
  trk.vel.copy(tgt.vel); // range rate + angle rates: STT knows the target velocity
  if (!trk.firm) { trk.firm = true; emitTrack(world, ac, tgt.id, 'firm'); }
  trk.coasting = false;
  trk.lastHit = world.t;
  trk.hits++;
  st.beamAz = g.az;
  st.beamEl = g.el;
}

/** Body-relative angles for ACM (no roll modelled): azimuth off the nose, elevation above the nose line. */
function acmAngles(ac: Aircraft, p: Vector3): Geo {
  const g = geoOf(ac, p);
  return { az: g.az, el: g.el - ac.pitch, range: g.range };
}

function stepAcm(world: World, ac: Aircraft, spec: AircraftSpec, dt: number): void {
  const st = ac.radar, ist = inner(st);
  // Cosmetic: the beam sweeps the vertical strip.
  const rate = spec.radar.scanRateDegPerS * D2R;
  let el = st.beamEl - ac.pitch + ist.acmDir * rate * dt;
  if (el > ACM_EL_MAX) { el = ACM_EL_MAX; ist.acmDir = -1; }
  if (el < ACM_EL_MIN) { el = ACM_EL_MIN; ist.acmDir = 1; }
  st.beamAz = 0;
  st.beamEl = el + ac.pitch;
  const pr = paintRange(ac);
  let best: Aircraft | null = null, bestR = Infinity;
  for (const tgt of world.aircraft.values()) {
    if (tgt === ac || !tgt.alive) continue;
    const a = acmAngles(ac, tgt.pos);
    if (Math.abs(a.az) > ACM_AZ_HALF || a.el < ACM_EL_MIN || a.el > ACM_EL_MAX) continue;
    if (a.range <= pr) ist.painted.set(tgt.id, world.t);
    if (a.range > ACM_RANGE_M || a.range >= bestR) continue;
    if (!canLock(world, ac, tgt.id).ok) continue;
    best = tgt; bestR = a.range;
  }
  if (best) lockTarget(world, ac, best.id);
}

/** Hornet auto L&S / F-14 WCS priorities, scan auto-centring on the primary, FC3 auto-STT. */
function twsExtras(world: World, ac: Aircraft, spec: AircraftSpec): void {
  const st = ac.radar, ist = inner(st), r = spec.radar, rules = radarRules(ac.type);
  if (rules.autoDesignate !== 'none') {
    const want = rules.autoDesignate === 'closest' ? (st.designated.length ? 0 : 1) : rules.designationCap - st.designated.length;
    if (want > 0) {
      const cands = st.tracks
        .filter(t => t.firm && !t.coasting && !st.designated.includes(t.targetId) && world.get(t.targetId)?.side !== ac.side)
        .sort((a, b) => a.pos.distanceTo(ac.pos) - b.pos.distanceTo(ac.pos));
      for (const t of cands.slice(0, want)) st.designated.push(t.targetId);
    }
  }
  if (st.snp2) refreshSnp2(world, ac);
  const primary = trackOf(st, st.designated[0]);
  if (rules.bugScan) {
    if (primary && !ist.bugSaved) {
      ist.bugSaved = { azHalf: st.azHalf, bars: st.bars };
      st.azHalf = Math.min(rules.bugScan.azHalfDeg * D2R, r.gimbalAzDeg * D2R);
      st.bars = rules.bugScan.bars;
      recomputeFrame(spec, st);
    } else if (!primary && ist.bugSaved) {
      restoreBugScan(spec, st);
    }
  }
  if (primary && ist.autoCenter) {
    const g = geoOf(ac, primary.pos);
    const azLim = Math.max(0, r.gimbalAzDeg * D2R - st.azHalf);
    const elLim = Math.max(0, r.gimbalElDeg * D2R - coverageHalf(spec, st.bars));
    st.azCenter = clamp(g.az, -azLim, azLim);
    st.elCenter = clamp(g.el, -elLim, elLim);
  }
  const frac = r.tws?.autoSttAtRmaxFraction;
  if (!st.snp2 && frac != null && primary && ac.selectedWeapon && world.t >= ist.nextAutoLock) {
    ist.nextAutoLock = world.t + AUTO_LOCK_EVERY;
    if (primary.firm && !primary.coasting) {
      const d = dlzFor(ac.pos, ac.vel, primary.pos, primary.vel, ac.selectedWeapon);
      if (ac.pos.distanceTo(primary.pos) <= frac * d.rmax) lockTarget(world, ac, primary.targetId);
    }
  }
}

export function stepRadar(world: World, ac: Aircraft, dt: number): void {
  const spec = specOf(ac), st = ac.radar;
  switch (st.mode) {
    case 'off': return;
    case 'stt': stepStt(world, ac, spec, dt); break;
    case 'acm': stepAcm(world, ac, spec, dt); break;
    default: stepSearch(world, ac, spec, dt);
  }
  // The mode may have changed above (lock, break).
  if (st.bricks.length) ageBricks(world, st);
  if (st.mode === 'tws' || st.mode === 'stt') maintainTracks(world, ac);
  if (st.mode === 'tws') twsExtras(world, ac, spec);
}

// ───────────────────────────────────────────────────────────── mode transitions

/** TWS scan limits: az ≤ maxAzHalfWidthDeg, bars ≤ maxBars, frame ≤ maxFrameTimeS. `keep` wins when both can shrink. */
function fitTws(spec: AircraftSpec, azHalf: number, bars: number, keep: 'az' | 'bars'): { azHalf: number; bars: number } {
  const r = spec.radar, tws = r.tws;
  if (!tws) return { azHalf, bars };
  if (r.twsPatterns?.length) {
    const az = azHalf * R2D;
    const options = [...r.twsPatterns];
    options.sort(([aa, ab], [ba, bb]) => keep === 'bars'
      ? Math.abs(ab - bars) - Math.abs(bb - bars) || Math.abs(aa - az) - Math.abs(ba - az)
      : Math.abs(aa - az) - Math.abs(ba - az) || Math.abs(ab - bars) - Math.abs(bb - bars));
    return { azHalf: options[0][0] * D2R, bars: options[0][1] };
  }
  const maxAz = Math.min(tws.maxAzHalfWidthDeg ?? Infinity, r.gimbalAzDeg);
  let azOpts = [...r.azHalfWidthOptionsDeg].sort((a, b) => a - b).filter(a => a <= maxAz + 1e-9);
  if (!azOpts.length) azOpts = [Math.min(maxAz, Math.min(...r.azHalfWidthOptionsDeg))];
  let barOpts = [...r.barOptions].sort((a, b) => a - b).filter(b => b <= (tws.maxBars ?? Infinity));
  if (!barOpts.length) barOpts = [Math.min(...r.barOptions)];
  const azDeg = azHalf * R2D;
  let ai = azOpts.length - 1;
  while (ai > 0 && azOpts[ai] > azDeg + 1e-6) ai--;
  let bi = barOpts.length - 1;
  while (bi > 0 && barOpts[bi] > bars) bi--;
  const maxFrame = tws.maxFrameTimeS;
  if (maxFrame != null) {
    for (let guard = 0; guard < 32 && frameTimeFor(spec, azOpts[ai] * D2R, barOpts[bi]) > maxFrame + 1e-9; guard++) {
      const canBars = bi > 0, canAz = ai > 0;
      if (!canBars && !canAz) break;
      if (keep === 'az') { if (canBars) bi--; else ai--; }
      else { if (canAz) ai--; else bi--; }
    }
  }
  return { azHalf: azOpts[ai] * D2R, bars: barOpts[bi] };
}

function applyTwsEntryLimits(spec: AircraftSpec, st: RadarState): void {
  // Heatblur: entering TWS selects ±20°/4B unless ±40°/2B is already selected.
  if (spec.id === 'f14b' && !(Math.abs(st.azHalf * R2D - 40) < 1e-6 && st.bars === 2)) {
    st.azHalf = 20 * D2R;
    st.bars = 4;
  }
  applyTwsLimits(spec, st, radarRules(spec.id).twsEntryKeep);
}

function applyTwsLimits(spec: AircraftSpec, st: RadarState, keep: 'az' | 'bars' = 'az'): void {
  const f = fitTws(spec, st.azHalf, st.bars, keep);
  st.azHalf = f.azHalf;
  st.bars = f.bars;
  clampCenters(spec, st);
}

function clampCenters(spec: AircraftSpec, st: RadarState): void {
  const r = spec.radar;
  st.azHalf = Math.min(st.azHalf, r.gimbalAzDeg * D2R);
  const azLim = Math.max(0, r.gimbalAzDeg * D2R - st.azHalf);
  st.azCenter = clamp(st.azCenter, -azLim, azLim);
  const elLim = Math.max(0, r.gimbalElDeg * D2R - coverageHalf(spec, st.bars));
  st.elCenter = clamp(st.elCenter, -elLim, elLim);
}

function restoreBugScan(spec: AircraftSpec, st: RadarState): void {
  const ist = inner(st);
  if (!ist.bugSaved) return;
  st.azHalf = ist.bugSaved.azHalf;
  st.bars = ist.bugSaved.bars;
  ist.bugSaved = null;
  if (st.mode === 'tws') applyTwsLimits(spec, st);
  clampCenters(spec, st);
  if (st.mode !== 'stt') recomputeFrame(spec, st);
}

/** Go back to a search mode after STT. keepId keeps that target's track (and designation in TWS). */
function returnToSearch(world: World, ac: Aircraft, mode: SearchMode | 'acm', keepId: EntityId | null, keep: boolean): void {
  const spec = specOf(ac), st = ac.radar;
  st.stt = { targetId: null, lostFor: 0 };
  st.bricks.length = 0;
  if (mode === 'tws' && spec.radar.tws && spec.radar.modes.includes('tws')) {
    st.mode = 'tws';
    if (keep && keepId && trackOf(st, keepId)) {
      dropAllTracks(world, ac, keepId);
      st.designated = [keepId];
    } else {
      dropAllTracks(world, ac);
      st.designated = [];
    }
    applyTwsEntryLimits(spec, st);
  } else {
    st.mode = mode === 'tws' ? 'rws' : mode;
    dropAllTracks(world, ac);
    st.designated = [];
    restoreBugScan(spec, st);
  }
  recomputeFrame(spec, st);
}

function breakLock(world: World, ac: Aircraft, why: string): void {
  const st = ac.radar, ist = inner(st);
  const id = st.stt.targetId;
  if (id) emitLock(world, ac, id, 'broken', why);
  // A broken lock keeps the target's (coasting) track designated so the pilot, or FC3 auto-lock, can relock it.
  returnToSearch(world, ac, ist.prevSearch, id, true);
}

export function setRadarMode(world: World, ac: Aircraft, mode: RadarModeId, targetId?: EntityId): boolean {
  const spec = specOf(ac), st = ac.radar, ist = inner(st);
  if (!spec.radar.modes.includes(mode)) return false;
  if (mode === 'stt') {
    const id = targetId ?? st.stt.targetId ?? st.designated[0] ?? nearestContact(ac);
    return id ? lockTarget(world, ac, id) : false;
  }
  const from = st.mode;
  if (mode !== 'tws') st.snp2 = false;
  if (from === mode) {
    if (mode === 'tws' && targetId && !st.designated.includes(targetId)) designate(world, ac, targetId);
    return true;
  }
  if (mode === 'tws' && !spec.radar.tws) return false;
  const lockedId = from === 'stt' ? st.stt.targetId : null;
  if (lockedId) emitLock(world, ac, lockedId, 'unlocked');
  if (mode === 'tws' && from === 'stt') {
    returnToSearch(world, ac, 'tws', lockedId, radarRules(ac.type).unlockKeepsDesignation);
  } else {
    st.stt = { targetId: null, lostFor: 0 };
    st.bricks.length = 0;
    dropAllTracks(world, ac);
    st.designated = [];
    st.mode = mode;
    restoreBugScan(spec, st);
    if (mode === 'tws') applyTwsEntryLimits(spec, st);
  }
  if (mode === 'rws' || mode === 'tws' || mode === 'vs') { ist.prevBvr = mode; ist.prevSearch = mode; }
  if (mode === 'acm') { st.beamAz = 0; st.beamEl = ac.pitch; }
  recomputeFrame(spec, st);
  return true;
}

function nearestContact(ac: Aircraft): EntityId | null {
  let best: EntityId | null = null, bestR = Infinity;
  for (const t of ac.radar.tracks) { const r = t.pos.distanceTo(ac.pos); if (r < bestR) { bestR = r; best = t.targetId; } }
  for (const b of ac.radar.bricks) if (b.range < bestR) { bestR = b.range; best = b.targetId; }
  return best;
}

/**
 * Click / Enter / TDC depress on a contact, per jet:
 * - RWS / VS: lock it (STT). F-16 SAM and JF-17 SAM are simplified to a lock.
 * - TWS: a new track is designated (added at the end, [0] = primary). Jets with one designation replace it.
 *   A full list: F-15C ignores, Hornet replaces DT2, JF-17 replaces SPT, F-14 replaces the last priority.
 *   An already designated track: F-15C / FC3 Russian / JF-17 lock it (Enter twice = STT); Hornet / F-16 / F-14
 *   promote it to primary, and lock it if it already is.
 * - STT / ACM / off: no-op.
 * To remove one designation use undesignate().
 */
export function designate(world: World, ac: Aircraft, targetId: EntityId): void {
  const st = ac.radar;
  if (st.mode === 'rws' || st.mode === 'vs') { lockTarget(world, ac, targetId); return; }
  if (st.mode !== 'tws') return;
  if (!trackOf(st, targetId)) return;
  const rules = radarRules(ac.type);
  const i = st.designated.indexOf(targetId);
  if (i === 0) { lockTarget(world, ac, targetId); return; }
  if (i > 0) {
    if (rules.redesignate === 'promote') { st.designated.splice(i, 1); st.designated.unshift(targetId); }
    else lockTarget(world, ac, targetId);
    return;
  }
  const cap = ac.type === 'mig29s' && !st.snp2 ? 1 : rules.designationCap;
  if (cap <= 1) st.designated = [targetId];
  else if (st.designated.length < cap) st.designated.push(targetId);
  else if (rules.whenFull === 'replace-last') st.designated[st.designated.length - 1] = targetId;
}

/** Remove one TWS designation (F-15C "Unlock TWS Target"). Later designations move up. */
export function undesignate(world: World, ac: Aircraft, targetId: EntityId): void {
  const i = ac.radar.designated.indexOf(targetId);
  if (i >= 0) ac.radar.designated.splice(i, 1);
}

/**
 * Step the primary designation (Hornet Undesignate, F-16 TMS Right, JF-17 S2 Left, F-14 NEXT LAUNCH):
 * with two or more designations rotate them ([a, b, c] → [b, c, a]; Hornet: swap L&S and DT2); with one or
 * none, move the primary to the next firm hostile track by range (Hornet steps L&S down the ranked tracks).
 */
export function cycleDesignation(world: World, ac: Aircraft): void {
  const st = ac.radar;
  if (st.mode !== 'tws') return;
  if (st.designated.length >= 2) {
    const first = st.designated.shift();
    if (first) st.designated.push(first);
    return;
  }
  const firm = st.tracks
    .filter(t => t.firm && world.get(t.targetId)?.side !== ac.side)
    .sort((a, b) => a.pos.distanceTo(ac.pos) - b.pos.distanceTo(ac.pos));
  if (!firm.length) return;
  const i = firm.findIndex(t => t.targetId === st.designated[0]);
  st.designated = [firm[(i + 1) % firm.length].targetId];
}

export interface LockCheck { ok: boolean; reason: string }

/** Can this radar go STT on `targetId` right now? Reason in pilot words when not. */
export function canLock(world: World, ac: Aircraft, targetId: EntityId): LockCheck {
  const spec = specOf(ac), r = spec.radar, st = ac.radar;
  if (st.mode === 'off') return { ok: false, reason: 'Radar is off' };
  if (!r.modes.includes('stt')) return { ok: false, reason: `${spec.short} radar has no STT` };
  const tgt = world.get(targetId);
  if (!tgt || !tgt.alive || tgt.id === ac.id) return { ok: false, reason: 'No target' };
  const g = geoOf(ac, tgt.pos);
  if (Math.abs(g.az) > r.gimbalAzDeg * D2R || Math.abs(g.el) > r.gimbalElDeg * D2R) {
    return { ok: false, reason: `Target outside the gimbal (±${r.gimbalAzDeg}°)` };
  }
  const lockR = LOCK_RANGE_FACTOR * detectionRange(world, ac, tgt);
  if (g.range > lockR) return { ok: false, reason: `Too far to lock: ${(g.range / 1000).toFixed(0)} km, lock range ${(lockR / 1000).toFixed(0)} km` };
  if (isNotched(world, ac, tgt)) return { ok: false, reason: 'Target is in the notch' };
  return { ok: true, reason: '' };
}

/**
 * STT on `targetId` if canLock() allows. Other track files are dropped (DCS: STT shows only the locked
 * target), designations become [targetId], the previous search mode is remembered for unlock/break.
 */
export function lockTarget(world: World, ac: Aircraft, targetId: EntityId): boolean {
  if (!canLock(world, ac, targetId).ok) return false;
  const spec = specOf(ac), st = ac.radar, ist = inner(st);
  const tgt = world.get(targetId);
  if (!tgt) return false;
  if (st.mode === 'stt') {
    if (st.stt.targetId === targetId) return true;
    if (st.stt.targetId) emitLock(world, ac, st.stt.targetId, 'unlocked');
  } else if (st.mode === 'rws' || st.mode === 'tws' || st.mode === 'vs' || st.mode === 'acm') {
    ist.prevSearch = st.mode;
    if (st.mode !== 'acm') ist.prevBvr = st.mode;
  }
  dropAllTracks(world, ac, targetId);
  let trk = trackOf(st, targetId);
  if (!trk) trk = createTrack(world, ac, targetId, tgt.pos);
  if (!trk.firm) { trk.firm = true; trk.vel.copy(tgt.vel); emitTrack(world, ac, targetId, 'firm'); }
  trk.coasting = false;
  trk.lastHit = world.t;
  st.bricks.length = 0;
  st.designated = [targetId];
  st.snp2 = false;
  st.mode = 'stt';
  st.stt = { targetId, lostFor: 0 };
  const g = geoOf(ac, tgt.pos);
  st.beamAz = g.az;
  st.beamEl = g.el;
  emitLock(world, ac, targetId, 'locked');
  return true;
}

/**
 * Unlock / return to search, per jet:
 * - STT: back to the search mode it came from (an ACM lock returns to the last BVR mode). In TWS, multi-target
 *   jets keep the target as the primary designation; FC3 Russian jets clear its track and designation.
 * - TWS: drop all designations (F-15C "Return To Search/NDTWS"); FC3 Russian jets also drop those tracks.
 * - ACM: leave ACM for the last BVR search mode.
 */
export function unlock(world: World, ac: Aircraft): void {
  const st = ac.radar, ist = inner(st), rules = radarRules(ac.type);
  if (st.mode === 'stt') {
    const id = st.stt.targetId;
    if (id) emitLock(world, ac, id, 'unlocked');
    const back = ist.prevSearch === 'acm' ? ist.prevBvr : ist.prevSearch;
    returnToSearch(world, ac, back, id, rules.unlockKeepsDesignation);
    const now = st.mode as RadarModeId; // returnToSearch changed it
    if (now === 'rws' || now === 'tws' || now === 'vs') ist.prevSearch = now;
  } else if (st.mode === 'tws') {
    const des = [...st.designated];
    st.designated = [];
    if (!rules.unlockKeepsDesignation) for (const id of des) dropTrack(world, ac, id);
  } else if (st.mode === 'acm') {
    setRadarMode(world, ac, ist.prevBvr);
  }
}

/** Change the scan, validated against the spec and the mode (TWS limits). Values snap to the jet's options. */
export function setScan(world: World, ac: Aircraft, change: ScanChange): void {
  const spec = specOf(ac), r = spec.radar, st = ac.radar, ist = inner(st);
  if (change.autoCenter !== undefined) ist.autoCenter = change.autoCenter;
  if (change.azHalf !== undefined) st.azHalf = snap(r.azHalfWidthOptionsDeg, change.azHalf * R2D) * D2R;
  if (change.bars !== undefined) st.bars = snap(r.barOptions, change.bars);
  if (st.mode === 'tws') applyTwsLimits(spec, st, change.bars !== undefined && change.azHalf === undefined ? 'bars' : 'az');
  if (change.azCenter !== undefined) {
    const pos = r.azCenterOptionsDeg;
    st.azCenter = pos ? snap(pos, change.azCenter * R2D) * D2R : change.azCenter;
  }
  if (change.expectedRange !== undefined && Number.isFinite(change.expectedRange) && st.expectedRange !== null) {
    const heightDifference = st.expectedRange * Math.tan(st.elCenter);
    st.expectedRange = clamp(change.expectedRange, 1000, Math.max(...r.rangeScalesKm) * 1000);
    st.elCenter = Math.atan2(heightDifference, st.expectedRange);
  }
  // An explicit elevation in the same command overrides range-angle re-aiming.
  if (change.elCenter !== undefined) st.elCenter = change.elCenter;
  clampCenters(spec, st);
  if (change.rangeScale !== undefined) st.rangeScale = snap(r.rangeScalesKm, change.rangeScale / 1000) * 1000;
  if (change.cursor) setCursor(world, ac, change.cursor);
  if (st.mode !== 'stt') recomputeFrame(spec, st);
  else { st.bar = Math.min(st.bar, st.bars - 1); st.frameTime = frameTimeFor(spec, st.azHalf, st.bars); }
}

/**
 * Move only the display cursor (clamped to the gimbal and the longest range scale). Unlike setScan({cursor}),
 * it does not re-apply TWS limits or recompute the scan: cheap to call on every pointer move.
 */
export function setCursor(world: World, ac: Aircraft, cursor: { az: number; range: number }): void {
  const r = specOf(ac).radar;
  const maxR = Math.max(...r.rangeScalesKm) * 1000;
  const az = Number.isFinite(cursor.az) ? cursor.az : 0;
  const range = Number.isFinite(cursor.range) ? cursor.range : ac.radar.cursor.range;
  ac.radar.cursor = { az: clamp(az, -r.gimbalAzDeg * D2R, r.gimbalAzDeg * D2R), range: clamp(range, 0, maxR) };
}

function snap(options: number[], v: number): number {
  let best = options[0], bd = Infinity;
  for (const o of options) { const d = Math.abs(o - v); if (d < bd - 1e-9) { bd = d; best = o; } }
  return best;
}


/** DCS MiG-29S СНП2 limits, from the FC3 MiG-29 manual. */
export const SNP2_MAX_SEP_DEG = 8;
export const SNP2_MAX_G = 3;
export interface Snp2Eligibility {
  ok: boolean;
  reason: string;
  targetIds: [EntityId, EntityId] | null;
  sepDeg: number | null;
}

export function snp2SeparationDeg(ac: Aircraft, a: EntityId, b: EntityId): number | null {
  const ta = trackOf(ac.radar, a), tb = trackOf(ac.radar, b);
  if (!ta || !tb) return null;
  return Math.abs(wrapPi(relBearing(ac.pos, ac.heading, ta.pos) - relBearing(ac.pos, ac.heading, tb.pos))) * R2D;
}

/** Pair eligibility is shared by launch and datalink support; it uses radar positions, never truth positions. */
export function snp2Eligibility(world: World, ac: Aircraft, allowCoasting = false): Snp2Eligibility {
  const st = ac.radar;
  const [lead, second] = st.designated;
  const targetIds: [EntityId, EntityId] | null = lead && second && lead !== second ? [lead, second] : null;
  const sepDeg = targetIds ? snp2SeparationDeg(ac, lead, second) : null;
  const fail = (reason: string): Snp2Eligibility => ({ ok: false, reason, targetIds, sepDeg });
  if (ac.type !== 'mig29s' || !st.snp2 || st.mode !== 'tws') return fail('Select MiG-29S СНП2');
  if (!ac.alive) return fail('Shooter unavailable');
  if (!targetIds) return fail('No Ц2: need two tracks within 8°');
  if (sepDeg === null || sepDeg > SNP2_MAX_SEP_DEG + 1e-9) return fail('Ц2 outside the 8° strobe');
  for (const id of targetIds) {
    const t = trackOf(st, id), target = world.get(id);
    if (!target?.alive || target.side === ac.side) return fail('СНП2 needs two live hostile targets');
    if (!t?.firm || (t.coasting && !allowCoasting)) return fail('СНП2 needs two fresh, firm tracks');
    if (target.g > SNP2_MAX_G) return fail(`${t.label} over 3 g: СНП2 drops to one track`);
    if (target.jamming) return fail(`${t.label} jamming: СНП2 drops to one track`);
    const g = geoOf(ac, t.pos), limits = scanElevationLimits(specOf(ac), st);
    if (Math.abs(g.az - st.azCenter) > st.azHalf || g.el < limits.bottom || g.el > limits.top) return fail('Ц2 outside scan coverage');
  }
  return { ok: true, reason: '', targetIds, sepDeg };
}

/** Closest eligible secondary in azimuth. ECM is only a scenario flag, not an ECM propagation model. */
export function pickSnp2Second(world: World, ac: Aircraft, lead: EntityId): EntityId | null {
  return ac.radar.tracks.filter(t => {
    const target = world.get(t.targetId), sep = snp2SeparationDeg(ac, lead, t.targetId);
    return t.targetId !== lead && t.firm && !t.coasting && target?.alive && target.side !== ac.side
      && target.g <= SNP2_MAX_G && !target.jamming && sep !== null && sep <= SNP2_MAX_SEP_DEG + 1e-9;
  }).sort((a, b) => (snp2SeparationDeg(ac, lead, a.targetId) ?? Infinity) - (snp2SeparationDeg(ac, lead, b.targetId) ?? Infinity))[0]?.targetId ?? null;
}

function refreshSnp2(world: World, ac: Aircraft): void {
  const st = ac.radar, lead = st.designated[0];
  if (!lead) return;
  if (st.designated.length < 2) {
    const second = pickSnp2Second(world, ac, lead);
    if (second) st.designated = [lead, second];
  }
  if (st.designated.length >= 2 && !snp2Eligibility(world, ac, true).ok) {
    st.designated = [lead];
    st.snp2 = false;
  }
}

/** Explicitly enter/leave СНП2. Ordinary СНП and other aircraft retain their normal launch rules. */
export function setSnp2(world: World, ac: Aircraft, enabled: boolean): boolean {
  if (ac.type !== 'mig29s') return false;
  if (enabled && ac.radar.mode !== 'tws') setRadarMode(world, ac, 'tws');
  ac.radar.snp2 = enabled;
  if (enabled) refreshSnp2(world, ac);
  else ac.radar.designated = ac.radar.designated.slice(0, 1);
  return true;
}

// ───────────────────────────────────────────────────────────── missile support

/** A firm track (coasting or not) the jet may datalink: coasting tracks send their extrapolation (DCS 2.8.7). */
function isSupportable(st: RadarState, targetId: EntityId, rules: RadarRules): boolean {
  const trk = trackOf(st, targetId);
  return !!trk && trk.firm && (!rules.supportNeedsDesignation || st.designated.includes(targetId));
}

/**
 * TWS: targets whose ARH missiles (pre-pitbull) currently get datalink updates, at most
 * tws.maxSimultaneousTargets, designated targets first. Empty outside TWS or on jets without launchFromTws.
 */
export function supportedTargets(world: World, ac: Aircraft): Set<EntityId> {
  const set = new Set<EntityId>();
  const st = ac.radar, tws = specOf(ac).radar.tws;
  if (st.mode !== 'tws' || !tws || (!tws.launchFromTws && !snp2Eligibility(world, ac, true).ok)) return set;
  const rules = radarRules(ac.type);
  const ids: EntityId[] = [];
  for (const m of world.missiles.values()) {
    if (!m.alive || m.shooterId !== ac.id || !m.targetId || m.guidance === 'active') continue;
    if (MISSILES[m.type].seeker !== 'arh' || ids.includes(m.targetId)) continue;
    ids.push(m.targetId);
  }
  const rank = (id: EntityId) => {
    const d = st.designated.indexOf(id);
    return d >= 0 ? d : 100 + st.tracks.findIndex(t => t.targetId === id);
  };
  ids.sort((a, b) => rank(a) - rank(b));
  for (const id of ids) {
    if (set.size >= tws.maxSimultaneousTargets) break;
    if (isSupportable(st, id, rules)) set.add(id);
  }
  return set;
}

/**
 * Does `shooter`'s radar currently support a missile against `targetId`?
 * - datalink: STT on the target, or (jets with tws.launchFromTws) a firm TWS track inside the jet's
 *   simultaneous-target limit (designated only on F-15C / JF-17). Support lasts while the track file exists:
 *   a coasting track (missed revisit, STT memory) sends its extrapolation, never the truth (DCS 2.8.7), and
 *   support ends when the track is dropped, the lock breaks, or the radar leaves the mode.
 * - illuminating: STT on the target with lostFor = 0 (SARH needs it continuously).
 * - estimate: the radar's track estimate (not truth), when datalink is true.
 */
export function guidanceSupport(world: World, shooter: Aircraft, targetId: EntityId | null): GuidanceSupport {
  const none: GuidanceSupport = { datalink: false, illuminating: false, estimate: null };
  if (!targetId || !shooter.alive) return none;
  const st = shooter.radar;
  const trk = trackOf(st, targetId);
  if (!trk) return none;
  const est = () => ({ pos: trk.pos.clone(), vel: trk.vel.clone() });
  if (st.mode === 'stt' && st.stt.targetId === targetId) {
    return { datalink: true, illuminating: st.stt.lostFor <= 0, estimate: est() };
  }
  if (st.mode === 'tws') {
    const tws = specOf(shooter).radar.tws;
    if (!tws || (!tws.launchFromTws && !snp2Eligibility(world, shooter, true).ok)) return none;
    const set = supportedTargets(world, shooter);
    const ok = set.has(targetId) || (set.size < tws.maxSimultaneousTargets && isSupportable(st, targetId, radarRules(shooter.type)));
    return ok ? { datalink: true, illuminating: false, estimate: est() } : none;
  }
  return none;
}

/** Does the radar currently hold a track (TWS or STT) on this target? */
export function hasTrack(ac: Aircraft, targetId: EntityId): boolean {
  return ac.radar.tracks.some(t => t.targetId === targetId);
}
