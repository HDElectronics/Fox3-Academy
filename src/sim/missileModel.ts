/**
 * [OWNER: sim-physics] Per-missile GAMEPLAY tuning constants (see ARCHITECTURE.md "Scope").
 *
 * This is not a weapon model. Every missile is an arcade abstraction tuned so that the ranges it
 * flies in this app match the launch ranges DCS shows the player (ED's launch table in
 * data/missiles.ts `ref`, docs/research/missiles.md sections A/B):
 *
 * - Speed over time: launch speed + a boost gain spread over the burn time (data `burnS`), then a
 *   decay dv/dt = -K(σ) · v², where K grows with air density σ (a curve through three fitted points:
 *   10 km, 5 km and 1 km). Thin air ⇒ slow decay ⇒ high shots coast farther. Turning bleeds a little
 *   extra speed; climbing trades speed for height.
 * - Turn-rate cap: data `maxG`, available in full only while the missile is fast (scales with σ·v²).
 * - Out of energy below `minSpeed`; dead after `maxTimeS` (the DCS battery time).
 * - Loft: a climb–cruise–dive profile on long shots, for missiles that loft in DCS.
 * - Seeker rules: pitbull distance, acquisition cone, notch gate, chaff / flare chances.
 *
 * How the speed curve is fitted: `calibrate()` solves straight-line, level "reference shots" (10 km
 * head-on, 10 km vs a fleeing target, 1 km head-on from data/missiles.ts `ref`, plus ED's 5 km head-on
 * value from research, below; shooter and target at 900 km/h like ED's table) for the boost gain, the
 * decay at each altitude and the give-up speed, so it follows data/missiles.ts automatically. The full 3-D flight (guidance, loft, gravity) then differs a little from the
 * straight-line solve; the per-missile `TUNED` factors below correct for that. They are written by
 * `TUNE=1 FIT=1 npx vitest run tests/tune/model-fit.test.ts`.
 */
import type { MissileId, MissileSpec } from '../data/types';
import { MISSILES } from '../data/missiles';
import { D2R } from './math';
import { sigma, soundSpeed } from './atmosphere';

/** ED's launch-table geometry: shooter and target both at 900 km/h. */
export const REF_SPEED = 250;
export const REF_HIGH_ALT = 10000;
export const REF_LOW_ALT = 1000;

export interface LoftProfile {
  /** No loft when the target is closer than this at launch. */
  minRangeM: number;
  /** Full climb angle from this launch range on (ramps up from minRange). */
  fullRangeM: number;
  climbDeg: number;
  /** Stop climbing after this much height gained (then cruise level). */
  maxGainM: number;
  /** Start the terminal dive when the intercept point is this far below the horizon. */
  diveDeg: number;
}

export interface MissileModel {
  id: MissileId;
  seeker: MissileSpec['seeker'];
  // --- speed curve ---
  burnS: number;
  /** m/s² added while the motor burns (the "boost gain" spread over burnS). */
  boostAccel: number;
  /** Speed decay dv/dt = -K·v² at 10 km (σ≈0.34), 5 km (σ≈0.60) and 1 km (σ≈0.91); see decayFactor(). */
  decayHigh: number;
  decayMid: number;
  decayLow: number;
  /** Below this true airspeed (m/s) the missile is out of energy and gives up. */
  minSpeed: number;
  maxTimeS: number;
  maxSpeedMach: number;
  /** Peak speed (m/s) in the 10 km reference shot, for info. */
  peakSpeedRef: number;
  // --- turning ---
  maxG: number;
  /** σ·v² (m²/s²) at which full maxG is available; below it the cap shrinks proportionally. */
  fullGSigmaV2: number;
  /** Extra speed loss when turning: a = turnBleedK · aLat² / (σ v²). */
  turnBleedK: number;
  /** How briskly the missile swings its nose onto the intercept point (1/s). */
  steerGain: number;
  loft: LoftProfile | null;
  // --- seeker / game rules ---
  pitbullM: number;
  seekerRangeM: number;
  gimbalRad: number;
  /** Half-angle of the cone the seeker searches around the aim point at pitbull / re-acquisition. */
  acqConeRad: number;
  /** Half-angle around the tracked target inside which a decoy can steal the seeker. */
  decoyConeRad: number;
  /** A decoy must be within this distance of the tracked target (range gate). */
  decoyGateM: number;
  /** Decoys only count once the missile is this close to what it tracks (chaff / flares work late). */
  decoyRangeM: number;
  /** Doppler notch gate (m/s radial speed vs ground) with ground behind the target (look-down). */
  notchMps: number;
  /** Gate multiplier when the missile looks up at the target (no clutter behind it). */
  lookUpNotchFactor: number;
  /** Per-bundle chance that chaff steals the seeker at full notch depth (data chaffSusceptibility × CHAFF_SCALE). */
  chaffChance: number;
  /** Seconds the target must sit in the notch before the seeker loses it (seeker memory). */
  notchHoldS: number;
  /** Per-flare chance that a flare steals an IR seeker (engines at military power). */
  flareChance: number;
  hitRadiusM: number;
  armTimeS: number;
  /** Gameplay minimum range (m) for a head-on shot. */
  rminM: number;
}

/** Hand-set gameplay constants per missile (research: missiles.md A/E/F, bvr-mechanics.md). */
interface Hand {
  maxTimeS: number;
  rminKm: number;
  /** ED launch table, 5 km head-on (docs/research/missiles.md section A). */
  midHeadOnKm: number;
  notchMps?: number;
  flareCcm?: number;
  loft?: LoftProfile;
  acqConeDeg?: number;
}

// Research: AIM-120 lofts ~30° beyond ~25 km and not inside 15 km; AIM-54 not inside 10-21 nm; Super 530D
// beyond 10 nm; AIM-7MH 6.5-20 km. Base shapes below; the tuner scales climb and gain (TUNED.loft).
const AMRAAM_LOFT: LoftProfile = { minRangeM: 18000, fullRangeM: 70000, climbDeg: 25, maxGainM: 8000, diveDeg: 22 };
const PHOENIX_LOFT: LoftProfile = { minRangeM: 39000, fullRangeM: 120000, climbDeg: 30, maxGainM: 12000, diveDeg: 25 };
const SD10_LOFT: LoftProfile = { minRangeM: 30000, fullRangeM: 80000, climbDeg: 20, maxGainM: 6000, diveDeg: 22 };
const S530_LOFT: LoftProfile = { minRangeM: 18500, fullRangeM: 45000, climbDeg: 18, maxGainM: 5000, diveDeg: 20 };
const SPARROW_LOFT: LoftProfile = { minRangeM: 12000, fullRangeM: 30000, climbDeg: 15, maxGainM: 4000, diveDeg: 18 };
const GENERIC_LOFT: LoftProfile = { minRangeM: 20000, fullRangeM: 60000, climbDeg: 20, maxGainM: 6000, diveDeg: 22 };

// maxTimeS: DCS autopilot op_time where research has it (R-27R/ER 60, AIM-7 75, AIM-120B 80, AIM-120C 100,
// SD-10 100, Super 530D 45, R-77 70, AIM-54 ~200); IR values are gameplay picks (the fit may shorten them).
// rminKm: the Lua D_min. midHeadOnKm: ED's 5 km head-on table value. flareCcm: the IR ccm_k0 (lower = harder
// to decoy). All from docs/research/missiles.md sections A and F / bvr-mechanics.md.
const HAND: Record<MissileId, Hand> = {
  r27r: { maxTimeS: 60, rminKm: 1.5, midHeadOnKm: 21, notchMps: 32 },
  r27er: { maxTimeS: 60, rminKm: 1.5, midHeadOnKm: 35, notchMps: 32 },
  r27t: { maxTimeS: 60, rminKm: 1.5, midHeadOnKm: 19, flareCcm: 0.5 },
  r27et: { maxTimeS: 60, rminKm: 1.5, midHeadOnKm: 33, flareCcm: 0.5 },
  r77: { maxTimeS: 70, rminKm: 0.7, midHeadOnKm: 25, notchMps: 30 },
  r73: { maxTimeS: 40, rminKm: 0.3, midHeadOnKm: 15, flareCcm: 0.5 },
  aim120b: { maxTimeS: 80, rminKm: 0.7, midHeadOnKm: 33, notchMps: 27, loft: AMRAAM_LOFT },
  aim120c: { maxTimeS: 100, rminKm: 0.7, midHeadOnKm: 35, notchMps: 25, loft: AMRAAM_LOFT },
  aim7m: { maxTimeS: 75, rminKm: 1.5, midHeadOnKm: 27, notchMps: 30, loft: SPARROW_LOFT },
  aim9m: { maxTimeS: 60, rminKm: 0.3, midHeadOnKm: 15.5, flareCcm: 0.5 },
  aim9x: { maxTimeS: 60, rminKm: 0.2, midHeadOnKm: 15.5, flareCcm: 0.2 },
  aim54a: { maxTimeS: 200, rminKm: 0.7, midHeadOnKm: 72, notchMps: 30, loft: PHOENIX_LOFT },
  aim54c: { maxTimeS: 200, rminKm: 0.7, midHeadOnKm: 72, notchMps: 28, loft: PHOENIX_LOFT },
  sd10: { maxTimeS: 100, rminKm: 1.0, midHeadOnKm: 37, notchMps: 27, loft: SD10_LOFT },
  pl5e: { maxTimeS: 40, rminKm: 0.3, midHeadOnKm: 15.5, flareCcm: 0.5 },
  s530d: { maxTimeS: 45, rminKm: 2.5, midHeadOnKm: 28, notchMps: 30, loft: S530_LOFT },
  magic2: { maxTimeS: 40, rminKm: 0.5, midHeadOnKm: 10, flareCcm: 1.0 },
};

/** ED's 5 km head-on reference (km) for a missile (research table; data/missiles.ts has no 5 km field). */
export function midHeadOnKm(id: MissileId): number {
  const h = HAND[id];
  const ref = MISSILES[id].ref;
  // keep it between the 1 km and 10 km values if the data changes
  return h ? Math.min(ref.highHeadOnKm, Math.max(ref.lowHeadOnKm, h.midHeadOnKm)) : (ref.lowHeadOnKm + ref.highHeadOnKm) / 2;
}

/**
 * Correction factors found by the tuner. a, b, c scale the straight-line fit's goals for the three reference
 * shots (a: 10 km head-on, b: 10 km fleeing target, c: 1 km head-on); `loft` scales the loft climb angle and
 * height gain (lofting missiles reach their head-on reference partly by lofting); `peak` scales the boost
 * (for missiles whose table ranges need more speed than data maxMach suggests within their flight time);
 * `m` scales the 5 km head-on goal.
 */
export interface TuneCorrection { a: number; b: number; c: number; m?: number; loft?: number; peak?: number }

// @tuned-start (written by tests/tune/model-fit.test.ts; do not edit by hand)
export const TUNED: Partial<Record<MissileId, TuneCorrection>> = {
  aim120b: { a: 0.8500, b: 0.9834, c: 0.9973, m: 0.9124, loft: 1.0000, peak: 1.1879 },
  aim120c: { a: 0.8500, b: 0.9921, c: 0.9974, m: 0.9422, loft: 0.4159, peak: 1.0460 },
  aim54a: { a: 0.8500, b: 0.9892, c: 1.0003, loft: 0.1354 },
  aim54c: { a: 0.8500, b: 0.9892, c: 1.0003, loft: 0.1354 },
  sd10: { a: 0.8500, b: 1.0000, c: 1.0000, loft: 0.4619 },
  s530d: { a: 0.8500, b: 1.0015, c: 0.9927, loft: 1.0000, peak: 1.1273 },
  magic2: { a: 1.0000, b: 1.2473, c: 1.0000, peak: 1.1168 },
};
// @tuned-end

const PEAK_FRAC = 0.85;       // peak speed in the 10 km reference shot, as a fraction of data maxMach
/**
 * Chaff chance per bundle = data chaffSusceptibility × this × notch depth. A defending jet drops a bundle
 * every ~0.5 s, so over a notch of 10 s an R-27ER (0.5) is almost always decoyed and an AIM-120C (0.1)
 * about half the time.
 */
export const CHAFF_SCALE = 0.35;
/** Lofting missiles: share of the 10 km head-on reference flown flat; the loft makes up the rest. */
export const LOFT_FLAT_SHARE = 0.85;
/** Above 10 km the decay keeps falling with density, but less than proportionally. */
const THIN_AIR_EXP = 0.7;
const VMIN_FLOOR = 170;       // m/s: never let the fit pick a give-up speed below this
// m/s: above this, shorten the flight time instead of raising the give-up speed. (A lower value forces a
// stronger low-altitude decay in the fit, which makes short low-level shots worse, so it stays at ~Mach 1.)
const VMIN_SANE = 340;
export const REF_MID_ALT = 5000;
const SIGMA_HI = sigma(REF_HIGH_ALT);
const SIGMA_MID = sigma(REF_MID_ALT);
const SIGMA_LO = sigma(REF_LOW_ALT);

/** Straight-line, level 1-D flight of the speed curve. Returns the launch range that just reaches the target. */
function line1d(burnS: number, boost: number, K: number, vmin: number, tmax: number, closing: boolean): { range: number; peak: number } {
  const dt = 0.05, vt = REF_SPEED;
  let v = REF_SPEED, x = 0, t = 0, peak = v;
  while (t < tmax) {
    const thrust = t < burnS ? boost * Math.min(1, (burnS - t) / dt) : 0;
    v = (v + thrust * dt) / (1 + K * v * dt);
    x += v * dt;
    t += dt;
    if (v > peak) peak = v;
    if (t >= burnS) {
      if (v < vmin) break;
      if (!closing && v <= vt * 1.02) break;
    }
  }
  return { range: closing ? x + vt * t : x - vt * t, peak };
}

/** Bisection for a monotone function f on [lo, hi] (log-space when `log`). f increasing if `inc`. */
function solve(f: (x: number) => number, goal: number, lo: number, hi: number, inc: boolean, log = false, iters = 40): number {
  let a = log ? Math.log(lo) : lo, b = log ? Math.log(hi) : hi;
  for (let i = 0; i < iters; i++) {
    const mid = (a + b) / 2;
    const x = log ? Math.exp(mid) : mid;
    const y = f(x);
    if ((y < goal) === inc) a = mid; else b = mid;
  }
  const m = (a + b) / 2;
  return log ? Math.exp(m) : m;
}

export interface Calibration {
  boostAccel: number; decayHigh: number; decayMid: number; decayLow: number; minSpeed: number; maxTimeS: number; peak: number;
}

/**
 * Fit the arcade speed curve to the missile's reference ranges (see file header). Pure and deterministic.
 * Unknowns: boost gain (from data maxMach), decay at 10 km (fleeing-target shot), give-up speed or flight
 * time (10 km head-on shot), decay at 1 km (1 km head-on shot).
 * `batteryS` is the longest the missile may fly; missiles whose table ranges imply they stay fast the
 * whole way (short-range IR) get a shorter flight time instead of an absurd give-up speed.
 */
export function calibrate(spec: MissileSpec, corr: TuneCorrection, batteryS: number, lofting = false, midKm?: number): Calibration {
  const burnS = Math.max(0.5, spec.burnS);
  const goalA = spec.ref.highHeadOnKm * 1000 * corr.a;
  const goalB = spec.ref.highColdKm * 1000 * corr.b;
  const goalC = spec.ref.lowHeadOnKm * 1000 * corr.c;
  const goalM = (midKm ?? (spec.ref.lowHeadOnKm + spec.ref.highHeadOnKm) / 2) * 1000 * (corr.m ?? 1);
  const aHi = soundSpeed(REF_HIGH_ALT);
  const peakMul = corr.peak ?? 1;
  let peakGoal = Math.max(REF_SPEED + 150, spec.maxMach * aHi * PEAK_FRAC * peakMul);
  const peakCap = Math.max(peakGoal, spec.maxMach * aHi * 1.1 * peakMul);
  let Kh = 3e-5, Kl = 8e-5, vmin = 250, T = batteryS, boost = (peakGoal - REF_SPEED) / burnS, peak = peakGoal;
  const headOn = (K: number, v: number, t: number) => line1d(burnS, boost, K, v, t, true).range;
  for (let round = 0; round < 8; round++) {
    boost = solve(b => line1d(burnS, b, Kh, 0, burnS + 0.1, true).peak, peakGoal, 1, 3000, true, true);
    Kh = solve(k => line1d(burnS, boost, k, vmin, T, false).range, goalB, 1e-7, 1e-2, false, true);
    if (headOn(Kh, VMIN_FLOOR, batteryS) < goalA) {
      // even the slowest give-up speed and the full battery fall short: fly faster
      vmin = VMIN_FLOOR; T = batteryS;
      peakGoal = Math.min(peakCap, peakGoal * 1.04);
    } else if (!lofting && headOn(Kh, VMIN_SANE, batteryS) >= goalA) {
      // plenty of energy: keep a sane give-up speed and end the flight on time instead
      vmin = VMIN_SANE;
      T = solve(t => headOn(Kh, VMIN_SANE, t), goalA, burnS + 2, batteryS, true);
    } else {
      // lofting missiles keep their full flight time (the loft needs it) and give up earlier instead
      T = batteryS;
      vmin = solve(v => headOn(Kh, v, batteryS), goalA, VMIN_FLOOR, lofting ? Math.max(VMIN_SANE, 0.6 * peakGoal) : VMIN_SANE, false);
    }
    Kl = solve(k => headOn(k, vmin, T), goalC, 1e-7, 1e-2, false, true);
    peak = line1d(burnS, boost, Kh, 0, burnS + 0.1, true).peak;
  }
  Kl = Math.max(Kl, Kh);
  // the 5 km point (flat shot, same give-up speed and flight time), kept between the other two
  const Km = Math.min(Kl, Math.max(Kh, solve(k => headOn(k, vmin, T), goalM, 1e-7, 1e-2, false, true)));
  return { boostAccel: boost, decayHigh: Kh, decayMid: Km, decayLow: Kl, minSpeed: vmin, maxTimeS: T, peak };
}

const cache = new Map<MissileId, MissileModel>();
const overrides = new Map<MissileId, TuneCorrection>();

/** Tuner hook: evaluate the model with trial correction factors (null = back to TUNED). */
export function setTuneOverride(id: MissileId, corr: TuneCorrection | null): void {
  if (corr) overrides.set(id, corr); else overrides.delete(id);
  cache.delete(id);
}

/** Current correction factors for a missile (override, else TUNED, else 1). */
export function tuneCorrection(id: MissileId): TuneCorrection {
  return overrides.get(id) ?? TUNED[id] ?? { a: 1, b: 1, c: 1 };
}

function build(id: MissileId): MissileModel {
  const spec = MISSILES[id];
  const hand: Hand = HAND[id] ?? { maxTimeS: 60, rminKm: 1 };
  const corr = tuneCorrection(id);
  const loftBase = spec.lofts ? hand.loft ?? GENERIC_LOFT : null;
  const loftScale = Math.max(0, corr.loft ?? 1);
  const cal = calibrate(spec, corr, hand.maxTimeS, !!loftBase, midHeadOnKm(id));
  const radar = spec.seeker !== 'ir';
  const pitbullM = (spec.pitbullKm ?? 15) * 1000;
  const ccm = hand.flareCcm ?? 0.5;
  return {
    id, seeker: spec.seeker,
    burnS: Math.max(0.5, spec.burnS),
    boostAccel: cal.boostAccel,
    decayHigh: cal.decayHigh,
    decayMid: cal.decayMid,
    decayLow: cal.decayLow,
    minSpeed: cal.minSpeed,
    maxTimeS: cal.maxTimeS,
    maxSpeedMach: Math.max(spec.maxMach, cal.peak / soundSpeed(REF_HIGH_ALT)) * 1.05,
    peakSpeedRef: cal.peak,
    maxG: spec.maxG,
    // full g down to about Mach 2 at 10 km (σ·v² ≈ 0.337 · 600²)
    fullGSigmaV2: 120000,
    turnBleedK: 60,
    steerGain: 4,
    loft: loftBase && loftScale > 0.01
      ? { ...loftBase, climbDeg: Math.min(45, loftBase.climbDeg * loftScale), maxGainM: loftBase.maxGainM * loftScale }
      : null,
    pitbullM,
    seekerRangeM: Math.max((spec.seekerRangeKm ?? 20) * 1000, spec.seeker === 'arh' ? pitbullM + 4000 : 0),
    gimbalRad: (spec.seekerGimbalDeg ?? 50) * D2R,
    acqConeRad: (hand.acqConeDeg ?? 10) * D2R,
    decoyConeRad: 6 * D2R,
    decoyGateM: 700,
    decoyRangeM: radar ? 12000 : 5000,
    notchMps: radar ? hand.notchMps ?? 30 : 0,
    lookUpNotchFactor: 0.4,
    chaffChance: radar ? Math.min(1, Math.max(0, spec.chaffSusceptibility)) * CHAFF_SCALE : 0,
    notchHoldS: 0.6,
    // ccm_k0 0.2 → ~0.14 per flare, 0.5 → ~0.25, 1 → ~0.33, 2 → ~0.4
    flareChance: radar ? 0 : 0.5 * ccm / (ccm + 0.5),
    hitRadiusM: 15,
    armTimeS: 0.6,
    rminM: hand.rminKm * 1000,
  };
}

/** Gameplay tuning for one missile type (memoised). */
export function missileModel(id: MissileId): MissileModel {
  let m = cache.get(id);
  if (!m) { m = build(id); cache.set(id, m); }
  return m;
}

/**
 * Speed-decay factor K (dv/dt = -K·v²) at an altitude: piecewise linear in air density through the three
 * fitted points (10 km, 5 km, 1 km), extrapolated to sea level, and falling as σ^0.7 above 10 km (thin
 * air, longer coast).
 */
export function decayFactor(model: MissileModel, alt: number): number {
  const s = sigma(Math.max(0, alt));
  if (s <= SIGMA_HI) return model.decayHigh * Math.pow(s / SIGMA_HI, THIN_AIR_EXP);
  if (s <= SIGMA_MID) return model.decayHigh + (model.decayMid - model.decayHigh) * (s - SIGMA_HI) / (SIGMA_MID - SIGMA_HI);
  return model.decayMid + (model.decayLow - model.decayMid) * (s - SIGMA_MID) / (SIGMA_LO - SIGMA_MID);
}
