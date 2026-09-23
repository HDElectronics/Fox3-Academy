/**
 * [OWNER: sim-sensors] Radar warning receivers. Every tick, for every live aircraft, `ac.rwr` is rebuilt:
 *   search:  another radar's beam painted us within 1.2 × its frame time + 0.5 s (RWS and TWS look the same;
 *            the RWR hears a radar about 1.75× farther than that radar can see us, and the notch does not
 *            hide us from it);
 *   lock:    another aircraft holds us in STT (and its beam is on us);
 *   launch:  a SARH missile is guided on us by that emitter's lock, or an ARH missile was fired at us from
 *            STT by a jet whose spec has sttArhLaunchWarning, until that missile goes active (while the lock
 *            is held). A TWS Fox 3 gives no launch warning (FC3 manual, ED tester 2022);
 *   missile: an ARH missile's active seeker is on us (emitter = the missile, bearing from the missile); held
 *            1.5 s after the seeker leaves us (e.g. for chaff) so it does not flicker.
 * SAM sites (sam.ts samRwrContact): search while the search radar paints us, lock while the track radar holds
 * us, launch while one of its missiles is guided on us; emitterType is the site's class ('sam-long' ...).
 * Contacts are sorted most dangerous first (missile > launch > lock > search, then strength), so [0] is the
 * primary threat. Emits 'rwr' events only when a contact appears or escalates.
 * Simplified: no elevation blind zones, no emitter power table, unlimited contacts.
 */
import type { World } from './world';
import type { Aircraft, EntityId, Missile, RwrContact } from './types';
import { AIRCRAFT } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import { clamp, elevationTo, relBearing } from './math';
import { lastPainted, paintRange } from './radar';
import { samRwrContact } from './sam';

/** A search contact stays this long after the last paint: 1.2 × emitter frame time + 0.5 s. */
export function searchHoldTime(emitter: Aircraft): number {
  return 1.2 * emitter.radar.frameTime + 0.5;
}

/** Lock needs the STT beam to have painted us this recently (s). */
const LOCK_PAINT_WINDOW = 0.3;
/** Distance at which an active seeker reads full strength (m). */
const MISSILE_NEAR = 20_000;
/** An active-seeker contact stays this long after the seeker leaves us (chaff hop), so it does not flicker (s). */
const MISSILE_HOLD = 1.5;

const RANK: Record<RwrContact['state'], number> = { search: 1, lock: 2, launch: 3, missile: 4 };

/** Rank of an RWR state (search 1 … missile 4), for sorting and escalation checks. */
export function rwrRank(state: RwrContact['state']): number {
  return RANK[state];
}

/** Whether each ARH missile was fired from STT (decided once, from its launch event). */
const FROM_STT = new WeakMap<Missile, boolean>();

function firedFromStt(world: World, m: Missile): boolean {
  if (m.launchRadarMode !== undefined) return m.launchRadarMode === 'stt';
  const known = FROM_STT.get(m);
  if (known !== undefined) return known;
  let fromStt: boolean | null = null;
  for (let i = world.events.length - 1; i >= 0; i--) {
    const e = world.events[i];
    if (e.t < m.launchedAt - 1) break;
    if (e.type === 'launch' && e.missileId === m.id) { fromStt = e.radarMode === 'stt'; break; }
  }
  if (fromStt === null) {
    const s = world.get(m.shooterId);
    fromStt = !!s && s.radar.mode === 'stt' && s.radar.stt.targetId === m.targetId;
  }
  FROM_STT.set(m, fromStt);
  return fromStt;
}

function holdsSttOn(em: Aircraft, rx: Aircraft, t: number): boolean {
  if (em.radar.mode !== 'stt' || em.radar.stt.targetId !== rx.id) return false;
  const p = lastPainted(em, rx.id);
  return p !== null && t - p <= LOCK_PAINT_WINDOW;
}

export function updateRwr(world: World, dt: number): void {
  const t = world.t;
  const missiles = [...world.missiles.values()].filter(m => m.alive);
  for (const rx of world.aircraft.values()) {
    if (!rx.alive) { if (rx.rwr.length) rx.rwr = []; continue; }
    const prev = new Map<EntityId, RwrContact>();
    for (const c of rx.rwr) prev.set(c.emitterId, c);
    const out: RwrContact[] = [];

    for (const em of world.aircraft.values()) {
      if (em === rx || !em.alive || em.radar.mode === 'off') continue;
      const painted = lastPainted(em, rx.id);
      let state: RwrContact['state'] | null = null;
      let lastSeen = t;
      if (painted !== null && t - painted <= searchHoldTime(em)) { state = 'search'; lastSeen = painted; }
      const locked = holdsSttOn(em, rx, t);
      if (locked) { state = 'lock'; lastSeen = t; }
      let missileType: RwrContact['missileType'];
      if (locked) {
        const shooterSpec = AIRCRAFT[em.type];
        for (const m of missiles) {
          if (m.shooterId !== em.id || m.targetId !== rx.id) continue;
          const seeker = MISSILES[m.type].seeker;
          const sarhGuided = m.guidance === 'sarh';
          const arhFromStt = seeker === 'arh' && (m.guidance === 'datalink' || m.guidance === 'inertial')
            && shooterSpec.radar.sttArhLaunchWarning && firedFromStt(world, m);
          if (sarhGuided || arhFromStt) { state = 'launch'; missileType = m.type; break; }
        }
      }
      if (!state) continue;
      const range = rx.pos.distanceTo(em.pos);
      const base = clamp(1 - range / paintRange(em), 0, 1);
      const strength = state === 'search' ? 0.15 + 0.55 * base : state === 'lock' ? 0.5 + 0.4 * base : 0.8 + 0.2 * base;
      const c: RwrContact = {
        emitterId: em.id, emitterType: em.type, state,
        bearing: relBearing(rx.pos, rx.heading, em.pos), elevation: elevationTo(rx.pos, em.pos),
        strength, firstSeen: prev.get(em.id)?.firstSeen ?? t, lastSeen,
      };
      if (missileType) c.missileType = missileType;
      out.push(c);
    }

    for (const site of world.samSites.values()) {
      const c = samRwrContact(world, site, rx, prev.get(site.id));
      if (c) out.push(c);
    }

    for (const m of missiles) {
      if (m.guidance !== 'active' || MISSILES[m.type].seeker !== 'arh') continue;
      const before = prev.get(m.id);
      const onUs = m.seekerOn === rx.id;
      if (!onUs && !(before && t - before.lastSeen <= MISSILE_HOLD)) continue;
      const range = rx.pos.distanceTo(m.pos);
      out.push({
        emitterId: m.id, emitterType: 'missile', missileType: m.type, state: 'missile',
        bearing: relBearing(rx.pos, rx.heading, m.pos), elevation: elevationTo(rx.pos, m.pos),
        strength: 0.85 + 0.15 * clamp(1 - range / MISSILE_NEAR, 0, 1),
        firstSeen: before?.firstSeen ?? t, lastSeen: onUs ? t : (before?.lastSeen ?? t),
      });
    }

    out.sort((a, b) => RANK[b.state] - RANK[a.state] || b.strength - a.strength);
    for (const c of out) {
      const before = prev.get(c.emitterId);
      if (!before || RANK[c.state] > RANK[before.state]) {
        world.emit({ t, type: 'rwr', ownerId: rx.id, emitterId: c.emitterId, state: c.state });
      }
    }
    rx.rwr = out;
  }
}
