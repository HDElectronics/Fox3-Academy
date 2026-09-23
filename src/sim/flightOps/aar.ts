/**
 * [OWNER: sim] Air-to-air refuelling (issue #28): tanker racetrack, rejoin, pre-contact, contact, hose band or
 * boom envelope, disconnect and the radio calls. Game-level only (AGENTS.md rule 1): what the player does and
 * sees. The tanker, hose and boom are arcade abstractions: no hose dynamics, boom control laws or fuel system.
 *
 * World frame for AAR starts: x east, y up (altitude above the sea), z south. The tanker flies a left-hand
 * racetrack from the origin, first leg north. Tanker frame (`TankerFrameVec`): aft of the tanker reference (+),
 * right (+), up (+); it turns with the tanker (level, bank ignored), so a jet holding station turns with it.
 *
 * Station mode (arcade): inside the station zone behind the tanker the throttle sets closure (the throttle that
 * holds the tanker's speed in level flight = 0 closure, STATION_MS_PER_THROTTLE per unit away from it) and the
 * stick sets the up/down and left/right rate. Outside it the normal arcade flight model flies the jet.
 *
 * Contact rules (arcade):
 * - Drogue: the probe tip crosses the basket plane within BASKET_CAPTURE_M of the basket centre, probe out,
 *   cleared contact, closure at or below the tanker's bounce limit. Faster = bounce; off centre, probe in or
 *   not cleared = miss. Connected, the basket rides on the probe: the cone-to-pod distance picks the hose band.
 *   Disconnects: pulled out past the full trail (clean if opening ≤ CLEAN_OPEN_KT), red band longer than
 *   RED_GRACE_S, closer than the yellow band to the pod, outside the hose envelope, probe retracted.
 *   Fuel flows in the green band.
 * - Boom: the receptacle inside BOOM_CAPTURE_M of the nominal contact point, door open, cleared, closure at or
 *   below the limit: the boom operator makes contact. Outside the boom limits or door closed = disconnect.
 *   Fuel flows inside the limits; when the fuel target is reached the operator disconnects (clean).
 * - Clearance: after the intent-to-refuel call, PRECONTACT_STABLE_S stable in pre-contact = cleared contact.
 *   Every disconnect sends the jet back to pre-contact for a new clearance.
 * Deterministic: no randomness.
 */
import { D2R, M_PER_FT, M_PER_NM, MPS_PER_KT, R2D, G0, clamp, wrap2Pi } from '../math';
import { TANKERS } from '../../data/tankers';
import type {
  AarOptions, AarState, FlightOpsAarData, FlightOpsAction, FlightOpsInput, FlightOpsJetData, FlightOpsState, HoseBand,
  TankerData, TankerFrameVec, TankerId,
} from './types';

/** Seconds of fuel flow the lesson asks for (the fuel target = rate × this). */
export const AAR_HOLD_S = 30;
/** Probe and door travel time, s (gameplay). */
export const PROBE_TIME_S = 3;
/** Station zone: engage within this distance of the pre-contact point with closure below STATION_ENGAGE_MS. */
export const STATION_ENGAGE_M = 250;
export const STATION_RELEASE_M = 350;
export const STATION_ENGAGE_MS = 15;
/** Station mode: closure per unit of throttle away from the level-flight throttle, limit, lag; stick rates. */
export const STATION_MS_PER_THROTTLE = 20;
export const STATION_MAX_MS = 10;
export const STATION_TAU_S = 1.5;
export const STATION_STICK_MS = 3;
export const STATION_STICK_TAU_S = 0.8;
/** Pre-contact: zone for the stage, tolerance and time for the clearance, closure below which it is stable. */
export const PRECONTACT_ZONE_M = 30;
export const PRECONTACT_TOL_M = 3;
export const PRECONTACT_STABLE_S = 3;
export const PRECONTACT_STABLE_MS = 0.5;
/** Drogue pre-contact: behind the basket (Su-33: `closeFromM`) and below it. Boom: behind and below the nominal. */
export const DROGUE_PRECONTACT = { aft: 10, up: -1 } as const;
export const BOOM_PRECONTACT = { aft: 15, up: -3 } as const;
/** Contact capture radii and the miss radius. */
export const BASKET_CAPTURE_M = 0.6;
export const BASKET_MISS_M = 3;
export const BOOM_CAPTURE_M = 1;
/** Drogue: red band tolerated this long; the yellow band ends this close to the pod; clean pull-out rate. */
export const RED_GRACE_S = 3;
export const POD_MIN_M = 3;
export const CLEAN_OPEN_KT = 3;
/** Rejoin start: tanker this far ahead and the jet this far below. */
export const REJOIN_START = { aheadNm: 2, belowM: 100 } as const;

export const hasAarStart = (d: FlightOpsJetData) => d.aar !== undefined;
export function aarData(d: FlightOpsJetData): FlightOpsAarData {
  if (!d.aar) throw new Error(`No refuelling data for ${d.id}`);
  return d.aar;
}
export const tankerData = (id: TankerId): TankerData => TANKERS[id];

const v3 = (aft: number, right: number, up: number): TankerFrameVec => ({ aft, right, up });
const add = (a: TankerFrameVec, b: TankerFrameVec) => v3(a.aft + b.aft, a.right + b.right, a.up + b.up);
const sub = (a: TankerFrameVec, b: TankerFrameVec) => v3(a.aft - b.aft, a.right - b.right, a.up - b.up);
const len = (a: TankerFrameVec) => Math.hypot(a.aft, a.right, a.up);

/** Tanker pose on its racetrack at time t: left turns, first leg north from the origin. */
export function tankerPose(T: TankerData, t: number): { x: number; y: number; z: number; heading: number; bank: number; speedMs: number } {
  const v = T.speedKt.value * MPS_PER_KT;
  const bank = T.racetrack.bankDeg.value * D2R;
  const r = (v * v) / (G0 * Math.tan(bank));
  const L = T.racetrack.legNm.value * M_PER_NM;
  const per = 2 * L + 2 * Math.PI * r;
  const y = T.altFt.value * M_PER_FT;
  let s = (v * t) % per;
  if (s < L) return { x: 0, y, z: -s, heading: 0, bank: 0, speedMs: v };
  s -= L;
  if (s < Math.PI * r) {
    const th = s / r;
    return { x: -r + r * Math.cos(th), y, z: -L - r * Math.sin(th), heading: wrap2Pi(-th), bank: -bank, speedMs: v };
  }
  s -= Math.PI * r;
  if (s < L) return { x: -2 * r, y, z: -L + s, heading: Math.PI, bank: 0, speedMs: v };
  s -= L;
  const th = s / r;
  return { x: -r - r * Math.cos(th), y, z: r * Math.sin(th), heading: wrap2Pi(Math.PI - th), bank: -bank, speedMs: v };
}

/** World point → tanker frame. */
export function toTanker(a: AarState, p: { x: number; y: number; z: number }): TankerFrameVec {
  const dx = p.x - a.tankerPos.x, dz = p.z - a.tankerPos.z;
  const h = a.tankerHeading;
  return v3(-(dx * Math.sin(h) - dz * Math.cos(h)), dx * Math.cos(h) + dz * Math.sin(h), p.y - a.tankerPos.y);
}

/** Tanker frame → world point. */
export function fromTanker(a: AarState, v: TankerFrameVec): { x: number; y: number; z: number } {
  const h = a.tankerHeading;
  const f = -v.aft;
  return {
    x: a.tankerPos.x + f * Math.sin(h) + v.right * Math.cos(h),
    y: a.tankerPos.y + v.up,
    z: a.tankerPos.z - f * Math.cos(h) + v.right * Math.sin(h),
  };
}

/** Probe tip or receptacle in the world frame (receiver heading; pitch and bank ignored). */
export function contactPointWorld(s: FlightOpsState, d: FlightOpsJetData) {
  const c = aarData(d).contactPointM.value;
  const h = s.heading;
  return {
    x: s.pos.x + c.fwd * Math.sin(h) + c.right * Math.cos(h),
    y: s.pos.y + c.up,
    z: s.pos.z - c.fwd * Math.cos(h) + c.right * Math.sin(h),
  };
}

/** Basket at full trail below and behind the pod. */
export function basketRest(T: TankerData): TankerFrameVec {
  const g = T.drogue!;
  const droop = g.droopM.value;
  return add(g.pod, v3(Math.sqrt(g.trailM.value ** 2 - droop ** 2), 0, -droop));
}

/** Boom nozzle at the given elevation and extension (default: the nominal contact point). */
export function boomPoint(T: TankerData, elevDeg = T.boom!.nominal.elevDeg, extM = T.boom!.nominal.extM, azDeg = 0): TankerFrameVec {
  const e = elevDeg * D2R, az = azDeg * D2R;
  return add(T.boom!.pivot, v3(extM * Math.cos(e) * Math.cos(az), extM * Math.cos(e) * Math.sin(az), -extM * Math.sin(e)));
}

/** Contact target: basket at rest or the nominal boom contact point. */
export const contactTarget = (T: TankerData): TankerFrameVec => (T.kind === 'drogue' ? basketRest(T) : boomPoint(T));

/** Pre-contact point for the probe tip or receptacle. */
export function precontactPoint(T: TankerData, d: FlightOpsJetData): TankerFrameVec {
  if (T.kind === 'boom') return add(contactTarget(T), v3(BOOM_PRECONTACT.aft, 0, BOOM_PRECONTACT.up));
  return add(contactTarget(T), v3(aarData(d).closeFromM?.value ?? DROGUE_PRECONTACT.aft, 0, DROGUE_PRECONTACT.up));
}

/** Hose band for a cone-to-pod distance (null outside every band). */
export function hoseBandAt(T: TankerData, coneToPodM: number): HoseBand | null {
  const bands = T.drogue?.bands.value ?? [];
  for (const b of bands) if (coneToPodM >= b.from && coneToPodM <= b.to) return b.band;
  return null;
}

/** Green-band centre along the hose, tanker frame (where the demo holds the basket). */
export function greenHoldPoint(T: TankerData): TankerFrameVec {
  const g = T.drogue!;
  const green = g.bands.value.find(b => b.band === 'green')!;
  const dist = (green.from + green.to) / 2;
  const dir = sub(basketRest(T), g.pod);
  const k = dist / len(dir);
  return add(g.pod, v3(dir.aft * k, dir.right * k, dir.up * k));
}

/** Boom angles and extension from the pivot to a point. */
export function boomAngles(T: TankerData, p: TankerFrameVec) {
  const v = sub(p, T.boom!.pivot);
  const extM = len(v);
  const elevDeg = Math.atan2(-v.up, Math.hypot(v.aft, v.right)) * R2D;
  const azDeg = Math.atan2(v.right, v.aft) * R2D;
  const L = T.boom!.limits.value;
  const inLimits = elevDeg >= L.elevDeg[0] && elevDeg <= L.elevDeg[1] && Math.abs(azDeg) <= L.azDeg && extM >= L.extM[0] && extM <= L.extM[1];
  return { elevDeg, azDeg, extM, inLimits };
}

interface Arm { armed: boolean; prevRel: TankerFrameVec | null; prevTip: TankerFrameVec | null; doorOver: boolean }
const arms = new WeakMap<AarState, Arm>();
const armOf = (a: AarState) => {
  let m = arms.get(a);
  if (!m) { m = { armed: true, prevRel: null, prevTip: null, doorOver: false }; arms.set(a, m); }
  return m;
};

function say(a: AarState, t: number, from: 'player' | 'tanker', text: string) {
  a.calls.push({ t, from, text });
}

/** Place the jet for the 'aarRejoin' or 'aarPrecontact' start (throws when the jet has no refuelling data). */
export function placeAarStart(s: FlightOpsState, d: FlightOpsJetData, start: 'aarRejoin' | 'aarPrecontact', opts: AarOptions = {}): void {
  const r = aarData(d);
  const id = opts.tanker ?? r.tanker;
  if (!r.tankers.includes(id)) throw new Error(`${d.id} does not refuel from the ${id}`);
  const T = tankerData(id);
  const pose = tankerPose(T, 0);
  const fixedProbe = r.kind === 'probe' && !r.keys.probe;
  const a: AarState = {
    tanker: id, kind: T.kind,
    tankerPos: { x: pose.x, y: pose.y, z: pose.z }, tankerHeading: pose.heading, tankerBank: pose.bank, tankerSpeedMs: pose.speedMs,
    rel: v3(0, 0, 0), tip: v3(0, 0, 0), relTarget: v3(0, 0, 0), precontact: precontactPoint(T, d), closureMs: 0,
    stage: 'rejoin', station: false, relVel: v3(0, 0, 0),
    probeOut: fixedProbe, probePos: fixedProbe ? 1 : 0, doorOpen: false, doorPos: 0, lights: false,
    called: false, cleared: false, precontactStableS: 0, connected: false,
    contacts: [], disconnects: [], bounces: 0, misses: 0, timeInContactS: 0, timeInEnvelopeS: 0,
    fuel: 0, fuelTarget: Math.round(T.fuel.ratePerS.value * AAR_HOLD_S), fuelUnit: T.fuel.unit, refuelComplete: false,
    coneToPodM: null, hoseBand: null, belowPodM: null, redS: 0, boom: null, calls: [], errors: [],
  };
  s.aar = a;
  s.heading = pose.heading;
  s.speed = pose.speedMs;
  const c = r.contactPointM.value;
  const offset = v3(-c.fwd, c.right, c.up);
  if (start === 'aarRejoin') {
    a.rel = v3(REJOIN_START.aheadNm * M_PER_NM, 0, a.precontact.up - offset.up - REJOIN_START.belowM);
  } else {
    a.rel = sub(a.precontact, offset);
    a.station = true;
    if (r.kind === 'probe') { a.probeOut = true; a.probePos = 1; } else { a.doorOpen = true; a.doorPos = 1; }
    a.called = true;
    say(a, 0, 'player', `Tanker, ${r.callText.value.toLowerCase()}`);
    say(a, 0, 'tanker', 'Cleared pre-contact');
  }
  s.pos = fromTanker(a, a.rel);
  updateAar(s, d, 0);
}

/** AAR cockpit actions. Returns true when the action belongs to AAR (handled or refused). */
export function applyAarAction(s: FlightOpsState, action: FlightOpsAction, d: FlightOpsJetData): boolean {
  const a = s.aar;
  if (!a || !d.aar) return false;
  const r = d.aar;
  const kt = s.speed / MPS_PER_KT;
  switch (action) {
    case 'probeToggle':
      if (r.kind === 'probe' && r.keys.probe) a.probeOut = !a.probeOut;
      return true;
    case 'doorToggle':
      if (r.kind !== 'boom') return true;
      if (r.doorLimit && kt > r.doorLimit.operateKt.value) {
        a.errors.push(`Door refused: open or close below ${r.doorLimit.operateKt.value} kt / M${r.doorLimit.operateMach.value}`);
        return true;
      }
      a.doorOpen = !a.doorOpen;
      return true;
    case 'refuelLights':
      a.lights = !a.lights;
      return true;
    case 'callTanker':
      if (a.called) return true;
      a.called = true;
      say(a, s.t, 'player', `Tanker, ${r.callText.value.toLowerCase()}`);
      say(a, s.t, 'tanker', 'Cleared pre-contact');
      return true;
    default:
      return false;
  }
}

/** Level-flight throttle at a speed, supplied by the model (avoids an import cycle on private drag terms). */
export type LevelThrottle = (s: FlightOpsState, d: FlightOpsJetData, speedMs: number) => number;

/**
 * Move the tanker and, when station mode is active, fly the jet in the tanker frame. Returns true when station
 * mode flew the jet this step (the caller skips the flight model); updateAar must follow either way.
 */
export function stepAarStation(s: FlightOpsState, input: FlightOpsInput, dt: number, d: FlightOpsJetData, level: LevelThrottle): boolean {
  const a = s.aar!;
  const T = tankerData(a.tanker);
  const pose = tankerPose(T, s.t);
  a.tankerPos = { x: pose.x, y: pose.y, z: pose.z };
  a.tankerHeading = pose.heading; a.tankerBank = pose.bank; a.tankerSpeedMs = pose.speedMs;
  if (s.phase !== 'air') return false;

  // Distances from the last step's tanker-frame picture (the tanker has already moved on).
  const dist = len(sub(a.tip, a.precontact));
  const want = input.stationKeep !== false && (a.connected || (a.station ? dist <= STATION_RELEASE_M
    : dist <= STATION_ENGAGE_M && Math.abs(a.closureMs) <= STATION_ENGAGE_MS));
  if (!want) { a.station = false; return false; }
  if (!a.station) {
    // Enter: keep the relative velocity the jet had.
    const h = s.heading, th = a.tankerHeading, v = s.speed * Math.cos(s.gamma);
    const dvx = v * Math.sin(h) - a.tankerSpeedMs * Math.sin(th);
    const dvz = -v * Math.cos(h) + a.tankerSpeedMs * Math.cos(th);
    a.relVel = v3(-(dvx * Math.sin(th) - dvz * Math.cos(th)), dvx * Math.cos(th) + dvz * Math.sin(th), s.vs);
    a.station = true;
  }
  const trim = level(s, d, a.tankerSpeedMs);
  const close = clamp((s.throttle - trim) * STATION_MS_PER_THROTTLE, -STATION_MAX_MS, STATION_MAX_MS);
  const kA = Math.min(1, dt / STATION_TAU_S), kS = Math.min(1, dt / STATION_STICK_TAU_S);
  a.relVel.aft += (-close - a.relVel.aft) * kA;
  a.relVel.up += (clamp(input.pitch, -1, 1) * STATION_STICK_MS - a.relVel.up) * kS;
  a.relVel.right += (clamp(input.roll, -1, 1) * STATION_STICK_MS - a.relVel.right) * kS;
  a.rel = add(a.rel, v3(a.relVel.aft * dt, a.relVel.right * dt, a.relVel.up * dt));
  s.pos = fromTanker(a, a.rel);
  const fwd = a.tankerSpeedMs - a.relVel.aft;
  s.speed = Math.hypot(fwd, a.relVel.right, a.relVel.up);
  s.heading = wrap2Pi(a.tankerHeading + Math.atan2(a.relVel.right, fwd));
  s.gamma = Math.asin(clamp(a.relVel.up / Math.max(1, s.speed), -1, 1));
  s.vs = a.relVel.up;
  s.bank = a.tankerBank + clamp(input.roll, -1, 1) * 10 * D2R;
  return true;
}

function disconnect(s: FlightOpsState, a: AarState, reason: string, clean: boolean) {
  a.connected = false;
  a.disconnects.push({ t: s.t, reason, clean });
  a.cleared = false;
  a.precontactStableS = 0;
  a.redS = 0;
  armOf(a).armed = false;
  say(s.aar!, s.t, 'tanker', clean ? (a.refuelComplete ? 'Disconnect. Refuelling complete' : 'Disconnect')
    : `Disconnect: ${reason.toLowerCase()}. Back to pre-contact`);
}

/** Refresh the refuelling picture and apply the contact and disconnect rules (called by stepFlightOps). */
export function updateAar(s: FlightOpsState, d: FlightOpsJetData, dt: number): void {
  const a = s.aar!;
  const r = aarData(d);
  const T = tankerData(a.tanker);
  const arm = armOf(a);
  a.probePos = clamp(a.probePos + (a.probeOut ? 1 : -1) * (dt / PROBE_TIME_S), 0, 1);
  a.doorPos = clamp(a.doorPos + (a.doorOpen ? 1 : -1) * (dt / PROBE_TIME_S), 0, 1);
  a.rel = toTanker(a, s.pos);
  const tip = toTanker(a, contactPointWorld(s, d));
  if (dt > 0 && arm.prevTip) a.closureMs = (arm.prevTip.aft - tip.aft) / dt;
  else if (!arm.prevTip) a.closureMs = s.speed * Math.cos(s.gamma) * Math.cos(s.heading - a.tankerHeading) - a.tankerSpeedMs;
  a.tip = tip;
  const target = contactTarget(T);
  const prevRel = arm.prevRel;
  a.relTarget = sub(tip, target);
  arm.prevRel = a.relTarget;
  arm.prevTip = tip;
  const closureKt = a.closureMs / MPS_PER_KT;
  const kt = s.speed / MPS_PER_KT;

  // F-16C: door open above the open limit.
  if (r.doorLimit && a.doorPos > 0 && kt > r.doorLimit.openKt.value) {
    if (!arm.doorOver) a.errors.push(`Door open above ${r.doorLimit.openKt.value} kt / M${r.doorLimit.openMach.value}`);
    arm.doorOver = true;
  } else arm.doorOver = false;

  // Re-arm contact after a disconnect once the tip is back behind the target.
  if (!arm.armed && a.relTarget.aft > 2) arm.armed = true;

  // Clearance: stable in pre-contact after the call.
  const pre = len(sub(tip, a.precontact));
  if (a.called && !a.cleared && !a.connected) {
    a.precontactStableS = pre <= PRECONTACT_TOL_M && Math.abs(a.closureMs) <= PRECONTACT_STABLE_MS ? a.precontactStableS + dt : 0;
    if (a.precontactStableS >= PRECONTACT_STABLE_S) { a.cleared = true; say(a, s.t, 'tanker', 'Cleared contact'); }
  }

  if (T.kind === 'drogue') {
    const g = T.drogue!;
    if (!a.connected && arm.armed && prevRel && prevRel.aft > 0 && a.relTarget.aft <= 0 && s.phase === 'air') {
      const radial = Math.hypot(a.relTarget.right, a.relTarget.up);
      if (radial <= BASKET_CAPTURE_M) {
        if (a.probePos < 1) { a.misses++; a.errors.push('Probe not out at the basket'); }
        else if (!a.cleared) { a.misses++; a.errors.push('Contact without clearance: stabilise in pre-contact'); }
        else if (closureKt > g.maxClosureKt.value) {
          a.bounces++; arm.armed = false;
          say(a, s.t, 'tanker', `Bounce: ${closureKt.toFixed(1)} kt closure. Back to pre-contact`);
        } else {
          a.connected = true; a.redS = 0;
          a.contacts.push({ t: s.t, closureKt });
          say(a, s.t, 'tanker', 'Contact');
        }
      } else if (radial <= BASKET_MISS_M) { a.misses++; arm.armed = false; }
    }
    const pod = g.pod;
    const cone = a.connected ? len(sub(tip, pod)) : g.trailM.value;
    a.coneToPodM = cone;
    a.hoseBand = hoseBandAt(T, Math.min(cone, g.trailM.value));
    a.belowPodM = pod.up - tip.up;
    a.boom = null;
    if (a.connected) {
      a.timeInContactS += dt;
      a.redS = a.hoseBand === 'red' ? a.redS + dt : 0;
      const env = g.envelope.value;
      const lateral = Math.abs(tip.right - basketRest(T).right);
      if (a.probePos < 1) disconnect(s, a, 'Probe retracted', false);
      else if (cone >= g.trailM.value) {
        const clean = -closureKt <= CLEAN_OPEN_KT;
        disconnect(s, a, clean ? 'Backed out' : 'Pulled out too fast', clean);
      } else if (cone < POD_MIN_M) disconnect(s, a, 'Too close to the pod', false);
      else if (lateral > env.lateralM || a.belowPodM < env.belowPodM[0] || a.belowPodM > env.belowPodM[1]) {
        disconnect(s, a, 'Outside the hose envelope', false);
      } else if (a.redS > RED_GRACE_S) disconnect(s, a, 'Hose band red', false);
      else if (a.hoseBand === 'green') flow(s, a, T, dt);
    }
  } else {
    const inside = len(a.relTarget) <= BOOM_CAPTURE_M;
    const wasInside = prevRel ? len(prevRel) <= BOOM_CAPTURE_M : false;
    if (!a.connected && arm.armed && inside && s.phase === 'air') {
      const lim = T.boom!.maxClosureKt.value;
      if (a.doorPos >= 1 && a.cleared && Math.abs(closureKt) <= lim) {
        a.connected = true;
        a.contacts.push({ t: s.t, closureKt });
        say(a, s.t, 'tanker', 'Contact');
      } else if (!wasInside) {
        if (Math.abs(closureKt) > lim) { a.bounces++; arm.armed = false; say(a, s.t, 'tanker', `Too fast: ${closureKt.toFixed(1)} kt. Back to pre-contact`); }
        else { a.misses++; a.errors.push(a.doorPos < 1 ? 'Door closed at the boom' : 'Contact without clearance: stabilise in pre-contact'); }
      }
    }
    const ang = boomAngles(T, a.connected ? tip : target);
    const e = a.relTarget;
    a.boom = {
      ...ang,
      cueUpDown: Math.abs(e.up) > 0.5 ? (e.up < 0 ? 'up' : 'down') : null,
      cueForeAft: Math.abs(e.aft) > 0.5 ? (e.aft > 0 ? 'fwd' : 'aft') : null,
    };
    a.coneToPodM = null; a.hoseBand = null; a.belowPodM = null;
    if (a.connected) {
      a.timeInContactS += dt;
      if (a.doorPos < 1) disconnect(s, a, 'Door closed', false);
      else if (!ang.inLimits) disconnect(s, a, 'Boom limit', false);
      else {
        flow(s, a, T, dt);
        if (a.refuelComplete) disconnect(s, a, 'Refuelling complete', true);
      }
    }
  }
  a.stage = a.connected ? 'contact' : pre <= PRECONTACT_ZONE_M || (a.relTarget.aft > -5 && a.relTarget.aft <= a.precontact.aft - target.aft + 5
    && Math.hypot(a.relTarget.right, a.relTarget.up) <= 10) ? 'precontact' : 'rejoin';
}

function flow(s: FlightOpsState, a: AarState, T: TankerData, dt: number) {
  a.timeInEnvelopeS += dt;
  a.fuel = Math.min(a.fuelTarget, a.fuel + T.fuel.ratePerS.value * dt);
  if (!a.refuelComplete && a.fuel >= a.fuelTarget) {
    a.refuelComplete = true;
    say(a, s.t, 'tanker', T.kind === 'drogue' ? 'Refuelling complete. Back out' : 'Refuelling complete');
  }
}
