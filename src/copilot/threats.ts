/**
 * Threats and radar lock from the jet's own sensors: RWR emitters (LoGetTWSInfo) and the radar's locked
 * target (LoGetLockedTargetInformation). Nothing here uses world truth: only what the RWR and radar report.
 * The lock picture reuses the app's launch-zone tables (src/sim/dlz.ts) for the selected missile.
 * Units still to verify in game are isolated in RWR_AZ and LOCK_FLAGS (docs/research/dcs-export.md).
 */
import { Vector3 } from 'three';
import type { DcsFrame, RadarTarget, RwrEmitter } from '../dcs/protocol';
import type { MissileId } from '../data/types';
import { dlzFor } from '../sim/dlz';
import type { Sourced } from '../sim/flightOps/types';
import { aspectAngle, M_PER_FT, M_PER_NM, MPS_PER_KT } from '../sim/math';
import type { ActiveAlert, Callout } from './engine';

const R2D = 180 / Math.PI;

/** RWR azimuth as LoGetTWSInfo sends it. Inferred from the reference file's other angles; not verified. */
export const RWR_AZ: Sourced<{ unit: 'rad' | 'deg'; positiveRight: boolean }> = {
  value: { unit: 'rad', positiveRight: true }, source: 'Inferred (Export.lua:751-765 gives no unit)', verified: false,
};
/** Target flag bits (Export.lua:663-701). */
export const LOCK_FLAGS = { stt: 0x0008, tws: 0x0020, hoj: 0x0800 } as const;

export type RwrState = 'search' | 'track' | 'lock' | 'launch';
const RWR_RANK: Record<RwrState, number> = { search: 0, track: 1, lock: 2, launch: 3 };

export interface Threat {
  id: number;
  name: string;
  state: RwrState;
  /** Bearing off the nose, degrees, right positive. */
  relDeg?: number;
  /** 1..12. */
  clock?: number;
}

export function rwrState(signal: string | undefined): RwrState {
  switch (signal) {
    case 'missile_radio_guided': return 'launch';
    case 'lock': return 'lock';
    case 'track_while_scan': return 'track';
    default: return 'search';
  }
}

/** Clock position for a bearing off the nose (degrees, right positive): 0 → 12, 90 → 3. */
export function clockOf(relDeg: number): number {
  const h = Math.round((((relDeg % 360) + 360) % 360) / 30) % 12;
  return h === 0 ? 12 : h;
}

const CLOCK_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const clockWords = (c: number) => `${CLOCK_WORDS[c] ?? c} o'clock`;

export function threatsOf(emitters: readonly RwrEmitter[] | undefined): Threat[] {
  const out: Threat[] = [];
  for (const e of emitters ?? []) {
    let relDeg: number | undefined;
    if (e.az !== undefined) {
      const deg = RWR_AZ.value.unit === 'rad' ? e.az * R2D : e.az;
      relDeg = RWR_AZ.value.positiveRight ? deg : -deg;
    }
    out.push({
      id: e.id ?? -1, name: e.name ?? 'Unknown', state: rwrState(e.signal),
      relDeg, clock: relDeg === undefined ? undefined : clockOf(relDeg),
    });
  }
  return out.sort((a, b) => RWR_RANK[b.state] - RWR_RANK[a.state]);
}

/**
 * Calls RWR changes per emitter, the way a backseater would: a new lock ("spike"), a launch, and the lock
 * going away. Searches are left to the RWR's own tones. Each emitter is called once per state upgrade.
 */
export class ThreatTracker {
  private seen = new Map<number, { state: RwrState; lastT: number }>();

  update(threats: readonly Threat[], t: number): { calls: Callout[]; active: ActiveAlert[] } {
    const calls: Callout[] = [];
    const active: ActiveAlert[] = [];
    const now = new Set<number>();
    for (const th of threats) {
      now.add(th.id);
      const prev = this.seen.get(th.id);
      const where = th.clock ? `${th.clock} O'CLOCK` : 'BEARING UNKNOWN';
      const whereSay = th.clock ? clockWords(th.clock) : 'bearing unknown';
      if (th.state === 'launch') {
        active.push({ id: `rwr-${th.id}`, severity: 'warning', text: `LAUNCH  ${where}  ${th.name.toUpperCase()}`, sinceS: t });
        if (!prev || RWR_RANK[prev.state] < RWR_RANK.launch) {
          calls.push({ id: `launch-${th.id}`, severity: 'warning', text: `MISSILE LAUNCH ${where}, ${th.name}`, say: `Missile launch, ${whereSay}. Defend.`, t });
        }
      } else if (th.state === 'lock') {
        active.push({ id: `rwr-${th.id}`, severity: 'caution', text: `SPIKE  ${where}  ${th.name.toUpperCase()}`, sinceS: t });
        if (!prev || RWR_RANK[prev.state] < RWR_RANK.lock) {
          calls.push({ id: `spike-${th.id}`, severity: 'caution', text: `SPIKE ${where}, ${th.name}`, say: `Spike, ${whereSay}, ${th.name}.`, t });
        }
      }
      this.seen.set(th.id, { state: th.state, lastT: t });
    }
    for (const [id, s] of this.seen) {
      if (now.has(id)) continue;
      // Keep the memory a few seconds so a flickering emitter is not called again and again.
      if (t - s.lastT > 5) this.seen.delete(id);
    }
    return { calls, active };
  }

  reset(): void { this.seen.clear(); }
}

/** Aspect words: HOT, FLANK 30–60° (bvr-mechanics.md), BEAM, DRAG. HOT below 30° and BEAM 60–120° are this app's split. */
export function aspectWord(aspectDeg: number): 'HOT' | 'FLANK' | 'BEAM' | 'DRAG' {
  return aspectDeg < 30 ? 'HOT' : aspectDeg < 60 ? 'FLANK' : aspectDeg <= 120 ? 'BEAM' : 'DRAG';
}

/** DCS display name of the selected weapon → the app's missile, for the launch zone. */
export function missileOf(name: string | undefined): MissileId | undefined {
  if (!name) return undefined;
  const n = name.toUpperCase().replace(/\s+/g, '');
  const table: [RegExp, MissileId][] = [
    [/AIM-?120C/, 'aim120c'], [/AIM-?120B/, 'aim120b'], [/AIM-?7M?/, 'aim7m'], [/AIM-?9X/, 'aim9x'], [/AIM-?9M/, 'aim9m'],
    [/AIM-?54C/, 'aim54c'], [/AIM-?54A/, 'aim54a'], [/R-?77/, 'r77'], [/R-?27ER/, 'r27er'], [/R-?27ET/, 'r27et'],
    [/R-?27R/, 'r27r'], [/R-?27T/, 'r27t'], [/R-?73/, 'r73'], [/SD-?10/, 'sd10'], [/PL-?5E/, 'pl5e'], [/530D/, 's530d'],
    [/MAGIC/, 'magic2'],
  ];
  return table.find(([re]) => re.test(n))?.[1];
}

/** DCS world (x north, y up, z east) → sim frame (x east, y up, z south). */
const toSim = (v: { x?: number; y?: number; z?: number }) => new Vector3(v.z ?? 0, v.y ?? 0, -(v.x ?? 0));

export type Zone = 'out' | 'in' | 'no-escape' | 'min';

export interface LockPicture {
  name: string;
  stt: boolean;
  jamming: boolean;
  rangeNm: number;
  closureKt?: number;
  /** Target altitude, feet. */
  altFt?: number;
  /** Target aspect: 0 nose-on (hot), 180 tail-on. */
  aspectDeg?: number;
  aspect?: ReturnType<typeof aspectWord>;
  /** Bearing off our nose, degrees, right positive. */
  relDeg?: number;
  dlz?: { missile: MissileId; rmaxNm: number; rneNm: number; rminNm: number; zone: Zone };
}

/** The radar's locked target, as the pilot would read it off the attack format. */
export function lockOf(f: DcsFrame | null): LockPicture | null {
  const tg: RadarTarget | undefined = f?.lock?.[0];
  if (!f || !tg || tg.dist === undefined) return null;
  const pic: LockPicture = {
    name: tg.name ?? 'Unknown',
    stt: tg.flags !== undefined && (tg.flags & LOCK_FLAGS.stt) !== 0,
    jamming: tg.jam === true,
    rangeNm: tg.dist / M_PER_NM,
    closureKt: tg.closure === undefined ? undefined : tg.closure / MPS_PER_KT,
    altFt: tg.pos?.y === undefined ? undefined : tg.pos.y / M_PER_FT,
  };
  const self = f.self;
  if (tg.pos && self?.x !== undefined && self.z !== undefined) {
    const own = toSim({ x: self.x, y: self.y, z: self.z });
    const tgt = toSim(tg.pos);
    const d = tgt.clone().sub(own);
    if (self.hdg !== undefined) {
      const brg = Math.atan2(d.x, -d.z); // clockwise from north
      pic.relDeg = (((brg - self.hdg) * R2D + 540) % 360) - 180;
    }
    if (tg.vel) {
      const tv = toSim(tg.vel);
      if (tv.length() > 1) {
        pic.aspectDeg = aspectAngle(tgt, tv, own) * R2D;
        pic.aspect = aspectWord(pic.aspectDeg);
      }
      const missile = missileOf(f.stores?.sel);
      const tas = f.tas ?? f.ias;
      if (missile && tas !== undefined && self.hdg !== undefined) {
        const p = self.pitch ?? 0;
        // Own velocity from heading, pitch and TAS (the export frame carries no velocity vector).
        const ov = new Vector3(Math.cos(p) * Math.sin(self.hdg), Math.sin(p), -Math.cos(p) * Math.cos(self.hdg)).multiplyScalar(tas);
        const z = dlzFor(own, ov, tgt, tv, missile);
        const zone: Zone = tg.dist < z.rmin ? 'min' : tg.dist <= z.rne ? 'no-escape' : tg.dist <= z.rmax ? 'in' : 'out';
        pic.dlz = { missile, rmaxNm: z.rmax / M_PER_NM, rneNm: z.rne / M_PER_NM, rminNm: z.rmin / M_PER_NM, zone };
      }
    }
  }
  return pic;
}

/** Calls lock events: new lock with a short picture, entering the launch zone, no escape, and lock lost. */
export class LockTracker {
  private had: { name: string; t: number } | null = null;
  private zone: Zone | null = null;

  update(pic: LockPicture | null, t: number): { calls: Callout[]; active: ActiveAlert[] } {
    const calls: Callout[] = [];
    const active: ActiveAlert[] = [];
    if (!pic) {
      if (this.had && t - this.had.t > 1.5) {
        calls.push({ id: 'lock-lost', severity: 'advisory', text: `LOCK LOST, ${this.had.name}`, say: 'Lock lost.', t });
        this.had = null;
        this.zone = null;
      }
      return { calls, active };
    }
    const nm = Math.round(pic.rangeNm);
    if (!this.had) {
      const aspect = pic.aspect ? `, ${pic.aspect.toLowerCase()}` : '';
      calls.push({ id: 'lock-new', severity: 'advisory', text: `LOCKED ${pic.name}, ${nm} NM${pic.aspect ? ' ' + pic.aspect : ''}`, say: `Locked, ${pic.name}, ${nm} miles${aspect}.`, t });
    }
    this.had = { name: pic.name, t };
    const zone = pic.dlz?.zone ?? null;
    if (zone && zone !== this.zone) {
      if (zone === 'in' && this.zone === 'out') calls.push({ id: 'in-range', severity: 'advisory', text: `IN RANGE  ${pic.dlz!.missile.toUpperCase()}`, say: 'In range.', t });
      if (zone === 'no-escape') calls.push({ id: 'no-escape', severity: 'advisory', text: 'NO ESCAPE ZONE', say: 'No escape.', t });
      if (zone === 'min') calls.push({ id: 'too-close', severity: 'caution', text: 'INSIDE MIN RANGE', say: 'Too close.', t });
    }
    this.zone = zone;
    if (pic.jamming) active.push({ id: 'lock-jam', severity: 'advisory', text: `TARGET JAMMING`, sinceS: t });
    return { calls, active };
  }

  reset(): void { this.had = null; this.zone = null; }
}
