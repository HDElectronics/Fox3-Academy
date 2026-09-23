/**
 * [OWNER: sim] Carrier Case I (issue #26): the moving ship, its angled landing area, the glide path to the
 * wires, the hook and what happens when it touches the deck. Arcade rules of what the DCS player sees
 * (AGENTS.md rule 1): the wire caught follows from where the hook lands; no arresting-gear model.
 *
 * World frame for carrier starts (metres): x east, y up above the sea, z south. `s.ship.x/z` is the ramp: the
 * stern on the ship's centreline. The ship steams on its BRC (`s.ship.heading`, north at the start).
 * - Ship frame: a forward from the ramp along the ship heading, c to starboard, h above the deck.
 * - Landing frame: u forward from the ramp along the angled axis (heading − angledDeckDeg), v right of that
 *   axis, h above the deck. The landing area runs u = 0..landingAreaLengthM, |v| ≤ landingAreaWidthM / 2.
 * - Wire i (1-based) lies at u = firstWireFromRampM + (i − 1) · wireSpacingM. The glide path meets the deck
 *   half a wire spacing before the target wire (wire 3), so an on-glide-path hook catches the target wire.
 * Deck contact on the landing area: gear up or a sink rate beyond CARRIER_HARD_MS is a crash; hook down
 * catches the first wire at or ahead of the touchdown point, else a bolter (the jet stays in the air phase,
 * held on the deck until it flies off). Passing the ramp below deck height is a ramp strike; below deck
 * height anywhere else on the hull is a crash; y ≤ 0 is the water. After a trap the jet stops with the ship.
 */
import { D2R, M_PER_FT, M_PER_NM, MPS_PER_KT, R2D, clamp, wrap2Pi } from '../math';
import { SHIPS, SHIP_HULL } from '../../data/ships';
import type { FlightOpsCarrierData, FlightOpsJetData, FlightOpsState, ShipData } from './types';

/** Sink rate beyond which a deck touchdown is a crash, m/s (about 1200 ft/min; gameplay value). */
export const CARRIER_HARD_MS = 6;
/** Arrest deceleration relative to the deck, m/s² (about 2.5 g; gameplay value). */
export const ARREST_DECEL = 25;
/** Hook travel time, seconds. */
export const HOOK_TIME_S = 1.5;
/** Hook position that counts as down. */
export const HOOK_DOWN_POS = 0.95;
/** The wire the glide path is set for. */
export const TARGET_WIRE = 3;
/** Case I start: 3 nm astern, just outboard of the starboard side (metres to starboard: gameplay value). */
export const CASE_I_START = { asternNm: 3, starboardM: 150 } as const;
/** 'carrierGroove' start range from the ramp, nm. */
export const GROOVE_START_NM = 0.75;
/** Groove region for the ball and the LSO: within this range astern of the ramp, nm. */
export const GROOVE_MAX_NM = 1.25;

export const carrierData = (d: FlightOpsJetData): FlightOpsCarrierData => {
  if (!d.carrier) throw new Error(`No carrier data for ${d.id}`);
  return d.carrier;
};
export const hasCarrierStart = (d: FlightOpsJetData) => d.carrier !== undefined;
export const shipData = (s: FlightOpsState): ShipData => SHIPS[s.ship!.id];

/** Wire position along the landing area, metres from the ramp. */
export const wireU = (ship: ShipData, wire: number) => ship.firstWireFromRampM.value + (wire - 1) * ship.wireSpacingM.value;
export const targetWire = (ship: ShipData) => Math.min(TARGET_WIRE, ship.wires.value);
/** Where the glide path meets the deck (hook touchdown aim), metres from the ramp. */
export const aimPointU = (ship: ShipData) => wireU(ship, targetWire(ship)) - ship.wireSpacingM.value / 2;
/** Landing-area heading (world, radians). */
export const landingHeading = (s: FlightOpsState) => wrap2Pi(s.ship!.heading - shipData(s).angledDeckDeg.value * D2R);

/** Wire caught for a hook touchdown at u (first wire at or ahead of it), or null past the last wire. */
export function wireAt(ship: ShipData, u: number): number | null {
  for (let i = 1; i <= ship.wires.value; i++) if (wireU(ship, i) >= u) return i;
  return null;
}

const fwd = (h: number) => ({ x: Math.sin(h), z: -Math.cos(h) });
const right = (h: number) => ({ x: Math.cos(h), z: Math.sin(h) });

/** Ship frame: a forward of the ramp, c to starboard, h above the deck. */
export function shipFrame(s: FlightOpsState) {
  const sh = s.ship!;
  const dx = s.pos.x - sh.x, dz = s.pos.z - sh.z;
  const f = fwd(sh.heading), r = right(sh.heading);
  return { a: dx * f.x + dz * f.z, c: dx * r.x + dz * r.z, h: s.pos.y - shipData(s).deckHeightM };
}

/** Landing frame: u forward of the ramp along the angled axis, v right of it, h above the deck. */
export function landingFrame(s: FlightOpsState) {
  const sh = s.ship!;
  const dx = s.pos.x - sh.x, dz = s.pos.z - sh.z;
  const hl = landingHeading(s);
  const f = fwd(hl), r = right(hl);
  return { u: dx * f.x + dz * f.z, v: dx * r.x + dz * r.z, h: s.pos.y - shipData(s).deckHeightM };
}

/** World point (x, z) of a landing-frame point, for the render (wires, landing-area corners, the jet on deck). */
export function landingToWorld(s: FlightOpsState, u: number, v: number): { x: number; z: number } {
  const sh = s.ship!;
  const hl = landingHeading(s);
  const f = fwd(hl), r = right(hl);
  return { x: sh.x + u * f.x + v * r.x, z: sh.z + u * f.z + v * r.z };
}

/** World point (x, z) of a ship-frame point (a forward, c starboard). */
export function shipToWorld(s: FlightOpsState, a: number, c: number): { x: number; z: number } {
  const sh = s.ship!;
  const f = fwd(sh.heading), r = right(sh.heading);
  return { x: sh.x + a * f.x + c * r.x, z: sh.z + a * f.z + c * r.z };
}

export interface CarrierGeometry {
  u: number; v: number; h: number;
  /** Distance astern of the ramp along the landing axis, metres (+ = short of the ramp). */
  rangeM: number;
  /** Glide-path error in degrees from the deck aim point (+ = high). */
  glideErrDeg: number;
  /** Lineup error in degrees seen from the far end of the landing area (+ = right of the centreline). */
  lineupErrDeg: number;
  /** Closure on the ship along the landing axis, m/s, and the sink rate that holds the glide path. */
  closureMs: number;
  glideSinkMs: number;
  /** Heading error to the landing axis, radians (+ = heading right of it). */
  headingErr: number;
  /** In the groove region: airborne, astern within GROOVE_MAX_NM, pointing at the deck, gear handle down or ball called. */
  inGroove: boolean;
}

export function carrierGeometry(s: FlightOpsState): CarrierGeometry {
  const ship = shipData(s);
  const { u, v, h } = landingFrame(s);
  const aim = aimPointU(ship);
  const toAim = aim - u;
  const glideErrDeg = Math.atan2(h, Math.max(toAim, 1)) * R2D - ship.glideDeg.value;
  const lineupErrDeg = Math.atan2(v, Math.max(ship.landingAreaLengthM - u, 1)) * R2D;
  const hl = landingHeading(s);
  const f = fwd(hl);
  const vh = s.speed * Math.cos(s.gamma);
  const sv = fwd(s.ship!.heading);
  const relX = vh * Math.sin(s.heading) - s.ship!.speedMs * sv.x;
  const relZ = -vh * Math.cos(s.heading) - s.ship!.speedMs * sv.z;
  const closureMs = relX * f.x + relZ * f.z;
  const headingErr = Math.atan2(Math.sin(s.heading - hl), Math.cos(s.heading - hl));
  // A jet on the initial passes astern too: the groove needs the gear handle down (or the ball called).
  const inGroove = s.phase === 'air' && !s.trap && u < 0 && -u <= GROOVE_MAX_NM * M_PER_NM
    && Math.abs(headingErr) < 30 * D2R && Math.abs(lineupErrDeg) < 10 && (s.gearDown || !!s.lso?.ballCalled);
  return {
    u, v, h, rangeM: -u, glideErrDeg, lineupErrDeg, closureMs,
    glideSinkMs: Math.max(0, closureMs) * Math.tan(ship.glideDeg.value * D2R), headingErr, inGroove,
  };
}

/** Heading that holds the landing centreline against the ship's drift (crab), radians. */
export function crabHeading(s: FlightOpsState): number {
  const ship = shipData(s);
  const drift = s.ship!.speedMs * Math.sin(ship.angledDeckDeg.value * D2R);
  return wrap2Pi(landingHeading(s) + Math.asin(clamp(drift / Math.max(s.speed, 1), -0.5, 0.5)));
}

/**
 * Place the jet for a carrier start. 'caseI': 3 nm astern at the initial altitude and speed on the BRC, clean,
 * hook up. 'carrierGroove': ¾ nm astern on the glide path and the landing centreline, gear, landing flaps and
 * hook down, on the approach speed. The caller sets flaps and trims.
 */
export function placeCarrierStart(s: FlightOpsState, d: FlightOpsJetData, start: 'caseI' | 'carrierGroove', approachMs: number): void {
  const c = carrierData(d);
  const ship = SHIPS[c.ship];
  s.ship = { id: ship.id, x: 0, z: 0, heading: 0, speedMs: ship.speedKt.value * MPS_PER_KT };
  s.hookDown = false; s.hookPos = 0;
  s.lso = { calls: [], ball: null, ballCalled: false, waveoff: false };
  if (start === 'caseI') {
    const p = shipToWorld(s, -CASE_I_START.asternNm * M_PER_NM, CASE_I_START.starboardM);
    s.pos = { x: p.x, y: c.pattern.initialAltFt.value * M_PER_FT, z: p.z };
    s.heading = s.ship.heading;
    s.speed = c.pattern.initialKt.value * MPS_PER_KT;
    return;
  }
  s.hookDown = true; s.hookPos = 1;
  s.speed = approachMs;
  const r = GROOVE_START_NM * M_PER_NM;
  const toAim = r + aimPointU(ship);
  const p = landingToWorld(s, -r, 0);
  s.pos = { x: p.x, y: ship.deckHeightM + toAim * Math.tan(ship.glideDeg.value * D2R), z: p.z };
  s.heading = crabHeading(s);
  const closure = s.speed - s.ship.speedMs * Math.cos(ship.angledDeckDeg.value * D2R);
  s.gamma = -Math.asin(clamp(closure * Math.tan(ship.glideDeg.value * D2R) / s.speed, 0, 0.5));
}

/** Move the ship along its heading. */
export function moveShip(s: FlightOpsState, dt: number): void {
  const sh = s.ship!;
  const f = fwd(sh.heading);
  sh.x += sh.speedMs * f.x * dt;
  sh.z += sh.speedMs * f.z * dt;
}

function crash(s: FlightOpsState, reason: string) {
  s.phase = 'crashed'; s.crashReason = reason; s.speed = 0; s.vs = 0;
}

/** Whether a ship-frame point is over the flight deck (hull outline). */
function overHull(s: FlightOpsState, a: number, c: number) {
  const hull = SHIP_HULL[s.ship!.id];
  return a >= 0 && a <= hull.lengthM && Math.abs(c) <= hull.beamM / 2;
}

/**
 * After an air step (ship already moved): deck contact, trap, bolter, ramp strike, water.
 * `prevU` is the landing-frame u before the step.
 */
export function carrierContact(s: FlightOpsState, prevU: number): void {
  const ship = shipData(s);
  if (s.pos.y <= 0) { s.pos.y = 0; crash(s, 'In the water'); return; }
  const { u, v, h } = landingFrame(s);
  if (h > 0) return;
  const sf = shipFrame(s);
  const onArea = u >= 0 && u <= ship.landingAreaLengthM && Math.abs(v) <= ship.landingAreaWidthM / 2;
  if (!onArea) {
    if (prevU < 0 && u >= 0 && Math.abs(v) <= SHIP_HULL[s.ship!.id].beamM / 2) { crash(s, 'Ramp strike'); return; }
    if (overHull(s, sf.a, sf.c)) crash(s, 'Off the landing area');
    return;
  }
  // On the landing area.
  if (!s.touchdown) {
    s.touchdown = { t: s.t, z: s.pos.z, x: s.pos.x, vsMs: s.vs, aoa: s.aoa, gearDown: s.gearPos > 0.95 };
    if (prevU < 0 && u >= 0 && h < -1) { crash(s, 'Ramp strike'); return; }
    if (s.gearPos < 0.95) { crash(s, 'Gear up at touchdown'); return; }
    if (s.vs < -CARRIER_HARD_MS) { crash(s, 'Hard landing'); return; }
    const power = s.throttle + (s.afterburner ? 0.5 : 0);
    const wire = (s.hookPos ?? 0) >= HOOK_DOWN_POS ? wireAt(ship, u) : null;
    s.trap = { t: s.t, wire, bolter: wire === null, powerAtTouchdown: power };
    if (wire !== null) {
      s.phase = 'rollout';
      s.heading = landingHeading(s);
      s.speed = Math.max(0, carrierClosure(s));
    }
  }
  // Held on the deck (bolter roll, or the arrest step that follows).
  s.pos.y = ship.deckHeightM;
  if (s.phase === 'air') { s.gamma = Math.max(0, s.gamma); s.vs = Math.max(0, s.vs); s.bank = 0; }
  else { s.gamma = 0; s.vs = 0; s.bank = 0; }
}

function carrierClosure(s: FlightOpsState) {
  return carrierGeometry(s).closureMs;
}

/**
 * Deck step after a trap: `s.speed` is the speed relative to the deck, decaying at ARREST_DECEL to a stop;
 * the jet then rides with the ship ('stopped').
 */
export function stepCarrierDeck(s: FlightOpsState, dt: number): void {
  const { u, v } = landingFrame(s);
  moveShip(s, dt);
  s.speed = Math.max(0, s.speed - ARREST_DECEL * dt);
  const p = landingToWorld(s, u + s.speed * dt, v);
  s.pos.x = p.x; s.pos.z = p.z; s.pos.y = shipData(s).deckHeightM;
  s.heading = landingHeading(s);
  s.gamma = 0; s.vs = 0; s.bank = 0; s.aoa = 0;
  s.pitch += clamp(-s.pitch, -2 * D2R * dt, 2 * D2R * dt);
  if (s.speed <= 0) s.phase = 'stopped';
}
