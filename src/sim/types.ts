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
import type { AircraftId, MissileId, RadarModeId, RwrSymbol, SamId } from '../data/types';

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
  /**
   * Close-combat manoeuvring (BFM). When set, flight.ts ignores heading/altitude/speed and flies this instead:
   * rolls the lift vector to `bank` and pulls `g` in 3D with no climb or dive limit (loops, yo-yos).
   * Absent or null = the tactical autopilot above. Arcade model, see docs/api/sim-physics.md.
   */
  bfm?: BfmCommand | null;
  /** Gun trigger held (guns.ts). Fires while rounds remain; see Aircraft.gun. */
  trigger?: boolean;
}

/** Throttle for BFM mode: idle, military power, or full afterburner. */
export type BfmThrottle = 'idle' | 'mil' | 'ab';

export interface BfmCommand {
  /**
   * Lift-vector roll angle (rad) measured from straight up around the flight path, + right: 0 = lift up,
   * ±π/2 = knife edge, π = lift vector on the ground (inverted). Near the vertical the jet holds its roll.
   * Over the top of a loop the angle reads π: fly a loop by commanding the current `ac.roll` side.
   */
  bank: number;
  /** Load factor to pull; 'max' = everything available (lift-limited below corner, capped by cmd.maxG and perf.maxG). */
  g: number | 'max';
  throttle: BfmThrottle;
  speedbrake?: boolean;
}

/** Gun state of one jet (guns.ts). Arcade model: no ballistics, see docs/api/sim-physics.md. */
export interface GunState {
  rounds: number;
  /** Rounds fired this tick > 0: the gun is firing right now. */
  firing: boolean;
  /** Seconds the trigger has been held in the current burst (burst limiter, tracers). */
  burst: number;
  /** Rounds this gun has put into targets, for coaching. */
  hits: number;
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
  gun: GunState;
  /** Gun damage taken, 0..1; the jet dies at 1 (missiles kill outright). */
  damage: number;
  ai: AiMemory | null;
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
  | { t: number; type: 'gun'; shooterId: EntityId; what: 'burst' | 'cease' | 'empty' }
  /** One tracer every GUN_TRACER_S while firing: muzzle position and velocity (m, m/s) for the renderer. */
  | { t: number; type: 'tracer'; shooterId: EntityId; pos: [number, number, number]; vel: [number, number, number] }
  | { t: number; type: 'gun-hit'; shooterId: EntityId; targetId: EntityId; hits: number; damage: number }
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
    /** Gun firing at this sample (absent in older recordings). */
    firing?: boolean;
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
}

/**
 * What one aircraft's radar display shows right now. Built by picture.ts from the World;
 * drawn by src/ui/displays/radarDisplay.ts in the jet's own display format.
 * Positions are relative to the owner: az rad (+ right of nose), range m, alt m (absolute).
 */
export interface RadarPicture {
  t: number;
  ownerId: EntityId;
  aircraftType: AircraftId;
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
