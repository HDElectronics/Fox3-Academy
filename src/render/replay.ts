/**
 * ReplayView: renders a recording (World.recording, RecordFrame[] every 0.25 s) at any time t with
 * interpolated positions and orientations, trails up to t, missile smoke while the motor burned,
 * explosions at kills and hits, countermeasure puffs from 'cm' events, and STT lock lines.
 * Radar perspective holds recorded sensor estimates between samples, without drawing other truth entities.
 * A roster supplies callsigns and exact lifecycle times (rosterFromWorld(world) builds one).
 */
import { Vector3 } from 'three';
import type { AircraftId, MissileId, RadarModeId } from '../data/types';
import { MISSILES } from '../data/missiles';
import type { EntityId, Missile, MissileGuidance, RecordFrame, SimEvent, Side } from '../sim/types';
import type { World } from '../sim/world';
import type { Stage } from './stage';
import { TacticalScene, type AircraftLike, type CountermeasureLike, type Layers, type MissileLike, type TacticalOptions } from './tactical';
import { lerpAngle, UNIT_PER_M } from './units';
import { recordedRadarAt } from './replay-sensors';
import { Shape } from './symbols';
import { Tag } from './tags';

export interface ReplayAircraft { type: AircraftId; side: Side; callsign: string; diedAt?: number | null }
export interface ReplayMissile {
  type: MissileId; side: Side; shooterId: EntityId; targetId: EntityId | null;
  launchedAt?: number; result?: Missile['result'];
}
export interface ReplayRoster {
  aircraft: Record<EntityId, ReplayAircraft>;
  missiles: Record<EntityId, ReplayMissile>;
}

/** Build the roster a ReplayView needs from a World (types, sides, callsigns, launch times, results). */
export function rosterFromWorld(world: World): ReplayRoster {
  const r: ReplayRoster = { aircraft: {}, missiles: {} };
  for (const a of world.aircraft.values()) r.aircraft[a.id] = { type: a.type, side: a.side, callsign: a.callsign, diedAt: a.diedAt };
  for (const m of world.missiles.values()) {
    r.missiles[m.id] = { type: m.type, side: m.side, shooterId: m.shooterId, targetId: m.targetId, launchedAt: m.launchedAt, result: m.result };
  }
  return r;
}

export interface ReplayViewOptions extends TacticalOptions {
  frames: RecordFrame[];
  /** Required unless `world` is given. */
  roster?: ReplayRoster;
  /** Source of the roster and the event list. */
  world?: World;
  events?: SimEvent[];
}

interface AcTrack {
  id: EntityId;
  info: ReplayAircraft;
  t: Float64Array;
  p: Float32Array;
  h: Float32Array; pi: Float32Array; ro: Float32Array;
  alive: Uint8Array;
  mode: RadarModeId[];
  stt: (EntityId | null)[];
  diedAt: number | null;
  like: AircraftLike;
  present: boolean;
  filled: boolean;
}

interface MslTrack {
  id: EntityId;
  info: ReplayMissile;
  t: Float64Array;
  p: Float32Array;
  g: MissileGuidance[];
  alive: Uint8Array;
  launchT: number;
  deathT: number | null;
  burn: number;
  like: MissileLike;
  present: boolean;
  filled: boolean;
}

interface CmEvent { t: number; ownerId: EntityId; what: 'chaff' | 'flare'; id: string }

/** Index of the last sample with t[k] <= x (−1 if before the first). */
export function sampleIndex(t: ArrayLike<number>, x: number): number {
  let lo = 0, hi = t.length - 1;
  if (hi < 0 || x < t[0]) return -1;
  if (x >= t[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= x) lo = mid; else hi = mid;
  }
  return lo;
}

export class ReplayView extends TacticalScene {
  private frames: RecordFrame[] = [];
  private radarObserver: EntityId | null = null;
  private truthEffects = true;
  private trackTags = new Map<string, { tag: Tag; unregister: () => void }>();
  private acs: AcTrack[] = [];
  private acById = new Map<EntityId, AcTrack>();
  private msls: MslTrack[] = [];
  private cmEvents: CmEvent[] = [];
  private cmPool: CountermeasureLike[] = [];
  private cmOut: CountermeasureLike[] = [];
  private listAc: AircraftLike[] = [];
  private listMsl: MissileLike[] = [];
  private tNow = 0;
  private t0 = 0;
  private t1 = 0;

  constructor(stage: Stage, opts: ReplayViewOptions) {
    super(stage, opts);
    this.liveTrails = false;
    this.createDead = true;
    this.setData(opts.frames, opts.roster ?? (opts.world ? rosterFromWorld(opts.world) : { aircraft: {}, missiles: {} }), opts.events ?? opts.world?.events ?? []);
  }

  /** First and last recorded times (s). */
  get start(): number { return this.t0; }
  get end(): number { return this.t1; }
  /** Current replay time (s). */
  get currentTime(): number { return this.tNow; }

  /** Null selects truth; an aircraft ID selects only its ownship and recorded sensor estimates. */
  setRadarObserver(id: EntityId | null): void {
    if (id === this.radarObserver) return;
    if (this.radarObserver === null) this.truthEffects = this.layers.effects;
    this.radarObserver = id;
    this.layers.effects = id === null ? this.truthEffects : false;
    this.clearTrackTags();
    this.select(null);
    this.syncNow();
    this.stage.requestRender();
  }
  get observer(): EntityId | null { return this.radarObserver; }
  /** False for legacy/synthetic frames without sensor snapshots. No truth fallback is drawn. */
  hasRadarRecording(id: EntityId): boolean {
    return this.frames.some(f => f.aircraft.some(a => a.id === id && a.radarContacts !== undefined));
  }
  get radarSampleTime(): number | null {
    return this.radarObserver ? recordedRadarAt(this.frames, this.tNow, this.radarObserver)?.t ?? null : null;
  }

  override clear(): void {
    this.clearTrackTags();
    super.clear();
  }

  private clearTrackTags(): void {
    for (const r of this.trackTags.values()) { r.unregister(); r.tag.dispose(); }
    this.trackTags.clear();
  }

  protected override onLayerChange(name: keyof Layers): void {
    if (name === 'effects' && this.radarObserver !== null) this.layers.effects = false;
  }

  /** Show the recording at time t (clamped to [start, end]). */
  setTime(t: number): void {
    this.tNow = Math.max(this.t0, Math.min(this.t1, t));
    this.refreshLabels();
    this.stage.requestRender();
  }

  /** Replace the recording (e.g. a new sortie). */
  setData(frames: RecordFrame[], roster: ReplayRoster, events: SimEvent[] = []): void {
    this.clear();
    this.frames = frames;
    this.t0 = frames.length ? frames[0].t : 0;
    this.t1 = frames.length ? frames[frames.length - 1].t : 0;
    const acA = new Map<EntityId, { t: number[]; p: number[]; h: number[]; pi: number[]; ro: number[]; alive: number[]; mode: RadarModeId[]; stt: (EntityId | null)[] }>();
    const mA = new Map<EntityId, { t: number[]; p: number[]; g: MissileGuidance[]; alive: number[] }>();
    for (const f of frames) {
      for (const a of f.aircraft) {
        let r = acA.get(a.id);
        if (!r) { r = { t: [], p: [], h: [], pi: [], ro: [], alive: [], mode: [], stt: [] }; acA.set(a.id, r); }
        r.t.push(f.t); r.p.push(a.pos[0], a.pos[1], a.pos[2]); r.h.push(a.heading); r.pi.push(a.pitch); r.ro.push(a.roll);
        r.alive.push(a.alive ? 1 : 0); r.mode.push(a.radarMode); r.stt.push(a.sttTarget);
      }
      for (const m of f.missiles) {
        let r = mA.get(m.id);
        if (!r) { r = { t: [], p: [], g: [], alive: [] }; mA.set(m.id, r); }
        r.t.push(f.t); r.p.push(m.pos[0], m.pos[1], m.pos[2]); r.g.push(m.guidance); r.alive.push(m.alive ? 1 : 0);
      }
    }
    this.acs = [];
    for (const [id, r] of acA) {
      const info = roster.aircraft[id] ?? { type: 'su27', side: 'red', callsign: id };
      let diedAt = info.diedAt ?? null;
      if (diedAt === null) { const k = r.alive.indexOf(0); if (k >= 0) diedAt = r.t[k]; }
      const like: AircraftLike = {
        id, side: info.side, type: info.type, callsign: info.callsign, pos: new Vector3(), vel: new Vector3(),
        heading: 0, pitch: 0, roll: 0, alive: true, diedAt,
      };
      this.acs.push({
        id, info, t: Float64Array.from(r.t), p: Float32Array.from(r.p), h: Float32Array.from(r.h), pi: Float32Array.from(r.pi),
        ro: Float32Array.from(r.ro), alive: Uint8Array.from(r.alive), mode: r.mode, stt: r.stt, diedAt, like, present: false, filled: false,
      });
    }
    this.msls = [];
    for (const [id, r] of mA) {
      const info = roster.missiles[id] ?? { type: 'aim120c', side: 'blue', shooterId: '', targetId: null };
      const spec = MISSILES[info.type];
      const launchT = info.launchedAt ?? r.t[0];
      let deathT: number | null = info.result?.t ?? null;
      if (deathT === null) { const k = r.alive.indexOf(0); if (k >= 0) deathT = r.t[k]; }
      const like: MissileLike = {
        id, type: info.type, side: info.side, shooterId: info.shooterId, targetId: info.targetId, pos: new Vector3(), vel: new Vector3(),
        alive: true, guidance: r.g[0] ?? 'ballistic', motorLeft: 0, launchedAt: launchT, seekerOn: null, timeToActive: null, result: info.result ?? null,
      };
      this.msls.push({ id, info, t: Float64Array.from(r.t), p: Float32Array.from(r.p), g: r.g, alive: Uint8Array.from(r.alive), launchT, deathT, burn: spec?.burnS ?? 0, like, present: false, filled: false });
    }
    // Explosions: kills (big, at the aircraft) and missile hits (small, at the missile's last position).
    this.acById.clear();
    for (const a of this.acs) this.acById.set(a.id, a);
    for (const a of this.acs) if (a.diedAt !== null) { this.posAt(a.t, a.p, a.diedAt, this.tmp); this.addExplosion(this.tmp, a.diedAt, true); }
    for (const m of this.msls) {
      const hit = m.info.result?.kind === 'hit' || events.some(e => e.type === 'hit' && e.missileId === m.id);
      if (hit && m.deathT !== null) { this.posAt(m.t, m.p, m.deathT, this.tmp); this.addExplosion(this.tmp, m.deathT, false); }
    }
    this.cmEvents = [];
    for (const e of events) if (e.type === 'cm') this.cmEvents.push({ t: e.t, ownerId: e.ownerId, what: e.what, id: e.ownerId + ':' + e.t.toFixed(3) + e.what });
    this.tNow = this.t0;
    this.refreshLabels();
    this.stage.requestRender();
  }

  private tmp = new Vector3();

  private posAt(t: Float64Array, p: Float32Array, x: number, out: Vector3): Vector3 {
    const k = sampleIndex(t, x);
    if (k < 0) return out.set(p[0], p[1], p[2]);
    if (k >= t.length - 1) return out.set(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
    const f = (x - t[k]) / Math.max(1e-6, t[k + 1] - t[k]);
    return out.set(
      p[k * 3] + (p[k * 3 + 3] - p[k * 3]) * f,
      p[k * 3 + 1] + (p[k * 3 + 4] - p[k * 3 + 1]) * f,
      p[k * 3 + 2] + (p[k * 3 + 5] - p[k * 3 + 2]) * f,
    );
  }

  // ---------------------------------------------------------------- hooks

  protected gather(): void {
    const x = this.tNow;
    this.listAc.length = 0;
    this.listMsl.length = 0;
    for (const a of this.acs) {
      if (this.radarObserver !== null && a.id !== this.radarObserver) { a.present = false; continue; }
      const k = sampleIndex(a.t, x);
      a.present = k >= 0;
      if (!a.present) continue;
      const L = a.like, n = a.t.length;
      this.posAt(a.t, a.p, x, L.pos);
      const k1 = Math.min(n - 1, k + 1);
      const f = k1 > k ? (x - a.t[k]) / Math.max(1e-6, a.t[k1] - a.t[k]) : 0;
      L.heading = lerpAngle(a.h[k], a.h[k1], f);
      L.pitch = a.pi[k] + (a.pi[k1] - a.pi[k]) * f;
      L.roll = lerpAngle(a.ro[k], a.ro[k1], f);
      if (n >= 2) {
        const s0 = Math.min(k, n - 2), s1 = s0 + 1;
        L.vel.set(a.p[s1 * 3] - a.p[s0 * 3], a.p[s1 * 3 + 1] - a.p[s0 * 3 + 1], a.p[s1 * 3 + 2] - a.p[s0 * 3 + 2]).divideScalar(Math.max(1e-6, a.t[s1] - a.t[s0]));
      } else L.vel.set(0, 0, 0);
      L.alive = a.diedAt === null || x < a.diedAt;
      L.diedAt = L.alive ? null : a.diedAt;
      this.listAc.push(L);
    }
    for (const m of this.msls) {
      if (this.radarObserver !== null) { m.present = false; continue; }
      const k = sampleIndex(m.t, x);
      m.present = k >= 0 && x >= m.launchT - 1e-6;
      if (!m.present) continue;
      const L = m.like, n = m.t.length;
      this.posAt(m.t, m.p, x, L.pos);
      const k0 = Math.min(k, n - 2), k1 = k0 + 1;
      if (k1 < n && k0 >= 0) {
        L.vel.set(m.p[k1 * 3] - m.p[k0 * 3], m.p[k1 * 3 + 1] - m.p[k0 * 3 + 1], m.p[k1 * 3 + 2] - m.p[k0 * 3 + 2]).divideScalar(Math.max(1e-6, m.t[k1] - m.t[k0]));
      }
      L.guidance = m.g[k];
      L.alive = m.deathT === null || x < m.deathT;
      L.motorLeft = L.alive ? Math.max(0, m.burn - (x - m.launchT)) : 0;
      if (!L.alive && m.deathT !== null) this.posAt(m.t, m.p, m.deathT, L.pos);
      this.listMsl.push(L);
    }
    this.syncEntities(x, this.listAc, this.listMsl);
    this.updateTrails(x);
  }

  private updateTrails(x: number): void {
    for (const a of this.acs) {
      const v = this.jetVis(a.id);
      if (!v) { a.filled = false; continue; }
      if (!a.filled) {
        v.ribbon.clear();
        for (let i = 0; i < a.t.length; i++) v.ribbon.push(a.p[i * 3] * UNIT_PER_M, a.p[i * 3 + 1] * UNIT_PER_M, a.p[i * 3 + 2] * UNIT_PER_M, a.t[i], 0);
        a.filled = true;
      }
      const k = sampleIndex(a.t, Math.min(x, a.diedAt ?? Infinity));
      v.ribbon.setVisible(k, k >= 0 && (a.diedAt === null || x < a.diedAt) ? { x: v.pos.x, y: v.pos.y, z: v.pos.z, t: x } : undefined, x - this.opts.aircraftTrailSeconds);
      v.ribbon.flush();
    }
    for (const m of this.msls) {
      const v = this.missileVis(m.id);
      if (!v) { m.filled = false; continue; }
      if (!m.filled) {
        v.ribbon.clear();
        const end = m.deathT ?? Infinity;
        for (let i = 0; i < m.t.length; i++) {
          if (m.t[i] > end + 1e-6) break;
          const smoke = m.t[i] - m.launchT < m.burn ? 1 : 0;
          v.ribbon.push(m.p[i * 3] * UNIT_PER_M, m.p[i * 3 + 1] * UNIT_PER_M, m.p[i * 3 + 2] * UNIT_PER_M, m.t[i], smoke);
        }
        m.filled = true;
      }
      const alive = m.deathT === null || x < m.deathT;
      const k = sampleIndex(m.t, Math.min(x, m.deathT ?? Infinity));
      v.ribbon.setVisible(Math.min(k, v.ribbon.size - 1), alive ? { x: v.pos.x, y: v.pos.y, z: v.pos.z, t: x } : undefined);
      v.ribbon.flush();
    }
  }

  protected override countermeasures(): Iterable<CountermeasureLike> {
    const x = this.tNow;
    this.cmOut.length = 0;
    if (this.radarObserver !== null) return this.cmOut;
    let used = 0;
    for (const e of this.cmEvents) {
      const life = e.what === 'chaff' ? 6 : 4;
      if (x < e.t || x > e.t + life) continue;
      const owner = this.acById.get(e.ownerId);
      if (!owner) continue;
      let c = this.cmPool[used];
      if (!c) { c = { kind: 'chaff', id: '', pos: new Vector3(), vel: new Vector3(), t0: 0, life: 0 }; this.cmPool[used] = c; }
      used++;
      c.kind = e.what; c.id = e.id; c.t0 = e.t; c.life = life;
      this.posAt(owner.t, owner.p, e.t, c.pos);
      // Owner velocity at release.
      const k = Math.max(0, Math.min(owner.t.length - 2, sampleIndex(owner.t, e.t)));
      c.vel.set(owner.p[k * 3 + 3] - owner.p[k * 3], owner.p[k * 3 + 4] - owner.p[k * 3 + 1], owner.p[k * 3 + 5] - owner.p[k * 3 + 2])
        .divideScalar(Math.max(1e-6, owner.t[k + 1] - owner.t[k])).multiplyScalar(e.what === 'chaff' ? 0.2 : 0.5);
      c.pos.addScaledVector(c.vel, x - e.t);
      this.cmOut.push(c);
    }
    return this.cmOut;
  }

  protected override drawExtra(): void {
    if (this.radarObserver !== null) { this.drawRadar(); return; }
    if (!this.layers.illumination) return;
    // STT lock lines: who was locking whom at this moment.
    const x = this.tNow, P = this.palette;
    for (const a of this.acs) {
      if (!a.present || !a.like.alive) continue;
      const k = sampleIndex(a.t, x);
      const tgt = k >= 0 ? a.stt[k] : null;
      if (!tgt) continue;
      const v = this.jetVis(a.id), w = this.jetVis(tgt);
      if (!v || !w || !w.alive) continue;
      const c = a.info.side === 'blue' ? P.friendly : P.hostile;
      this.lines.seg(v.pos.x, v.pos.y, v.pos.z, w.pos.x, w.pos.y, w.pos.z, c.r, c.g, c.b, 0.55, c.r, c.g, c.b, 0.55, 1.2, 10, 0, 0.35);
    }
  }

  private drawRadar(): void {
    const sample = this.radarObserver ? recordedRadarAt(this.frames, this.tNow, this.radarObserver) : null;
    const a = sample?.aircraft;
    const contacts = a?.alive ? a.radarContacts : null;
    if (!a || !contacts) { this.clearTrackTags(); return; }
    const P = this.palette;
    for (const b of contacts.bricks) {
      const alpha = Math.max(0, 1 - (this.tNow - b.t) / 8) * 0.9;
      this.symbols.put(b.pos[0] * UNIT_PER_M, b.pos[1] * UNIT_PER_M, b.pos[2] * UNIT_PER_M, Shape.boxFill, 6, P.sym, alpha);
    }
    const seen = new Set<string>();
    for (const tr of contacts.tracks) {
      const [ex, ey, ez] = tr.pos.map(v => v * UNIT_PER_M);
      const primary = a.designated[0] === tr.targetId, locked = a.sttTarget === tr.targetId;
      const designated = a.designated.includes(tr.targetId);
      const c = primary || locked ? P.symHi : tr.firm ? P.sym : P.symDim;
      this.overlaySymbols.put(ex, ey, ez, tr.coasting ? Shape.ringDash : Shape.ring, 22, c, 0.95);
      if (designated && !primary) this.overlaySymbols.put(ex, ey, ez, Shape.diamond, 30, c, 0.8);
      if (locked) this.overlaySymbols.put(ex, ey, ez, Shape.box, 30, c, 0.95);
      if (tr.firm) {
        const k = 20 * UNIT_PER_M;
        this.lines.seg(ex, ey, ez, ex + tr.vel[0] * k, ey + tr.vel[1] * k, ez + tr.vel[2] * k, c.r, c.g, c.b, 0.85, c.r, c.g, c.b, 0.3, 1.3);
      }
      const key = tr.label + ':' + tr.targetId;
      seen.add(key);
      let rec = this.trackTags.get(key);
      if (!rec) {
        const tag = new Tag(this.stage.labels, 'track', 'neutral');
        rec = { tag, unregister: this.registerLabel(tag, { priority: 3 }) };
        this.trackTags.set(key, rec);
      }
      rec.tag.obj.position.set(ex, ey, ez);
      rec.tag.visible = this.layers.labels;
      rec.tag.setFlagAttr('primary', String(primary || locked));
      rec.tag.set(tr.label + (locked ? ' STT' : primary ? ' PRIMARY' : designated ? ' DESIGNATED' : ''), tr.coasting ? 'COAST' : 'ESTIMATE', '', '');
    }
    for (const [key, rec] of this.trackTags) if (!seen.has(key)) { rec.unregister(); rec.tag.dispose(); this.trackTags.delete(key); }
  }
}
