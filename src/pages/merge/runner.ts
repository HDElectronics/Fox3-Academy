/**
 * [OWNER: page-merge] One Merge & guns run without DOM: builds the World for a lesson, flies the player from the
 * stick (or a demo autopilot for screenshots), flies the scripted bandit, fills MergeMetrics and ends the run.
 * The page drives it from its frame loop; tests drive it headless.
 */
import { Vector3 } from 'three';
import type { AircraftId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { World } from '../../sim/world';
import type { Aircraft, SimEvent } from '../../sim/types';
import { gunSolution } from '../../sim/guns';
import { mach, sigma, speedFromMach } from '../../sim/atmosphere';
import { sustainedGAt } from '../../sim/flight';
import { D2R, MPS_PER_KT } from '../../sim/math';
import { TURN_G, banditStep, newBandit, type BanditMode, type BanditState } from './bandit';
import { atCorner, classifyPursuit, eas, newStick, pursuitAim, stepStick, steerTo, type Pursuit, type PursuitRead, type Stick } from './bfm';
import { LESSONS, PURSUIT_ORDER, emptyMetrics, stepPursuitPhase, type LessonId, type MergeMetrics } from './lessons';

/** Start altitude (m), about 15000 ft. */
export const START_ALT = 4600;
/** Seconds of sim after the end condition before the debrief (let the kill or the break play). */
export const LINGER_S = 1.5;

export type Phase = 'setup' | 'run' | 'end';
/** Demo autopilots for screenshot pre-rolls and headless tests. */
export type Autopilot = 'corner' | Pursuit | 'track' | 'defend';

export interface RunHooks {
  finished?(m: MergeMetrics): void;
  log?(text: string, t: number): void;
}

const _aim = new Vector3();

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

  constructor(readonly ac: AircraftId, readonly lesson: LessonId, readonly banditMode: BanditMode, seed: number, private hooks: RunHooks = {}) {
    const w = this.world = new World(seed);
    const def = LESSONS[lesson];
    const spec = AIRCRAFT[ac];
    const corner = spec.perf.cornerKts * MPS_PER_KT / Math.sqrt(sigma(START_ALT));
    const m08 = speedFromMach(0.8, START_ALT);
    const redType: AircraftId = ac === 'su27' ? 'f15c' : 'su27';
    let meSpeed = m08, bSpeed = m08 * 0.95;
    let mePos = { x: 0, y: START_ALT, z: 0 }, bPos = { x: 0, y: START_ALT, z: -1200 };
    let bHeading = 0;
    switch (def.start) {
      case 'solo': meSpeed = corner + 70 * MPS_PER_KT; bPos = { x: 3500, y: START_ALT + 300, z: -2500 }; break;
      case 'behind': bPos = { x: 0, y: START_ALT, z: -1300 }; meSpeed = bSpeed * 1.02; break;
      case 'close-behind': bPos = { x: 220, y: START_ALT, z: -650 }; bHeading = 35 * D2R; meSpeed = bSpeed; break;
      case 'defend': mePos = { x: 0, y: START_ALT, z: 0 }; bPos = { x: 150, y: START_ALT + 60, z: 900 }; meSpeed = m08 * 0.9; bSpeed = m08; break;
      case 'merge': bPos = { x: 450, y: START_ALT, z: -7000 }; bHeading = Math.PI; meSpeed = bSpeed = m08; break;
    }
    this.me = w.spawnAircraft({ side: 'blue', type: ac, callsign: 'You', controller: 'player', pos: mePos, heading: 0, speed: meSpeed });
    this.bandit = w.spawnAircraft({ side: 'red', type: redType, callsign: 'Bandit', controller: 'script', pos: bPos, heading: bHeading, speed: bSpeed });
    this.me.cmd.maxG = spec.perf.maxG;
    this.bandit.cmd.maxG = 7;
    if (lesson !== 'tracking' && lesson !== 'fight') this.bandit.damage = -1e9;   // the drills keep their bandit
    if (lesson === 'defence') this.me.damage = 0;
    this.stick = newStick(def.start === 'solo' ? 'mil' : 'ab');
    this.banditState = newBandit(banditMode, this.bandit, 1);
    if (banditMode === 'turn' || banditMode === 'reverse') this.bandit.roll = Math.acos(1 / TURN_G);
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
    w.step(h);
    if (this.phase === 'run') this.measure(h);
    else if (this.phase === 'end' && this.endAt !== null && w.t >= this.endAt) {
      this.endAt = null;
      this.hooks.finished?.(this.metrics);
    }
  }

  private applyBandit(h: number): void {
    const b = this.bandit;
    if (!b.alive) { b.cmd.trigger = false; return; }
    const r = banditStep(this.banditState, b, this.me.alive ? this.me : null, this.world.t, h);
    b.cmd.bfm = r.bfm;
    b.cmd.trigger = this.phase === 'run' && r.trigger;
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
    }
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
    const m = this.metrics;
    if (e.type === 'gun-hit') {
      if (e.shooterId === this.me.id) { m.hits += e.hits; m.damageDealt = Math.max(m.damageDealt, e.damage); }
      else if (e.targetId === this.me.id) { m.hitsTaken += e.hits; m.damageTaken = Math.max(m.damageTaken, e.damage); }
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
