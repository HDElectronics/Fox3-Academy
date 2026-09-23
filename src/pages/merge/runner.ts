/**
 * [OWNER: page-merge] One Merge & guns run without DOM: builds the World for a lesson, flies the player from the
 * stick (or a demo autopilot for screenshots), flies the scripted bandit, fills MergeMetrics and ends the run.
 * The page drives it from its frame loop; tests drive it headless.
 */
import { Vector3 } from 'three';
import type { FighterId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { World } from '../../sim/world';
import type { Aircraft, SimEvent } from '../../sim/types';
import { gunSolution } from '../../sim/guns';
import { mach, sigma, speedFromMach } from '../../sim/atmosphere';
import { liftVector, sustainedGAt } from '../../sim/flight';
import { D2R, MPS_PER_KT } from '../../sim/math';
import { bfmAiStep, chooseCircle, newBfmAi, type BfmAiState } from '../../sim/bfmAi';
import { TURN_G, banditStep, isAiMode, newBandit, type BanditMode, type BanditState } from './bandit';
import { atCorner, classifyPursuit, eas, newStick, pursuitAim, stepStick, steerTo, type Pursuit, type PursuitRead, type Stick } from './bfm';
import {
  CIRCLE_EVAL_S, HOLD_MAX_M, HOLD_MIN_M, LESSONS, PURSUIT_ORDER, YOYO_CLIMB_M, emptyMetrics, stepPursuitPhase, type LessonId, type MergeMetrics,
} from './lessons';

/** Start altitude (m), about 15000 ft. */
export const START_ALT = 4600;
/** Seconds of sim after the end condition before the debrief (let the kill or the break play). */
export const LINGER_S = 1.5;

export type Phase = 'setup' | 'run' | 'end';
/** Demo autopilots for screenshot pre-rolls and headless tests. */
export type Autopilot = 'corner' | Pursuit | 'track' | 'defend' | 'ai';

/** Fighting AI modes the event log names. */
const AI_LOG: Partial<Record<string, string>> = {
  'lead-turn': 'Bandit lead turn', 'turn-away': 'Bandit turns away: one-circle', yoyo: 'Bandit high yo-yo', jink: 'Bandit jinks',
};

/** Geometry of the fight right now: nose angles (deg), range (m), and whether you are behind his wing line. */
export interface Angles { myAta: number; hisAta: number; range: number; behind: boolean }

const _r = new Vector3(), _f = new Vector3(), _g = new Vector3();

/** Angle from each jet's nose to the other (deg), range, and whether `me` is behind the bandit's 3-9 line. */
export function anglesOf(me: Aircraft, b: Aircraft): Angles {
  const rel = _r.subVectors(b.pos, me.pos);
  const range = rel.length();
  rel.divideScalar(Math.max(1, range));
  const um = _f.copy(me.vel).normalize(), ub = _g.copy(b.vel).normalize();
  const myAta = Math.acos(Math.max(-1, Math.min(1, um.dot(rel)))) / D2R;
  const hisAta = Math.acos(Math.max(-1, Math.min(1, -ub.dot(rel)))) / D2R;
  return { myAta, hisAta, range, behind: ub.dot(rel) > 0 };
}

export interface RunHooks {
  finished?(m: MergeMetrics): void;
  log?(text: string, t: number): void;
}

const _aim = new Vector3(), _lift = new Vector3();

export class MergeRun {
  readonly world: World;
  readonly me: Aircraft;
  readonly bandit: Aircraft;
  readonly stick: Stick;
  readonly banditState: BanditState;
  readonly metrics: MergeMetrics = emptyMetrics();
  phase: Phase = 'setup';
  autopilot: Autopilot | null = null;
  /** Latest pursuit read (for the aids and the coach). */
  pursuit: PursuitRead;
  endAt: number | null = null;
  private lastRounds: number;
  private prevLead: Vector3 | null = null;
  /** Demo autopilot 'ai': the fighting AI flying your jet. */
  private apAi: BfmAiState | null = null;
  /** Pass bookkeeping (merge, circles): last range, opening since the first pass, velocity at start and at the pass. */
  private prevRange = Infinity;
  private opening = false;
  private reclosing = false;
  private startDir: Vector3;
  private passDir: Vector3 | null = null;
  private hisPassDir: Vector3 | null = null;
  private passAlt = 0;
  private wasBehind = true;
  private yoyoLiftRaised = false;

  constructor(readonly ac: FighterId, readonly lesson: LessonId, readonly banditMode: BanditMode, seed: number, private hooks: RunHooks = {}) {
    const w = this.world = new World(seed);
    const def = LESSONS[lesson];
    const spec = AIRCRAFT[ac];
    const corner = spec.perf.cornerKts * MPS_PER_KT / Math.sqrt(sigma(START_ALT));
    const m08 = speedFromMach(0.8, START_ALT);
    const redType: FighterId = ac === 'su27' ? 'f15c' : 'su27';
    let meSpeed = m08, bSpeed = m08 * 0.95;
    let mePos = { x: 0, y: START_ALT, z: 0 }, bPos = { x: 0, y: START_ALT, z: -1200 };
    let bHeading = 0, meHeading = 0;
    switch (def.start) {
      case 'solo': meSpeed = corner + 70 * MPS_PER_KT; bPos = { x: 3500, y: START_ALT + 300, z: -2500 }; break;
      case 'behind': bPos = { x: 0, y: START_ALT, z: -1300 }; meSpeed = bSpeed * 1.02; break;
      case 'close-behind': bPos = { x: 220, y: START_ALT, z: -650 }; bHeading = 35 * D2R; meSpeed = bSpeed; break;
      case 'defend': mePos = { x: 0, y: START_ALT, z: 0 }; bPos = { x: 150, y: START_ALT + 60, z: 900 }; meSpeed = m08 * 0.9; bSpeed = m08; break;
      case 'merge': bPos = { x: 450, y: START_ALT, z: -7000 }; bHeading = Math.PI; meSpeed = bSpeed = m08; break;
      // Fast, behind and inside a slow bandit in a hard turn: an overshoot unless you go out of plane.
      case 'overshoot': mePos = { x: -900, y: START_ALT, z: 700 }; meHeading = 30 * D2R; meSpeed = m08 * 1.15; bPos = { x: 0, y: START_ALT, z: 0 }; bSpeed = m08 * 0.66; break;
    }
    this.me = w.spawnAircraft({ side: 'blue', type: ac, callsign: 'You', controller: 'player', pos: mePos, heading: meHeading, speed: meSpeed });
    this.bandit = w.spawnAircraft({ side: 'red', type: redType, callsign: 'Bandit', controller: 'script', pos: bPos, heading: bHeading, speed: bSpeed });
    this.me.cmd.maxG = spec.perf.maxG;
    this.bandit.cmd.maxG = isAiMode(banditMode) ? AIRCRAFT[redType].perf.maxG : 7;
    if (lesson !== 'tracking' && lesson !== 'fight') this.bandit.damage = -1e9;   // the drills keep their bandit
    if (lesson === 'defence') this.me.damage = 0;
    this.stick = newStick(def.start === 'solo' ? 'mil' : 'ab');
    this.banditState = newBandit(banditMode, this.bandit, 1, { enemyType: ac, rand: () => w.rand() });
    if (banditMode === 'turn' || banditMode === 'reverse') this.bandit.roll = Math.acos(1 / TURN_G);
    if (banditMode === 'hard') this.bandit.roll = 70 * D2R;
    if (def.start === 'overshoot') this.me.roll = 60 * D2R;
    this.metrics.circleAdvised = chooseCircle(ac, redType, 'veteran');
    this.startDir = this.me.vel.clone().normalize();
    this.lastRounds = this.me.gun.rounds;
    this.pursuit = classifyPursuit(this.me.pos, this.me.vel, this.bandit.pos, this.bandit.vel);
    // Everyone starts in BFM mode, wings level.
    this.me.cmd.bfm = { bank: 0, g: 1, throttle: this.stick.throttle };
    this.applyBandit(0);
    w.on(e => this.onEvent(e));
  }

  start(): void { if (this.phase === 'setup') this.phase = 'run'; }

  get timeLeft(): number { return Math.max(0, LESSONS[this.lesson].durationS - this.metrics.t); }

  /** Current requested pursuit in the pursuit drill. */
  get requested(): Pursuit | null {
    return this.lesson === 'pursuit' ? PURSUIT_ORDER[this.metrics.phase] ?? null : null;
  }

  /** Advance by dt (s). The sim runs at 60 Hz inside; controls apply per call. */
  tick(dt: number): void {
    if (this.phase === 'setup' || dt <= 0) return;
    const steps = Math.max(1, Math.ceil(dt * 60 - 1e-6));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h);
  }

  private step(h: number): void {
    const me = this.me, w = this.world;
    if (me.alive) {
      if (this.autopilot) this.fly(this.autopilot, h);
      else { me.cmd.bfm = stepStick(this.stick, me, h); me.cmd.trigger = this.stick.trigger; }
    } else me.cmd.trigger = false;
    this.applyBandit(h);
    const scoring = this.phase === 'run';
    const damageTaken = me.damage, damageDealt = this.bandit.damage;
    w.step(h);
    // Hits are random visual/coaching events; damage is continuous, including the killing step.
    // Deltas also work for drill bandits whose damage starts negative to keep them alive.
    if (scoring) {
      this.metrics.damageTaken += Math.max(0, me.damage - damageTaken);
      this.metrics.damageDealt += Math.max(0, this.bandit.damage - damageDealt);
    }
    if (this.phase === 'run') this.measure(h);
    else if (this.phase === 'end' && this.endAt !== null && w.t >= this.endAt) {
      this.endAt = null;
      this.hooks.finished?.(this.metrics);
    }
  }

  private applyBandit(h: number): void {
    const b = this.bandit;
    if (!b.alive) { b.cmd.trigger = false; return; }
    const bs = this.banditState;
    const before = bs.aiMode;
    const r = banditStep(bs, b, this.me.alive ? this.me : null, this.world.t, h);
    b.cmd.bfm = r.bfm;
    b.cmd.trigger = this.phase === 'run' && r.trigger;
    if (bs.aiMode && bs.aiMode !== before && this.phase === 'run') {
      const mv = this.metrics.aiMoves;
      mv[bs.aiMode] = (mv[bs.aiMode] ?? 0) + 1;
      const text = AI_LOG[bs.aiMode];
      if (text) this.hooks.log?.(text, this.world.t);
    }
  }

  /** Demo autopilot (pre-rolls, tests): flies a lesson's goal with the steering law. */
  private fly(ap: Autopilot, h: number): void {
    const me = this.me, b = this.bandit;
    const spec = AIRCRAFT[this.ac];
    me.cmd.trigger = false;
    switch (ap) {
      case 'corner': {
        // Max g above corner, the sustained turn at or below it (full afterburner holds the speed).
        const over = eas(me) / MPS_PER_KT - spec.perf.cornerKts;
        const sus = sustainedGAt(me, mach(me.vel.length(), me.pos.y), me.pos.y);
        me.cmd.bfm = { bank: 78 * D2R, g: over > 0 ? 'max' : sus, throttle: over > 15 ? 'mil' : 'ab' };
        break;
      }
      case 'lead': case 'pure': case 'lag':
        me.cmd.bfm = steerTo(me, pursuitAim(me, b, ap, _aim), 'ab', 1.4);
        break;
      case 'track': {
        // Aim where the lead point is going (it rotates with his turn), so the pull keeps up with it.
        const sol = gunSolution(me, b);
        const gain = 5;
        if (!this.prevLead) this.prevLead = sol.lead.clone();
        _aim.copy(sol.lead).sub(this.prevLead).multiplyScalar(1 / Math.max(1e-3, h * gain)).add(sol.lead).normalize();
        this.prevLead.copy(sol.lead);
        me.cmd.bfm = steerTo(me, _aim, sol.range < 400 ? 'idle' : 'ab', gain);
        me.cmd.trigger = this.phase === 'run' && sol.inRange && sol.missAngle < 1.5 * sol.sizeAngle;
        break;
      }
      case 'defend':
        me.cmd.bfm = { bank: -80 * D2R, g: 'max', throttle: 'ab' };
        break;
      case 'ai': {
        // The fighting AI (veteran) flies your jet: lead turn, circle choice, yo-yo, guns.
        this.apAi ??= newBfmAi(me, b.type, 'veteran', () => this.world.rand());
        const o = bfmAiStep(this.apAi, me, b.alive ? b : null, this.world.t, h, () => this.world.rand());
        me.cmd.bfm = o.bfm;
        me.cmd.trigger = this.phase === 'run' && o.trigger;
        break;
      }
    }
  }

  /** Pass, circle, angles and yo-yo bookkeeping for the merge, circles and yo-yo drills. */
  private measureGeometry(h: number): void {
    const m = this.metrics, me = this.me, b = this.bandit;
    const a = anglesOf(me, b);
    const closing = a.range < this.prevRange;
    // First pass: the range stops closing inside 3 km.
    if (m.passT === null && !closing && Number.isFinite(this.prevRange) && this.prevRange < 3000 && (this.lesson === 'merge' || this.lesson === 'circles' || this.lesson === 'fight')) {
      m.passT = m.t;
      m.passRange = this.prevRange;
      this.passDir = me.vel.clone().normalize();
      m.leadTurnDeg = Math.acos(Math.max(-1, Math.min(1, this.passDir.dot(this.startDir)))) / D2R;
      this.hisPassDir = b.vel.clone().normalize();
      this.passAlt = me.pos.y;
      this.opening = true;
      this.hooks.log?.('First pass', m.t);
    }
    if (m.passT !== null && this.passDir) {
      const since = m.t - m.passT;
      if (m.circleFlown === null && since >= 3 && this.hisPassDir) {
        // Both jets turning the same way round (seen from above): two-circle; opposite ways: one-circle.
        const yaw = (d0: Vector3, v: Vector3) => Math.sign(d0.z * v.x - d0.x * v.z);
        m.circleFlown = yaw(this.passDir, me.vel) === yaw(this.hisPassDir, b.vel) ? 'two' : 'one';
      }
      if (m.vertical === null && since >= 6) {
        const dy = me.pos.y - this.passAlt;
        m.vertical = dy > 150 ? 'high' : dy < -150 ? 'low' : 'level';
      }
      // Second pass: after opening, the range closes again and then opens.
      if (this.opening && closing) { this.opening = false; this.reclosing = true; }
      else if (this.reclosing && !closing && m.secondPassT === null && since > 5) {
        m.secondPassT = m.t;
        m.anglesDeg = a.hisAta - a.myAta;
        this.hooks.log?.('Second pass', m.t);
        if (this.lesson === 'merge') this.end();
      }
      if (m.secondPassT === null) m.anglesDeg = a.hisAta - a.myAta;
      if (this.lesson === 'circles') {
        m.myAtaDeg = a.myAta; m.aotDeg = 180 - a.hisAta; m.rangeM = a.range;
        if (since >= CIRCLE_EVAL_S) this.end();
      }
    }
    if (this.lesson === 'yoyo') {
      if (this.wasBehind && !a.behind && a.range < HOLD_MAX_M) { m.overshoots++; this.hooks.log?.('Overshoot', m.t); }
      this.wasBehind = a.behind;
      const held = a.behind && a.range >= HOLD_MIN_M && a.range <= HOLD_MAX_M;
      if (held) m.heldS += h;
      const height = me.pos.y - b.pos.y; // The scripted bandit turns in a horizontal plane.
      m.climbM = Math.max(m.climbM, height);
      if (me.vel.y > 10 && me.g > 1.5 && liftVector(me, _lift).y > 0.5) this.yoyoLiftRaised = true;
      if (this.yoyoLiftRaised && height > YOYO_CLIMB_M) m.outOfPlane = true;
      // Recover after the climb: descending back onto him, behind his wing line with the nose on him.
      if (m.outOfPlane && held && a.myAta < 60 && me.vel.y < b.vel.y) m.recoveredS += h;
    }
    this.prevRange = a.range;
  }

  private measure(h: number): void {
    const m = this.metrics, me = this.me, b = this.bandit;
    m.t += h;
    if (me.alive) {
      const kts = eas(me) / MPS_PER_KT;
      m.minKts = Math.min(m.minKts, kts);
      m.maxG = Math.max(m.maxG, me.g);
      if (me.g >= 3) m.turningS += h;
      if (atCorner(eas(me), AIRCRAFT[this.ac].perf.cornerKts, me.g)) m.cornerS += h;
      const fired = this.lastRounds - me.gun.rounds;
      this.lastRounds = me.gun.rounds;
      if (b.alive) {
        this.pursuit = classifyPursuit(me.pos, me.vel, b.pos, b.vel);
        m.pursuitS[this.pursuit.kind] += h;
        const sol = gunSolution(me, b);
        if (sol.inSolution) m.solutionS += h;
        if (fired > 0) { m.roundsFired += fired; if (sol.inSolution) m.roundsInSolution += fired; }
        if (gunSolution(b, me).inSolution) m.hisSolutionS += h;
        if (this.lesson === 'pursuit' && stepPursuitPhase(m, this.pursuit.kind, h)) this.end();
        this.measureGeometry(h);
      } else if (fired > 0) m.roundsFired += fired;
    }
    if (m.t >= LESSONS[this.lesson].durationS) this.end();
  }

  end(): void {
    if (this.phase !== 'run') return;
    this.phase = 'end';
    this.endAt = this.world.t + LINGER_S;
    this.me.cmd.trigger = false;
    this.stick.trigger = false;
  }

  private onEvent(e: SimEvent): void {
    if (this.phase !== 'run') return;
    const m = this.metrics;
    if (e.type === 'gun-hit') {
      if (e.shooterId === this.me.id) m.hits += e.hits;
      else if (e.targetId === this.me.id) m.hitsTaken += e.hits;
      if (e.targetId === this.me.id) this.hooks.log?.(`Hit: ${e.hits} rounds`, e.t);
    } else if (e.type === 'kill') {
      if (e.targetId === this.bandit.id) { m.killed = 'bandit'; this.hooks.log?.('Splash the bandit', e.t); }
      else if (e.targetId === this.me.id) { m.killed = 'me'; this.hooks.log?.('You were shot down', e.t); }
      this.end();
    } else if (e.type === 'gun' && e.shooterId === this.bandit.id && e.what === 'burst') {
      this.hooks.log?.('Bandit guns', e.t);
    }
  }
}
