/**
 * TacticalScene: the shared engine behind WorldView (live) and ReplayView (recorded). It turns
 * aircraft / missile / countermeasure states into jets with Tacview-style visibility scaling, tags,
 * drop lines and ground shadows, trails and smoke, datalink / illumination lines, seeker cones,
 * countermeasure puffs, explosions, selection and screen-space picking.
 * Subclasses feed it every frame through syncEntities() and may draw extra symbology in drawExtra().
 */
import {
  Color, ConeGeometry, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  NotEqualStencilFunc, Quaternion, ReplaceStencilOp, ShaderMaterial, Vector2, Vector3,
} from 'three';
import type { AircraftId, MissileId } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import type { EntityId, Missile, MissileGuidance, Side } from '../sim/types';
import { fmtAltShort, fmtSpeed, type Units } from '../app/format';
import { mach as machAt } from '../sim/atmosphere';
import type { Stage } from './stage';
import { FramePriority } from './stage';
import { LineBatch } from './lines';
import { Shape, SymbolLayer } from './symbols';
import { createRibbonMaterial, RibbonGeometry, Trail } from './ribbon';
import { f14SweepForMach, JetMesh, NOMINAL_JET_M, NOMINAL_MISSILE_M, smokeDensity } from './jets';
import { sideColor, type Palette } from './palette';
import { Tag, LabelPriority, LabelRegistry, layoutLabels, type DeclutterLabel, type LabelRegistration, type LabelCandidate } from './tags';
import { boostedScale, orientationQuaternion, UNIT_PER_M } from './units';
import { MissileVisual } from './missileVisual';
import type { AssetId } from './assets';
import { SamSiteLayer, type SamSiteLike } from './samSites';
import { FRAG_END, FRAG_PRELUDE, ORDER, VERT_END, VERT_PRELUDE } from './shared';

// ------------------------------------------------------------------------------------------ types

/** The fields the renderer reads from an aircraft (sim Aircraft satisfies it). */
export interface AircraftLike {
  id: EntityId;
  side: Side;
  type: AircraftId;
  callsign: string;
  pos: Vector3;
  vel: Vector3;
  heading: number;
  pitch: number;
  roll: number;
  alive: boolean;
  diedAt: number | null;
}

/** The fields the renderer reads from a missile (sim Missile satisfies it). */
export interface MissileLike {
  id: EntityId;
  type: MissileId;
  side: Side;
  shooterId: EntityId;
  targetId: EntityId | null;
  pos: Vector3;
  vel: Vector3;
  alive: boolean;
  guidance: MissileGuidance;
  motorLeft: number;
  launchedAt: number;
  seekerOn: EntityId | null;
  timeToActive: number | null;
  result: Missile['result'];
  /**
   * Missiles outside the MissileId catalogue (SAMs, see samSites.ts): `type` then only picks the body mesh;
   * the tag name, on-screen length, the guided-state text and smoke density come from here.
   */
  display?: { name: string; lengthM: number; guidedText: string; smoke: number; visualAssetId?: AssetId };
}

export interface CountermeasureLike {
  kind: 'chaff' | 'flare';
  id: EntityId;
  pos: Vector3;
  vel: Vector3;
  t0: number;
  life: number;
}

/** Runtime-toggleable layers. */
export interface Layers {
  /** Aircraft tags: callsign, type, altitude, speed. */
  labels: boolean;
  /** Missile tags: type and guidance state. */
  missileLabels: boolean;
  /** Vertical line from each jet to the surface, with a foot mark. */
  dropLines: boolean;
  /** Flattened silhouette on the surface under each jet. */
  shadows: boolean;
  /** Missile flight-path lines. */
  trails: boolean;
  /** Motor smoke while the missile burns. */
  smoke: boolean;
  /** Recent flight path of each jet. */
  aircraftTrails: boolean;
  /** Chaff and flare puffs. */
  countermeasures: boolean;
  /** Shooter → missile line while guidance is 'datalink'. */
  datalink: boolean;
  /** Shooter → target line while guidance is 'sarh' (radar illumination). */
  illumination: boolean;
  /** Seeker cone while guidance is 'active'. */
  seekers: boolean;
  /** Explosions and flashes. */
  effects: boolean;
  /** Velocity vectors (30 s of flight) on jets. */
  velocity: boolean;
  /** Draw the true jets not on the observer's side. Off = see only what the radar believes. */
  truth: boolean;
  /** Observer's radar track files: ring at the estimate, dashed line estimate → truth. (WorldView) */
  tracks: boolean;
  /** Observer's RWS returns (bricks). (WorldView) */
  bricks: boolean;
  /** Radar scan volume of the chosen aircraft. (WorldView) */
  radarVolume: boolean;
  /** Observer's RWR contacts as threat lines. (WorldView) */
  rwrLines: boolean;
  /** Flag jets sitting in the observer radar's Doppler notch. (WorldView) */
  notch: boolean;
  /** SAM threat rings: ground ring, minimum range and altitude band (sites themselves always draw). */
  samRings: boolean;
}

export const DEFAULT_LAYERS: Layers = {
  labels: true, missileLabels: true, dropLines: true, shadows: true, trails: true, smoke: true,
  aircraftTrails: true, countermeasures: true, datalink: true, illumination: true, seekers: true,
  effects: true, velocity: false, truth: true, tracks: false, bricks: false, radarVolume: false,
  rwrLines: false, notch: false, samRings: true,
};

export interface TacticalOptions {
  units?: Units;
  layers?: Partial<Layers>;
  /** 'screen' (default): Tacview-style pixel floor so jets stay visible at 100 km. 'true': real size. */
  sizeMode?: 'screen' | 'true';
  /** Minimum on-screen length of a (nominal 19 m) jet in CSS px. Default 40. */
  minJetPx?: number;
  /** Minimum on-screen length of a missile in CSS px. Default 13. */
  minMissilePx?: number;
  /** Multiplier on true size (both modes). Default 1. */
  trueScale?: number;
  /** Seconds of recent path drawn behind jets. Default 45. */
  aircraftTrailSeconds?: number;
  /** Seconds a dead missile's path lingers. Default 20. */
  missilePathLinger?: number;
  /** Override the aircraft tag text. */
  /**
   * Override the aircraft tag text. `tone` colours the whole tag ('caution' | 'warning' | 'ok' | 'hi' |
   * 'dim', e.g. what that bandit's RWR hears); omit it for the side colour.
   */
  label?: (ac: AircraftLike, units: Units) => { title: string; type?: string; sub: string; flag?: string; tone?: 'caution' | 'warning' | 'ok' | 'hi' | 'dim' | null };
}

export interface PickOptions {
  kinds?: ('aircraft' | 'missile')[];
  /** Extra pick radius in CSS px. Default 10. */
  slopPx?: number;
}

/** What camera rigs need from a view. Positions in sim metres. */
export interface EntitySource {
  positionOf(id: EntityId, out: Vector3): boolean;
  orientationOf(id: EntityId, out: Quaternion): boolean;
  headingOf(id: EntityId): number | null;
  setHidden?(id: EntityId, hidden: boolean): void;
  /** Current render scale (units per model metre) of an entity, for camera distances. */
  displayScaleOf?(id: EntityId): number;
}

// ------------------------------------------------------------------------------------------ internals

interface JetVis {
  id: EntityId;
  type: AircraftId;
  side: Side;
  data: AircraftLike;
  mesh: JetMesh;
  shadow: JetMesh;
  tag: Tag;
  ribbon: RibbonGeometry;
  trail: Trail;
  pos: Vector3;          // displayed, units
  quat: Quaternion;
  scale: number;
  px: number;            // on-screen length, px
  alive: boolean;
  diedAt: number | null;
  fade: number;          // 0..1
  hidden: boolean;
  seen: number;          // frame stamp
  fadeMat: MeshStandardMaterial | null;
  flag: string;
}

interface MslVis {
  id: EntityId;
  type: MissileId;
  side: Side;
  data: MissileLike;
  mesh: MissileVisual;
  tag: Tag;
  ribbon: RibbonGeometry;
  trail: Trail;
  pos: Vector3;
  scale: number;
  px: number;
  alive: boolean;
  deadAt: number | null;
  seen: number;
  hidden: boolean;
  burning: boolean;
  lengthM: number;
}

interface Blast { x: number; y: number; z: number; t0: number; big: boolean; seed: number }

const coneVert = /* glsl */ `
${VERT_PRELUDE}
varying float vK;
void main() {
  vK = -position.z; // 0 at apex, 1 at base
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  ${VERT_END}
}`;
const coneFrag = /* glsl */ `
${FRAG_PRELUDE}
uniform vec3 uColor;
uniform float uAlpha;
varying float vK;
void main() {
  float a = uAlpha * pow(1.0 - vK, 1.5) * smoothstep(0.0, 0.04, vK);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
  ${FRAG_END}
}`;

const _v = new Vector3();
const _v2 = new Vector3();
const _q = new Quaternion();
const _m = new Matrix4();
const _flat = new Matrix4();
const _p2 = new Vector2();
const _c = new Color();

export abstract class TacticalScene implements EntitySource {
  readonly stage: Stage;
  readonly group = new Group();
  readonly layers: Layers;
  units: Units;
  protected opts: Required<Omit<TacticalOptions, 'layers' | 'label' | 'units'>> & Pick<TacticalOptions, 'label'>;
  protected palette: Palette;
  protected jets = new Map<EntityId, JetVis>();
  protected missiles = new Map<EntityId, MslVis>();
  protected retired = new Set<EntityId>();
  protected blasts: Blast[] = [];
  protected lines: LineBatch;
  protected symbols: SymbolLayer;
  protected glow: SymbolLayer;
  protected overlaySymbols: SymbolLayer;
  protected time = 0;
  protected selected: EntityId | null = null;
  /** When false the subclass manages trails itself (replay). */
  protected liveTrails = true;
  /** Create visuals for entities first seen dead (replay seeks past a kill). */
  protected createDead = false;
  /** Side whose view is "ours" for the truth layer (null = show everything). */
  protected observerSide: Side | null = null;
  private frame = 0;
  private labelClock = 0;
  private shadowMat: MeshBasicMaterial;
  private coneGeo: ConeGeometry;
  private coneMats = new Map<Side, ShaderMaterial>();
  private cones = new Map<EntityId, Mesh>();
  private offs: (() => void)[] = [];
  private disposed = false;
  private samLayer: SamSiteLayer;
  private pageLabels = new LabelRegistry();
  /** Last visible layout offset per label, fed back so placements stay put while still free. */
  private lastPlacement = new WeakMap<DeclutterLabel, { x: number; y: number }>();

  constructor(stage: Stage, opts: TacticalOptions = {}) {
    this.stage = stage;
    this.palette = stage.palette;
    this.units = opts.units ?? 'metric';
    this.layers = { ...DEFAULT_LAYERS, ...(opts.layers ?? {}) };
    this.opts = {
      sizeMode: opts.sizeMode ?? 'screen',
      minJetPx: opts.minJetPx ?? 40,
      minMissilePx: opts.minMissilePx ?? 13,
      trueScale: opts.trueScale ?? 1,
      aircraftTrailSeconds: opts.aircraftTrailSeconds ?? 45,
      missilePathLinger: opts.missilePathLinger ?? 20,
      label: opts.label,
    };
    this.group.name = 'tactical';
    stage.scene.add(this.group);
    const sh = stage.shared;
    this.lines = new LineBatch(sh, { capacity: 128 });
    this.symbols = new SymbolLayer(sh, { capacity: 128 });
    this.glow = new SymbolLayer(sh, { capacity: 64, additive: true, renderOrder: ORDER.points + 1 });
    this.overlaySymbols = new SymbolLayer(sh, { capacity: 32, depthTest: false, renderOrder: ORDER.overlay });
    this.group.add(this.lines, this.symbols, this.glow, this.overlaySymbols);
    this.shadowMat = new MeshBasicMaterial({
      color: this.palette.soot.clone(), transparent: true, opacity: 0.26, depthWrite: false, toneMapped: false, side: DoubleSide,
      stencilWrite: true, stencilRef: 1, stencilFunc: NotEqualStencilFunc, stencilZPass: ReplaceStencilOp,
    });
    // Unit cone: apex at origin, base radius 1 at z = −1.
    this.coneGeo = new ConeGeometry(1, 1, 20, 1, true);
    this.coneGeo.rotateX(Math.PI / 2);
    this.coneGeo.translate(0, 0, -0.5);
    this.samLayer = new SamSiteLayer(stage, this.group, (l, o) => this.registerLabel(l, o));
    this.offs.push(stage.onFrame(() => this.syncPhase(), { priority: FramePriority.view, always: true }));
    this.offs.push(stage.onFrame(() => this.latePhase(), { priority: FramePriority.late, always: true }));
    stage.track(this);
  }

  // ---------------------------------------------------------------- public API

  /** Join page-owned Tag/Note annotations to entity-label layout. Lower priority wins:
   * selected aircraft 0, aircraft 1, missiles 2, default annotation 3. Returns an idempotent
   * unregister function; call it before disposing the label. clear()/world resets retain registrations.
   * Positions are read from label.obj in render units. Offscreen anchors are not moved into view.
   */
  registerLabel(label: DeclutterLabel, options: LabelRegistration = {}): () => void {
    if (this.disposed) return () => {};
    const off = this.pageLabels.register(label, options);
    this.stage.requestRender();
    return () => { off(); this.stage.requestRender(); };
  }

  setLayer<K extends keyof Layers>(name: K, on: Layers[K]): void {
    this.layers[name] = on;
    this.onLayerChange(name);
    this.stage.requestRender();
  }
  setLayers(l: Partial<Layers>): void {
    for (const k of Object.keys(l) as (keyof Layers)[]) { const v = l[k]; if (v !== undefined) this.setLayer(k, v); }
  }
  setUnits(u: Units): void { this.units = u; this.labelClock = -1; this.stage.requestRender(); }
  /** 'screen' keeps jets at least minJetPx long; 'true' draws real size. */
  setSizeMode(mode: 'screen' | 'true'): void { this.opts.sizeMode = mode; this.stage.requestRender(); }

  /** Highlight one entity with corner brackets (and its tag). Pass null to clear. */
  select(id: EntityId | null): void {
    this.selected = id;
    for (const j of this.jets.values()) j.tag.setSelected(j.id === id);
    this.stage.requestRender();
  }
  get selection(): EntityId | null { return this.selected; }

  /** Hide / show one entity's visuals (e.g. own jet in the cockpit camera). */
  setHidden(id: EntityId, hidden: boolean): void {
    const j = this.jets.get(id); if (j) j.hidden = hidden;
    const m = this.missiles.get(id); if (m) m.hidden = hidden;
  }

  /** Nearest aircraft or missile under a client point (screen space, forgiving), or null. */
  pickEntity(clientX: number, clientY: number, o: PickOptions = {}): EntityId | null {
    const kinds = o.kinds ?? ['aircraft', 'missile'];
    const slop = o.slopPx ?? 10;
    let best: EntityId | null = null, bestD = Infinity;
    const cam = this.stage.camera;
    cam.updateMatrixWorld();
    const test = (id: EntityId, pos: Vector3, px: number, bias: number) => {
      if (!this.stage.projectToClient(pos, _p2)) return;
      const d = Math.hypot(_p2.x - clientX, _p2.y - clientY);
      const r = Math.max(12, px * 0.5) + slop;
      if (d <= r && d + bias < bestD) { bestD = d + bias; best = id; }
    };
    if (kinds.includes('aircraft')) for (const j of this.jets.values()) if (this.jetVisible(j)) test(j.id, j.pos, j.px, 0);
    if (kinds.includes('missile')) for (const m of this.missiles.values()) if (m.alive && !m.hidden) test(m.id, m.pos, m.px, 6);
    return best;
  }

  /** Displayed position of an entity in sim metres. */
  positionOf(id: EntityId, out: Vector3): boolean {
    const j = this.jets.get(id);
    if (j) { out.copy(j.pos).multiplyScalar(1000); return true; }
    const m = this.missiles.get(id);
    if (m) { out.copy(m.pos).multiplyScalar(1000); return true; }
    return false;
  }
  orientationOf(id: EntityId, out: Quaternion): boolean {
    const j = this.jets.get(id);
    if (j) { out.copy(j.quat); return true; }
    const m = this.missiles.get(id);
    if (m) { out.copy(m.mesh.quaternion); return true; }
    return false;
  }
  headingOf(id: EntityId): number | null {
    const j = this.jets.get(id);
    if (j) return j.data.heading;
    const m = this.missiles.get(id);
    if (m) return Math.atan2(m.data.vel.x, -m.data.vel.z);
    return null;
  }
  displayScaleOf(id: EntityId): number {
    return this.jets.get(id)?.scale ?? this.missiles.get(id)?.scale ?? UNIT_PER_M;
  }
  /** Ids of every aircraft currently drawn. */
  aircraftIds(): EntityId[] { return [...this.jets.keys()]; }
  /** The jet's Object3D (for pages that attach extra things). */
  jetObject(id: EntityId): JetMesh | undefined { return this.jets.get(id)?.mesh; }
  /** Screen length (px) the jet currently occupies. */
  jetPixelSize(id: EntityId): number { return this.jets.get(id)?.px ?? 0; }

  /** Add an explosion at a sim position (metres) at sim time t0. */
  addExplosion(pos: { x: number; y: number; z: number }, t0: number, big = true): void {
    this.blasts.push({ x: pos.x * UNIT_PER_M, y: pos.y * UNIT_PER_M, z: pos.z * UNIT_PER_M, t0, big, seed: Math.random() });
    if (this.blasts.length > 24) this.blasts.shift();
  }

  /**
   * Pull the current state now (trails sample, visuals created/removed) without waiting for a frame.
   * Useful when fast-forwarding a sim before the first render: call it after each world.step().
   */
  syncNow(): void { this.syncPhase(); }

  /** Remove every visual (e.g. before switching to another World). */
  clear(): void {
    for (const j of this.jets.values()) this.disposeJet(j);
    for (const m of this.missiles.values()) this.disposeMissile(m);
    for (const c of this.cones.values()) c.removeFromParent();
    this.samLayer.clear();
    this.jets.clear(); this.missiles.clear(); this.cones.clear(); this.retired.clear(); this.blasts = [];
    this.stage.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs) off();
    this.clear();
    this.pageLabels.clear();
    this.lines.dispose(); this.symbols.dispose(); this.glow.dispose(); this.overlaySymbols.dispose();
    this.shadowMat.dispose(); this.coneGeo.dispose();
    for (const m of this.coneMats.values()) m.dispose();
    this.group.removeFromParent();
    this.stage.untrack(this);
  }

  // ---------------------------------------------------------------- subclass hooks

  /** Called at the view priority: call syncEntities() with the current state. */
  protected abstract gather(): void;
  /** Extra symbology in the late pass (after camera): lines/symbols batches are open. */
  protected drawExtra(): void {}
  /** Subclasses return the SAM sites to draw (live world or replay); none by default. */
  protected samSites(): Iterable<SamSiteLike> { return []; }
  /** Displayed position (render units) of a SAM site, or null. */
  samSitePosition(id: EntityId): Vector3 | null { return this.samLayer.positionOf(id); }
  protected onLayerChange(_name: keyof Layers): void {}

  // ---------------------------------------------------------------- sync

  private syncPhase(): void {
    if (this.disposed) return;
    this.frame++;
    this.gather();
    this.samLayer.sync(this.samSites());
  }

  /** Feed the current state. `t` is sim (or replay) time in seconds. */
  protected syncEntities(t: number, aircraft: Iterable<AircraftLike>, missiles: Iterable<MissileLike>): void {
    if (t < this.time - 1e-6 && this.liveTrails) {
      // Time went backwards (new World / reset): start clean.
      this.clear();
    }
    this.time = t;
    const f = this.frame;
    for (const a of aircraft) {
      let j = this.jets.get(a.id);
      if (!j) {
        if (!a.alive && !this.createDead) continue;
        j = this.createJet(a);
      }
      j.seen = f;
      j.data = a;
      this.updateJet(j, a, t);
    }
    for (const m of missiles) {
      let v = this.missiles.get(m.id);
      if (!v) {
        if ((!m.alive && !this.createDead) || this.retired.has(m.id)) continue;
        v = this.createMissile(m);
      }
      v.seen = f;
      v.data = m;
      this.updateMissile(v, m, t);
    }
    for (const j of this.jets.values()) {
      if (j.seen !== f) { this.disposeJet(j); this.jets.delete(j.id); }
    }
    for (const v of this.missiles.values()) {
      const gone = v.seen !== f;
      const expired = !v.alive && v.deadAt !== null && t - v.deadAt > this.opts.missilePathLinger + 1 && this.liveTrails;
      if (gone || expired) {
        this.disposeMissile(v); this.missiles.delete(v.id);
        if (expired) this.retired.add(v.id);
      }
    }
    // Drop blasts that are over.
    if (this.blasts.length && this.liveTrails) this.blasts = this.blasts.filter(b => t - b.t0 < 10 && t >= b.t0 - 0.01);
  }

  private createJet(a: AircraftLike): JetVis {
    const mesh = new JetMesh(a.type, a.side, this.palette, { onReady: () => this.stage.requestRender() });
    const shadow = new JetMesh(a.type, a.side, this.palette, { onReady: () => this.stage.requestRender() });
    shadow.setMaterial(this.shadowMat);
    shadow.matrixAutoUpdate = false;
    shadow.renderOrder = ORDER.shadows;
    shadow.traverse(o => { o.renderOrder = ORDER.shadows; o.frustumCulled = false; });
    mesh.traverse(o => { o.frustumCulled = false; });
    const ribbon = new RibbonGeometry(256, 0.5);
    const trail = new Trail(ribbon, [createRibbonMaterial(this.stage.shared, {
      color: sideColor(this.palette, a.side), alpha: 0.5, widthPx: 1.3, fade: this.opts.aircraftTrailSeconds,
    })]);
    for (const m of trail.meshes) this.group.add(m);
    const tag = new Tag(this.stage.labels, 'aircraft', a.side);
    this.group.add(mesh, shadow);
    const j: JetVis = {
      id: a.id, type: a.type, side: a.side, data: a, mesh, shadow, tag, ribbon, trail,
      pos: new Vector3(), quat: new Quaternion(), scale: UNIT_PER_M, px: 0,
      alive: true, diedAt: null, fade: 1, hidden: false, seen: 0, fadeMat: null, flag: '',
    };
    this.jets.set(a.id, j);
    tag.setSelected(this.selected === a.id);
    return j;
  }

  private updateJet(j: JetVis, a: AircraftLike, t: number): void {
    if (j.type !== a.type || j.side !== a.side) {
      // Type or side changed under the same id: rebuild.
      this.disposeJet(j);
      const nj = this.createJet(a);
      nj.seen = j.seen;
      Object.assign(j, nj);
      this.jets.set(a.id, j);
    }
    j.pos.set(a.pos.x, a.pos.y, a.pos.z).multiplyScalar(UNIT_PER_M);
    orientationQuaternion(a.heading, a.pitch, a.roll, j.quat);
    if (a.alive) {
      if (!j.alive) { // revived (replay seek)
        j.alive = true; j.diedAt = null; j.fade = 1;
        if (j.fadeMat) { j.mesh.setSide(j.side, this.palette); j.fadeMat.dispose(); j.fadeMat = null; }
        j.tag.setDead(false);
      }
    } else {
      if (j.alive) {
        j.alive = false;
        j.diedAt = a.diedAt ?? t;
        if (this.liveTrails) this.addExplosion(a.pos, j.diedAt, true);
        j.fadeMat = new MeshStandardMaterial({ color: this.palette.soot.clone(), roughness: 0.9, transparent: true, opacity: 1, flatShading: true, side: DoubleSide });
        j.mesh.setMaterial(j.fadeMat);
        j.tag.setDead(true);
      }
      // Visual fall after the kill: keep the last velocity, add gravity, fade out.
      const tau = Math.max(0, t - (j.diedAt ?? t));
      j.pos.x += a.vel.x * tau * 0.6 * UNIT_PER_M;
      j.pos.z += a.vel.z * tau * 0.6 * UNIT_PER_M;
      j.pos.y = Math.max(0, j.pos.y + (a.vel.y * 0.6 * tau - 4.9 * tau * tau) * UNIT_PER_M);
      j.fade = Math.max(0, 1 - tau / 4);
      if (j.fadeMat) j.fadeMat.opacity = j.fade;
    }
    if (this.liveTrails && a.alive) {
      j.ribbon.track(j.pos.x, j.pos.y, j.pos.z, t, 0);
      j.ribbon.trimBefore(t - this.opts.aircraftTrailSeconds);
    }
    j.trail.setTime(t);
    j.ribbon.flush();
  }

  private createMissile(m: MissileLike): MslVis {
    const lengthM = m.display?.lengthM ?? MISSILES[m.type]?.lengthM ?? 3.7;
    const mesh = new MissileVisual(m.type, m.display?.visualAssetId ?? m.type, this.palette, lengthM, () => this.stage.requestRender());
    mesh.frustumCulled = false;
    this.group.add(mesh);
    const ribbon = new RibbonGeometry(512, 0.1);
    const col = sideColor(this.palette, m.side);
    const dens = m.display?.smoke ?? smokeDensity(m.type);
    const trail = new Trail(ribbon, [
      createRibbonMaterial(this.stage.shared, { color: this.palette.smoke, alpha: 0.55 * dens, widthPx: 3, widthWorld: 0.006, grow: 0.0035, growPx: 1.2, fade: 28, smoke: true }),
      createRibbonMaterial(this.stage.shared, { color: col, alpha: 0.75, widthPx: 1.5 }),
    ]);
    for (const x of trail.meshes) this.group.add(x);
    const tag = new Tag(this.stage.labels, 'missile', m.side);
    const v: MslVis = {
      id: m.id, type: m.type, side: m.side, data: m, mesh, tag, ribbon, trail,
      pos: new Vector3(), scale: UNIT_PER_M, px: 0, alive: true, deadAt: null, seen: 0, hidden: false, burning: m.motorLeft > 0,
      lengthM,
    };
    this.missiles.set(m.id, v);
    return v;
  }

  private updateMissile(v: MslVis, m: MissileLike, t: number): void {
    v.pos.set(m.pos.x, m.pos.y, m.pos.z).multiplyScalar(UNIT_PER_M);
    v.burning = m.alive && m.motorLeft > 0;
    if (m.alive && !v.alive) { v.alive = true; v.deadAt = null; v.trail.setDeath(1e9, 0); }
    if (!m.alive && v.alive) {
      v.alive = false;
      v.deadAt = m.result?.t ?? t;
      if (this.liveTrails) {
        if (m.result?.kind === 'hit') this.addExplosion(m.pos, v.deadAt, false);
      }
      v.trail.setDeath(v.deadAt, this.opts.missilePathLinger);
    }
    // Orientation along velocity.
    const sp = m.vel.length();
    if (sp > 1) {
      _v.copy(m.vel).divideScalar(sp);
      _q.setFromUnitVectors(_v2.set(0, 0, -1), _v);
      v.mesh.quaternion.copy(_q);
    }
    if (this.liveTrails && m.alive) {
      const smoke = v.burning ? 1 : 0;
      v.ribbon.track(v.pos.x, v.pos.y, v.pos.z, t, smoke);
    }
    v.trail.setTime(t);
    v.ribbon.flush();
  }

  private disposeJet(j: JetVis): void {
    j.mesh.dispose(); j.shadow.dispose();
    j.mesh.removeFromParent(); j.shadow.removeFromParent();
    j.tag.dispose(); j.trail.dispose();
    if (j.fadeMat) j.fadeMat.dispose();
  }

  private disposeMissile(v: MslVis): void {
    v.mesh.dispose(); v.mesh.removeFromParent(); v.tag.dispose(); v.trail.dispose();
    const c = this.cones.get(v.id);
    if (c) { c.removeFromParent(); this.cones.delete(v.id); }
  }

  protected jetVisible(j: JetVis): boolean {
    if (j.hidden || j.fade <= 0.01) return false;
    if (!this.layers.truth && this.observerSide && j.side !== this.observerSide) return false;
    return true;
  }

  // ---------------------------------------------------------------- late pass (after camera)

  private latePhase(): void {
    if (this.disposed) return;
    const stage = this.stage;
    const cam = stage.camera;
    const camPos = cam.position;
    const P = this.palette;
    const L = this.layers;
    const t = this.time;
    this.lines.reset(); this.symbols.reset(); this.glow.reset(); this.overlaySymbols.reset();
    const labelTick = stage.elapsed - this.labelClock >= 0.12 || this.labelClock < 0;
    if (labelTick) this.labelClock = stage.elapsed;

    // --- jets
    for (const j of this.jets.values()) {
      const vis = this.jetVisible(j);
      j.mesh.visible = vis;
      j.shadow.visible = vis && L.shadows && j.alive;
      j.trail.visible = L.aircraftTrails && !j.hidden && (this.layers.truth || !this.observerSide || j.side === this.observerSide);
      j.tag.visible = vis && L.labels && (j.alive || t - (j.diedAt ?? t) < 6);
      if (!vis) { j.px = 0; continue; }
      const dist = camPos.distanceTo(j.pos);
      const ppu = stage.pxPerUnit(dist);
      const s = this.opts.sizeMode === 'true' ? UNIT_PER_M * this.opts.trueScale : boostedScale(ppu, NOMINAL_JET_M, this.opts.minJetPx, this.opts.trueScale);
      j.scale = s;
      j.px = j.mesh.lengthM * s * ppu;
      j.mesh.position.copy(j.pos);
      j.mesh.quaternion.copy(j.quat);
      j.mesh.scale.setScalar(s);
      if (j.mesh.hasSwingWing) {
        const spd = j.data.vel.length();
        j.mesh.setSweep(f14SweepForMach(machAt(spd, j.data.pos.y)));
        j.shadow.setSweep(j.mesh.sweepDeg);
      }
      const col = sideColor(P, j.side);
      // Faint phosphor halo so boosted (distant) jets pop against the surface.
      if (j.alive && j.px <= this.opts.minJetPx * 1.3) this.glow.put(j.pos.x, j.pos.y, j.pos.z, Shape.glow, j.px * 1.5, col, 0.22);
      if (j.shadow.visible) {
        _flat.set(1, 0, 0, 0, 0, 1e-6, 0, 0.0006, 0, 0, 1, 0, 0, 0, 0, 1);
        _m.compose(j.pos, j.quat, _v.setScalar(s));
        j.shadow.matrix.multiplyMatrices(_flat, _m);
        j.shadow.matrixWorldNeedsUpdate = true;
      }
      if (L.dropLines && j.alive) {
        const top = j.pos.y;
        const a = 0.55 * j.fade;
        this.lines.seg(j.pos.x, top, j.pos.z, j.pos.x, 0, j.pos.z, col.r, col.g, col.b, a, col.r, col.g, col.b, a * 0.3, 1.2);
        this.symbols.put(j.pos.x, 0.0005, j.pos.z, Shape.ring, 7, col, 0.55 * j.fade);
      }
      if (L.velocity && j.alive) {
        const k = 30 * UNIT_PER_M;
        const ex = j.pos.x + j.data.vel.x * k, ey = j.pos.y + j.data.vel.y * k, ez = j.pos.z + j.data.vel.z * k;
        this.lines.seg(j.pos.x, j.pos.y, j.pos.z, ex, ey, ez, col.r, col.g, col.b, 0.7, col.r, col.g, col.b, 0.25, 1.2);
        this.symbols.put(ex, ey, ez, Shape.dot, 3, col, 0.5);
      }
      if (this.selected === j.id) {
        this.overlaySymbols.put(j.pos.x, j.pos.y, j.pos.z, Shape.brackets, Math.max(26, j.px + 14), P.symHi, 0.95);
      }
      // Tag
      if (j.tag.visible) {
        j.tag.obj.position.copy(j.pos);
        j.tag.setOpacity(j.alive ? 1 : Math.max(0.25, 1 - (t - (j.diedAt ?? t)) / 6));
        if (labelTick) this.writeJetTag(j);
      }
    }

    // --- missiles
    const seekersOn = L.seekers;
    for (const v of this.missiles.values()) {
      const m = v.data;
      const vis = v.alive && !v.hidden;
      v.mesh.visible = vis;
      v.trail.meshes[0].visible = L.smoke && !v.hidden;
      v.trail.meshes[1].visible = L.trails && !v.hidden;
      v.tag.visible = L.missileLabels && !v.hidden && (v.alive || t - (v.deadAt ?? t) < 3);
      const col = sideColor(P, v.side);
      if (vis) {
        const dist = camPos.distanceTo(v.pos);
        const ppu = stage.pxPerUnit(dist);
        const len = v.lengthM;
        const s = this.opts.sizeMode === 'true' ? UNIT_PER_M * this.opts.trueScale : boostedScale(ppu, NOMINAL_MISSILE_M, this.opts.minMissilePx, this.opts.trueScale);
        v.scale = s;
        v.px = len * s * ppu;
        v.mesh.position.copy(v.pos);
        // When boosted, fatten the slender body a little so it still reads as a missile.
        const fat = Math.min(2.2, Math.sqrt(s / (UNIT_PER_M * this.opts.trueScale)));
        v.mesh.scale.set(s * fat, s * fat, s);
        if (v.px < 40) {
          this.symbols.put(v.pos.x, v.pos.y, v.pos.z, Shape.dot, 5, col, 0.9);
          this.glow.put(v.pos.x, v.pos.y, v.pos.z, Shape.glow, 9, P.missile, 0.55);
        }
        if (v.burning && L.effects) {
          // Motor plume at the tail.
          _v.set(0, 0, len * 0.55 * s).applyQuaternion(v.mesh.quaternion).add(v.pos);
          const fl = 0.85 + 0.15 * Math.sin(stage.elapsed * 40 + v.pos.x * 50);
          _c.copy(P.caution).lerp(P.missile, 0.45);
          this.glow.put(_v.x, _v.y, _v.z, Shape.glow, 9 * fl, _c, 0.95, len * 1.4 * s);
          this.glow.put(_v.x, _v.y, _v.z, Shape.glow, 20 * fl, P.caution, 0.35, len * 3 * s);
        }
        // Guidance relations.
        const shooter = this.jets.get(m.shooterId);
        const target = m.targetId ? this.jets.get(m.targetId) : undefined;
        if (m.guidance === 'datalink' && L.datalink && shooter && shooter.alive) {
          const d = P.datalink;
          this.lines.seg(shooter.pos.x, shooter.pos.y, shooter.pos.z, v.pos.x, v.pos.y, v.pos.z, d.r, d.g, d.b, 0.85, d.r, d.g, d.b, 0.85, 1.5, 11, 36, 0.5);
        }
        if (m.guidance === 'sarh' && L.illumination && shooter && shooter.alive && target) {
          const c = sideColor(P, shooter.side);
          this.lines.seg(shooter.pos.x, shooter.pos.y, shooter.pos.z, target.pos.x, target.pos.y, target.pos.z, c.r, c.g, c.b, 0.8, c.r, c.g, c.b, 0.8, 1.7, 16, 70, 0.72);
          this.lines.seg(v.pos.x, v.pos.y, v.pos.z, target.pos.x, target.pos.y, target.pos.z, c.r, c.g, c.b, 0.35, c.r, c.g, c.b, 0.35, 1.1, 5, 0, 0.45);
        }
      } else {
        v.px = 0;
      }
      // Seeker cone.
      let cone = this.cones.get(v.id);
      const wantCone = seekersOn && vis && m.guidance === 'active';
      if (wantCone) {
        const spec = MISSILES[v.type];
        const half = ((spec.seekerGimbalDeg ?? 30) * Math.PI) / 180;
        // Seeker field out to the seeker range, trimmed to just past what it is looking at.
        let lenU = spec.seekerRangeKm ?? 15;
        const look = this.jets.get(m.seekerOn ?? m.targetId ?? '');
        if (look) lenU = Math.min(lenU, Math.max(2, look.pos.distanceTo(v.pos) * 1.25));
        if (!cone) {
          cone = new Mesh(this.coneGeo, this.coneMaterial(v.side));
          cone.renderOrder = ORDER.cones;
          cone.frustumCulled = false;
          this.group.add(cone);
          this.cones.set(v.id, cone);
        }
        cone.visible = true;
        cone.position.copy(v.pos);
        cone.quaternion.copy(v.mesh.quaternion);
        const r = Math.tan(Math.min(half, 1.3)) * lenU;
        cone.scale.set(r, r, lenU);
        // Crisp edge rays.
        for (let k = 0; k < 4; k++) {
          const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
          _v.set(Math.cos(ang) * r, Math.sin(ang) * r, -lenU).applyQuaternion(cone.quaternion).add(v.pos);
          this.lines.seg(v.pos.x, v.pos.y, v.pos.z, _v.x, _v.y, _v.z, col.r, col.g, col.b, 0.45, col.r, col.g, col.b, 0, 1.1);
        }
        this.glow.put(v.pos.x, v.pos.y, v.pos.z, Shape.glow, 16, col, 0.45);
      } else if (cone) {
        cone.visible = false;
      }
      if (v.tag.visible) {
        v.tag.obj.position.copy(v.pos);
        if (labelTick) this.writeMissileTag(v);
      }
    }

    // --- countermeasures & explosions
    this.drawCountermeasures();
    if (L.effects) this.drawBlasts(t);

    // --- SAM sites (ring, band, vehicle, tag)
    if (this.samLayer.size) {
      this.samLayer.draw({
        lines: this.lines, symbols: this.symbols, palette: P, units: this.units, rings: L.samRings, labels: L.labels,
        illumination: L.illumination, minPx: 18, labelTick,
        jetPos: id => { const j = this.jets.get(id); return j && j.alive && this.jetVisible(j) ? j.pos : undefined; },
        showSide: side => L.truth || !this.observerSide || side === this.observerSide,
      });
    }

    this.drawExtra();
    this.declutter();

    this.lines.commit(); this.symbols.commit(); this.glow.commit(); this.overlaySymbols.commit();
  }

  /** Position every frame so camera motion cannot reintroduce overlaps between text updates. */
  private declutter(): void {
    const cam = this.stage.camera, W = this.stage.width, H = this.stage.height;
    cam.updateMatrixWorld();
    const labels: { label: DeclutterLabel; x: number; y: number }[] = [];
    const boxes: LabelCandidate[] = [];
    const hidden: DeclutterLabel[] = [];
    const add = (label: DeclutterLabel, priority: number, ox = 0, oy = 0, maxMove?: number) => {
      if (!label.visible || !label.obj.parent) { hidden.push(label); return; }
      label.obj.updateWorldMatrix(true, false);
      _v.setFromMatrixPosition(label.obj.matrixWorld).project(cam);
      if (!Number.isFinite(_v.x) || _v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) { hidden.push(label); return; }
      const b = label.bounds();
      labels.push({ label, x: ox, y: oy });
      boxes.push({ ...b, left: (_v.x * 0.5 + 0.5) * W + b.left + ox,
        top: (-_v.y * 0.5 + 0.5) * H + b.top + oy, priority, maxMove, prev: this.lastPlacement.get(label) });
    };
    for (const j of this.jets.values()) add(j.tag, j.id === this.selected ? LabelPriority.selected : LabelPriority.aircraft, Math.max(0, Math.min(40, j.px * 0.42 - 8)));
    for (const m of this.missiles.values()) add(m.tag, LabelPriority.missile);
    for (const [label, options] of this.pageLabels.entries()) {
      add(label, options.priority ?? LabelPriority.annotation, options.offset?.x ?? 0, options.offset?.y ?? 0, options.maxMove);
    }
    const positions = layoutLabels(boxes, W, H);
    // Finish every DOM measurement before writing placement/visibility.
    for (const label of hidden) { label.setLayoutVisible(false); this.lastPlacement.delete(label); }
    for (let i = 0; i < labels.length; i++) {
      const { label, x, y } = labels[i], p = positions[i];
      label.place(x + p.x, y + p.y);
      label.setLayoutVisible(p.visible);
      if (p.visible) this.lastPlacement.set(label, { x: p.x, y: p.y }); else this.lastPlacement.delete(label);
    }
  }

  /** Subclasses return the current countermeasures (live world) or [] (replay). */
  protected countermeasures(): Iterable<CountermeasureLike> { return []; }

  private drawCountermeasures(): void {
    if (!this.layers.countermeasures) return;
    const P = this.palette, t = this.time;
    for (const c of this.countermeasures()) {
      const age = t - c.t0;
      if (age < 0 || age > c.life) continue;
      const k = age / c.life;
      const x = c.pos.x * UNIT_PER_M, y = c.pos.y * UNIT_PER_M, z = c.pos.z * UNIT_PER_M;
      const seed = (c.id.charCodeAt(c.id.length - 1) % 17) / 17;
      if (c.kind === 'chaff') {
        // A bundle blooms into a cloud a few tens of metres across, with a metallic glint.
        const a = 0.6 * Math.pow(1 - k, 1.4) * Math.min(1, age * 4);
        this.symbols.put(x, y, z, Shape.puff, 4 + 9 * Math.sqrt(k), P.smoke, a, 0.006 + 0.04 * Math.sqrt(k), seed);
        this.glow.put(x, y, z, Shape.glow, 4, P.missile, 0.45 * (1 - k) * (0.6 + 0.4 * Math.sin(age * 30 + seed * 9)));
      } else {
        const a = Math.pow(1 - k, 0.7);
        this.glow.put(x, y, z, Shape.glow, 7, P.missile, a, 0.004);
        this.glow.put(x, y, z, Shape.glow, 18, P.caution, 0.55 * a, 0.02);
        // Short smoke streak behind the flare.
        for (let i = 1; i <= 3; i++) {
          const b = i * 0.35;
          this.symbols.put(x - c.vel.x * b * UNIT_PER_M, y - c.vel.y * b * UNIT_PER_M + 0.004 * i, z - c.vel.z * b * UNIT_PER_M,
            Shape.puff, 3 + i * 2, P.smoke, 0.35 * a / i, 0.004 * i, seed + i);
        }
      }
    }
  }

  private drawBlasts(t: number): void {
    const P = this.palette;
    for (const b of this.blasts) {
      const age = t - b.t0;
      if (age < 0 || age > 10) continue;
      const big = b.big ? 1 : 0.6;
      if (age < 0.5) {
        const k = age / 0.5;
        this.glow.put(b.x, b.y, b.z, Shape.glow, (110 - 60 * k) * big, P.missile, 1 - k, 0.25 * big);
      }
      if (age < 1.8) {
        const k = age / 1.8;
        _c.copy(P.caution).lerp(P.warning, k);
        this.glow.put(b.x, b.y, b.z, Shape.glow, (46 + 26 * k) * big, _c, 0.95 * (1 - k), (0.1 + 0.15 * k) * big);
      }
      if (age > 0.2) {
        const k = Math.min(1, (age - 0.2) / 9.8);
        const rise = age * 0.004;
        const a = 0.75 * (1 - k) * Math.min(1, (age - 0.2) * 3);
        this.symbols.put(b.x, b.y + rise, b.z, Shape.puff, (18 + 30 * Math.sqrt(k)) * big, P.soot, a, (0.09 + 0.3 * Math.sqrt(k)) * big, b.seed);
        this.symbols.put(b.x + 0.02 * big, b.y + rise * 1.3, b.z, Shape.puff, (12 + 22 * Math.sqrt(k)) * big, P.soot, a * 0.8, (0.06 + 0.22 * Math.sqrt(k)) * big, b.seed + 0.37);
      }
    }
  }

  private coneMaterial(side: Side): ShaderMaterial {
    let m = this.coneMats.get(side);
    if (!m) {
      m = new ShaderMaterial({
        uniforms: { uColor: { value: sideColor(this.palette, side).clone() }, uAlpha: { value: 0.12 } },
        vertexShader: coneVert, fragmentShader: coneFrag,
        transparent: true, depthWrite: false, side: DoubleSide, toneMapped: false,
      });
      this.coneMats.set(side, m);
    }
    return m;
  }

  private writeJetTag(j: JetVis): void {
    const a = j.data;
    if (!j.alive) { j.tag.set(a.callsign, '', 'SPLASH', ''); j.tag.setTone(null); return; }
    const u = this.units;
    const spd = a.vel.length();
    if (this.opts.label) {
      const r = this.opts.label(a, u);
      j.tag.set(r.title, r.type ?? '', r.sub, r.flag ?? j.flag);
      j.tag.setTone(r.tone ?? null);
      return;
    }
    j.tag.set(a.callsign, AIRCRAFT[a.type]?.short ?? a.type, fmtAltShort(a.pos.y, u) + ' · ' + fmtSpeed(spd, u), j.flag);
  }

  private writeMissileTag(v: MslVis): void {
    const m = v.data;
    const name = m.display?.name ?? MISSILES[v.type]?.name ?? v.type;
    let sub: string;
    if (!v.alive) sub = m.result?.kind === 'hit' ? 'HIT' : 'MISS' + (m.result?.reason ? ' · ' + m.result.reason.toUpperCase() : '');
    else sub = m.display ? (m.guidance === 'ballistic' ? 'BALLISTIC' : m.display.guidedText) : guidanceText(m);
    v.tag.set(name, '', sub, '');
    v.tag.setDead(!v.alive);
  }

  /** Rewrite every tag on the next frame (after units or time jumps). */
  protected refreshLabels(): void { this.labelClock = -1; }

  /** Set an extra flag on a jet tag (e.g. 'NOTCH'). */
  protected setJetFlag(id: EntityId, flag: string): void {
    const j = this.jets.get(id);
    if (j && j.flag !== flag) { j.flag = flag; this.labelClock = -1; }
  }
  protected jetVis(id: EntityId): JetVis | undefined { return this.jets.get(id); }
  protected missileVis(id: EntityId): MslVis | undefined { return this.missiles.get(id); }
}

export function guidanceText(m: Pick<MissileLike, 'guidance' | 'timeToActive'>): string {
  const tta = m.timeToActive !== null && m.timeToActive > 0 ? ' · ACT ' + Math.ceil(m.timeToActive) + 's' : '';
  switch (m.guidance) {
    case 'datalink': return 'DL' + tta;
    case 'inertial': return 'INERTIAL' + tta;
    case 'active': return 'ACTIVE';
    case 'sarh': return 'SARH';
    case 'ir': return 'IR';
    default: return 'BALLISTIC';
  }
}
