/**
 * Flight-ops contract: the airfield pattern and approach trainer (issue #19).
 *
 * A standalone arcade model, separate from the BVR `World` (whose flight keeps a 150 m floor). It is a
 * tutorial model of what the player sees and selects in DCS: speed, AoA as the cockpit shows it, gear and
 * flap positions, the glide path. It is not a flight model (AGENTS.md rule 1).
 *
 * Runway frame (metres): origin at the landing threshold centreline, x = east, y = up, z = south.
 * The runway points north: landing direction is −z. The touchdown aim point is `aimPointM` north of the
 * threshold (z = −aimPointM). The 3° glide path rises toward +z (south). Left-hand pattern: the break is
 * a left turn, the downwind leg lies to the west (x < 0) flying south.
 *
 * Owners: this file is a contract (coordinator). `src/sim/flightOps/*` (sim agent), `src/data/flightOps.ts`
 * (sim agent), `src/render/flightOps/*` (render agent), `src/pages/flight-ops/*` (page agent).
 */
import type { AircraftId } from '../../data/types';

/** Jets with flight-ops data: all ten since issue #22 (the MVP covered fa18c, f16c, f15c). */
export type FlightOpsJetId = AircraftId;

export const RUNWAY = { lengthM: 2500, widthM: 45 } as const;

/** Indexer lamp colour as the manual names it; null = the manual does not give it (draw neutral). */
export type IndexerColor = 'green' | 'yellow' | 'amber' | 'red' | null;

/** A number from a manual, with its provenance. `verified: false` renders "not verified" in the UI. */
export interface Sourced<T> { value: T; source: string; verified: boolean; note?: string }

/** Per-jet flight-ops facts (src/data/flightOps.ts). Speeds in knots, altitudes in feet: as the manuals give them. */
export interface FlightOpsJetData {
  id: FlightOpsJetId;
  /** Flap positions as the cockpit labels them, index 0 = up/clean. The landing setting is `landingFlap`. */
  flapLabels: readonly string[];
  landingFlap: number;
  takeoffFlap: number;
  /** Flaps are not selected by the pilot; they follow the gear handle (F-16C). Flap keys do nothing. */
  flapsWithGear?: boolean;
  /** No pilot flap control at all (M-2000C: elevons, automatic slats). Flap keys, lamps and grading skip flaps. */
  noFlapControl?: boolean;
  keys: { gear: string; flaps: string; speedbrake: string; hook?: string };
  aoa: {
    unit: 'deg' | 'units';
    onSpeed: Sourced<number>;
    /** On-speed band [low, high] in `unit`. Above = slow, below = fast. */
    band: Sourced<[number, number]>;
    colors: { slow: IndexerColor; on: IndexerColor; fast: IndexerColor };
  };
  /** Typical approach speed at landing weight, used by the arcade speed→AoA lookup. */
  approachKt: Sourced<number>;
  pattern: {
    initialKt: Sourced<number>;
    initialAltFt: Sourced<number>;
    breakG: Sourced<number>;
    downwindAltFt: Sourced<number>;
    abeamNm: Sourced<number>;
    /** Gear and landing-flap limit speed. */
    gearMaxKt: Sourced<number>;
  };
  glideDeg: Sourced<number>;
  aimPointFt: Sourced<number>;
  /** Short HUD cue the lesson teaches, e.g. "E-bracket on the flight path marker". */
  hudCue: string;
  /** Return-to-base navigation as the cockpit presents it (FC3 jets in #22). Absent = no nav lesson yet. */
  nav?: FlightOpsNavData;
  /** Runway takeoff (#24). */
  takeoff: FlightOpsTakeoffData;
  /** Carrier Case I recovery (#26). Absent = the jet does not go to the boat. */
  carrier?: FlightOpsCarrierData;
  /** Deck launch (#27): catapult (fa18c, f14b) or ski-jump (su33). Absent = no deck launch. */
  launch?: FlightOpsLaunchData;
}

/** Deck launch kind: CVN catapult or Kuznetsov ski-jump. */
export type LaunchKind = 'catapult' | 'skiJump';

/**
 * Launch sequence steps. Action steps are done with a `FlightOpsAction` of the same name ('nwsHi', 'launchBar',
 * 'hookUp', 'wipeOut', 'salute', 'specialAB'); condition steps are met by the state: 'trim' (trim at the
 * weight's value), 'power' (throttle at MIL, or afterburner where the data asks for it), 'handsOff' (no stick
 * from the salute to the end of the settle), 'release' (Su-33 deck stoppers let go).
 */
export type LaunchStepId = 'nwsHi' | 'launchBar' | 'hookUp' | 'trim' | 'power' | 'wipeOut' | 'salute' | 'handsOff'
  | 'specialAB' | 'release';

export interface LaunchStep {
  id: LaunchStepId;
  label: string;
  /** DCS key; null when the step has no key (a condition or a hands-off step). */
  key: Sourced<string> | null;
  note?: string;
}

/** Per-jet deck-launch data (Supercarrier guide, Hornet guide, Heatblur lesson, Su-33 manual). */
export interface FlightOpsLaunchData {
  kind: LaunchKind;
  ship: ShipId;
  /** The sequence strip in the order the player flies it. */
  steps: readonly LaunchStep[];
  /** Power at the shot or on the run. 'AB' = full afterburner. */
  power: Sourced<'MIL' | 'AB'>;
  /** Hornet: afterburner at and above this gross weight, lb. */
  abFromLb?: Sourced<number>;
  /** Takeoff trim by gross weight: [weight below which it applies (lb), trim deg]; last row covers the rest. */
  trimByWeightLb?: Sourced<readonly (readonly [number, number])[]>;
  /** Trainer launch weights ('normal' and 'heavy'), in the unit the jet's manual uses. Trainer choices. */
  weights: { unit: 'lb' | 'kg'; normal: number; heavy: number };
  /** Catapults (1-based) or ski-jump positions the trainer offers. */
  stations: readonly number[];
  /** Ski-jump: deck run to the ramp per position, metres. */
  runM?: Sourced<Record<number, number>>;
  /** Ski-jump: heaviest weight for the short positions (the heavy jet uses the long run). */
  shortRunMaxWeight?: Sourced<number>;
  /** Catapult: clearing turn after the shot, per catapult. */
  clearingTurn?: Sourced<Record<number, 'left' | 'right'>>;
  /** Keys that must not be used for the launch (Su-33 intake FOD screens). */
  avoid?: { fodScreens: Sourced<string> };
  /** After the launch: gear up, flap setting (label), the lesson line. */
  after: { flapLabel: string; cue: string };
  /** Short lesson line, e.g. "Hook up, trim, MIL, wipe out, salute, hands off". */
  cue: string;
}

/** Launch options for the 'catapult' and 'skiJump' starts. */
export interface LaunchOptions {
  /** Catapult 1 or 2, ski-jump position 1 or 3 (default: the first `stations` entry). */
  station?: number;
  heavy?: boolean;
}

/**
 * Deck-launch outcome: 'good' (clean sequence), 'sequence error' (launched with sequence faults),
 * 'cold cat' (power below the need at the shot: the jet settles), 'short run' (ski-jump ramp speed below the
 * minimum: the jet settles).
 */
export type LaunchOutcome = 'good' | 'sequence error' | 'cold cat' | 'short run';

/** Live launch state (starts 'catapult' and 'skiJump'). */
export interface LaunchState {
  kind: LaunchKind;
  station: number;
  weight: number;
  heavy: boolean;
  /**
   * 'hold' on the deck (shuttle or stoppers), 'shot' salute given, the cat fires after the shooter's delay,
   * 'stroke' catapult stroke or ski-jump run, 'settle' hands-off after the stroke, 'free' flying.
   */
  stage: 'hold' | 'shot' | 'stroke' | 'settle' | 'free';
  /** Steps in the order they were done, with times. */
  stepsDone: { id: LaunchStepId; t: number }[];
  /** Sequence faults in pilot words ("Salute before MIL: the shooter holds"). */
  errors: string[];
  /** Hornet takeoff trim, degrees, and the value the weight wants. */
  trimDeg?: number;
  trimWantDeg?: number;
  specialAB?: boolean;
  fodScreens?: boolean;
  /** Times: salute accepted, stroke start and end (or ramp exit). */
  saluteT?: number;
  strokeT?: number;
  endT?: number;
  /** Airspeed at the end of the stroke or at the ramp, knots, and the minimum the rule wants. */
  endKt?: number;
  minKt?: number;
  /** Stick moved between the salute and the end of the settle. */
  handsOn: boolean;
  /** Heading at the end of the stroke (clearing-turn reference), radians. */
  endHeading?: number;
  outcome?: LaunchOutcome;
}

/** Ships in the trainer. CVN = Supercarrier (Hornet, Tomcat); Kuznetsov (Su-33). */
export type ShipId = 'cvn' | 'kuznetsov';

/** Ship facts as the player meets them (Supercarrier guide, Su-33 manual). Gameplay values where not published. */
export interface ShipData {
  id: ShipId;
  name: string;
  /** Speed on the base recovery course (BRC); wind over the deck in the trainer is this speed (calm day). */
  speedKt: Sourced<number>;
  /** Landing area axis, degrees left of the ship's heading. */
  angledDeckDeg: Sourced<number>;
  glideDeg: Sourced<number>;
  wires: Sourced<number>;
  wireSpacingM: Sourced<number>;
  /** First wire distance from the ramp (stern edge of the landing area), metres. */
  firstWireFromRampM: Sourced<number>;
  landingAreaLengthM: number;
  landingAreaWidthM: number;
  deckHeightM: number;
  /** Optical landing aid the player sees. */
  lights: 'iflols' | 'luna3';
  /** Whether the game gives LSO calls and grades for this ship. */
  lso: Sourced<boolean>;
}

/** Per-jet Case I numbers (Supercarrier guide, Hornet guide, Heatblur manual). */
export interface FlightOpsCarrierData {
  ship: ShipId;
  hookKey: Sourced<string>;
  /** "Call the ball" in DCS is a radio-menu call; the trainer maps it to a key. */
  ballCallKey: Sourced<string>;
  pattern: {
    initialKt: Sourced<number>;
    initialAltFt: Sourced<number>;
    breakIntervalS: Sourced<[number, number]>;
    downwindAltFt: Sourced<number>;
    abeamNm: Sourced<[number, number]>;
    ninetyAltFt: Sourced<[number, number]>;
    /** Ball call range and groove time. */
    ballNm: Sourced<number>;
    grooveS: Sourced<[number, number]>;
    /** Gear and landing flaps below this speed in the carrier pattern. */
    gearFlapsMaxKt: Sourced<number>;
  };
  /** Power at touchdown: 'MIL' (Tomcat: afterburner waveoffs prohibited) or 'max'. */
  touchdownPower: Sourced<'MIL' | 'max'>;
}

/** Runway takeoff facts, per jet. Speeds in knots, pitch in degrees, as the manuals give them. */
export interface FlightOpsTakeoffData {
  /** Rotation speed at the trainer's standard takeoff weight. */
  vrKt: Sourced<number>;
  /** Optional Vr schedule by gross weight, [lb, kt] pairs (F-16C). */
  vrByWeightLb?: Sourced<readonly (readonly [number, number])[]>;
  /** Start the pull this many knots before Vr (F-16C: 10 in MIL, 15 in afterburner). */
  pullEarlyKt?: Sourced<number>;
  /** Target pitch band after rotation, degrees. */
  pitchDeg: Sourced<[number, number]>;
  /** Pitch at which the tail strikes on the runway, degrees (gameplay value where not published). */
  tailStrikeDeg: Sourced<number>;
  /** Gear must be up before this speed. */
  gearUpMaxKt: Sourced<number>;
  /** Whether the lesson uses afterburner for takeoff. */
  afterburner: Sourced<boolean>;
  /** Takeoff flap index into flapLabels (null when the jet has no flap control). */
  flapIndex: number | null;
  keys: { brakes: Sourced<string>; throttleMax?: Sourced<string>; steering?: Sourced<string> };
  /** Short pilot cue for the lesson, e.g. "Rotate at Vr to 8–12°, gear up before 300 kt". */
  cue: string;
}

/**
 * Nav modes the player cycles. FC3 Russian jets: route (МРШ) → return (ВЗВ) → landing (ПОС) on one key.
 * F-15C: NAV (route/return) → ILSN (landing). Labels are the cockpit's own text.
 */
export type NavModeId = 'route' | 'return' | 'landing';

export interface FlightOpsNavData {
  modes: readonly { id: NavModeId; label: string }[];
  /** Key that cycles the nav modes, and the key that cycles waypoints / airfields. */
  keys: { modeCycle: Sourced<string>; pointCycle?: Sourced<string> };
  /**
   * Return mode steers to the glide-slope intercept point on the extended centreline, then the jet
   * switches to landing mode (automatically where the manual says so).
   */
  interceptPointM: Sourced<number>;
  interceptAltM: Sourced<number>;
  autoLandingSwitch: Sourced<boolean>;
  /** HUD / HSI cue names the lesson teaches, e.g. ["GSUP", "GSDN"]. */
  cues: readonly string[];
}

/** Live nav picture (what the cockpit shows), computed each step when the jet has nav data. */
export interface NavState {
  mode: NavModeId;
  label: string;
  /** Current steer point in the runway frame (metres) and its name ("IAF", "Glide-slope intercept"). */
  target: { x: number; z: number; name: string };
  distM: number;
  /** Bearing to the target and the commanded steering heading, radians clockwise from north. */
  bearing: number;
  steerHeading: number;
  commandAltM: number | null;
  /** Landing mode only: glide-slope and localizer deviation in degrees (+ = high / right). */
  glideDevDeg: number | null;
  locDevDeg: number | null;
  /** Latest tower / nav call in pilot vocabulary ("On glide path"), or null. */
  call: string | null;
}

/** Player (or demo autopilot) input each step. Arcade stick and throttle. */
export interface FlightOpsInput {
  /** −1..1: pull (+) / push (−). Commands pitch rate. */
  pitch: number;
  /** −1..1: right (+) / left (−). Commands roll rate toward a bank limit. */
  roll: number;
  /** 0..1 throttle, 1 = MIL. */
  throttle: number;
  afterburner?: boolean;
  /** Wheel brakes held (ground only). */
  brakes?: boolean;
}

/** Discrete cockpit actions (the keys the lesson teaches). */
export type FlightOpsAction = 'gearToggle' | 'flapsDown' | 'flapsUp' | 'speedbrakeToggle' | 'navModeCycle' | 'navPointCycle'
  | 'hookToggle' | 'callBall'
  /** Deck launch (#27): sequence steps and the trainer's trim keys. */
  | 'nwsHi' | 'launchBar' | 'hookUp' | 'trimUp' | 'trimDown' | 'wipeOut' | 'salute' | 'specialAB' | 'fodScreens';

/**
 * 'ready' = on the runway for takeoff, holding brakes; 'roll' = takeoff ground roll before liftoff;
 * 'air'; 'rollout' after touchdown; 'stopped'; 'crashed'.
 */
export type FlightOpsPhase = 'ready' | 'roll' | 'air' | 'rollout' | 'stopped' | 'crashed';

export interface FlightOpsState {
  t: number;
  aircraft: FlightOpsJetId;
  /** Runway frame, metres. */
  pos: { x: number; y: number; z: number };
  /** Radians. heading clockwise from north; pitch nose-up +; bank right +. */
  heading: number;
  pitch: number;
  bank: number;
  /** Flight path angle, radians (climb +). */
  gamma: number;
  /** True airspeed m/s (sea-level field: treated as indicated). */
  speed: number;
  /** AoA in the jet's cockpit unit (`FlightOpsJetData.aoa.unit`). */
  aoa: number;
  /** Vertical speed m/s. */
  vs: number;
  throttle: number;
  afterburner: boolean;
  /** Commanded and animated (0..1) configuration. Animated positions move at a gameplay rate. */
  gearDown: boolean;
  gearPos: number;
  flapIndex: number;
  flapPos: number;
  speedbrakeOut: boolean;
  speedbrakePos: number;
  phase: FlightOpsPhase;
  /** Set on touchdown. */
  touchdown?: { t: number; z: number; x: number; vsMs: number; aoa: number; gearDown: boolean };
  /** Human-readable reason when phase = 'crashed' ("Gear up at touchdown"). */
  crashReason?: string;
  /** Takeoff records (#24): brake release, first nose-up rotation, liftoff, gear-up command, tail strike. */
  takeoff?: {
    brakeReleaseT?: number;
    rotateT?: number; rotateKt?: number;
    liftoffT?: number; liftoffKt?: number; liftoffPitchDeg?: number;
    gearUpT?: number; gearUpKt?: number;
    maxPitchOnGroundDeg: number;
    tailStrike: boolean;
  };
  /** Nav picture when the jet has nav data and a nav start was chosen. */
  nav?: NavState;
  /**
   * Carrier starts (#26): the ship moves on its BRC. For carrier starts `pos` is in a fixed world frame
   * (x east, y up above the sea, z south) and the ship's stern (ramp) centre is at `ship.x/z`; landing
   * geometry is computed in the moving landing-area frame.
   */
  ship?: { id: ShipId; x: number; z: number; heading: number; speedMs: number };
  hookDown?: boolean;
  hookPos?: number;
  /** Set when the hook touches the deck: the wire caught (1-based) or a bolter. */
  trap?: { t: number; wire: number | null; bolter: boolean; powerAtTouchdown: number };
  lso?: { calls: LsoCall[]; ball: BallState | null; ballCalled: boolean; waveoff: boolean };
  /** Deck launch (#27), with `ship`: the jet held on the catapult or the stoppers, the stroke, the settle. */
  launch?: LaunchState;
}

/** What the optical landing aid shows the pilot. */
export interface BallState {
  /** Glide-slope and lineup error in degrees (+ = high / right). */
  glideDevDeg: number;
  lineupDevDeg: number;
  /** Ball position in cells from centre (IFLOLS: −5..+5; Luna-3 maps to red/green/yellow). */
  cell: number;
  /** Luna-3 colour for the Su-33, else null. */
  luna: 'red' | 'green' | 'yellow' | null;
  waveoffLights: boolean;
  cutLights: boolean;
}

export interface LsoCall { t: number; text: string; kind: 'info' | 'correction' | 'waveoff' | 'bolter' }

/** DCS LSO grade marks, best to worst. */
export type CarrierGradeMark = '_OK_' | 'OK' | '(OK)' | '---' | 'C' | 'B' | 'WO' | 'OWO';

export interface CarrierScore {
  gates: GateResult[];
  grade: CarrierGradeMark | null;
  /** LSO comment codes with position marks, DCS style, e.g. "(LO)IC", "LULX". */
  comments: string[];
  wire: number | null;
  bolter: boolean;
  waveoff: boolean;
  calls: LsoCall[];
  /** 0..100 for the trainer's progress, null until the pass ends. */
  total: number | null;
  verdict: string | null;
}

/** Pattern gates in flight order. */
export type GateId = 'initial' | 'break' | 'downwind' | 'abeam' | 'ninety' | 'groove' | 'touchdown'
  | 'brakeRelease' | 'rotate' | 'liftoff' | 'gearUp' | 'climb'
  | 'sequence' | 'shot' | 'handsOff' | 'cleanUp' | 'clearingTurn';

export interface GateResult {
  id: GateId;
  label: string;
  passedAt: number;
  ok: boolean;
  /** Short pilot-facing findings, e.g. "620 ft, want 600 ±50". */
  notes: string[];
}

/** Live approach geometry relative to the glide path and runway centreline. */
export interface ApproachGeometry {
  /** Along-track distance to the aim point, metres (+ = before it). */
  rangeM: number;
  /** Glide-path error in degrees (+ = high). */
  glideErrDeg: number;
  /** Lineup error in degrees (+ = right of centreline, seen from the approach). */
  lineupErrDeg: number;
  /** Whether the aircraft is inside the scored final segment (last 1 nm). */
  onFinal: boolean;
}

export interface ApproachScore {
  gates: GateResult[];
  /** RMS glide-path and lineup errors over the scored final, degrees. */
  glideRmsDeg: number | null;
  lineupRmsDeg: number | null;
  /** Fraction of the final flown on speed (inside the AoA band). */
  onSpeedFraction: number | null;
  touchdownInZone: boolean | null;
  /** 0..100 overall, null until touchdown or waveoff. */
  total: number | null;
  verdict: string | null;
}

/** Takeoff grade (#24): gates brakeRelease, rotate, liftoff, gearUp, climb. */
export interface TakeoffScore {
  gates: GateResult[];
  tailStrike: boolean;
  /** 0..100, null until the climb gate or a crash. */
  total: number | null;
  verdict: string | null;
}

/** Deck-launch grade (#27): gates sequence, shot, handsOff (catapult), cleanUp, clearingTurn (catapult), climb. */
export interface LaunchScore {
  gates: GateResult[];
  outcome: LaunchOutcome | null;
  errors: string[];
  /** 0..100, null until the climb gate or a crash. */
  total: number | null;
  verdict: string | null;
}
