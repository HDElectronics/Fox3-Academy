/**
 * [OWNER: page-rwr-trainer] Pure threat model for the RWR trainer: what the pilot places around the
 * jet (emitter kind, bearing, range, altitude, state) and how that becomes RwrContact[] for the
 * kit's RwrDisplay. No DOM here, so it is unit-tested in node.
 *
 * Signal strength follows src/sim/rwr.ts exactly (paint range = 1.75 x the emitter's head-on
 * detection range; search 0.15-0.7, lock 0.5-0.9, launch 0.8-1.0, active missile 0.85-1.0 inside
 * 20 km), so the sandbox looks like the sim's RWR.
 */
import type { AircraftId, MissileId, RwrId } from '../../data/types';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import { RWRS } from '../../data/rwr';
import type { RwrContact } from '../../sim/types';
import { spoLamps } from '../../ui/displays/geometry';

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export type SamKind = 'sam-long' | 'sam-medium' | 'sam-short';
export type EmitterKind = AircraftId | 'awacs' | SamKind;
/** 'active' = the emitter's ARH missile has gone pitbull on you (the shooter keeps searching). */
export type ThreatState = 'search' | 'lock' | 'launch' | 'active';

export const STATE_ORDER: ThreatState[] = ['search', 'lock', 'launch', 'active'];
export const STATE_LABEL: Record<ThreatState, string> = { search: 'Search', lock: 'Lock', launch: 'Launch', active: 'Missile active' };

/** One timeline step (quiz lead-up): from `at` seconds after the scenario starts, the threat is in `state`. */
export interface Phase { at: number; state: ThreatState }

export interface Threat {
  id: string;
  kind: EmitterKind;
  /** rad, relative to own nose, + right. */
  bearing: number;
  /** m, ground range. */
  range: number;
  /** m, threat altitude minus own altitude. */
  altRel: number;
  state: ThreatState;
  /** Missile for 'launch' / 'active' (null for SAMs or when none fits). */
  missile: MissileId | null;
  /** rad, the threat's heading relative to the line of sight back to us: 0 = flying at us (hot). */
  aspect?: number;
  /** Active missile: extra bearing offset from the shooter (rad) and its distance from us (m). */
  missileBearingOffset?: number;
  missileRange?: number;
  /** Active missile altitude relative to us (m); default halfway between us and the shooter. */
  missileAltRel?: number;
  /** Quiz lead-up; without phases the threat is in `state` from t = 0. */
  phases?: Phase[];
  /** Plan-view tag, e.g. 'Your target'. */
  note?: string;
}

// ---------------------------------------------------------------------------------------- emitters

const SAM_LABEL: Record<SamKind, string> = {
  'sam-long': 'Long-range SAM radar',
  'sam-medium': 'Medium-range SAM radar',
  'sam-short': 'Short-range SAM radar',
};
const SAM_SHORT: Record<SamKind, string> = {
  'sam-long': 'Long-range SAM', 'sam-medium': 'Medium-range SAM', 'sam-short': 'Short-range SAM',
};

/** Notional RWR hearing ranges (m) for emitters that have no AircraftSpec. Trainer values. */
const PAINT_M: Record<'awacs' | SamKind, number> = { awacs: 400_000, 'sam-long': 300_000, 'sam-medium': 150_000, 'sam-short': 50_000 };

export const isAircraft = (k: EmitterKind): k is AircraftId => k in AIRCRAFT;
export const isSam = (k: EmitterKind): k is SamKind => k === 'sam-long' || k === 'sam-medium' || k === 'sam-short';

export function emitterLabel(k: EmitterKind): string {
  if (isAircraft(k)) return AIRCRAFT[k].short;
  if (k === 'awacs') return 'A-50 AWACS';
  return SAM_LABEL[k];
}
export function emitterShort(k: EmitterKind): string {
  if (isAircraft(k)) return AIRCRAFT[k].short;
  if (k === 'awacs') return 'A-50';
  return SAM_SHORT[k];
}

/**
 * Representative emitters the sandbox and quiz offer. The three SAM kinds are threat classes, not
 * an exhaustive identity library; each RWR supplies its own code and its own uncertainty caveats.
 */
export function emitterKindsFor(_rwr: RwrId): EmitterKind[] {
  return [...AIRCRAFT_ORDER, 'awacs', 'sam-long', 'sam-medium', 'sam-short'];
}

/** RWR hearing range for strength scaling (m), as sim/rwr.ts computes it for aircraft. */
export function paintRangeM(k: EmitterKind): number {
  return isAircraft(k) ? 1.75 * AIRCRAFT[k].radar.detectKm.headOn * 1000 : PAINT_M[k];
}

/** Radar missiles an emitter can put in each warning state. */
export function missilesFor(k: EmitterKind, state: ThreatState): MissileId[] {
  if (!isAircraft(k) || state === 'search' || state === 'lock') return [];
  const spec = AIRCRAFT[k];
  const order = [...new Set<MissileId>([...spec.loadout.map(l => l.missile), ...spec.missiles])];
  return order.filter(m => {
    const s = MISSILES[m].seeker;
    if (state === 'active') return s === 'arh';
    return s === 'sarh' || (s === 'arh' && spec.radar.sttArhLaunchWarning);
  });
}

export interface StateAvail { state: ThreatState; ok: boolean; reason: string }

/**
 * Which warning states this emitter can produce in DCS, with a plain reason when it cannot.
 */
export function statesFor(k: EmitterKind, _rwr?: RwrId): StateAvail[] {
  const name = emitterShort(k);
  return STATE_ORDER.map(state => {
    if (state === 'search') return { state, ok: true, reason: '' };
    if (k === 'awacs') return { state, ok: false, reason: 'An AWACS only searches: it never locks or fires.' };
    if (isSam(k)) {
      if (state === 'active') return { state, ok: false, reason: `${name} missiles are guided from the ground here: no active-seeker cue.` };
      return { state, ok: true, reason: '' };
    }
    if (state === 'lock') return { state, ok: true, reason: '' };
    if (missilesFor(k, state).length) return { state, ok: true, reason: '' };
    if (state === 'active') return { state, ok: false, reason: `The ${name} carries no active radar missile in DCS: it has no Fox 3.` };
    const arh = missilesFor(k, 'active');
    return {
      state, ok: false,
      reason: arh.length
        ? `The ${name} has no SARH missile, and its ${MISSILES[arh[0]].name} gives no launch warning even from STT: you only see the lock, then the missile going active.`
        : `The ${name} has no radar missile that gives a launch warning.`,
    };
  });
}

export function canBe(k: EmitterKind, state: ThreatState, rwr?: RwrId): boolean {
  return statesFor(k, rwr).find(s => s.state === state)?.ok ?? false;
}

/** Default missile for a state (first that fits, loadout order first). */
export function defaultMissile(k: EmitterKind, state: ThreatState): MissileId | null {
  return missilesFor(k, state)[0] ?? null;
}

/** Keep a threat consistent after its kind or state changed (state falls back to search, missile refits). */
export function normalizeThreat(t: Threat, rwr?: RwrId): Threat {
  let state = t.state;
  if (!canBe(t.kind, state, rwr)) state = 'search';
  const fits = missilesFor(t.kind, state);
  const missile = fits.length ? (t.missile && fits.includes(t.missile) ? t.missile : fits[0]) : null;
  return { ...t, state, missile };
}

// ---------------------------------------------------------------------------------------- geometry

export const wrapPi = (a: number): number => {
  let x = (a + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
};

/** Clock position 1..12 of a relative bearing. */
export function clockOf(bearing: number): number {
  const h = Math.round((wrapPi(bearing) * R2D) / 30);
  const m = ((h % 12) + 12) % 12;
  return m === 0 ? 12 : m;
}
export const clockText = (n: number): string => `${n} o'clock`;

/**
 * Clock positions a pilot may fairly read from the RWR for this bearing. Scopes: the nearest clock,
 * plus the neighbour when the bearing sits within 4 deg of the half-hour line. SPO-15: every clock the
 * lit lamp (or lamp pair) can stand for, because the lamps are 10/30/50/90 deg and two rear quadrants.
 */
export function acceptedClocks(rwr: RwrId, bearing: number): number[] {
  const b = wrapPi(bearing);
  if (RWRS[rwr].kind === 'lamps') {
    const key = spoLamps(b).slice().sort().join(',');
    const set = new Set<number>();
    for (let d = -180; d < 180; d += 0.5) {
      const r = d * D2R;
      if (spoLamps(r).slice().sort().join(',') === key) set.add(clockOf(r));
    }
    return [...set].sort((x, y) => x - y);
  }
  const deg = b * R2D;
  const out = new Set<number>([clockOf(b)]);
  const frac = ((deg / 30) % 1 + 1) % 1; // position between two clock centres
  if (Math.abs(frac - 0.5) < 4 / 30) { out.add(clockOf((deg - 15) * D2R)); out.add(clockOf((deg + 15) * D2R)); }
  return [...out].sort((x, y) => x - y);
}

// ---------------------------------------------------------------------------------------- contacts

/** State of a threat at scenario time `tRel` (null = not on the RWR yet). */
export function stateAt(t: Threat, tRel: number): ThreatState | null {
  if (!t.phases || !t.phases.length) return t.state;
  let s: ThreatState | null = null;
  for (const p of t.phases) if (tRel >= p.at) s = p.state;
  return s;
}

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Where the active missile is, relative to us. */
export function missilePlacement(t: Threat): { bearing: number; range: number; altRel: number } {
  const pit = t.missile ? MISSILES[t.missile].pitbullKm ?? 15 : 15;
  const range = t.missileRange ?? Math.min(pit * 1000 * 0.9, t.range * 0.7);
  return {
    bearing: wrapPi(t.bearing + (t.missileBearingOffset ?? 0)),
    range,
    altRel: t.missileAltRel ?? t.altRel * (range / Math.max(1, t.range)),
  };
}

export const elevationOf = (altRel: number, range: number): number => Math.atan2(altRel, Math.max(1, range));

/** Missile contact id for a threat's active missile. */
export const missileIdFor = (threatId: string): string => threatId + '-M';

/**
 * Plain contacts for threats in their state at `tRel` (no timing fields beyond firstSeen = lastSeen = t).
 * Use RwrFeed for live timing (new-threat marks, search chirps). AWACS and SAM kinds go straight into
 * emitterType: the display looks their symbols up in RWRS[rwr].symbols and draws SAMs without the hat.
 */
export function contactsAt(threats: readonly Threat[], tRel: number, t = tRel): RwrContact[] {
  const out: RwrContact[] = [];
  for (const th of threats) {
    const st = stateAt(th, tRel);
    if (!st) continue;
    const emitterState: RwrContact['state'] = st === 'active' ? 'search' : st;
    const base = clamp01(1 - th.range / paintRangeM(th.kind));
    const strength = emitterState === 'search' ? 0.15 + 0.55 * base : emitterState === 'lock' ? 0.5 + 0.4 * base : 0.8 + 0.2 * base;
    const c: RwrContact = {
      emitterId: th.id,
      emitterType: th.kind,
      state: emitterState,
      bearing: wrapPi(th.bearing),
      elevation: elevationOf(th.altRel, th.range),
      strength,
      firstSeen: t,
      lastSeen: t,
    };
    if (emitterState === 'launch' && th.missile) c.missileType = th.missile;
    out.push(c);
    if (st === 'active' && th.missile) {
      const mp = missilePlacement(th);
      out.push({
        emitterId: missileIdFor(th.id), emitterType: 'missile', missileType: th.missile, state: 'missile',
        bearing: mp.bearing, elevation: elevationOf(mp.altRel, mp.range),
        strength: 0.85 + 0.15 * clamp01(1 - mp.range / 20_000),
        firstSeen: t, lastSeen: t,
      });
    }
  }
  return out;
}

/** Which threat a contact id belongs to (missile contacts map to their shooter). */
export function threatIdOfContact(contactId: string): string {
  return contactId.endsWith('-M') ? contactId.slice(0, -2) : contactId;
}

/**
 * Live contact timing: keeps firstSeen while a contact persists (new-threat marks), and gives search
 * contacts a lastSeen that jumps once per radar sweep (so RwrAudio chirps like a real search paint).
 */
export class RwrFeed {
  private first = new Map<string, number>();
  /** Sweep period for search paints (s); kept under the display's 4 s stale threshold. */
  sweepS = 3;

  update(threats: readonly Threat[], tRel: number, t: number): RwrContact[] {
    const list = contactsAt(threats, tRel, t);
    const seen = new Set<string>();
    for (const c of list) {
      seen.add(c.emitterId);
      let f = this.first.get(c.emitterId);
      if (f === undefined) { f = t; this.first.set(c.emitterId, t); }
      c.firstSeen = f;
      if (c.state === 'search') {
        const phase = (hash(c.emitterId) % 1000) / 1000 * this.sweepS;
        const k = Math.floor((t - f - phase) / this.sweepS);
        c.lastSeen = k < 0 ? f : f + phase + k * this.sweepS;
      } else c.lastSeen = t;
    }
    for (const id of [...this.first.keys()]) if (!seen.has(id)) this.first.delete(id);
    return list;
  }

  /** Forget everything (a new scenario starts: every contact is new again). */
  reset(): void { this.first.clear(); }
  /** Mark every current contact as old (no new-threat marks), e.g. for a static quiz picture. */
  age(threats: readonly Threat[], tRel: number, t: number, byS = 10): void {
    for (const c of contactsAt(threats, tRel, t)) this.first.set(c.emitterId, t - byS);
  }
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Missile descriptor for copy: 'R-27ER (SARH)'. */
export function missileTag(m: MissileId | null): string {
  if (!m) return '';
  const s = MISSILES[m];
  return `${s.name} (${s.seeker === 'sarh' ? 'SARH' : s.seeker === 'arh' ? 'active radar' : 'IR'})`;
}

export const deg = (rad: number): number => rad * R2D;
export const rad = (d: number): number => d * D2R;
