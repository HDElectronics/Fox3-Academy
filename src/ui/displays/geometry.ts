/**
 * [OWNER: displays] Pure helpers shared by the display renderers: coordinate mappings, unit and
 * label formatting, RWR threat ordering, hit-testing. No DOM here, so it is unit-tested in node.
 */
import type { FighterId, MissileId, RwrSpec, RwrSymbol } from '../../data/types';
import type { EntityId, RwrContact } from '../../sim/types';
import { M_PER_FT, M_PER_NM, MPS_PER_KT, wrapPi } from '../../sim/math';

export type Units = 'metric' | 'imperial';

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

// ---------------------------------------------------------------- B-scope and plan mappings

/** Azimuth (rad, + right) and range (m) to a B-scope rectangle: x = azimuth, y = range (0 at the bottom). */
export function bscopeToScreen(r: Rect, gimbalAz: number, rangeScale: number, az: number, range: number): Pt {
  const g = gimbalAz > 0 ? gimbalAz : Math.PI / 3;
  const rs = rangeScale > 0 ? rangeScale : 1;
  return { x: r.x + r.w * (0.5 + az / (2 * g)), y: r.y + r.h * (1 - range / rs) };
}

/** Inverse of bscopeToScreen. Returns null outside the rectangle. */
export function screenToBscope(r: Rect, gimbalAz: number, rangeScale: number, x: number, y: number): { az: number; range: number } | null {
  if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return null;
  const g = gimbalAz > 0 ? gimbalAz : Math.PI / 3;
  return { az: ((x - r.x) / r.w - 0.5) * 2 * g, range: (1 - (y - r.y) / r.h) * rangeScale };
}

/**
 * Plan (PPI) mapping used by the F-14 TID: origin = own aircraft, `rot` = rotation added to the
 * relative bearing (0 = heading-up, own heading = north-up), `pxPerM` scale.
 */
export function planToScreen(origin: Pt, pxPerM: number, rot: number, az: number, range: number): Pt {
  const b = az + rot;
  return { x: origin.x + Math.sin(b) * range * pxPerM, y: origin.y - Math.cos(b) * range * pxPerM };
}

export function screenToPlan(origin: Pt, pxPerM: number, rot: number, x: number, y: number): { az: number; range: number } {
  const dx = x - origin.x, dy = origin.y - y;
  return { az: wrapPi(Math.atan2(dx, dy) - rot), range: Math.hypot(dx, dy) / pxPerM };
}

/** Screen angle (rad, clockwise from display-up) of a target's velocity for a heading-up display. */
export const stickAngle = (relHeading: number): number => relHeading;

/**
 * Which side of the target we see: 'R' when we are off its right wing (target shows its right side).
 * az = bearing of the target from our nose, relHeading = target heading minus own heading.
 */
export function aspectSide(az: number, relHeading: number): 'L' | 'R' {
  // Direction from target to us, in our heading frame, minus the target's heading.
  const a = wrapPi(az + Math.PI - relHeading);
  return a >= 0 ? 'R' : 'L';
}

/** F-16 / Hornet style aspect readout: tens of degrees (0 tail .. 18 nose) + side, e.g. '14R'. */
export function aspectTens(aspectDeg: number, side: 'L' | 'R'): string {
  // aspectDeg here is 0 = hot (nose on) .. 180 = cold. Western readouts count from the tail: 18 = head-on.
  const fromTail = 180 - Math.max(0, Math.min(180, aspectDeg));
  const tens = Math.round(fromTail / 10);
  if (tens >= 18) return '18';
  if (tens <= 0) return '0';
  return `${tens}${side}`;
}

// ---------------------------------------------------------------- units

export const rangeVal = (m: number, u: Units): number => (u === 'metric' ? m / 1000 : m / M_PER_NM);
export const rangeUnit = (u: Units): string => (u === 'metric' ? 'km' : 'nm');
export const speedVal = (mps: number, u: Units): number => (u === 'metric' ? mps * 3.6 : mps / MPS_PER_KT);
export const speedUnit = (u: Units): string => (u === 'metric' ? 'km/h' : 'kt');

/** Display a range-scale value: integer when close to one, else one decimal ('18.5'). */
export function fmtScale(m: number, u: Units): string {
  const v = rangeVal(m, u);
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
}

/** Short range readout: one decimal below 10, integer above. */
export function fmtRangeShort(m: number, u: Units): string {
  const v = rangeVal(m, u);
  return v < 10 ? v.toFixed(1) : String(Math.round(v));
}

/** Altitude in thousands of feet (imperial) or hundreds of metres/kilometres with one decimal (metric). */
export function fmtAltK(m: number, u: Units): string {
  return u === 'metric' ? (m / 1000).toFixed(1) : String(Math.max(0, Math.round(m / M_PER_FT / 1000)));
}

/** F-15C VSD target altitude '29-9' (29,900 ft), or '8.2' km in metric. */
export function fmtVsdAlt(m: number, u: Units): string {
  if (u === 'metric') return (m / 1000).toFixed(1);
  const hft = Math.max(0, Math.round(m / M_PER_FT / 100));
  return `${Math.floor(hft / 10)}-${hft % 10}`;
}

/** F-14 TID altitude digit: tens of thousands of feet, rounded (0 = below 5,000 ft, 4 = 35-45 kft). */
export function tidAltDigit(m: number): string {
  const ft = m / M_PER_FT;
  return String(Math.max(0, Math.min(9, Math.floor((ft + 5000) / 10000))));
}

/** Closure with sign ('+850' / '-120') in the display's speed unit. */
export function fmtClosure(mps: number, u: Units): string {
  const v = Math.round(speedVal(mps, u));
  return (v >= 0 ? '+' : '') + v;
}

/** Seconds as a compact counter (no leading zeros): 7 -> '7', 75 -> '75'. Unknown -> '--', negative -> '0'. */
export const secs = (s: number | null | undefined): string => (s == null || !isFinite(s) ? '--' : s < 0 ? '0' : String(Math.round(s)));

// ---------------------------------------------------------------- weapon labels

/** FC3 Su-27/MiG-29 ИЛС weapon label ('27ЭР', '77'). Falls back to the plain name. */
export function ruWeaponLabel(id: MissileId, name: string): string {
  const m: Partial<Record<MissileId, string>> = { r27r: '27Р', r27er: '27ЭР', r27t: '27Т', r27et: '27ЭТ', r73: '73', r77: '77' };
  return m[id] ?? name;
}

/** F-15C HUD stores code: 'A4C' (4 x AIM-120C), 'M4M' (AIM-7M), 'S2M' (AIM-9M). */
export function f15StoresCode(id: MissileId, count: number, name: string): string {
  if (id === 'aim120c') return `A${count}C`;
  if (id === 'aim120b') return `A${count}B`;
  if (id === 'aim7m') return `M${count}M`;
  if (id === 'aim9m') return `S${count}M`;
  if (id === 'aim9x') return `S${count}X`;
  return `${name} ${count}`;
}

/** Hornet weapon label ('AC 4' for AIM-120C). */
export function hornetWeapon(id: MissileId, count: number, name: string): string {
  const m: Partial<Record<MissileId, string>> = { aim120c: 'AC', aim120b: 'AB', aim7m: '7M', aim9m: '9M', aim9x: '9X' };
  return `${m[id] ?? name} ${count}`;
}

/** Viper HUD/FCR missile count ('4 MRM', '2 SRM', '2 HOB'). */
export function viperWeapon(id: MissileId, count: number): string {
  if (id === 'aim120b' || id === 'aim120c' || id === 'aim7m') return `${count} MRM`;
  if (id === 'aim9x') return `${count} HOB`;
  return `${count} SRM`;
}

/** F-14 TID weapon readout ('PH 4', 'SP 2', 'SW 2'). */
export function tomcatWeapon(id: MissileId, count: number, name: string): string {
  if (id === 'aim54a' || id === 'aim54c') return `PH ${count}`;
  if (id === 'aim7m') return `SP ${count}`;
  if (id === 'aim9m' || id === 'aim9x') return `SW ${count}`;
  return `${name} ${count}`;
}

/** Numeric part of a missile name for the JF-17 MAWS ('AIM-120C' -> '120'). */
export function missileDigits(name: string): string {
  const m = /(\d{2,3})/.exec(name);
  return m ? m[1] : 'M';
}

/** Viper azimuth OSB legend from the scan half-width: ±60 -> 'A6', ±30 -> 'A3', ±25 -> 'A2', ±10 -> 'A1'. */
export function viperAzLegend(azHalfRad: number): string {
  const d = Math.round((azHalfRad * 180) / Math.PI);
  if (d >= 50) return 'A6';
  if (d >= 28) return 'A3';
  if (d >= 18) return 'A2';
  return 'A1';
}

// ---------------------------------------------------------------- RWR

const STATE_RANK: Record<RwrContact['state'], number> = { missile: 0, launch: 1, lock: 2, search: 3 };

/**
 * Emitter-type rank (lower = more dangerous) for step 3 of the FC3 RWR priority: airborne radars,
 * then long-, medium- and short-range SAMs, then early-warning radars, then AWACS
 * (docs/research/f15c-fc3.md, bvr-mechanics.md). The data has no EW emitter; 'unknown' takes its slot.
 */
const TYPE_RANK: Partial<Record<RwrSymbol['emitter'], number>> = {
  'sam-long': 1, 'sam-medium': 2, 'sam-short': 3, unknown: 4, awacs: 5,
};
/** 0 for aircraft and missiles, higher for ground and support emitters. */
export const rwrTypeRank = (c: Pick<RwrContact, 'emitterType'>): number => TYPE_RANK[c.emitterType] ?? 0;

/**
 * RWR threat priority as DCS documents it (FC3 manual): 1) active missile / launch, 2) lock (STT),
 * 3) type (airborne > long > medium > short-range SAM > EW > AWACS), 4) signal strength.
 * Returns a new array, most dangerous first.
 */
export function rwrPriority(contacts: readonly RwrContact[]): RwrContact[] {
  return [...contacts].sort((a, b) =>
    STATE_RANK[a.state] - STATE_RANK[b.state] || rwrTypeRank(a) - rwrTypeRank(b) || b.strength - a.strength ||
    a.firstSeen - b.firstSeen || (a.emitterId < b.emitterId ? -1 : a.emitterId > b.emitterId ? 1 : 0));
}

/** The symbol text an RWR spec shows for a contact. Never hard-coded: read from the spec, with sane fallbacks. */
export function rwrSymbolFor(spec: RwrSpec, c: Pick<RwrContact, 'emitterType' | 'state'>): string {
  const key = c.emitterType === 'missile' || c.state === 'missile' ? 'missile' : c.emitterType;
  const hit = spec.symbols.find(s => s.emitter === key);
  if (hit) return hit.symbol;
  if (key === 'missile') return spec.kind === 'lamps' ? airborneLetter(spec) : 'M';
  if (spec.kind === 'lamps') return airborneLetter(spec);
  return spec.symbols.find(s => s.emitter === 'unknown')?.symbol ?? 'U';
}

/** SPO-15: the type letter every airborne radar lights (the first aircraft entry of the spec). */
function airborneLetter(spec: RwrSpec): string {
  const nonAir = new Set(['missile', 'awacs', 'sam-long', 'sam-medium', 'sam-short', 'unknown']);
  return spec.symbols.find(s => !nonAir.has(s.emitter))?.symbol ?? 'П';
}

const NOT_AIRBORNE = new Set<RwrSymbol['emitter']>(['missile', 'sam-long', 'sam-medium', 'sam-short', 'unknown']);
/**
 * Is this emitter airborne (gets the "hat" on scope RWRs)? Aircraft and AWACS are; missiles, SAM radars
 * and unknown emitters are not, so '15' with a hat is an F-15 and '15' without one is an SA-15.
 */
export const isAirborne = (c: Pick<RwrContact, 'emitterType'>): boolean => !NOT_AIRBORNE.has(c.emitterType);

/** SPO-15 forward lamp angles, deg (left side negative). */
export const SPO_FWD_LAMPS = [-90, -50, -30, -10, 10, 30, 50, 90];

/**
 * SPO-15 direction lamps lit for a bearing (rad, + right). Returns indices into SPO_FWD_LAMPS
 * (0..7) and/or 8 = left-rear, 9 = right-rear. Between two lamps both light (as in ED's example).
 */
export function spoLamps(bearing: number): number[] {
  const d = (wrapPi(bearing) * 180) / Math.PI;
  const ad = Math.abs(d);
  if (ad > 112) return [d < 0 ? 8 : 9];
  const side = d < 0 ? -1 : 1;
  const angles = [10, 30, 50, 90];
  const idx = (a: number) => SPO_FWD_LAMPS.indexOf(side * a);
  if (ad <= 12) return ad < 3 ? [SPO_FWD_LAMPS.indexOf(-10), SPO_FWD_LAMPS.indexOf(10)] : [idx(10)];
  if (ad >= 90) return [idx(90)];
  for (let i = 0; i < angles.length - 1; i++) {
    const a0 = angles[i], a1 = angles[i + 1];
    if (ad >= a0 && ad <= a1) {
      const tol = 4;
      if (ad - a0 <= tol) return [idx(a0)];
      if (a1 - ad <= tol) return [idx(a1)];
      return [idx(a0), idx(a1)];
    }
  }
  return [idx(90)];
}

/** Ring-geometry description of each scope RWR. Radii are fractions of the scope radius. */
export interface ScopeRing {
  /** Radius (0..1) for a contact: position encodes lethality / priority, never range. */
  radius(c: RwrContact, rank: number, t: number): number;
}

/**
 * Scope placement, per the research (docs/research):
 *  - ALR-56C (F-15C, DCS): radius from signal strength, locks/launches/missiles in the inner ring.
 *  - ALR-67 (Hornet, F-14): critical band OUTERMOST (lock/launch/missile), lethal middle (search).
 *  - ALR-56M (Viper): search outer ring, track just outside the inner circle, guidance inside it.
 *  - JF-17: inner ring lethal (tracking), outer non-lethal (search).
 *  - Serval (M-2000C): nearer the centre = more dangerous.
 */
export function scopeRadius(rwr: RwrSpec['id'], c: RwrContact, rank: number): number {
  const s = Math.max(0, Math.min(1, c.strength));
  const spread = Math.min(rank, 5) * 0.012; // small offset so equal threats do not sit exactly on top of each other
  switch (rwr) {
    case 'alr56c':
      // DCS: EW radars and AWACS never sit in the inner ring (f15c-fc3.md), whatever state a page passes.
      if (c.emitterType === 'awacs' || c.emitterType === 'unknown') return Math.max(0.5, 0.86 - s * 0.4 + spread);
      if (c.state === 'missile') return 0.24;
      if (c.state === 'launch' || c.state === 'lock') return 0.34 - s * 0.06;
      return 0.86 - s * 0.4 + spread; // stronger = nearer the centre
    case 'alr67':
      if (c.state === 'search') return 0.62 - s * 0.06 + spread; // lethal band
      return 0.86 - spread; // critical band (outermost)
    case 'alr56m':
      if (c.state === 'launch' || c.state === 'missile') return 0.2;
      if (c.state === 'lock') return 0.47;
      return 0.8 - s * 0.08 + spread;
    case 'jf17rwr':
      if (c.state === 'search') return 0.8 - s * 0.06 + spread;
      return 0.42 - spread;
    case 'serval':
      if (c.state === 'launch' || c.state === 'missile') return 0.24;
      if (c.state === 'lock') return 0.5;
      return 0.82 - s * 0.08 + spread;
    default:
      return c.state === 'search' ? 0.8 : 0.4;
  }
}

// ---------------------------------------------------------------- hit-testing

export interface HitItem {
  x: number; y: number;
  /** Hit radius, CSS px. */
  r: number;
  id: EntityId;
  kind: 'track' | 'brick' | 'stt' | 'contact' | 'lamp';
  /** Lower wins when two overlap (tracks beat bricks). */
  prio: number;
}

/** Nearest item within its radius (priority first, then distance). */
export function hitTest(items: readonly HitItem[], x: number, y: number, slop = 0): HitItem | null {
  let best: HitItem | null = null, bestD = Infinity;
  for (const it of items) {
    const d = Math.hypot(it.x - x, it.y - y);
    if (d > it.r + slop) continue;
    if (!best || it.prio < best.prio || (it.prio === best.prio && d < bestD)) { best = it; bestD = d; }
  }
  return best;
}

/** A 'nice' round number >= v (1, 2, 2.5, 5 x 10^n), used for DLZ-bar scales. */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v - 1e-9) return k * p;
  return 10 * p;
}

/** Which label family a jet uses for its radar display wording. */
export type MfdFamily = 'hornet' | 'viper' | 'jf17';
export function mfdFamily(a: FighterId): MfdFamily {
  return a === 'f16c' ? 'viper' : a === 'jf17' ? 'jf17' : 'hornet';
}
