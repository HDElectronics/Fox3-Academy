/**
 * [OWNER: sim-ai] AI pilots. State machine on ac.ai (patrol → commit → attack → support →
 * defend → pump → recommit / merge / rtb). Uses only what its own sensors know (radar tracks and
 * bricks, RWR, eyes, plus an optional GCI picture), flies through ac.cmd, fires through
 * world.launch(), defends with notch/beam + chaff or drags cold, cranks after launch, pumps after
 * pitbull. Skill scales reaction time, launch range, crank angle, notch accuracy and chaff use.
 * Emits 'ai' events with a short human-readable reason for the after-action review.
 *
 * Also runs "scripted" aircraft (drill targets): an AI with `cfg.script` set flies a simple
 * manoeuvre (straight, hot, cold, beam, crank, weave) instead of fighting.
 *
 * Deterministic: world.rand() only.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { Aircraft, AiMemory, AiSkill, Dlz, EntityId, Missile, MissReason, SimEvent } from './types';
import { fighterSpec, isFighterAc } from './jet';
import type { AircraftSpec, MissileId, RadarModeId } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import { dlzFor } from './dlz';
import { pickSnp2Second, snp2Eligibility } from './radar';
import { speedFromMach } from './atmosphere';
import { D2R, M_PER_NM, aspectAngle, bearingTo, clamp, closureRate, dirFrom, elevationTo, relBearing, wrap2Pi, wrapPi } from './math';

// ───────────────────────────────────────────────────────────── public types

export type AiState = AiMemory['state'];

/** Scripted flight for drill targets. `ref` is the aircraft the manoeuvre is flown against. */
export type ScriptManeuver = 'straight' | 'hot' | 'cold' | 'beam' | 'crank' | 'weave';

export interface AiScript {
  maneuver: ScriptManeuver;
  /** Reference aircraft (hot/cold/beam/crank). Default: the nearest enemy (truth; it is a script). */
  refId?: EntityId | null;
  /** Which side the reference ends up on for beam/crank. Default: whichever needs the smaller turn. */
  side?: 'left' | 'right';
  /** straight/weave: base heading (rad). Default: heading when the script was set. */
  heading?: number;
  /** m. Default: current commanded altitude. */
  altitude?: number;
  /** m/s. Default: current commanded speed. */
  speed?: number;
  /** weave: amplitude (deg, default 30) and period (s, default 40). */
  weaveDeg?: number;
  weavePeriod?: number;
}

export interface AiConfig {
  /** Fly the fight but never launch. */
  holdFire: boolean;
  /** React to missiles (defend). false = "no reaction" target. */
  evade: boolean;
  /** Simplified AWACS/GCI picture: knows enemy positions (refreshed every 10 s) for steering and
   *  antenna pointing. Launches still need its own radar/seeker. */
  gci: boolean;
  /** Ignore contacts farther than this (m). */
  commitRange: number;
  /** Max own missiles in the air per target. null = skill default. */
  maxInFlightPerTarget: number | null;
  /** Launch at this fraction of Rmax. null = skill default (rookie 0.95 … ace near Rne). */
  launchFraction: number | null;
  /** Drill shooter: launch as soon as the range is ≤ this (m) and the launch rules allow. */
  fireAtRange: number | null;
  /** Drill shooter: sim time (s) after which it launches at any range the launch rules allow
   *  (e.g. the target runs cold and the range never closes to fireAtRange). */
  fireNoLaterThan: number | null;
  /** Total missiles this AI may fire. null = everything it carries. */
  shots: number | null;
  /** Engage only this aircraft. */
  targetId: EntityId | null;
  /** Radar-missile launch method. 'auto' = the jet's real method (SARH/FC3 → STT, multi-target jets → TWS). */
  launchMode: 'auto' | 'stt' | 'tws';
  /** Wingman: fly formation on this aircraft while patrolling. */
  leaderId: EntityId | null;
  /** Formation side for a wingman: +1 right, -1 left. */
  formationSide: 1 | -1;
  /** Come back hot after a pump. */
  recommit: boolean;
  /** Units used in the 'ai' event text. */
  units: 'metric' | 'imperial';
  /** Scripted flight (drill target). null = full tactical AI. */
  script: AiScript | null;
  /** Radar mode while scripted ('off' for silent targets). */
  scriptRadar: RadarModeId;
}

export const DEFAULT_AI_CONFIG: Readonly<AiConfig> = Object.freeze({
  holdFire: false,
  evade: true,
  gci: false,
  commitRange: 160_000,
  maxInFlightPerTarget: null,
  launchFraction: null,
  fireAtRange: null,
  fireNoLaterThan: null,
  shots: null,
  targetId: null,
  launchMode: 'auto',
  leaderId: null,
  formationSide: 1,
  recommit: true,
  units: 'metric',
  script: null,
  scriptRadar: 'rws',
});

/** Public, read-only skill numbers (for briefings and coaching text). */
export interface AiSkillProfile {
  /** Seconds between decisions. */
  think: number;
  /** Reaction delay to a new missile warning, s [min, max]. */
  reactS: [number, number];
  /** Max heading error when putting a threat on the beam, deg. */
  notchErrDeg: number;
  /** Launch at this fraction of Rmax (ace: null = Rne + 20 % of the Rne..Rmax gap). */
  launchFrac: number | null;
  /** STT shooters lock at launch range × this (early locks warn the target). */
  lockLead: number;
  /** Crank angle after launch, deg off the target (limited by the radar gimbal). */
  crankDeg: number;
  /** Chaff bundles per burst and seconds between bursts while in the notch, and the most it spends on one missile. */
  chaffBurst: number;
  chaffEvery: number;
  chaffPerThreat: number;
  /** Sees enemy jets within this range (km) and missiles within missileSpotKm. */
  visualKm: number;
  missileSpotKm: number;
  /** G limit it is willing to pull (capped by the jet). */
  maxG: number;
  inFlightPerTarget: number;
  /** Seconds it extends cold in a pump. */
  pumpS: number;
  /** Seconds it remembers a contact it no longer sees. */
  memoryS: number;
  /** Climbs and accelerates before a shot. */
  energy: boolean;
  /** Drags cold instead of notching when an unseen-active ARH is farther than this (km). */
  dragKm: number;
  /** How far it dives when notching, m. */
  notchDescend: number;
  /** Seconds it waits before shooting the same target again after a missile at it failed. */
  reshootS: number;
}

export const AI_SKILLS: Readonly<Record<AiSkill, Readonly<AiSkillProfile>>> = Object.freeze({
  rookie: { think: 0.2, reactS: [2.5, 4.5], notchErrDeg: 16, launchFrac: 0.95, lockLead: 1.35, crankDeg: 30, chaffBurst: 1, chaffEvery: 3, chaffPerThreat: 5, visualKm: 6, missileSpotKm: 5, maxG: 5, inFlightPerTarget: 1, pumpS: 30, memoryS: 20, energy: false, dragKm: 40, notchDescend: 1500, reshootS: 12 },
  regular: { think: 0.15, reactS: [1.5, 2.8], notchErrDeg: 8, launchFrac: 0.85, lockLead: 1.15, crankDeg: 42, chaffBurst: 2, chaffEvery: 2.2, chaffPerThreat: 8, visualKm: 8, missileSpotKm: 8, maxG: 6, inFlightPerTarget: 1, pumpS: 24, memoryS: 30, energy: true, dragKm: 32, notchDescend: 2500, reshootS: 10 },
  veteran: { think: 0.1, reactS: [0.8, 1.6], notchErrDeg: 4, launchFrac: 0.7, lockLead: 1.06, crankDeg: 50, chaffBurst: 3, chaffEvery: 1.6, chaffPerThreat: 10, visualKm: 10, missileSpotKm: 12, maxG: 7, inFlightPerTarget: 2, pumpS: 18, memoryS: 45, energy: true, dragKm: 28, notchDescend: 4000, reshootS: 8 },
  ace: { think: 0.1, reactS: [0.4, 0.9], notchErrDeg: 2, launchFrac: null, lockLead: 1.02, crankDeg: 55, chaffBurst: 3, chaffEvery: 1.2, chaffPerThreat: 12, visualKm: 12, missileSpotKm: 15, maxG: 8, inFlightPerTarget: 2, pumpS: 12, memoryS: 60, energy: true, dragKm: 25, notchDescend: 5000, reshootS: 6 },
});

/** Read-only view of what an AI is doing (for pages and coaching). */
export interface AiStatus {
  state: AiState;
  skill: AiSkill;
  since: number;
  targetId: EntityId | null;
  threatMissileId: EntityId | null;
  defendMode: 'notch' | 'drag' | 'break' | null;
  script: ScriptManeuver | null;
  shotsFired: number;
  lastText: string;
  /** Why the last launch attempt was refused (canLaunch reason), '' if none. */
  lastLaunchBlock: string;
}

// ───────────────────────────────────────────────────────────── internal memory

type KnownSrc = 'stt' | 'track' | 'brick' | 'visual' | 'gci' | 'rwr';
interface Known {
  id: EntityId;
  pos: Vector3;      // at time t
  vel: Vector3;
  t: number;
  src: KnownSrc;
  bearingOnly: boolean;
}

type ThreatKind = 'sarh' | 'arh' | 'ir';
interface Threat {
  key: string;
  missile: Missile | null;
  emitter: Aircraft | null;
  kind: ThreatKind;
  pos: Vector3;
  range: number;
  closure: number;
  tgo: number;
}

interface DefendEpisode {
  key: string;
  missileId: EntityId | null;
  shooterId: EntityId | null;
  kind: ThreatKind;
  mode: 'notch' | 'drag' | 'break';
  side: 1 | -1;
  err: number;        // rad, heading error kept for the episode
  alt: number;        // target altitude
  startedAt: number;
  lastSeen: number;
  burstLeft: number;
  nextBurst: number;
  chaffUsed: number;
  flaresUsed: number;
}

interface Mem {
  acc: number;
  period: number;
  init: boolean;
  patrol: { heading: number; altitude: number; speed: number };
  known: Map<EntityId, Known>;
  targetId: EntityId | null;
  lostSince: number | null;
  threatSeen: Map<string, number>;   // key → time the AI may react
  defend: DefendEpisode | null;
  crankSide: 1 | -1 | 0;
  lastLaunch: number;
  shotsFired: number;
  jitter: number;
  pumpUntil: number;
  pumpFrom: EntityId | null;
  /** Altitude to extend at: about 1 km below where the pump started (not below 5 km unless already lower). */
  pumpAlt: number;
  gciAt: number;
  scanAt: number;
  scanSent: { az: number; el: number; scale: number } | null;
  elPhase: number;
  elPhaseAt: number;
  lockTryAt: number;
  designateAt: number;
  modeAt: number;
  scriptHeading: number;
  scriptSide: 1 | -1;
  scriptT0: number;
  lastText: string;
  lastLaunchBlock: string;
  /** Own shots: when each stopped being a threat (dead or unguided), for the reshoot delay. */
  fired: { id: EntityId; targetId: EntityId | null; ended: number | null }[];
}

interface Brain { cfg: AiConfig; mem: Mem }

const MERGE_RANGE = 10_000;
const MERGE_EXIT = 16_000;
const IR_MAX_RANGE = 12_000;
const LAUNCH_SPACING_SAME = 3.5;
const LAUNCH_SPACING_ANY = 2;
const GCI_EVERY = 10;
const GCI_RANGE = 220_000;

// ───────────────────────────────────────────────────────────── public API

/** Merge options into an AI's config (creates the brain on first use). */
export function configureAi(world: World, id: EntityId, patch: Partial<AiConfig>): void {
  const ac = world.get(id);
  if (!ac || !ac.ai) return;
  const b = brainOf(world, ac, ac.ai);
  const hadScript = b.cfg.script;
  Object.assign(b.cfg, patch);
  if ('script' in patch && patch.script !== hadScript) initScript(ac, b);
}

/** Current config of an AI (a copy). */
export function aiConfig(ac: Aircraft): AiConfig | null {
  const b = ac.ai?.data.brain as Brain | undefined;
  return ac.ai ? { ...(b?.cfg ?? DEFAULT_AI_CONFIG) } : null;
}

/**
 * Give an AI a scripted manoeuvre (drill targets), or null to hand it back to the tactical AI.
 * Emits an 'ai' event describing the change unless `announce` is false.
 */
export function setScript(world: World, id: EntityId, script: AiScript | null, announce = true): void {
  const ac = world.get(id);
  if (!ac || !ac.ai) return;
  const b = brainOf(world, ac, ac.ai);
  b.cfg.script = script;
  initScript(ac, b);
  if (announce) {
    const ref = script ? scriptRef(world, ac, script) : null;
    say(world, ac, ac.ai.state, script ? scriptText(ac, script, ref) : `${ac.callsign} is released to fight`);
  }
}

/** What the AI is doing, for UI. null for non-AI aircraft. */
export function aiStatus(ac: Aircraft): AiStatus | null {
  if (!ac.ai) return null;
  const b = ac.ai.data.brain as Brain | undefined;
  return {
    state: ac.ai.state,
    skill: ac.ai.skill,
    since: ac.ai.stateSince,
    targetId: b?.mem.targetId ?? null,
    threatMissileId: b?.mem.defend?.missileId ?? null,
    defendMode: ac.ai.state === 'defend' ? (b?.mem.defend?.mode ?? null) : null,
    script: b?.cfg.script?.maneuver ?? null,
    shotsFired: b?.mem.shotsFired ?? 0,
    lastText: b?.mem.lastText ?? '',
    lastLaunchBlock: b?.mem.lastLaunchBlock ?? '',
  };
}

/** Called by World every tick for controller 'ai'. Decides at 5–10 Hz depending on skill. */
export function thinkAi(world: World, ac: Aircraft, dt: number): void {
  if (!ac.ai || !ac.alive || !isFighterAc(ac)) return; // attack jets have no AI yet
  const b = brainOf(world, ac, ac.ai);
  b.mem.acc += dt;
  if (b.mem.acc < b.mem.period) return;
  const step = b.mem.acc;
  b.mem.acc = 0;
  decide(world, ac, b, step);
}

// ───────────────────────────────────────────────────────────── brain setup

function brainOf(world: World, ac: Aircraft, ai: AiMemory): Brain {
  let b = ai.data.brain as Brain | undefined;
  if (b) return b;
  const sk = AI_SKILLS[ai.skill];
  b = {
    cfg: { ...DEFAULT_AI_CONFIG },
    mem: {
      acc: world.rand() * sk.think, period: sk.think, init: false,
      patrol: { heading: ac.cmd.heading, altitude: ac.cmd.altitude, speed: ac.cmd.speed },
      known: new Map(), targetId: null, lostSince: null, threatSeen: new Map(), defend: null,
      crankSide: 0, lastLaunch: -Infinity, shotsFired: 0, jitter: 1, pumpUntil: 0, pumpFrom: null, pumpAlt: ac.pos.y,
      gciAt: -Infinity, scanAt: -Infinity, scanSent: null, elPhase: 0, elPhaseAt: 0,
      lockTryAt: -Infinity, designateAt: -Infinity, modeAt: -Infinity,
      scriptHeading: ac.heading, scriptSide: 1, scriptT0: world.t,
      lastText: '', lastLaunchBlock: '', fired: [],
    },
  };
  ai.data.brain = b;
  return b;
}

function initScript(ac: Aircraft, b: Brain): void {
  const s = b.cfg.script;
  b.mem.scriptHeading = s?.heading ?? ac.heading;
  b.mem.scriptSide = s?.side === 'left' ? -1 : 1;
  b.mem.scriptT0 = -1; // set on first scripted think
  b.mem.defend = null;
  if (s && ac.ai && ac.ai.state !== 'patrol' && ac.ai.state !== 'defend') ac.ai.state = 'patrol';
  if (!s) b.mem.patrol = { heading: ac.heading, altitude: ac.cmd.altitude, speed: ac.cmd.speed };
}

// ───────────────────────────────────────────────────────────── helpers

const spec = (ac: Aircraft): AircraftSpec => fighterSpec(ac);
const skillName = (ac: Aircraft): AiSkill => ac.ai?.skill ?? 'regular';
const skillOf = (ac: Aircraft) => AI_SKILLS[skillName(ac)];
const stateOf = (ac: Aircraft): AiState => ac.ai?.state ?? 'patrol';

/**
 * Structured fields on 'ai' events, where known: the aircraft the AI is engaging (commit / attack / launch /
 * pump) or reacting to (defend: the shooter), the missile concerned (its own shot, or the one it defends
 * against) and the range (m) that the text quotes.
 */
interface SayExtra { targetId?: EntityId | null; missileId?: EntityId | null; missile?: MissileId | null; range?: number | null }

type AiEvent = Extract<SimEvent, { type: 'ai' }>;

function say(world: World, ac: Aircraft, state: AiState, text: string, x: SayExtra = {}): void {
  const b = ac.ai?.data.brain as Brain | undefined;
  if (b) b.mem.lastText = text;
  const e: AiEvent = { t: world.t, type: 'ai', ownerId: ac.id, state, text };
  if (x.targetId) e.targetId = x.targetId;
  if (x.missileId) e.missileId = x.missileId;
  if (x.missile) e.missile = x.missile;
  if (x.range != null && Number.isFinite(x.range)) e.range = x.range;
  world.emit(e);
}

function setState(world: World, ac: Aircraft, state: AiState, text: string, x: SayExtra = {}): void {
  if (!ac.ai) return;
  ac.ai.state = state;
  ac.ai.stateSince = world.t;
  say(world, ac, state, text, x);
}

/** Fields for a launch call. */
function shotExtra(m: Missile, range: number): SayExtra {
  return { targetId: m.targetId, missileId: m.id, missile: m.type, range };
}

/** Fields for a call about a known contact (range only when it is a real position). */
function contactExtra(world: World, ac: Aircraft, k: Known, missile?: MissileId): SayExtra {
  return { targetId: k.id, missile: missile ?? null, range: k.bearingOnly ? null : ac.pos.distanceTo(estPos(k, world.t)) };
}

function fmtRange(m: number, units: 'metric' | 'imperial'): string {
  return units === 'metric' ? `${Math.round(m / 1000)} km` : `${Math.round(m / M_PER_NM)} nm`;
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function compass(h: number): string {
  return COMPASS[Math.round(wrap2Pi(h) / (Math.PI / 4)) % 8];
}

/** "you" for the player, otherwise the callsign. */
function who(ac: Aircraft | undefined | null): string {
  if (!ac) return 'the bandit';
  return ac.controller === 'player' ? 'you' : ac.callsign;
}
function whose(ac: Aircraft | undefined | null): string {
  if (!ac) return 'a';
  return ac.controller === 'player' ? 'your' : `${ac.callsign}'s`;
}
/** English article for a missile name: "an R-27ER", "an AIM-120C", "an SD-10", "a PL-5EII", "a Super 530D". */
function article(name: string): string {
  const abbrev = /^[A-Z]+[-\d]/.test(name); // spelled out letter by letter
  if (abbrev) return 'AEFHILMNORSX'.includes(name[0]) ? 'an' : 'a';
  return /^[AEIOU]/i.test(name) ? 'an' : 'a';
}
function mName(id: MissileId): string {
  return MISSILES[id].name;
}
const MISS_WORDS: Record<MissReason, string> = {
  notched: 'lost it in the notch', chaff: 'went for the chaff', flare: 'went for a flare',
  kinematic: 'ran out of energy', 'lost-guidance': 'lost guidance', 'no-acquisition': 'found nothing when it went active',
  'target-dead': 'lost its target', timeout: 'timed out', ground: 'hit the ground', overshoot: 'overshot',
};

function mps(ac: Aircraft, machNo: number, alt = ac.pos.y): number {
  const p = spec(ac).perf;
  return speedFromMach(Math.min(machNo, p.maxMach - 0.15), Math.max(0, alt));
}

function gLimit(ac: Aircraft, extra = 0): number {
  return Math.min(spec(ac).perf.maxG, skillOf(ac).maxG + extra);
}

function fly(world: World, ac: Aircraft, heading: number, alt: number, speed: number, ab: boolean, maxG: number): void {
  ac.cmd.heading = wrap2Pi(heading);
  ac.cmd.altitude = Math.max(alt, world.groundAlt + 300);
  ac.cmd.speed = speed;
  ac.cmd.afterburner = ab;
  ac.cmd.maxG = maxG;
}

/** Contacts are dead-reckoned at most this long; older ones stay where they were last seen. */
const EXTRAPOLATE_MAX = 12;

function estPos(k: Known, t: number, out = new Vector3()): Vector3 {
  const dt = Math.min(Math.max(t - k.t, 0), EXTRAPOLATE_MAX);
  return out.copy(k.pos).addScaledVector(k.vel, dt);
}

function isEnemy(world: World, ac: Aircraft, id: EntityId): boolean {
  const o = world.get(id);
  return !!o && o.alive && o.side !== ac.side;
}

function preferredAlt(ac: Aircraft): number {
  const ceil = spec(ac).perf.ceilingFt * 0.3048;
  return clamp(ceil * 0.6, 7500, 11000);
}

function missilesLeft(ac: Aircraft, b: Brain): boolean {
  if (b.cfg.shots != null && b.mem.shotsFired >= b.cfg.shots) return false;
  for (const k of Object.keys(ac.stores) as MissileId[]) if ((ac.stores[k] ?? 0) > 0) return true;
  return false;
}

function ownMissiles(world: World, ac: Aircraft): Missile[] {
  const out: Missile[] = [];
  for (const m of world.missiles.values()) if (m.alive && m.shooterId === ac.id) out.push(m);
  return out;
}

/** Missiles that still need this shooter: SARH (illumination) and ARH before pitbull (datalink). */
function supportNeeds(world: World, ac: Aircraft): Missile[] {
  return ownMissiles(world, ac).filter(m => m.guidance === 'sarh' || m.guidance === 'datalink' || m.guidance === 'inertial');
}

function inFlightAt(world: World, ac: Aircraft, targetId: EntityId): number {
  let n = 0;
  for (const m of world.missiles.values()) {
    if (m.alive && m.shooterId === ac.id && m.targetId === targetId && m.guidance !== 'ballistic') n++;
  }
  return n;
}

function hasMode(ac: Aircraft, mode: RadarModeId): boolean {
  return spec(ac).radar.modes.includes(mode);
}

/** Best search mode: TWS when a contact is being worked and the jet has it, else RWS. */
function searchMode(ac: Aircraft, working: boolean): RadarModeId {
  if (working && hasMode(ac, 'tws') && spec(ac).radar.tws) return 'tws';
  return 'rws';
}

function ensureMode(world: World, ac: Aircraft, b: Brain, mode: RadarModeId): void {
  if (ac.radar.mode === mode || !hasMode(ac, mode)) return;
  if (world.t - b.mem.modeAt < 1) return;
  b.mem.modeAt = world.t;
  world.setRadarMode(ac.id, mode);
  b.mem.scanSent = null;
}

// ───────────────────────────────────────────────────────────── perception

function upsert(b: Brain, id: EntityId, pos: Vector3, vel: Vector3 | null, t: number, src: KnownSrc, bearingOnly = false): void {
  const prev = b.mem.known.get(id);
  if (prev && !prev.bearingOnly && bearingOnly) return; // never degrade a real position to a bearing
  if (prev && !prev.bearingOnly && prev.t > t + 1e-3) return; // older than what we have
  let v: Vector3;
  if (vel) v = vel.clone();
  else if (prev && !prev.bearingOnly && t - prev.t > 0.5 && !bearingOnly) {
    v = pos.clone().sub(prev.pos).multiplyScalar(1 / (t - prev.t));
    if (v.length() > 800) v.setLength(800);
    v.lerp(prev.vel, 0.4);
  } else v = prev ? prev.vel.clone() : new Vector3();
  b.mem.known.set(id, { id, pos: pos.clone(), vel: v, t, src, bearingOnly });
}

function perceive(world: World, ac: Aircraft, b: Brain): void {
  const now = world.t;
  const sk = skillOf(ac);
  const radar = ac.radar;
  // Radar: track files (TWS/STT) and RWS bricks.
  for (const tr of radar.tracks) {
    if (!isEnemy(world, ac, tr.targetId)) continue;
    upsert(b, tr.targetId, tr.pos, tr.firm ? tr.vel : null, now, radar.stt.targetId === tr.targetId ? 'stt' : 'track');
  }
  for (const br of radar.bricks) {
    if (!isEnemy(world, ac, br.targetId)) continue;
    const prev = b.mem.known.get(br.targetId);
    if (prev && !prev.bearingOnly && prev.t >= br.t) continue;
    upsert(b, br.targetId, br.pos, null, br.t, 'brick');
  }
  // Eyes.
  for (const o of world.enemiesOf(ac)) {
    if (ac.pos.distanceTo(o.pos) <= sk.visualKm * 1000) upsert(b, o.id, o.pos, o.vel, now, 'visual');
  }
  // GCI picture.
  if (b.cfg.gci && now - b.mem.gciAt >= GCI_EVERY) {
    b.mem.gciAt = now;
    for (const o of world.enemiesOf(ac)) {
      if (ac.pos.distanceTo(o.pos) > GCI_RANGE) continue;
      const k = b.mem.known.get(o.id);
      if (k && !k.bearingOnly && now - k.t < 3) continue; // own sensors are fresher
      upsert(b, o.id, o.pos, o.vel, now, 'gci');
    }
  }
  // RWR: bearing to enemy emitters we have no position for (commit toward the spike).
  for (const c of ac.rwr) {
    if (c.emitterType === 'missile' || !isEnemy(world, ac, c.emitterId)) continue;
    const k = b.mem.known.get(c.emitterId);
    if (k && !k.bearingOnly && now - k.t < 20) continue;
    const guess = 70_000 - 55_000 * clamp(c.strength, 0, 1);
    const p = dirFrom(ac.heading + c.bearing, c.elevation).multiplyScalar(guess).add(ac.pos);
    upsert(b, c.emitterId, p, null, now, 'rwr', true);
  }
  // Forget the dead and the stale.
  for (const [id, k] of b.mem.known) {
    const o = world.get(id);
    if (!o || !o.alive || now - k.t > sk.memoryS) b.mem.known.delete(id);
  }
}

/** Threat missiles the AI knows about (RWR launch / missile, or seen), after its reaction delay. */
function currentThreat(world: World, ac: Aircraft, b: Brain): Threat | null {
  const now = world.t;
  const sk = skillOf(ac);
  const skill = skillName(ac);
  const list: Threat[] = [];
  const seenKeys = new Set<string>();
  const add = (m: Missile | null, emitter: Aircraft | null, kind: ThreatKind) => {
    const key = m ? m.id : `emitter:${emitter?.id ?? '?'}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const pos = m ? m.pos : emitter ? emitter.pos : ac.pos;
    const vel = m ? m.vel : emitter ? emitter.vel : ac.vel;
    const range = ac.pos.distanceTo(pos);
    const closure = closureRate(pos, vel, ac.pos, ac.vel);
    list.push({ key, missile: m, emitter, kind, pos, range, closure, tgo: range / Math.max(closure, 60) });
  };
  for (const c of ac.rwr) {
    if (c.state === 'missile') {
      const m = world.missiles.get(c.emitterId);
      if (m && m.alive) add(m, world.get(m.shooterId) ?? null, kindOf(m));
    } else if (c.state === 'launch') {
      const emitter = world.get(c.emitterId) ?? null;
      let found = false;
      for (const m of world.missiles.values()) {
        if (m.alive && m.shooterId === c.emitterId && m.targetId === ac.id && m.guidance !== 'ballistic') {
          add(m, emitter, kindOf(m));
          found = true;
        }
      }
      if (!found && emitter) add(null, emitter, c.missileType && MISSILES[c.missileType].seeker === 'arh' ? 'arh' : 'sarh');
    }
  }
  // Eyes: a hostile missile close by whose closest approach passes near us.
  const spot = sk.missileSpotKm * 1000;
  for (const m of world.missiles.values()) {
    if (!m.alive || m.side === ac.side) continue;
    if ((skill === 'ace' || skill === 'veteran') && m.guidance === 'ballistic') continue; // knows it went dumb
    const d = ac.pos.distanceTo(m.pos);
    if (d > spot) continue;
    const rx = ac.pos.x - m.pos.x, ry = ac.pos.y - m.pos.y, rz = ac.pos.z - m.pos.z;
    const vx = ac.vel.x - m.vel.x, vy = ac.vel.y - m.vel.y, vz = ac.vel.z - m.vel.z;
    const vv = vx * vx + vy * vy + vz * vz || 1;
    const tStar = -(rx * vx + ry * vy + rz * vz) / vv;
    if (tStar < 0 || tStar > 40) continue;
    const cx = rx + vx * tStar, cy = ry + vy * tStar, cz = rz + vz * tStar;
    const defending = b.mem.defend !== null && b.mem.defend.key === m.id;
    if (Math.hypot(cx, cy, cz) > (defending ? 6000 : 2500)) continue;
    add(m, world.get(m.shooterId) ?? null, kindOf(m));
  }
  // Reaction delay per new threat; forget threats that are gone.
  for (const key of [...b.mem.threatSeen.keys()]) if (!seenKeys.has(key)) b.mem.threatSeen.delete(key);
  let best: Threat | null = null;
  for (const th of list) {
    let at = b.mem.threatSeen.get(th.key);
    if (at === undefined) {
      const [lo, hi] = sk.reactS;
      at = now + lo + (hi - lo) * world.rand();
      // Still in the fight for the same threat: no new reaction delay.
      if (b.mem.defend && stateOf(ac) === 'defend') at = now;
      b.mem.threatSeen.set(th.key, at);
    }
    if (now < at) continue;
    if (th.closure < -30 && th.range > 3000) continue; // it is going away
    if (!best || th.tgo < best.tgo) best = th;
  }
  return best;
}

function kindOf(m: Missile): ThreatKind {
  const s = MISSILES[m.type].seeker;
  return s === 'ir' ? 'ir' : s === 'sarh' || m.guidance === 'sarh' ? 'sarh' : 'arh';
}

function friendTargets(world: World, ac: Aircraft): Set<EntityId> {
  const out = new Set<EntityId>();
  for (const f of world.aircraft.values()) {
    if (!f.alive || f.side !== ac.side || f.id === ac.id) continue;
    const fb = f.ai?.data.brain as Brain | undefined;
    const t = fb ? fb.mem.targetId : (f.radar.stt.targetId ?? f.radar.designated[0] ?? null);
    if (t) out.add(t);
  }
  return out;
}

function chooseTarget(world: World, ac: Aircraft, b: Brain): Known | null {
  const now = world.t;
  if (b.cfg.targetId) return b.mem.known.get(b.cfg.targetId) ?? null;
  const sorted = friendTargets(world, ac);
  const tmp = new Vector3();
  let best: Known | null = null;
  let bestScore = Infinity;
  for (const k of b.mem.known.values()) {
    const r = ac.pos.distanceTo(estPos(k, now, tmp));
    if (!k.bearingOnly && r > b.cfg.commitRange) continue;
    let score = k.bearingOnly ? 1e7 + r : r;
    if (sorted.has(k.id) && b.mem.known.size > 1) score *= 1.6; // sort: take the one nobody has
    if (k.id === b.mem.targetId) score *= 0.75;                  // don't flip-flop
    if (score < bestScore) { bestScore = score; best = k; }
  }
  return best;
}

// ───────────────────────────────────────────────────────────── radar handling

function pickScale(ac: Aircraft, range: number): number {
  const scales = spec(ac).radar.rangeScalesKm;
  const want = Math.max(range * 1.25, 40_000) / 1000;
  return (scales.find(s => s >= want) ?? scales[scales.length - 1]) * 1000;
}

/** Point the scan at a known contact (or run a slow elevation search pattern when there is none). */
function pointRadar(world: World, ac: Aircraft, b: Brain, k: Known | null): void {
  const now = world.t;
  const r = ac.radar;
  if (r.mode === 'off' || r.mode === 'stt' || r.mode === 'acm') return;
  if (now - b.mem.scanAt < 0.5) return;
  const rs = spec(ac).radar;
  const gim = rs.gimbalAzDeg * D2R;
  const gimEl = rs.gimbalElDeg * D2R;
  const barsHalf = ((r.bars - 1) * rs.barSpacingDeg * D2R) / 2;
  let az = 0, el = 0, scale = r.rangeScale;
  if (k) {
    const p = estPos(k, now);
    az = relBearing(ac.pos, ac.heading, p);
    el = k.bearingOnly ? 0 : elevationTo(ac.pos, p);
    if (!k.bearingOnly) scale = pickScale(ac, ac.pos.distanceTo(p));
    const azLim = Math.max(0, gim - r.azHalf);
    az = clamp(az, -azLim, azLim);
  } else {
    // Search pattern: level, then low, then high, one frame each.
    const frame = Math.max(r.frameTime, 2) + 0.5;
    if (now - b.mem.elPhaseAt > frame) { b.mem.elPhase = (b.mem.elPhase + 1) % 3; b.mem.elPhaseAt = now; }
    el = [0, -3.5 * D2R, 2.5 * D2R][b.mem.elPhase];
    scale = pickScale(ac, 100_000);
  }
  el = clamp(el, -(gimEl - barsHalf), gimEl - barsHalf);
  const s = b.mem.scanSent;
  if (s && Math.abs(s.az - az) < 2 * D2R && Math.abs(s.el - el) < 0.7 * D2R && s.scale === scale) return;
  b.mem.scanAt = now;
  b.mem.scanSent = { az, el, scale };
  world.setScan(ac.id, { azCenter: az, elCenter: el, rangeScale: scale });
}

function tryLock(world: World, ac: Aircraft, b: Brain, targetId: EntityId): boolean {
  if (ac.radar.mode === 'stt' && ac.radar.stt.targetId === targetId) return true;
  if (world.t - b.mem.lockTryAt < 1) return false;
  b.mem.lockTryAt = world.t;
  return world.lock(ac.id, targetId);
}

function ensureDesignated(world: World, ac: Aircraft, b: Brain, targetId: EntityId): boolean {
  if (ac.radar.mode !== 'tws') return false;
  if (ac.radar.designated.includes(targetId)) return true;
  const tr = ac.radar.tracks.find(t => t.targetId === targetId);
  if (!tr || !tr.firm) return false;
  if (world.t - b.mem.designateAt < 0.8) return false;
  b.mem.designateAt = world.t;
  world.designate(ac.id, targetId);
  return ac.radar.designated.includes(targetId);
}

// ───────────────────────────────────────────────────────────── weapons

type Method = 'stt' | 'tws' | 'ir';
interface ShotPlan { missile: MissileId; dlz: Dlz; shootAt: number; method: Method; inRange: boolean; range: number }

function methodFor(ac: Aircraft, b: Brain, missile: MissileId): Method {
  const ms = MISSILES[missile];
  if (ms.seeker === 'ir') return 'ir';
  if (ms.seeker === 'sarh') return 'stt';
  if (ac.type === 'mig29s' && missile === 'r77' && ac.radar.snp2 && b.cfg.launchMode !== 'stt') return 'tws';
  const tws = spec(ac).radar.tws;
  const twsOk = !!tws && tws.launchFromTws && hasMode(ac, 'tws');
  if (b.cfg.launchMode === 'stt') return 'stt';
  if (b.cfg.launchMode === 'tws') return twsOk ? 'tws' : 'stt';
  return twsOk ? 'tws' : 'stt';
}

/** Each earlier shot at the same (still alive) target that failed brings the next launch this much closer. */
const RESHOOT_CLOSER = 0.8;

function shootRange(ac: Aircraft, b: Brain, dlz: Dlz, targetId: EntityId): number {
  if (b.cfg.fireAtRange != null) return b.cfg.fireAtRange;
  const sk = skillOf(ac);
  const f = b.cfg.launchFraction ?? sk.launchFrac;
  const ace = dlz.rne + 0.2 * (dlz.rmax - dlz.rne);
  let r = f != null ? f * dlz.rmax : ace;
  // Long shots that were dragged or notched: press closer next time, down to the ace's range (the fight
  // converges instead of trading Rmax shots forever). A fixed launchFraction is left alone.
  if (b.cfg.launchFraction == null && r > ace) {
    let failed = 0;
    for (const s of b.mem.fired) if (s.targetId === targetId && s.ended !== null) failed++;
    if (failed) r = Math.max(ace, r * Math.pow(RESHOOT_CLOSER, failed));
  }
  r *= b.mem.jitter;
  return clamp(r, dlz.rmin * 1.3, dlz.rmax);
}

/** Which missile to use against `k` and whether it is time to shoot. */
function planShot(world: World, ac: Aircraft, b: Brain, k: Known): ShotPlan | null {
  if (k.bearingOnly || !missilesLeft(ac, b)) return null;
  const p = estPos(k, world.t);
  const range = ac.pos.distanceTo(p);
  let best: ShotPlan | null = null;
  let bestRank = -Infinity;
  for (const id of Object.keys(ac.stores) as MissileId[]) {
    if ((ac.stores[id] ?? 0) <= 0) continue;
    const ms = MISSILES[id];
    if (ms.seeker === 'ir' && range > IR_MAX_RANGE) continue;
    const dlz = dlzFor(ac.pos, ac.vel, p, k.vel, id);
    const shootAt = shootRange(ac, b, dlz, k.id);
    const late = b.cfg.fireNoLaterThan != null && world.t >= b.cfg.fireNoLaterThan;
    const inRange = (range <= shootAt || late) && range >= dlz.rmin;
    const method = methodFor(ac, b, id);
    // Rank: in range first; then IR inside 8 km, ARH (fire-and-forget), SARH; then longer reach.
    let rank = inRange ? 1000 : 0;
    if (ms.seeker === 'ir') rank += range < 8000 ? 300 : -200;
    else if (ms.seeker === 'arh') rank += 200;
    else rank += 100;
    rank += dlz.rmax / 1000;
    if (rank > bestRank) { bestRank = rank; best = { missile: id, dlz, shootAt, method, inRange, range }; }
  }
  return best;
}

/** Set the radar up for the shot (lock or designate) and fire when ready. Returns the missile fired, if any. */
function prosecute(world: World, ac: Aircraft, b: Brain, k: Known, plan: ShotPlan): Missile | null {
  const now = world.t;
  const sk = skillOf(ac);
  const closure = Math.max(0, closureRate(ac.pos, ac.vel, estPos(k, now), k.vel));
  // Missiles in the air that need this radar: a lock here would drop another target's datalink/illumination,
  // and a TWS shot would have to give up the STT a SARH missile rides on.
  const needs = supportNeeds(world, ac);
  // СНП2 is an explicit two-target mode, never a general permission for FC3 TWS shots.
  // Use only existing fresh radar tracks; GCI alone cannot supply a launch pair.
  if (ac.type === 'mig29s' && plan.missile === 'r77' && b.cfg.launchMode !== 'stt' && !needs.length) {
    const lead = ac.radar.tracks.find(t => t.targetId === k.id && t.firm && !t.coasting);
    const second = lead ? pickSnp2Second(world, ac, k.id) : null;
    const limit = b.cfg.maxInFlightPerTarget ?? sk.inFlightPerTarget;
    const slots = b.cfg.shots == null || b.cfg.shots - b.mem.shotsFired >= 2;
    const pair = second && !b.cfg.targetId && slots && (ac.stores.r77 ?? 0) >= 2
      && inFlightAt(world, ac, k.id) < limit && inFlightAt(world, ac, second) < limit;
    if (pair && ac.radar.mode === 'tws') {
      for (const id of [...ac.radar.designated]) if (id !== k.id) world.undesignate(ac.id, id);
      if (!ac.radar.designated.includes(k.id)) world.designate(ac.id, k.id);
      world.setSnp2(ac.id, true);
      if (snp2Eligibility(world, ac).ok) plan.method = 'tws';
      else { world.setSnp2(ac.id, false); plan.method = 'stt'; }
    } else if (ac.radar.snp2) {
      world.setSnp2(ac.id, false);
      plan.method = 'stt';
    }
  }
  if (plan.method === 'stt' && needs.some(m => m.targetId !== k.id)) return null;
  if (plan.method === 'tws' && needs.some(m => m.guidance === 'sarh')) return null;
  // Radar setup.
  if (plan.method === 'stt') {
    const lockAt = b.cfg.fireAtRange != null ? plan.shootAt + closure * 5 : plan.shootAt * sk.lockLead + closure * 2;
    if (plan.range <= lockAt) tryLock(world, ac, b, k.id);
    else if (ac.radar.mode !== 'stt' || ac.radar.stt.targetId !== k.id) {
      ensureMode(world, ac, b, searchMode(ac, true));
      pointRadar(world, ac, b, k);
    }
  } else if (plan.method === 'tws') {
    if (ac.radar.mode === 'stt' && needs.length === 0) {
      // Never hold a lock we don't need: go back to TWS for a silent shot.
      if (now - b.mem.modeAt > 1) { b.mem.modeAt = now; world.unlock(ac.id); }
    }
    ensureMode(world, ac, b, 'tws');
    pointRadar(world, ac, b, k);
    ensureDesignated(world, ac, b, k.id);
  } else {
    // IR: keep the radar on the target if it can (range and cueing), not required.
    if (ac.radar.mode !== 'stt' && plan.range < 15_000 && needs.length === 0) tryLock(world, ac, b, k.id);
  }
  // Fire?
  if (b.cfg.holdFire || !plan.inRange) return null;
  const limit = b.cfg.maxInFlightPerTarget ?? sk.inFlightPerTarget;
  const already = inFlightAt(world, ac, k.id);
  if (already >= limit) return null;
  if (now - b.mem.lastLaunch < (already > 0 ? LAUNCH_SPACING_SAME : LAUNCH_SPACING_ANY)) return null;
  if (plan.method === 'ir' && Math.abs(relBearing(ac.pos, ac.heading, estPos(k, now))) > 30 * D2R) return null;
  // A shot at this target just failed (notched, decoyed, lock broken): give it a moment before reshooting.
  if (b.mem.fired.some(f => f.targetId === k.id && f.ended !== null && now - f.ended < sk.reshootS)) return null;
  // Don't waste a radar missile on a target sitting in the beam/notch (skilled AI waits for it to turn back in).
  if (plan.method !== 'ir' && b.cfg.fireAtRange == null && skillName(ac) !== 'rookie' && k.vel.lengthSq() > 100 && plan.range > plan.dlz.rmin * 3) {
    const asp = aspectAngle(estPos(k, now), k.vel, ac.pos);
    if (asp > 65 * D2R && asp < 115 * D2R) { b.mem.lastLaunchBlock = 'Target is beaming: waiting for it to leave the notch'; return null; }
  }
  ac.selectedWeapon = plan.missile;
  if (ac.radar.snp2) {
    if (b.cfg.shots != null && b.mem.shotsFired + 2 > b.cfg.shots) return null;
    const pair = world.canLaunchSnp2(ac.id);
    if (!pair.ok) { b.mem.lastLaunchBlock = pair.reason; return null; }
    // Both targets obey the AI's reshoot delay and per-target in-flight limit.
    if (pair.targetIds?.some(id => inFlightAt(world, ac, id) >= limit
      || b.mem.fired.some(f => f.targetId === id && f.ended !== null && now - f.ended < sk.reshootS))) return null;
    const missiles = world.launchSnp2(ac.id);
    if (!missiles.length) return null;
    b.mem.lastLaunch = now;
    b.mem.shotsFired += missiles.length;
    b.mem.lastLaunchBlock = '';
    b.mem.jitter = 0.95 + 0.1 * world.rand();
    for (const m of missiles) if (m.targetId) b.mem.fired.push({ id: m.id, targetId: m.targetId, ended: null });
    b.mem.fired = b.mem.fired.slice(-12);
    const second = missiles[1];
    if (second) say(world, ac, stateOf(ac), `${ac.callsign} fires the second R-77 in the СНП2 pair at ${who(world.get(second.targetId))}`, shotExtra(second, pair.range ?? plan.range));
    return missiles[0];
  }
  const res = world.launch(ac.id, k.id, plan.missile);
  if ('kind' in res) {
    b.mem.lastLaunch = now;
    b.mem.shotsFired++;
    b.mem.lastLaunchBlock = '';
    b.mem.jitter = 0.95 + 0.1 * world.rand();
    b.mem.fired.push({ id: res.id, targetId: k.id, ended: null });
    if (b.mem.fired.length > 12) b.mem.fired.shift();
    return res;
  }
  b.mem.lastLaunchBlock = res.reason;
  return null;
}

function launchText(world: World, ac: Aircraft, b: Brain, m: Missile, plan: ShotPlan): string {
  const tgt = world.get(m.targetId);
  const r = fmtRange(plan.range, b.cfg.units);
  const name = mName(m.type);
  const a = article(name);
  if (plan.method === 'stt') return `${ac.callsign} locks ${who(tgt)} and fires ${a} ${name} from ${r}`;
  if (plan.method === 'tws') return `${ac.callsign} fires ${a} ${name} at ${who(tgt)} from ${r} in TWS: no lock, no launch warning`;
  return `${ac.callsign} fires ${a} ${name} at ${who(tgt)} from ${r}`;
}

// ───────────────────────────────────────────────────────────── the decision loop

function decide(world: World, ac: Aircraft, b: Brain, dt: number): void {
  if (!b.mem.init) {
    b.mem.init = true;
    b.mem.patrol = { heading: ac.cmd.heading, altitude: ac.cmd.altitude, speed: ac.cmd.speed };
    b.mem.jitter = 0.95 + 0.1 * world.rand();
  }
  perceive(world, ac, b);
  for (const f of b.mem.fired) {
    if (f.ended !== null) continue;
    const m = world.missiles.get(f.id);
    if (!m || !m.alive || m.guidance === 'ballistic') f.ended = world.t;
  }

  const threat = b.cfg.evade ? currentThreat(world, ac, b) : null;
  if (threat) { defend(world, ac, b, threat); return; }
  if (stateOf(ac) === 'defend') {
    // Keep flying the defence briefly through a warning that flickers; end at once if the missile is gone.
    const d = b.mem.defend;
    const m = d?.missileId ? world.missiles.get(d.missileId) : undefined;
    const gone = !d || (d.missileId !== null && (!m || !m.alive));
    if (!gone && d && world.t - d.lastSeen < 1.5) return;
    endDefend(world, ac, b);
  }

  if (b.cfg.script) { flyScript(world, ac, b, b.cfg.script); return; }

  switch (stateOf(ac)) {
    case 'patrol': return patrol(world, ac, b);
    case 'commit': return commit(world, ac, b);
    case 'attack': return attack(world, ac, b);
    case 'support': return support(world, ac, b);
    case 'pump': return pump(world, ac, b);
    case 'merge': return merge(world, ac, b);
    case 'rtb': return rtb(world, ac, b);
    case 'defend': return patrol(world, ac, b);
  }
}

// ── patrol

function patrol(world: World, ac: Aircraft, b: Brain): void {
  const leader = world.get(b.cfg.leaderId);
  const flying = !!leader && leader.alive;
  let k = chooseTarget(world, ac, b);
  // A wingman stays in formation on a GCI call until the contact is close or its own sensors have it.
  if (k && flying && (k.src === 'gci' || k.bearingOnly) && ac.pos.distanceTo(estPos(k, world.t)) > 70_000) k = null;
  if (k) {
    if (!missilesLeft(ac, b) && supportNeeds(world, ac).length === 0) {
      if (!k.bearingOnly) return goRtb(world, ac, b);
    } else {
      b.mem.targetId = k.id;
      b.mem.lostSince = null;
      setState(world, ac, 'commit', commitText(world, ac, b, k), contactExtra(world, ac, k));
      return commit(world, ac, b);
    }
  }
  ensureMode(world, ac, b, 'rws');
  pointRadar(world, ac, b, null);
  if (leader && leader.alive) return formation(world, ac, b, leader);
  const p = b.mem.patrol;
  fly(world, ac, p.heading, p.altitude, p.speed, false, gLimit(ac));
}

function formation(world: World, ac: Aircraft, b: Brain, leader: Aircraft): void {
  const h = leader.heading;
  const fwd = dirFrom(h);
  const right = new Vector3(Math.cos(h), 0, Math.sin(h));
  const slot = leader.pos.clone().addScaledVector(right, 3000 * b.cfg.formationSide).addScaledVector(fwd, -600);
  const to = slot.sub(ac.pos);
  to.y = 0;
  const dist = to.length();
  const along = to.dot(fwd);
  const lateral = to.dot(right);
  const lspeed = Math.hypot(leader.vel.x, leader.vel.z);
  let heading = h + clamp(lateral / 4000, -0.5, 0.5);
  if (dist > 6000) heading = bearingTo(ac.pos, ac.pos.clone().add(to));
  const speed = clamp(lspeed + clamp(along * 0.04, -60, 90), 150, mps(ac, 1.3));
  fly(world, ac, heading, leader.pos.y, speed, along > 3000, gLimit(ac));
}

function commitText(world: World, ac: Aircraft, b: Brain, k: Known): string {
  const tgt = world.get(k.id);
  if (k.bearingOnly) return `${ac.callsign} hears ${whose(tgt)} radar and turns hot toward it`;
  const r = fmtRange(ac.pos.distanceTo(estPos(k, world.t)), b.cfg.units);
  const src = k.src === 'gci' ? ' on the GCI picture' : k.src === 'visual' ? ' visually' : '';
  return `${ac.callsign} commits on ${who(tgt)}${src}, ${r}`;
}

// ── commit

function commit(world: World, ac: Aircraft, b: Brain): void {
  const now = world.t;
  const sk = skillOf(ac);
  const k = chooseTarget(world, ac, b);
  if (!k) return lostContact(world, ac, b);
  b.mem.lostSince = null;
  if (k.id !== b.mem.targetId) b.mem.targetId = k.id;
  if (!missilesLeft(ac, b) && supportNeeds(world, ac).length === 0) return goRtb(world, ac, b);
  const p = estPos(k, now);
  const range = ac.pos.distanceTo(p);
  // Keep an existing lock on this target (re-attack after a miss); otherwise search/track it.
  const lockedOn = ac.radar.mode === 'stt' && ac.radar.stt.targetId === k.id;
  if (!lockedOn) {
    ensureMode(world, ac, b, searchMode(ac, !k.bearingOnly));
    pointRadar(world, ac, b, k);
  }
  if (!k.bearingOnly) {
    if (range < MERGE_RANGE) {
      setState(world, ac, 'merge', mergeText(world, ac, b, k), contactExtra(world, ac, k));
      return merge(world, ac, b);
    }
    const plan = planShot(world, ac, b, k);
    if (plan && !b.cfg.holdFire) {
      const setupAt = Math.max(plan.dlz.rmax * 1.3, (b.cfg.fireAtRange ?? 0) * 1.5, plan.shootAt + 15_000);
      if (range <= setupAt) {
        const tgt = world.get(k.id);
        setState(world, ac, 'attack', `${ac.callsign} sets up ${article(mName(plan.missile))} ${mName(plan.missile)} shot on ${who(tgt)}, ${fmtRange(range, b.cfg.units)}`, contactExtra(world, ac, k, plan.missile));
        return attack(world, ac, b);
      }
    }
  }
  // Intercept: lead toward the contact, climb and speed up for the shot if skilled.
  const lead = Math.min(range / 1200, 20);
  const aim = k.bearingOnly ? p : p.clone().addScaledVector(k.vel, lead);
  const alt = sk.energy ? Math.max(ac.cmd.altitude, preferredAlt(ac)) : ac.cmd.altitude;
  fly(world, ac, bearingTo(ac.pos, aim), alt, mps(ac, 0.9, alt), false, gLimit(ac));
}

function lostContact(world: World, ac: Aircraft, b: Brain): void {
  const now = world.t;
  if (b.mem.lostSince === null) b.mem.lostSince = now;
  ensureMode(world, ac, b, 'rws');
  pointRadar(world, ac, b, null);
  if (now - b.mem.lostSince > 6) {
    b.mem.targetId = null;
    b.mem.lostSince = null;
    b.mem.patrol = { heading: ac.heading, altitude: ac.cmd.altitude, speed: ac.cmd.speed };
    setState(world, ac, 'patrol', `${ac.callsign} lost contact and resumes the patrol`);
  }
}

// ── attack

function attack(world: World, ac: Aircraft, b: Brain): void {
  const now = world.t;
  const sk = skillOf(ac);
  const k = chooseTarget(world, ac, b);
  if (!k || k.bearingOnly) {
    if (supportNeeds(world, ac).length) return enterSupport(world, ac, b, null);
    setState(world, ac, 'commit', `${ac.callsign} lost the track and searches again`);
    b.mem.lostSince = now;
    return;
  }
  b.mem.targetId = k.id;
  const p = estPos(k, now);
  const range = ac.pos.distanceTo(p);
  if (range < MERGE_RANGE) {
    setState(world, ac, 'merge', mergeText(world, ac, b, k), contactExtra(world, ac, k));
    return merge(world, ac, b);
  }
  const plan = planShot(world, ac, b, k);
  if (!plan || b.cfg.holdFire) {
    if (supportNeeds(world, ac).length) return enterSupport(world, ac, b, null);
    if (!missilesLeft(ac, b)) return goRtb(world, ac, b);
    setState(world, ac, 'commit', `${ac.callsign} presses toward ${who(world.get(k.id))}`, contactExtra(world, ac, k));
    return;
  }
  if (range > Math.max(plan.dlz.rmax * 1.6, (b.cfg.fireAtRange ?? 0) * 2, plan.shootAt + 30_000)) {
    setState(world, ac, 'commit', `${ac.callsign} is out of range and keeps closing on ${who(world.get(k.id))}`, contactExtra(world, ac, k, plan.missile));
    return;
  }
  // Fly: pure pursuit, climb and accelerate for kinematics (skill), then fire.
  const lead = Math.min(range / 1500, 10);
  const aim = p.clone().addScaledVector(k.vel, lead);
  const alt = sk.energy ? Math.max(ac.cmd.altitude, preferredAlt(ac)) : ac.cmd.altitude;
  const fast = sk.energy && skillName(ac) !== 'regular';
  fly(world, ac, bearingTo(ac.pos, aim), alt, mps(ac, fast ? 1.15 : 0.95, alt), fast, gLimit(ac));
  const m = prosecute(world, ac, b, k, plan);
  if (m) enterSupport(world, ac, b, launchText(world, ac, b, m, plan), shotExtra(m, plan.range));
}

// ── support

function enterSupport(world: World, ac: Aircraft, b: Brain, text: string | null, x: SayExtra = {}): void {
  const needs = supportNeeds(world, ac);
  if (needs.length === 0) {
    if (text) say(world, ac, stateOf(ac), text, x); // e.g. an IR shot: nothing to support
    return afterShots(world, ac, b);
  }
  const tgt = world.get(needs[0].targetId);
  if (tgt) {
    const rel = relBearing(ac.pos, ac.heading, tgt.pos);
    b.mem.crankSide = rel >= 0 ? 1 : -1;
  }
  if (stateOf(ac) !== 'support' || text) {
    const m = needs[0];
    const why = m.guidance === 'sarh' ? 'holding the lock until impact' : 'supporting it to pitbull';
    setState(world, ac, 'support', text ?? `${ac.callsign} cranks, ${why}`, text ? x : { targetId: m.targetId, missileId: m.id, missile: m.type });
  }
}

function support(world: World, ac: Aircraft, b: Brain): void {
  const now = world.t;
  const sk = skillOf(ac);
  const needs = supportNeeds(world, ac);
  if (needs.length === 0) return afterShots(world, ac, b);
  const sarh = needs.find(m => m.guidance === 'sarh');
  const primary = sarh ?? needs[0];
  const tgt = world.get(primary.targetId);
  // Keep the radar on the supported target(s).
  if (tgt && tgt.alive) {
    const method = methodFor(ac, b, primary.type);
    if (method === 'stt' || sarh) tryLock(world, ac, b, tgt.id);
    else {
      ensureMode(world, ac, b, 'tws');
      const k = b.mem.known.get(tgt.id);
      if (k) pointRadar(world, ac, b, k);
      for (const m of needs) if (m.targetId) ensureDesignated(world, ac, b, m.targetId);
    }
  }
  // Another shot while supporting: second missile at the same target (skill), or a new target
  // for multi-target TWS jets.
  const k = chooseSupportShot(world, ac, b, needs);
  if (k) {
    const plan = planShot(world, ac, b, k);
    if (plan && plan.inRange) {
      const m = prosecute(world, ac, b, k, plan);
      if (m) say(world, ac, 'support', launchText(world, ac, b, m, plan), shotExtra(m, plan.range));
    }
  }
  // Crank: target at crankDeg off the nose, inside the radar gimbal.
  const kt = tgt?.alive ? b.mem.known.get(tgt.id) : undefined;
  const pos = kt ? estPos(kt, now) : tgt?.alive ? tgt.pos : primary.aimPos;
  const gim = spec(ac).radar.gimbalAzDeg;
  const crank = Math.min(sk.crankDeg, gim - 8) * D2R;
  if (b.mem.crankSide === 0) b.mem.crankSide = 1;
  const heading = bearingTo(ac.pos, pos) - b.mem.crankSide * crank;
  fly(world, ac, heading, ac.cmd.altitude, mps(ac, 0.85), false, gLimit(ac));
}

function chooseSupportShot(world: World, ac: Aircraft, b: Brain, needs: Missile[]): Known | null {
  if (b.cfg.holdFire || !missilesLeft(ac, b)) return null;
  const sk = skillOf(ac);
  const sarhTarget = needs.find(m => m.guidance === 'sarh')?.targetId ?? null;
  const cur = b.mem.targetId ? b.mem.known.get(b.mem.targetId) : undefined;
  const limit = b.cfg.maxInFlightPerTarget ?? sk.inFlightPerTarget;
  if (cur && !cur.bearingOnly && inFlightAt(world, ac, cur.id) < limit) return cur;
  if (sarhTarget) return null; // an FC3/SARH shooter is tied to one target
  const tws = spec(ac).radar.tws;
  if (!tws || !tws.launchFromTws || tws.maxSimultaneousTargets < 2 || skillName(ac) === 'rookie') return null;
  const supported = new Set(needs.map(m => m.targetId));
  if (supported.size >= tws.maxSimultaneousTargets) return null;
  let best: Known | null = null;
  let bestR = Infinity;
  for (const k of b.mem.known.values()) {
    if (k.bearingOnly || supported.has(k.id) || b.cfg.targetId) continue;
    const tr = ac.radar.tracks.find(t => t.targetId === k.id && t.firm);
    if (!tr) continue;
    const r = ac.pos.distanceTo(estPos(k, world.t));
    if (r < bestR) { bestR = r; best = k; }
  }
  if (best) b.mem.targetId = best.id;
  return best;
}

/** All shots are autonomous or resolved: pump, re-attack, next target or go home. */
function afterShots(world: World, ac: Aircraft, b: Brain): void {
  const live = ownMissiles(world, ac).filter(m => m.guidance === 'active' || m.guidance === 'ir');
  const tgt = world.get(b.mem.targetId);
  if (live.length) {
    const active = live.find(m => m.guidance === 'active');
    const txt = active
      ? `${ac.callsign}'s ${mName(active.type)} is active on ${who(world.get(active.targetId))}: it pumps cold`
      : `${ac.callsign} turns cold while its ${mName(live[0].type)} flies`;
    const lead = active ?? live[0];
    return goPump(world, ac, b, tgt ?? null, txt, undefined, { targetId: lead.targetId, missileId: lead.id, missile: lead.type });
  }
  if (tgt && tgt.alive) {
    if (!missilesLeft(ac, b)) return goRtb(world, ac, b);
    setState(world, ac, 'commit', `${ac.callsign} re-attacks ${who(tgt)}`, { targetId: tgt.id });
    return;
  }
  b.mem.targetId = null;
  const next = chooseTarget(world, ac, b);
  if (next && missilesLeft(ac, b)) {
    b.mem.targetId = next.id;
    setState(world, ac, 'commit', `${ac.callsign} switches to ${who(world.get(next.id))}`, contactExtra(world, ac, next));
    return;
  }
  if (!missilesLeft(ac, b)) return goRtb(world, ac, b);
  b.mem.patrol = { heading: ac.heading, altitude: ac.cmd.altitude, speed: mps(ac, 0.85) };
  setState(world, ac, 'patrol', `${ac.callsign} has no target left and resumes the patrol`);
}

// ── pump

function goPump(world: World, ac: Aircraft, b: Brain, from: Aircraft | null, text: string, seconds?: number, x: SayExtra = {}): void {
  b.mem.pumpUntil = world.t + (seconds ?? skillOf(ac).pumpS);
  b.mem.pumpFrom = from?.id ?? null;
  b.mem.pumpAlt = Math.max(ac.pos.y - 1000, Math.min(ac.pos.y, 5000));
  setState(world, ac, 'pump', text, { targetId: from?.id ?? null, ...x });
}

function coldHeading(world: World, ac: Aircraft, b: Brain, fromId: EntityId | null): number {
  const from = world.get(fromId);
  if (from && from.alive) return bearingTo(from.pos, ac.pos);
  // Away from the centroid of known enemies, else reverse course.
  const c = new Vector3();
  let n = 0;
  for (const k of b.mem.known.values()) { c.add(estPos(k, world.t)); n++; }
  if (n) return bearingTo(c.multiplyScalar(1 / n), ac.pos);
  return ac.heading;
}

function pump(world: World, ac: Aircraft, b: Brain): void {
  const now = world.t;
  const h = coldHeading(world, ac, b, b.mem.pumpFrom);
  // (was recomputed from cmd.altitude every decision, so it stepped down 1 km per tick to 5 km)
  const alt = b.mem.pumpAlt;
  fly(world, ac, h, alt, mps(ac, 1.1, alt), true, gLimit(ac));
  ensureMode(world, ac, b, 'rws');
  if (now < b.mem.pumpUntil) return;
  if (b.cfg.recommit && missilesLeft(ac, b)) {
    const k = chooseTarget(world, ac, b);
    if (k) {
      b.mem.targetId = k.id;
      setState(world, ac, 'commit', `${ac.callsign} turns back hot on ${who(world.get(k.id))}`, contactExtra(world, ac, k));
      return;
    }
    b.mem.patrol = { heading: wrap2Pi(h + Math.PI), altitude: ac.cmd.altitude, speed: mps(ac, 0.85) };
    setState(world, ac, 'patrol', `${ac.callsign} turns back and searches`);
    return;
  }
  goRtb(world, ac, b);
}

// ── merge

function mergeText(world: World, ac: Aircraft, b: Brain, k: Known): string {
  const ir = (Object.keys(ac.stores) as MissileId[]).find(id => (ac.stores[id] ?? 0) > 0 && MISSILES[id].seeker === 'ir');
  const tgt = world.get(k.id);
  return ir && !b.cfg.holdFire
    ? `${ac.callsign} merges with ${who(tgt)} and goes for ${article(mName(ir))} ${mName(ir)}`
    : `${ac.callsign} merges with ${who(tgt)}`;
}

function merge(world: World, ac: Aircraft, b: Brain): void {
  const now = world.t;
  const k = chooseTarget(world, ac, b);
  if (!k || k.bearingOnly) {
    setState(world, ac, 'commit', `${ac.callsign} lost sight in the merge`);
    b.mem.lostSince = now;
    return;
  }
  b.mem.targetId = k.id;
  const p = estPos(k, now);
  const range = ac.pos.distanceTo(p);
  if (range > MERGE_EXIT) {
    setState(world, ac, 'commit', `${ac.callsign} leaves the merge and resets on ${who(world.get(k.id))}`, contactExtra(world, ac, k));
    return;
  }
  if (!missilesLeft(ac, b) && supportNeeds(world, ac).length === 0) return goRtb(world, ac, b);
  // Lead pursuit, full power.
  const aim = p.clone().addScaledVector(k.vel, Math.min(range / 800, 4));
  fly(world, ac, bearingTo(ac.pos, aim), p.y, mps(ac, 0.9, p.y), true, gLimit(ac, 1));
  const plan = planShot(world, ac, b, k);
  if (plan) {
    const m = prosecute(world, ac, b, k, plan);
    if (m) say(world, ac, 'merge', launchText(world, ac, b, m, plan), shotExtra(m, plan.range));
  }
}

// ── rtb

function goRtb(world: World, ac: Aircraft, b: Brain): void {
  if (stateOf(ac) === 'rtb') return rtb(world, ac, b);
  const why = b.cfg.shots != null && b.mem.shotsFired >= b.cfg.shots ? 'has fired its shots' : 'is out of missiles';
  setState(world, ac, 'rtb', `${ac.callsign} ${why} and turns for home`);
  rtb(world, ac, b);
}

function rtb(world: World, ac: Aircraft, b: Brain): void {
  const h = coldHeading(world, ac, b, b.mem.targetId);
  fly(world, ac, h, Math.max(ac.cmd.altitude, 6000), mps(ac, 0.9), false, gLimit(ac));
  ensureMode(world, ac, b, 'rws');
}

// ── defend

function defend(world: World, ac: Aircraft, b: Brain, th: Threat): void {
  const now = world.t;
  const sk = skillOf(ac);
  const shooter = th.emitter;
  // SARH: notch the illuminating radar. ARH/IR: notch the missile itself.
  const threatPos = th.kind === 'sarh' && shooter && shooter.alive ? shooter.pos : th.pos;
  const B = bearingTo(ac.pos, threatPos);
  const prev = stateOf(ac) === 'defend' ? b.mem.defend : null;
  let d: DefendEpisode;
  if (!prev) {
    const mode = pickDefence(world, ac, th, sk);
    const hR = B - Math.PI / 2; // threat at 3 o'clock
    const hL = B + Math.PI / 2; // threat at 9 o'clock
    const side: 1 | -1 = Math.abs(wrapPi(hR - ac.heading)) <= Math.abs(wrapPi(hL - ac.heading)) ? 1 : -1;
    const floor = world.groundAlt + (skillName(ac) === 'ace' ? 900 : 1500);
    d = {
      key: th.key, missileId: th.missile?.id ?? null, shooterId: shooter?.id ?? null, kind: th.kind, mode, side,
      err: (world.rand() * 2 - 1) * sk.notchErrDeg * D2R,
      alt: Math.max(floor, ac.pos.y - sk.notchDescend),
      startedAt: now, lastSeen: now, burstLeft: 0, nextBurst: now, chaffUsed: 0, flaresUsed: 0,
    };
    const abandoned = supportNeeds(world, ac).some(m => m.guidance === 'sarh');
    b.mem.defend = d;
    setState(world, ac, 'defend', defendText(world, ac, b, d, th, B, abandoned), threatExtra(th));
  } else {
    d = prev;
    d.lastSeen = now;
    if (d.key !== th.key) {
      // Another missile is now the most urgent: keep turning the same way, speak only if the plan changes.
      d.key = th.key;
      d.chaffUsed = 0;
      d.missileId = th.missile?.id ?? null;
      d.shooterId = shooter?.id ?? null;
      d.kind = th.kind;
      const mode = pickDefence(world, ac, th, sk);
      if (mode !== d.mode && !(d.mode === 'notch' && mode === 'drag')) {
        d.mode = mode;
        say(world, ac, 'defend', defendText(world, ac, b, d, th, B, false), threatExtra(th));
      }
    }
  }
  // Drag turns into a notch when the missile keeps coming.
  if (d.mode === 'drag' && th.range < 14_000 && th.closure > 350) {
    d.mode = 'notch';
    say(world, ac, 'defend', `${ac.callsign} cannot outrun it and turns to notch ${compass(B - d.side * Math.PI / 2)}, dropping chaff`, threatExtra(th));
  }
  const maxG = gLimit(ac, 1);
  if (d.mode === 'drag') {
    const alt = Math.max(world.groundAlt + 1500, Math.min(ac.pos.y, d.alt + 2000));
    fly(world, ac, B + Math.PI, alt, mps(ac, 1.4, alt), true, maxG);
  } else if (d.mode === 'notch') {
    const h = B - d.side * Math.PI / 2 + d.err;
    fly(world, ac, h, d.alt, mps(ac, 0.85, d.alt), false, maxG);
  } else {
    const h = B - d.side * Math.PI / 2 + d.err;
    fly(world, ac, h, ac.pos.y, mps(ac, 0.8), false, gLimit(ac, 2));
  }
  // Countermeasures.
  const off = Math.abs(relBearing(ac.pos, ac.heading, threatPos));
  if (d.kind === 'ir') {
    if (th.range < 7000 && now >= d.nextBurst) {
      if (world.flare(ac.id)) d.flaresUsed++;
      if (world.flare(ac.id)) d.flaresUsed++;
      d.nextBurst = now + 0.8;
    }
  } else if (d.mode === 'notch') {
    const inWindow = off > 60 * D2R && off < 125 * D2R;
    // Endgame only: chaff steals a seeker that is looking (SARH inside 20 km, ARH active inside 15 km).
    const close = th.kind === 'sarh' ? th.range < 20_000 : (th.missile?.guidance === 'active' && th.range < 15_000) || th.range < 8000;
    if (inWindow && close && d.chaffUsed < sk.chaffPerThreat) {
      if (d.burstLeft > 0) {
        if (world.chaff(ac.id)) { d.burstLeft--; d.chaffUsed++; }
      } else if (now >= d.nextBurst) {
        d.burstLeft = sk.chaffBurst;
        d.nextBurst = now + sk.chaffEvery;
        if (world.chaff(ac.id)) { d.burstLeft--; d.chaffUsed++; }
      }
    }
  }
}

/** Fields for a defend call: the shooter, the missile (when known) and its range. */
function threatExtra(th: Threat): SayExtra {
  return { targetId: th.emitter?.id ?? th.missile?.shooterId ?? null, missileId: th.missile?.id ?? null, missile: th.missile?.type ?? null, range: th.range };
}

function pickDefence(world: World, ac: Aircraft, th: Threat, sk: AiSkillProfile): 'notch' | 'drag' | 'break' {
  if (th.kind === 'ir') return 'break';
  if (th.kind === 'sarh') return th.range > sk.dragKm * 1000 * 1.3 ? 'drag' : 'notch';
  // ARH. Drag while far and not yet active; also when above the missile (no ground behind us:
  // an active seeker's notch needs clutter, research: "if you are above the missile, drag").
  const m = th.missile;
  if (m && m.guidance !== 'active' && th.range > sk.dragKm * 1000) return 'drag';
  if (m && ac.pos.y > m.pos.y + 2000 && th.range > 18_000 && skillName(ac) !== 'rookie') return 'drag';
  return 'notch';
}

function defendText(world: World, ac: Aircraft, b: Brain, d: DefendEpisode, th: Threat, B: number, abandoned: boolean): string {
  const name = th.missile ? mName(th.missile.type) : th.kind === 'sarh' ? 'radar missile' : 'missile';
  const by = th.missile ? whose(world.get(th.missile.shooterId)) : whose(th.emitter);
  const r = fmtRange(th.range, b.cfg.units);
  const tail = abandoned ? ', abandoning its own shot' : '';
  if (d.mode === 'break') return `${ac.callsign} breaks against ${by} ${name}, dropping flares${tail}`;
  if (d.mode === 'drag') return `${ac.callsign} turns cold to drag ${by} ${name}, ${r} out${tail}`;
  const dir = compass(B - d.side * Math.PI / 2 + d.err);
  const cm = ac.chaff > 0 ? ', dropping chaff' : ', out of chaff';
  const against = th.kind === 'sarh' && th.emitter ? `${whose(th.emitter)} radar` : `${by} ${name}`;
  return `${ac.callsign} notches ${dir} against ${against}${cm}${tail}`;
}

function endDefend(world: World, ac: Aircraft, b: Brain): void {
  const d = b.mem.defend;
  b.mem.defend = null;
  const m = d?.missileId ? world.missiles.get(d.missileId) : undefined;
  let what = `${ac.callsign} is no longer threatened`;
  if (m && m.result?.kind === 'miss') what = `${ac.callsign} defeated the ${mName(m.type)}: it ${MISS_WORDS[m.result.reason as MissReason] ?? 'missed'}`;
  else if (m && m.alive && m.guidance === 'ballistic') what = `${ac.callsign} broke the lock: the ${mName(m.type)} is unguided`;
  const skill = skillName(ac);
  const x: SayExtra = { targetId: d?.shooterId ?? null, missileId: d?.missileId ?? null, missile: m?.type ?? null };
  if (b.cfg.script) {
    setState(world, ac, 'patrol', `${what}. It resumes its track`, x);
    return;
  }
  if (!missilesLeft(ac, b)) {
    setState(world, ac, 'rtb', `${what}. Out of missiles, it heads home`, x);
    return;
  }
  const k = chooseTarget(world, ac, b);
  if (k && (skill === 'ace' || skill === 'veteran') && b.cfg.recommit) {
    b.mem.targetId = k.id;
    setState(world, ac, 'commit', `${what}. It recommits on ${who(world.get(k.id))}`, { ...x, ...contactExtra(world, ac, k), missile: x.missile });
    return;
  }
  const from = d?.shooterId ? world.get(d.shooterId) ?? null : null;
  goPump(world, ac, b, from, `${what}. It extends cold before recommitting`, skillOf(ac).pumpS * 0.6, x);
}

// ── scripted flight

function scriptRef(world: World, ac: Aircraft, s: AiScript): Aircraft | null {
  if (s.refId) {
    const r = world.get(s.refId);
    return r && r.alive ? r : null;
  }
  let best: Aircraft | null = null;
  let bestR = Infinity;
  for (const o of world.enemiesOf(ac)) {
    const r = ac.pos.distanceTo(o.pos);
    if (r < bestR) { bestR = r; best = o; }
  }
  return best;
}

function scriptText(ac: Aircraft, s: AiScript, ref: Aircraft | null): string {
  const r = who(ref);
  switch (s.maneuver) {
    case 'straight': return `${ac.callsign} holds a straight course`;
    case 'hot': return `${ac.callsign} turns hot toward ${r}`;
    case 'cold': return `${ac.callsign} turns cold, away from ${r}`;
    case 'beam': return `${ac.callsign} turns to beam ${r}: zero closing speed, into the notch`;
    case 'crank': return `${ac.callsign} cranks off ${r}`;
    case 'weave': return `${ac.callsign} weaves gently`;
  }
}

function flyScript(world: World, ac: Aircraft, b: Brain, s: AiScript): void {
  const now = world.t;
  if (b.mem.scriptT0 < 0) {
    b.mem.scriptT0 = now;
    const ref = scriptRef(world, ac, s);
    if (!s.side && ref && (s.maneuver === 'beam' || s.maneuver === 'crank')) {
      const B = bearingTo(ac.pos, ref.pos);
      b.mem.scriptSide = Math.abs(wrapPi(B - Math.PI / 2 - ac.heading)) <= Math.abs(wrapPi(B + Math.PI / 2 - ac.heading)) ? 1 : -1;
      if (s.maneuver === 'crank') b.mem.scriptSide = relBearing(ac.pos, ac.heading, ref.pos) >= 0 ? 1 : -1;
    }
  }
  if (ac.ai && ac.ai.state !== 'patrol') { ac.ai.state = 'patrol'; ac.ai.stateSince = now; }
  if (hasMode(ac, b.cfg.scriptRadar)) ensureMode(world, ac, b, b.cfg.scriptRadar);
  if (ac.radar.mode === 'rws' || ac.radar.mode === 'tws') pointRadar(world, ac, b, null);
  const alt = s.altitude ?? ac.cmd.altitude;
  const speed = s.speed ?? ac.cmd.speed;
  const ref = scriptRef(world, ac, s);
  let h = b.mem.scriptHeading;
  if (ref) {
    const B = bearingTo(ac.pos, ref.pos);
    switch (s.maneuver) {
      case 'hot': h = B; break;
      case 'cold': h = B + Math.PI; break;
      case 'beam': h = B - b.mem.scriptSide * Math.PI / 2; break;
      case 'crank': h = B - b.mem.scriptSide * 50 * D2R; break;
      default: break;
    }
  }
  if (s.maneuver === 'weave') {
    const amp = (s.weaveDeg ?? 30) * D2R;
    const per = s.weavePeriod ?? 40;
    h = b.mem.scriptHeading + amp * Math.sin((2 * Math.PI * (now - b.mem.scriptT0)) / per);
  }
  fly(world, ac, h, alt, speed, false, Math.min(spec(ac).perf.maxG, 5));
}
