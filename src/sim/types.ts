/**
 * Simulation contract. Shared by every sim module, the renderer and the pages.
 *
 * Frame & units (SI everywhere inside the sim):
 *   x = east, y = up (altitude above sea level), z = SOUTH  →  north is -z.
 *   metres, seconds, m/s, radians.
 *   heading: radians clockwise from north, 0..2π. direction = (sin h, 0, -cos h).
 *   bearings relative to a nose: -π..π, positive = right.
 * This is also three.js' frame (y-up, right-handed); the renderer only rescales (1 unit = 1 km).
 */
import type { Vector3 } from 'three';
import type { AgWeaponId, AircraftId, FighterId, GroundUnitKind, MissileId, RadarModeId, RwrSymbol, SamId } from '../data/types';

export type { GroundUnitKind };

export type Side = 'blue' | 'red';
export type EntityId = string;
export type AiSkill = 'rookie' | 'regular' | 'veteran' | 'ace';
/** Pilot-selected Phoenix launch behavior in the DCS module. */
export type PhoenixLaunchMode = 'tws' | 'pd-stt' | 'p-stt' | 'ph-act';

/** Tactical autopilot demand. Players and AI both fly through this (it is a tactics trainer, not a flight sim). */
export interface FlightCommand {
  heading: number;      // rad, desired heading
  altitude: number;     // m, desired altitude
  speed: number;        // m/s TAS, desired speed (autothrottle)
  maxG: number;         // load-factor limit used for turns and pull-ups
  afterburner: boolean; // allow max thrust (burns faster, accelerates harder)
}

export interface RadarBrick {
  targetId: EntityId;   // ground truth (UI must only use it for picking, never to reveal truth)
  t: number;            // time of the echo
  pos: Vector3;         // measured world position at echo time
  az: number;           // rad relative to nose at echo time
  el: number;           // rad relative to horizon
  range: number;        // m
  closure: number;      // m/s, positive = closing
}

export interface TrackFile {
  /** Stable display label, e.g. 'T1'. */
  label: string;
  targetId: EntityId;   // one track per real target (no false tracks in this trainer)
  pos: Vector3;         // estimated position (extrapolated between hits)
  vel: Vector3;         // estimated velocity (zero until firm)
  firstHit: number;
  lastHit: number;
  hits: number;
  firm: boolean;        // >= 2 hits: velocity known, usable for guidance
  coasting: boolean;    // missed an expected revisit, being extrapolated
}

export interface RadarState {
  mode: RadarModeId;
  /** Explicit MiG-29S two-target TWS mode; ordinary TWS remains single-target. */
  snp2: boolean;
  /** Optional Phoenix launch override; otherwise derived from the current radar mode. */
  phoenixLaunchMode?: PhoenixLaunchMode;
  /** FC3 range-angle aiming input in metres, independent of the display cursor; null on other radars. */
  expectedRange: number | null;
  /** Scan volume, all relative to the nose / horizon. */
  azCenter: number;     // rad
  azHalf: number;       // rad
  elCenter: number;     // rad (antenna elevation / scan-zone centre)
  bars: number;
  rangeScale: number;   // m, current display range
  /** Antenna position right now. */
  beamAz: number;       // rad rel nose
  beamEl: number;       // rad rel horizon
  sweepDir: 1 | -1;
  bar: number;          // 0..bars-1
  frameTime: number;    // s, time to cover the whole pattern once (revisit time)
  bricks: RadarBrick[]; // RWS returns, aged out by the radar module
  tracks: TrackFile[];  // TWS / STT track files
  /** TWS designations, target ids in priority order. [0] is the primary (L&S / hot target). */
  designated: EntityId[];
  /** STT: the locked target, and how long the lock has been degraded (notch, gimbal, range). */
  stt: { targetId: EntityId | null; lostFor: number };
  /** Cursor on the display (for picking and for scan-centre-follows-cursor jets). */
  cursor: { az: number; range: number };
}

export interface RwrContact {
  emitterId: EntityId;        // aircraft id, SAM site id, or missile id for an active seeker
  /** The sim produces aircraft, 'missile' and SAM sites ('sam-long' / 'sam-medium' / 'sam-short'); trainers may also pass AWACS / unknown emitters. */
  emitterType: RwrSymbol['emitter'];
  missileType?: MissileId;
  state: 'search' | 'lock' | 'launch' | 'missile';
  bearing: number;            // rad rel own nose, + right
  elevation: number;          // rad rel own horizon
  strength: number;           // 0..1, stronger when closer / locked
  firstSeen: number;
  lastSeen: number;
}

export interface AiMemory {
  skill: AiSkill;
  state: 'patrol' | 'commit' | 'attack' | 'support' | 'defend' | 'pump' | 'merge' | 'rtb';
  stateSince: number;
  /** Free-form per-behaviour memory owned by ai.ts. */
  data: Record<string, unknown>;
}

export interface Aircraft {
  kind: 'aircraft';
  id: EntityId;
  side: Side;
  type: AircraftId;
  callsign: string;
  /** 'player' and 'script' are flown by the page through `cmd` (no AI logic runs); 'ai' runs ai.ts. */
  controller: 'player' | 'ai' | 'script';
  pos: Vector3;
  vel: Vector3;
  heading: number;
  pitch: number;
  roll: number;
  g: number;
  /** Scenario-level jammer flag for documented mode restrictions; no EW propagation model. */
  jamming: boolean;
  alive: boolean;
  diedAt: number | null;
  killedBy: EntityId | null;
  cmd: FlightCommand;
  radar: RadarState;
  rwr: RwrContact[];
  stores: Partial<Record<MissileId, number>>;
  selectedWeapon: MissileId | null;
  chaff: number;
  flares: number;
  ai: AiMemory | null;
  /** Attack jets only (Su-25T): master mode, A-G stores and the Shkval. Absent on fighters. */
  ag?: AttackState;
}

// ─── Air-to-ground: terrain hook, ground units, Shkval, A-G weapons ──────────────────────────────────────

/** Anything with a world position (m). */
export interface XYZ { x: number; y: number; z: number }

/**
 * Pluggable terrain. The height-map terrain provides it; without one the world is flat at `world.groundAlt`.
 * heightAt: ground height (m) at x, z. lineOfSight: true when the straight segment a→b clears the ground.
 */
export interface TerrainHook {
  heightAt(x: number, z: number): number;
  lineOfSight(a: XYZ, b: XYZ): boolean;
}

/** A ground target. Static unless `speed` > 0 (drives along `heading`, following the terrain). */
export interface GroundUnit {
  id: EntityId;
  /** What it is; drives the default size and hit points. Not an entity discriminator. */
  kind: GroundUnitKind;
  side: Side;
  name: string;
  /** Position on the ground (y = terrain height). */
  pos: Vector3;
  heading: number;      // rad
  speed: number;        // m/s along heading
  /** Size the Shkval target-size rule compares against (m, S1: armour about 10 m, buildings 60 m). */
  sizeM: number;
  /** Trainer hit points (gameplay, not armour data). */
  hp: number;
  alive: boolean;
  diedAt: number | null;
  killedBy: EntityId | null;
  /** Linked SAM site: killing this unit silences the site, and a Kh-58 kill on the site kills this unit. */
  samSiteId?: EntityId;
}

export interface GroundUnitSpawnOptions {
  id?: EntityId;
  kind: GroundUnitKind;
  side: Side;
  name?: string;
  /** y defaults to the terrain height at x, z. */
  pos: { x: number; y?: number; z: number };
  heading?: number;
  speed?: number;
  sizeM?: number;
  hp?: number;
  samSiteId?: EntityId;
}

/** Su-25T master mode: [1] navigation, [7] air-to-ground, [8] fixed reticle. */
export type AgMasterMode = 'nav' | 'ag' | 'fixed';

/** Shkval zoom steps: wide, 8x, 23x (S1). */
export type ShkvalZoom = 1 | 8 | 23;

/** Why the Shkval dropped its lock. */
export type ShkvalLostReason = 'gimbal' | 'terrain' | 'target-dead' | 'off' | 'unlocked';

export interface ShkvalState {
  on: boolean;
  /** КС: manual steering, no lock. АС: auto-tracking, target locked (IT-23M top line, S1). */
  mode: 'КС' | 'АС';
  /** Line of sight relative to the jet: az from the heading (+ right), el from the horizon (+ up), rad. */
  az: number;
  el: number;
  /** Held slew input, −1..1 per axis ([;] [,] [.] [/]); applied each step at the zoom's slew rate. */
  slew: { x: number; y: number };
  /** Ground-stabilised ([Enter]): the sight holds `stabPoint` on the ground as the jet moves. */
  groundStab: boolean;
  stabPoint: Vector3 | null;
  zoom: ShkvalZoom;
  /** TV target frame size (m), 5..60. */
  targetSizeM: number;
  lockedUnitId: EntityId | null;
  lastLost: null | { t: number; unitId: EntityId; why: ShkvalLostReason };
  /** ЛД: laser rangefinder / designator on. */
  laserOn: boolean;
  /** Laser heat in seconds of lasing not yet cooled off (S1 rule, see shkval.ts). */
  laserUsedS: number;
  /** > 0: the laser tripped its limit and is cooling (ЛД flashes); it cannot be switched on. */
  laserCoolS: number;
}

export interface AttackState {
  master: AgMasterMode;
  /** Rounds left per A-G store (the cannon counts rounds). */
  stores: Partial<Record<AgWeaponId, number>>;
  /** Pylons as loaded; counts go down as stores are fired. */
  stations: { station: number; weapon: AgWeaponId | 'l081' | 'r60' | 'r73'; count: number }[];
  selected: AgWeaponId | null;
  /** Station the next round of the selected store comes from (alternates left / right). */
  station: number | null;
  /** Fire pairs where the weapon allows it (Vikhr). */
  pair: boolean;
  /** L-081 Fantasmagoria pod carried (needed for the Kh-58). */
  pod: boolean;
  /** Anti-radiation passive detection ([I]) and the emitter (SAM site id) locked for the Kh-58. */
  arm: { detecting: boolean; emitterId: EntityId | null };
  shkval: ShkvalState;
}

/** Why an A-G weapon missed. */
export type AgMissReason =
  | 'lock-lost' | 'laser-off' | 'gimbal' | 'terrain' | 'emitter-off' | 'target-dead' | 'ground' | 'timeout';

/** An A-G weapon in flight (missile, bomb, rocket or cannon round). Arcade model in agWeapons.ts. */
export interface AgWeapon {
  kind: 'ag-weapon';
  id: EntityId;
  type: AgWeaponId;
  side: Side;
  shooterId: EntityId;
  /** Ground unit or SAM site aimed at (null for unguided fire). */
  targetId: EntityId | null;
  /** Where it is going: the target position, or the ballistic aim point. */
  aimPoint: Vector3;
  pos: Vector3;
  vel: Vector3;
  launchedAt: number;
  alive: boolean;
  /** Still guided; false once a hold-to-impact rule broke (then it falls ballistic and misses). */
  guided: boolean;
  /** Why guidance stopped, once it has. */
  lostWhy: AgMissReason | null;
  timeToImpact: number | null;
  result: null | { kind: 'hit' | 'miss'; reason: AgMissReason | 'hit'; t: number };
}

export type MissileGuidance =
  | 'datalink'   // ARH midcourse, shooter radar is feeding target updates
  | 'inertial'   // ARH midcourse, no updates: flying to the last extrapolated point
  | 'active'     // ARH seeker on (pitbull) and tracking
  | 'sarh'       // semi-active, homing on shooter's illumination (needs STT)
  | 'ir'         // infrared homing
  | 'ballistic'; // no guidance at all

export type MissReason =
  | 'notched' | 'chaff' | 'flare' | 'kinematic' | 'lost-guidance' | 'no-acquisition'
  | 'target-dead' | 'timeout' | 'ground' | 'overshoot';

export interface Missile {
  kind: 'missile';
  id: EntityId;
  type: MissileId;
  side: Side;
  shooterId: EntityId;
  targetId: EntityId | null;     // intended target
  pos: Vector3;
  vel: Vector3;
  launchedAt: number;
  alive: boolean;
  guidance: MissileGuidance;
  /** Radar mode captured at launch, independent of later shooter mode changes. */
  launchRadarMode?: RadarModeId;
  phoenixLaunchMode?: PhoenixLaunchMode;
  /** Midcourse aim: the target estimate the missile flies toward (from datalink or its own extrapolation). */
  aimPos: Vector3;
  aimVel: Vector3;
  /** What the seeker actually tracks: a target id, a chaff/flare id, or null. */
  seekerOn: EntityId | null;
  motorLeft: number;             // s of burn remaining
  mass: number;                  // kg now
  lofting: boolean;
  /** Estimates for displays and coaching (null when not applicable). */
  timeToActive: number | null;   // s until pitbull
  timeToImpact: number | null;   // s
  result: null | { kind: 'hit' | 'miss'; reason: MissReason | 'hit'; t: number };
  /** Minimum distance to intended target so far (m), for AAR. */
  closestApproach: number;
}

/**
 * Radar state of a SAM site, as the player's RWR would read it: 'search' (search radar only), 'track' (track
 * radar holds a target, RWR lock), 'engage' (at least one missile in flight on the target, RWR launch).
 */
export type SamState = 'off' | 'search' | 'track' | 'engage';

/** Why a SAM site lost its track (gameplay rules in sam.ts). */
export type SamLostReason = 'notched' | 'chaff' | 'terrain' | 'horizon' | 'range' | 'target-dead' | 'radar-off';

/** A surface-to-air missile site (search radar, track radar and launchers at one point). Stepped by sam.ts. */
export interface SamSite {
  kind: 'sam';
  id: EntityId;
  side: Side;
  type: SamId;
  callsign: string;
  /** Site position; y is the site's ground height (engagement altitudes are measured from it). */
  pos: Vector3;
  /** Terrain mask height (m above the site): beyond 2 km, targets lower than this are hidden by terrain. */
  maskAltM: number;
  /** Radars emitting. false = silent: no search, no track, no RWR contact. */
  active: boolean;
  /** Track but never launch (drills). */
  holdFire: boolean;
  alive: boolean;
  state: SamState;
  /** Aircraft the track radar holds (null in search). */
  targetId: EntityId | null;
  /** When the current track started (s), null in search. */
  trackSince: number | null;
  /** Seconds the track has been without line of sight / in range (memory before it drops). */
  lostFor: number;
  /** Seconds the target has sat in the Doppler notch. */
  notchFor: number;
  /** Why the last track dropped, and when. */
  lastLost: null | { t: number; targetId: EntityId; why: SamLostReason };
  /** Ready missiles. */
  missiles: number;
  lastLaunch: number;
  /** Aircraft the search radar paints right now (any side, line of sight and in search range). */
  painted: EntityId[];
}

/** A SAM in flight. Arcade model in sam.ts: speed curve, turn cap, steer to intercept on the site's track. */
export interface SamMissile {
  kind: 'sam-missile';
  id: EntityId;
  type: SamId;
  side: Side;
  siteId: EntityId;
  targetId: EntityId | null;
  pos: Vector3;
  vel: Vector3;
  launchedAt: number;
  alive: boolean;
  /** Still guided by the site's track radar. false = ballistic (track lost). */
  guided: boolean;
  motorLeft: number;
  timeToImpact: number | null;
  result: null | { kind: 'hit' | 'miss'; reason: MissReason | 'hit'; t: number };
  closestApproach: number;
}

export interface SamSpawnOptions {
  id?: EntityId;
  side: Side;
  type: SamId;
  callsign?: string;
  /** Site position (m); y defaults to the world ground altitude. */
  pos: { x: number; y?: number; z: number };
  /** Terrain mask height around the site (m), default 0 (flat). */
  maskAltM?: number;
  /** Radar on at spawn (default true). */
  active?: boolean;
  holdFire?: boolean;
  /** Ready missiles (default: the site's gameplay load in sam.ts). */
  missiles?: number;
}

export interface Countermeasure {
  kind: 'chaff' | 'flare';
  id: EntityId;
  ownerId: EntityId;
  pos: Vector3;
  vel: Vector3;
  t0: number;
  life: number;   // s
}

export interface LaunchCheck {
  ok: boolean;
  /** Why not, in pilot words ("Target at 62 km, Rmax 48 km"). Empty when ok. */
  reason: string;
  targetId: EntityId | null;
  missile: MissileId | null;
  range: number | null;          // m
  dlz: Dlz | null;
}

/** Launch zone for one missile, shooter and target geometry. All metres. */
export interface Dlz {
  rmax: number;    // max kinematic range vs a non-manoeuvring target
  rne: number;     // no-escape range: target turning cold at launch still dies
  rmin: number;
  /** Optional F-15C-style marks. */
  rtr?: number;
  rpi?: number;
}

export type SimEvent =
  | { t: number; type: 'spawn'; id: EntityId }
  | { t: number; type: 'launch'; missileId: EntityId; shooterId: EntityId; targetId: EntityId | null; missile: MissileId; range: number | null; radarMode: RadarModeId }
  | { t: number; type: 'pitbull'; missileId: EntityId; targetId: EntityId | null }
  | { t: number; type: 'datalink-lost'; missileId: EntityId; why: string }
  | { t: number; type: 'seeker-lost'; missileId: EntityId; why: MissReason }
  | { t: number; type: 'hit'; missileId: EntityId; targetId: EntityId }
  | { t: number; type: 'miss'; missileId: EntityId; reason: MissReason }
  | { t: number; type: 'kill'; targetId: EntityId; by: EntityId | null }
  | { t: number; type: 'track'; ownerId: EntityId; targetId: EntityId; what: 'new' | 'firm' | 'dropped' }
  | { t: number; type: 'lock'; ownerId: EntityId; targetId: EntityId; what: 'locked' | 'unlocked' | 'broken'; why?: string }
  | { t: number; type: 'rwr'; ownerId: EntityId; emitterId: EntityId; state: RwrContact['state'] }
  | { t: number; type: 'cm'; ownerId: EntityId; what: 'chaff' | 'flare' }
  | { t: number; type: 'ai'; ownerId: EntityId; state: AiMemory['state']; text: string; targetId?: EntityId; missileId?: EntityId; missile?: MissileId; range?: number }
  | { t: number; type: 'sam'; siteId: EntityId; what: 'track' | 'launch' | 'lost'; targetId: EntityId; missileId?: EntityId; why?: SamLostReason; range?: number }
  | { t: number; type: 'shkval-lock'; ownerId: EntityId; unitId: EntityId; range: number }
  | { t: number; type: 'shkval-lost'; ownerId: EntityId; unitId: EntityId; why: ShkvalLostReason }
  | { t: number; type: 'laser'; ownerId: EntityId; on: boolean; why: 'pilot' | 'limit' | 'shkval-off' }
  | { t: number; type: 'ag-launch'; weaponId: EntityId; shooterId: EntityId; targetId: EntityId | null; weapon: AgWeaponId; range: number | null }
  | { t: number; type: 'ag-impact'; weaponId: EntityId; weapon: AgWeaponId; targetId: EntityId | null; pos: [number, number, number]; killed: EntityId[] }
  | { t: number; type: 'ag-miss'; weaponId: EntityId; weapon: AgWeaponId; reason: AgMissReason }
  /** A ground unit or SAM site destroyed (separate from 'kill', which is for aircraft). */
  | { t: number; type: 'ground-kill'; targetId: EntityId; by: EntityId | null; weapon: AgWeaponId | null }
  | { t: number; type: 'note'; text: string };

export interface SpawnOptions {
  id?: EntityId;
  side: Side;
  type: AircraftId;
  callsign?: string;
  controller: Aircraft['controller'];
  /** Position in metres; heading in radians; speed in m/s. */
  pos: { x: number; y: number; z: number };
  heading: number;
  speed: number;
  skill?: AiSkill;
  /** Override default loadout. */
  stores?: Partial<Record<MissileId, number>>;
  radarMode?: RadarModeId;
  jamming?: boolean;
  /** Attack jets: SU25T_LOADOUTS id (default: the first loadout). */
  agLoadout?: string;
}

/** Sensor estimates at one recording sample. Positions are measured/estimated, never truth lookups. */
export interface RecordedRadarContacts {
  bricks: { targetId: EntityId; t: number; pos: [number, number, number] }[];
  tracks: {
    targetId: EntityId; label: string; pos: [number, number, number]; vel: [number, number, number];
    lastHit: number; firm: boolean; coasting: boolean;
  }[];
}

/** A recorded frame for after-action replay (Tacview-style). */
export interface RecordFrame {
  t: number;
  aircraft: {
    id: EntityId; side: Side; type: AircraftId;
    pos: [number, number, number]; heading: number; pitch: number; roll: number; alive: boolean;
    radarMode: RadarModeId; sttTarget: EntityId | null;
    radar: { azCenter: number; azHalf: number; elCenter: number; bars: number; beamAz: number; beamEl: number };
    designated: EntityId[];
    /** Optional for older recordings and synthetic Missile Lab replays. */
    radarContacts?: RecordedRadarContacts;
  }[];
  missiles: {
    id: EntityId; type: MissileId; side: Side; shooterId: EntityId; targetId: EntityId | null;
    pos: [number, number, number]; guidance: MissileGuidance; alive: boolean; timeToActive: number | null;
  }[];
  /** SAM sites and SAMs in flight (absent in recordings without SAMs). */
  sams?: { id: EntityId; type: SamId; side: Side; pos: [number, number, number]; state: SamState; targetId: EntityId | null; active: boolean }[];
  samMissiles?: { id: EntityId; type: SamId; side: Side; siteId: EntityId; targetId: EntityId | null; pos: [number, number, number]; guided: boolean; alive: boolean }[];
  /** Ground units and A-G weapons in flight (absent in recordings without them). */
  groundUnits?: { id: EntityId; kind: GroundUnitKind; side: Side; pos: [number, number, number]; heading: number; alive: boolean }[];
  agWeapons?: { id: EntityId; type: AgWeaponId; side: Side; shooterId: EntityId; targetId: EntityId | null; pos: [number, number, number]; guided: boolean; alive: boolean }[];
  /** Shkval per attack jet while the sight is on: ground aim point, locked unit, laser. */
  shkval?: { ownerId: EntityId; point: [number, number, number] | null; locked: EntityId | null; laser: boolean }[];
}

/**
 * What one aircraft's radar display shows right now. Built by picture.ts from the World;
 * drawn by src/ui/displays/radarDisplay.ts in the jet's own display format.
 * Positions are relative to the owner: az rad (+ right of nose), range m, alt m (absolute).
 */
export interface RadarPicture {
  t: number;
  ownerId: EntityId;
  aircraftType: FighterId;
  units: 'metric' | 'imperial';
  /** Own heading (rad), for ground-stabilised displays (F-14 TID) and heading tapes. */
  ownHeading: number;
  mode: RadarModeId;
  modeLabel: string;                 // as the cockpit shows it: 'TWS', 'СНП', 'RWS', 'ОБЗ'...
  rangeScale: number;                // m
  gimbalAz: number;                  // rad, display half-width
  scan: { azCenter: number; azHalf: number; elCenter: number; bars: number; beamAz: number; beamEl: number; bar: number; frameTime: number };
  /** Altitude band the scan covers at the cursor range (m, absolute), for "40/10"-style readouts. */
  altCoverage: { top: number; bottom: number; atRange: number };
  ownAlt: number;
  ownSpeed: number;                  // m/s
  bricks: { key: string; targetId: EntityId; az: number; range: number; alt: number; age: number; fade: number }[];
  tracks: {
    label: string;
    targetId: EntityId;
    az: number; range: number; alt: number;
    /** Target heading relative to own heading (rad), for the aspect/velocity stick. */
    relHeading: number;
    speed: number;                   // m/s
    aspectDeg: number;               // 0 hot .. 180 cold
    closure: number;                 // m/s
    firm: boolean;
    coasting: boolean;
    designation: 'primary' | 'secondary' | null;
    designationIndex: number;        // 0-based order in the designation list, -1 if none
    locked: boolean;
    friendly: boolean;
    missiles: { missileId: EntityId; label: string; guidance: MissileGuidance; timeToActive: number | null; timeToImpact: number | null }[];
  }[];
  stt: null | { targetId: EntityId; az: number; range: number; alt: number; aspectDeg: number; closure: number; lost: boolean };
  weapon: null | { id: MissileId; name: string; count: number };
  /** Launch zone for the selected weapon against the primary / locked target. */
  dlz: null | (Dlz & { targetRange: number });
  shootCue: boolean;
  cueLabel: string;                  // 'SHOOT', 'ПР', 'IN RNG' ...
  launchBlockedReason: string;       // why the shoot cue is off, in pilot words
  missilesInFlight: { missileId: EntityId; label: string; targetLabel: string; guidance: MissileGuidance; timeToActive: number | null; timeToImpact: number | null }[];
  cursor: { az: number; range: number };
}
