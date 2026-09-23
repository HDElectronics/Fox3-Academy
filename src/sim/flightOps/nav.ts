/**
 * [OWNER: sim] Return-to-base navigation picture for the flight-ops trainer (issue #22).
 *
 * What the cockpit shows the player, as gameplay rules (AGENTS.md rule 1): the selected nav mode and its
 * label, the steer point, a steering heading and command altitude, and in landing mode the glide-slope and
 * localizer deviations with a tower call (none on the ground). Not a navigation-system model.
 *
 * - route (МРШ / NAV): steers to the selected lesson waypoint (WP1, then IAF = the glide-slope intercept point).
 * - return (ВЗВ): steers to the glide-slope intercept point on the extended centreline (+z) at the intercept
 *   altitude. With `autoLandingSwitch`, the mode changes to landing within NAV_AUTO_SWITCH_M of the point.
 * - landing (ПОС / ILSN): deviations from the jet's glide path (+ = high / right) and a steering heading back
 *   to the centreline. Tower calls change band with hysteresis at most every NAV_CALL_MIN_S seconds,
 *   and not inside NAV_CALL_MIN_RANGE_M of the aim point.
 *
 * Deterministic. The selected waypoint is read back from `nav.target.name`; call timing lives in a WeakMap.
 */
import { D2R, M_PER_FT, R2D, clamp, wrap2Pi } from '../math';
import { RUNWAY, type FlightOpsJetData, type FlightOpsNavData, type FlightOpsState, type NavModeId } from './types';

/** Distance to the intercept point at which return mode switches to landing mode, metres. */
export const NAV_AUTO_SWITCH_M = 3000;
/** Minimum time between two tower calls, seconds. */
export const NAV_CALL_MIN_S = 4;
/** Glide-slope bands: a call goes out beyond ±NAV_CALL_OFF_DEG, "on" returns inside ±NAV_CALL_ON_DEG. */
export const NAV_CALL_OFF_DEG = 0.5;
export const NAV_CALL_ON_DEG = 0.25;
/** No new calls inside this range of the aim point (flare and rollout). */
export const NAV_CALL_MIN_RANGE_M = 500;

export const NAV_CALLS = { above: 'Above glide path', below: 'Below glide path', on: 'On glide path', landing: 'Landing mode' } as const;

export interface NavPoint { name: string; x: number; z: number; altM: number }
type Band = 'above' | 'below' | 'on';
interface CallMemory { band: Band | null; t: number }
const calls = new WeakMap<FlightOpsState, CallMemory>();

/** Lesson route (runway frame): WP1 south-west of the field, then the IAF on the glide-slope intercept point. */
export function navRoute(nav: FlightOpsNavData): NavPoint[] {
  return [
    { name: 'WP1', x: -18000, z: 30000, altM: 3000 },
    { name: 'IAF', x: 0, z: nav.interceptPointM.value, altM: nav.interceptAltM.value },
  ];
}

export const INTERCEPT_NAME = 'Glide-slope intercept';
const RUNWAY_NAME = 'Runway';

function modeLabel(nav: FlightOpsNavData, mode: NavModeId) {
  return nav.modes.find(m => m.id === mode)?.label ?? mode;
}

/** Start the nav picture in `mode` (route mode steers to `point`, default the first waypoint). */
export function initNav(s: FlightOpsState, d: FlightOpsJetData, mode: NavModeId, point = 0): void {
  const nav = d.nav;
  if (!nav) return;
  const route = navRoute(nav);
  const p = route[clamp(point, 0, route.length - 1)];
  s.nav = {
    mode, label: modeLabel(nav, mode), target: { x: p.x, z: p.z, name: p.name }, distM: 0, bearing: 0,
    steerHeading: 0, commandAltM: null, glideDevDeg: null, locDevDeg: null, call: null,
  };
  calls.set(s, { band: null, t: -Infinity });
  updateNav(s, d);
}

/** Next mode in the cockpit order (wraps). */
export function cycleNavMode(s: FlightOpsState, d: FlightOpsJetData): void {
  if (!d.nav || !s.nav) return;
  const modes = d.nav.modes;
  const i = modes.findIndex(m => m.id === s.nav!.mode);
  setMode(s, d, modes[(i + 1) % modes.length].id);
}

/** Next waypoint in route mode (wraps). Return and landing modes have one airfield: no change. */
export function cycleNavPoint(s: FlightOpsState, d: FlightOpsJetData): void {
  if (!d.nav || !s.nav || s.nav.mode !== 'route') return;
  const route = navRoute(d.nav);
  const i = route.findIndex(p => p.name === s.nav!.target.name);
  const p = route[(i + 1) % route.length];
  s.nav.target = { x: p.x, z: p.z, name: p.name };
  updateNav(s, d);
}

function setMode(s: FlightOpsState, d: FlightOpsJetData, mode: NavModeId) {
  const nav = s.nav!;
  nav.mode = mode;
  nav.label = modeLabel(d.nav!, mode);
  nav.glideDevDeg = null; nav.locDevDeg = null;
  if (mode === 'route') {
    const p = navRoute(d.nav!)[0];
    nav.target = { x: p.x, z: p.z, name: p.name };
  }
  const mem = calls.get(s) ?? { band: null, t: -Infinity };
  mem.band = null;
  if (mode === 'landing') { nav.call = NAV_CALLS.landing; mem.t = s.t; } else nav.call = null;
  calls.set(s, mem);
  updateNav(s, d);
}

/** Recompute the nav picture (called by stepFlightOps each step; no-op without nav). */
export function updateNav(s: FlightOpsState, d: FlightOpsJetData): void {
  const nav = s.nav;
  const data = d.nav;
  if (!nav || !data) return;
  const aim = d.aimPointFt.value * M_PER_FT;
  const glide = d.glideDeg.value * D2R;

  if (nav.mode === 'return') {
    nav.target = { x: 0, z: data.interceptPointM.value, name: INTERCEPT_NAME };
    nav.commandAltM = data.interceptAltM.value;
  } else if (nav.mode === 'route') {
    const p = navRoute(data).find(q => q.name === nav.target.name) ?? navRoute(data)[0];
    nav.target = { x: p.x, z: p.z, name: p.name };
    nav.commandAltM = p.altM;
  } else {
    nav.target = { x: 0, z: -aim, name: RUNWAY_NAME };
  }

  const dx = nav.target.x - s.pos.x;
  const dz = nav.target.z - s.pos.z;
  nav.distM = Math.hypot(dx, dz);
  nav.bearing = wrap2Pi(Math.atan2(dx, -dz));
  nav.steerHeading = nav.bearing;

  if (nav.mode === 'return' && data.autoLandingSwitch.value && nav.distM < NAV_AUTO_SWITCH_M) {
    setMode(s, d, 'landing');
    return;
  }
  if (nav.mode !== 'landing' || s.phase !== 'air') { nav.glideDevDeg = null; nav.locDevDeg = null; return; }

  // Landing mode: deviations as approachGeometry measures them, a centreline intercept steer, tower calls.
  const range = s.pos.z + aim;
  nav.glideDevDeg = Math.atan2(s.pos.y, Math.max(range, 1)) * R2D - d.glideDeg.value;
  nav.locDevDeg = Math.atan2(s.pos.x, s.pos.z + RUNWAY.lengthM) * R2D;
  nav.steerHeading = wrap2Pi(clamp(-s.pos.x * 0.0015, -0.5, 0.5));
  nav.commandAltM = Math.max(0, range) * Math.tan(glide);
  updateCall(s, nav.glideDevDeg, range);
}

function updateCall(s: FlightOpsState, dev: number, range: number) {
  const nav = s.nav!;
  const mem = calls.get(s) ?? { band: null, t: -Infinity };
  calls.set(s, mem);
  if (range < NAV_CALL_MIN_RANGE_M) return;
  const cur: Band | null = dev > NAV_CALL_OFF_DEG ? 'above' : dev < -NAV_CALL_OFF_DEG ? 'below'
    : Math.abs(dev) < NAV_CALL_ON_DEG ? 'on' : mem.band;
  if (cur === null || cur === mem.band || s.t - mem.t < NAV_CALL_MIN_S) return;
  mem.band = cur; mem.t = s.t;
  nav.call = NAV_CALLS[cur];
}
