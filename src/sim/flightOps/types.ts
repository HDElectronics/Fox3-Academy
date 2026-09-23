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

/** Jets with flight-ops data in the MVP. */
export type FlightOpsJetId = Extract<AircraftId, 'fa18c' | 'f16c' | 'f15c'>;

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
}

/** Discrete cockpit actions (the keys the lesson teaches). */
export type FlightOpsAction = 'gearToggle' | 'flapsDown' | 'flapsUp' | 'speedbrakeToggle';

export type FlightOpsPhase = 'air' | 'rollout' | 'stopped' | 'crashed';

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
}

/** Pattern gates in flight order. */
export type GateId = 'initial' | 'break' | 'downwind' | 'abeam' | 'ninety' | 'groove' | 'touchdown';

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
