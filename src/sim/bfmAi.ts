/**
 * [OWNER: sim-ai] Fighting AI for close combat (Merge & guns free fight). Flies the sim's BFM command
 * (`cmd.bfm`) and the gun trigger with the rules community BFM guides teach for DCS: lead turn at the merge,
 * one-circle or two-circle by jet and skill, lag pursuit at range and lead for the shot, a high yo-yo on an
 * overshoot, guns when in the solution, and a jink out of plane when the enemy has a gun solution.
 *
 * Arcade and rule-based (AGENTS.md rule 1): no flight-model or ballistics engineering. It reacts to a picture of
 * the enemy that is `reactionS` old (extrapolated), a seeded per-skill delay drawn from `world.rand` once, so a
 * seed replays the same fight. The BVR AI in ai.ts is untouched. Skill levels are trainer levels, not DCS AI
 * skills. See docs/api/sim-ai.md, "Fighting AI (bfmAi.ts)".
 */
import { Vector3 } from 'three';
import type { Aircraft, BfmCommand, BfmThrottle } from './types';
import { AIRCRAFT } from '../data/aircraft';
import { turnPerfFor, sustainedG } from '../data/wvr';
import { availableG } from './flight';
import { BULLET_SPEED, gunOf, gunSolution } from './guns';
import { sigma } from './atmosphere';
import { D2R, G0, MPS_PER_KT, clamp, wrapPi } from './math';

export type BfmSkill = 'rookie' | 'regular' | 'veteran';
export const BFM_SKILLS: BfmSkill[] = ['rookie', 'regular', 'veteran'];
export type Circle = 'one' | 'two';
export type BfmAiMode = 'merge' | 'lead-turn' | 'turn-away' | 'lag' | 'pure' | 'lead' | 'guns' | 'yoyo' | 'jink' | 'recover';

export interface BfmSkillSpec {
  label: string;
  /** Mean reaction delay (s); each fight draws 0.8..1.2 × this. */
  reactionS: number;
  /** Share of the available g it pulls. */
  gFrac: number;
  /** Steering gain toward the aim point (higher = tighter tracking). */
  gain: number;
  /** Fires when the miss angle is under this many target sizes. */
  fireWithin: number;
  leadTurn: boolean;
  yoyo: boolean;
  /** Seconds of each jink. */
  jinkS: number;
}

/** Trainer levels (simplified, not DCS AI skill settings). */
export const BFM_SKILL: Record<BfmSkill, BfmSkillSpec> = {
  rookie: { label: 'Rookie', reactionS: 1.1, gFrac: 0.8, gain: 2, fireWithin: 3, leadTurn: false, yoyo: false, jinkS: 0.9 },
  regular: { label: 'Regular', reactionS: 0.6, gFrac: 0.92, gain: 3.5, fireWithin: 2, leadTurn: true, yoyo: true, jinkS: 1.3 },
  veteran: { label: 'Veteran', reactionS: 0.3, gFrac: 1, gain: 5, fireWithin: 1.4, leadTurn: true, yoyo: true, jinkS: 1.6 },
};

/** Burst and pause lengths (s) of the AI's gun. */
export const AI_BURST_S = 0.8;
export const AI_PAUSE_S = 0.7;
/** Pursuit ranges (m): lag beyond LAG_RANGE_M, lead inside it, guns inside the gun range. */
export const LAG_RANGE_M = 1800;
/** Seconds a high yo-yo lasts at most. */
export const YOYO_S = 3;
/** Recovery floor (m above sea level in the sim frame). */
export const RECOVER_ALT_M = 1200;

// ---- pure helpers ----------------------------------------------------------------------------------------------

/** Sustained g at Mach 0.6, 5000 ft from the jet's turn table (trainer estimate). */
function rateScore(type: string): number {
  const tp = turnPerfFor(type);
  return tp ? sustainedG(tp, 0.6, 5000) : AIRCRAFT[type as keyof typeof AIRCRAFT]?.perf.maxG ?? 7;
}

/**
 * One-circle or two-circle for `me` against `them` (trainer rule after the community guides): a clear sustained
 * turn advantage fights two-circle (rate), a jet with a lower corner speed and no rate advantage fights
 * one-circle (radius). Rookies always turn toward the bandit (two-circle). Simplified.
 */
export function chooseCircle(me: string, them: string, skill: BfmSkill): Circle {
  if (skill === 'rookie') return 'two';
  const dRate = rateScore(me) - rateScore(them);
  const cMe = AIRCRAFT[me as keyof typeof AIRCRAFT]?.perf.cornerKts ?? 400;
  const cThem = AIRCRAFT[them as keyof typeof AIRCRAFT]?.perf.cornerKts ?? 400;
  if (dRate >= 0.3) return 'two';
  if (cMe <= cThem - 20 || dRate <= -0.5) return 'one';
  return skill === 'veteran' && dRate < 0 ? 'one' : 'two';
}

/** Pursuit the AI wants at this range (m): lag far out, lead to close, guns inside gun range. */
export function pursuitFor(range: number, gunRangeM: number): 'lag' | 'lead' | 'guns' {
  if (range > LAG_RANGE_M) return 'lag';
  if (range > gunRangeM * 1.15) return 'lead';
  return 'guns';
}

/**
 * Overshoot test: the line of sight turns faster than 90 % of the attacker's available turn rate while closing
 * inside 1500 m with the target ahead. The cue for a high yo-yo.
 */
export function overshootRisk(me: Aircraft, tgtPos: Vector3, tgtVel: Vector3): boolean {
  const rel = _a.subVectors(tgtPos, me.pos);
  const range = rel.length();
  if (range > 1500 || range < 50) return false;
  const los = rel.divideScalar(range);
  const u = _b.copy(me.vel).normalize();
  if (u.dot(los) < 0.2) return false;
  const rv = _c.subVectors(tgtVel, me.vel);
  const closure = -rv.dot(los);
  if (closure < 25) return false;
  const cosOff = me.vel.dot(tgtVel) / Math.max(1, me.vel.length() * tgtVel.length());
  // Fast and at a high angle off inside 1000 m: he will be behind the 3-9 line before the nose gets there.
  if (range < 1000 && cosOff < Math.cos(35 * D2R) && range / closure < 8) return true;
  const losRate = rv.addScaledVector(los, -rv.dot(los)).length() / range;
  const myRate = availableG(me) * G0 / Math.max(1, me.vel.length());
  return losRate > 0.9 * myRate;
}

/** Throttle that keeps the jet near its corner speed (trainer rule): idle well above, mil above, burner below. */
export function cornerThrottle(ac: Aircraft): BfmThrottle {
  const corner = AIRCRAFT[ac.type as keyof typeof AIRCRAFT]?.perf.cornerKts ?? 400;
  const kts = ac.vel.length() * Math.sqrt(sigma(Math.max(0, ac.pos.y))) / MPS_PER_KT;
  return kts > corner + 60 ? 'idle' : kts > corner + 15 ? 'mil' : 'ab';
}

// ---- steering law ----------------------------------------------------------------------------------------------

const _u = new Vector3(), _e = new Vector3(), _l0 = new Vector3(), _r0 = new Vector3();
const _a = new Vector3(), _b = new Vector3(), _c = new Vector3();

/**
 * Roll the lift vector onto `dir` (unit, world) and pull to bring the nose there: turn rate = gain × angle.
 * Unloads while the bank is far off (roll first, then pull). `maxG` caps the pull.
 */
export function steerBfm(ac: Aircraft, dir: Vector3, throttle: BfmThrottle, gain = 1.2, maxG = Infinity): BfmCommand {
  const v = Math.max(1, ac.vel.length());
  const u = _u.copy(ac.vel).divideScalar(v);
  const e = _e.copy(dir).addScaledVector(u, -u.dot(dir));
  const angle = Math.acos(clamp(u.dot(dir), -1, 1));
  const avail = Math.min(availableG(ac), maxG);
  const h = 1 - u.y * u.y;
  if (e.length() < 1e-4 || h < 0.002) return { bank: ac.roll, g: Math.min(avail, 1), throttle };
  const k = 1 / Math.sqrt(h);
  _l0.set(-u.y * u.x * k, h * k, -u.y * u.z * k);
  _r0.crossVectors(u, _l0);
  const bank = Math.atan2(e.dot(_r0), e.dot(_l0));
  const liftUp = Math.cos(bank) * Math.sqrt(h);        // lift vector's share against gravity
  let g = gain * angle * v / G0 + Math.max(0, liftUp);
  if (Math.abs(wrapPi(bank - ac.roll)) > 60 * D2R) g = Math.min(g, 1);
  return { bank, g: clamp(g, 0, avail), throttle };
}

// ---- state and step --------------------------------------------------------------------------------------------

interface Sample { t: number; pos: Vector3; vel: Vector3 }

export interface BfmAiState {
  skill: BfmSkill;
  spec: BfmSkillSpec;
  /** This fight's reaction delay (s). */
  reactionS: number;
  circle: Circle;
  phase: 'merge' | 'fight';
  mode: BfmAiMode;
  /** Seconds the enemy has held a gun solution on us (reset when he loses it). */
  threatS: number;
  jinkT: number;
  jinkBank: number;
  jinkCooldown: number;
  yoyoT: number;
  yoyoBank: number;
  yoyoCooldown: number;
  /** Lead-turn side (horizontal unit vector toward his side). */
  side: Vector3;
  turnAwayT: number;
  /** One-circle turn direction: +1 right, −1 left. */
  awaySign: number;
  burst: number;
  pause: number;
  prevLead: Vector3 | null;
  /** Aim trim built up while tracking. */
  trim: Vector3;
  hist: Sample[];
  /** Count of each mode entered (debrief, tests). */
  entered: Partial<Record<BfmAiMode, number>>;
}

export interface BfmAiOutput { bfm: BfmCommand; trigger: boolean; mode: BfmAiMode }

/** New fighting AI for `ac` against a jet of type `enemyType`. Draws the reaction delay from `rand` once. */
export function newBfmAi(ac: Aircraft, enemyType: string, skill: BfmSkill, rand: () => number): BfmAiState {
  const spec = BFM_SKILL[skill];
  return {
    skill, spec, reactionS: spec.reactionS * (0.8 + 0.4 * rand()), circle: chooseCircle(ac.type, enemyType, skill),
    phase: 'merge', mode: 'merge', threatS: 0, jinkT: 0, jinkBank: 0, jinkCooldown: 0, yoyoT: 0, yoyoBank: 0, yoyoCooldown: 0, side: new Vector3(), turnAwayT: 0, awaySign: 1,
    burst: 0, pause: 0, prevLead: null, trim: new Vector3(), hist: [], entered: { merge: 1 },
  };
}

const _pos = new Vector3(), _vel = new Vector3(), _los = new Vector3(), _aim = new Vector3(), _lead = new Vector3(), _d = new Vector3();

/** The enemy as the AI sees him: the state `reactionS` ago, extrapolated to now. */
function picture(s: BfmAiState, tgt: Aircraft, t: number): { pos: Vector3; vel: Vector3 } {
  s.hist.push({ t, pos: tgt.pos.clone(), vel: tgt.vel.clone() });
  const want = t - s.reactionS;
  while (s.hist.length > 1 && s.hist[1]!.t <= want) s.hist.shift();
  const h = s.hist[0]!;
  const age = Math.max(0, t - h.t);
  return { pos: _pos.copy(h.pos).addScaledVector(h.vel, age), vel: _vel.copy(h.vel) };
}

function setMode(s: BfmAiState, m: BfmAiMode): void {
  if (s.mode !== m) s.entered[m] = (s.entered[m] ?? 0) + 1;
  s.mode = m;
}

/**
 * One step of the fighting AI. Returns the BFM command, the trigger and the mode it is in. `rand` is the world's
 * seeded generator (jink direction).
 */
export function bfmAiStep(s: BfmAiState, ac: Aircraft, tgt: Aircraft | null, t: number, dt: number, rand: () => number): BfmAiOutput {
  const avail = availableG(ac) * s.spec.gFrac;
  const level = (): BfmAiOutput => ({ bfm: { bank: 0, g: 1, throttle: 'mil' }, trigger: false, mode: s.mode });
  if (!tgt || !tgt.alive) return level();
  const u = _u.copy(ac.vel).normalize();

  // Ground: pull out first.
  if (ac.pos.y < RECOVER_ALT_M && ac.vel.y < 0) {
    setMode(s, 'recover');
    _aim.set(u.x, 0, u.z).normalize().setY(0.5).normalize();
    return { bfm: steerBfm(ac, _aim, 'ab', 2, avail), trigger: false, mode: s.mode };
  }

  const p = picture(s, tgt, t);
  _los.subVectors(p.pos, ac.pos);
  const range = _los.length();
  _los.divideScalar(Math.max(1, range));
  const ata = Math.acos(clamp(u.dot(_los), -1, 1));
  const gunMax = gunOf(ac)?.maxRangeM.value ?? 1200;

  // Threat: the enemy's gun line on us (real geometry, acted on after the reaction delay).
  const his = gunSolution(tgt, ac);
  s.threatS = his.inRange && his.missAngle < 2.5 * his.sizeAngle ? s.threatS + dt : 0;
  s.jinkCooldown = Math.max(0, s.jinkCooldown - dt);
  if (s.jinkT > 0) {
    s.jinkT -= dt;
    if (s.jinkT <= 0) s.jinkCooldown = 0.5;
    setMode(s, 'jink');
    return { bfm: { bank: s.jinkBank, g: availableG(ac), throttle: 'ab' }, trigger: false, mode: s.mode };
  }
  if (s.threatS >= s.reactionS && s.jinkCooldown <= 0) {
    // Out of plane: roll 90..135° away from the current lift vector, then pull.
    const side = rand() < 0.5 ? -1 : 1;
    s.jinkBank = wrapPi(ac.roll + side * (90 + 45 * rand()) * D2R);
    s.jinkT = s.spec.jinkS;
    s.phase = 'fight';
    setMode(s, 'jink');
    return { bfm: { bank: s.jinkBank, g: 1, throttle: 'ab' }, trigger: false, mode: s.mode };
  }

  // ---- merge: lead turn (or pass for a one-circle fight) ----
  if (s.phase === 'merge') {
    const passed = u.dot(_los) < 0;
    const headOn = ac.vel.dot(p.vel) < 0;
    if (passed || !headOn) {
      s.phase = 'fight';
      if (s.circle === 'one') {
        // Turn direction fixed at the pass: away from his side.
        s.turnAwayT = 25;
        s.awaySign = (-u.z) * (ac.pos.x - p.pos.x) + u.x * (ac.pos.z - p.pos.z) >= 0 ? 1 : -1;
      }
    } else {
      // Lead turn as he drifts toward the wing line (25° off the nose) or inside 500 m: early enough to gain
      // angles, late enough to pass behind him rather than across his nose.
      if (s.circle === 'two' && s.spec.leadTurn && (ata > 25 * D2R || range < 500)) {
        // Turn toward his side before the pass: a level max-rate turn, side picked once.
        if (s.mode !== 'lead-turn') {
          // His side at the closest point of approach (relative motion), not relative to our nose.
          const rv = _b.subVectors(p.vel, ac.vel);
          const rel = _c.subVectors(p.pos, ac.pos);
          s.side.copy(rel).addScaledVector(rv, -rel.dot(rv) / Math.max(1, rv.lengthSq())).setY(0);
          if (s.side.lengthSq() < 1e-6) s.side.set(-u.z, 0, u.x);
          s.side.normalize();
        }
        setMode(s, 'lead-turn');
        _aim.set(u.x, 0, u.z).normalize().addScaledVector(s.side, 1.5).normalize();
        return { bfm: steerBfm(ac, _aim, cornerThrottle(ac), 4, avail), trigger: false, mode: s.mode };
      }
      // Point just to his side for a close pass.
      setMode(s, 'merge');
      // Keep the side we are on relative to his flight path.
      _d.subVectors(ac.pos, p.pos);
      _b.copy(p.vel).setY(0).normalize();
      _d.addScaledVector(_b, -_d.dot(_b)).setY(0);
      if (_d.lengthSq() < 1) _d.set(-_b.z, 0, _b.x);
      _d.normalize();
      _aim.copy(p.pos).addScaledVector(_d, 300).sub(ac.pos).normalize();
      return { bfm: steerBfm(ac, _aim, cornerThrottle(ac), 1.2, avail), trigger: false, mode: s.mode };
    }
  }

  // ---- one-circle: turn away from him after the pass until he is ahead again ----
  if (s.turnAwayT > 0) {
    s.turnAwayT -= dt;
    if (ata < 70 * D2R) s.turnAwayT = 0;
    else {
      setMode(s, 'turn-away');
      // A level turn away from his side, the same way round until he is back in front.
      _d.set(-u.z, 0, u.x).normalize().multiplyScalar(s.awaySign);
      _aim.set(u.x, 0, u.z).normalize().addScaledVector(_d, 1.5).normalize();
      return { bfm: steerBfm(ac, _aim, 'mil', 3, avail), trigger: false, mode: s.mode };
    }
  }

  // ---- high yo-yo ----
  if (s.yoyoT > 0) {
    s.yoyoT -= dt;
    // Done once he is back in front of the nose and the closure is gone.
    if (s.yoyoT < YOYO_S - 1 && ata < 30 * D2R && _d.subVectors(p.vel, ac.vel).dot(_los) > 0) s.yoyoT = 0;
    else {
      setMode(s, 'yoyo');
      return { bfm: { bank: s.yoyoBank, g: Math.min(avail, 5), throttle: 'mil' }, trigger: false, mode: s.mode };
    }
  }
  s.yoyoCooldown = Math.max(0, s.yoyoCooldown - dt);
  if (s.spec.yoyo && s.yoyoCooldown <= 0 && Math.abs(ac.roll) > 40 * D2R && overshootRisk(ac, p.pos, p.vel)) {
    // Lift vector rolled 60° toward the vertical, above his plane: nose up and out of plane, speed into height.
    s.yoyoT = YOYO_S;
    s.yoyoBank = Math.sign(ac.roll) * Math.max(20 * D2R, Math.abs(ac.roll) - 60 * D2R);
    s.yoyoCooldown = YOYO_S + 3;
    setMode(s, 'yoyo');
    return { bfm: { bank: s.yoyoBank, g: Math.min(avail, 5), throttle: 'mil' }, trigger: false, mode: s.mode };
  }

  // ---- pursuit and guns ----
  const want = pursuitFor(range, gunMax);
  let throttle: BfmThrottle = cornerThrottle(ac);
  if (want === 'lag') {
    setMode(s, 'lag');
    const lagS = clamp(range / 500, 1, 3);
    _aim.copy(p.pos).addScaledVector(p.vel, -lagS).sub(ac.pos).normalize();
    s.prevLead = null; s.trim.set(0, 0, 0);
    return { bfm: steerBfm(ac, _aim, throttle, 1.5, avail), trigger: false, mode: s.mode };
  }
  if (want === 'lead') {
    setMode(s, 'lead');
    const leadS = clamp(range / 600, 1, 2.5);
    _aim.copy(p.pos).addScaledVector(p.vel, leadS).sub(ac.pos).normalize();
    s.prevLead = null; s.trim.set(0, 0, 0);
    return { bfm: steerBfm(ac, _aim, throttle, 2, avail), trigger: false, mode: s.mode };
  }
  setMode(s, 'guns');
  // Tracking flies the gun sight, which is live: the real lead point, with its own drift fed forward.
  const tof = ac.pos.distanceTo(tgt.pos) / BULLET_SPEED;
  _lead.copy(tgt.pos).addScaledVector(tgt.vel, tof).addScaledVector(ac.vel, -tof).sub(ac.pos).normalize();
  if (!s.prevLead) s.prevLead = _lead.clone();
  const gain = s.spec.gain;
  _aim.copy(_lead).sub(s.prevLead).multiplyScalar(1 / Math.max(1e-3, dt * gain)).add(_lead);
  s.prevLead.copy(_lead);
  // Trim out the steady miss (gravity across the turn) like a pilot walking the pipper on.
  s.trim.addScaledVector(_d.subVectors(_lead, u), gain * dt);
  if (s.trim.length() > 0.08) s.trim.setLength(0.08);
  _aim.add(s.trim).normalize();
  const closure = -_d.subVectors(p.vel, ac.vel).dot(_los);
  // Match his speed inside gun range: power off (and boards) while closing, so the pass does not happen.
  if (closure > 0 && range < 300 + 12 * closure) throttle = 'idle';
  else if (closure > -15 && range < 400) throttle = 'mil';
  const bfm = steerBfm(ac, _aim, throttle, gain, avail);
  if (throttle === 'idle' && (closure > 40 || range < 250)) bfm.speedbrake = true;

  const mine = gunSolution(ac, tgt);
  let trigger = false;
  if (s.burst > 0) { s.burst -= dt; trigger = true; if (s.burst <= 0) s.pause = AI_PAUSE_S; }
  else if (s.pause > 0) s.pause -= dt;
  else if (mine.inRange && mine.missAngle < s.spec.fireWithin * mine.sizeAngle && ac.gun.rounds > 0) { s.burst = AI_BURST_S; trigger = true; }
  return { bfm, trigger, mode: s.mode };
}
