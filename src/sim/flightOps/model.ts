/**
 * [OWNER: sim] Arcade flight model for the pattern and approach trainer.
 *
 * Gameplay rules only (AGENTS.md rule 1), tuned so the manual numbers come out: at the approach speed, 1 g,
 * landing flaps, the cockpit AoA reads on speed. Not a flight model.
 *
 * - Stick pitch commands the AoA rate (the nose relative to the flight path). Neutral stick holds AoA, like
 *   a trimmed jet: throttle then moves the glide path. Stick roll commands roll rate; neutral stick holds bank.
 * - Load factor from AoA: n = (aoa / onSpeed) · (v / vApproach)² · lift(flaps). Flaps up needs more AoA.
 * - Speed: thrust from throttle minus drag (base, gear, flaps, speed brake, induced ∝ n²) minus g·sin(γ).
 * - Ground contact at wheel height y = 0: gear up, vs < −4.5 m/s or off the runway is a crash; else rollout.
 * - Takeoff (#24): 'ready' holds the brakes, 'roll' accelerates; the nose rises with back stick above 0.8·Vr,
 *   liftoff comes at Vr + 5 kt once the pitch is in the band (late fallback Vr + 25 kt at 3°). Arcade rules.
 * Fixed step 1/60 s recommended. Deterministic: no randomness.
 */
import { D2R, G0, M_PER_FT, M_PER_NM, MPS_PER_KT, R2D, clamp, wrap2Pi, wrapPi } from '../math';
import { FLIGHT_OPS } from '../../data/flightOps';
import {
  RUNWAY, type FlightOpsAction, type FlightOpsInput, type FlightOpsJetData, type FlightOpsJetId,
  type FlightOpsState, type LaunchOptions,
} from './types';
import { applyLaunchAction, placeLaunchStart, stepLaunchAir, stepLaunchDeck } from './launch';
import { cycleNavMode, cycleNavPoint, initNav, navRoute, updateNav } from './nav';
import { HOOK_TIME_S, carrierContact, landingFrame, moveShip, placeCarrierStart, stepCarrierDeck } from './carrier';
import { updateLso } from './lso';

export const FLIGHT_OPS_DT = 1 / 60;
/** Sink rate beyond which a touchdown is a crash, m/s (about 890 ft/min). */
export const HARD_LANDING_MS = 4.5;
export const BANK_LIMIT = 75 * D2R;
const ROLL_RATE = 90 * D2R;
/** Normalised AoA (1 = on speed) per second at full stick. */
const AOA_RATE = 0.6;
const ALPHA_N_MAX = 1.9;
const ALPHA_N_MIN = -0.4;
const G_MAX = 7.5;
const THROTTLE_TAU = 0.8;
const GEAR_TIME = 6;
const FLAP_TIME = 4;
const SPEEDBRAKE_TIME = 2;
/** Arcade thrust and drag, m/s². */
const IDLE_ACC = 0.5;
const MIL_ACC = 7;
const AB_ACC = 5;
const K_BASE = 6.8e-5;
const K_GEAR = 1.5e-4;
const K_FLAP = 1.5e-4;
const K_SPEEDBRAKE = 1.2e-4;
const K_INDUCED = 1.8;
/** Approach speed the drag constants were set for, m/s (140 kt). */
const REF_VA = 72;
const WHEEL_BRAKE = 2.5;
const NWS_RATE = 5 * D2R;
/** Cockpit-unit to body-degree factor for rendering pitch (F-15C AoA units). */
const UNITS_TO_DEG = 0.4;
/** Takeoff roll: rolling friction (m/s²), nose rotation rate at full stick, and liftoff margins (gameplay values). */
const ROLLING = 0.3;
export const ROTATE_RATE_DEG = 5;
/** Thrust fraction on the takeoff roll, so a MIL roll to rotation takes about 25 s and an afterburner roll about 13 s. */
const ROLL_THRUST = 0.6;
/** The nose only comes up above this fraction of Vr. */
export const ROTATE_MIN_VR = 0.8;
export const LIFTOFF_MARGIN_KT = 5;
export const LATE_LIFTOFF_KT = 25;
const LATE_LIFTOFF_PITCH_DEG = 3;
/** Takeoff start: this far past the threshold, on the centreline, heading north. */
export const TAKEOFF_START_M = 100;

/**
 * 'caseI' and 'carrierGroove' (#26) need `FlightOpsJetData.carrier` (fa18c, f14b, su33). 'catapult' (fa18c, f14b)
 * and 'skiJump' (su33) (#27) need `FlightOpsJetData.launch` of that kind.
 */
export type FlightOpsStart = 'initial' | 'downwind' | 'final' | 'runway' | 'rtb' | 'takeoff' | 'caseI' | 'carrierGroove'
  | 'catapult' | 'skiJump';

/** 'rtb' start: off-axis south-west of the field, runway frame metres, and speed in knots (gameplay values). */
export const RTB_START = { x: -12000, z: 38000, altM: 3500, kt: 300 } as const;

/** Whether the jet has the 'rtb' (return-to-base nav) start. */
export const hasNavStart = (d: FlightOpsJetData) => d.nav !== undefined;
export type AoaCue = 'slow' | 'on' | 'fast';

export const approachSpeedMs = (d: FlightOpsJetData) => d.approachKt.value * MPS_PER_KT;
export const aimPointM = (d: FlightOpsJetData) => d.aimPointFt.value * M_PER_FT;
/** The F-16 has no flap selector: flaps follow the gear. */
export const flapsFollowGear = (d: FlightOpsJetData) => d.flapsWithGear === true;
/** No pilot flap control at all (M-2000C): flap actions do nothing, flap state stays at index 0. */
export const noFlapControl = (d: FlightOpsJetData) => d.noFlapControl === true;
/** Whether the flap keys do anything. */
export const hasFlapSelector = (d: FlightOpsJetData) => !flapsFollowGear(d) && !noFlapControl(d);
/** Flap index the jet takes off with (per the takeoff data and flap semantics). */
export function takeoffFlapIndex(d: FlightOpsJetData): number {
  if (noFlapControl(d)) return 0;
  if (flapsFollowGear(d)) return d.landingFlap;
  return d.takeoff.flapIndex ?? 0;
}

/** Flap position (0..1) that counts as landing flaps. */
function landingFlapFrac(d: FlightOpsJetData) {
  return d.landingFlap / Math.max(1, d.flapLabels.length - 1);
}
/** 0..1: how much of the landing-flap effect is out. */
function flapEffect(s: FlightOpsState, d: FlightOpsJetData) {
  // No flap control: the automatic high-lift devices are an arcade stand-in that follows the gear.
  if (noFlapControl(d)) return s.gearPos;
  return clamp(s.flapPos / landingFlapFrac(d), 0, 1);
}
const liftFactor = (s: FlightOpsState, d: FlightOpsJetData) => 0.8 + 0.2 * flapEffect(s, d);

/** Load factor the current AoA produces. */
export function loadFactor(s: FlightOpsState, d: FlightOpsJetData): number {
  if (s.phase !== 'air') return 1;
  const va = approachSpeedMs(d);
  return clamp((s.aoa / d.aoa.onSpeed.value) * (s.speed / va) ** 2 * liftFactor(s, d), -2, G_MAX);
}

/** Cockpit AoA that holds load factor `n` at the current speed and configuration. */
export function aoaForLoad(s: FlightOpsState, d: FlightOpsJetData, n: number): number {
  const va = approachSpeedMs(d);
  const q = (Math.max(s.speed, 0.3 * va) / va) ** 2 * liftFactor(s, d);
  return (n / q) * d.aoa.onSpeed.value;
}

/** AoA indexer cue: slow above the band, fast below it. */
export function aoaCue(s: FlightOpsState, d: FlightOpsJetData): AoaCue {
  const [lo, hi] = d.aoa.band.value;
  // Band edges count as on speed, at the 0.1 resolution the cockpit readout shows.
  const a = Math.round(s.aoa * 10) / 10;
  return a > hi ? 'slow' : a < lo ? 'fast' : 'on';
}

/** Configuration warnings for the cockpit (the jet is not damaged in the trainer). */
export function configWarnings(s: FlightOpsState, d: FlightOpsJetData): { overspeed: 'gear' | 'flaps' | null } {
  const kt = s.speed / MPS_PER_KT;
  const limit = d.pattern.gearMaxKt.value;
  if (s.phase !== 'air' || kt <= limit) return { overspeed: null };
  if (s.gearPos > 0.02) return { overspeed: 'gear' };
  if (hasFlapSelector(d) && s.flapIndex >= d.landingFlap && s.flapPos > 0.02) return { overspeed: 'flaps' };
  return { overspeed: null };
}

function blank(id: FlightOpsJetId): FlightOpsState {
  return {
    t: 0, aircraft: id, pos: { x: 0, y: 0, z: 0 }, heading: 0, pitch: 0, bank: 0, gamma: 0, speed: 0, aoa: 0,
    vs: 0, throttle: 0, afterburner: false, gearDown: false, gearPos: 0, flapIndex: 0, flapPos: 0,
    speedbrakeOut: false, speedbrakePos: 0, phase: 'air',
  };
}

function setLanding(s: FlightOpsState, d: FlightOpsJetData) {
  s.gearDown = true; s.gearPos = 1;
  if (noFlapControl(d)) return;
  s.flapIndex = d.landingFlap; s.flapPos = landingFlapFrac(d);
}

/** Trim the AoA and throttle for 1 g at the current state (start positions). */
function trim(s: FlightOpsState, d: FlightOpsJetData) {
  s.aoa = aoaForLoad(s, d, 1);
  s.throttle = clamp((drag(s, d, 1) + G0 * Math.sin(s.gamma) - IDLE_ACC) / (MIL_ACC - IDLE_ACC), 0, 1);
  s.pitch = s.gamma + bodyAoaRad(s, d);
  s.vs = s.speed * Math.sin(s.gamma);
}

/** Start the lesson at a pattern position. */
export function createFlightOpsState(id: FlightOpsJetId, start: FlightOpsStart, data: FlightOpsJetData = FLIGHT_OPS[id],
  launch?: LaunchOptions): FlightOpsState {
  const d = data;
  const s = blank(id);
  const va = approachSpeedMs(d);
  switch (start) {
    case 'initial':
      s.pos = { x: 0, y: d.pattern.initialAltFt.value * M_PER_FT, z: 2 * M_PER_NM };
      s.speed = d.pattern.initialKt.value * MPS_PER_KT;
      break;
    case 'downwind':
      setLanding(s, d);
      s.pos = { x: -d.pattern.abeamNm.value * M_PER_NM, y: d.pattern.downwindAltFt.value * M_PER_FT, z: -RUNWAY.lengthM / 2 };
      s.heading = Math.PI;
      s.speed = va * 1.1;
      break;
    case 'final': {
      setLanding(s, d);
      const range = 1.5 * M_PER_NM;
      s.gamma = -d.glideDeg.value * D2R;
      s.pos = { x: 0, y: range * Math.tan(-s.gamma), z: range - aimPointM(d) };
      s.speed = va;
      break;
    }
    case 'rtb': {
      const nav = d.nav;
      if (!nav) throw new Error(`No nav data for ${id}: the 'rtb' start needs FlightOpsJetData.nav`);
      s.pos = { x: RTB_START.x, y: RTB_START.altM, z: RTB_START.z };
      s.speed = RTB_START.kt * MPS_PER_KT;
      // Return mode where the cockpit has it (ВЗВ), else route mode on the IAF (F-15C NAV).
      if (nav.modes.some(m => m.id === 'return')) initNav(s, d, 'return');
      else initNav(s, d, 'route', navRoute(nav).length - 1);
      s.heading = s.nav!.steerHeading;
      break;
    }
    case 'runway':
      s.gearDown = true; s.gearPos = 1;
      s.flapIndex = noFlapControl(d) ? 0 : d.takeoffFlap; s.flapPos = s.flapIndex / Math.max(1, d.flapLabels.length - 1);
      s.pos = { x: 0, y: 0, z: -50 };
      s.phase = 'stopped';
      return s;
    case 'caseI':
      placeCarrierStart(s, d, 'caseI', va);
      break;
    case 'carrierGroove':
      setLanding(s, d);
      placeCarrierStart(s, d, 'carrierGroove', va);
      break;
    case 'catapult':
    case 'skiJump':
      if (d.launch?.kind !== start) throw new Error(`No ${start} launch for ${id}`);
      placeLaunchStart(s, d, launch);
      return s;
    case 'takeoff':
      s.gearDown = true; s.gearPos = 1;
      s.flapIndex = takeoffFlapIndex(d); s.flapPos = s.flapIndex / Math.max(1, d.flapLabels.length - 1);
      s.pos = { x: 0, y: 0, z: -TAKEOFF_START_M };
      s.phase = 'ready';
      s.takeoff = { maxPitchOnGroundDeg: 0, tailStrike: false };
      return s;
  }
  trim(s, d);
  updateNav(s, d);
  return s;
}

/** Drag deceleration, m/s², at load factor n. */
function drag(s: FlightOpsState, d: FlightOpsJetData, n: number) {
  const v = s.speed;
  const va = approachSpeedMs(d);
  // Configuration drag is scaled to the jet's approach speed, so every jet needs about the same power on final.
  const cfg = (K_GEAR * s.gearPos + K_FLAP * flapEffect(s, d) + K_SPEEDBRAKE * s.speedbrakePos) * (REF_VA / va) ** 2;
  const k = K_BASE + cfg;
  const induced = s.phase === 'air' ? K_INDUCED * n * n * (va / Math.max(v, 0.3 * va)) ** 2 : 0;
  return k * v * v + induced;
}

function bodyAoaRad(s: FlightOpsState, d: FlightOpsJetData) {
  return (d.aoa.unit === 'deg' ? s.aoa : s.aoa * UNITS_TO_DEG) * D2R;
}

/** Rotation target: Vr less the early pull, knots. */
export const rotateAtKt = (d: FlightOpsJetData) => d.takeoff.vrKt.value - (d.takeoff.pullEarlyKt?.value ?? 0);

/** Apply a cockpit action (gear, flaps, speed brake, nav mode and point). Ignored once crashed; gear stays down on the ground. */
export function applyAction(s: FlightOpsState, action: FlightOpsAction, data: FlightOpsJetData = FLIGHT_OPS[s.aircraft]): void {
  if (s.phase === 'crashed') return;
  const d = data;
  if (applyLaunchAction(s, action, d)) return;
  switch (action) {
    case 'gearToggle':
      if (s.phase !== 'air') return;
      s.gearDown = !s.gearDown;
      if (flapsFollowGear(d)) s.flapIndex = s.gearDown ? d.landingFlap : 0;
      if (s.takeoff && !s.gearDown && s.takeoff.gearUpT === undefined) {
        s.takeoff.gearUpT = s.t; s.takeoff.gearUpKt = s.speed / MPS_PER_KT;
      }
      return;
    case 'flapsDown':
      if (hasFlapSelector(d)) s.flapIndex = Math.min(d.flapLabels.length - 1, s.flapIndex + 1);
      return;
    case 'flapsUp':
      if (hasFlapSelector(d)) s.flapIndex = Math.max(0, s.flapIndex - 1);
      return;
    case 'speedbrakeToggle':
      s.speedbrakeOut = !s.speedbrakeOut;
      return;
    case 'navModeCycle':
      cycleNavMode(s, d);
      return;
    case 'navPointCycle':
      cycleNavPoint(s, d);
      return;
    case 'hookToggle':
      if (s.hookDown !== undefined && s.phase === 'air') s.hookDown = !s.hookDown;
      return;
    case 'callBall':
      if (s.lso && s.phase === 'air') s.lso.ballCalled = true;
  }
}

const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + clamp(target - cur, -rate * dt, rate * dt);

/** Advance the state by dt seconds (mutates s). */
export function stepFlightOps(s: FlightOpsState, input: FlightOpsInput, dt: number, data: FlightOpsJetData = FLIGHT_OPS[s.aircraft]): void {
  if (s.phase === 'crashed') return;
  const d = data;
  s.t += dt;

  // Engine and configuration animation.
  s.throttle += (clamp(input.throttle, 0, 1) - s.throttle) * Math.min(1, dt / THROTTLE_TAU);
  s.afterburner = !!input.afterburner && s.throttle > 0.95;
  s.gearPos = approach(s.gearPos, s.gearDown ? 1 : 0, 1 / GEAR_TIME, dt);
  const nFlap = Math.max(1, d.flapLabels.length - 1);
  s.flapPos = approach(s.flapPos, s.flapIndex / nFlap, 1 / FLAP_TIME, dt);
  s.speedbrakePos = approach(s.speedbrakePos, s.speedbrakeOut ? 1 : 0, 1 / SPEEDBRAKE_TIME, dt);
  if (s.hookDown !== undefined) s.hookPos = approach(s.hookPos ?? 0, s.hookDown ? 1 : 0, 1 / HOOK_TIME_S, dt);
  const thrust = IDLE_ACC + s.throttle * (MIL_ACC - IDLE_ACC) + (s.afterburner ? AB_ACC : 0);

  if (s.launch && stepLaunchDeck(s, input, dt, d)) return;
  if (s.phase === 'ready' || s.phase === 'roll') { stepTakeoffRoll(s, input, dt, d, thrust); updateNav(s, d); return; }
  if (s.ship && s.phase !== 'air') { stepCarrierDeck(s, dt); updateLso(s, d, dt); return; }
  if (s.phase !== 'air') { stepGround(s, input, dt, d, thrust); updateNav(s, d); return; }
  const prevU = s.ship ? landingFrame(s).u : 0;

  // Stick: AoA rate and roll rate.
  const on = d.aoa.onSpeed.value;
  s.aoa = clamp(s.aoa + clamp(input.pitch, -1, 1) * AOA_RATE * on * dt, ALPHA_N_MIN * on, ALPHA_N_MAX * on);
  s.bank = clamp(s.bank + clamp(input.roll, -1, 1) * ROLL_RATE * dt, -BANK_LIMIT, BANK_LIMIT);
  if (s.launch) stepLaunchAir(s, input, d);
  const n = loadFactor(s, d);
  if (n >= G_MAX || n <= -2) s.aoa = aoaForLoad(s, d, n); // G limiter: hold AoA at the limit

  const v = Math.max(s.speed, 1);
  s.speed = Math.max(0, s.speed + (thrust - drag(s, d, n) - G0 * Math.sin(s.gamma)) * dt);
  s.gamma = clamp(s.gamma + (G0 * (n * Math.cos(s.bank) - Math.cos(s.gamma)) / v) * dt, -80 * D2R, 80 * D2R);
  s.heading = wrap2Pi(s.heading + (G0 * n * Math.sin(s.bank) / (v * Math.cos(s.gamma))) * dt);
  s.pitch = s.gamma + bodyAoaRad(s, d);

  const h = v * Math.cos(s.gamma);
  s.pos.x += h * Math.sin(s.heading) * dt;
  s.pos.z -= h * Math.cos(s.heading) * dt;
  s.vs = v * Math.sin(s.gamma);
  s.pos.y += s.vs * dt;

  if (s.ship) {
    moveShip(s, dt);
    carrierContact(s, prevU);
    updateLso(s, d, dt);
    return;
  }
  if (s.pos.y <= 0) touchdown(s);
  updateNav(s, d);
}

function touchdown(s: FlightOpsState) {
  s.pos.y = 0;
  s.touchdown ??= { t: s.t, z: s.pos.z, x: s.pos.x, vsMs: s.vs, aoa: s.aoa, gearDown: s.gearPos > 0.95 };
  const onRunway = Math.abs(s.pos.x) <= RUNWAY.widthM / 2 && s.pos.z <= 0 && s.pos.z >= -RUNWAY.lengthM;
  const reason = s.gearPos < 0.95 ? 'Gear up at touchdown'
    : s.vs < -HARD_LANDING_MS ? 'Hard landing'
      : !onRunway ? (s.pos.z > 0 && Math.abs(s.pos.x) <= RUNWAY.widthM / 2 ? 'Short of the runway' : 'Off the runway')
        : null;
  if (reason) {
    s.phase = 'crashed'; s.crashReason = reason; s.speed = 0; s.vs = 0;
    return;
  }
  s.phase = 'rollout';
  s.gamma = 0; s.vs = 0; s.bank = 0;
}

/** Rollout, stop and takeoff roll. */
function stepGround(s: FlightOpsState, input: FlightOpsInput, dt: number, d: FlightOpsJetData, thrust: number) {
  s.pos.y = 0; s.gamma = 0; s.vs = 0; s.bank = 0;
  const braking = input.brakes || s.throttle < 0.3 ? WHEEL_BRAKE : ROLLING;
  const acc = thrust - drag(s, d, 1) - braking;
  if (s.phase === 'stopped' && acc <= 0) { s.speed = 0; s.pitch = approach(s.pitch, 0, 0.1, dt); return; }
  s.speed = Math.max(0, s.speed + acc * dt);
  const va = approachSpeedMs(d);
  if (s.speed > 0.95 * va && input.pitch > 0.2) {
    // Rotate and lift off: a gameplay transition, not a takeoff model.
    s.phase = 'air';
    s.aoa = aoaForLoad(s, d, 1.1);
    s.pos.y = 0.1;
    s.pitch = bodyAoaRad(s, d);
    return;
  }
  s.phase = s.speed < 0.5 && acc <= 0 ? 'stopped' : 'rollout';
  if (s.phase === 'stopped') s.speed = 0;
  s.pitch = approach(s.pitch, 0, 1.5 * D2R, dt);
  s.aoa = 0;
  // Nosewheel steering (roll input), weaker at speed.
  s.heading = wrap2Pi(s.heading + clamp(input.roll, -1, 1) * NWS_RATE * clamp(s.speed / 10, 0, 1) * dt);
  s.pos.x += s.speed * Math.sin(s.heading) * dt;
  s.pos.z -= s.speed * Math.cos(s.heading) * dt;
  if (Math.abs(s.pos.x) > RUNWAY.widthM / 2 + 5 || s.pos.z < -RUNWAY.lengthM - 300) {
    s.phase = 'crashed'; s.crashReason = 'Off the runway'; s.speed = 0;
  }
}

/** Ground move with nosewheel steering (roll input, weaker at speed); leaving the runway is a crash. */
function rollOnRunway(s: FlightOpsState, input: FlightOpsInput, dt: number) {
  s.heading = wrap2Pi(s.heading + clamp(input.roll, -1, 1) * NWS_RATE * clamp(s.speed / 10, 0, 1) * dt);
  s.pos.x += s.speed * Math.sin(s.heading) * dt;
  s.pos.z -= s.speed * Math.cos(s.heading) * dt;
  if (Math.abs(s.pos.x) > RUNWAY.widthM / 2 + 5 || s.pos.z < -RUNWAY.lengthM - 300) {
    s.phase = 'crashed'; s.crashReason = 'Off the runway'; s.speed = 0;
  }
}

/** Takeoff: brakes in 'ready', ground roll, rotation, tail strike and liftoff (arcade rules, AGENTS.md rule 1). */
function stepTakeoffRoll(s: FlightOpsState, input: FlightOpsInput, dt: number, d: FlightOpsJetData, thrust: number) {
  const t = d.takeoff;
  const rec = (s.takeoff ??= { maxPitchOnGroundDeg: 0, tailStrike: false });
  s.pos.y = 0; s.gamma = 0; s.vs = 0; s.bank = 0; s.aoa = 0;
  const braking = input.brakes || s.throttle < 0.3 ? WHEEL_BRAKE : ROLLING;
  if (s.phase === 'ready') {
    // Brakes hold the jet at any power; releasing with power above the brake-away level starts the roll.
    if (input.brakes || thrust * ROLL_THRUST - braking <= 0) { s.speed = 0; s.pitch = approach(s.pitch, 0, 3 * D2R, dt); return; }
    s.phase = 'roll';
    rec.brakeReleaseT ??= s.t;
  }
  const acc = thrust * ROLL_THRUST - drag(s, d, 1) - braking;
  s.speed = Math.max(0, s.speed + acc * dt);
  if (s.speed < 0.5 && acc <= 0) { s.speed = 0; s.phase = 'ready'; }
  const kt = s.speed / MPS_PER_KT;
  const vr = t.vrKt.value;

  // Rotation: back stick raises the nose above 0.8·Vr; neutral holds it; below that the nose stays down.
  const tail = t.tailStrikeDeg.value * D2R;
  const rate = kt >= ROTATE_MIN_VR * vr ? clamp(input.pitch, -1, 1) * ROTATE_RATE_DEG * D2R : -3 * D2R;
  const was = s.pitch;
  s.pitch = clamp(s.pitch + rate * dt, 0, tail);
  if (was <= 0 && s.pitch > 0 && rec.rotateT === undefined) { rec.rotateT = s.t; rec.rotateKt = kt; }
  const pDeg = s.pitch * R2D;
  rec.maxPitchOnGroundDeg = Math.max(rec.maxPitchOnGroundDeg, pDeg);
  if (s.pitch >= tail - 1e-9) rec.tailStrike = true;

  rollOnRunway(s, input, dt);
  if (s.phase === 'crashed') return;

  // Liftoff: in the pitch band at Vr + margin with enough wing for 1 g at this attitude, or late and shallow.
  const need = aoaForLoad(s, d, 1.02);
  const needDeg = d.aoa.unit === 'deg' ? need : need * UNITS_TO_DEG;
  const inBand = pDeg >= t.pitchDeg.value[0] && kt >= vr + LIFTOFF_MARGIN_KT && needDeg <= pDeg + 0.5;
  const late = pDeg >= LATE_LIFTOFF_PITCH_DEG && kt >= vr + LATE_LIFTOFF_KT;
  if (!inBand && !late) return;
  rec.liftoffT = s.t; rec.liftoffKt = kt; rec.liftoffPitchDeg = pDeg;
  s.phase = 'air';
  s.aoa = need;
  const body = bodyAoaRad(s, d);
  // Keep the attitude; where the wing needs more AoA than the attitude gives (late liftoff), the nose comes up.
  s.gamma = Math.max(0, s.pitch - body);
  s.pitch = s.gamma + body;
  s.vs = s.speed * Math.sin(s.gamma);
  s.pos.y = 0.1;
}

/** Heading error helper for pilots and evaluators, radians (−π..π). */
export const headingErr = (target: number, heading: number) => wrapPi(target - heading);
