/**
 * World: owns every entity, runs the fixed-step loop, records frames for replay, and is the
 * single API pages use to drive the simulation. Module behaviour lives in:
 *   flight.ts (aircraft motion), missile.ts (missiles), countermeasures.ts (chaff/flares),
 *   radar.ts (scan, detection, tracks, modes), rwr.ts (warnings), ai.ts (AI pilots),
 *   launch.ts (launch rules), dlz.ts (launch zones), picture.ts (radar display model), sam.ts (SAM sites).
 */
import { Vector3 } from 'three';
import type { MissileId, RadarModeId } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
import type {
  Aircraft, Countermeasure, EntityId, LaunchCheck, Missile, RecordFrame, SamMissile, SamSite, SamSpawnOptions,
  SimEvent, SpawnOptions,
} from './types';
import type { Vector3 as V3 } from 'three';

/** Guidance support a missile gets from its shooter (see radar.ts guidanceSupport). */
export interface GuidanceSupport {
  datalink: boolean;
  illuminating: boolean;
  estimate: null | { pos: V3; vel: V3 };
}
import { dirFrom } from './math';
import { stepAircraft } from './flight';
import { createMissile, stepMissile } from './missile';
import { dropChaff, dropFlare, stepCountermeasures } from './countermeasures';
import { canLock, createRadarState, cycleDesignation, designate, lockTarget, setRadarMode, setScan, setSnp2, stepRadar, undesignate, unlock, type LockCheck, type ScanChange } from './radar';
import { updateRwr } from './rwr';
import { thinkAi } from './ai';
import { canLaunch, canLaunchSnp2, launchSnp2 } from './launch';
import { createSamSite, stepSams } from './sam';
import { gunSpecFor } from '../data/wvr';

export const SIM_HZ = 60;
const RECORD_EVERY = 0.25;

export type WorldListener = (e: SimEvent) => void;

export class World {
  t = 0;
  readonly aircraft = new Map<EntityId, Aircraft>();
  readonly missiles = new Map<EntityId, Missile>();
  /** SAM sites (sam.ts) and SAMs in flight. Separate from air-to-air missiles: SAMs have no MissileId. */
  readonly samSites = new Map<EntityId, SamSite>();
  readonly samMissiles = new Map<EntityId, SamMissile>();
  countermeasures: Countermeasure[] = [];
  readonly events: SimEvent[] = [];
  readonly recording: RecordFrame[] = [];
  groundAlt = 0;
  /** Set false to skip recording (e.g. DLZ batch sims). */
  record = true;
  /**
   * When set, missile.ts uses this instead of radar.ts guidanceSupport() (e.g. DLZ sims assume a
   * perfectly supported shot). Return null to fall back to the radar.
   */
  supportOverride: ((m: Missile) => GuidanceSupport | null) | null = null;
  private seed: number;
  private nextId = 1;
  private lastRecord = -Infinity;
  private listeners = new Set<WorldListener>();

  constructor(seed = 12345) {
    this.seed = seed >>> 0;
  }

  /** Deterministic PRNG (mulberry32). Use this, never Math.random(), inside the sim. */
  rand(): number {
    let t = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uid(prefix: string): EntityId {
    return prefix + this.nextId++;
  }

  on(fn: WorldListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: SimEvent): void {
    this.events.push(e);
    if (this.events.length > 4000) this.events.splice(0, 1000);
    for (const fn of this.listeners) fn(e);
  }

  spawnAircraft(o: SpawnOptions): Aircraft {
    const spec = AIRCRAFT[o.type];
    const id = o.id ?? this.uid(o.side === 'blue' ? 'B' : 'R');
    const stores: Partial<Record<MissileId, number>> = {};
    for (const w of spec.loadout) stores[w.missile] = (stores[w.missile] ?? 0) + w.count;
    const ac: Aircraft = {
      kind: 'aircraft', id, side: o.side, type: o.type, callsign: o.callsign ?? id, controller: o.controller,
      pos: new Vector3(o.pos.x, o.pos.y, o.pos.z),
      vel: dirFrom(o.heading).multiplyScalar(o.speed),
      heading: o.heading, pitch: 0, roll: 0, g: 1, jamming: o.jamming ?? false,
      alive: true, diedAt: null, killedBy: null,
      cmd: { heading: o.heading, altitude: o.pos.y, speed: o.speed, maxG: Math.min(spec.perf.maxG, 7), afterburner: false },
      radar: createRadarState(spec),
      rwr: [],
      stores: o.stores ?? stores,
      selectedWeapon: null,
      chaff: spec.cms.chaff, flares: spec.cms.flares,
      gun: { rounds: gunSpecFor(o.type)?.rounds.value ?? 0, firing: false, burst: 0, hits: 0 }, damage: 0,
      ai: o.controller === 'ai' ? { skill: o.skill ?? 'regular', state: 'patrol', stateSince: this.t, data: {} } : null,
    };
    ac.selectedWeapon = (Object.keys(ac.stores) as MissileId[]).find(k => (ac.stores[k] ?? 0) > 0) ?? null;
    this.aircraft.set(id, ac);
    if (o.radarMode && o.radarMode !== 'rws') setRadarMode(this, ac, o.radarMode);
    this.emit({ t: this.t, type: 'spawn', id });
    return ac;
  }

  /** Place a SAM site (search -> track -> launch runs by itself; see sam.ts). */
  spawnSam(o: SamSpawnOptions): SamSite {
    const site = createSamSite(this, o);
    this.samSites.set(site.id, site);
    this.emit({ t: this.t, type: 'spawn', id: site.id });
    return site;
  }

  /** Turn a site's radars on or off (off: silent, drops its track, missiles on the way go ballistic). */
  setSamActive(id: EntityId, active: boolean): void {
    const s = this.samSites.get(id); if (s) s.active = active;
  }

  get(id: EntityId | null | undefined): Aircraft | undefined {
    return id ? this.aircraft.get(id) : undefined;
  }

  /** Every live aircraft except `id`. */
  others(id: EntityId): Aircraft[] {
    return [...this.aircraft.values()].filter(a => a.alive && a.id !== id);
  }

  enemiesOf(ac: Aircraft): Aircraft[] {
    return [...this.aircraft.values()].filter(a => a.alive && a.side !== ac.side);
  }

  /** Advance by dt seconds (any size; internally fixed 1/60 s steps). */
  step(dt: number): void {
    const n = Math.max(1, Math.ceil(dt * SIM_HZ - 1e-6));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.tick(h);
  }

  private tick(h: number): void {
    this.t += h;
    for (const ac of this.aircraft.values()) if (ac.alive && ac.controller === 'ai') thinkAi(this, ac, h);
    for (const ac of this.aircraft.values()) if (ac.alive) stepAircraft(this, ac, h);
    stepCountermeasures(this, h);
    for (const ac of this.aircraft.values()) if (ac.alive) stepRadar(this, ac, h);
    for (const m of this.missiles.values()) if (m.alive) stepMissile(this, m, h);
    if (this.samSites.size || this.samMissiles.size) stepSams(this, h);
    updateRwr(this, h);
    if (this.record && this.t - this.lastRecord >= RECORD_EVERY) { this.lastRecord = this.t; this.snapshot(); }
  }

  /** Check whether `shooter` could launch right now (selected weapon, radar state, range). */
  canLaunch(shooterId: EntityId, targetId?: EntityId, missile?: MissileId): LaunchCheck {
    const ac = this.aircraft.get(shooterId);
    if (!ac || !ac.alive) return { ok: false, reason: 'Aircraft is not alive', targetId: null, missile: null, range: null, dlz: null };
    return canLaunch(this, ac, targetId, missile);
  }

  /** Launch if allowed. Returns the missile, or the failed check. */
  launch(shooterId: EntityId, targetId?: EntityId, missile?: MissileId): Missile | LaunchCheck {
    const check = this.canLaunch(shooterId, targetId, missile);
    if (!check.ok || !check.missile) return check;
    const ac = this.aircraft.get(shooterId)!;
    if (ac.radar.snp2) {
      // One trigger pull releases the validated pair; retain the single-launch return contract.
      return launchSnp2(this, ac)[0] ?? { ...check, ok: false, reason: 'СНП2 pair is no longer available' };
    }
    const m = createMissile(this, ac, check.missile, check.targetId);
    ac.stores[check.missile] = Math.max(0, (ac.stores[check.missile] ?? 0) - 1);
    this.missiles.set(m.id, m);
    this.emit({ t: this.t, type: 'launch', missileId: m.id, shooterId, targetId: check.targetId, missile: check.missile, range: check.range, radarMode: ac.radar.mode });
    if ((ac.stores[check.missile] ?? 0) <= 0) {
      ac.selectedWeapon = (Object.keys(ac.stores) as MissileId[]).find(k => (ac.stores[k] ?? 0) > 0) ?? null;
    }
    return m;
  }

  /** Cycle to the next missile type with rounds left. */
  cycleWeapon(id: EntityId): MissileId | null {
    const ac = this.aircraft.get(id);
    if (!ac) return null;
    const avail = (Object.keys(ac.stores) as MissileId[]).filter(k => (ac.stores[k] ?? 0) > 0);
    if (!avail.length) return (ac.selectedWeapon = null);
    const i = ac.selectedWeapon ? avail.indexOf(ac.selectedWeapon) : -1;
    return (ac.selectedWeapon = avail[(i + 1) % avail.length]);
  }

  // Thin delegations so pages only ever talk to World.
  setRadarMode(id: EntityId, mode: RadarModeId, targetId?: EntityId): boolean {
    const ac = this.aircraft.get(id); return !!ac && setRadarMode(this, ac, mode, targetId);
  }
  /** Select the MiG-29S two-target mode. Other aircraft reject it. */
  setSnp2(id: EntityId, enabled: boolean): boolean {
    const ac = this.aircraft.get(id); return !!ac && setSnp2(this, ac, enabled);
  }
  canLaunchSnp2(id: EntityId): ReturnType<typeof canLaunchSnp2> {
    const ac = this.aircraft.get(id);
    return ac ? canLaunchSnp2(this, ac) : { ok: false, reason: 'Aircraft is not alive', targetIds: null, sepDeg: null, range: null, prRange: null };
  }
  /** Fire both members of a valid MiG-29S pair atomically. */
  launchSnp2(id: EntityId): Missile[] {
    const ac = this.aircraft.get(id); return ac ? launchSnp2(this, ac) : [];
  }
  designate(id: EntityId, targetId: EntityId): void {
    const ac = this.aircraft.get(id); if (ac) designate(this, ac, targetId);
  }
  lock(id: EntityId, targetId: EntityId): boolean {
    const ac = this.aircraft.get(id); return !!ac && lockTarget(this, ac, targetId);
  }
  unlock(id: EntityId): void {
    const ac = this.aircraft.get(id); if (ac) unlock(this, ac);
  }
  /** Remove one TWS designation. */
  undesignate(id: EntityId, targetId: EntityId): void {
    const ac = this.aircraft.get(id); if (ac) undesignate(this, ac, targetId);
  }
  /** Step the primary designation to the next designated track. */
  cycleDesignation(id: EntityId): void {
    const ac = this.aircraft.get(id); if (ac) cycleDesignation(this, ac);
  }
  /** Could this radar lock `targetId` right now? Reason in pilot words when not. */
  canLock(id: EntityId, targetId: EntityId): LockCheck {
    const ac = this.aircraft.get(id);
    return ac ? canLock(this, ac, targetId) : { ok: false, reason: 'Aircraft is not alive' };
  }
  setScan(id: EntityId, change: ScanChange): void {
    const ac = this.aircraft.get(id); if (ac) setScan(this, ac, change);
  }
  chaff(id: EntityId): boolean {
    const ac = this.aircraft.get(id); return !!ac && dropChaff(this, ac);
  }
  flare(id: EntityId): boolean {
    const ac = this.aircraft.get(id); return !!ac && dropFlare(this, ac);
  }

  /** Destroy an aircraft (called by missile.ts on a hit). */
  kill(targetId: EntityId, by: EntityId | null): void {
    const ac = this.aircraft.get(targetId);
    if (!ac || !ac.alive) return;
    ac.alive = false; ac.diedAt = this.t; ac.killedBy = by;
    this.emit({ t: this.t, type: 'kill', targetId, by });
  }

  private snapshot(): void {
    const f: RecordFrame = { t: this.t, aircraft: [], missiles: [] };
    for (const a of this.aircraft.values()) {
      const r = a.radar;
      f.aircraft.push({
        id: a.id, side: a.side, type: a.type, pos: [a.pos.x, a.pos.y, a.pos.z], heading: a.heading, pitch: a.pitch, roll: a.roll,
        alive: a.alive, radarMode: r.mode, sttTarget: r.stt.targetId,
        radar: { azCenter: r.azCenter, azHalf: r.azHalf, elCenter: r.elCenter, bars: r.bars, beamAz: r.beamAz, beamEl: r.beamEl },
        designated: r.designated.slice(),
        firing: a.gun.firing,
        radarContacts: {
          bricks: r.bricks.map(b => ({ targetId: b.targetId, t: b.t, pos: [b.pos.x, b.pos.y, b.pos.z] })),
          tracks: r.tracks.map(tr => ({
            targetId: tr.targetId, label: tr.label, pos: [tr.pos.x, tr.pos.y, tr.pos.z],
            vel: [tr.vel.x, tr.vel.y, tr.vel.z], lastHit: tr.lastHit, firm: tr.firm, coasting: tr.coasting,
          })),
        },
      });
    }
    for (const m of this.missiles.values()) {
      f.missiles.push({
        id: m.id, type: m.type, side: m.side, shooterId: m.shooterId, targetId: m.targetId,
        pos: [m.pos.x, m.pos.y, m.pos.z], guidance: m.guidance, alive: m.alive, timeToActive: m.timeToActive,
      });
    }
    if (this.samSites.size) {
      f.sams = [...this.samSites.values()].map(s => ({
        id: s.id, type: s.type, side: s.side, pos: [s.pos.x, s.pos.y, s.pos.z], state: s.state, targetId: s.targetId, active: s.active,
      }));
    }
    if (this.samMissiles.size) {
      f.samMissiles = [...this.samMissiles.values()].map(m => ({
        id: m.id, type: m.type, side: m.side, siteId: m.siteId, targetId: m.targetId, pos: [m.pos.x, m.pos.y, m.pos.z], guided: m.guided, alive: m.alive,
      }));
    }
    this.recording.push(f);
  }
}
