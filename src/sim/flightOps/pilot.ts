/**
 * [OWNER: sim] Demo pilot: flies a clean left-hand overhead pattern from the initial to touchdown and rollout,
 * or (from the rtb start) follows the nav steering home and flies a straight-in on the glide path.
 * From the takeoff start it holds the brakes, sets takeoff power, rotates, raises gear and flaps and climbs
 * to 1500 ft.
 * Used by the page's demo and the `?shot` pre-roll. Simple gameplay controllers (track, altitude, speed, AoA),
 * not an autopilot model. Per-state leg memory lives in a WeakMap, so the pilot stays deterministic.
 */
import { D2R, G0, M_PER_FT, M_PER_NM, MPS_PER_KT, R2D, clamp } from '../math';
import { aimPointM, aoaForLoad, approachSpeedMs, hasFlapSelector, headingErr, loadFactor, rotateAtKt } from './model';
import { NAV_AUTO_SWITCH_M } from './nav';
import type { FlightOpsAction, FlightOpsInput, FlightOpsJetData, FlightOpsState } from './types';

export type DemoLeg = 'takeoff' | 'climbout' | 'nav' | 'approach' | 'initial' | 'break' | 'downwind' | 'turn' | 'final' | 'rollout';
interface Memory { leg: DemoLeg }
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
  if (m.leg === 'takeoff' && s.phase === 'air') m.leg = 'climbout';
  if ((m.leg === 'takeoff' && (s.phase === 'ready' || s.phase === 'roll')) || (m.leg === 'climbout' && s.phase === 'air')) {
    return takeoffPilot(s, d, m.leg, actions);
  }
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
