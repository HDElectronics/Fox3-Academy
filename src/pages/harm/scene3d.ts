/**
 * [OWNER: page-harm] The HARM page's 3D view. Draws a SceneView (types.ts): the F/A-18C, the SAM sites and their
 * vehicles, HARMs with trails, and blasts, at scene scale 1 unit = 1 km with the app's pixel floors (boostedScale) so
 * a jet 20 nm from a site stays visible. Each transmitting radar wears its own pulsing translucent dome, centred on
 * the vehicle, so a dead or silent radar loses its dome while the others keep theirs; a site whose tracking
 * radar has locked the jet draws a flowing warning line to it. A HARM that lost guidance is drawn grey with a dim
 * trail; dead vehicles turn to soot. Camera: chase the jet, follow the newest HARM toward its target, look from the
 * first site toward the jet, or a top-down overview. Game view only (rule 1): no seeker or radar internals.
 */
import { Group, Mesh, MeshBasicMaterial, AdditiveBlending, DoubleSide, Quaternion, SphereGeometry, Vector3 } from 'three';
import {
  CameraRig, FramePriority, JetMesh, LineBatch, boostedScale, orientationQuaternion, UNIT_PER_M, type EntitySource, type Stage,
} from '../../render';
import {
  HARM_LENGTH_M, VEHICLE_SIZE, animateVehicle, buildHarm, buildVehicle, disposeVehicle, setHarmLost, setVehicleWreck,
} from './models';
import type { SceneView, VehicleId } from './types';

export type HarmCameraMode = 'chase' | 'harm' | 'site' | 'top';

export interface HarmSceneOptions {
  /** Pixel floor for the jet (CSS px). Default 22. */
  jetMinPx?: number;
  /** Pixel floor for each vehicle. Default 12. */
  vehicleMinPx?: number;
  /** Pixel floor for a HARM. Default 12. */
  harmMinPx?: number;
  /** Drag / zoom on the canvas. Default true. */
  interactive?: boolean;
  /** Initial camera. Default 'chase'. */
  camera?: HarmCameraMode;
}

type Site = SceneView['sites'][number];
type Harm = SceneView['harms'][number];

interface VehVis { id: VehicleId; group: Group; pos: Vector3; dome: Mesh<SphereGeometry, MeshBasicMaterial>; pulse: Mesh<SphereGeometry, MeshBasicMaterial> }
interface SiteVis {
  id: string;
  data: Site;
  vehicles: VehVis[];
  /** Largest vehicle display scale (units per metre), for the camera. */
  scale: number;
  seen: number;
}
interface HarmVis {
  id: string;
  data: Harm;
  group: Group;
  /** Trail samples, render units. */
  pts: Vector3[];
  lastSample: number;
  diedAt: number | null;
  order: number;
  seen: number;
}
interface BlastVis { flash: Mesh<SphereGeometry, MeshBasicMaterial>; smoke: Mesh<SphereGeometry, MeshBasicMaterial> }

/** Radars that lock on (the site's lock line starts here); search radars and launchers do not. */
const TRACKERS: ReadonlySet<VehicleId> = new Set<VehicleId>(['sa6-str', 'sa8', 'sa11-telar', 'sa15', 'sa10-tr']);
const TRAIL_DT = 0.2;
const TRAIL_MAX = 900;
const TRAIL_FADE_S = 8;
const PULSE_S = 1.8;
const SITE_EYE_M = 170;
const SITE_EYE_UP_M = 30;

const _v = new Vector3();
const _w = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _q = new Quaternion();

/** Heading (rad, clockwise from north) and pitch of a velocity. */
function velAngles(v: { x: number; y: number; z: number }): [number, number] {
  return [Math.atan2(v.x, -v.z), Math.atan2(v.y, Math.hypot(v.x, v.z))];
}

export class HarmScene implements EntitySource {
  readonly rig: CameraRig;
  private readonly root = new Group();
  private readonly lines: LineBatch;
  private readonly jet: JetMesh;
  private readonly sites = new Map<string, SiteVis>();
  private readonly harms = new Map<string, HarmVis>();
  private readonly blasts: BlastVis[] = [];
  private readonly domeGeo = new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  private readonly ballGeo = new SphereGeometry(1, 14, 10);
  private view: SceneView | null = null;
  private frame = 0;
  private harmOrder = 0;
  private mode: HarmCameraMode;
  private pendingTop = false;
  private readonly off: () => void;
  private readonly jetMinPx: number;
  private readonly vehMinPx: number;
  private readonly harmMinPx: number;
  private disposed = false;
  private readonly jetU = new Vector3();

  constructor(private readonly stage: Stage, opts: HarmSceneOptions = {}) {
    this.jetMinPx = opts.jetMinPx ?? 22;
    this.vehMinPx = opts.vehicleMinPx ?? 12;
    this.harmMinPx = opts.harmMinPx ?? 12;
    this.root.name = 'harm-scene';
    stage.scene.add(this.root);
    this.lines = new LineBatch(stage.shared, { capacity: 512 });
    this.root.add(this.lines);
    this.jet = new JetMesh('fa18c', 'blue', stage.palette, { onReady: () => stage.requestRender() });
    this.jet.visible = false;
    this.root.add(this.jet);
    this.rig = new CameraRig(stage, { source: this, interactive: opts.interactive ?? true, view: { headingDeg: 20, elevationDeg: 18, distance: 40000 } });
    this.mode = opts.camera ?? 'chase';
    this.setCamera(this.mode);
    this.off = stage.onFrame(() => this.draw(), { priority: FramePriority.late, always: true });
  }

  // ---------------------------------------------------------------- page API

  /** Take a new snapshot: create and drop meshes by id, sample trails. Drawing happens on the Stage frame. */
  update(v: SceneView): void {
    if (this.disposed) return;
    const first = this.view === null;
    this.view = v;
    const f = ++this.frame;
    for (const s of v.sites) {
      let sv = this.sites.get(s.id);
      if (!sv) sv = this.createSite(s);
      sv.data = s; sv.seen = f;
      this.syncVehicles(sv);
    }
    for (const sv of [...this.sites.values()]) if (sv.seen !== f) this.disposeSite(sv);
    for (const h of v.harms) {
      let hv = this.harms.get(h.id);
      if (!hv) hv = this.createHarm(h);
      hv.data = h; hv.seen = f;
      if (h.alive) {
        if (!hv.pts.length || v.t - hv.lastSample >= TRAIL_DT || v.t < hv.lastSample) {
          hv.pts.push(new Vector3(h.pos.x, h.pos.y, h.pos.z).multiplyScalar(UNIT_PER_M));
          if (hv.pts.length > TRAIL_MAX) hv.pts.shift();
          hv.lastSample = v.t;
        }
        hv.diedAt = null;
      } else if (hv.diedAt === null) {
        hv.diedAt = v.t;
        hv.pts.push(new Vector3(h.pos.x, h.pos.y, h.pos.z).multiplyScalar(UNIT_PER_M));
      }
    }
    for (const hv of [...this.harms.values()]) if (hv.seen !== f) this.disposeHarm(hv);
    // The camera was set before anything existed to follow: place it again now that the jet and sites are known.
    if (first || this.pendingTop) { this.pendingTop = false; this.setCamera(this.mode); }
    this.stage.requestRender();
  }

  /** Camera: chase the jet, follow the newest live HARM toward its target, from the first site toward the jet, or top-down. */
  setCamera(mode: HarmCameraMode): void {
    if (this.disposed) return;
    this.mode = mode;
    const rig = this.rig;
    if (mode === 'chase') rig.setMode('chase', { focus: 'jet', lookAt: null, distance: 110 });
    else if (mode === 'harm') rig.setMode('chase', { focus: 'harm', lookAt: 'harm-target', distance: 26 });
    // Eye behind the first site (away from the jet), aimed between the site and the jet: drag to look around.
    else if (mode === 'site') rig.setMode('cockpit', { focus: 'site-eye' });
    else {
      if (!this.view) { this.pendingTop = true; rig.setMode('top', { focus: 'center', distance: 60000 }); return; }
      const c = this.center(_v);
      let r = 3000;
      if (this.view.jet) r = Math.max(r, Math.hypot(this.view.jet.pos.x - c.x, this.view.jet.pos.z - c.z));
      for (const s of this.view.sites) for (const veh of s.vehicles) r = Math.max(r, Math.hypot(veh.pos.x - c.x, veh.pos.z - c.z));
      const cam = this.stage.camera;
      const half = Math.min(cam.fov, (2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * cam.aspect) * 180) / Math.PI) / 2;
      rig.setMode('top', { focus: 'center', distance: (r * 1.25) / Math.tan((half * Math.PI) / 180) });
    }
  }

  get cameraMode(): HarmCameraMode { return this.mode; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.off();
    this.rig.dispose();
    for (const sv of [...this.sites.values()]) this.disposeSite(sv);
    for (const hv of [...this.harms.values()]) this.disposeHarm(hv);
    for (const b of this.blasts) { b.flash.material.dispose(); b.smoke.material.dispose(); }
    this.blasts.length = 0;
    this.domeGeo.dispose();
    this.ballGeo.dispose();
    this.jet.dispose();
    this.lines.removeFromParent();
    this.lines.dispose();
    this.root.removeFromParent();
  }

  // ---------------------------------------------------------------- EntitySource (sim metres) for the CameraRig

  positionOf(id: string, out: Vector3): boolean {
    const v = this.view;
    if (!v) return false;
    switch (id) {
      case 'jet': out.set(v.jet.pos.x, v.jet.pos.y, v.jet.pos.z); return true;
      case 'harm': {
        const h = this.newestHarm();
        if (h) { out.set(h.data.pos.x, h.data.pos.y, h.data.pos.z); return true; }
        out.set(v.jet.pos.x, v.jet.pos.y, v.jet.pos.z); return true;
      }
      case 'harm-target': {
        const s = this.harmTarget();
        return s ? this.siteCentre(s.data, out) : false;
      }
      case 'site': {
        const s = v.sites[0];
        return s ? this.siteCentre(s, out) : false;
      }
      case 'site-eye': return this.siteEye(out, null);
      case 'center': this.center(out); return true;
      default: return false;
    }
  }

  orientationOf(id: string, out: Quaternion): boolean {
    const v = this.view;
    if (!v) return false;
    if (id === 'jet') { orientationQuaternion(v.jet.headingRad, v.jet.pitchRad, 0, out); return true; }
    if (id === 'harm') {
      const h = this.newestHarm();
      if (!h) { orientationQuaternion(v.jet.headingRad, v.jet.pitchRad, 0, out); return true; }
      const [hd, p] = velAngles(h.data.vel);
      orientationQuaternion(hd, p, 0, out);
      return true;
    }
    if (id === 'site-eye') {
      if (!this.siteEye(_v, _w)) return false;
      orientationQuaternion(Math.atan2(_w.x, -_w.z), Math.asin(Math.max(-1, Math.min(1, _w.y))), 0, out);
      return true;
    }
    out.identity();
    return true;
  }

  headingOf(id: string): number | null {
    const v = this.view;
    if (!v) return null;
    if (id === 'jet') return v.jet.headingRad;
    if (id === 'harm') { const h = this.newestHarm(); return h ? velAngles(h.data.vel)[0] : v.jet.headingRad; }
    if (id === 'site' && v.sites[0] && this.siteCentre(v.sites[0], _w)) return Math.atan2(v.jet.pos.x - _w.x, -(v.jet.pos.z - _w.z));
    return 0;
  }

  displayScaleOf(id: string): number {
    if (id === 'jet') return this.jet.scale.x;
    if (id === 'harm') return this.newestHarm()?.group.scale.x ?? this.jet.scale.x;
    if (id === 'site') { const s = this.view?.sites[0]; return (s && this.sites.get(s.id)?.scale) || UNIT_PER_M; }
    return UNIT_PER_M;
  }

  // ---------------------------------------------------------------- internals

  private newestHarm(): HarmVis | null {
    let best: HarmVis | null = null;
    for (const h of this.harms.values()) if (h.data.alive && (!best || h.order > best.order)) best = h;
    return best;
  }

  /** The site the newest HARM is pointing at: smallest angle between its velocity and the line to the site. */
  private harmTarget(): SiteVis | null {
    const h = this.newestHarm();
    const v = this.view;
    if (!v || !v.sites.length) return null;
    if (!h) return this.sites.get(v.sites[0].id) ?? null;
    const sp = Math.hypot(h.data.vel.x, h.data.vel.y, h.data.vel.z) || 1;
    let best: SiteVis | null = null, bestCos = -2;
    for (const s of v.sites) {
      if (!this.siteCentre(s, _w)) continue;
      _w.sub(_v.set(h.data.pos.x, h.data.pos.y, h.data.pos.z));
      const d = _w.length() || 1;
      const c = (_w.x * h.data.vel.x + _w.y * h.data.vel.y + _w.z * h.data.vel.z) / (d * sp);
      if (c > bestCos) { bestCos = c; best = this.sites.get(s.id) ?? null; }
    }
    return best;
  }

  /**
   * Site camera: an eye SITE_EYE_M behind the first site (on the far side from the jet) and SITE_EYE_UP_M up; `dir`
   * gets the look direction, between the site and the jet so both stay in frame. Metres.
   */
  private siteEye(out: Vector3, dir: Vector3 | null): boolean {
    const v = this.view;
    const s = v?.sites[0];
    if (!v || !s || !this.siteCentre(s, _c)) return false;
    let hx = _c.x - v.jet.pos.x, hz = _c.z - v.jet.pos.z;
    const hl = Math.hypot(hx, hz);
    if (hl < 1) { hx = 0; hz = 1; } else { hx /= hl; hz /= hl; }
    out.set(_c.x + hx * SITE_EYE_M, _c.y + SITE_EYE_UP_M, _c.z + hz * SITE_EYE_M);
    if (dir) {
      _d.set(_c.x, _c.y + 4, _c.z).sub(out).normalize().multiplyScalar(0.45);
      dir.set(v.jet.pos.x, v.jet.pos.y, v.jet.pos.z).sub(out).normalize().multiplyScalar(0.55).add(_d).normalize();
    }
    return true;
  }

  /** Mean vehicle position of a site (metres). */
  private siteCentre(s: Site, out: Vector3): boolean {
    if (!s.vehicles.length) return false;
    out.set(0, 0, 0);
    for (const veh of s.vehicles) { out.x += veh.pos.x; out.y += veh.pos.y; out.z += veh.pos.z; }
    out.divideScalar(s.vehicles.length);
    return true;
  }

  /** Middle of the jet and every site, on the ground (metres). */
  private center(out: Vector3): Vector3 {
    const v = this.view;
    if (!v) return out.set(0, 0, 0);
    let x0 = v.jet.pos.x, x1 = x0, z0 = v.jet.pos.z, z1 = z0;
    for (const s of v.sites) for (const veh of s.vehicles) {
      x0 = Math.min(x0, veh.pos.x); x1 = Math.max(x1, veh.pos.x);
      z0 = Math.min(z0, veh.pos.z); z1 = Math.max(z1, veh.pos.z);
    }
    return out.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  }

  private createSite(s: Site): SiteVis {
    const sv: SiteVis = { id: s.id, data: s, vehicles: [], scale: UNIT_PER_M, seen: 0 };
    this.sites.set(s.id, sv);
    return sv;
  }

  private syncVehicles(sv: SiteVis): void {
    const list = sv.data.vehicles;
    for (let i = 0; i < list.length; i++) {
      const cur = sv.vehicles[i];
      if (cur && cur.id === list[i].id) continue;
      if (cur) this.disposeVeh(cur);
      const group = buildVehicle(list[i].id, this.stage.palette, { onReady: () => this.stage.requestRender() });
      const mat = (o: number) => new MeshBasicMaterial({
        color: this.stage.palette.caution.clone(), transparent: true, opacity: o, depthWrite: false, side: DoubleSide, toneMapped: false,
      });
      const dome = new Mesh(this.domeGeo, mat(0.08));
      const pulse = new Mesh(this.domeGeo, mat(0.2));
      dome.name = 'emission'; pulse.name = 'emission-pulse';
      dome.visible = pulse.visible = false;
      this.root.add(group, dome, pulse);
      sv.vehicles[i] = { id: list[i].id, group, pos: new Vector3(), dome, pulse };
    }
    while (sv.vehicles.length > list.length) { const gone = sv.vehicles.pop(); if (gone) this.disposeVeh(gone); }
  }

  private disposeVeh(veh: VehVis): void {
    disposeVehicle(veh.group);
    veh.dome.removeFromParent(); veh.pulse.removeFromParent();
    veh.dome.material.dispose(); veh.pulse.material.dispose();
  }

  private disposeSite(sv: SiteVis): void {
    for (const veh of sv.vehicles) this.disposeVeh(veh);
    sv.vehicles.length = 0;
    this.sites.delete(sv.id);
  }

  private createHarm(h: Harm): HarmVis {
    const group = buildHarm(this.stage.palette);
    this.root.add(group);
    const hv: HarmVis = { id: h.id, data: h, group, pts: [], lastSample: -1e9, diedAt: null, order: ++this.harmOrder, seen: 0 };
    this.harms.set(h.id, hv);
    return hv;
  }

  private disposeHarm(hv: HarmVis): void {
    disposeVehicle(hv.group);
    this.harms.delete(hv.id);
  }

  private ppuAt(p: Vector3): number {
    return this.stage.pxPerUnit(this.stage.camera.position.distanceTo(p));
  }

  /** Per frame, after the camera: placement, pixel floors, emission, trails and blasts. */
  private draw(): void {
    const v = this.view;
    if (!v || this.disposed) return;
    const P = this.stage.palette;
    const lines = this.lines;
    lines.reset();
    // A collapsed viewport (hidden tab) has no pixels to keep: true size, so the chase camera cannot run away.
    const px = this.stage.height < 120 ? 0 : 1;

    // Jet
    const jet = this.jet;
    const jp = _v.set(v.jet.pos.x, v.jet.pos.y, v.jet.pos.z).multiplyScalar(UNIT_PER_M);
    jet.visible = v.jet.alive;
    jet.position.copy(jp);
    orientationQuaternion(v.jet.headingRad, v.jet.pitchRad, 0, jet.quaternion);
    jet.scale.setScalar(boostedScale(this.ppuAt(jp), jet.lengthM, this.jetMinPx * px));
    const jetU = this.jetU.copy(jp);

    // Sites
    for (const sv of this.sites.values()) {
      const s = sv.data;
      let maxSc = UNIT_PER_M, tracker: VehVis | null = null, trackerH = 0;
      const k = (v.t / PULSE_S) % 1;
      s.vehicles.forEach((d, i) => {
        const veh = sv.vehicles[i];
        if (!veh) return;
        veh.pos.set(d.pos.x, d.pos.y, d.pos.z).multiplyScalar(UNIT_PER_M);
        const [L, , H] = VEHICLE_SIZE[d.id];
        const sc = boostedScale(this.ppuAt(veh.pos), L, this.vehMinPx * px);
        maxSc = Math.max(maxSc, sc);
        veh.group.position.copy(veh.pos);
        veh.group.rotation.y = -d.headingRad;
        veh.group.scale.setScalar(sc);
        setVehicleWreck(veh.group, !d.alive);
        // One dome per transmitting radar, centred on it: about twice the model's length, never under 14 px.
        const on = s.emitting && d.alive && d.emitter;
        veh.dome.visible = veh.pulse.visible = on;
        if (!on) return;
        animateVehicle(veh.group, v.t + i * 0.7);
        if (!tracker || (TRACKERS.has(d.id) && !TRACKERS.has(tracker.id))) { tracker = veh; trackerH = H * sc; }
        const r = Math.max(L * sc * 1.1, 14 / this.ppuAt(veh.pos));
        veh.dome.position.copy(veh.pos);
        veh.dome.scale.set(r, r * 0.6, r);
        veh.pulse.position.copy(veh.pos);
        veh.pulse.scale.set(r * k, r * 0.6 * k, r * k);
        veh.pulse.material.opacity = 0.22 * (1 - k);
        veh.dome.material.color.copy(s.lockedJet && TRACKERS.has(d.id) ? P.warning : P.caution);
        veh.pulse.material.color.copy(veh.dome.material.color);
      });
      sv.scale = maxSc;
      const tr = tracker as VehVis | null;
      if (s.lockedJet && tr && v.jet.alive) {
        const k = P.warning;
        lines.seg(tr.pos.x, tr.pos.y + trackerH, tr.pos.z, jetU.x, jetU.y, jetU.z, k.r, k.g, k.b, 0.9, k.r, k.g, k.b, 0.75, 2.2, 16, 50, 0.65);
      }
    }

    // HARMs and trails
    for (const hv of this.harms.values()) {
      const h = hv.data;
      const g = hv.group;
      const hp = _w.set(h.pos.x, h.pos.y, h.pos.z).multiplyScalar(UNIT_PER_M);
      g.visible = h.alive;
      if (h.alive) {
        g.position.copy(hp);
        const [hd, p] = velAngles(h.vel);
        orientationQuaternion(hd, p, 0, g.quaternion);
        g.scale.setScalar(boostedScale(this.ppuAt(hp), HARM_LENGTH_M, this.harmMinPx * px));
      }
      setHarmLost(g, h.lost);
      const fade = hv.diedAt === null ? 1 : Math.max(0, 1 - (v.t - hv.diedAt) / TRAIL_FADE_S);
      if (fade <= 0 || hv.pts.length === 0) continue;
      const col = h.lost ? P.symDim : P.smoke;
      const a0 = (h.lost ? 0.3 : 0.65) * fade;
      const pts = hv.pts;
      const n = pts.length;
      for (let i = 0; i + 1 < n; i++) {
        const A = pts[i], B = pts[i + 1];
        const ka = a0 * (0.25 + 0.75 * (i / n)), kb = a0 * (0.25 + 0.75 * ((i + 1) / n));
        lines.seg(A.x, A.y, A.z, B.x, B.y, B.z, col.r, col.g, col.b, ka, col.r, col.g, col.b, kb, 2, h.lost ? 7 : 0, 0, 0.6);
      }
      if (h.alive) {
        const A = pts[n - 1];
        lines.seg(A.x, A.y, A.z, hp.x, hp.y, hp.z, col.r, col.g, col.b, a0, col.r, col.g, col.b, a0, 2, h.lost ? 7 : 0, 0, 0.6);
      }
    }
    lines.commit();

    // Blasts: a short flash, then a smoke puff that grows, rises and fades.
    for (let i = 0; i < v.blasts.length; i++) {
      const b = this.blasts[i] ?? this.createBlast();
      const { pos, age } = v.blasts[i];
      const bp = _w.set(pos.x, pos.y, pos.z).multiplyScalar(UNIT_PER_M);
      const ppu = this.ppuAt(bp);
      const fk = age / 0.6;
      b.flash.visible = fk >= 0 && fk < 1;
      if (b.flash.visible) {
        const rm = 25 * (0.35 + fk);
        b.flash.position.copy(bp);
        b.flash.scale.setScalar(Math.max(rm * UNIT_PER_M, (9 * (0.35 + fk)) / ppu));
        b.flash.material.opacity = 0.95 * (1 - fk);
      }
      const sk = age / 8;
      b.smoke.visible = sk >= 0 && sk < 1;
      if (b.smoke.visible) {
        const rm = 16 + age * 9;
        b.smoke.position.set(bp.x, bp.y + age * 4 * UNIT_PER_M, bp.z);
        b.smoke.scale.setScalar(Math.max(rm * UNIT_PER_M, (8 * rm) / 16 / ppu));
        b.smoke.material.opacity = 0.5 * (1 - sk) * Math.min(1, age / 0.25);
      }
    }
    for (let i = v.blasts.length; i < this.blasts.length; i++) { this.blasts[i].flash.visible = false; this.blasts[i].smoke.visible = false; }
  }

  private createBlast(): BlastVis {
    const P = this.stage.palette;
    const flash = new Mesh(this.ballGeo, new MeshBasicMaterial({
      color: P.sun.clone().lerp(P.caution, 0.4), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
    }));
    const smoke = new Mesh(this.ballGeo, new MeshBasicMaterial({
      color: P.smoke.clone().lerp(P.soot, 0.45), transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    }));
    flash.name = 'blast-flash'; smoke.name = 'blast-smoke';
    this.root.add(flash, smoke);
    const b = { flash, smoke };
    this.blasts.push(b);
    return b;
  }
}
