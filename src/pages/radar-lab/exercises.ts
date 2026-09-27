/**
 * [OWNER: page-radar-lab] Guided exercises: each builds a scene (targets, own altitude, starting scan),
 * lists its steps, and evaluates a snapshot of the lab (pure, unit-tested) into step states, coach text
 * and optional commands for the scripted bandits. The page turns the world into Snap objects.
 */
import { AIRCRAFT } from '../../data/aircraft';
import type { FighterId, RadarModeId } from '../../data/types';
import type { RadarLabTarget } from '../../sim/scenarios';
import { blocOf, defaultAdversary } from '../../sim/scenarios';
import { BURN_THROUGH_M, OWN_JAMMER, STROBE_RANGE_FACTOR } from '../../data/ecm';
import { M_PER_FT, MPS_PER_KT, R2D } from '../../sim/math';
import type { Units } from '../../app/format';
import {
  alt, beamWindowDeg, bugOnlyOptions, clock, dAlt, detectKm, frameTime, gateText, lookDownCaveat, metresPerDegree,
  minFrame, niceAlt, niceRange, patternHalfDeg, rangeScaleFor, rng, sdeg, seconds, speedText,
} from './geometry';
import { jamFacts } from './jamming';
import { iffFacts } from './iff';
import { dlFacts } from './datalink';

export type ExerciseId = 'free' | 'low' | 'revisit' | 'notch' | 'aspect' | 'centre' | 'jam' | 'iff' | 'dl';
/** Graded exercises in order (Free scan is not graded). */
export const EXERCISES: Exclude<ExerciseId, 'free'>[] = ['low', 'revisit', 'notch', 'aspect', 'centre', 'jam', 'iff', 'dl'];

export type Tone = 'caution' | 'warning' | 'ok' | 'hi' | 'dim';

export interface ScanPreset {
  mode: Extract<RadarModeId, 'rws' | 'tws' | 'vs'>;
  azHalfDeg: number;
  bars: number;
  azCenterDeg: number;
  elCenterDeg: number;
  rangeScaleM: number;
  cursorM: number;
  /** FC3 range-angle input, independent of cursorM; old presets start at cursorM. */
  expectedRangeM?: number;
}

export interface SceneTarget extends RadarLabTarget {
  role: string;
  /** Spawn with its self-protection jammer on (scenario flag). */
  jamming?: boolean;
  /** Flies for the player's side (IFF exercise): answers the player's IFF. */
  friendly?: boolean;
}

export interface Scene {
  playerAlt: number;
  playerMach: number;
  targets: SceneTarget[];
  scan: ScanPreset;
  /** Restart the scene after this many sim seconds (geometry drifts as everyone flies). */
  maxTime: number;
  /** Restart when a closing target gets this close (m). */
  minRange: number;
  /** A friendly AWACS orbits behind the player (datalink exercise). */
  awacs?: boolean;
  /** Start with the own radar off (FC3 datalink: the picture starts when the radar is switched on). */
  radarOff?: boolean;
}

export interface StepText { id: string; text: string; keys?: string }

/** What the evaluator knows about one target right now. Angles in degrees, distances in metres. */
export interface TargetSnap {
  id: string;
  role: string;
  callsign: string;
  range: number;
  groundRange: number;
  alt: number;
  az: number;
  el: number;
  inGimbal: boolean;
  inAz: boolean;
  inBars: boolean;
  beyond: boolean;
  notched: boolean;
  detectable: boolean;
  detectRange: number;
  /** m/s, target speed along the line of sight vs the ground (what the notch looks at). */
  radial: number;
  groundSpeed: number;
  /** Painted within the last revisit + 1 s (on the scope now). */
  seenNow: boolean;
  /** Sim time of the last paint, or null. */
  lastPaint: number | null;
  /** Ground range at the first paint of this scene, or null. */
  firstSeenRange: number | null;
  /** The pilot clicked it (Why panel) at least once in this exercise. */
  inspected: boolean;
}

export interface Snap {
  t: number;
  ac: FighterId;
  units: Units;
  mode: RadarModeId;
  ownAlt: number;
  frame: number;
  revisit: number;
  bars: number;
  azHalfDeg: number;
  azCenterDeg: number;
  elCenterDeg: number;
  cursorRange: number;
  /** Coverage at the cursor range (m, absolute). */
  covTop: number;
  covBottom: number;
  selectedId: string | null;
  targets: TargetSnap[];
  /** The first jamming scene target, as the own radar holds it (jam exercise). */
  jam?: JamSnap;
  /** The friend and the hostile of the IFF exercise, as the own IFF holds them. */
  iff?: IffSnap;
  /** The own datalink picture (datalink exercise), as the display gets it. */
  dl?: DlSnap;
}

/** One datalink track as the own picture holds it. Angles in degrees off the nose, range in metres, age in s. */
export interface DlTrackSnap {
  targetId: string;
  source: 'awacs' | 'donor' | 'ppli';
  donorLabel: string | null;
  az: number;
  range: number;
  correlated: boolean;
  age: number;
}

/** What the own datalink and radar hold (datalink exercise). */
export interface DlSnap {
  radarOn: boolean;
  tracks: DlTrackSnap[];
  /** STT holding: on a datalink track (AWACS or donor), on a friend's PPLI, on something else, or none. */
  lock: 'dl' | 'ppli' | 'other' | null;
}

/** What the own IFF and radar hold on the IFF exercise's two contacts. Angles in degrees. */
export interface IffSnap {
  friendId: string;
  hostileId: string;
  /** On the scope now (painted within the brick life). */
  friendSeen: boolean;
  hostileSeen: boolean;
  /** Bearing off the nose (truth, used only once the friend has answered). */
  friendAz: number;
  hostileAz: number;
  /** Own IFF shows the friend's reply now (Viper: 2 s). */
  friendReply: boolean;
  /** Seconds since the friend's last reply, or null if he never answered. */
  replyAge: number | null;
  /** The hostile was asked (an interrogation or the auto IFF): no reply. */
  hostileAsked: boolean;
  /** Which of the two the radar holds in STT (holding, not in memory). */
  stt: 'friend' | 'hostile' | null;
}

/** What the own radar holds on a jammer. Angles in degrees, distances in metres (range is truth, for the coach). */
export interface JamSnap {
  targetId: string;
  jamming: boolean;
  /** Bearing off the nose. */
  az: number;
  range: number;
  burnThrough: number;
  /** A fresh strobe on him in the radar state. */
  strobe: boolean;
  /** Angle-only jam lock on him. */
  hoj: boolean;
  /** Ordinary STT on him, holding (range, altitude and aspect known). */
  stt: boolean;
}

export interface Eval {
  /** Live or latched state of each step, in step order. */
  steps: boolean[];
  /** Index of the step to highlight, or null. */
  current: number | null;
  text: string;
  why: string;
  tone?: Tone;
  done: boolean;
  /** Scripted bandit command the page should apply now. */
  command?: { index: number; maneuver: 'beam' | 'hot' };
}

/** Per-exercise memory kept by the page between evaluations (latched steps, phases). */
export interface Mem {
  latched: boolean[];
  phase?: string;
  since?: number;
  okSince?: number | null;
  /** Jam exercise: the reason the radar gave when a normal lock was refused. */
  reason?: string;
}

export interface ExerciseDef {
  id: ExerciseId;
  num: number;
  title: string;
  /** One-line purpose for the picker. */
  short: string;
  /** null when the jet can do it, else a plain sentence why not. */
  unavailable(ac: FighterId): string | null;
  scene(ac: FighterId, u: Units): Scene;
  steps(ac: FighterId, u: Units, keys: StepKeys): StepText[];
  evaluate(s: Snap, mem: Mem): Eval;
}

/** Key texts the steps can show (from labKeys), null when the jet has none. */
export interface StepKeys { elev: string | null; zone: string | null; width: string | null; cursor: string | null; expRange: string | null; lock?: string | null }

// ------------------------------------------------------------------------------------------ helpers

const PLAYER_MACH = 0.8;
const FRAME_GOAL = 3;

function r(ac: FighterId) { return AIRCRAFT[ac].radar; }
function opp(ac: FighterId): FighterId { return defaultAdversary(ac); }

/** Widest azimuth ≤ gimbal and 4 bars when offered: the sim's own default scan. */
function defaultScan(ac: FighterId): { azHalfDeg: number; bars: number } {
  const rs = r(ac);
  return { azHalfDeg: Math.min(Math.max(...rs.azHalfWidthOptionsDeg), rs.gimbalAzDeg), bars: rs.barOptions.includes(4) ? 4 : rs.barOptions[0] };
}

/** The selectable azimuth option closest to `want` (ties go wide). */
function azNear(ac: FighterId, want: number): number {
  const bug = bugOnlyOptions(ac).az;
  const opts = r(ac).azHalfWidthOptionsDeg.filter(a => !bug.includes(a));
  return opts.reduce((best, a) => (Math.abs(a - want) < Math.abs(best - want) - 1e-9 || (Math.abs(a - want) === Math.abs(best - want) && a > best) ? a : best), opts[0]);
}

/** Smallest selectable azimuth option ≥ want (else the widest). */
function azAtLeast(ac: FighterId, want: number): number {
  const bug = bugOnlyOptions(ac).az;
  const opts = r(ac).azHalfWidthOptionsDeg.filter(a => !bug.includes(a)).sort((a, b) => a - b);
  return opts.find(a => a >= want) ?? opts[opts.length - 1];
}

/** Smallest selectable bar count whose pattern is at least `heightDeg` tall (else the most bars). */
function barsForHeight(ac: FighterId, heightDeg: number): number {
  const bug = bugOnlyOptions(ac).bars;
  const opts = r(ac).barOptions.filter(b => !bug.includes(b)).sort((a, b) => a - b);
  return opts.find(b => 2 * patternHalfDeg(r(ac), b) >= heightDeg) ?? opts[opts.length - 1];
}

function roundHalf(x: number) { return Math.round(x * 2) / 2; }

function latch(mem: Mem, i: number, v: boolean): boolean {
  if (v) mem.latched[i] = true;
  return !!mem.latched[i];
}

function firstOpen(steps: boolean[]): number | null {
  const i = steps.findIndex(s => !s);
  return i < 0 ? null : i;
}

const isRu = (ac: FighterId) => AIRCRAFT[ac].display === 'ru-hud';
/** ' Simplified: …' for jets whose DCS look-down rule differs from the sim's flat factor, else ''. */
const ldNote = (ac: FighterId) => { const c = lookDownCaveat(ac, true); return c ? ' ' + c : ''; };

// ------------------------------------------------------------------------------------------ free scan

const free: ExerciseDef = {
  id: 'free', num: 0, title: 'Free scan',
  short: 'Five bandits, one of each reason you lose a contact',
  unavailable: () => null,
  scene(ac, u) {
    const t = opp(ac), rs = r(ac);
    const hot = detectKm(rs, t, 0, false) * 1000;
    const tail = detectKm(rs, t, 180, false) * 1000;
    const own = niceAlt(9000, u);
    const targets: SceneTarget[] = [
      { role: 'painted', range: 0.55 * hot, bearingDeg: -8, alt: own + 500, aspectDeg: 0 },
      { role: 'high', range: 0.45 * hot, bearingDeg: 12, alt: Math.min(15000, own + 0.45 * hot * Math.tan(10 / R2D)), aspectDeg: 20, turn: 'left' },
      { role: 'low beaming', range: 0.5 * hot, bearingDeg: -18, alt: 1500, aspectDeg: 90, maneuver: 'beam' },
      { role: 'cold, far', range: 1.2 * tail, bearingDeg: 4, alt: own + 300, aspectDeg: 180 },
      { role: 'wide', range: 0.5 * hot, bearingDeg: 50, alt: own, aspectDeg: 30 },
    ].map((x, i) => ({ ...x, type: t, callsign: `Bandit-${i + 1}` }) as SceneTarget);
    const far = Math.max(...targets.map(x => x.range));
    const d = defaultScan(ac);
    return {
      playerAlt: own, playerMach: PLAYER_MACH, targets,
      scan: { mode: 'rws', azHalfDeg: azNear(ac, 30), bars: d.bars, azCenterDeg: 0, elCenterDeg: 0, rangeScaleM: rangeScaleFor(rs, far * 1.15), cursorM: targets[0].range },
      maxTime: 150, minRange: 10000,
    };
  },
  steps: () => [
    { id: 'seen', text: 'Click a bandit that is on your scope' },
    { id: 'az', text: 'Find one outside the scan azimuth' },
    { id: 'bars', text: 'Find one above or below the bars' },
    { id: 'range', text: 'Find one beyond detection range' },
    { id: 'notch', text: 'Find one in the Doppler notch' },
  ],
  evaluate(s, mem) {
    const sel = s.targets.find(x => x.id === s.selectedId);
    const steps = [
      latch(mem, 0, !!sel && sel.seenNow),
      latch(mem, 1, !!sel && sel.inGimbal && !sel.inAz),
      latch(mem, 2, !!sel && !sel.inBars),
      latch(mem, 3, !!sel && sel.beyond),
      latch(mem, 4, !!sel && sel.notched),
    ];
    const all = steps.every(Boolean);
    return {
      steps, current: firstOpen(steps), done: false, tone: all ? 'ok' : undefined,
      text: all
        ? 'All four ways to lose a contact found. Change the scan and watch which bandits come and go.'
        : 'Five bandits, one for each way a contact goes missing. Click a jet in the 3D view, on the radar or in the side view: the Why panel says what the radar sees.',
      why: 'Azimuth, bars, range and the notch: check them in that order when a bandit GCI calls is not on your scope.',
    };
  },
};

// ------------------------------------------------------------------------------------------ 1. low bandit

const low: ExerciseDef = {
  id: 'low', num: 1, title: 'Find the low bandit',
  short: 'Tilt the antenna down until a low bandit paints',
  unavailable: () => null,
  scene(ac, u) {
    const t = opp(ac), rs = r(ac);
    const ld = detectKm(rs, t, 0, true) * 1000;
    const range = niceRange(Math.min(60000, 0.78 * ld), u);
    const own = u === 'metric' ? 9000 : 30000 * M_PER_FT;
    const tAlt = u === 'metric' ? 1000 : 3000 * M_PER_FT;
    const d = defaultScan(ac);
    const scale = rangeScaleFor(rs, range * 1.3);
    return {
      playerAlt: own, playerMach: PLAYER_MACH,
      targets: [{ role: 'low', callsign: 'Bandit', type: t, range, bearingDeg: 3, alt: tAlt, aspectDeg: 0 }],
      scan: { mode: 'rws', azHalfDeg: d.azHalfDeg, bars: d.bars, azCenterDeg: 0, elCenterDeg: 0, rangeScaleM: scale, cursorM: Math.round(range * 0.45) },
      maxTime: 120, minRange: 8000,
    };
  },
  steps(ac, u, k) {
    const sc = this.scene(ac, u), tg = sc.targets[0];
    return [
      { id: 'cursor', text: `Cursor to his range, ${rng(tg.range, u)}`, keys: isRu(ac) ? k.expRange ?? k.cursor ?? undefined : k.cursor ?? undefined },
      { id: 'tilt', text: `Tilt down until ${alt(tg.alt, u)} is inside the coverage`, keys: k.elev ?? undefined },
      { id: 'paint', text: 'Hold it until he paints' },
    ];
  },
  evaluate(s, mem) {
    const tg = s.targets[0];
    const u = s.units;
    if (!tg) return { steps: [false, false, false], current: 0, text: '', why: '', done: false };
    const cursorOk = Math.abs(s.cursorRange - tg.groundRange) <= 0.15 * tg.groundRange;
    const steps = [latch(mem, 0, cursorOk), latch(mem, 1, tg.inBars && (mem.latched[0] || cursorOk)), latch(mem, 2, tg.seenNow && tg.inBars)];
    const done = steps[2];
    if (done) { mem.latched = [true, true, true]; }
    const perDeg = metresPerDegree(tg.groundRange);
    const need = tg.el - s.elCenterDeg;
    let text: string, why: string, tone: Tone | undefined;
    if (done) {
      text = `Painted at ${rng(tg.firstSeenRange ?? tg.groundRange, u)}, ${Math.abs(tg.el).toFixed(1)}° below your horizon. A level scan never sees him there: look down with the antenna, not the nose.`;
      why = `Coverage ≈ range × tan(angle): at ${rng(tg.groundRange, u)} one degree is ${alt(perDeg, u)} of altitude.`;
      tone = 'ok';
    } else if (!steps[0]) {
      text = `GCI: single bandit, ${rng(tg.groundRange, u)} on the nose, ${alt(tg.alt, u)}, hot. You are at ${alt(s.ownAlt, u)} with the antenna level. Put the cursor at ${rng(tg.groundRange, u)}.`;
      why = 'The two coverage numbers are only true at the cursor range: read them where the bandit is.';
    } else if (!tg.inBars) {
      text = `At ${rng(s.cursorRange, u)} your bars cover ${alt(Math.max(0, s.covBottom), u)} to ${alt(s.covTop, u)}. He is at ${alt(tg.alt, u)}: tilt the antenna ${need < 0 ? 'down' : 'up'} about ${Math.abs(need).toFixed(0)}°.`;
      why = `At ${rng(tg.groundRange, u)}, 1° of antenna moves the coverage ${alt(perDeg, u)}.`;
    } else if (tg.beyond) {
      text = `He is inside the bars but beyond your look-down range (${rng(tg.detectRange, u)}). Hold the tilt while you close.`;
      why = 'Look-down shortens detection: the target sits against ground clutter.';
      tone = 'caution';
    } else {
      text = `He is inside the bars now. Wait for the beam to come round: one frame is ${seconds(s.frame)}.`;
      why = 'The radar only sees him when the beam crosses him on the right bar.';
      tone = 'hi';
    }
    return { steps, current: done ? null : firstOpen(steps), text, why, tone, done };
  },
};

// ------------------------------------------------------------------------------------------ 2. revisit

const revisit: ExerciseDef = {
  id: 'revisit', num: 2, title: 'Faster revisit',
  short: `Frame time under ${FRAME_GOAL} s with the whole group still in the scan`,
  unavailable(ac) {
    if (minFrame(ac) <= FRAME_GOAL + 1e-9) return null;
    const rs = r(ac), d = defaultScan(ac);
    return `The ${rs.name} scan is fixed in DCS at ${2 * d.azHalfDeg}° × ${d.bars} bars: one frame always takes ${seconds(frameTime(rs, d.azHalfDeg, d.bars))}. There is no width or bar trade to make; exercise 5 shows what you can do: point the window.`;
  },
  scene(ac, u) {
    const t = opp(ac), rs = r(ac);
    const hot = detectKm(rs, t, 0, false) * 1000;
    const range = niceRange(0.62 * hot, u);
    const own = niceAlt(9000, u);
    const d = defaultScan(ac);
    const base = { type: t, range, aspectDeg: 0 };
    return {
      playerAlt: own, playerMach: PLAYER_MACH,
      targets: [
        { ...base, role: 'group left', callsign: 'Bandit-1', bearingDeg: 5.5, alt: own + 300 },
        { ...base, role: 'group lead', callsign: 'Bandit-2', bearingDeg: 10, alt: own - 300 },
        { ...base, role: 'group right', callsign: 'Bandit-3', bearingDeg: 14.5, alt: own + 700 },
      ],
      scan: { mode: 'rws', azHalfDeg: d.azHalfDeg, bars: d.bars, azCenterDeg: 0, elCenterDeg: 0, rangeScaleM: rangeScaleFor(rs, range * 1.3), cursorM: range },
      maxTime: 150, minRange: 12000,
    };
  },
  steps(_ac, _u, k) {
    return [
      { id: 'frame', text: `Frame time ${FRAME_GOAL} s or less`, keys: k.width ?? undefined },
      { id: 'cover', text: 'All three inside azimuth and bars', keys: k.zone ?? undefined },
      { id: 'paint', text: 'All three painted at that setting' },
    ];
  },
  evaluate(s, mem) {
    const u = s.units;
    const g = s.targets;
    const fast = s.frame <= FRAME_GOAL + 1e-6;
    const out = g.filter(x => !(x.inAz && x.inBars));
    const covered = out.length === 0;
    if (fast && covered) { if (mem.okSince == null) mem.okSince = s.t; } else mem.okSince = null;
    const fresh = fast && covered && mem.okSince != null && g.every(x => x.lastPaint != null && x.lastPaint >= (mem.okSince ?? Infinity));
    const done = latch(mem, 2, fresh);
    const steps = done ? [true, true, true] : [fast, covered, false];
    if (done) mem.latched = [true, true, true];
    let text: string, why: string, tone: Tone | undefined;
    const scanTxt = `±${s.azHalfDeg}° × ${s.bars}B`;
    if (done) {
      text = `Done: ${scanTxt} refreshes the group every ${seconds(s.frame)}. You paid for it with ${s.bars < 4 ? 'a thinner altitude slice' : 'a narrower window'}: anything outside it is now invisible.`;
      why = 'Wide and tall for search, small and fast once you know where the group is.';
      tone = 'ok';
    } else if (!fast && !covered) {
      const lead = g[1] ?? g[0];
      text = `The group is at ${rng(lead?.groundRange ?? 0, u)}, ${sdeg(lead?.az ?? 0, 0)} off the nose. Your ${scanTxt} takes ${seconds(s.frame)} per frame. Get it under ${FRAME_GOAL} s and keep all three in.`;
      why = 'Frame time = bars × scan width ÷ antenna speed. Halve either and the revisit halves.';
    } else if (!fast) {
      text = `All three are in the scan, but one look every ${seconds(s.frame)} is slow. Narrow the azimuth or drop bars until the frame is under ${FRAME_GOAL} s.`;
      why = 'A group that splits or turns shows up one frame late.';
    } else if (!covered) {
      const why1 = out.some(x => !x.inAz) ? 'azimuth' : 'bars';
      text = `${seconds(s.frame)} per frame, but ${out.map(x => x.callsign).join(' and ')} ${out.length > 1 ? 'are' : 'is'} outside the ${why1}. ${why1 === 'azimuth' ? 'Move the scan centre toward the group' : 'Tilt the antenna or add a bar'}.`;
      why = 'A fast scan that misses the group is worth nothing.';
      tone = 'caution';
    } else {
      text = `${scanTxt}: ${seconds(s.frame)} and all three inside. Wait one frame for fresh hits on all three.`;
      why = 'Fresh hits prove the setting works.';
      tone = 'hi';
    }
    return { steps, current: done ? null : firstOpen(steps), text, why, tone, done };
  },
};

// ------------------------------------------------------------------------------------------ 3. notch

const notch: ExerciseDef = {
  id: 'notch', num: 3, title: 'The notch',
  short: 'A bandit beams you and vanishes; turn him hot and he returns',
  unavailable: () => null,
  scene(ac, u) {
    const t = opp(ac), rs = r(ac);
    const ld = detectKm(rs, t, 0, true) * 1000;
    const range = niceRange(0.7 * ld, u);
    const own = niceAlt(9000, u);
    // A little below you: look-down (full-fidelity radars only notch against the ground) but a shallow angle,
    // so he stays in a tall bar pattern while you close on him during the beam.
    const tAlt = niceAlt(own - (u === 'metric' ? 1500 : 5000 * M_PER_FT), u);
    const bars = barsForHeight(ac, 8);
    const height = 2 * patternHalfDeg(rs, bars);
    const el = Math.atan2(tAlt - own, range) * R2D;
    return {
      playerAlt: own, playerMach: PLAYER_MACH,
      targets: [{ role: 'notcher', callsign: 'Bandit', type: t, range, bearingDeg: -6, alt: tAlt, aspectDeg: 0 }],
      scan: { mode: 'rws', azHalfDeg: azNear(ac, 30), bars, azCenterDeg: 0, elCenterDeg: roundHalf(el - 0.25 * height), rangeScaleM: rangeScaleFor(rs, range * 1.4), cursorM: range },
      maxTime: 170, minRange: 7000,
    };
  },
  steps: () => [
    { id: 'hot', text: 'He paints while hot' },
    { id: 'gone', text: 'He beams you and drops off the scope' },
    { id: 'back', text: 'Turn him hot: he comes back' },
  ],
  evaluate(s, mem) {
    const u = s.units, tg = s.targets[0];
    const rs = r(s.ac);
    if (!tg) return { steps: [false, false, false], current: 0, text: '', why: '', done: false };
    const gate = rs.notchKts * MPS_PER_KT;
    mem.phase ??= 'hot';
    let command: Eval['command'];
    if (mem.phase === 'hot') {
      if (tg.seenNow) { latch(mem, 0, true); mem.since ??= s.t; }
      if (mem.latched[0] && mem.since != null && s.t - mem.since >= 4) { mem.phase = 'beaming'; command = { index: 0, maneuver: 'beam' }; }
    } else if (mem.phase === 'beaming') {
      if (tg.notched && !tg.seenNow) { latch(mem, 1, true); mem.phase = 'gone'; }
    } else if (mem.phase === 'hotAgain') {
      if (tg.seenNow && !tg.notched && tg.lastPaint != null && tg.lastPaint >= (mem.since ?? 0)) { latch(mem, 2, true); mem.phase = 'done'; }
    }
    const steps = [!!mem.latched[0], !!mem.latched[1], !!mem.latched[2]];
    const done = steps.every(Boolean);
    const window = beamWindowDeg(rs.notchKts, tg.groundSpeed / MPS_PER_KT);
    const ff = rs.notchNeedsLookDown;
    const lookWhy = ff
      ? `The ${rs.name} only notches in look-down, with ground clutter behind him; above you the same beam would not hide him.`
      : `This trainer applies the FC3 gate at any look angle, as the AI table does; whether DCS needs look-down here is not confirmed.`;
    let text: string, why: string, tone: Tone | undefined;
    switch (mem.phase) {
      case 'hot':
        text = tg.seenNow
          ? `Painted. Radial speed ${speedText(tg.radial, u)} against your gate of ${gateText(gate, u)}. Watch him: he is about to turn.`
          : `Bandit, ${rng(tg.groundRange, u)}, ${alt(tg.alt, u)}, below you and hot. The antenna is already on him: wait for the paint.`;
        why = 'A pulse-Doppler radar keeps only returns that move against the ground.';
        tone = tg.seenNow ? 'hi' : undefined;
        break;
      case 'beaming':
        text = `He turns to put you on his beam. Radial speed ${speedText(tg.radial, u)}, falling toward the gate of ${gateText(gate, u)}.`;
        why = 'Beaming = flying at 90° to your line of sight: almost none of his speed points at you.';
        tone = 'caution';
        break;
      case 'gone':
        text = `Gone: ${speedText(tg.radial, u)} radial, inside the ${gateText(gate, u)} gate. Your radar throws him out with the ground clutter. Press Turn hot.`;
        why = lookWhy;
        tone = 'warning';
        break;
      case 'hotAgain':
        text = `He turns in: radial ${speedText(tg.radial, u)}. Wait for the beam to find him again.`;
        why = 'Once his radial speed clears the gate he is a normal target again.';
        tone = 'hi';
        break;
      default:
        text = `Back on the scope. With a ${gateText(gate, u)} gate and ${speedText(tg.groundSpeed, u)} of ground speed, he only has to hold his heading within ±${window.toFixed(0)}° of the beam to vanish.`;
        why = lookWhy;
        tone = 'ok';
    }
    return { steps, current: done ? null : firstOpen(steps), text, why, tone, done, command };
  },
};

/**
 * The notch exercise's two buttons. Returns true when the bandit should fly the manoeuvre. "Beam" waits for
 * the first hot paint (else step 1 could never tick); after the exercise is done both buttons replay it.
 */
export function notchPress(mem: Mem, m: 'beam' | 'hot', t: number): boolean {
  const phase = mem.phase ?? 'hot';
  if (m === 'beam') {
    if (!mem.latched[0] || phase === 'beaming' || phase === 'gone') return false;
    mem.phase = 'beaming';
    return true;
  }
  if (phase === 'gone') { mem.phase = 'hotAgain'; mem.since = t; return true; }
  if (phase === 'beaming') { mem.phase = 'hot'; mem.since = undefined; return true; }
  return false;
}

/** Button states for the notch exercise (disabled = the press would do nothing, with the reason). */
export function notchButtons(mem: Mem): { beam: string | null; hot: string | null; hotLit: boolean } {
  const phase = mem.phase ?? 'hot';
  const turning = phase === 'beaming' || phase === 'gone';
  return {
    beam: !mem.latched[0] ? 'Wait for the first paint while he is hot' : turning ? 'He is already beaming' : null,
    hot: turning ? null : 'He is already hot',
    hotLit: phase === 'gone',
  };
}

// ------------------------------------------------------------------------------------------ 4. aspect

const ASPECT_ROLES = ['Hot high', 'Hot low', 'Cold high', 'Cold low'] as const;

const aspect: ExerciseDef = {
  id: 'aspect', num: 4, title: 'Look-up, look-down, aspect',
  short: 'Hot or cold, above or below: who shows up first',
  unavailable: () => null,
  scene(ac, u) {
    const t = opp(ac), rs = r(ac);
    const hot = detectKm(rs, t, 0, false) * 1000;
    const range = niceRange(0.8 * hot, u);
    const own = niceAlt(9000, u);
    const hi = own + range * Math.tan(2 / R2D);
    const lo = Math.max(1000, own - range * Math.tan(3 / R2D));
    const bars = barsForHeight(ac, 8);
    const mid = (Math.atan2(hi - own, range) + Math.atan2(lo - own, range)) / 2 * R2D;
    const base = { type: t, range };
    return {
      playerAlt: own, playerMach: PLAYER_MACH,
      targets: [
        { ...base, role: 'hot-high', callsign: ASPECT_ROLES[0], bearingDeg: -15, alt: hi, aspectDeg: 0 },
        { ...base, role: 'hot-low', callsign: ASPECT_ROLES[1], bearingDeg: -5, alt: lo, aspectDeg: 0 },
        { ...base, role: 'cold-high', callsign: ASPECT_ROLES[2], bearingDeg: 5, alt: hi, aspectDeg: 180 },
        { ...base, role: 'cold-low', callsign: ASPECT_ROLES[3], bearingDeg: 15, alt: lo, aspectDeg: 180 },
      ],
      scan: { mode: 'rws', azHalfDeg: azAtLeast(ac, 20), bars, azCenterDeg: 0, elCenterDeg: roundHalf(mid), rangeScaleM: rangeScaleFor(rs, range * 1.2), cursorM: range },
      maxTime: 180, minRange: 12000,
    };
  },
  steps: () => [
    { id: 'hh', text: 'Hot high paints' },
    { id: 'hl', text: 'Hot low paints (look-down)' },
    { id: 'all', text: 'Click all four and compare their detection ranges' },
  ],
  evaluate(s, mem) {
    const u = s.units, rs = r(s.ac);
    const by = (role: string) => s.targets.find(x => x.role === role);
    const hh = by('hot-high'), hl = by('hot-low'), ch = by('cold-high'), cl = by('cold-low');
    if (!hh || !hl || !ch || !cl) return { steps: [false, false, false], current: 0, text: '', why: '', done: false };
    const steps = [latch(mem, 0, hh.firstSeenRange != null), latch(mem, 1, hl.firstSeenRange != null), latch(mem, 2, s.targets.every(x => x.inspected))];
    const done = steps.every(Boolean);
    const f = rs.detectKm.lookDownHeadOnFactor ?? rs.detectKm.lookDownFactor;
    const list = `hot high ${rng(hh.detectRange, u)}, hot low ${rng(hl.detectRange, u)}, cold high ${rng(ch.detectRange, u)}, cold low ${rng(cl.detectRange, u)}`;
    let text: string, why: string, tone: Tone | undefined;
    if (done) {
      text = `Your ${rs.name} sees ${list}. Hot and high shows first; a cold bandit running away may never show at all.`;
      why = f < 1 ? `Look-down ×${f}: the ground behind a low target hides part of the return.${ldNote(s.ac)}` : `The ${rs.name} table has no head-on look-down penalty; compare the cold targets for its tail-on rule.`;
      tone = 'ok';
    } else if (!steps[0]) {
      text = `Four bandits at ${rng(hh.groundRange, u)}: two hot, two cold; one of each above you, one below. Which does your ${rs.name} see first?`;
      why = `Head-on ${rng(rs.detectKm.headOn * 1000, u)}, tail-on ${rng(rs.detectKm.tail * 1000, u)} against a ${rs.detectKm.referenceRcsM2 ?? 5} m² fighter${f < 1 ? `, ×${f} in look-down` : ''}.`;
    } else if (!steps[1]) {
      text = `Hot high painted at ${rng(hh.firstSeenRange ?? 0, u)}. Hot low needs ${rng(hl.detectRange, u)}: he is ${rng(hl.groundRange, u)} out. Keep watching.`;
      why = f < 1
        ? `Look-down cuts detection ×${f} here: ground clutter sits behind him.${ldNote(s.ac)}`
        : `The ${rs.name} table has no look-down penalty: he paints as soon as he is inside the head-on range.`;
      tone = 'hi';
    } else if (!steps[2]) {
      const same = Math.abs((hh.firstSeenRange ?? 0) - (hl.firstSeenRange ?? 0)) < 3000;
      text = same && f >= 1
        ? `Both hot bandits painted together: the ${rs.name} has no head-on look-down penalty. The cold pair are still dark. Click each bandit and compare.`
        : `Hot low painted at ${rng(hl.firstSeenRange ?? 0, u)}, later than hot high. The cold pair are still dark. Click each bandit and compare its detection range.`;
      why = `Tail-on, a fighter is seen at ${rng(rs.detectKm.tail * 1000, u)}: running bandits stay invisible.`;
      tone = 'hi';
    } else {
      text = list; why = ''; tone = 'ok';
    }
    return { steps, current: done ? null : firstOpen(steps), text, why, tone, done };
  },
};

// ------------------------------------------------------------------------------------------ 5. scan centre

const centre: ExerciseDef = {
  id: 'centre', num: 5, title: 'Point the scan',
  short: 'Move the scan centre onto an off-nose group and cut the frame time',
  unavailable: () => null,
  scene(ac, u) {
    const t = opp(ac), rs = r(ac);
    const hot = detectKm(rs, t, 0, false) * 1000;
    const range = niceRange(0.6 * hot, u);
    const own = niceAlt(9000, u);
    const up = Math.min(range * Math.tan(3.5 / R2D), 14000 - own);
    const d = defaultScan(ac);
    const base = { type: t, range, aspectDeg: 0 };
    return {
      playerAlt: own, playerMach: PLAYER_MACH,
      targets: [
        { ...base, role: 'group left', callsign: 'Bandit-1', bearingDeg: 34, alt: own + up - 300 },
        { ...base, role: 'group lead', callsign: 'Bandit-2', bearingDeg: 38, alt: own + up },
        { ...base, role: 'group right', callsign: 'Bandit-3', bearingDeg: 42, alt: own + up + 300 },
      ],
      scan: { mode: 'rws', azHalfDeg: d.azHalfDeg, bars: d.bars, azCenterDeg: 0, elCenterDeg: 0, rangeScaleM: rangeScaleFor(rs, range * 1.3), cursorM: range },
      maxTime: 150, minRange: 12000,
    };
  },
  steps(ac, _u, k) {
    if (isRu(ac)) {
      return [
        { id: 'right', text: 'Move the scan window right', keys: k.zone ?? undefined },
        { id: 'cover', text: 'All three inside azimuth and bars', keys: k.elev ?? undefined },
        { id: 'paint', text: 'All three painted' },
      ];
    }
    return [
      { id: 'frame', text: 'Frame time cut at least in half', keys: k.width ?? undefined },
      { id: 'cover', text: 'All three inside: slew the centre, tilt the antenna', keys: [k.zone, k.elev].filter(Boolean).join(' / ') || undefined },
      { id: 'paint', text: 'All three painted at that setting' },
    ];
  },
  evaluate(s, mem) {
    const u = s.units, rs = r(s.ac), ru = isRu(s.ac);
    const d = defaultScan(s.ac);
    const start = frameTime(rs, d.azHalfDeg, d.bars);
    const goal = ru ? start : 0.55 * start;
    const g = s.targets;
    const first = ru ? s.azCenterDeg >= 29 : s.frame <= goal + 1e-6;
    const out = g.filter(x => !(x.inAz && x.inBars));
    const covered = out.length === 0;
    if (first && covered) { if (mem.okSince == null) mem.okSince = s.t; } else mem.okSince = null;
    const fresh = first && covered && mem.okSince != null && g.every(x => x.lastPaint != null && x.lastPaint >= (mem.okSince ?? Infinity));
    const done = latch(mem, 2, fresh);
    const steps = done ? [true, true, true] : [first, covered, false];
    if (done) mem.latched = [true, true, true];
    const lead = g[1] ?? g[0];
    const above = dAlt((lead?.alt ?? 0) - s.ownAlt, u).replace(/^[+−]/, '');
    let text: string, why: string, tone: Tone | undefined;
    if (done) {
      text = ru
        ? `Done: window right, all three painted every ${seconds(s.frame)}. In the ${AIRCRAFT[s.ac].short} the 60° window and its 5 s frame are fixed; where it looks is your only choice.`
        : `Done: ±${s.azHalfDeg}° × ${s.bars}B centred ${sdeg(s.azCenterDeg, 0)}, tilted ${sdeg(s.elCenterDeg)}: ${seconds(s.frame)} per frame instead of ${seconds(start)}.`;
      why = 'Point a small, fast scan at what matters instead of searching the whole sky.';
      tone = 'ok';
    } else if (!first) {
      text = ru
        ? `A group of three, ${rng(lead?.groundRange ?? 0, u)} at ${clock(lead?.az ?? 0)}, ${above} above you, outside your centred window. Move the scan zone right.`
        : `A group of three, ${rng(lead?.groundRange ?? 0, u)} at ${clock(lead?.az ?? 0)}, ${above} above you. Your scan takes ${seconds(s.frame)}. Get it to ${seconds(goal)} or less and keep all three.`;
      why = ru ? `The ${rs.name} window has three positions: left (−60…0°), centre (±30°) and right (0…+60°).` : 'A narrow scan only works if it points at the group: narrow it, then slew the centre.';
    } else if (!covered) {
      const az = out.some(x => !x.inAz);
      text = `${out.map(x => x.callsign).join(', ')} ${out.length > 1 ? 'are' : 'is'} outside the ${az ? 'azimuth' : 'bars'}. ${az ? `Slew the scan centre toward ${sdeg(lead?.az ?? 0, 0)}.` : `Tilt the antenna up toward ${sdeg(lead?.el ?? 0)}.`}`;
      why = az ? 'The scan centre moves the window without making it wider.' : `At ${rng(lead?.groundRange ?? 0, u)} they sit ${sdeg(lead?.el ?? 0)} above your horizon.`;
      tone = 'caution';
    } else {
      text = `All three inside at ${seconds(s.frame)} per frame. Wait for fresh hits on all three.`;
      why = 'Fresh hits prove the setting works.';
      tone = 'hi';
    }
    return { steps, current: done ? null : firstOpen(steps), text, why, tone, done };
  },
};

// ------------------------------------------------------------------------------------------ 6. jammer

/** The jammer: the usual adversary when it carries a jammer in DCS, else a Flanker (vs West) or an Eagle (vs East). */
export function jammerType(ac: FighterId): FighterId {
  const adv = opp(ac);
  if (OWN_JAMMER[adv]) return adv;
  return blocOf(ac) === 'west' ? 'su27' : 'f15c';
}

/** The strobe nearest the cursor azimuth (degrees off the nose) within `tolDeg`, or null. */
export function strobeNearCursor(strobes: readonly { targetId: string; azDeg: number }[], cursorAzDeg: number, tolDeg = 3): string | null {
  let best: string | null = null, bestD = tolDeg + 1e-9;
  for (const s of strobes) {
    const d = Math.abs(s.azDeg - cursorAzDeg);
    if (d <= bestD) { bestD = d; best = s.targetId; }
  }
  return best;
}

/** Record a normal lock attempt on the jammer: a refusal keeps the radar's reason for the coach. */
export function recordLockTry(mem: Mem, check: { ok: boolean; reason: string }): void {
  if (!check.ok) mem.reason = check.reason;
}

/** Jammer speed (m/s): a slow closure leaves time for each step before burn-through. */
const JAM_SPEED = 170;

const jam: ExerciseDef = {
  id: 'jam', num: 6, title: 'Jammer and burn-through',
  short: 'A jammer shows a bearing, not a range: jam lock the strobe and hold it to burn-through',
  unavailable(ac) {
    const rs = r(ac);
    return rs.modes.includes('stt') ? null : `The ${rs.name} has no single-target track, so it cannot take a jam lock.`;
  },
  scene(ac, u) {
    const rs = r(ac);
    const f = jamFacts(ac, u);
    const strobeR = STROBE_RANGE_FACTOR * rs.detectKm.headOn * 1000;
    const range = niceRange(Math.min(f.burnThroughM + 24000, 0.9 * strobeR), u);
    const own = niceAlt(9000, u);
    const d = defaultScan(ac);
    return {
      playerAlt: own, playerMach: 0.7,
      targets: [{ role: 'jammer', callsign: 'Bandit', type: jammerType(ac), range, bearingDeg: 6, alt: own + 300, aspectDeg: 0, speed: JAM_SPEED, jamming: true }],
      scan: { mode: 'rws', azHalfDeg: azNear(ac, 30), bars: d.bars, azCenterDeg: 0, elCenterDeg: 0, rangeScaleM: rangeScaleFor(rs, range * 1.3), cursorM: Math.round(range * 0.6) },
      maxTime: 240, minRange: 0.4 * f.burnThroughM,
    };
  },
  steps(ac, u, k) {
    const f = jamFacts(ac, u);
    return [
      { id: 'strobe', text: 'See the strobe: a bearing, no range' },
      { id: 'refused', text: 'Try a normal lock: the radar refuses' },
      { id: 'jamlock', text: `Jam lock: click the strobe${k.lock ? ', or put the cursor on it and lock' : ''}`, keys: k.lock ?? undefined },
      { id: 'burn', text: `Hold it to burn-through, ${rng(f.burnThroughM, u)}${BURN_THROUGH_M[ac].verified ? '' : ' (simplified)'}: range, altitude and aspect appear` },
    ];
  },
  evaluate(s, mem) {
    const u = s.units, j = s.jam;
    if (!j) return { steps: [false, false, false, false], current: 0, text: '', why: '', done: false };
    const f = jamFacts(s.ac, u);
    const rs = r(s.ac);
    const s0 = latch(mem, 0, j.strobe || j.hoj);
    const s1 = latch(mem, 1, mem.reason !== undefined);
    const s2 = latch(mem, 2, j.hoj);
    const s3 = latch(mem, 3, s2 && j.stt);
    const steps = [s0, s1, s2, s3];
    const done = steps.every(Boolean);
    let text: string, why: string, tone: Tone | undefined;
    if (done) {
      text = `Burn-through at ${rng(j.burnThrough, u)}: the jam lock is now a normal lock. Range, altitude, aspect and your launch zone are back.`;
      why = `${f.hojLine} ${f.pursuit}`;
      tone = 'ok';
    } else if (!s2 && j.range <= j.burnThrough) {
      text = `He is inside burn-through (${rng(j.range, u)} out, burn-through ${rng(j.burnThrough, u)}): your radar has his range and he is a normal contact. Reset the exercise to try the jam lock.`;
      why = 'Inside burn-through the jammer no longer hides his range.';
      tone = 'caution';
    } else if (!s0) {
      text = `One bandit ahead, jamming. Your ${rs.name} gets his bearing but not his range. Watch for the jam cue: ${f.strobe}.`;
      why = 'DCS models one kind of jamming: it hides range and leaves the bearing.';
    } else if (!s1) {
      text = `Strobe at ${sdeg(j.az, 0)}: a bearing and nothing else. Press Normal lock and read what the radar says.`;
      why = `A normal lock needs a range. ${f.burnThrough}`;
      tone = 'hi';
    } else if (!s2) {
      text = `Refused: "${mem.reason ?? ''}". Take a jam lock on the strobe instead.`;
      why = `Jam lock in the ${AIRCRAFT[s.ac].short}: ${f.lock}.`;
      tone = 'hi';
    } else if (j.hoj) {
      text = `Jam lock held: bearing only, no range on your display. He is ${rng(j.range, u)} out (truth, not on your scope); burn-through at ${rng(j.burnThrough, u)}.`;
      why = `${f.hojLine} ${f.pursuit}`;
      tone = 'hi';
    } else {
      text = 'Jam lock lost. Click the strobe again, or wait for burn-through and lock him normally.';
      why = f.burnThrough;
      tone = 'caution';
    }
    return { steps, current: done ? null : firstOpen(steps), text, why, tone, done };
  },
};

// ------------------------------------------------------------------------------------------ 7. IFF

/** Friend and hostile: head-on, same altitude, this many degrees either side of the nose. */
const IFF_SPLIT_DEG = 8;

const iff: ExerciseDef = {
  id: 'iff', num: 7, title: 'Friend or foe',
  short: 'Two contacts side by side: find the friend with your IFF, then lock the other one',
  unavailable(ac) {
    const rs = r(ac);
    return rs.modes.includes('stt') ? null : `The ${rs.name} has no single-target track, so there is nothing to lock.`;
  },
  scene(ac, u) {
    const rs = r(ac), hostile = opp(ac);
    // Both inside detection (the smaller of the two jets) and well inside the IFF range (1.2 × head-on detection).
    const det = Math.min(detectKm(rs, hostile, 0, false), detectKm(rs, ac, 0, false)) * 1000;
    const range = niceRange(0.62 * det, u);
    const own = niceAlt(9000, u);
    const d = defaultScan(ac);
    return {
      playerAlt: own, playerMach: PLAYER_MACH,
      targets: [
        { role: 'hostile', callsign: 'Contact-1', type: hostile, range, bearingDeg: -IFF_SPLIT_DEG, alt: own, aspectDeg: 0 },
        { role: 'friend', callsign: 'Contact-2', type: ac, range, bearingDeg: IFF_SPLIT_DEG, alt: own, aspectDeg: 0, friendly: true },
      ],
      scan: { mode: 'rws', azHalfDeg: azNear(ac, 30), bars: d.bars, azCenterDeg: 0, elCenterDeg: 0, rangeScaleM: rangeScaleFor(rs, range * 1.3), cursorM: Math.round(range * 0.6) },
      maxTime: 150, minRange: 10000,
    };
  },
  steps(ac, _u, k) {
    const f = iffFacts(ac);
    const lock = { id: 'lock', text: f.auto ? 'Lock the one that is not friendly: click it on the scope' : 'Lock the hostile: click it on the scope', keys: k.lock ?? undefined };
    if (f.auto) return [{ id: 'cue', text: `See the friend marked by itself: ${f.cue.charAt(0).toLowerCase()}${f.cue.slice(1)}` }, lock];
    return [
      { id: 'unknown', text: 'Both look the same: unknown' },
      { id: 'ask', text: f.key ? 'Interrogate' : 'Interrogate: designate or lock a contact, or press Interrogate', keys: f.key ?? undefined },
      lock,
    ];
  },
  evaluate(s, mem) {
    const x = s.iff;
    const f = iffFacts(s.ac);
    const n = f.auto ? 2 : 3;
    if (!x) return { steps: Array(n).fill(false) as boolean[], current: 0, text: '', why: '', done: false };
    const spec = AIRCRAFT[s.ac];
    let steps: boolean[];
    if (f.auto) {
      const s0 = latch(mem, 0, x.friendReply);
      steps = [s0, latch(mem, 1, s0 && x.stt === 'hostile')];
    } else {
      const s1 = latch(mem, 1, x.friendReply);
      const s0 = latch(mem, 0, (x.friendSeen && x.hostileSeen) || s1);
      steps = [s0, s1, latch(mem, 2, s1 && x.stt === 'hostile')];
    }
    const identified = f.auto ? steps[0] : steps[1];
    // Fratricide record: he locked the friend before any IFF answer said so (not a failure, explained).
    if (x.stt === 'friend' && !identified) mem.phase = 'blind';
    const done = steps.every(Boolean);
    const side = (az: number) => (az < 0 ? 'left' : 'right');
    let text: string, why: string, tone: Tone | undefined;
    if (done) {
      text = f.auto
        ? `Locked the contact without the friend cue. Your ${spec.radar.name} told them apart by itself.`
        : 'Locked the contact that did not answer. No reply is still not proof: in a real fight you confirm with GCI, AWACS or your eyes.';
      why = f.shoot;
      tone = 'ok';
    } else if (x.stt === 'friend' && identified) {
      text = `You are locked on the friend: he answered your IFF (${f.cue.charAt(0).toLowerCase()}${f.cue.slice(1)}). Unlock and lock the other contact.`;
      why = 'Here the launch is refused once IFF says friend (simplified). ' + f.shoot;
      tone = 'warning';
    } else if (x.stt === 'friend') {
      text = 'You locked the friend (truth) and nothing on your scope said so. In DCS you could have fired on him. Unlock, identify, then lock.';
      why = `${f.how} ${f.shoot}`;
      tone = 'warning';
    } else if (x.stt === 'hostile' && !identified) {
      text = x.hostileAsked
        ? `No reply from the one you locked. ${f.noReply} The other contact is still unknown: ${f.key ? `interrogate (${f.key})` : 'press Interrogate, or unlock and lock him to ask'}.`
        : `Locked before you identified anyone. ${f.how}`;
      why = f.shoot;
      tone = 'caution';
    } else if (!x.friendSeen && !x.hostileSeen) {
      text = `Two contacts ahead, close together, same altitude, both hot. One is a friend. Wait for the paint.`;
      why = f.auto ? f.how : `The ${spec.short} does not interrogate by itself. ${f.how}`;
    } else if (f.auto && !identified) {
      text = `Watch the two contacts. Your radar asks both by itself; the friend shows: ${f.cue}.`;
      why = f.noReply;
      tone = 'hi';
    } else if (!f.auto && !steps[0]) {
      text = 'One contact on the scope: wait for the second. Both will look the same.';
      why = `The ${spec.short} does not interrogate by itself. ${f.how}`;
    } else if (!f.auto && !identified) {
      text = `Both contacts look the same: unknown. ${f.ask}`;
      why = `${f.how} ${f.noReply}`;
      tone = 'hi';
    } else {
      const answered = x.friendReply
        ? `The ${side(x.friendAz)} contact answered: ${f.cue.charAt(0).toLowerCase()}${f.cue.slice(1)}.`
        : `The ${side(x.friendAz)} contact answered ${x.replyAge !== null ? `${Math.round(x.replyAge)} s ago` : ''}; the reply is gone. Remember him, or interrogate again.`;
      text = `${answered} Lock the ${side(x.hostileAz)} one: ${f.auto ? 'no friend cue' : 'no reply'}.`;
      why = `${f.noReply} ${f.show}`;
      tone = 'hi';
    }
    if (!done && mem.phase === 'blind' && x.stt !== 'friend') why = `Earlier you locked the friend before he was identified: in DCS nothing stops that shot. ${why}`;
    return { steps, current: done ? null : firstOpen(steps), text, why, tone, done };
  },
};

// ------------------------------------------------------------------------------------------ 8. datalink

/** The AWACS bandit sits this far off the nose: outside every starting scan, inside every gimbal. */
const DL_OFF_DEG = 42;
const DL_SPEED = 200;

/** The track the pilot should bring his radar onto: an uncorrelated AWACS track first, then a donor track. */
export function dlCue(tracks: readonly DlTrackSnap[]): DlTrackSnap | null {
  const free = tracks.filter(x => x.source !== 'ppli' && !x.correlated);
  return free.find(x => x.source === 'awacs') ?? free[0] ?? null;
}

const dl: ExerciseDef = {
  id: 'dl', num: 8, title: 'Datalink picture',
  short: 'AWACS and other fighters show you tracks beyond your radar: find them with your own radar before you shoot',
  unavailable(ac) {
    const rs = r(ac);
    return rs.modes.includes('stt') ? null : `The ${rs.name} has no single-target track, so there is nothing to lock.`;
  },
  scene(ac, u) {
    const rs = r(ac), bandit = opp(ac), f = dlFacts(ac);
    const det = detectKm(rs, bandit, 0, false) * 1000;
    const own = niceAlt(9000, u);
    if (!f.has) {
      const range = niceRange(0.7 * det, u);
      const d = defaultScan(ac);
      return {
        playerAlt: own, playerMach: PLAYER_MACH, awacs: true,
        targets: [{ role: 'bandit', callsign: 'Bandit', type: bandit, range, bearingDeg: 5, alt: own, aspectDeg: 0, speed: DL_SPEED }],
        scan: { mode: 'rws', azHalfDeg: azNear(ac, 30), bars: d.bars, azCenterDeg: 0, elCenterDeg: 0, rangeScaleM: rangeScaleFor(rs, range * 1.3), cursorM: range },
        maxTime: 150, minRange: 15000,
      };
    }
    const targets: SceneTarget[] = [
      // Inside detection range but outside the starting scan: the AWACS sees him, your radar does not.
      { role: 'awacs', callsign: 'Bandit-1', type: bandit, range: niceRange(0.75 * det, u), bearingDeg: DL_OFF_DEG, alt: own, aspectDeg: 0, speed: DL_SPEED },
    ];
    let far = targets[0].range;
    if (f.wingType) {
      // Wingman ahead on the same heading, radar in TWS; his bandit is beyond your radar and inside his.
      const wing = niceRange(0.6 * det, u);
      const wingDet = detectKm(r(f.wingType), bandit, 0, false) * 1000;
      far = niceRange(wing + 0.65 * wingDet, u);
      targets.push(
        { role: 'wingman', callsign: 'Wingman', type: f.wingType, range: wing, bearingDeg: -8, alt: own + 300, aspectDeg: 180, friendly: true, radar: 'tws' },
        { role: 'donor', callsign: 'Bandit-2', type: bandit, range: far, bearingDeg: -8, alt: own, aspectDeg: 0, speed: 150 },
      );
    }
    const d = defaultScan(ac);
    return {
      playerAlt: own, playerMach: PLAYER_MACH, awacs: true, radarOff: f.radarOnFirst,
      targets,
      // Hornet: TWS, since in RWS its display shows only datalink tracks that match a radar return.
      scan: { mode: f.rwsOnly ? 'tws' : 'rws', azHalfDeg: azNear(ac, 20), bars: d.bars, azCenterDeg: 0, elCenterDeg: 0, rangeScaleM: rangeScaleFor(rs, far * 1.1), cursorM: targets[0].range },
      maxTime: 150, minRange: 15000,
    };
  },
  steps(ac, _u, k) {
    const f = dlFacts(ac);
    if (!f.has) return [{ id: 'own', text: 'No datalink picture: find the bandit with your own radar' }];
    const out: StepText[] = [];
    if (f.radarOnFirst) out.push({ id: 'on', text: 'Switch the radar on: the AWACS picture appears', keys: f.radarKey ?? undefined });
    out.push({ id: 'awacs', text: 'See the AWACS track beyond your radar' });
    if (f.wingType) out.push({ id: 'donor', text: 'See your wingman\'s track' });
    out.push({ id: 'corr', text: 'Bring your radar onto it: it correlates' });
    out.push({ id: 'lock', text: 'Lock it with your own radar: click it on the scope', keys: k.lock ?? undefined });
    return out;
  },
  evaluate(s, mem) {
    const f = dlFacts(s.ac), u = s.units;
    const spec = AIRCRAFT[s.ac];
    if (!f.has) {
      const tg = s.targets[0];
      const seen = latch(mem, 0, !!tg?.seenNow);
      return {
        steps: [seen], current: seen ? null : 0, done: seen, tone: seen ? 'ok' : undefined,
        text: seen
          ? `Painted with your own radar${tg ? ` at ${rng(tg.firstSeenRange ?? tg.groundRange, u)}` : ''}. In the ${spec.short} that is the only picture you get.`
          : `${f.none}${tg ? ` Bandit ${rng(tg.groundRange, u)} on the nose, ${alt(tg.alt, u)}, hot.` : ''}`,
        why: seen ? `${f.none} ${f.source}` : f.source,
      };
    }
    const n = (f.radarOnFirst ? 1 : 0) + 1 + (f.wingType ? 1 : 0) + 2;
    const x = s.dl;
    if (!x) return { steps: Array(n).fill(false) as boolean[], current: 0, text: '', why: '', done: false };
    // What the display draws: the Hornet in RWS shows only datalink tracks that match a radar return.
    const hidden = f.rwsOnly && s.mode === 'rws';
    const shown = hidden ? x.tracks.filter(t => t.correlated) : x.tracks;
    const awacs = shown.filter(t => t.source === 'awacs');
    const donor = shown.filter(t => t.source === 'donor');
    const steps: boolean[] = [];
    let i = 0;
    if (f.radarOnFirst) steps.push(latch(mem, i++, x.radarOn && shown.length > 0));
    const iAwacs = i;
    steps.push(latch(mem, i++, awacs.length > 0 && (!f.radarOnFirst || !!mem.latched[0])));
    const iDonor = f.wingType ? i : -1;
    if (f.wingType) steps.push(latch(mem, i++, donor.length > 0 && !!mem.latched[iAwacs]));
    const seenAll = steps.every(Boolean);
    const iCorr = i;
    steps.push(latch(mem, i++, seenAll && x.tracks.some(t => t.source !== 'ppli' && t.correlated)));
    steps.push(latch(mem, i++, !!mem.latched[iCorr] && x.lock === 'dl'));
    const done = steps.every(Boolean);
    const cue = dlCue(shown);
    const where = (t: DlTrackSnap) => `${sdeg(t.az, 0)}, ${rng(t.range, u)}`;
    const slew = (t: DlTrackSnap) => {
      const off = t.az - s.azCenterDeg;
      const dir = off < 0 ? 'left' : 'right';
      return `He is ${Math.abs(off).toFixed(0)}° ${dir} of your scan centre: slew the scan ${dir}${r(s.ac).azHalfWidthOptionsDeg.length > 1 ? ' or widen it' : ''}, or wait while he closes.`;
    };
    let text: string, why: string, tone: Tone | undefined;
    if (done) {
      text = 'Locked with your own radar. The datalink showed him first; only your own radar gives you a lock and a launch zone.';
      why = `${f.fire} ${f.coast}`;
      tone = 'ok';
    } else if (x.lock === 'ppli') {
      text = 'That is your wingman: the datalink shows him as a friend. Unlock and lock a bandit.';
      why = f.ppli || f.fire;
      tone = 'warning';
    } else if (hidden && !steps[iCorr]) {
      text = `In RWS the Hornet shows only datalink tracks that match a radar return: the rest are hidden. Go back to ${r(s.ac).modeLabels.tws ?? 'TWS'}.`;
      why = f.where;
      tone = 'caution';
    } else if (f.radarOnFirst && !steps[0]) {
      text = x.radarOn
        ? 'Radar on. The AWACS picture updates every 10 s here (trainer value): wait for it.'
        : `A friendly AWACS is on station behind you. Your radar is off, so the datalink shows nothing yet. Switch it on${f.radarKey ? ` (${f.radarKey})` : ''}.`;
      why = f.awacs;
      tone = x.radarOn ? 'hi' : undefined;
    } else if (!steps[iAwacs]) {
      text = 'AWACS is on station behind you. Wait for its picture: it updates every 10 s here (trainer value).';
      why = f.awacs;
    } else if (iDonor >= 0 && !steps[iDonor]) {
      const a = awacs[0];
      text = `${a ? `AWACS track at ${where(a)}${a.correlated ? '' : ': not on your own radar'}. ` : ''}Your wingman ahead has his radar on. Wait for his track to come over the datalink.`;
      why = `${f.where} ${f.symbol}`;
      tone = 'hi';
    } else if (!steps[iCorr]) {
      const d = donor[0];
      const lead = iDonor >= 0 && d ? `${d.donorLabel ?? 'Your wingman'}'s track at ${where(d)}${d.correlated ? '' : ', beyond your radar'}. ` : '';
      text = cue
        ? `${lead}Datalink track at ${where(cue)}: not on your own radar. ${slew(cue)}`
        : `${lead}Bring your radar onto a datalink track.`;
      why = `${f.fire} ${f.symbol}`;
      tone = 'hi';
    } else if (x.lock === 'other') {
      text = 'That contact is not on the datalink. Lock the track your radar and the datalink both hold.';
      why = f.fire;
      tone = 'caution';
    } else {
      text = 'Your radar holds him too: the track correlates, own radar and datalink on the same contact. Lock him with your own radar.';
      why = `${f.coast} ${f.fire}`;
      tone = 'hi';
    }
    return { steps, current: done ? null : firstOpen(steps), text, why, tone, done };
  },
};

export const EXERCISE_DEFS: Record<ExerciseId, ExerciseDef> = { free, low, revisit, notch, aspect, centre, jam, iff, dl };

/** Exercises this jet can do (graded only). */
export function availableExercises(ac: FighterId): Exclude<ExerciseId, 'free'>[] {
  return EXERCISES.filter(id => EXERCISE_DEFS[id].unavailable(ac) === null);
}
