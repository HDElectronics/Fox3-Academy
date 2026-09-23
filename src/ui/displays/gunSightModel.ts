/**
 * [OWNER: displays] Gun sight picture: which HUD gun sight each jet shows (data/wvr.ts GUNS[id].sight) and where
 * its pipper, funnel and marks sit, from the sim's simplified sight geometry (sim/guns.ts sightPoint). Pure, no
 * DOM: GunSightDisplay draws the result. Game-tutorial scope: the symbols follow what each jet's HUD shows in
 * DCS; the geometry is the trainer's lead-computing approximation and every display labels it "simplified".
 */
import { AIRCRAFT } from '../../data/aircraft';
import type { AircraftId } from '../../data/types';
import { gunSpecFor, type GunSightKind } from '../../data/wvr';
import { liftVector } from '../../sim/flight';
import { gunSolution, sightPoint, type SightPoint } from '../../sim/guns';
import type { Aircraft } from '../../sim/types';
import { Vector3 } from 'three';

const FT = 0.3048;

/** HUD name of each sight kind, as the pilot reads it in the manual. */
export const SIGHT_NAME: Record<GunSightKind, string> = {
  funnel: 'Gun funnel',
  lcos: 'LCOS',
  'hornet-funnel': 'Funnel',
  'hornet-director': 'Director',
  'eegs-funnel': 'EEGS Level II',
  'eegs-pipper': 'EEGS Level V',
  rtgs: 'RTGS',
  'rtgs-track': 'RTGS track',
  'range-reticle': 'Gun reticle',
  ss: 'SS',
  sslc: 'SSLC',
  cclt: 'CCLT',
};

export interface SightStyle {
  kind: GunSightKind;
  name: string;
  /** The sight choice comes from a manual (data `verified`). The geometry is always simplified. */
  verified: boolean;
  note?: string;
}

/** Sight kinds the pilot can pick on this jet without a lock (JF-17: SS or SSLC). */
export function noLockOptions(type: string): GunSightKind[] {
  const spec = gunSpecFor(type);
  if (!spec) return [];
  return [spec.sight.noLock.value, ...(spec.sight.other?.value ?? [])].filter((k, i, a) => a.indexOf(k) === i);
}

/**
 * The sight this jet's HUD shows: `locked` = the radar tracks the target. `pick` chooses among the jet's
 * no-lock options (JF-17 SS / SSLC); ignored when it is not one of them. Null: no gun data for this jet.
 */
export function sightStyleFor(type: string, locked: boolean, pick?: GunSightKind): SightStyle | null {
  const spec = gunSpecFor(type);
  if (!spec) return null;
  const src = locked ? spec.sight.lock : spec.sight.noLock;
  let kind = src.value;
  if (!locked && pick && noLockOptions(type).includes(pick)) kind = pick;
  // The M-2000C keeps the CCLT with a lock (the distance meter appears); name it the same way.
  return { kind, name: SIGHT_NAME[kind], verified: src.verified, note: src.note };
}

/** Where a symbol sits in the HUD: angles from the gun line (rad), + right, + up. */
export interface HudPoint { right: number; up: number }

export interface GunSightPicture {
  style: SightStyle;
  units: 'metric' | 'imperial';
  /** Funnel, tracer line or snapshot points from near to far (kinds that draw one). */
  funnel: SightPoint[];
  /** Pipper / director / reticle centre (null for a pure funnel). */
  pipper: SightPoint | null;
  /** F-14 RTGS 2000 ft diamond. */
  diamond: SightPoint | null;
  /** Range cues on the funnel or tracer line: Hornet 1000 / 2000 ft, M-2000C 300 / 600 m wingspan marks. */
  marks: SightPoint[];
  /** The target in HUD angles (drawn by the trainer HUD, not the overlay). Null when there is none. */
  target: (HudPoint & { range: number; halfSpan: number; ahead: boolean }) | null;
  locked: boolean;
  /** Target range shown by the sight (m): only with a lock. */
  range: number | null;
  /** Full scale of the range arc (m): 1200 m on the FC3 Russian sight, else the jet's gun range. */
  arcFullM: number;
  /** The jet's gun range from data (m). */
  maxRange: number;
  /** Target inside the gun range. */
  inRange: boolean;
  /** The gun line is on the lead point now: rounds fired can hit (the sim's hit rule). */
  inSolution: boolean;
  /** Hornet director SHOOT cue: predicted miss under 20 ft, off above 30 ft. */
  shoot: boolean;
  /** Predicted miss at the target (m), null without a target. */
  missM: number | null;
  rounds: number;
  roundsMax: number;
  /** Trigger held with rounds left (steady, unlike gun.firing which is true only on ticks that fire). */
  firing: boolean;
}

export interface GunSightInput {
  locked: boolean;
  /** JF-17 no-lock sight choice. */
  pick?: GunSightKind;
  /** Previous SHOOT state (the cue has hysteresis: on under 20 ft, off above 30 ft). */
  prevShoot?: boolean;
}

const _u = new Vector3(), _l = new Vector3(), _r = new Vector3(), _rel = new Vector3();

/** Target position in HUD angles of `me` (gun line = flight path, up = lift vector). */
export function hudAngles(me: Aircraft, p: Vector3): HudPoint & { ahead: boolean; range: number } {
  const u = _u.copy(me.vel).normalize();
  const l = liftVector(me, _l);
  const r = _r.crossVectors(u, l);
  const rel = _rel.subVectors(p, me.pos);
  const fwd = rel.dot(u);
  return { right: Math.atan2(rel.dot(r), fwd), up: Math.atan2(rel.dot(l), fwd), ahead: fwd > 0, range: rel.length() };
}

/** Evenly spaced sight points from `near` to `far` (m). */
function line(me: Aircraft, near: number, far: number, n: number, span: number): SightPoint[] {
  const out: SightPoint[] = [];
  for (let i = 0; i <= n; i++) out.push(sightPoint(me, near + (far - near) * i / n, span));
  return out;
}

/** Build the gun sight picture for `me` against `target` (or none). Null when the jet has no gun data. */
export function buildGunSight(me: Aircraft, target: Aircraft | null, o: GunSightInput): GunSightPicture | null {
  const spec = gunSpecFor(me.type);
  const style = sightStyleFor(me.type, o.locked, o.pick);
  if (!spec || !style) return null;
  const units = AIRCRAFT[me.type as AircraftId]?.units ?? 'imperial';
  const span = spec.wingspanM.value;
  const [near, far] = spec.funnelM.value;
  const maxRange = spec.maxRangeM.value;
  const sol = target && target.alive ? gunSolution(me, target) : null;
  const locked = o.locked && !!sol;
  const range = locked && sol ? sol.range : null;
  const tgtRange = (r: number) => Math.min(Math.max(150, r), maxRange * 1.5);

  let funnel: SightPoint[] = [];
  let pipper: SightPoint | null = null;
  let diamond: SightPoint | null = null;
  let marks: SightPoint[] = [];
  let arcFullM = maxRange;
  switch (style.kind) {
    case 'funnel':
    case 'hornet-funnel':
    case 'eegs-funnel':
      funnel = line(me, near, far, 8, span);
      if (style.kind === 'hornet-funnel') marks = [sightPoint(me, 1000 * FT, span), sightPoint(me, 2000 * FT, span)];
      break;
    case 'eegs-pipper':
      funnel = line(me, near, far, 8, span);
      pipper = sightPoint(me, range != null ? tgtRange(range) : far, span);
      break;
    case 'lcos':
      // FC3 Russian lock: range scale 0–1200 m around the pipper. F-15C / JF-17: range to the gun range.
      if (spec.calibreMm === 30) arcFullM = 1200;
      pipper = sightPoint(me, range != null ? tgtRange(range) : (near + far) / 2, span);
      break;
    case 'range-reticle':
    case 'hornet-director':
      pipper = sightPoint(me, range != null ? tgtRange(range) : (near + far) / 2, span);
      break;
    case 'rtgs':
      pipper = sightPoint(me, 1000 * FT, span);
      diamond = sightPoint(me, 2000 * FT, span);
      break;
    case 'rtgs-track':
      pipper = sightPoint(me, range != null ? Math.min(tgtRange(range), 4000 * FT) : 1000 * FT, span);
      diamond = sightPoint(me, 2000 * FT, span);
      break;
    case 'ss':
    case 'sslc':
      funnel = line(me, near, far, 6, span);
      if (style.kind === 'sslc') pipper = sightPoint(me, range != null ? tgtRange(range) : (near + far) / 2, span);
      break;
    case 'cclt':
      // Tracer line from close in to 1000 m, wingspan marks at 300 m and 600 m.
      arcFullM = 1200;
      funnel = line(me, 100, 1000, 9, span);
      marks = [sightPoint(me, 300, span), sightPoint(me, 600, span)];
      break;
  }

  let target_: GunSightPicture['target'] = null;
  if (target && target.alive) {
    const a = hudAngles(me, target.pos);
    target_ = { right: a.right, up: a.up, ahead: a.ahead, range: a.range, halfSpan: Math.atan2(6.5, Math.max(1, a.range)) };
  }
  const missM = sol ? sol.missM : null;
  const shoot = style.kind === 'hornet-director' && !!sol && sol.inRange && missM != null
    && (missM < 20 * FT || (!!o.prevShoot && missM < 30 * FT));
  return {
    style, units, funnel, pipper, diamond, marks, target: target_, locked, range, arcFullM, maxRange,
    inRange: !!sol?.inRange, inSolution: !!sol?.inSolution, shoot, missM,
    rounds: me.gun.rounds, roundsMax: spec.rounds.value, firing: !!me.cmd.trigger && me.gun.rounds > 0,
  };
}
