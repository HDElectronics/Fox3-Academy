/**
 * [OWNER: page-defense] One drill run, without DOM: builds the World from scenarios.defenseDrill, flies the
 * player through the autopilot, unlocks controls at the drill's cue, fills RunMetrics from sim events and
 * gate reads, and ends the run. The page drives it from its frame loop; tests drive it headless.
 */
import type { AircraftId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { World } from '../../sim/world';
import type { Aircraft, Missile, SimEvent } from '../../sim/types';
import { defenseDrill, type DefenseDrill } from '../../sim/scenarios';
import { aiStatus } from '../../sim/ai';
import { D2R, M_PER_FT } from '../../sim/math';
import { fmtRange, type Units } from '../../app/format';
import { ASPECTS, DRILLS, altitudes, type Setup } from './drills';
import {
  MANEUVER_LABEL, applyPilot, newPilot, pressManeuver, stepThrottle, trimAltitude, trimHeading, type Maneuver, type Pilot, type Throttle,
} from './pilot';
import { aspectDeg, chaffOdds, radarGate, seekerGate, threatRef, type RefMode } from './gates';
import { debrief, emptyMetrics, type Debrief, type RunMetrics } from './debrief';
import type { Tone } from '../../ui/panels';

/** Seconds of sim after the missile's end before the run closes (let the explosion or the miss play). */
export const LINGER_S = 2.5;
/** Give up waiting for a launch after this long (sim s). */
export const NO_SHOT_S = 45;

export type Phase = 'setup' | 'run' | 'end';

export interface RunnerHooks {
  /** A line for the event log. */
  log?(text: string, t: number, tone?: Tone): void;
  /** The run ended (missile resolved, or no shot). */
  finished?(d: Debrief): void;
}

export class DrillRunner {
  readonly world: World;
  readonly drill: DefenseDrill;
  readonly me: Aircraft;
  readonly shooter: Aircraft;
  readonly pilot: Pilot;
  readonly metrics: RunMetrics;
  phase: Phase = 'setup';
  unlocked = false;
  /** Sim time at which controls unlock (late drill). */
  unlockAt: number | null = null;
  endAt: number | null = null;
  refMode: RefMode = 'auto';
  /** Seeker notch timer, mirrored from missile.ts (+dt in the gate, -2dt out). */
  seekerHold = 0;
  /** Continuous seconds in his radar's gate. */
  radarHold = 0;
  /** In a gate that matters right now (for the NOTCH flag and lamp). */
  notchFlag = false;
  /** Held trim keys. */
  readonly held = { left: false, right: false, up: false, down: false };
  result: Debrief | null = null;
  private reachedGate = false;

  constructor(readonly ac: AircraftId, readonly setup: Setup, readonly units: Units, seed: number, private hooks: RunnerHooks = {}) {
    this.world = new World(seed);
    const a = altitudes(setup, ac);
    const asp = ASPECTS.find(x => x.value === setup.aspect) ?? ASPECTS[0];
    this.drill = defenseDrill(this.world, ac, setup.threat, {
      range: setup.range, aspectDeg: asp.deg, side: asp.side, mode: setup.method,
      shooterAlt: a.shooterAlt, shooterMach: a.shooterMach, playerAlt: a.playerAlt, playerMach: a.playerMach,
    }, { shooterType: setup.shooter, skill: setup.skill, units });
    const p = this.world.get(this.drill.playerId), s = this.world.get(this.drill.shooterId);
    if (!p || !s) throw new Error('defense drill did not spawn');
    this.me = p;
    this.shooter = s;
    this.pilot = newPilot(p);
    const sp = AIRCRAFT[setup.shooter];
    this.metrics = emptyMetrics(setup.drill, setup.threat, this.drill.method, sp.short, sp.radar.name);
    this.world.on(e => this.onEvent(e));
    if (DRILLS[setup.drill].cue === 'start') this.unlock();
  }

  missile(): Missile | null { return this.drill.missile(); }

  start(): void {
    if (this.phase !== 'setup') return;
    this.phase = 'run';
    const s = this.setup;
    this.log(`${DRILLS[s.drill].title}: ${MISSILES[s.threat].name} from the ${AIRCRAFT[s.shooter].short}, ${fmtRange(s.range, this.units)}`);
  }

  canFly(): boolean {
    return this.phase === 'run' && this.unlocked && this.me.alive;
  }

  private log(text: string, tone?: Tone): void { this.hooks.log?.(text, this.world.t, tone); }

  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.unlockAt = null;
    this.metrics.unlockT = this.world.t;
    const m = this.missile();
    if (m && m.alive) {
      this.metrics.rangeAtUnlock = m.pos.distanceTo(this.me.pos);
      this.metrics.ttiAtUnlock = m.timeToImpact;
    }
    if (this.phase === 'run') this.log(DRILLS[this.setup.drill].cue === 'start' ? 'Controls live' : 'Controls live: defend now', 'hi');
  }

  /** The threat the maneuvers fly against. */
  ref() { return threatRef(this.refMode, this.shooter, this.missile()); }

  /** A maneuver that defends (turning hot or holding a heading does not). */
  private static defends(man: Maneuver): boolean { return man !== 'hot' && man !== 'hold'; }

  /** `manual`: turning off the heading by hand (A / D) also counts as defending. */
  private markReaction(man: Maneuver, manual = false): void {
    const mt = this.metrics;
    if (mt.reactT === null && (manual || DrillRunner.defends(man)) && (mt.launchT !== null || DRILLS[this.setup.drill].cue !== 'start')) {
      mt.reactT = this.world.t;
      mt.reactMan = man;
    }
    if ((man === 'notch-l' || man === 'notch-r') && mt.notchT === null) mt.notchT = this.world.t;
    if (man === 'drag' && mt.dragT === null) mt.dragT = this.world.t;
  }

  maneuver(man: Maneuver): boolean {
    if (!this.canFly()) return false;
    const r = this.ref();
    pressManeuver(this.pilot, man, this.me, r ? r.pos : null);
    this.markReaction(man);
    this.log(MANEUVER_LABEL[man]);
    return true;
  }

  nudgeHeading(deg: number): void {
    if (!this.canFly()) return;
    trimHeading(this.pilot, deg * D2R);
    // Turning off the nose by hand counts as defending; trimming a 'Hot' heading does not.
    if (this.metrics.launchT !== null && this.pilot.man !== 'hot') this.markReaction(this.pilot.man, true);
  }

  nudgeAlt(dm: number): void {
    if (!this.canFly()) return;
    trimAltitude(this.pilot, dm, AIRCRAFT[this.ac].perf.ceilingFt * M_PER_FT);
  }

  throttle(dir: 1 | -1): void { if (this.canFly()) stepThrottle(this.pilot, dir); }
  setThrottle(t: Throttle): void { if (this.canFly()) this.pilot.thr = t; }

  chaff(): boolean {
    if (!this.canFly()) return false;
    const odds = chaffOdds(this.world, this.missile(), this.me);
    if (!this.world.chaff(this.me.id)) return false;
    this.metrics.chaffUsed++;
    if (odds > 0) this.metrics.chaffGood++;
    return true;
  }

  flare(): boolean {
    if (!this.canFly()) return false;
    if (!this.world.flare(this.me.id)) return false;
    this.metrics.flaresUsed++;
    return true;
  }

  /** One slice: controls, sim step, metrics, end checks. `realDt` drives held-key trims. */
  tick(realDt: number, simDt: number): void {
    if (this.phase !== 'run') return;
    const w = this.world;
    if (this.unlockAt !== null && w.t >= this.unlockAt) this.unlock();
    const r = this.ref();
    const p = this.pilot;
    if (this.canFly()) {
      if (this.held.left !== this.held.right) trimHeading(p, (this.held.right ? 1 : -1) * 20 * D2R * realDt);
      if (this.held.up !== this.held.down) trimAltitude(p, (this.held.up ? 1 : -1) * 900 * realDt, AIRCRAFT[this.ac].perf.ceilingFt * M_PER_FT);
    } else if (!this.unlocked) {
      p.man = 'hold';
    }
    applyPilot(p, this.me, r ? r.pos : null);
    if (simDt <= 0) return;
    w.step(simDt);
    this.accumulate(simDt);
    if (this.endAt !== null && w.t >= this.endAt) { this.finish(); return; }
    if (this.metrics.launchT === null && w.t > NO_SHOT_S) {
      const why = aiStatus(this.shooter)?.lastLaunchBlock;
      this.metrics.noShot = why || 'he could not get a valid shot';
      this.finish();
    }
  }

  private accumulate(dt: number): void {
    const m = this.missile();
    const mt = this.metrics;
    const rg = radarGate(this.world, this.shooter, this.me);
    const sg = seekerGate(this.world, m, this.me);
    const inFlight = !!m && m.alive;
    if (inFlight && rg.on && rg.inGate) { mt.radarGateS += dt; this.radarHold += dt; } else this.radarHold = 0;
    if (inFlight && sg.on && sg.inGate) { mt.seekerGateS += dt; this.seekerHold += dt; } else this.seekerHold = Math.max(0, this.seekerHold - 2 * dt);
    if (inFlight && m && m.guidance === 'active' && !sg.lookDown) mt.lookUpS += dt;
    this.notchFlag = (sg.on && sg.inGate) || (rg.on && rg.inGate && inFlight);
    if (inFlight && m && mt.reactT !== null && m.guidance !== 'ballistic') {
      mt.defendS += dt;
      if (this.notchFlag) this.reachedGate = true;
      if (this.reachedGate) mt.settledS += dt;
      const ref = threatRef('auto', this.shooter, m);
      if (ref && aspectDeg(this.me, ref.pos) >= 135) mt.coldS += dt;
    }
    if (m && Number.isFinite(m.closestApproach)) mt.closest = m.closestApproach;
  }

  finish(): void {
    if (this.phase !== 'run') return;
    this.phase = 'end';
    this.result = debrief(this.metrics, this.units);
    this.hooks.finished?.(this.result);
  }

  private isOurs(id: string): boolean {
    const m = this.missile();
    return !!m && m.id === id;
  }

  private onEvent(e: SimEvent): void {
    const t = e.t;
    const mt = this.metrics;
    const me = this.me, sh = this.shooter;
    const d = DRILLS[this.setup.drill];
    const name = MISSILES[this.setup.threat].name;
    const log = (text: string, tone?: Tone) => this.hooks.log?.(text, t, tone);
    switch (e.type) {
      case 'launch':
        if (e.shooterId !== sh.id) break;
        mt.launchT = t;
        mt.launchRange = e.range;
        // Free practice: already beaming or cranking when it leaves the rail counts as reacting at the launch.
        if (mt.reactT === null && this.unlocked && DrillRunner.defends(this.pilot.man)) {
          mt.reactT = t;
          mt.reactMan = this.pilot.man;
        }
        if (d.cue === 'launch') {
          if (this.setup.drill === 'drag' && this.drill.method === 'tws') log('Launch call: he has fired. A TWS shot is silent; the drill calls it for you.', 'caution');
          this.unlock();
        }
        break;
      case 'pitbull': {
        if (!this.isOurs(e.missileId)) break;
        mt.pitbullT = t;
        const m = this.missile();
        const r = m ? m.pos.distanceTo(me.pos) : null;
        log(`Pitbull: the ${name} seeker is active${r !== null ? `, ${fmtRange(r, this.units, 1)} from you` : ''}`, 'warning');
        if (d.cue === 'pitbull' && !this.unlocked) {
          if (d.delayS > 0) { this.unlockAt = t + d.delayS; log(`You are heads-down for ${d.delayS} s`, 'caution'); }
          else this.unlock();
        }
        break;
      }
      case 'lock':
        if (e.ownerId !== sh.id || e.targetId !== me.id) break;
        if (e.what === 'locked') log(`${sh.callsign} locks you (STT)`, 'caution');
        else if (e.what === 'broken') { mt.lockBrokenT = t; log(`His lock broke${e.why ? ': ' + e.why : ''}`, 'ok'); }
        else log(`${sh.callsign} drops the lock`);
        break;
      case 'datalink-lost':
        if (!this.isOurs(e.missileId)) break;
        mt.datalinkLostT = t;
        log(`Datalink lost (${e.why}): the missile flies on to a stale aim point`, 'ok');
        break;
      case 'seeker-lost':
        if (!this.isOurs(e.missileId)) break;
        mt.seekerLost.push({ t, why: e.why });
        if (e.why === 'lost-guidance') { mt.illumLostT = t; log('No illumination: the missile goes ballistic', 'ok'); }
        else if (e.why === 'notched') log('Seeker lost you in the notch', 'ok');
        else if (e.why === 'chaff') log('Seeker took the chaff', 'ok');
        else log(`Seeker lost you: ${e.why}`, 'ok');
        break;
      case 'miss':
        if (!this.isOurs(e.missileId)) break;
        mt.result = 'miss'; mt.reason = e.reason; mt.endT = t;
        this.endAt = t + LINGER_S;
        log(`Missed: ${e.reason}`, 'ok');
        break;
      case 'hit':
        if (!this.isOurs(e.missileId)) break;
        mt.result = 'hit'; mt.reason = 'hit'; mt.endT = t;
        this.endAt = t + LINGER_S;
        log('Hit', 'warning');
        break;
      case 'rwr':
        if (e.ownerId !== me.id) break;
        if (e.state === 'search') log(`RWR: ${sh.callsign} radar (search)`);
        else if (e.state === 'launch') log('RWR: launch warning', 'warning');
        else if (e.state === 'missile') log('RWR: missile active on you', 'warning');
        break;
      case 'ai':
        if (e.ownerId === sh.id && e.state === 'support') log(e.text, 'caution');
        break;
      default: break;
    }
  }

  /**
   * A scripted "good" defense, for screenshots and tests: the drill's technique as soon as the controls
   * unlock, and chaff about once a second whenever it can work.
   */
  autoDefend(state: { lastChaff: number }): void {
    if (!this.canFly()) return;
    const want: Maneuver = this.setup.drill === 'drag' ? 'drag' : 'notch-l';
    if (this.pilot.man !== want) this.maneuver(want);
    if (this.world.t - state.lastChaff > 1 && chaffOdds(this.world, this.missile(), this.me) > 0) {
      if (this.chaff()) state.lastChaff = this.world.t;
    }
  }
}
