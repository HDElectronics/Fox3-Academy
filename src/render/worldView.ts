/**
 * WorldView: draws a live sim World every frame (jets, missiles, countermeasures, relations) plus the
 * radar-aware layers for a chosen observer: track estimates vs truth, RWS bricks, RWR threat lines,
 * Doppler-notch flags, and the radar scan volume of one aircraft. SAM sites (world.samSites) draw with their
 * threat rings, and SAMs in flight (world.samMissiles) go through the missile pipeline (samSites.ts).
 */
import { Vector3 } from 'three';
import { AIRCRAFT } from '../data/aircraft';
import { inDopplerNotch, MPS_PER_KT } from '../sim/math';
import type { EntityId, Side } from '../sim/types';
import type { World } from '../sim/world';
import type { Units } from '../app/format';
import type { Stage } from './stage';
import { RadarVolume, type RadarVolumeOptions } from './radarVolume';
import { Shape } from './symbols';
import { Tag } from './tags';
import { TacticalScene, type CountermeasureLike, type Layers, type MissileLike, type TacticalOptions } from './tactical';
import { samMissileLike, type SamSiteLike } from './samSites';
import { UNIT_PER_M } from './units';

export interface WorldViewOptions extends TacticalOptions {
  /** Aircraft whose radar/RWR drives the tracks, bricks, rwrLines and notch layers (and whose side is "ours"). */
  observer?: EntityId | null;
  /** Aircraft whose radar volume is drawn (turns the radarVolume layer on). */
  radarVolumeOf?: EntityId | null;
  radarVolume?: RadarVolumeOptions;
}

const _v = new Vector3();

export class WorldView extends TacticalScene {
  world: World;
  private observerId: EntityId | null = null;
  private volumeOf: EntityId | null = null;
  private volume: RadarVolume | null = null;
  private volumeOpts: RadarVolumeOptions;
  private trackTags = new Map<string, { tag: Tag; seen: number; unregister: () => void }>();
  private tagStamp = 0;
  private notched = new Set<EntityId>();
  private samMsl = new Map<EntityId, MissileLike>();
  private mslList: MissileLike[] = [];

  constructor(stage: Stage, world: World, opts: WorldViewOptions = {}) {
    super(stage, opts);
    this.world = world;
    this.volumeOpts = { units: opts.units, ...(opts.radarVolume ?? {}) };
    if (opts.observer !== undefined) this.setObserver(opts.observer);
    if (opts.radarVolumeOf) this.setRadarVolume(opts.radarVolumeOf);
  }

  /** Switch to another World (e.g. after a reset). Clears every visual. */
  setWorld(world: World): void {
    this.world = world;
    this.samMsl.clear();
    this.clear();
    this.clearTrackTags();
    this.time = 0;
  }

  /** The aircraft whose sensors the radar layers show, and whose side counts as "ours" for the truth layer. */
  setObserver(id: EntityId | null): void {
    this.observerId = id;
    this.observerSide = this.observerAircraft()?.side ?? null;
    this.clearTrackTags();
    this.stage.requestRender();
  }
  get observer(): EntityId | null { return this.observerId; }

  /**
   * Show the radar scan volume of one aircraft (null hides it). Returns the RadarVolume so pages can
   * tweak options (range, coverage ranges). Turns the radarVolume layer on/off accordingly.
   */
  setRadarVolume(id: EntityId | null, opts?: RadarVolumeOptions): RadarVolume | null {
    this.volumeOf = id;
    if (opts) this.volumeOpts = { ...this.volumeOpts, ...opts };
    if (!id) {
      this.layers.radarVolume = false;
      if (this.volume) this.volume.visible = false;
      return null;
    }
    const ac = this.world.aircraft.get(id);
    const spec = AIRCRAFT[ac?.type ?? 'su27'].radar;
    if (!this.volume) {
      this.volume = new RadarVolume(this.stage, spec, this.volumeOpts);
      this.volume.setLabelHost(this);
    }
    else { this.volume.setSpec(spec); if (opts) this.volume.setOptions(opts); }
    this.layers.radarVolume = true;
    this.stage.requestRender();
    return this.volume;
  }
  get radarVolume(): RadarVolume | null { return this.volume; }

  override setUnits(u: Units): void {
    super.setUnits(u);
    this.volumeOpts.units = u;
    this.volume?.setOptions({ units: u });
  }

  override dispose(): void {
    this.clearTrackTags();
    this.volume?.dispose();
    this.volume = null;
    super.dispose();
  }

  // ---------------------------------------------------------------- hooks

  protected gather(): void {
    const w = this.world;
    if (!w.samMissiles.size) { this.syncEntities(w.t, w.aircraft.values(), w.missiles.values()); return; }
    const list = this.mslList;
    list.length = 0;
    for (const m of w.missiles.values()) list.push(m);
    for (const m of w.samMissiles.values()) {
      const like = samMissileLike(m, this.samMsl.get(m.id));
      this.samMsl.set(m.id, like);
      list.push(like);
    }
    this.syncEntities(w.t, w.aircraft.values(), list);
  }

  protected override samSites(): Iterable<SamSiteLike> {
    return this.world.samSites.values();
  }

  protected override countermeasures(): Iterable<CountermeasureLike> {
    return this.world.countermeasures;
  }

  protected override onLayerChange(name: keyof Layers): void {
    if (name === 'tracks' && !this.layers.tracks) this.clearTrackTags();
    if (name === 'notch' && !this.layers.notch) { for (const id of this.notched) this.setJetFlag(id, ''); this.notched.clear(); }
    if (name === 'radarVolume' && this.volume) this.volume.visible = this.layers.radarVolume;
  }

  private observerAircraft() {
    return this.observerId ? this.world.aircraft.get(this.observerId) : undefined;
  }

  protected override drawExtra(): void {
    const P = this.palette, L = this.layers, t = this.time;
    const obs = this.observerAircraft();
    this.observerSide = obs?.side ?? null;

    // Radar volume.
    if (this.volume) {
      const ac = this.volumeOf ? this.world.aircraft.get(this.volumeOf) : undefined;
      const show = L.radarVolume && !!ac && ac.alive;
      this.volume.visible = show;
      if (show && ac) this.volume.update(ac.radar, ac.pos, ac.heading);
    }

    // STT locks (who is locking whom), when the illumination layer is on.
    if (L.illumination) {
      for (const a of this.world.aircraft.values()) {
        const tid = a.alive ? a.radar.stt.targetId : null;
        if (!tid) continue;
        const v = this.jetVis(a.id), w = this.jetVis(tid);
        if (!v || !w || !w.alive || !this.jetVisible(v)) continue;
        const c = a.side === 'blue' ? P.friendly : P.hostile;
        this.lines.seg(v.pos.x, v.pos.y, v.pos.z, w.pos.x, w.pos.y, w.pos.z, c.r, c.g, c.b, 0.55, c.r, c.g, c.b, 0.55, 1.2, 10, 0, 0.35);
      }
    }

    const stamp = ++this.tagStamp;
    if (obs && obs.alive) {
      const r = obs.radar;
      // Bricks (RWS returns): small filled squares that age out.
      if (L.bricks) {
        for (const b of r.bricks) {
          const age = t - b.t;
          const a = Math.max(0, 1 - age / 8) * 0.9;
          if (a <= 0) continue;
          this.symbols.put(b.pos.x * UNIT_PER_M, b.pos.y * UNIT_PER_M, b.pos.z * UNIT_PER_M, Shape.boxFill, 6, P.sym, a);
        }
      }
      // Track files: ring at the estimate, dashed line to the truth, velocity stick, label.
      if (L.tracks) {
        for (const tr of r.tracks) {
          const ex = tr.pos.x * UNIT_PER_M, ey = tr.pos.y * UNIT_PER_M, ez = tr.pos.z * UNIT_PER_M;
          const primary = r.designated[0] === tr.targetId;
          const designated = r.designated.includes(tr.targetId);
          const locked = r.stt.targetId === tr.targetId;
          const c = primary || locked ? P.symHi : tr.firm ? P.sym : P.symDim;
          this.overlaySymbols.put(ex, ey, ez, tr.coasting ? Shape.ringDash : Shape.ring, 22, c, 0.95);
          if (designated && !primary) this.overlaySymbols.put(ex, ey, ez, Shape.diamond, 30, c, 0.8);
          if (locked) this.overlaySymbols.put(ex, ey, ez, Shape.box, 30, P.symHi, 0.95);
          if (tr.firm) {
            const k = 20 * UNIT_PER_M;
            this.lines.seg(ex, ey, ez, ex + tr.vel.x * k, ey + tr.vel.y * k, ez + tr.vel.z * k, c.r, c.g, c.b, 0.85, c.r, c.g, c.b, 0.3, 1.3);
          }
          const truth = L.truth ? this.jetVis(tr.targetId) : undefined;
          if (truth && truth.alive) {
            const tp = truth.pos;
            this.lines.seg(ex, ey, ez, tp.x, tp.y, tp.z, c.r, c.g, c.b, 0.6, c.r, c.g, c.b, 0.6, 1.1, 7, 0, 0.5);
          }
          const key = tr.label + ':' + tr.targetId;
          let rec = this.trackTags.get(key);
          if (!rec) {
            const tag = new Tag(this.stage.labels, 'track', 'neutral');
            rec = { tag, seen: 0, unregister: this.registerLabel(tag, { priority: 3 }) };
            this.trackTags.set(key, rec);
          }
          rec.seen = stamp;
          const tag = rec.tag;
          tag.visible = L.labels;
          tag.obj.position.set(ex, ey, ez);
          tag.setFlagAttr('primary', String(primary || locked));
          tag.set(tr.label + (locked ? ' STT' : primary ? ' ◆' : designated ? ' ◇' : ''), '', '', '');
        }
      }
      // RWR threat lines from the observer to each emitter it hears.
      if (L.rwrLines) {
        const op = obs.pos;
        for (const c of obs.rwr) {
          const em = this.world.aircraft.get(c.emitterId) ?? this.world.missiles.get(c.emitterId) ?? this.world.samSites.get(c.emitterId);
          if (!em) continue;
          const col = c.state === 'search' ? P.symDim : c.state === 'lock' ? P.caution : P.warning;
          const a = c.state === 'search' ? 0.45 : 0.85;
          const dash = c.state === 'search' ? 8 : c.state === 'lock' ? 0 : 14;
          this.lines.seg(op.x * UNIT_PER_M, op.y * UNIT_PER_M, op.z * UNIT_PER_M, em.pos.x * UNIT_PER_M, em.pos.y * UNIT_PER_M, em.pos.z * UNIT_PER_M,
            col.r, col.g, col.b, a, col.r, col.g, col.b, a * 0.4, c.state === 'search' ? 1 : 1.6, dash, dash ? 50 : 0, 0.6);
        }
      }
      // Doppler notch vs the observer's radar gate.
      if (L.notch) {
        const spec = AIRCRAFT[obs.type].radar;
        const gate = spec.notchKts * MPS_PER_KT;
        for (const a of this.world.aircraft.values()) {
          if (a.id === obs.id || !a.alive) { if (this.notched.delete(a.id)) this.setJetFlag(a.id, ''); continue; }
          const inN = inDopplerNotch(obs.pos, a.pos, a.vel, gate, spec.notchNeedsLookDown, this.world.groundAlt);
          if (inN) {
            if (!this.notched.has(a.id)) { this.notched.add(a.id); this.setJetFlag(a.id, 'NOTCH'); }
            const j = this.jetVis(a.id);
            if (j && this.jetVisible(j)) this.overlaySymbols.put(j.pos.x, j.pos.y, j.pos.z, Shape.diamond, Math.max(24, j.px + 10), P.caution, 0.9);
          } else if (this.notched.delete(a.id)) this.setJetFlag(a.id, '');
        }
      }
    }
    for (const [k, rec] of this.trackTags) if (rec.seen !== stamp) { rec.unregister(); rec.tag.dispose(); this.trackTags.delete(k); }
  }

  private clearTrackTags(): void {
    for (const r of this.trackTags.values()) { r.unregister(); r.tag.dispose(); }
    this.trackTags.clear();
  }

  /** Sim position (m) of an entity's true state (not the displayed one), or null. */
  truePosition(id: EntityId, out = _v): Vector3 | null {
    const e = this.world.aircraft.get(id) ?? this.world.missiles.get(id) ?? this.world.samMissiles.get(id) ?? this.world.samSites.get(id);
    return e ? out.copy(e.pos) : null;
  }

  /** Side of an aircraft, if known. */
  sideOf(id: EntityId): Side | null {
    const w = this.world;
    return w.aircraft.get(id)?.side ?? w.missiles.get(id)?.side ?? w.samMissiles.get(id)?.side ?? w.samSites.get(id)?.side ?? null;
  }
}
