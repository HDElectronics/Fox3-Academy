/**
 * [OWNER: sim] Demo pilot: flies a clean left-hand overhead pattern from the initial to touchdown and rollout,
 * or (from the rtb start) follows the nav steering home and flies a straight-in on the glide path.
 * From the takeoff start it holds the brakes, sets takeoff power, rotates, raises gear and flaps and climbs
 * to 1500 ft.
 * Used by the page's demo and the `?shot` pre-roll. Simple gameplay controllers (track, altitude, speed, AoA),
 * not an autopilot model. Per-state leg memory lives in a WeakMap, so the pilot stays deterministic.
 */
import { D2R, G0, M_PER_FT, M_PER_NM, MPS_PER_KT, R2D, clamp } from '../math';
import { aimPointM, aoaForLoad, approachSpeedMs, hasFlapSelector, headingErr, levelThrottle, loadFactor, rotateAtKt } from './model';
import { STATION_MS_PER_THROTTLE, contactTarget, greenHoldPoint, tankerData } from './aar';
import { NAV_AUTO_SWITCH_M } from './nav';
import { aimPointU, carrierData, carrierGeometry, crabHeading, shipData, shipFrame } from './carrier';
import { ballInRange } from './lso';
import { launchPowerNeed, powerMet } from './launch';
import type { FlightOpsAction, FlightOpsInput, FlightOpsJetData, FlightOpsState, TankerFrameVec } from './types';

export type DemoLeg = 'launch' | 'takeoff' | 'climbout' | 'nav' | 'approach' | 'initial' | 'break' | 'downwind' | 'turn' | 'final' | 'rollout'
  | 'bolter' | 'rejoin' | 'precontact' | 'contact' | 'refuel' | 'disconnect' | 'done';
interface Memory { leg: DemoLeg; nextActT?: number; powerT?: number }
const memory = new WeakMap<FlightOpsState, Memory>();

/** Seconds past the threshold at which the demo breaks (the guides give 5–10 s). */
const BREAK_DELAY_S = 7;
const MIN_FINAL_M = 0.75 * M_PER_NM;
/** Straight-in (rtb): configure inside this range, hand over to the final leg inside FINAL_HANDOVER_M. */
const CONFIGURE_M = 9000;
const FINAL_HANDOVER_M = 3500;
/** Takeoff demo: gear up above this height with a positive climb, level off at the climb altitude. */
const GEAR_UP_M = 30 * M_PER_FT;
export const CLIMB_ALT_FT = 1500;
const CLIMB_KT = 300;

/** Current demo leg for a state (for lesson captions). */
export function demoLeg(s: FlightOpsState): DemoLeg | null {
  return memory.get(s)?.leg ?? null;
}

function initialLeg(s: FlightOpsState): DemoLeg {
  if (s.aar) return s.aar.station ? 'precontact' : 'rejoin';
  if (s.launch) return s.launch.stage === 'free' ? 'climbout' : 'launch';
  if (s.phase === 'ready' || s.phase === 'roll') return 'takeoff';
  if (s.phase !== 'air') return 'rollout';
  if (s.nav) return s.nav.mode === 'landing' ? 'approach' : 'nav';
  const north = Math.abs(headingErr(0, s.heading)) < Math.PI / 2;
  if (!north) return 'downwind';
  return s.gearDown ? 'final' : 'initial';
}

/** Target speed that puts the AoA in the middle of the band at 1 g with landing flaps. */
export function onSpeedTargetMs(d: FlightOpsJetData): number {
  const [lo, hi] = d.aoa.band.value;
  return approachSpeedMs(d) * Math.sqrt(d.aoa.onSpeed.value / ((lo + hi) / 2));
}

/**
 * Final-turn geometry: a semicircle from downwind (x = −2R) onto the centreline (x = 0). R is half the abeam
 * distance, widened when the on-speed turn would need more than 45° of bank (the F-15C's faster approach).
 */
export function finalTurnGeometry(d: FlightOpsJetData) {
  const va = onSpeedTargetMs(d);
  const r = Math.max((d.pattern.abeamNm.value * M_PER_NM) / 2, (va * va) / (G0 * Math.sin(Math.PI / 4)));
  const altM = d.pattern.downwindAltFt.value * M_PER_FT;
  const finalLen = clamp(altM / Math.tan(d.glideDeg.value * 1.6 * D2R) - Math.PI * r, MIN_FINAL_M, 3 * M_PER_NM);
  return { r, cx: -r, cz: finalLen - aimPointM(d), finalLen };
}

export function demoPilot(s: FlightOpsState, d: FlightOpsJetData): FlightOpsInput & { actions: FlightOpsAction[] } {
  let m = memory.get(s);
  if (!m) { m = { leg: initialLeg(s) }; memory.set(s, m); }
  const actions: FlightOpsAction[] = [];
  if (s.launch) {
    if (m.leg === 'launch' && s.launch.stage === 'free') m.leg = 'climbout';
    return launchPilot(s, d, m, actions);
  }
  if (s.aar) return aarPilot(s, d, m, actions);
  if (m.leg === 'takeoff' && s.phase === 'air') m.leg = 'climbout';
  if ((m.leg === 'takeoff' && (s.phase === 'ready' || s.phase === 'roll')) || (m.leg === 'climbout' && s.phase === 'air')) {
    return takeoffPilot(s, d, m.leg, actions);
  }
  if (s.ship) return carrierPilot(s, d, m, actions);
  const kt = s.speed / MPS_PER_KT;
  const va = onSpeedTargetMs(d);
  const geo = finalTurnGeometry(d);
  const gearKt = d.pattern.gearMaxKt.value;

  // Leg transitions.
  const range = s.pos.z + aimPointM(d);
  if (s.phase !== 'air') m.leg = 'rollout';
  else if (m.leg === 'nav' && s.nav?.mode === 'landing') m.leg = 'approach';
  else if (m.leg === 'approach' && range < FINAL_HANDOVER_M && s.gearPos > 0.99 && Math.abs(s.pos.x) < 60
    && Math.abs(headingErr(0, s.heading)) < 10 * D2R) m.leg = 'final';
  else if (m.leg === 'initial' && s.pos.z < -s.speed * BREAK_DELAY_S) m.leg = 'break';
  else if (m.leg === 'break' && Math.abs(headingErr(Math.PI, s.heading)) < 25 * D2R) m.leg = 'downwind';
  else if (m.leg === 'downwind' && s.pos.z >= geo.cz && s.gearPos > 0.99) m.leg = 'turn';
  else if (m.leg === 'turn' && Math.abs(headingErr(0, s.heading)) < 20 * D2R && s.pos.x > geo.cx) m.leg = 'final';

  // Nav: select landing mode at the intercept point where the cockpit does not switch by itself.
  const nav = s.nav;
  if (m.leg === 'nav' && nav && nav.distM < NAV_AUTO_SWITCH_M
    && (nav.mode === 'route' || !d.nav?.autoLandingSwitch.value)) actions.push('navModeCycle');

  // Configuration: speed brake for the F-16 break and the rtb descent, gear and landing flaps below the limit.
  const straightIn = m.leg === 'nav' || m.leg === 'approach';
  const cruiseMs = (gearKt - 30) * MPS_PER_KT;
  const wantBrake = (m.leg === 'break' && d.id === 'f16c' && kt > gearKt - 60 && kt > 230)
    || (straightIn && s.speed > cruiseMs + (s.speedbrakeOut ? 3 : 12) * MPS_PER_KT);
  if (wantBrake !== s.speedbrakeOut && m.leg !== 'rollout') actions.push('speedbrakeToggle');
  const configure = m.leg === 'downwind' || (m.leg === 'approach' && range < CONFIGURE_M);
  if (configure && !s.gearDown && kt < gearKt - 15) actions.push('gearToggle');
  if ((configure || m.leg === 'turn') && s.flapIndex < d.landingFlap && kt < gearKt - 15) actions.push('flapsDown');

  let heading = 0;
  let bankFF = 0;
  let bankGain = 1.5;
  let targetY = s.pos.y;
  let gammaCmd: number | null = null;
  let speedTarget = va;
  let breakG: number | null = null;

  switch (m.leg) {
    case 'nav':
      heading = nav?.steerHeading ?? s.heading;
      targetY = nav?.commandAltM ?? s.pos.y;
      speedTarget = cruiseMs;
      break;
    case 'approach': {
      heading = nav?.steerHeading ?? clamp(-s.pos.x * 0.0015, -0.5, 0.5);
      const glide = d.glideDeg.value * D2R;
      // Level below the glide path, then ride it down (capture from below).
      gammaCmd = clamp(-glide + (Math.max(0, range) * Math.tan(glide) - s.pos.y) * 0.004, -glide - 0.05, 0.02);
      speedTarget = s.gearDown && s.flapIndex >= d.landingFlap ? va : cruiseMs;
      break;
    }
    case 'initial':
      heading = clamp(-s.pos.x * 0.004, -0.3, 0.3);
      targetY = d.pattern.initialAltFt.value * M_PER_FT;
      speedTarget = d.pattern.initialKt.value * MPS_PER_KT;
      break;
    case 'break':
      breakG = d.pattern.breakG.value;
      targetY = d.pattern.downwindAltFt.value * M_PER_FT;
      speedTarget = 0;
      break;
    case 'downwind': {
      const xT = 2 * geo.cx;
      heading = Math.PI + clamp((s.pos.x - xT) * 0.003, -0.8, 0.8);
      targetY = d.pattern.downwindAltFt.value * M_PER_FT;
      speedTarget = s.gearDown ? va : (gearKt - 30) * MPS_PER_KT;
      break;
    }
    case 'turn': {
      const dx = s.pos.x - geo.cx;
      const dz = s.pos.z - geo.cz;
      const dist = Math.hypot(dx, dz);
      heading = Math.atan2(dz, dx) - clamp((dist - geo.r) * 0.004, -0.5, 0.5);
      bankFF = -Math.atan(s.speed * s.speed / (G0 * geo.r));
      // Planned bank for an on-speed turn of radius R: sin φ = va² / (g R).
      const planned = Math.asin(clamp((va * va) / (G0 * geo.r), 0, 0.9));
      // Angle about the centre: π abeam on downwind, π/2 at the ninety, 0 at rollout.
      const arcLeft = geo.r * clamp(Math.atan2(dz, dx), 0, Math.PI);
      // Steady descent through the turn: downwind altitude at the roll-in, on the glide path at the rollout.
      const hRoll = geo.finalLen * Math.tan(d.glideDeg.value * D2R);
      const alt = d.pattern.downwindAltFt.value * M_PER_FT;
      targetY = hRoll + (alt - hRoll) * clamp(arcLeft / (Math.PI * geo.r), 0, 1);
      // Hold on-speed AoA in the bank: a little more speed for the extra g.
      speedTarget = va * Math.sqrt(1 / Math.cos(planned * clamp(Math.atan2(dz, dx) / 0.6, 0, 1)));
      break;
    }
    case 'final': {
      heading = clamp(-s.pos.x * 0.006, -0.15, 0.15);
      bankGain = 2.5;
      const glide = d.glideDeg.value * D2R;
      const hT = Math.max(0, range) * Math.tan(glide);
      gammaCmd = -glide + clamp((hT - s.pos.y) * 0.006, -0.05, 0.05);
      if (s.pos.y < 6) gammaCmd = Math.max(gammaCmd, Math.asin(-1.3 / Math.max(s.speed, 1)));
      break;
    }
    case 'rollout':
      // Nosewheel steering back to the centreline.
      return { pitch: 0, roll: clamp(headingErr(clamp(-s.pos.x * 0.02, -0.1, 0.1), s.heading) * 10, -1, 1), throttle: 0, actions };
  }

  // Lateral: bank toward the heading error.
  let bank: number;
  if (breakG !== null) {
    const nv = clamp(1 + (targetY - s.pos.y) * 0.004 + (0 - s.vs) * 0.05, 0.5, 1.5);
    bank = -Math.acos(clamp(nv / breakG, 0, 1));
  } else {
    bank = clamp(bankFF + headingErr(heading, s.heading) * bankGain, -60 * D2R, 60 * D2R);
  }
  const roll = clamp((bank - s.bank) * 3, -1, 1);

  // Vertical: flight path command → load factor → AoA.
  if (gammaCmd === null) gammaCmd = clamp((targetY - s.pos.y) * 0.004, -6 * D2R, 6 * D2R);
  let n = Math.cos(s.gamma) / Math.max(0.2, Math.cos(s.bank)) + (s.speed * (gammaCmd - s.gamma) * (m.leg === 'final' ? 1.2 : m.leg === 'approach' ? 0.8 : 0.5)) / G0;
  if (breakG !== null) n = Math.max(n, breakG);
  const aoaT = aoaForLoad(s, d, clamp(n, -1, 7));
  const pitch = clamp((aoaT - s.aoa) / (0.6 * d.aoa.onSpeed.value * 0.15), -1, 1);

  // Throttle on speed (the final holds the AoA via speed).
  let throttle = clamp(0.45 + (speedTarget - s.speed) * 0.15 + (loadFactor(s, d) - 1) * 0.1, 0, 1);
  if (m.leg === 'break') throttle = 0;
  if (m.leg === 'final' && s.pos.y < 4) throttle = 0;
  return { pitch, roll, throttle, actions };
}

/** Takeoff and climb-out: brakes and power, rotate at Vr less the early pull, gear and flaps up, climb to 1500 ft. */
function takeoffPilot(s: FlightOpsState, d: FlightOpsJetData, leg: DemoLeg, actions: FlightOpsAction[]): FlightOpsInput & { actions: FlightOpsAction[] } {
  const t = d.takeoff;
  const kt = s.speed / MPS_PER_KT;
  const ab = t.afterburner.value;
  const [lo, hi] = t.pitchDeg.value;
  const mid = (lo + hi) / 2;
  const pitchDeg = s.pitch * R2D;
  if (leg === 'takeoff') {
    const steer = clamp(headingErr(clamp(-s.pos.x * 0.02, -0.1, 0.1), s.heading) * 10, -1, 1);
    // Hold the brakes until the engines are at takeoff power, then release.
    if (s.phase === 'ready') return { pitch: 0, roll: 0, throttle: 1, afterburner: ab, brakes: s.throttle < 0.95, actions };
    const pitch = kt >= rotateAtKt(d) ? clamp((mid - pitchDeg) * 0.5, -1, 1) : 0;
    return { pitch, roll: steer, throttle: 1, afterburner: ab, actions };
  }

  // Climb-out: gear up with a positive climb, then flaps up (AUTO on the Hornet) once clean and accelerating.
  if (s.gearDown && s.vs > 1 && s.pos.y > GEAR_UP_M) actions.push('gearToggle');
  if (!s.gearDown && s.gearPos < 0.5 && hasFlapSelector(d) && s.flapIndex > 0 && kt > t.vrKt.value + 30) actions.push('flapsUp');

  const roll = clamp((clamp(headingErr(0, s.heading) * 1.5, -0.3, 0.3) - s.bank) * 3, -1, 1);
  const clean = !s.gearDown && s.gearPos < 0.05;
  let pitch: number;
  if (!clean || s.pos.y < 150) {
    // Hold the takeoff attitude until clean.
    pitch = clamp((mid - pitchDeg) * 0.3, -1, 1);
  } else {
    const targetY = CLIMB_ALT_FT * M_PER_FT;
    const gammaCmd = clamp((targetY - s.pos.y) * 0.004, -6 * D2R, 12 * D2R);
    const n = Math.cos(s.gamma) + (s.speed * (gammaCmd - s.gamma) * 0.5) / G0;
    const aoaT = aoaForLoad(s, d, clamp(n, 0, 3));
    pitch = clamp((aoaT - s.aoa) / (0.6 * d.aoa.onSpeed.value * 0.15), -1, 1);
  }
  // Speed: climb speed once clean; below the gear and flap limits while they travel.
  const limitKt = Math.min(d.pattern.gearMaxKt.value, t.gearUpMaxKt.value) - 15;
  const targetMs = (clean ? CLIMB_KT : limitKt) * MPS_PER_KT;
  const throttle = clamp(0.45 + (targetMs - s.speed) * 0.15, 0, 1);
  return { pitch, roll, throttle, afterburner: ab && s.gearDown && kt < limitKt - 30, actions };
}

/** Carrier demo: break this far ahead of the ramp, metres (the guide: break before 4 nm). */
export const CARRIER_BREAK_AHEAD_M = 2000;
/** Hand the 180 to the groove leg inside this heading error to the centreline. */
const TURN_HANDOVER_RAD = 4 * D2R;
/** Roll in this much later than the circle geometry says: the lead-in onto the centreline takes room. */
const ROLL_IN_LEAD_M = 100;
/** Bank limits of the 180's lead-in onto the centreline. */
const LEAD_BANK_MIN = 5 * D2R;
const LEAD_BANK_MAX = 35 * D2R;
/** Height above the deck at which the demo sets touchdown power, metres. */
const POWER_AT_M = 6;

/**
 * Case I demo: initial on the BRC → break ahead of the ship → downwind (hook, gear, landing flaps) → the 180
 * onto the angled deck → groove, ball call at the ball range → touchdown at the touchdown power, holding the
 * glide path to the deck (no flare). After a bolter or waveoff: power and climb straight ahead.
 */
function carrierPilot(s: FlightOpsState, d: FlightOpsJetData, m: Memory, actions: FlightOpsAction[]): FlightOpsInput & { actions: FlightOpsAction[] } {
  const c = carrierData(d);
  const ship = shipData(s);
  const sf = shipFrame(s);
  const g = carrierGeometry(s);
  const brc = s.ship!.heading;
  const kt = s.speed / MPS_PER_KT;
  const gearKt = c.pattern.gearFlapsMaxKt.value;
  const va = onSpeedTargetMs(d);
  const glide = ship.glideDeg.value * D2R;

  if (s.phase !== 'air') m.leg = 'rollout';
  else if (s.trap?.bolter || s.lso?.waveoff) m.leg = 'bolter';
  else if (m.leg === 'initial' && sf.a >= CARRIER_BREAK_AHEAD_M) m.leg = 'break';
  else if (m.leg === 'break' && Math.abs(headingErr(brc + Math.PI, s.heading)) < 25 * D2R) m.leg = 'downwind';
  else if (m.leg === 'downwind' && sf.a <= carrierTurn(s, d).rollInA && s.gearPos > 0.99 && (s.hookPos ?? 0) > 0.99) m.leg = 'turn';
  else if (m.leg === 'turn' && Math.abs(headingErr(crabHeading(s), s.heading)) < TURN_HANDOVER_RAD) m.leg = 'final';

  if (m.leg === 'rollout') return { pitch: 0, roll: 0, throttle: s.phase === 'stopped' ? 0 : 1, actions };

  // Configuration: hook in the break, gear and landing flaps below the carrier limit on downwind.
  const pattern = m.leg === 'break' || m.leg === 'downwind' || m.leg === 'turn';
  if (pattern && !s.hookDown) actions.push('hookToggle');
  const configure = m.leg === 'downwind' || m.leg === 'turn';
  if (configure && !s.gearDown && kt < gearKt - 5) actions.push('gearToggle');
  if (configure && hasFlapSelector(d) && s.flapIndex < d.landingFlap && kt < gearKt - 5) actions.push('flapsDown');
  const wantBrake = (m.leg === 'break' || m.leg === 'downwind') && kt > gearKt + 10;
  if (wantBrake !== s.speedbrakeOut) actions.push('speedbrakeToggle');
  if (m.leg === 'final' && s.lso && !s.lso.ballCalled && ballInRange(s, d, g)) actions.push('callBall');

  let heading = s.heading;
  let targetY = s.pos.y;
  let gammaCmd: number | null = null;
  let speedTarget = va;
  const bankLimit = 60 * D2R;
  let bankGain = 1.5;
  let breakG: number | null = null;
  let turnBank: number | null = null;
  let throttleOverride: number | null = null;
  const deck = ship.deckHeightM;

  switch (m.leg) {
    case 'initial':
      heading = brc + clamp(-(sf.c - 150) * 0.004, -0.3, 0.3);
      targetY = c.pattern.initialAltFt.value * M_PER_FT;
      speedTarget = c.pattern.initialKt.value * MPS_PER_KT;
      break;
    case 'break': {
      // A break turn about as wide as the abeam distance (at most the jet's break g).
      const [lo, hi] = c.pattern.abeamNm.value;
      const r = ((lo + hi) / 2) * M_PER_NM / 2;
      breakG = clamp(Math.hypot(1, (s.speed * s.speed) / (G0 * r)), 1.5, d.pattern.breakG.value);
      targetY = c.pattern.downwindAltFt.value * M_PER_FT;
      throttleOverride = 0;
      break;
    }
    case 'downwind': {
      const [lo, hi] = c.pattern.abeamNm.value;
      const cT = -((lo + hi) / 2) * M_PER_NM;
      heading = brc + Math.PI + clamp((sf.c - cT) * 0.003, -0.8, 0.8);
      targetY = c.pattern.downwindAltFt.value * M_PER_FT;
      speedTarget = s.gearDown ? va : (gearKt - 15) * MPS_PER_KT;
      break;
    }
    case 'turn': {
      // Constant bank, then a lead turn that rolls out on the centreline: the radius that closes the lineup
      // offset v while the heading error e goes to zero is −v / (1 − cos e).
      turnBank = carrierTurn(s, d).bank;
      speedTarget = va * Math.sqrt(1 / Math.cos(turnBank));
      const e = headingErr(s.heading, crabHeading(s));
      if (e > 0 && e < Math.PI / 2 && g.v < 0) {
        const rNeed = Math.max(50, -g.v / Math.max(1e-3, 1 - Math.cos(e)));
        turnBank = clamp(Math.atan((s.speed * s.speed) / (G0 * rNeed)), LEAD_BANK_MIN, LEAD_BANK_MAX);
      }
      // Descend through the 180: downwind altitude → middle of the 90 band → the glide path at the rollout.
      const turned = clamp(Math.abs(headingErr(brc + Math.PI, s.heading)) / (Math.PI - ship.angledDeckDeg.value * D2R), 0, 1);
      const [n0, n1] = c.pattern.ninetyAltFt.value;
      const ninety = ((n0 + n1) / 2) * M_PER_FT;
      const onGlide = deck + Math.max(0, aimPointU(ship) - g.u) * Math.tan(glide);
      const dw = c.pattern.downwindAltFt.value * M_PER_FT;
      targetY = turned < 0.5 ? dw + (ninety - dw) * turned * 2 : ninety + (onGlide - ninety) * (turned - 0.5) * 2;
      break;
    }
    case 'final': {
      heading = crabHeading(s) + clamp(-g.v * 0.006, -0.15, 0.15);
      bankGain = 2.5;
      const hT = Math.max(0, aimPointU(ship) - g.u) * Math.tan(glide);
      gammaCmd = -Math.asin(clamp(g.glideSinkMs / Math.max(s.speed, 1), 0, 0.5)) + clamp((hT - g.h) * 0.006, -0.05, 0.05);
      if (g.h < POWER_AT_M) throttleOverride = 1;
      break;
    }
    case 'bolter':
      heading = s.trap ? s.heading : crabHeading(s);
      targetY = c.pattern.downwindAltFt.value * M_PER_FT;
      throttleOverride = 1;
      break;
  }

  let bank: number;
  if (breakG !== null) {
    const nv = clamp(1 + (targetY - s.pos.y) * 0.004 + (0 - s.vs) * 0.05, 0.5, 1.5);
    bank = -Math.acos(clamp(nv / breakG, 0, 1));
  } else if (turnBank !== null) {
    bank = -turnBank;
  } else {
    bank = clamp(headingErr(heading, s.heading) * bankGain, -bankLimit, bankLimit);
  }
  const roll = clamp((bank - s.bank) * 3, -1, 1);
  if (gammaCmd === null) gammaCmd = clamp((targetY - s.pos.y) * 0.004, -6 * D2R, (m.leg === 'bolter' ? 10 : 6) * D2R);
  let n = Math.cos(s.gamma) / Math.max(0.2, Math.cos(s.bank)) + (s.speed * (gammaCmd - s.gamma) * (m.leg === 'final' ? 1.2 : 0.5)) / G0;
  if (breakG !== null) n = Math.max(n, breakG);
  const aoaT = aoaForLoad(s, d, clamp(n, -1, 7));
  const pitch = clamp((aoaT - s.aoa) / (0.6 * d.aoa.onSpeed.value * 0.15), -1, 1);
  const throttle = throttleOverride ?? clamp(0.45 + (speedTarget - s.speed) * 0.15 + (loadFactor(s, d) - 1) * 0.1, 0, 1);
  return { pitch, roll, throttle, actions };
}

/**
 * The demo's 180: a constant-bank left turn from downwind that rolls out on the landing centreline at the
 * groove distance (mid groove time at on-speed closure). The turn radius covers the downwind offset plus
 * the centreline's offset at that range; the roll-in point allows for the ship steaming away during the turn.
 */
export function carrierTurn(s: FlightOpsState, d: FlightOpsJetData) {
  const c = carrierData(d);
  const ship = shipData(s);
  const va = onSpeedTargetMs(d);
  const ang = ship.angledDeckDeg.value * D2R;
  const closure = va - s.ship!.speedMs * Math.cos(ang);
  const [g0, g1] = c.pattern.grooveS.value;
  // Wings level by the ball call at the latest.
  const grooveM = Math.max(c.pattern.ballNm.value * M_PER_NM, ((g0 + g1) / 2) * closure - aimPointU(ship));
  const [lo, hi] = c.pattern.abeamNm.value;
  const abeam = ((lo + hi) / 2) * M_PER_NM;
  const r = (abeam + grooveM * Math.sin(ang)) / (1 + Math.cos(ang));
  const bank = Math.atan((va * va) / (G0 * r));
  const turnS = ((Math.PI - ang) * r) / va;
  const rollInA = -grooveM * Math.cos(ang) + s.ship!.speedMs * turnS + r * Math.sin(ang) - ROLL_IN_LEAD_M;
  return { r, bank, rollInA, grooveM };
}

/** Launch demo: one sequence step every LAUNCH_STEP_S, so the strip fills in order. */
export const LAUNCH_STEP_S = 0.8;
/** Clearing turn: heading change the demo flies, radians. */
const CLEARING_TURN_RAD = 20 * D2R;

/**
 * Deck launch (#27): perform the sequence in the data order (catapult: one action per LAUNCH_STEP_S, trim in
 * 1° clicks, power, salute once the power has been set a second; ski-jump: full afterburner, special
 * afterburner), hands off through the stroke and the settle, then gear up, flaps up (AUTO), the clearing turn
 * away from the other catapults and a climb to CLIMB_ALT_FT.
 */
function launchPilot(s: FlightOpsState, d: FlightOpsJetData, m: Memory, actions: FlightOpsAction[]): FlightOpsInput & { actions: FlightOpsAction[] } {
  const L = s.launch!;
  const l = d.launch!;
  const need = launchPowerNeed(l, L.weight);
  if (m.leg === 'launch') {
    if (L.stage !== 'hold') return { pitch: 0, roll: 0, throttle: 1, afterburner: need === 'AB' || l.kind === 'skiJump', actions };
    let throttle = 0;
    let ab = false;
    const ready = s.t >= (m.nextActT ?? 0);
    const act = (a: FlightOpsAction) => { if (ready) { actions.push(a); m.nextActT = s.t + LAUNCH_STEP_S; } };
    for (const st of l.steps) {
      const isDone = L.stepsDone.some(x => x.id === st.id);
      if (st.id === 'power') {
        throttle = 1; ab = need === 'AB';
        if (!powerMet(s, need)) { m.powerT = undefined; break; }
        if (m.powerT === undefined) { m.powerT = s.t; m.nextActT = Math.max(m.nextActT ?? 0, s.t + LAUNCH_STEP_S); }
        continue;
      }
      if (isDone || st.id === 'handsOff' || st.id === 'release') continue;
      if (st.id === 'trim') {
        if (L.trimDeg === L.trimWantDeg) continue;
        act((L.trimDeg ?? 0) < (L.trimWantDeg ?? 0) ? 'trimUp' : 'trimDown');
        break;
      }
      if (st.id === 'salute' && s.t - (m.powerT ?? s.t) < 1) break;
      act(st.id as FlightOpsAction);
      break;
    }
    return { pitch: 0, roll: 0, throttle, afterburner: ab, actions };
  }

  // After the launch: hands off through the settle, then clean up, clearing turn, climb.
  const kt = s.speed / MPS_PER_KT;
  if (s.gearDown && s.vs > 1) actions.push('gearToggle');
  if (!s.gearDown && s.gearPos < 0.5 && s.flapIndex > 0 && kt > d.takeoff.vrKt.value + 20) actions.push('flapsUp');
  if (L.stage === 'settle') return { pitch: 0, roll: 0, throttle: 1, afterburner: need === 'AB' || l.kind === 'skiJump', actions };
  const side = l.clearingTurn?.value[L.station];
  const target = (L.endHeading ?? 0) + (side === 'right' ? CLEARING_TURN_RAD : side === 'left' ? -CLEARING_TURN_RAD : 0);
  const roll = clamp((clamp(headingErr(target, s.heading) * 1.5, -0.4, 0.4) - s.bank) * 3, -1, 1);
  const targetY = CLIMB_ALT_FT * M_PER_FT;
  const gammaCmd = clamp((targetY - s.pos.y) * 0.004, -6 * D2R, 10 * D2R);
  const n = Math.cos(s.gamma) / Math.max(0.5, Math.cos(s.bank)) + (s.speed * (gammaCmd - s.gamma) * 0.5) / G0;
  const aoaT = aoaForLoad(s, d, clamp(n, 0, 3));
  const pitch = clamp((aoaT - s.aoa) / (0.6 * d.aoa.onSpeed.value * 0.15), -1, 1);
  const clean = !s.gearDown && s.gearPos < 0.05;
  const limitKt = Math.min(d.pattern.gearMaxKt.value, d.takeoff.gearUpMaxKt.value) - 15;
  const targetMs = (clean ? CLIMB_KT : limitKt) * MPS_PER_KT;
  const throttle = clamp(0.45 + (targetMs - s.speed) * 0.15, 0, 1);
  return { pitch, roll, throttle, afterburner: false, actions };
}

/** AAR demo: rejoin closure profile (m/s² of deceleration, cap m/s) and the station-mode gains. */
const REJOIN_DECEL = 0.3;
const REJOIN_CLOSE_MS = 25;
const STATION_POS_GAIN = 0.25;
const STATION_STICK_GAIN = 0.5;
/** Contact leg: aim this far through the basket (boom: past the nominal) so the closure holds at the target; align within ALIGN_M first. */
const CONTACT_THROUGH_M = 6;
const BOOM_THROUGH_M = 2;
const ALIGN_M = 0.3;
/** Back out at this opening rate, m/s (about 2 kt). */
const BACK_OUT_MS = 1;

/**
 * Air-to-air refuelling (#28): call the tanker and open the probe or door on the rejoin, fly the closure profile
 * to pre-contact, stabilise until cleared contact, close at the jet's closure target (aligned first), hold the
 * basket in the green band (or the boom at the nominal point) until the fuel target, then back out slowly
 * (drogue) or wait for the boom operator's disconnect and return to pre-contact.
 */
function aarPilot(s: FlightOpsState, d: FlightOpsJetData, m: Memory, actions: FlightOpsAction[]): FlightOpsInput & { actions: FlightOpsAction[] } {
  const a = s.aar!;
  const r = d.aar!;
  const T = tankerData(a.tanker);
  if (!a.called && s.t > 1) actions.push('callTanker');
  if (r.kind === 'probe' && r.keys.probe && !a.probeOut) actions.push('probeToggle');
  if (r.kind === 'boom' && !a.doorOpen && (!r.doorLimit || s.speed / MPS_PER_KT < r.doorLimit.operateKt.value)) actions.push('doorToggle');

  if (!a.station) return rejoinFlight(s, d, m, actions);
  const target = contactTarget(T);
  const through = T.kind === 'drogue' ? CONTACT_THROUGH_M : BOOM_THROUGH_M;
  const closeMs = ((r.closureKt.value[0] + r.closureKt.value[1]) / 2) * MPS_PER_KT;
  if (m.leg === 'rejoin') m.leg = 'precontact';
  if (m.leg === 'precontact' && a.cleared) m.leg = 'contact';
  if (m.leg === 'contact') {
    if (a.connected) m.leg = 'refuel';
    else if (a.relTarget.aft < -through - 1 || !a.cleared) m.leg = 'precontact';
  }
  if (m.leg === 'refuel' && !a.connected) m.leg = a.refuelComplete ? 'disconnect' : 'precontact';
  if (m.leg === 'refuel' && a.refuelComplete && T.kind === 'drogue') m.leg = 'disconnect';
  if (m.leg === 'disconnect' && !a.connected && Math.hypot(a.tip.aft - a.precontact.aft, a.tip.up - a.precontact.up) < 2) m.leg = 'done';

  let P: TankerFrameVec = a.precontact;
  let maxClose = 8, maxOpen = 2;
  if (m.leg === 'contact') {
    const aligned = Math.abs(a.relTarget.right) < ALIGN_M && Math.abs(a.relTarget.up) < ALIGN_M;
    P = { aft: target.aft - through, right: target.right, up: target.up };
    maxClose = aligned ? closeMs : 0.1;
  } else if (m.leg === 'refuel') {
    P = T.kind === 'drogue' ? greenHoldPoint(T) : target;
    maxClose = maxOpen = 0.5;
  } else if (m.leg === 'disconnect') {
    P = a.connected ? { ...a.precontact, right: a.tip.right, up: a.tip.up } : a.precontact;
    maxOpen = BACK_OUT_MS;
  }
  const e = { aft: P.aft - a.tip.aft, right: P.right - a.tip.right, up: P.up - a.tip.up };
  // Linear near the point, a constant-deceleration profile further out (arrive in pre-contact slowly).
  const cWant = clamp(-Math.sign(e.aft) * Math.min(Math.abs(e.aft) * STATION_POS_GAIN, Math.sqrt(2 * REJOIN_DECEL * Math.abs(e.aft))), -maxOpen, maxClose);
  const trim = levelThrottle(s, d, a.tankerSpeedMs);
  const throttle = clamp(trim + (cWant + 0.8 * (cWant - a.closureMs)) / STATION_MS_PER_THROTTLE, 0, 1);
  const pitch = clamp((e.up * STATION_STICK_GAIN) / 3, -1, 1);
  const roll = clamp((e.right * STATION_STICK_GAIN) / 3, -1, 1);
  return { pitch, roll, throttle, afterburner: false, actions };
}

/** Rejoin in the flight model: closure profile to the pre-contact point, heading and altitude onto the tanker. */
function rejoinFlight(s: FlightOpsState, d: FlightOpsJetData, m: Memory, actions: FlightOpsAction[]): FlightOpsInput & { actions: FlightOpsAction[] } {
  const a = s.aar!;
  m.leg = 'rejoin';
  const off = { aft: a.tip.aft - a.rel.aft, right: a.tip.right - a.rel.right, up: a.tip.up - a.rel.up };
  const want = { aft: a.precontact.aft - off.aft, right: a.precontact.right - off.right, up: a.precontact.up - off.up };
  const D = a.rel.aft - want.aft;
  const close = D > 0 ? Math.min(REJOIN_CLOSE_MS, Math.sqrt(2 * REJOIN_DECEL * Math.max(0, D - 20))) : -Math.min(5, -D * 0.1);
  const vWant = a.tankerSpeedMs + close;
  const hdg = a.tankerHeading + clamp(Math.atan2(want.right - a.rel.right, Math.max(D, 500)), -0.5, 0.5);
  const roll = clamp((clamp(headingErr(hdg, s.heading) * 1.5, -0.5, 0.5) - s.bank) * 3, -1, 1);
  const targetY = a.tankerPos.y + want.up;
  const gammaCmd = clamp((targetY - s.pos.y) * 0.01, -5 * D2R, 5 * D2R);
  const n = Math.cos(s.gamma) / Math.max(0.5, Math.cos(s.bank)) + (s.speed * (gammaCmd - s.gamma) * 0.5) / G0;
  const aoaT = aoaForLoad(s, d, clamp(n, 0, 3));
  const pitch = clamp((aoaT - s.aoa) / (0.6 * d.aoa.onSpeed.value * 0.15), -1, 1);
  const throttle = clamp(levelThrottle(s, d, s.speed) + (vWant - s.speed) * 0.1, 0, 1);
  return { pitch, roll, throttle, afterburner: false, actions };
}
