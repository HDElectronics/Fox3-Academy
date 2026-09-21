/**
 * Static facts about aircraft, radars, missiles and RWRs, as DCS World models them.
 * Values live in aircraft.ts / missiles.ts / rwr.ts / procedures.ts (owned by the data agent).
 * Physics constants for the simulation live in src/sim/*, NOT here.
 * All numbers here are "as seen by the pilot" facts: km, degrees, seconds, knots.
 */

export type AircraftId =
  | 'su27' | 'su33' | 'j11a' | 'mig29s'
  | 'f15c' | 'fa18c' | 'f16c' | 'f14b' | 'jf17' | 'm2000c';

export type MissileId =
  | 'r27r' | 'r27er' | 'r27t' | 'r27et' | 'r77' | 'r73'
  | 'aim120b' | 'aim120c' | 'aim7m' | 'aim9m' | 'aim9x'
  | 'aim54a' | 'aim54c' | 'sd10' | 'pl5e' | 's530d' | 'magic2';

export type RwrId = 'spo15' | 'alr56c' | 'alr67' | 'alr56m' | 'jf17rwr' | 'serval';

/** Cockpit skin used for the whole UI when this aircraft is selected. */
export type CockpitSkin = 'ru' | 'us';

/** Which radar display renderer draws this aircraft's radar picture. */
export type DisplayFormat =
  | 'ru-hud'    // Su-27 / Su-33 / J-11A / MiG-29 FC3: HUD/ИЛС-style picture, Cyrillic labels
  | 'f15-vsd'   // F-15C vertical situation display
  | 'mfd'       // Western MFD B-scope (Hornet DDI, Viper FCR, JF-17 MFCD) with per-aircraft labels
  | 'tid'       // F-14 tactical information display (round, plan view)
  | 'vtb';      // Mirage 2000C head-down VTB

export type RadarModeId =
  | 'off'
  | 'rws'   // range-while-search (bricks, no memory)
  | 'tws'   // track-while-scan (track files, multi-target on capable jets)
  | 'stt'   // single-target track (lock)
  | 'vs'    // velocity search (HPRF, closure only; optional)
  | 'acm';  // close-combat auto-acquisition (boresight / vertical scan)

export type SeekerKind = 'sarh' | 'arh' | 'ir';

export interface RangeKm { km: number; note?: string }

export interface RadarSpec {
  name: string;                 // 'N001', 'AN/APG-63(V)1', 'AN/APG-73', ...
  modes: RadarModeId[];         // modes this jet has in DCS
  /** Initial radar mode when a scenario enters the air-to-air intercept context. */
  bvrStartMode?: RadarModeId;
  /** Label shown in the cockpit for each mode (e.g. { rws: 'ОБЗ', tws: 'СНП', stt: 'АТК' }). */
  modeLabels: Partial<Record<RadarModeId, string>>;
  azHalfWidthOptionsDeg: number[];   // selectable scan half-widths, e.g. [10, 30, 60]
  barOptions: number[];              // selectable bar counts, e.g. [1, 2, 4, 6, 8]
  /** Explicit DCS TWS scan combinations: [azimuth half-width in degrees, bars]. */
  twsPatterns?: readonly (readonly [azHalfDeg: number, bars: number])[];
  barSpacingDeg: number;             // elevation step between bars
  beamWidthDeg: number;              // 3 dB beam width (bar coverage ~= barSpacing)
  scanRateDegPerS: number;           // antenna azimuth sweep speed
  gimbalAzDeg: number;               // max antenna azimuth off the nose (also STT gimbal limit)
  gimbalElDeg: number;               // max antenna elevation up/down
  rangeScalesKm: number[];           // display range options
  /** Detection range vs a fighter-size target (~3-5 m² RCS), DCS sensor-table style. */
  detectKm: {
    headOn: number; tail: number; lookDownFactor: number;
    /** RCS used by the source range table; unspecified legacy tables use 5 m². */
    referenceRcsM2?: number;
    /** Separate head-on look-down factor when the DCS table distinguishes aspects. */
    lookDownHeadOnFactor?: number;
  };
  /** Doppler notch half-width: target radial speed (vs ground) below which it is filtered. */
  notchKts: number;
  /** Does the notch only apply against ground clutter (look-down)? */
  notchNeedsLookDown: boolean;
  tws: null | {
    maxTracks: number;            // track files the radar maintains
    /** Can a radar missile be launched while staying in TWS? */
    launchFromTws: boolean;
    /** Max designated targets that can have supported ARH missiles simultaneously. 1 = sequential only. */
    maxSimultaneousTargets: number;
    /** DCS limits the scan volume in TWS on some jets. Frame time above this is refused. */
    maxFrameTimeS?: number;
    maxAzHalfWidthDeg?: number;
    maxBars?: number;
    /** FC3 Russian behaviour: designated target is auto-locked (STT) at this fraction of Rmax. null = no auto lock. */
    autoSttAtRmaxFraction: number | null;
    howTo: string;                // one-paragraph description of designating in this jet
  };
  /** STT always gives a lock warning; some DCS versions also give a launch warning for ARH launched from STT. */
  sttArhLaunchWarning: boolean;
}

export interface WeaponLoad { missile: MissileId; count: number }

export interface AircraftSpec {
  id: AircraftId;
  name: string;               // 'Su-27S Flanker-B'
  short: string;              // 'Su-27'
  nation: 'ru' | 'us' | 'cn' | 'pk' | 'fr';
  module: 'fc3' | 'full';     // DCS fidelity level
  developer: string;          // 'Eagle Dynamics', 'Heatblur', 'Deka Ironwork', 'Razbam'
  cockpit: CockpitSkin;
  units: 'metric' | 'imperial';
  display: DisplayFormat;
  rwr: RwrId;
  radar: RadarSpec;
  /** Default BVR loadout used by scenarios. */
  loadout: WeaponLoad[];
  /** Every air-to-air missile the jet can carry in DCS. */
  missiles: MissileId[];
  cms: { chaff: number; flares: number };
  /** Rough performance for the tactical flight model. */
  perf: { maxMach: number; cruiseMach: number; maxG: number; cornerKts: number; ceilingFt: number };
  rcsM2: number;              // frontal RCS, for detection scaling
  /** One-paragraph "what this jet can and cannot do in BVR" in plain words. */
  blurb: string;
  /** Short bullets: strengths / limits for BVR in DCS. */
  strengths: string[];
  limits: string[];
}

export interface MissileSpec {
  id: MissileId;
  name: string;               // 'R-27ER'
  nato?: string;              // 'AA-10 Alamo-C'
  fox: 1 | 2 | 3;
  seeker: SeekerKind;
  /** Midcourse: 'none' = homes from launch (SARH/IR), 'inertial' only, or 'datalink' updates from the shooter. */
  midcourse: 'none' | 'inertial' | 'datalink';
  lofts: boolean;
  /** ARH only: seeker activation distance to the (predicted) target. */
  pitbullKm?: number;
  seekerRangeKm?: number;
  seekerGimbalDeg?: number;
  massKg: number;
  lengthM: number;
  diameterM: number;
  burnS: number;              // total motor burn (boost + sustain)
  maxMach: number;
  maxG: number;
  /** Reference DCS launch ranges (from research), for tuning and teaching. */
  ref: {
    highHeadOnKm: number;     // 10 km / 33 kft, M0.9 vs M0.9 head-on
    highColdKm: number;       // same shooter, target fleeing at M0.9
    lowHeadOnKm: number;      // 1 km / 3 kft head-on
  };
  /** How much the seeker falls for chaff, 0 (immune) .. 1 (very gullible). */
  chaffSusceptibility: number;
  /** What the pilot must do to guide it, in one sentence. */
  guidanceRule: string;
  /** DCS-specific behaviour worth knowing. */
  notes: string[];
}

/** One threat as it appears on an RWR. */
export interface RwrSymbol {
  emitter: AircraftId | 'missile' | 'awacs' | 'sam-long' | 'sam-medium' | 'sam-short' | 'unknown';
  /** Text shown (e.g. '29', '27', 'U', 'M') or for SPO-15 the type-letter lamp (e.g. 'П'). */
  symbol: string;
}

export interface RwrSpec {
  id: RwrId;
  name: string;               // 'SPO-15LM "Beryoza"'
  kind: 'lamps' | 'scope';    // SPO-15 is a lamp panel; the rest are round scopes
  aircraft: AircraftId[];
  symbols: RwrSymbol[];
  /** How each state looks and sounds. */
  cues: { search: string; lock: string; launch: string; missile: string };
  /** Misconceptions to teach (e.g. ring position = priority, not range). */
  teach: string[];
}

export type BindGroup = 'radar' | 'weapons' | 'defence';
export interface KeyBind {
  action: string;
  /** FC3 keyboard label or full-fidelity HOTAS/cockpit function name. */
  keys: string;
  group: BindGroup;
  /** Known DCS keyboard default; null when absent or not verified. Never a trainer fallback. */
  keyboard: string | null;
  /** Controls-menu name and caveats, without encoded keyboard metadata. */
  note?: string;
}
export interface ProcedureStep { text: string; keys?: string; hotas?: string; note?: string }
export interface Procedure { id: string; title: string; steps: ProcedureStep[] }

export interface AircraftProcedures {
  aircraft: AircraftId;
  /** Keyboard defaults for FC3; HOTAS function names for full-fidelity modules. */
  binds: KeyBind[];
  procedures: Procedure[];   // e.g. 'tws-multi', 'stt-shot', 'defend-notch'
}

export interface Source { id: number; title: string; url: string }
