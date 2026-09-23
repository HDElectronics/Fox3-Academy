/**
 * [OWNER: page-defense] SAM drills (#/defense?drill=sa10|sa11|sa15), without DOM: setup defaults, the brief,
 * one run built on scenarios.samDrill, coaching from the site's state and 'sam' events, and the debrief.
 * Game tutorial scope: what the RWR shows and which defences work in DCS (beam and chaff, terrain, leaving
 * the ring). Ring sizes and altitude bands come from src/data/sams.ts and are not verified in the Mission Editor.
 */
import type { AircraftId, SamId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { SAMS, SAM_ORDER, samRwrSymbol } from '../../data/sams';
import { World } from '../../sim/world';
import type { Aircraft, SamLostReason, SamMissile, SamSite, SimEvent } from '../../sim/types';
import { samDrill, cruiseFor, type SamDrill } from '../../sim/scenarios';
import { TRACK_FACTOR, samNotchDepth } from '../../sim/sam';
import { D2R, M_PER_FT } from '../../sim/math';
import { fmtAlt, fmtRange, type Units } from '../../app/format';
import {
  MANEUVER_LABEL, applyPilot, newPilot, pressManeuver, stepThrottle, trimAltitude, trimHeading, type Maneuver, type Pilot, type Throttle,
} from './pilot';
import type { Tone } from '../../ui/panels';

export type SamDrillId = SamId;
export const SAM_DRILLS: SamDrillId[] = [...SAM_ORDER];
export function isSamDrill(x: string | null | undefined): x is SamDrillId {
  return !!x && (SAM_DRILLS as string[]).includes(x);
}

export type SamAlt = 'high' | 'mid' | 'low';
export interface SamSetup {
  sam: SamId;
  alt: SamAlt;
  /** A ridge around the site (terrain mask) the player can hide under. */
  terrain: boolean;
}

/** Terrain mask height when the ridge is on (m above the site). Gameplay stand-in for DCS terrain. */
export const RIDGE_M = 900;
/** Start altitudes (m). */
export const SAM_ALT_M: Record<SamAlt, number> = { high: 9000, mid: 5000, low: 1500 };
export const SAM_ALTS: { value: SamAlt; label: string; title: string }[] = [
  { value: 'high', label: 'High', title: 'About 9 km: the site sees you from far away' },
  { value: 'mid', label: 'Medium', title: 'About 5 km' },
  { value: 'low', label: 'Low', title: 'About 1.5 km: close to the ridge, if there is one' },
];

/** Defaults: an altitude inside each site's band so the drill produces a shot. */
export function samSetupFor(sam: SamId): SamSetup {
  return { sam, alt: sam === 'sa10' ? 'high' : sam === 'sa11' ? 'mid' : 'low', terrain: sam === 'sa11' };
}

/** 'SA-11' from 'SA-11 Gadfly'. */
export function samShort(sam: SamId): string { return SAMS[sam].nato.split(' ')[0]; }

export interface SamBrief {
  title: string;
  ring: string;
  band: string;
  minRange: string;
  rwr: string;
  rule: string;
  defeat: string[];
  notVerified: string[];
}

/** The brief for a site, in the player's units and RWR symbols. */
export function samBrief(sam: SamId, ac: AircraftId, units: Units): SamBrief {
  const s = SAMS[sam];
  const sym = samRwrSymbol(AIRCRAFT[ac].rwr, sam);
  return {
    title: `${s.nato} (${s.name})`,
    ring: fmtRange(s.threatRingKm * 1000, units),
    band: `${fmtAlt(s.minAltM, units)} to ${fmtAlt(s.maxAltM, units)}`,
    minRange: fmtRange(s.minRangeKm * 1000, units, 1),
    rwr: sym ? `Your RWR shows it as "${sym}": search first, then lock, then launch.` : 'Your RWR shows its class: search first, then lock, then launch.',
    rule: s.guidanceRule,
    defeat: s.defeat,
    notVerified: s.uncertain,
  };
}

// ------------------------------------------------------------------------------------------ run

export type SamResult = 'defeated' | 'hit' | 'escaped' | 'no-shot';

export interface SamMetrics {
  sam: SamId;
  searchT: number | null;
  trackT: number | null;
  launchT: number | null;
  launches: number;
  /** Each SAM that missed, with the sim's reason. */
  misses: string[];
  /** Why the site's track dropped, each time. */
  lost: SamLostReason[];
  reactT: number | null;
  reactMan: Maneuver | null;
  chaffUsed: number;
  /** Chaff dropped while in (or near) the site's notch. */
  chaffInNotch: number;
  /** Seconds in the site's notch while it tracked you. */
  notchS: number;
  minAltM: number;
  endT: number | null;
  result: SamResult | null;
}

export function emptySamMetrics(sam: SamId, alt: number): SamMetrics {
  return {
    sam, searchT: null, trackT: null, launchT: null, launches: 0, misses: [], lost: [], reactT: null, reactMan: null,
    chaffUsed: 0, chaffInNotch: 0, notchS: 0, minAltM: alt, endT: null, result: null,
  };
}

/** Seconds after the end before the run closes. */
export const SAM_LINGER_S = 2.5;
/** No launch after this long: the run ends as 'no-shot'. */
export const SAM_NO_SHOT_S = 120;
/** Defeated: every SAM it fired is gone and none has flown for this long. */
export const SAM_CLEAR_S = 8;

export interface SamHooks {
  log?(text: string, t: number, tone?: Tone): void;
  finished?(m: SamMetrics): void;
}

export class SamRunner {
  readonly world: World;
  readonly drill: SamDrill;
  readonly me: Aircraft;
  readonly site: SamSite;
  readonly pilot: Pilot;
  readonly metrics: SamMetrics;
  phase: 'setup' | 'run' | 'end' = 'setup';
  endAt: number | null = null;
  readonly held = { left: false, right: false, up: false, down: false };
  private clearFor = 0;
  private outFor = 0;
  private pending: SamResult | null = null;
  /** Last log time per repeated message kind, so re-locks and drops do not flood the log. */
  private said = new Map<string, number>();
  private once(kind: string, gap: number): boolean {
    const t = this.world.t, last = this.said.get(kind);
    if (last !== undefined && t - last < gap) return false;
    this.said.set(kind, t);
    return true;
  }

  constructor(readonly ac: AircraftId, readonly setup: SamSetup, readonly units: Units, seed: number, private hooks: SamHooks = {}) {
    this.world = new World(seed);
    const alt = SAM_ALT_M[setup.alt];
    this.drill = samDrill(this.world, ac, setup.sam, { playerAlt: alt, playerMach: cruiseFor(ac).mach, maskAltM: setup.terrain ? RIDGE_M : 0, units });
    const p = this.world.get(this.drill.playerId);
    if (!p) throw new Error('SAM drill did not spawn');
    this.me = p;
    this.site = this.drill.site();
    this.pilot = newPilot(p);
    this.metrics = emptySamMetrics(setup.sam, alt);
    this.world.on(e => this.onEvent(e));
  }

  start(): void {
    if (this.phase !== 'setup') return;
    this.phase = 'run';
    this.log(`${samShort(this.setup.sam)} site ${fmtRange(this.me.pos.distanceTo(this.site.pos), this.units)} ahead, ring ${fmtRange(this.drill.ringM, this.units)}`);
  }

  canFly(): boolean { return this.phase === 'run' && this.me.alive; }

  /** SAMs this site has fired at you that are still flying. */
  inFlight(): SamMissile[] { return this.drill.missiles().filter(m => m.alive); }

  /** Site notch read for the gauge and coaching. */
  notch(): ReturnType<typeof samNotchDepth> { return samNotchDepth(this.site, this.me); }

  /** Ground range to the site (m). */
  range(): number { return Math.hypot(this.me.pos.x - this.site.pos.x, this.me.pos.z - this.site.pos.z); }

  maneuver(man: Maneuver): boolean {
    if (!this.canFly()) return false;
    pressManeuver(this.pilot, man, this.me, this.site.pos);
    const mt = this.metrics;
    if (mt.reactT === null && mt.launchT !== null && man !== 'hot' && man !== 'hold') { mt.reactT = this.world.t; mt.reactMan = man; }
    this.log(MANEUVER_LABEL[man]);
    return true;
  }

  nudgeHeading(deg: number): void { if (this.canFly()) trimHeading(this.pilot, deg * D2R); }
  nudgeAlt(dm: number): void { if (this.canFly()) trimAltitude(this.pilot, dm, AIRCRAFT[this.ac].perf.ceilingFt * M_PER_FT); }
  throttle(dir: 1 | -1): void { if (this.canFly()) stepThrottle(this.pilot, dir); }
  setThrottle(t: Throttle): void { if (this.canFly()) this.pilot.thr = t; }

  chaff(): boolean {
    if (!this.canFly()) return false;
    const n = this.notch();
    if (!this.world.chaff(this.me.id)) return false;
    this.metrics.chaffUsed++;
    if (n.depth > 0) this.metrics.chaffInNotch++;
    return true;
  }

  tick(realDt: number, simDt: number): void {
    if (this.phase !== 'run') return;
    const p = this.pilot;
    if (this.canFly()) {
      if (this.held.left !== this.held.right) trimHeading(p, (this.held.right ? 1 : -1) * 20 * D2R * realDt);
      if (this.held.up !== this.held.down) trimAltitude(p, (this.held.up ? 1 : -1) * 900 * realDt, AIRCRAFT[this.ac].perf.ceilingFt * M_PER_FT);
    }
    applyPilot(p, this.me, this.site.pos);
    if (simDt <= 0) return;
    this.world.step(simDt);
    this.accumulate(simDt);
    if (this.endAt !== null) { if (this.world.t >= this.endAt) this.finish(); return; }
    this.checkEnd(simDt);
  }

  private accumulate(dt: number): void {
    const mt = this.metrics, me = this.me;
    if (!me.alive) return;
    mt.minAltM = Math.min(mt.minAltM, me.pos.y);
    if (this.site.targetId === me.id && this.notch().inNotch) mt.notchS += dt;
  }

  private checkEnd(dt: number): void {
    const mt = this.metrics, w = this.world;
    if (!this.me.alive) return this.end('hit');
    const flying = this.inFlight().length > 0;
    if (mt.launchT !== null && !flying) this.clearFor += dt; else this.clearFor = 0;
    if (this.clearFor >= SAM_CLEAR_S) return this.end('defeated');
    const out = this.range() > this.drill.ringM * TRACK_FACTOR;
    if (!flying && out && (mt.trackT !== null || w.t > 30)) this.outFor += dt; else this.outFor = 0;
    if (this.outFor >= 5) return this.end(mt.launches ? 'defeated' : 'escaped');
    if (mt.launchT === null && w.t > SAM_NO_SHOT_S) return this.end('no-shot');
    if (w.t > 300) this.end(mt.launches ? 'defeated' : 'no-shot');
  }

  private end(r: SamResult): void {
    if (this.pending) return;
    this.pending = r;
    this.metrics.endT = this.world.t;
    this.endAt = this.world.t + (r === 'hit' ? SAM_LINGER_S : 0.5);
  }

  private finish(): void {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.metrics.result = this.pending ?? 'defeated';
    this.hooks.finished?.(this.metrics);
  }

  private log(text: string, tone?: Tone): void { this.hooks.log?.(text, this.world.t, tone); }

  private onEvent(e: SimEvent): void {
    const mt = this.metrics, me = this.me.id, name = samShort(this.setup.sam);
    switch (e.type) {
      case 'rwr':
        if (e.ownerId === me && e.emitterId === this.site.id && e.state === 'search' && mt.searchT === null) {
          mt.searchT = e.t; this.log(`RWR: ${name} search`);
        }
        break;
      case 'sam':
        if (e.siteId !== this.site.id || e.targetId !== me) break;
        if (e.what === 'track') { if (mt.trackT === null) mt.trackT = e.t; if (this.once('track', 10)) this.log(`RWR: ${name} lock at ${fmtRange(e.range ?? 0, this.units)}`, 'caution'); }
        if (e.what === 'launch') {
          if (mt.launchT === null) mt.launchT = e.t;
          mt.launches++;
          this.log(`RWR: ${name} launch at ${fmtRange(e.range ?? 0, this.units)}`, 'warning');
        }
        if (e.what === 'lost' && e.why) { mt.lost.push(e.why); if (this.once('lost:' + e.why, 10)) this.log(`Track broken: ${LOST_TEXT[e.why]}`, 'ok'); }
        break;
      case 'miss':
        if (this.world.samMissiles.get(e.missileId)?.siteId === this.site.id) { mt.misses.push(e.reason); this.log(`${name} missile missed (${e.reason})`, 'ok'); }
        break;
      case 'hit':
        if (this.world.samMissiles.get(e.missileId)?.siteId === this.site.id) this.log(`${name} hit`, 'warning');
        break;
    }
  }

  /** Scripted defence for screenshots and tests: beam the site at the launch, descend, chaff in the notch. */
  autoDefend(state: { lastChaff: number }): void {
    if (!this.canFly() || this.metrics.launchT === null) return;
    if (this.pilot.man !== 'notch-l') this.maneuver('notch-l');
    if (this.world.t - state.lastChaff > 1 && this.inFlight().length && this.notch().depth > 0 && this.chaff()) state.lastChaff = this.world.t;
  }
}

export const LOST_TEXT: Record<SamLostReason, string> = {
  notched: 'you sat in the notch', chaff: 'chaff in the notch', terrain: 'terrain masked you', horizon: 'below the radar horizon',
  range: 'out of range', 'target-dead': 'target lost', 'radar-off': 'radar off',
};

// ------------------------------------------------------------------------------------------ coaching

export interface SamCoachInput {
  sam: SamId;
  phase: 'setup' | 'run' | 'end';
  rwr: 'none' | 'search' | 'lock' | 'launch';
  inNotch: boolean;
  man: Maneuver;
  inRing: boolean;
  /** Below the ridge top (only when the drill has a ridge). */
  masked: boolean;
  terrain: boolean;
  lastLost: SamLostReason | null;
}

/** [text, why, tone] for the coach box. */
export function samCoach(c: SamCoachInput): [string, string, Tone | null] {
  const name = samShort(c.sam);
  if (c.phase === 'setup') return [`Press Start. The ${name} site is ahead of you.`, `Read the brief: the ring, the altitude band and what defeats it.`, null];
  if (c.phase === 'end') return ['Drill over. Open the debrief.', 'Retry with another altitude or the ridge on to compare.', null];
  const beaming = c.man === 'notch-l' || c.man === 'notch-r';
  switch (c.rwr) {
    case 'launch':
      if (!beaming) return ['Launch. Beam the site now: press 1 or 2.', c.sam === 'sa10'
        ? 'The SA-10 is the hardest to notch. Beam, descend hard and use terrain, or turn out of the ring.'
        : 'The missile needs the site\'s radar on you until impact. Put the site at 3 or 9 o\'clock.', 'warning'];
      if (!c.inNotch) return ['Keep beaming: your speed toward the site is still too high.', 'Hold the site on the 3/9 line. Fine-steer with A / D.', 'warning'];
      return ['In the notch. Chaff now: press C, one bundle a second.', c.terrain && !c.masked ? 'Keep descending too: below the ridge the site loses you.' : 'Chaff works only while you beam. Hold the notch until the track breaks.', 'caution'];
    case 'lock':
      return [`${name} lock. A launch can follow within seconds.`, c.inRing
        ? 'Beam it now (1 or 2) and descend, or turn cold (3) if you are near the edge of the ring.'
        : 'You are outside the ring: turn away and it cannot reach you.', 'caution'];
    case 'search':
      return [`${name} search on the RWR.`, c.inRing ? 'You are inside the ring. The lock comes next.' : 'Search alone is not a threat. Stay outside the ring, or go low.', null];
    default:
      if (c.lastLost) return [`Track broken: ${LOST_TEXT[c.lastLost]}.`, 'Keep the beam or leave the ring before it locks you again.', 'ok'];
      if (c.masked) return ['Below the ridge: the site cannot see you.', 'Terrain beats every SAM in the game. Stay low while you are inside the ring.', 'ok'];
      return ['Nothing on the RWR from the site.', 'Fly toward it and watch for search, then lock.', null];
  }
}

// ------------------------------------------------------------------------------------------ debrief

export interface SamDebrief {
  headline: string;
  survived: boolean;
  passed: boolean;
  score: number;
  why: string;
  coaching: string[];
}

export function samDebrief(m: SamMetrics): SamDebrief {
  const name = samShort(m.sam);
  const survived = m.result !== 'hit';
  const react = m.reactT !== null && m.launchT !== null ? m.reactT - m.launchT : null;
  const broke = m.lost.filter(l => l === 'notched' || l === 'chaff' || l === 'terrain' || l === 'horizon');
  let score = 0;
  if (survived) score += 50;
  if (react !== null) score += react <= 3 ? 20 : react <= 8 ? 10 : 5;
  if (broke.length) score += 20;
  else if (m.notchS > 3) score += 10;
  if (m.chaffInNotch > 0) score += 10;
  if (m.result === 'escaped' || m.result === 'no-shot') score = survived ? 60 : 0;
  score = Math.min(100, score);
  const coaching: string[] = [];
  if (m.launchT !== null && react === null) coaching.push('You never defended after the launch. At the launch call, beam the site first.');
  if (react !== null && react > 3) coaching.push(`You reacted ${react.toFixed(1)} s after the launch. Beam at the lock, or at the latest at the launch.`);
  if (m.launches && !broke.length) coaching.push(m.sam === 'sa10'
    ? 'The track never broke. The SA-10 is hard to notch: go lower, use the ridge, or leave the ring before the lock.'
    : 'The track never broke. Hold the site at 3 or 9 o\'clock and drop chaff while beaming.');
  if (m.chaffUsed && !m.chaffInNotch) coaching.push('Your chaff went out while you were not beaming. Chaff alone does little in the game.');
  if (broke.includes('terrain') || broke.includes('horizon')) coaching.push('Terrain did the work: low and behind a ridge the site cannot track you.');
  if (m.result === 'no-shot') coaching.push('The site never fired. Outside its band or behind terrain it cannot, which is the safest defence of all.');
  if (!coaching.length) coaching.push('Clean. Beam early, chaff in the notch, and leave the ring once the track breaks.');
  const headline = m.result === 'hit' ? `${name} hit` : m.result === 'no-shot' ? 'No shot' : m.result === 'escaped' ? 'Outside the ring' : `${name} defeated`;
  const why = m.result === 'hit' ? 'The site held its track on you until impact.'
    : m.result === 'no-shot' ? 'The site did not get a valid shot.'
      : m.result === 'escaped' ? 'You left its ring before it could shoot.'
        : broke.length ? `The track broke: ${LOST_TEXT[broke[0]]}. Its missiles went ballistic.`
          : m.misses.length ? `Its missiles missed (${m.misses[0]}).` : 'You survived its shots.';
  return { headline, survived, passed: survived && m.result !== 'no-shot', score: survived ? score : Math.min(score, 30), why, coaching };
}
