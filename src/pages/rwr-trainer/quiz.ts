/**
 * [OWNER: page-rwr-trainer] Pure quiz logic: seeded scenario generator, answer grading, the
 * "what do you do now" decision rules and run scoring. No DOM, unit-tested in quiz.test.ts.
 *
 * Every question is built, then verified against the contacts the RWR will actually show (priority
 * order from the display kit's rwrPriority), and rebuilt if it would be ambiguous.
 */
import type { AircraftId, MissileId, RwrId } from '../../data/types';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { RWRS, rwrSymbol } from '../../data/rwr';
import type { RwrContact } from '../../sim/types';
import { rwrPriority, rwrSymbolFor, spoLamps, SPO_FWD_LAMPS } from '../../ui/displays/geometry';
import {
  type EmitterKind, type Phase, type Threat, type ThreatState,
  acceptedClocks, canBe, clockOf, clockText, contactsAt, defaultMissile, emitterKindsFor, emitterLabel, emitterShort,
  isAircraft, isSam, missilePlacement, missilesFor, rad, deg, wrapPi,
} from './threats';

// ---------------------------------------------------------------------------------------- random

export type Rng = () => number;

/** Small seeded PRNG (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length) % xs.length];
const between = (rng: Rng, a: number, b: number): number => a + (b - a) * rng();
const intBetween = (rng: Rng, a: number, b: number): number => Math.floor(between(rng, a, b + 1 - 1e-9));
function shuffle<T>(rng: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
  return xs;
}

// ---------------------------------------------------------------------------------------- types

export type Difficulty = 'easy' | 'medium' | 'hard';
export type QuestionKind = 'tap-lock' | 'launch-clock' | 'identify' | 'seeker' | 'action';
export type ActionId = 'notch-left' | 'notch-right' | 'crank' | 'continue' | 'drag' | 'chaff';

export const QUESTION_KINDS: QuestionKind[] = ['tap-lock', 'launch-clock', 'identify', 'seeker', 'action'];
export const ACTIONS: { id: ActionId; label: string }[] = [
  { id: 'notch-left', label: 'Notch left' },
  { id: 'notch-right', label: 'Notch right' },
  { id: 'crank', label: 'Crank' },
  { id: 'continue', label: 'Continue' },
  { id: 'drag', label: 'Drag cold' },
  { id: 'chaff', label: 'Chaff now' },
];
export const ACTION_LABEL: Record<ActionId, string> = Object.fromEntries(ACTIONS.map(a => [a.id, a.label])) as Record<ActionId, string>;

export interface Choice { id: string; label: string }

export type Answer =
  /** Tap the right contact on the RWR (ids that count); `candidates` is the clickable/keyboard fallback. */
  | { type: 'tap'; correct: string[]; candidates: Choice[] }
  /** Pick a clock position; every listed clock counts. */
  | { type: 'clock'; correct: number[] }
  | { type: 'choice'; options: Choice[]; correct: string[] };

export type Given = { type: 'tap'; id: string } | { type: 'clock'; clock: number } | { type: 'choice'; id: string } | { type: 'timeout' };

/** What the plan view draws after the answer: the recommended turn (deg, + right). */
export interface Advice { action: ActionId; turnDeg: number; label: string }

export interface Question {
  kind: QuestionKind;
  prompt: string;
  /** Situation line that is not on the RWR (e.g. your own missile in the air). */
  context: string | null;
  threats: Threat[];
  answer: Answer;
  /** Threat to highlight on the reveal. */
  focusId: string;
  /** One or two lines shown after the answer. */
  explain: string;
  advice: Advice | null;
  /** Your own missile in the air (crank questions), for the plan reveal. */
  ownShot: { missile: MissileId; targetId: string } | null;
  /** Lead-up length (s): threats escalate over this time, then hold. */
  leadS: number;
  seed: number;
}

export interface QuizOptions {
  rwr: RwrId;
  own: AircraftId;
  difficulty: Difficulty;
  seed: number;
  kind?: QuestionKind;
}

// ---------------------------------------------------------------------------------------- RWR tells

/** Short per-RWR descriptions of each cue (restating RWRS[rwr].cues in one line). */
export const TELL: Record<RwrId, { lock: string; launch: string; active: string }> = {
  spo15: {
    lock: 'A steady red lamp is a lock, and it always belongs to the primary threat: the big yellow direction lamp.',
    launch: 'The red lamp went from steady (lock) to flashing: a SARH launch. He has to hold the lock until impact.',
    active: 'No steady lock came first, then the power column jumped to full as it became the primary threat: an active missile, a TWS Fox 3 gone pitbull. (The red lamp flashes for it here too; simplified.)',
  },
  alr56c: {
    lock: 'A lock jumps into the inner ring and takes the priority diamond.',
    launch: 'A flashing circle around the shooter\'s code: launch. His radar guides the missile.',
    active: '"M" in a diamond: an active radar missile. No lock or launch came first, so it was a TWS Fox 3.',
  },
  alr67: {
    lock: 'A lock moves the code to the outer critical band and lights AI steady.',
    launch: 'The code flashes in the critical band with AI flashing and CW lit: his radar illuminates you for the missile.',
    active: '"M" in the critical band with no CW light: the missile\'s own seeker is on you.',
  },
  alr56m: {
    lock: 'A lock is a boxed code just outside the inner circle.',
    launch: 'The shooter\'s code sits inside the inner circle with a flashing circle, and LAUNCH flashes: his radar guides it.',
    active: '"M" inside the inner circle: the missile\'s own seeker is on you.',
  },
  jf17rwr: {
    lock: 'A lock turns the symbol red and moves it to the inner (lethal) ring.',
    launch: 'The red symbol flashes and MSL LCH lights: launch.',
    active: 'MAWS shows the missile\'s number at its bearing: an active missile.',
  },
  serval: {
    lock: 'A lock moves the symbol toward the centre.',
    launch: 'The shooter sits near the centre with a flashing circle and D2M lights: launch.',
    active: '"M" near the centre: the missile\'s own seeker is on you.',
  },
};

// ---------------------------------------------------------------------------------------- helpers

/** Missile the own jet would be supporting (first radar missile in its loadout). */
export function ownRadarMissile(own: AircraftId): MissileId | null {
  const spec = AIRCRAFT[own];
  const all = [...spec.loadout.map(l => l.missile), ...spec.missiles];
  return all.find(m => MISSILES[m].seeker !== 'ir') ?? null;
}

/** Can this RWR show whether a missile is above or below you? (SPO-15 В/Н lamps, JF-17 MAWS marks.) */
export const showsMissileElevation = (rwr: RwrId): boolean => rwr === 'spo15' || rwr === 'jf17rwr';

/** Is this bearing "on the beam" as the RWR shows it? SPO-15: the 90 lamp alone. Scopes: 90 +- 10 deg. */
export function onBeam(rwr: RwrId, bearing: number): boolean {
  const b = wrapPi(bearing);
  if (RWRS[rwr].kind === 'lamps') {
    const l = spoLamps(b);
    return l.length === 1 && Math.abs(SPO_FWD_LAMPS[l[0]] ?? 0) === 90;
  }
  return Math.abs(Math.abs(deg(b)) - 90) <= 10;
}

/** Notch turn: put the bearing on the nearer beam. Returns the turn (deg, + right). */
export function notchTurn(bearing: number): number {
  const d = deg(wrapPi(bearing));
  const a = Math.abs(d), s = Math.sign(d) || 1;
  // Forward of the beam: turn away from it; behind the beam: turn toward it.
  return a < 90 ? -s * (90 - a) : s * (a - 90);
}

const round10 = (x: number): number => Math.max(10, Math.round(Math.abs(x) / 10) * 10);

export interface ActionDecision { correct: ActionId[]; turnDeg: number; why: string; focusId: string }

const RANK: Record<RwrContact['state'], number> = { search: 0, lock: 1, launch: 2, missile: 3 };

/**
 * The DCS answer to "what do you do now", from the RWR picture and your own shot.
 * Rules (docs/research/bvr-mechanics.md, procedures D): the top threat decides. Search only: continue,
 * or crank while supporting your own missile. A lock from a jet that can fire a Fox 3 from STT (no
 * launch warning in DCS until pitbull): beam him. SARH/STT launch: beam the shooter (break his lock).
 * Active missile: beam the missile; drag if it is behind you (already cold) or below you (look-up, the
 * notch will not hold, readable only on RWRs that show elevation). Already on the beam: chaff now.
 */
export function decideAction(rwr: RwrId, threats: readonly Threat[], ownShot: { missile: MissileId; targetId: string } | null): ActionDecision {
  const contacts = contactsAt(threats, 1e6);
  const ranked = rwrPriority(contacts);
  const top = ranked[0];
  if (!top || top.state === 'search') {
    if (ownShot) {
      const tgt = threats.find(t => t.id === ownShot.targetId);
      const tb = tgt ? deg(wrapPi(tgt.bearing)) : 0;
      const turn = tb >= 0 ? tb - 50 : tb + 50;
      const m = MISSILES[ownShot.missile];
      const keep = m.seeker === 'sarh' ? 'hold the lock to impact' : 'keep the track until it goes active';
      return {
        correct: ['crank'], turnDeg: turn, focusId: ownShot.targetId,
        why: `Nobody is locking you and your ${m.name} still needs your radar: crank to about 50° off to cut the closure, and ${keep}.`,
      };
    }
    return {
      correct: ['continue'], turnDeg: 0, focusId: top?.emitterId ?? threats[0]?.id ?? '',
      why: 'Search only: nobody is targeting you yet. Keep flying your plan and watch for a lock.',
    };
  }
  const threatId = top.emitterId.endsWith('-M') ? top.emitterId.slice(0, -2) : top.emitterId;
  const th = threats.find(t => t.id === threatId);
  const b = top.bearing;
  const clock = clockText(clockOf(b));
  const turn = notchTurn(b);
  const dir: ActionId = turn < 0 ? 'notch-left' : 'notch-right';
  const side = turn < 0 ? 'left' : 'right';
  const beamClock = b >= 0 ? 3 : 9;

  if (top.state === 'lock') {
    const name = th ? emitterShort(th.kind) : 'bandit';
    const fox3 = th && isAircraft(th.kind) && !AIRCRAFT[th.kind].radar.sttArhLaunchWarning ? missilesFor(th.kind, 'active')[0] : undefined;
    const threat = fox3
      ? `The ${name} can fire an ${MISSILES[fox3].name} from this lock and DCS shows no launch warning until it goes active.`
      : `The ${name} has you locked: a launch can come at any moment.`;
    return {
      correct: [dir], turnDeg: turn, focusId: threatId,
      why: `${threat} Turn ${side} about ${round10(turn)}° to put him at ${beamClock} o'clock: the notch breaks his lock.`,
    };
  }
  if (top.state === 'launch') {
    const mName = top.missileType ? MISSILES[top.missileType].name : 'missile';
    if (onBeam(rwr, b)) {
      return {
        correct: ['chaff'], turnDeg: 0, focusId: threatId,
        why: `The shooter is already on your beam: you are in his notch. Chaff now and go low; SARH seekers are the easiest to decoy, and a broken lock kills the ${mName}.`,
      };
    }
    return {
      correct: [dir], turnDeg: turn, focusId: threatId,
      why: `Shooter at ${clock}: turn ${side} about ${round10(turn)}° to put him on the beam, go low and chaff. Break his lock and the ${mName} loses guidance.`,
    };
  }
  // Active missile.
  const bd = Math.abs(deg(wrapPi(b)));
  const below = showsMissileElevation(rwr) && top.elevation < rad(-12);
  const m = top.missileType ? MISSILES[top.missileType].name : 'missile';
  if (bd >= 150) {
    const away = wrapPi(b - Math.PI);
    return {
      correct: ['drag'], turnDeg: deg(away), focusId: threatId,
      why: `The ${m} is behind you and you are already cold: keep dragging in afterburner and descend. Turning back to notch would hand it closure.`,
    };
  }
  if (below) {
    const away = wrapPi(b - Math.PI);
    return {
      correct: ['drag'], turnDeg: deg(away), focusId: threatId,
      why: `The ${m} is below you: it looks up at you with no ground behind you, so a notch is unlikely to hold. Turn cold and drag.`,
    };
  }
  if (onBeam(rwr, b)) {
    return {
      correct: ['chaff'], turnDeg: 0, focusId: threatId,
      why: `The ${m} is already on your beam: you are in its notch. Chaff now; chaff only works in the notch.`,
    };
  }
  return {
    correct: [dir], turnDeg: turn, focusId: threatId,
    why: `Missile at ${clock}: turn ${side} about ${round10(turn)}° to put it on the beam, dive for ground behind you and chaff. Notch the missile, not the shooter: its own seeker guides it now.`,
  };
}

// ---------------------------------------------------------------------------------------- grading

export function grade(q: Question, g: Given): boolean {
  const a = q.answer;
  if (g.type === 'timeout') return false;
  if (a.type === 'tap' && g.type === 'tap') return a.correct.includes(g.id) || a.correct.includes(g.id.replace(/-M$/, ''));
  if (a.type === 'tap' && g.type === 'choice') return a.correct.includes(g.id);
  if (a.type === 'clock' && g.type === 'clock') return a.correct.includes(g.clock);
  if (a.type === 'choice' && g.type === 'choice') return a.correct.includes(g.id);
  return false;
}

/** Human text of the right answer (for "The answer was ..."). */
export function answerText(q: Question): string {
  const a = q.answer;
  if (a.type === 'clock') return a.correct.map(clockText).join(' or ');
  if (a.type === 'choice') return a.options.filter(o => a.correct.includes(o.id)).map(o => o.label).join(' or ');
  return a.candidates.filter(o => a.correct.includes(o.id)).map(o => o.label).join(' or ') || 'the locking contact';
}

// ---------------------------------------------------------------------------------------- run scoring

export const MAX_MISSES = 3;
export const DONE_AT = 10;

export interface RunState { score: number; streak: number; bestStreak: number; misses: number; answered: number }
export const newRun = (): RunState => ({ score: 0, streak: 0, bestStreak: 0, misses: 0, answered: 0 });

export function applyAnswer(r: RunState, correct: boolean): RunState {
  const streak = correct ? r.streak + 1 : 0;
  return {
    score: r.score + (correct ? 1 : 0),
    streak,
    bestStreak: Math.max(r.bestStreak, streak),
    misses: r.misses + (correct ? 0 : 1),
    answered: r.answered + 1,
  };
}
export const runOver = (r: RunState): boolean => r.misses >= MAX_MISSES;

/** Seconds allowed per question when the timer is on. */
export const TIME_LIMIT_S: Record<Difficulty, number> = { easy: 20, medium: 14, hard: 9 };

// ---------------------------------------------------------------------------------------- generator

interface Ctx {
  /** Threat id counter (T1, T2, ...), per question. */
  ids: number;
  rwr: RwrId;
  own: AircraftId;
  diff: Difficulty;
  rng: Rng;
  lamps: boolean;
  kinds: EmitterKind[];
  n: number;
  sepDeg: number;
}

const LEAD_S = 2.4;

function phasesFor(state: ThreatState): Phase[] {
  switch (state) {
    case 'search': return [{ at: 0, state: 'search' }];
    case 'lock': return [{ at: 0, state: 'search' }, { at: 0.9, state: 'lock' }];
    case 'launch': return [{ at: 0, state: 'search' }, { at: 0.8, state: 'lock' }, { at: 1.8, state: 'launch' }];
    case 'active': return [{ at: 0, state: 'search' }, { at: 1.8, state: 'active' }];
  }
}

/** Bearing candidates (deg). SPO-15: centred on its lamps; scopes: centred on clock positions. */
function bearingCandidates(ctx: Ctx, opts: { rear?: boolean } = {}): number[] {
  const rear = opts.rear ?? ctx.diff !== 'easy';
  if (ctx.lamps) {
    const fwd = [3, 10, 20, 30, 40, 50, 70, 90, 100];
    const out: number[] = [];
    for (const d of fwd) { out.push(d, -d); }
    if (rear) out.push(135, -135, 150, -150);
    return out.filter(d => d !== -3); // dead ahead once
  }
  const out: number[] = [];
  for (let c = 0; c < 12; c++) {
    const d = c * 30;
    const dd = d > 180 ? d - 360 : d;
    if (!rear && Math.abs(dd) > 100) continue;
    out.push(dd);
  }
  return out;
}

const lampKey = (b: number): string => spoLamps(rad(b)).slice().sort().join(',');

/** Is a new bearing (deg) clear of the ones taken, for this RWR? */
function clearOf(ctx: Ctx, b: number, taken: number[]): boolean {
  if (ctx.lamps) {
    const mine = new Set(spoLamps(rad(b)));
    return taken.every(t => !spoLamps(rad(t)).some(i => mine.has(i)));
  }
  return taken.every(t => Math.abs(deg(wrapPi(rad(b - t)))) >= ctx.sepDeg);
}

function jitter(ctx: Ctx, b: number): number {
  if (ctx.lamps) return b + between(ctx.rng, -2, 2);
  return b + between(ctx.rng, -8, 8);
}

function pickBearing(ctx: Ctx, taken: number[], filter: (d: number) => boolean = () => true, rear?: boolean): number | null {
  const cands = shuffle(ctx.rng, bearingCandidates(ctx, { rear }).filter(filter).filter(d => clearOf(ctx, d, taken)));
  return cands.length ? cands[0] : null;
}

function rangeFor(ctx: Ctx, kind: EmitterKind, state: ThreatState): number {
  const r = ctx.rng;
  if (kind === 'awacs') return between(r, 160, 280) * 1000;
  if (kind === 'sam-long') return between(r, 40, 110) * 1000;
  if (kind === 'sam-medium') return between(r, 20, 45) * 1000;
  if (kind === 'sam-short') return between(r, 7, 14) * 1000;
  switch (state) {
    case 'search': return between(r, 35, 120) * 1000;
    case 'lock': return between(r, 18, 55) * 1000;
    case 'launch': return between(r, 18, 45) * 1000;
    case 'active': return between(r, 30, 60) * 1000;
  }
}

function altFor(ctx: Ctx, kind: EmitterKind): number {
  if (isSam(kind)) return -8000;
  if (kind === 'awacs') return between(ctx.rng, -2500, 0);
  return Math.round(between(ctx.rng, -2500, 2500) / 100) * 100;
}

function makeThreat(ctx: Ctx, kind: EmitterKind, state: ThreatState, bearingDeg: number, extra: Partial<Threat> = {}): Threat {
  const id = `T${++ctx.ids}`;
  return {
    id, kind, state,
    bearing: rad(bearingDeg), range: rangeFor(ctx, kind, state), altRel: altFor(ctx, kind),
    missile: defaultMissileRandom(ctx, kind, state),
    aspect: rad(between(ctx.rng, -25, 25)),
    missileBearingOffset: state === 'active' ? rad(between(ctx.rng, 2, 5) * (ctx.rng() < 0.5 ? -1 : 1)) : undefined,
    phases: phasesFor(state),
    ...extra,
  };
}

function defaultMissileRandom(ctx: Ctx, kind: EmitterKind, state: ThreatState): MissileId | null {
  const all = missilesFor(kind, state);
  return all.length ? pick(ctx.rng, all) : defaultMissile(kind, state);
}

/** Emitter kinds that can be in `state`, drawn from the RWR's offer. */
function kindsFor(ctx: Ctx, state: ThreatState, opts: { aircraftOnly?: boolean } = {}): EmitterKind[] {
  return ctx.kinds.filter(k => canBe(k, state, ctx.rwr) && (!opts.aircraftOnly || isAircraft(k)));
}

/** Search-only filler threats at clear bearings. */
function fillers(ctx: Ctx, count: number, taken: number[], out: Threat[]): boolean {
  for (let i = 0; i < count; i++) {
    const decoy = ctx.diff !== 'easy' && ctx.rng() < 0.3;
    const pool = decoy ? ctx.kinds.filter(k => !isAircraft(k)) : ctx.kinds.filter(isAircraft);
    const kind = pick(ctx.rng, pool.length ? pool : ctx.kinds);
    const b = pickBearing(ctx, taken);
    if (b === null) return false;
    taken.push(b);
    out.push(makeThreat(ctx, kind, 'search', jitter(ctx, b)));
  }
  return true;
}

function finalContacts(threats: Threat[]): RwrContact[] {
  return rwrPriority(contactsAt(threats, 1e6));
}

function tapCandidates(ctx: Ctx, threats: Threat[]): Choice[] {
  const ranked = finalContacts(threats).filter(c => c.state !== 'missile');
  const out = ranked.map(c => ({
    id: c.emitterId,
    label: ctx.lamps ? `Lamp ${lampWords(c.bearing)}` : `At ${clockText(clockOf(c.bearing))}`,
    sym: rwrSymbolFor(RWRS[ctx.rwr], c),
  }));
  // Two contacts can round to the same clock: name them by their code as well.
  for (const o of out) if (out.filter(x => x.label === o.label).length > 1) o.label = `${o.label.split(' (')[0]} (${o.sym})`;
  return out.map(({ id, label }) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** SPO-15 lamp description: 'right 30', 'left 10 and 30', 'right rear'. */
export function lampWords(bearing: number): string {
  const l = spoLamps(bearing).slice().sort((a, b) => a - b);
  if (l.includes(8)) return 'left rear';
  if (l.includes(9)) return 'right rear';
  const angles = l.map(i => SPO_FWD_LAMPS[i]);
  if (angles.length === 2 && angles[0] === -10 && angles[1] === 10) return 'both 10s (dead ahead)';
  const side = angles[0] < 0 ? 'left' : 'right';
  const vals = angles.map(a => Math.abs(a)).sort((a, b) => a - b);
  return `${side} ${vals.join(' and ')}`;
}

const SPO_CLASSES: { id: string; label: string; kinds: (k: EmitterKind) => boolean }[] = [
  { id: 'П', label: 'Fighter radar', kinds: k => isAircraft(k) },
  { id: 'З', label: 'Long-range SAM', kinds: k => k === 'sam-long' },
  { id: 'Х', label: 'Medium-range SAM', kinds: k => k === 'sam-medium' },
  { id: 'Н', label: 'Short-range SAM', kinds: k => k === 'sam-short' },
  { id: 'С', label: 'AWACS', kinds: k => k === 'awacs' },
];

export interface SymbolGroup {
  /** Answer id: the code, plus '^' when it wears the airborne hat ('15^' F-15, '15' SA-15). */
  id: string;
  symbol: string;
  /** Drawn with the airborne hat (scopes other than the JF-17's). */
  hat: boolean;
  kinds: EmitterKind[];
  label: string;
}

/** Does this scope draw the airborne hat on this emitter? (Matches the kit's isAirborne; the JF-17 draws none.) */
export const wearsHat = (rwr: RwrId, k: EmitterKind): boolean => RWRS[rwr].kind === 'scope' && rwr !== 'jf17rwr' && !isSam(k);

/**
 * Identify options for scope RWRs: one option per thing the pilot can tell apart (the code, with or
 * without the hat), naming every emitter that shows it.
 */
export function symbolGroups(rwr: RwrId): SymbolGroup[] {
  const groups = new Map<string, SymbolGroup>();
  for (const k of emitterKindsFor(rwr)) {
    const symbol = rwrSymbol(rwr, k);
    const hat = wearsHat(rwr, k);
    const id = symbol + (hat ? '^' : '');
    const g = groups.get(id) ?? { id, symbol, hat, kinds: [], label: '' };
    g.kinds.push(k);
    groups.set(id, g);
  }
  const all = [...groups.values()];
  // Labels name the emitters only: telling '15' F-15 from '15' SA-15 by the hat is the test.
  for (const g of all) g.label = joinOr(g.kinds.map(emitterLabel));
  return all;
}

function joinOr(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return xs.slice(0, -1).join(', ') + ' or ' + xs[xs.length - 1];
}

// ---- per-kind builders

function buildTapLock(ctx: Ctx): Question | null {
  const taken: number[] = [];
  const b = pickBearing(ctx, taken);
  if (b === null) return null;
  taken.push(b);
  const kind = pick(ctx.rng, kindsFor(ctx, 'lock', { aircraftOnly: ctx.diff === 'easy' }));
  const lock = makeThreat(ctx, kind, 'lock', jitter(ctx, b));
  const threats = [lock];
  if (!fillers(ctx, Math.max(1, ctx.n) - 1, taken, threats)) return null;
  const answer: Answer = { type: 'tap', correct: [lock.id], candidates: tapCandidates(ctx, threats) };
  const tell = TELL[ctx.rwr].lock;
  return {
    kind: 'tap-lock', prompt: 'Someone has locked you. Tap him on the RWR.', context: null, threats, answer,
    focusId: lock.id, advice: null, ownShot: null, leadS: LEAD_S, seed: 0,
    explain: `${emitterLabel(kind)} at ${clockText(clockOf(lock.bearing))} holds the lock. ${tell}`,
  };
}

function missileThreat(ctx: Ctx, taken: number[], mode: 'any' | 'launch' | 'active', bearingFilter?: (d: number) => boolean, rear?: boolean): Threat | null {
  const want: ThreatState = mode === 'any' ? (ctx.rng() < 0.5 ? 'launch' : 'active') : mode;
  // Aircraft shooters only: the SARH / active-seeker answers and the debrief text are about fighters.
  const kinds = kindsFor(ctx, want, { aircraftOnly: true });
  if (!kinds.length) return null;
  const b = pickBearing(ctx, taken, bearingFilter, rear);
  if (b === null) return null;
  taken.push(b);
  return makeThreat(ctx, pick(ctx.rng, kinds), want, jitter(ctx, b));
}

function buildLaunchClock(ctx: Ctx): Question | null {
  const taken: number[] = [];
  const m = missileThreat(ctx, taken, 'any');
  if (!m) return null;
  const threats = [m];
  if (!fillers(ctx, Math.max(1, ctx.n) - 1, taken, threats)) return null;
  const warnBearing = m.state === 'active' ? missilePlacement(m).bearing : m.bearing;
  const correct = acceptedClocks(ctx.rwr, warnBearing);
  const what = m.state === 'active'
    ? `The ${m.missile ? MISSILES[m.missile].name : 'missile'} is active at ${clockText(clockOf(warnBearing))}.`
    : `${emitterLabel(m.kind)} launched from ${clockText(clockOf(warnBearing))}.`;
  const how = ctx.lamps
    ? ` The SPO lamps sit at 10, 30, 50 and 90° with two rear quadrants: the ${lampWords(warnBearing)} lamp means ${correct.map(clockText).join(' or ')}.`
    : ' Read the angle off the 30° ticks: each tick is one clock hour.';
  return {
    kind: 'launch-clock', prompt: 'Missile warning. What clock position?', context: null, threats,
    answer: { type: 'clock', correct }, focusId: m.id, advice: null, ownShot: null, leadS: LEAD_S, seed: 0,
    explain: what + how,
  };
}

function buildIdentify(ctx: Ctx): Question | null {
  const taken: number[] = [];
  const b = pickBearing(ctx, taken);
  if (b === null) return null;
  taken.push(b);
  const decoy = ctx.diff !== 'easy' && ctx.rng() < 0.35;
  const pool = decoy ? ctx.kinds.filter(k => !isAircraft(k)) : ctx.kinds.filter(isAircraft);
  const kind = pick(ctx.rng, pool.length ? pool : ctx.kinds);
  // SPO-15: only the primary threat's type lamp is yellow. Make the target the strongest contact.
  const state: ThreatState = ctx.lamps && ctx.rng() < 0.4 && canBe(kind, 'lock', ctx.rwr) ? 'lock' : 'search';
  const target = makeThreat(ctx, kind, state, jitter(ctx, b));
  if (ctx.lamps && state === 'search') target.range = Math.min(target.range, isSam(kind) ? target.range : 30_000);
  const threats = [target];
  if (!fillers(ctx, Math.max(1, ctx.n) - 1, taken, threats)) return null;
  if (ctx.lamps) {
    for (const t of threats) if (t !== target && t.kind !== 'awacs' && !isSam(t.kind)) t.range = Math.max(t.range, 70_000);
    const cls = SPO_CLASSES.find(c => c.kinds(kind));
    if (!cls) return null;
    const others = shuffle(ctx.rng, SPO_CLASSES.filter(c => c !== cls)).slice(0, 3);
    const options = shuffle(ctx.rng, [cls, ...others]).map(c => ({ id: c.id, label: c.label }));
    const letter = cls.id;
    const why = isAircraft(kind)
      ? `The yellow type lamp is П: an airborne radar. The SPO cannot tell an F-15 from an Su-27; this one is a ${emitterLabel(kind)}.`
      : `The yellow type lamp is ${letter}: ${cls.label.toLowerCase()} (${emitterLabel(kind)}). Yellow is the primary threat, green the others.`;
    return {
      kind: 'identify', prompt: 'What is the primary threat?', context: null, threats,
      answer: { type: 'choice', options, correct: [cls.id] }, focusId: target.id, advice: null, ownShot: null,
      leadS: state === 'lock' ? LEAD_S : 0, seed: 0, explain: why,
    };
  }
  const groups = symbolGroups(ctx.rwr).filter(g => g.kinds.some(k => ctx.kinds.includes(k)));
  const mine = groups.find(g => g.kinds.includes(kind));
  if (!mine) return null;
  const present = new Set(threats.filter(t => t !== target).map(t => rwrSymbol(ctx.rwr, t.kind)));
  const pool2 = shuffle(ctx.rng, groups.filter(g => g !== mine));
  // Distractors: the same code without / with the hat first (F-15 vs SA-15), then codes on the display.
  const score = (g: SymbolGroup) => (g.symbol === mine.symbol ? 2 : 0) + (present.has(g.symbol) ? 1 : 0);
  pool2.sort((a, b2) => score(b2) - score(a));
  const options = shuffle(ctx.rng, [mine, ...pool2.slice(0, 3)]).map(g => ({ id: g.id, label: g.label }));
  const jf = ctx.rwr === 'jf17rwr';
  const who = joinOr(mine.kinds.map(emitterLabel));
  const read = jf ? `"${mine.symbol}" in an air-threat rectangle is the ${who}.`
    : mine.hat ? `"${mine.symbol}" with the airborne hat is the ${who}.`
      : `"${mine.symbol}" with no hat is a ground radar: the ${who}.`;
  const many = mine.kinds.length > 1 ? ` The RWR cannot tell them apart; this one is a ${emitterLabel(kind)}.` : '';
  const other = jf ? undefined : groups.find(g => g !== mine && g.symbol === mine.symbol);
  const twin = other ? ` With${mine.hat ? 'out' : ''} the hat it would be the ${joinOr(other.kinds.map(emitterLabel))}.` : '';
  return {
    kind: 'identify', prompt: `What is at ${clockText(clockOf(target.bearing))}?`, context: null, threats,
    answer: { type: 'choice', options, correct: [mine.id] }, focusId: target.id, advice: null, ownShot: null, leadS: 0, seed: 0,
    explain: `${read}${many}${twin}`,
  };
}

function buildSeeker(ctx: Ctx): Question | null {
  const taken: number[] = [];
  const m = missileThreat(ctx, taken, 'any');
  if (!m) return null;
  const threats = [m];
  if (!fillers(ctx, Math.max(1, ctx.n) - 1, taken, threats)) return null;
  const options: Choice[] = [
    { id: 'sarh', label: 'SARH launch: his lock guides it' },
    { id: 'active', label: 'Active seeker: its own radar' },
  ];
  const sarh = m.state === 'launch';
  const tell = sarh ? TELL[ctx.rwr].launch : TELL[ctx.rwr].active;
  const then = sarh
    ? ' Beam the shooter: when his lock breaks, the missile goes dumb.'
    : ' Beam the missile itself: the shooter no longer guides it.';
  return {
    kind: 'seeker', prompt: 'Missile warning. SARH launch or active seeker?', context: null, threats,
    answer: { type: 'choice', options, correct: [sarh ? 'sarh' : 'active'] }, focusId: m.id, advice: null, ownShot: null,
    leadS: LEAD_S, seed: 0, explain: tell + then,
  };
}

type ActionCase = 'continue' | 'crank' | 'lock-notch' | 'launch-notch' | 'launch-chaff' | 'active-notch' | 'active-chaff' | 'active-drag-tail' | 'active-drag-below';

function actionCases(ctx: Ctx): ActionCase[] {
  const base: ActionCase[] = ['continue', 'launch-notch', 'launch-chaff'];
  if (ctx.diff === 'easy') return base;
  const med: ActionCase[] = [...base, 'crank', 'lock-notch', 'active-notch', 'active-chaff'];
  if (ctx.diff === 'medium') return med;
  const hard: ActionCase[] = [...med, 'active-drag-tail', 'launch-notch', 'active-notch'];
  if (showsMissileElevation(ctx.rwr)) hard.push('active-drag-below');
  return hard;
}

function buildAction(ctx: Ctx): Question | null {
  const c = pick(ctx.rng, actionCases(ctx));
  const taken: number[] = [];
  const threats: Threat[] = [];
  let own: { missile: MissileId; targetId: string } | null = null;
  // Clearly forward of the beam (SPO: lamps 10+30 .. 50+90), or (scopes only) behind it but not on the tail.
  const fwdNotBeam = (d: number) => Math.abs(d) >= 20 && Math.abs(d) <= 70;
  const rearNotTail = (d: number) => !ctx.lamps && Math.abs(d) >= 110 && Math.abs(d) <= 140;
  const beam = (d: number) => (ctx.lamps ? Math.abs(d) === 90 || Math.abs(d) === 100 : Math.abs(d) === 90);

  switch (c) {
    case 'continue':
    case 'crank': {
      if (!fillers(ctx, Math.max(1, ctx.n), taken, threats)) return null;
      if (c === 'crank') {
        const air = threats.filter(t => isAircraft(t.kind) && Math.abs(deg(t.bearing)) < 45);
        const tgt = air[0];
        const mis = ownRadarMissile(ctx.own);
        if (!tgt || !mis) return null;
        tgt.note = 'Your target';
        tgt.range = Math.min(tgt.range, 45_000);
        own = { missile: mis, targetId: tgt.id };
      }
      break;
    }
    case 'lock-notch': {
      const kinds = kindsFor(ctx, 'lock', { aircraftOnly: true })
        .filter(k => isAircraft(k) && missilesFor(k, 'active').length > 0 && !AIRCRAFT[k].radar.sttArhLaunchWarning);
      const b = pickBearing(ctx, taken, d => fwdNotBeam(d) || rearNotTail(d));
      if (!kinds.length || b === null) return null;
      taken.push(b);
      threats.push(makeThreat(ctx, pick(ctx.rng, kinds), 'lock', jitter(ctx, b)));
      if (!fillers(ctx, Math.max(1, ctx.n) - 1, taken, threats)) return null;
      break;
    }
    case 'launch-notch':
    case 'launch-chaff': {
      const t = missileThreat(ctx, taken, 'launch', c === 'launch-chaff' ? beam : d => fwdNotBeam(d) || rearNotTail(d), true);
      if (!t) return null;
      threats.push(t);
      if (!fillers(ctx, Math.max(1, ctx.n) - 1, taken, threats)) return null;
      break;
    }
    case 'active-notch':
    case 'active-chaff':
    case 'active-drag-tail':
    case 'active-drag-below': {
      // The SPO rear lamps cover 112-180 deg: they cannot show "dead astern", so no tail drag there.
      if (c === 'active-drag-tail' && ctx.lamps) return null;
      const filter = c === 'active-chaff' ? beam
        : c === 'active-drag-tail' ? (d: number) => Math.abs(d) >= 150
          : c === 'active-drag-below' ? (d: number) => Math.abs(d) >= 20 && Math.abs(d) <= 70
            : (d: number) => fwdNotBeam(d) || rearNotTail(d);
      const t = missileThreat(ctx, taken, 'active', filter, true);
      if (!t) return null;
      // A Phoenix has the energy to run you down from behind: no "drag" answer against it.
      if (c === 'active-drag-tail' && (t.missile === 'aim54a' || t.missile === 'aim54c')) return null;
      t.missileBearingOffset = rad(between(ctx.rng, 1, 3) * (ctx.rng() < 0.5 ? -1 : 1));
      if (c === 'active-drag-below') { t.altRel = -6000; t.missileAltRel = -4500; t.missileRange = 12_000; }
      else if (t.altRel < 0) { t.altRel = Math.abs(t.altRel); t.missileAltRel = 800; }
      threats.push(t);
      if (!fillers(ctx, Math.max(1, ctx.n) - 1, taken, threats)) return null;
      break;
    }
  }

  const d = decideAction(ctx.rwr, threats, own);
  const expected: Record<ActionCase, ActionId[]> = {
    continue: ['continue'], crank: ['crank'], 'lock-notch': ['notch-left', 'notch-right'],
    'launch-notch': ['notch-left', 'notch-right'], 'launch-chaff': ['chaff'], 'active-notch': ['notch-left', 'notch-right'],
    'active-chaff': ['chaff'], 'active-drag-tail': ['drag'], 'active-drag-below': ['drag'],
  };
  if (!d.correct.every(a => expected[c].includes(a))) return null;

  const context = own
    ? `Your ${MISSILES[own.missile].name} is in the air toward the bandit at ${clockText(clockOf(threats.find(t => t.id === own?.targetId)?.bearing ?? 0))}.`
    : 'No missile of yours in the air.';
  const options = ACTIONS.map(a => ({ id: a.id, label: a.label }));
  return {
    kind: 'action', prompt: 'What do you do now?', context, threats,
    answer: { type: 'choice', options, correct: d.correct }, focusId: d.focusId,
    advice: { action: d.correct[0], turnDeg: d.turnDeg, label: adviceLabel(d.correct[0], d.turnDeg) }, ownShot: own,
    leadS: threats.some(t => t.state !== 'search') ? LEAD_S : 0, seed: 0, explain: d.why,
  };
}

export function adviceLabel(a: ActionId, turnDeg: number): string {
  const n = Math.round(Math.abs(turnDeg) / 10) * 10;
  switch (a) {
    case 'notch-left': return `Notch left ${n}°`;
    case 'notch-right': return `Notch right ${n}°`;
    case 'crank': return `Crank ${turnDeg < 0 ? 'left' : 'right'} ${n}°`;
    case 'drag': return n ? `Drag: turn ${turnDeg < 0 ? 'left' : 'right'} ${n}°` : 'Drag: keep running';
    case 'chaff': return 'Hold the beam, chaff';
    case 'continue': return 'Continue';
  }
}

/** Verify the RWR picture is unambiguous for the question. */
export function verify(rwr: RwrId, q: Question): boolean {
  const ranked = finalContacts(q.threats);
  const count = (s: RwrContact['state'][]) => ranked.filter(c => s.includes(c.state)).length;
  const lamps = RWRS[rwr].kind === 'lamps';
  // Distinct lamps / bearings between threats (a missile may share its shooter's lamp).
  const emit = ranked.filter(c => c.state !== 'missile');
  for (let i = 0; i < emit.length; i++) for (let j = i + 1; j < emit.length; j++) {
    if (lamps) {
      const a = new Set(spoLamps(emit[i].bearing));
      if (spoLamps(emit[j].bearing).some(x => a.has(x))) return false;
    } else if (Math.abs(deg(wrapPi(emit[i].bearing - emit[j].bearing))) < 24) return false;
  }
  switch (q.kind) {
    case 'tap-lock': return count(['lock']) === 1 && count(['launch', 'missile']) === 0;
    case 'launch-clock':
    case 'seeker': return count(['launch', 'missile']) === 1;
    case 'identify': return !lamps || ranked[0]?.emitterId === q.focusId;
    case 'action': {
      const top = ranked[0];
      if (!top || top.state === 'search') return count(['lock', 'launch', 'missile']) === 0;
      return ranked.filter(c => RANK[c.state] === RANK[top.state]).length === 1
        && (top.state === 'lock' ? count(['launch', 'missile']) === 0 : true);
    }
  }
}

const KIND_WEIGHTS: Record<Difficulty, Record<QuestionKind, number>> = {
  easy: { 'tap-lock': 3, 'launch-clock': 3, identify: 3, seeker: 2, action: 2 },
  medium: { 'tap-lock': 2, 'launch-clock': 2, identify: 3, seeker: 3, action: 3 },
  hard: { 'tap-lock': 2, 'launch-clock': 2, identify: 2, seeker: 3, action: 4 },
};

function pickKind(ctx: Ctx): QuestionKind {
  const w = KIND_WEIGHTS[ctx.diff];
  const total = QUESTION_KINDS.reduce((s, k) => s + w[k], 0);
  let x = ctx.rng() * total;
  for (const k of QUESTION_KINDS) { x -= w[k]; if (x <= 0) return k; }
  return 'action';
}

const THREAT_COUNT: Record<Difficulty, [number, number]> = { easy: [1, 2], medium: [2, 3], hard: [3, 5] };
const SEPARATION: Record<Difficulty, number> = { easy: 60, medium: 45, hard: 30 };

/** Build one question. Deterministic for a given seed and options. */
export function makeQuestion(o: QuizOptions): Question {
  const rng = mulberry32(o.seed);
  const lamps = RWRS[o.rwr].kind === 'lamps';
  const allKinds = emitterKindsFor(o.rwr);
  const kinds = o.difficulty === 'easy' ? allKinds.filter(isAircraft) : allKinds;
  for (let attempt = 0; attempt < 400; attempt++) {
    const [n0, n1] = THREAT_COUNT[o.difficulty];
    const ctx: Ctx = {
      ids: 0, rwr: o.rwr, own: o.own, diff: o.difficulty, rng, lamps, kinds,
      n: intBetween(rng, n0, n1), sepDeg: SEPARATION[o.difficulty],
    };
    const kind = o.kind ?? pickKind(ctx);
    let q: Question | null = null;
    switch (kind) {
      case 'tap-lock': q = buildTapLock(ctx); break;
      case 'launch-clock': q = buildLaunchClock(ctx); break;
      case 'identify': q = buildIdentify(ctx); break;
      case 'seeker': q = buildSeeker(ctx); break;
      case 'action': q = buildAction(ctx); break;
    }
    if (q && verify(o.rwr, q)) {
      // Contacts that start searching at t = 0 are old news; only escalations get new-threat marks.
      if (!q.threats.some(t => t.state !== 'search')) q.leadS = 0;
      return { ...q, seed: o.seed };
    }
  }
  // Fallback (never expected): a single lock ahead.
  const ctx: Ctx = { ids: 0, rwr: o.rwr, own: o.own, diff: 'easy', rng, lamps, kinds: allKinds.filter(isAircraft), n: 1, sepDeg: 60 };
  const t = makeThreat(ctx, 'f15c', 'lock', 30);
  return {
    kind: 'tap-lock', prompt: 'Someone has locked you. Tap him on the RWR.', context: null, threats: [t],
    answer: { type: 'tap', correct: [t.id], candidates: tapCandidates(ctx, [t]) }, focusId: t.id, advice: null, ownShot: null,
    leadS: LEAD_S, seed: o.seed, explain: TELL[o.rwr].lock,
  };
}

