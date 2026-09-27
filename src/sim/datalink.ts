/**
 * [OWNER: sim] The datalink picture (issue #12, part 3) as DCS presents it: AWACS surveillance tracks, other
 * fighters' radar tracks (donors) and friendly positions (PPLI), per side, with the Viper-manual coast rule
 * (extrapolated 20 s after the last update, then dropped). Which jet sees which feed is data/datalink.ts DATALINK;
 * the per-owner view is `datalinkFor`. Game level only: no message or network model.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { Aircraft, DatalinkTrack, EntityId } from './types';
import { isFighter } from '../data/aircraft';
import { AWACS_RANGE_M, AWACS_UPDATE_S, DATALINK, DL_COAST_S, DONOR_UPDATE_S } from '../data/datalink';
import { identifiedFriend } from './radar';

interface NetState { awacsAt: number; donorAt: number }
const NET = new WeakMap<World, NetState>();

function net(world: World): NetState {
  let n = NET.get(world);
  if (!n) { n = { awacsAt: -Infinity, donorAt: -Infinity }; NET.set(world, n); }
  return n;
}

/** Is this aircraft on a datalink network that shares tracks (a donor)? */
export function isDonor(ac: Aircraft): boolean {
  return isFighter(ac.type) && DATALINK[ac.type].donors.includes(ac.type);
}

function upsert(list: DatalinkTrack[], tr: DatalinkTrack): void {
  const i = list.findIndex(x => x.targetId === tr.targetId && x.source === tr.source && x.donorId === tr.donorId);
  if (i >= 0) list[i] = tr; else list.push(tr);
}

/** Advance every side's datalink picture by h seconds. */
export function stepDatalink(world: World, h: number): void {
  const n = net(world), t = world.t;
  for (const side of ['blue', 'red'] as const) {
    const list = world.datalink[side];
    // Coast and drop.
    for (let i = list.length - 1; i >= 0; i--) {
      const tr = list[i];
      const tgt = world.get(tr.targetId);
      if (!tgt || !tgt.alive || t - tr.t > DL_COAST_S) { list.splice(i, 1); continue; }
      tr.pos.addScaledVector(tr.vel, h);
    }
  }
  if (t - n.awacsAt >= AWACS_UPDATE_S) {
    n.awacsAt = t;
    for (const side of ['blue', 'red'] as const) {
      const orbit = world.awacs[side];
      if (!orbit) continue;
      const o = new Vector3(orbit.x, orbit.y, orbit.z);
      for (const tgt of world.aircraft.values()) {
        if (!tgt.alive || tgt.side === side || tgt.pos.distanceTo(o) > AWACS_RANGE_M) continue;
        upsert(world.datalink[side], {
          targetId: tgt.id, pos: tgt.pos.clone(), vel: tgt.vel.clone(), t, source: 'awacs', donorId: null, sovereignty: 'hostile',
        });
      }
    }
  }
  if (t - n.donorAt >= DONOR_UPDATE_S) {
    n.donorAt = t;
    for (const ac of world.aircraft.values()) {
      if (!ac.alive || !isDonor(ac)) continue;
      const list = world.datalink[ac.side];
      // PPLI: the member's own position.
      upsert(list, { targetId: ac.id, pos: ac.pos.clone(), vel: ac.vel.clone(), t, source: 'ppli', donorId: ac.id, sovereignty: 'friendly' });
      // Its own radar's firm tracks, with the ID its own IFF gives (the Viper sends its bugged target as unknown).
      for (const trk of ac.radar.tracks) {
        if (!trk.firm) continue;
        upsert(list, {
          targetId: trk.targetId, pos: trk.pos.clone(), vel: trk.vel.clone(), t, source: 'donor', donorId: ac.id,
          sovereignty: identifiedFriend(world, ac, trk.targetId) ? 'friendly' : 'unknown',
        });
      }
    }
  }
}

/**
 * What `ac`'s datalink shows: one entry per target (PPLI over donor over AWACS, freshest first), filtered by the
 * jet's network (DATALINK[type]). Never its own position or its own donor tracks. Empty for jets without a picture.
 * FC3 jets need the radar switched on (the Su-27 manual: active once the radar is first on).
 */
export function datalinkFor(world: World, ac: Aircraft): DatalinkTrack[] {
  if (!isFighter(ac.type) || !ac.alive) return [];
  const spec = DATALINK[ac.type];
  if (!spec.name) return [];
  if (!spec.donors.length && ac.radar.mode === 'off') return [];
  const rank = { ppli: 0, donor: 1, awacs: 2 } as const;
  const best = new Map<EntityId, DatalinkTrack>();
  for (const tr of world.datalink[ac.side]) {
    if (tr.targetId === ac.id || tr.donorId === ac.id) continue;
    if (tr.source === 'awacs' && !spec.awacs) continue;
    if (tr.source !== 'awacs') {
      const donor = tr.donorId ? world.get(tr.donorId) : undefined;
      if (!donor || !isFighter(donor.type) || !spec.donors.includes(donor.type)) continue;
      if (tr.source === 'ppli' && !spec.ppli) continue;
    }
    const cur = best.get(tr.targetId);
    if (!cur || rank[tr.source] < rank[cur.source] || (rank[tr.source] === rank[cur.source] && tr.t > cur.t)) best.set(tr.targetId, tr);
  }
  return [...best.values()];
}

/** Datalink ID for a target in `ac`'s picture: an AWACS says hostile; friends say friendly; else unknown. */
export function datalinkSovereignty(world: World, ac: Aircraft, targetId: EntityId): DatalinkTrack['sovereignty'] | null {
  if (!isFighter(ac.type)) return null;
  let out: DatalinkTrack['sovereignty'] | null = null;
  for (const tr of datalinkFor(world, ac)) if (tr.targetId === targetId) out = tr.sovereignty;
  // A hostile call from the AWACS wins over a donor's unknown for the same target.
  if (out !== 'friendly' && DATALINK[ac.type].awacs && datalinkFor(world, ac).some(x => x.targetId === targetId)
    && world.datalink[ac.side].some(x => x.targetId === targetId && x.source === 'awacs')) out = 'hostile';
  return out;
}
