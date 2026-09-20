/**
 * [OWNER: sim-ai] Ready-made scenario builders used by the pages. Each builder spawns into a FRESH
 * World (ids are fixed: 'player', 'wingman', 'bandit1'…) and returns the ids and handles the page needs.
 *
 * Frame: the player starts at x = 0, z = 0 heading north (0 rad); "ahead" is −z.
 * The player is always side 'blue', controller 'player' (the page flies it through me.cmd).
 * Opponents are controller 'ai' (see ai.ts): tactical AI for engagements, scripted flight for drills.
 */
import type { World } from './world';
import type { AiSkill, EntityId, Missile } from './types';
import type { AircraftId, MissileId, RadarModeId } from '../data/types';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import { speedFromMach } from './atmosphere';
import { D2R, clamp, wrap2Pi } from './math';
import { configureAi, setScript, type AiConfig, type AiScript, type ScriptManeuver } from './ai';

// ───────────────────────────────────────────────────────────── defaults per jet

/** East = Russian/Chinese-built, West = the rest. Used to pick sensible opponents. */
export type Bloc = 'east' | 'west';
export function blocOf(type: AircraftId): Bloc {
  const n = AIRCRAFT[type].nation;
  return n === 'ru' || n === 'cn' ? 'east' : 'west';
}

const ADVERSARY: Record<AircraftId, AircraftId> = {
  su27: 'f15c', su33: 'fa18c', j11a: 'f16c', mig29s: 'f16c',
  f15c: 'su27', fa18c: 'mig29s', f16c: 'j11a', f14b: 'su27', jf17: 'mig29s', m2000c: 'mig29s',
};

/** A sensible default opponent for the player's jet (Flanker/Fulcrum for Western jets, Eagle/Viper/Hornet for Russian ones). */
export function defaultAdversary(player: AircraftId): AircraftId {
  return ADVERSARY[player];
}

/** A sensible default threat missile for defence drills: the classic SARH vs Western jets, the AMRAAM vs Eastern jets. */
export function defaultThreatMissile(player: AircraftId): MissileId {
  return blocOf(player) === 'west' ? 'r27er' : 'aim120c';
}

/** Every jet that carries `missile` in DCS, opponents of `player` first. */
export function carriersOf(missile: MissileId, player?: AircraftId): AircraftId[] {
  const all = AIRCRAFT_ORDER.filter(id => AIRCRAFT[id].missiles.includes(missile));
  if (!player) return all;
  const bloc = blocOf(player);
  const score = (id: AircraftId) => (id === player ? 2 : blocOf(id) === bloc ? 1 : 0);
  return [...all].sort((a, b) => score(a) - score(b));
}

/** Sensible cruise altitude (m), Mach and TAS (m/s) for a jet at the start of a BVR scenario. */
export function cruiseFor(type: AircraftId): { alt: number; mach: number; speed: number } {
  const p = AIRCRAFT[type].perf;
  const alt = Math.round(clamp(p.ceilingFt * 0.3048 * 0.6, 7500, 10500) / 500) * 500;
  const mach = clamp(p.cruiseMach + 0.05, 0.8, 0.95);
  return { alt, mach, speed: speedFromMach(mach, alt) };
}

// ───────────────────────────────────────────────────────────── shared options

export interface ScenarioCommon {
  /** Units for the AI's event text (default: the player's jet units). */
  units?: 'metric' | 'imperial';
  /** Player start altitude (m) and Mach. Default: cruiseFor(playerType). */
  playerAlt?: number;
  playerMach?: number;
  /** Player callsign shown on labels (default 'You'). */
  playerCallsign?: string;
  /** Override the player's loadout. */
  playerStores?: Partial<Record<MissileId, number>>;
  /** Player's radar mode at start (default RWS). */
  playerRadarMode?: RadarModeId;
}

export const PLAYER_ID = 'player';
export const WINGMAN_ID = 'wingman';
export const banditId = (n: number) => `bandit${n}`;

interface Placement { x: number; y: number; z: number }

/** True bearing (rad, 0..2π) from a to b, horizontal plane. */
function bearingXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return wrap2Pi(Math.atan2(b.x - a.x, -(b.z - a.z)));
}

/** Point at `range` m and true bearing `bearing` (rad) from (x, z), at altitude `alt`. */
function place(from: { x: number; z: number }, bearing: number, range: number, alt: number): Placement {
  return { x: from.x + Math.sin(bearing) * range, y: alt, z: from.z - Math.cos(bearing) * range };
}

function spawnPlayer(world: World, type: AircraftId, o: ScenarioCommon, heading = 0) {
  const c = cruiseFor(type);
  const alt = o.playerAlt ?? c.alt;
  const speed = speedFromMach(o.playerMach ?? c.mach, alt);
  return world.spawnAircraft({
    id: PLAYER_ID, side: 'blue', type, controller: 'player', callsign: o.playerCallsign ?? 'You',
    pos: { x: 0, y: alt, z: 0 }, heading, speed, stores: o.playerStores, radarMode: o.playerRadarMode ?? AIRCRAFT[type].radar.bvrStartMode,
  });
}

function unitsFor(playerType: AircraftId, o: ScenarioCommon): 'metric' | 'imperial' {
  return o.units ?? AIRCRAFT[playerType].units;
}

// ───────────────────────────────────────────────────────────── scripted manoeuvres

/** Give a scripted aircraft a new manoeuvre (drill buttons: Notch → 'beam', Turn hot → 'hot'). */
export function setManeuver(world: World, id: EntityId, maneuver: ScriptManeuver, extra: Omit<AiScript, 'maneuver'> = {}, announce = true): void {
  const ac = world.get(id);
  if (!ac || !ac.ai) return;
  const cur = ac.ai.data.brain ? (ac.ai.data.brain as { cfg: AiConfig }).cfg.script : null;
  // Keep the drill's altitude/speed/reference unless the caller changes them.
  const keep: Omit<AiScript, 'maneuver'> = cur ? { refId: cur.refId, altitude: cur.altitude, speed: cur.speed } : {};
  const heading = maneuver === 'straight' || maneuver === 'weave' ? ac.heading : undefined;
  setScript(world, id, { ...keep, heading, ...extra, maneuver }, announce);
}

/** Hand a scripted aircraft over to the full tactical AI (it will commit, shoot and defend). */
export function releaseToAi(world: World, id: EntityId, cfg: Partial<AiConfig> = {}): void {
  configureAi(world, id, { holdFire: false, evade: true, ...cfg });
  setScript(world, id, null, true);
}

// ───────────────────────────────────────────────────────────── engagements (sortie)

export interface EngagementOptions extends ScenarioCommon {
  /** Start separation, m (default 100 km). */
  range?: number;
  /** Bandit group bearing off the player's nose, deg (+ right, default 0 = dead ahead, head-on). */
  offsetDeg?: number;
  /** Bandit altitude (m) and Mach. Default: cruiseFor(enemyType). */
  enemyAlt?: number;
  enemyMach?: number;
  enemyStores?: Partial<Record<MissileId, number>>;
  /** Bandit pair formation (default 'abreast', 5 km apart). */
  formation?: 'abreast' | 'trail';
  /** AI gets a GCI/AWACS picture for steering (default true, as in most DCS missions). */
  gci?: boolean;
  /** AI never shoots (default false). */
  holdFire?: boolean;
  /** AI defends against missiles (default true). */
  evade?: boolean;
  /** 2v2: the player's AI wingman type and skill (default: same jet, 'veteran'). */
  wingmanType?: AircraftId;
  wingmanSkill?: AiSkill;
}

export interface Engagement {
  playerId: EntityId;
  wingmanId: EntityId | null;
  /** Blue AI aircraft (the wingman), not the player. */
  friendIds: EntityId[];
  enemyIds: EntityId[];
  enemyType: AircraftId;
  skill: AiSkill;
  /** Start separation actually used, m. */
  range: number;
}

function engagement(world: World, playerType: AircraftId, enemyType: AircraftId, skill: AiSkill, n: 1 | 2, wing: boolean, o: EngagementOptions): Engagement {
  const units = unitsFor(playerType, o);
  const range = o.range ?? 100_000;
  const player = spawnPlayer(world, playerType, o);
  let wingmanId: EntityId | null = null;
  if (wing) {
    const wt = o.wingmanType ?? playerType;
    const wc = cruiseFor(wt);
    const wp = place({ x: 0, z: 0 }, 90 * D2R, 3000, player.pos.y);
    const w = world.spawnAircraft({
      id: WINGMAN_ID, side: 'blue', type: wt, controller: 'ai', skill: o.wingmanSkill ?? 'veteran', callsign: 'Wingman',
      pos: { x: wp.x, y: wp.y, z: wp.z + 600 }, heading: 0, speed: player.vel.length() || wc.speed,
    });
    configureAi(world, w.id, { leaderId: player.id, formationSide: 1, gci: o.gci ?? true, units, holdFire: false, evade: true });
    wingmanId = w.id;
  }
  const ec = cruiseFor(enemyType);
  const alt = o.enemyAlt ?? ec.alt;
  const speed = speedFromMach(o.enemyMach ?? ec.mach, alt);
  const bearing = (o.offsetDeg ?? 0) * D2R;
  const center = place({ x: 0, z: 0 }, bearing, range, alt);
  const heading = bearingXZ(center, { x: 0, z: 0 });
  const enemyIds: EntityId[] = [];
  for (let i = 0; i < n; i++) {
    let p = center;
    if (n === 2) {
      if ((o.formation ?? 'abreast') === 'abreast') p = place(center, heading + (i === 0 ? -1 : 1) * (Math.PI / 2), 2500, alt + (i ? 300 : 0));
      else p = place(center, heading + Math.PI, i * 8000, alt + (i ? 300 : 0));
    }
    const id = banditId(i + 1);
    world.spawnAircraft({ id, side: 'red', type: enemyType, controller: 'ai', skill, callsign: `Bandit-${i + 1}`, pos: p, heading, speed, stores: o.enemyStores });
    configureAi(world, id, {
      gci: o.gci ?? true, units, holdFire: o.holdFire ?? false, evade: o.evade ?? true,
      leaderId: i > 0 ? banditId(1) : null, formationSide: -1,
    });
    enemyIds.push(id);
  }
  return { playerId: player.id, wingmanId, friendIds: wingmanId ? [wingmanId] : [], enemyIds, enemyType, skill, range };
}


/** 1v1 at ~100 km head-on. */
export function duel(world: World, playerType: AircraftId, enemyType: AircraftId = defaultAdversary(playerType), skill: AiSkill = 'regular', opts: EngagementOptions = {}): Engagement {
  return engagement(world, playerType, enemyType, skill, 1, false, opts);
}

/** 1v2: you against a pair (line abreast 5 km, or trail 8 km). */
export function pair(world: World, playerType: AircraftId, enemyType: AircraftId = defaultAdversary(playerType), skill: AiSkill = 'regular', opts: EngagementOptions = {}): Engagement {
  return engagement(world, playerType, enemyType, skill, 2, false, opts);
}

/** 2v2: you and an AI wingman (3 km off your right wing) against a pair. */
export function twoVTwo(world: World, playerType: AircraftId, enemyType: AircraftId = defaultAdversary(playerType), skill: AiSkill = 'regular', opts: EngagementOptions = {}): Engagement {
  return engagement(world, playerType, enemyType, skill, 2, true, opts);
}

// ───────────────────────────────────────────────────────────── TWS drill

export interface TwsDrillOptions extends ScenarioCommon {
  enemyType?: AircraftId;
  /** Mean range of the group, m (default 80 km; the four spread over ~70–100 km). */
  range?: number;
  /** Lateral spread multiplier (default 1 = about ±22 km). */
  spread?: number;
  /** How the bandits fly (default 'straight', i.e. hot and parallel, like the original lesson). */
  maneuver?: ScriptManeuver;
  banditMach?: number;
  /** Bandit radar (default 'rws': they search, so your RWR shows them). */
  banditRadar?: RadarModeId;
  /** Bandits defend when a missile goes active (default false: they only notch when you press Notch). */
  evade?: boolean;
  skill?: AiSkill;
}

export interface TwsDrill {
  playerId: EntityId;
  banditIds: EntityId[];
  enemyType: AircraftId;
  /** Per-bandit manoeuvre (Notch toggle → 'beam', back → 'hot' or 'straight'). */
  setManeuver(id: EntityId, maneuver: ScriptManeuver): void;
}

/** Offsets from the original lesson: x km right, km ahead, altitude offset km. */
const TWS_SEED: [number, number, number][] = [[-21, 78, 0.6], [-6, 72, -1], [8, 84, 2], [22, 76, -0.4]];

/** Four scripted bandits in a spread at 70–100 km, flying hot, slightly different altitudes. */
export function twsDrill(world: World, playerType: AircraftId, opts: TwsDrillOptions = {}): TwsDrill {
  const units = unitsFor(playerType, opts);
  const player = spawnPlayer(world, playerType, opts);
  const enemyType = opts.enemyType ?? defaultAdversary(playerType);
  const scale = (opts.range ?? 80_000) / 77_500;
  const spread = opts.spread ?? 1;
  const banditIds: EntityId[] = [];
  TWS_SEED.forEach(([x, ahead, dAlt], i) => {
    const alt = Math.max(1000, player.pos.y + dAlt * 1000);
    const speed = speedFromMach(opts.banditMach ?? cruiseFor(enemyType).mach, alt);
    const id = banditId(i + 1);
    world.spawnAircraft({
      id, side: 'red', type: enemyType, controller: 'ai', skill: opts.skill ?? 'regular', callsign: `Bandit-${i + 1}`,
      pos: { x: x * 1000 * scale * spread, y: alt, z: -ahead * 1000 * scale }, heading: Math.PI, speed,
    });
    configureAi(world, id, {
      units, holdFire: true, evade: opts.evade ?? false, targetId: player.id,
      scriptRadar: opts.banditRadar ?? 'rws',
      script: { maneuver: opts.maneuver ?? 'straight', refId: player.id, heading: Math.PI, altitude: alt, speed },
    });
    banditIds.push(id);
  });
  return {
    playerId: player.id, banditIds, enemyType,
    setManeuver: (id, m) => setManeuver(world, id, m, { refId: player.id }),
  };
}

// ───────────────────────────────────────────────────────────── defence drill

export interface DefenseGeometry {
  /** Launch range, m. The shooter fires when the range first drops to this (or as soon as the launch rules allow after it). */
  range: number;
  /** Your aspect as the shooter sees you: 0 = you fly straight at it (hot), 90 = beam, 180 = cold. Default 0. */
  aspectDeg?: number;
  /** For a non-zero aspect: the shooter is off your right or left side (default right). */
  side?: 'left' | 'right';
  shooterAlt?: number;
  shooterMach?: number;
  playerAlt?: number;
  playerMach?: number;
  /** Launch method: 'auto' = the shooter jet's real method; 'stt' forces a lock (lock + launch warning);
   *  'tws' a silent TWS shot where the jet allows it. */
  mode?: 'auto' | 'stt' | 'tws';
}

export interface DefenseDrillOptions extends ScenarioCommon {
  /** Jet that fires the threat missile (default: an opponent jet that carries it). */
  shooterType?: AircraftId;
  /** Shooter skill: how well it cranks and supports (default 'veteran'). */
  skill?: AiSkill;
  /** Missiles it fires (default 1). */
  shots?: number;
}

export interface DefenseDrill {
  playerId: EntityId;
  shooterId: EntityId;
  shooterType: AircraftId;
  threat: MissileId;
  /** Requested launch range, m. The actual one is in the 'launch' SimEvent (range). */
  launchRange: number;
  /** How it will launch: 'stt' (lock + launch warning; SARH needs it to impact) or 'tws' (no warning until pitbull). */
  method: 'stt' | 'tws';
  /** The shooter's first missile once fired (alive or not), else null. */
  missile(): Missile | null;
}

/** A scripted shooter locks you up, fires `threat` at the chosen range/aspect and supports it correctly. */
export function defenseDrill(world: World, playerType: AircraftId, threat: MissileId = defaultThreatMissile(playerType), geometry: DefenseGeometry, opts: DefenseDrillOptions = {}): DefenseDrill {
  const units = unitsFor(playerType, opts);
  const shooterType = opts.shooterType ?? carriersOf(threat, playerType)[0] ?? defaultAdversary(playerType);
  const player = spawnPlayer(world, playerType, { ...opts, playerAlt: geometry.playerAlt ?? opts.playerAlt, playerMach: geometry.playerMach ?? opts.playerMach });
  const sc = cruiseFor(shooterType);
  const sAlt = geometry.shooterAlt ?? sc.alt;
  const sSpeed = speedFromMach(geometry.shooterMach ?? sc.mach, sAlt);
  const aspect = clamp(geometry.aspectDeg ?? 0, 0, 180) * D2R;
  const sideSign = geometry.side === 'left' ? -1 : 1;
  const pSpeed = player.vel.length();
  const closure = sSpeed + pSpeed * Math.cos(aspect);
  const lead = closure > 50 ? closure * 8 : 0; // ~8 s to find, track and lock before the shot
  const bearing = sideSign * aspect;           // shooter bearing off the player's nose (player heads north)
  const pos = place({ x: 0, z: 0 }, bearing, geometry.range + lead, sAlt);
  const heading = wrap2Pi(bearing + Math.PI);
  const spec = AIRCRAFT[shooterType];
  const tws = spec.radar.tws;
  const twsOk = !!tws && tws.launchFromTws && spec.radar.modes.includes('tws');
  const seeker = MISSILES[threat].seeker;
  const mode = geometry.mode ?? 'auto';
  const method: 'stt' | 'tws' = seeker === 'arh' && twsOk && mode !== 'stt' ? 'tws' : 'stt';
  const shots = opts.shots ?? 1;
  const id = 'shooter';
  world.spawnAircraft({
    id, side: 'red', type: shooterType, controller: 'ai', skill: opts.skill ?? 'veteran', callsign: 'Bandit-1',
    pos, heading, speed: sSpeed, stores: { [threat]: Math.max(1, shots) },
    radarMode: twsOk ? 'tws' : 'rws',
  });
  configureAi(world, id, {
    units, gci: true, evade: false, holdFire: false, recommit: false, targetId: player.id,
    fireAtRange: geometry.range, fireNoLaterThan: world.t + 14, shots, launchMode: method,
    maxInFlightPerTarget: 1,
  });
  return {
    playerId: player.id, shooterId: id, shooterType, threat, launchRange: geometry.range, method,
    missile: () => {
      for (const m of world.missiles.values()) if (m.shooterId === id) return m;
      return null;
    },
  };
}

// ───────────────────────────────────────────────────────────── radar lab

export interface RadarLabTarget {
  /** Range from the player, m. */
  range: number;
  /** Bearing off the player's nose, deg (+ right). Default 0. */
  bearingDeg?: number;
  /** Altitude, m. */
  alt: number;
  /** Target aspect: 0 = flying at you (hot) … 90 = beam … 180 = cold. Default 0. */
  aspectDeg?: number;
  /** Which way it is turned off hot for a non-zero aspect (default 'right'). */
  turn?: 'left' | 'right';
  /** TAS m/s. Default Mach 0.85 at its altitude. */
  speed?: number;
  /** Default: the player's usual adversary. */
  type?: AircraftId;
  /** Scripted flight (default 'straight'). */
  maneuver?: ScriptManeuver;
  /** Target radar (default 'off': silent). */
  radar?: RadarModeId;
  callsign?: string;
}

export interface RadarLabOptions extends ScenarioCommon {
  /** Player heading (rad, default 0 = north). */
  playerHeading?: number;
}

export interface RadarLab {
  playerId: EntityId;
  targetIds: EntityId[];
  setManeuver(id: EntityId, maneuver: ScriptManeuver): void;
}

/** Targets at chosen range/altitude/aspect flying scripted paths, for the radar lab. */
export function radarLab(world: World, playerType: AircraftId, targets: RadarLabTarget[], opts: RadarLabOptions = {}): RadarLab {
  const units = unitsFor(playerType, opts);
  const ph = opts.playerHeading ?? 0;
  const player = spawnPlayer(world, playerType, { ...opts, playerAlt: opts.playerAlt ?? 9000 }, ph);
  const targetIds: EntityId[] = [];
  targets.forEach((t, i) => {
    const type = t.type ?? defaultAdversary(playerType);
    const pos = place({ x: player.pos.x, z: player.pos.z }, ph + (t.bearingDeg ?? 0) * D2R, t.range, t.alt);
    const toPlayer = bearingXZ(pos, player.pos);
    const heading = wrap2Pi(toPlayer + (t.turn === 'left' ? -1 : 1) * clamp(t.aspectDeg ?? 0, 0, 180) * D2R);
    const speed = t.speed ?? speedFromMach(0.85, t.alt);
    const id = `target${i + 1}`;
    world.spawnAircraft({
      id, side: 'red', type, controller: 'ai', skill: 'regular', callsign: t.callsign ?? `Bandit-${i + 1}`,
      pos, heading, speed, stores: {},
    });
    configureAi(world, id, {
      units, holdFire: true, evade: false, scriptRadar: t.radar ?? 'off',
      script: { maneuver: t.maneuver ?? 'straight', refId: player.id, heading, altitude: t.alt, speed },
    });
    targetIds.push(id);
  });
  return {
    playerId: player.id, targetIds,
    setManeuver: (id, m) => setManeuver(world, id, m, { refId: player.id }),
  };
}
