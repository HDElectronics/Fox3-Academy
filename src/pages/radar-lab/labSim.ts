/**
 * [OWNER: page-radar-lab] World glue shared by the page and its tests (no DOM): build a scene's World,
 * apply a scan preset, track when each target was painted, and turn the World into an exercise Snap.
 */
import { World } from '../../sim/world';
import type { Aircraft, EntityId } from '../../sim/types';
import type { FighterId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { radarLab } from '../../sim/scenarios';
import { explainDetection, revisitTime, scanElevationLimits } from '../../sim/radar';
import { D2R, R2D, groundRange } from '../../sim/math';
import type { Units } from '../../app/format';
import type { Scene, ScanPreset, Snap, TargetSnap } from './exercises';
import { coverageAt } from './geometry';

export const PLAYER = 'player';

export interface PaintRec { first: number | null; firstRange: number | null; last: number | null; seen: boolean }

export interface LabWorld { world: World; me: Aircraft; targetIds: EntityId[] }

/** A fresh World for the scene, own radar set to the preset (MAN centring: the scan stays where it is put). */
export function buildLabWorld(ac: FighterId, units: Units, scene: Scene, preset: ScanPreset, seed = 7): LabWorld {
  const world = new World(seed);
  const lab = radarLab(world, ac, scene.targets, { playerAlt: scene.playerAlt, playerMach: scene.playerMach, units, playerStores: {} });
  const me = world.get(PLAYER);
  if (!me) throw new Error('radar lab: no player');
  applyPreset(world, ac, preset);
  return { world, me, targetIds: lab.targetIds };
}

export function applyPreset(world: World, ac: FighterId, p: ScanPreset): void {
  const r = AIRCRAFT[ac].radar;
  world.setRadarMode(PLAYER, r.modes.includes(p.mode) ? p.mode : 'rws');
  world.setScan(PLAYER, {
    autoCenter: false, azHalf: p.azHalfDeg * D2R, bars: p.bars, azCenter: p.azCenterDeg * D2R, elCenter: p.elCenterDeg * D2R,
    rangeScale: p.rangeScaleM, cursor: { az: 0, range: p.cursorM },
    expectedRange: p.expectedRangeM ?? p.cursorM,
  });
}

export function readScan(me: Aircraft): ScanPreset {
  const st = me.radar;
  return {
    // Search modes survive a scene restart; STT / ACM / off go back to search.
    mode: st.mode === 'tws' || st.mode === 'vs' ? st.mode : 'rws',
    azHalfDeg: Math.round(st.azHalf * R2D), bars: st.bars, azCenterDeg: st.azCenter * R2D, elCenterDeg: st.elCenter * R2D,
    rangeScaleM: st.rangeScale, cursorM: st.cursor.range,
    ...(st.expectedRange !== null ? { expectedRangeM: st.expectedRange } : {}),
  };
}

/** Sim time of the latest paint of a target: its RWS brick or its track's last hit. */
export function lastPaintOf(me: Aircraft, id: EntityId): number | null {
  const st = me.radar;
  let last: number | null = null;
  for (const b of st.bricks) if (b.targetId === id && (last === null || b.t > last)) last = b.t;
  const tr = st.tracks.find(x => x.targetId === id);
  if (tr && (last === null || tr.lastHit > last)) last = tr.lastHit;
  return last;
}

export type PaintEvent = { kind: 'first' | 'lost' | 'back'; target: Aircraft; range: number; reason: string };

/** Short pilot reason a target is not on the scope right now. */
export function shortReason(world: World, me: Aircraft, tg: Aircraft): string {
  const ex = explainDetection(world, me, tg);
  if (!ex.inGimbal) return 'outside the gimbal';
  if (!ex.inAzimuth) return 'outside the azimuth';
  if (!ex.inBars) return 'outside the bars';
  if (ex.range > ex.detectRange) return 'beyond range';
  if (ex.notched) return 'in the notch';
  if (me.radar.mode === 'vs' && ex.reasons.some(x => /^VS only/.test(x))) return 'not closing (VS)';
  return 'no fresh paint';
}

/** Update paint records; "seen" = painted within the last revisit + 1 s (the brick life). */
export function updatePaints(world: World, me: Aircraft, ids: EntityId[], paint: Map<EntityId, PaintRec>, onEvent?: (e: PaintEvent) => void): void {
  const hold = revisitTime(me.radar) + 1;
  for (const id of ids) {
    const tg = world.get(id);
    let rec = paint.get(id);
    if (!rec) { rec = { first: null, firstRange: null, last: null, seen: false }; paint.set(id, rec); }
    if (!tg) continue;
    const last = lastPaintOf(me, id);
    if (last !== null && (rec.last === null || last > rec.last)) {
      rec.last = last;
      if (rec.first === null) {
        rec.first = last;
        rec.firstRange = groundRange(me.pos, tg.pos);
        onEvent?.({ kind: 'first', target: tg, range: rec.firstRange, reason: '' });
      }
    }
    const seen = tg.alive && rec.last !== null && world.t - rec.last <= hold;
    if (rec.seen && !seen) onEvent?.({ kind: 'lost', target: tg, range: groundRange(me.pos, tg.pos), reason: shortReason(world, me, tg) });
    else if (!rec.seen && seen && rec.first !== null && rec.first !== rec.last) onEvent?.({ kind: 'back', target: tg, range: groundRange(me.pos, tg.pos), reason: '' });
    rec.seen = seen;
  }
}

export function snapTarget(world: World, me: Aircraft, id: EntityId, role: string, rec: PaintRec | undefined, inspected: boolean): TargetSnap | null {
  const tg = world.get(id);
  if (!tg || !tg.alive) return null;
  const ex = explainDetection(world, me, tg);
  return {
    id, role, callsign: tg.callsign,
    range: ex.range, groundRange: groundRange(me.pos, tg.pos), alt: tg.pos.y, az: ex.az * R2D, el: ex.el * R2D,
    inGimbal: ex.inGimbal, inAz: ex.inGimbal && ex.inAzimuth, inBars: ex.inBars, beyond: ex.range > ex.detectRange,
    notched: ex.notched, detectable: ex.detectable, detectRange: ex.detectRange, radial: ex.radialSpeed,
    groundSpeed: Math.hypot(tg.vel.x, tg.vel.z),
    seenNow: !!rec?.seen, lastPaint: rec?.last ?? null, firstSeenRange: rec?.firstRange ?? null, inspected,
  };
}

/** Coverage (m, absolute) at the cursor range. */
export function coverageNow(me: Aircraft): { top: number; bottom: number; range: number } {
  const st = me.radar;
  const lim = scanElevationLimits(AIRCRAFT[me.type], st);
  const c = coverageAt(me.pos.y, st.cursor.range, lim.top * R2D, lim.bottom * R2D);
  return { ...c, range: st.cursor.range };
}

export function buildSnap(
  world: World, me: Aircraft, units: Units, scene: Scene, ids: EntityId[], paint: Map<EntityId, PaintRec>,
  inspected: ReadonlySet<EntityId>, selected: EntityId | null,
): Snap {
  const st = me.radar;
  const cov = coverageNow(me);
  return {
    t: world.t, ac: me.type, units, mode: st.mode, ownAlt: me.pos.y, frame: st.frameTime, revisit: revisitTime(st), bars: st.bars,
    azHalfDeg: Math.round(st.azHalf * R2D), azCenterDeg: st.azCenter * R2D, elCenterDeg: st.elCenter * R2D,
    cursorRange: st.cursor.range, covTop: cov.top, covBottom: cov.bottom, selectedId: selected,
    targets: ids.map((id, i) => snapTarget(world, me, id, scene.targets[i]?.role ?? '', paint.get(id), inspected.has(id)))
      .filter((x): x is TargetSnap => !!x),
  };
}

/** Would the scene restart now: over time, or a closing target inside the minimum range. */
export function needsRestart(world: World, me: Aircraft, ids: EntityId[], scene: Scene): boolean {
  if (world.t > scene.maxTime) return true;
  return ids.some(id => {
    const tg = world.get(id);
    if (!tg || !tg.alive) return false;
    const closing = (tg.pos.x - me.pos.x) * (tg.vel.x - me.vel.x) + (tg.pos.z - me.pos.z) * (tg.vel.z - me.vel.z) < 0;
    return closing && groundRange(me.pos, tg.pos) < scene.minRange;
  });
}
