/**
 * CameraRig: tactical orbit around a focus (default), chase behind/above a jet (optionally padlocking a
 * threat), top-down plan view (north up), and a cockpit-ish view from a jet looking forward. Mode and
 * focus changes blend smoothly; frame() fits a group of entities and can keep following it.
 * Public positions and distances are sim metres.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { EntityId } from '../sim/types';
import type { Stage } from './stage';
import { FramePriority } from './stage';
import type { EntitySource } from './tactical';
import { headingQuaternion, lerpAngle, M_PER_UNIT, UNIT_PER_M, type XYZ } from './units';

export type CameraMode = 'orbit' | 'chase' | 'top' | 'cockpit';
/** An entity id, or a fixed point in sim metres. */
export type FocusTarget = EntityId | XYZ;

export interface CameraRigOptions {
  source?: EntitySource | null;
  mode?: CameraMode;
  focus?: FocusTarget | null;
  /** Transition time in seconds. Default 0.9. */
  transition?: number;
  /** Initial orbit view: look heading (deg, compass), elevation (deg, camera above focus), distance (m). */
  view?: { headingDeg?: number; elevationDeg?: number; distance?: number };
  /**
   * Attach drag / zoom / wheel controls to the canvas. Default true. `false` leaves the canvas alone
   * (page scroll and the mouse wheel keep working on phones: landing-page heroes); the camera is then
   * driven only by the page (setView, frame, focusOn) and `autoOrbit`. Change later with setInteractive().
   */
  interactive?: boolean;
  /** Slowly orbit the focus in orbit mode, degrees per second (negative = the other way). Default 0 (off). */
  autoOrbit?: number;
}

export interface ModeOptions {
  focus?: FocusTarget | null;
  /** Chase: keep this entity (a threat) in view, camera behind the jet on the threat line. */
  lookAt?: EntityId | null;
  /** Distance to the focus in metres (orbit/chase), or height above it (top). */
  distance?: number;
  instant?: boolean;
}

export interface FrameOptions {
  /** Keep following the group's centre (and zoom out as it spreads) until the user zooms. Default true. */
  follow?: boolean;
  /** Margin factor. Default 1.25. */
  padding?: number;
  /** Look heading (deg). Default: keep the current one. */
  headingDeg?: number;
  /** Camera elevation above the group (deg). Default: keep the current one. */
  elevationDeg?: number;
  /** Minimum framing radius (m). Default 3000. */
  minRadius?: number;
  /**
   * 'sphere' (default): fit a bounding sphere against the narrower field of view (safe from any angle).
   * 'viewport': fit the group's actual extent seen from the chosen heading / elevation against both
   * the horizontal and vertical field of view, so a long, flat group fills a wide viewport.
   */
  fit?: 'sphere' | 'viewport';
  instant?: boolean;
}

const _a = new Vector3();
const _b = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _c = new Vector3();
const _e = new Euler(0, 0, 0, 'YXZ');
const _d = new Vector3();
const _r = new Vector3();
const _v = new Vector3();
const _f = new Vector3();
const _m = new Matrix4();
const _origin = new Vector3();

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

export class CameraRig {
  readonly controls: OrbitControls;
  private stage: Stage;
  private source: EntitySource | null;
  private _mode: CameraMode = 'orbit';
  private focusTarget: FocusTarget | null = null;
  private group: FocusTarget[] | null = null;
  private groupAuto = false;
  private groupPad = 1.25;
  private groupMin = 3;
  private groupFit: 'sphere' | 'viewport' = 'sphere';
  private interactive = true;
  /** Smoothed unit direction jet -> padlocked threat (chase + lookAt). */
  private padDir = new Vector3(0, 0, -1);
  private padInit = false;
  private lookAtId: EntityId | null = null;
  private hiddenId: EntityId | null = null;
  private lastFocus = new Vector3();
  private hasLastFocus = false;
  /** Orbit distance (units) to apply when a not-yet-known focus first resolves. */
  private pendingDist: number | null = null;
  private logicalPos = new Vector3();
  private logicalQuat = new Quaternion();
  private from = { pos: new Vector3(), quat: new Quaternion() };
  private tStart = -1;
  private duration: number;
  private chaseOffset = new Vector3(0, 0.02, 0.085);
  private chaseYaw = 0;
  private chaseYawInit = false;
  private topHeight = 80;
  private lookYaw = 0;
  private lookPitch = 0;
  private off: () => void;
  private cleanup: (() => void)[] = [];
  private disposed = false;
  private clock = 0;

  constructor(stage: Stage, opts: CameraRigOptions = {}) {
    this.stage = stage;
    this.source = opts.source ?? null;
    this.duration = opts.transition ?? 0.9;
    this.interactive = opts.interactive ?? true;
    // Without a DOM element OrbitControls attaches no listeners (no touch-action: none, no wheel capture).
    const c = new OrbitControls(stage.camera, this.interactive ? stage.canvas : null);
    // render.css gives the canvas touch-action: none; a non-interactive view must let the page scroll.
    if (!this.interactive) this.setTouchScroll(true);
    c.enableDamping = true;
    c.dampingFactor = 0.12;
    c.rotateSpeed = 0.55;
    c.zoomSpeed = 1.1;
    c.panSpeed = 0.9;
    c.screenSpacePanning = true;
    c.minDistance = 0.02;
    c.maxDistance = 1500;
    c.maxPolarAngle = Math.PI * 0.93;
    this.controls = c;
    this.setAutoOrbit(opts.autoOrbit ?? 0);
    const onStart = () => { this.groupAuto = false; };
    c.addEventListener('start', onStart);
    const onChange = () => this.stage.requestRender();
    c.addEventListener('change', onChange);
    this.cleanup.push(() => { c.removeEventListener('start', onStart); c.removeEventListener('change', onChange); });
    this.installCockpitLook();

    const v = opts.view ?? {};
    this.focusTarget = opts.focus ?? null;
    const fp = this.focusPoint(_a) ? _a.clone() : new Vector3(0, 9, 0);
    this.controls.target.copy(fp);
    this.placeOrbit(fp, v.headingDeg ?? 20, v.elevationDeg ?? 22, (v.distance ?? 30000) * UNIT_PER_M);
    this.logicalPos.copy(stage.camera.position);
    this.logicalQuat.copy(stage.camera.quaternion);
    this.setMode(opts.mode ?? 'orbit', { instant: true });
    this.off = stage.onFrame(dt => this.update(dt), { priority: FramePriority.camera, always: true });
    stage.track(this);
  }

  get mode(): CameraMode { return this._mode; }
  /** The entity being followed, if any. */
  get focusId(): EntityId | null { return typeof this.focusTarget === 'string' ? this.focusTarget : null; }

  setSource(src: EntitySource | null): void { this.source = src; }

  /** Whether the user can drag / zoom the camera (see CameraRigOptions.interactive). */
  get isInteractive(): boolean { return this.interactive; }

  /** Attach or detach the canvas drag / zoom / wheel controls. */
  setInteractive(on: boolean): void {
    if (on === this.interactive || this.disposed) return;
    this.interactive = on;
    if (on) this.controls.connect(this.stage.canvas); // sets touch-action: none
    else { this.controls.disconnect(); this.setTouchScroll(true); }
  }

  private setTouchScroll(on: boolean): void {
    const st = (this.stage.canvas as HTMLCanvasElement | null)?.style;
    if (st) st.touchAction = on ? 'auto' : '';
  }

  /** Orbit the focus slowly in orbit mode, degrees per second (0 = off). Stops while the user drags. */
  setAutoOrbit(degPerS: number): void {
    const c = this.controls;
    c.autoRotate = degPerS !== 0 && Number.isFinite(degPerS);
    // OrbitControls: angle per second = 2π/60 · speed (rad) → 6 · speed degrees.
    c.autoRotateSpeed = c.autoRotate ? degPerS / 6 : 0;
    if (c.autoRotate) this.stage.requestRender();
  }

  /** Switch mode with a smooth transition (unless instant). */
  setMode(mode: CameraMode, o: ModeOptions = {}): void {
    this.captureFrom();
    if (o.focus !== undefined) { this.focusTarget = o.focus; this.group = null; }
    if (o.lookAt !== undefined) this.lookAtId = o.lookAt;
    const prev = this._mode;
    this.switchModeRaw(mode);
    // Initial placement for the new mode.
    const fp = this.focusPoint(_a) ? _a : this.controls.target;
    if (mode === 'orbit' && prev !== 'orbit') {
      const d = (o.distance ?? 30000) * UNIT_PER_M;
      this.controls.target.copy(fp);
      this.placeOrbit(fp, this.currentHeadingDeg(), 22, d);
    } else if (mode === 'orbit' && o.distance !== undefined) {
      this.placeOrbit(fp, this.currentHeadingDeg(), this.currentElevationDeg(), o.distance * UNIT_PER_M);
    }
    if (mode === 'chase') {
      const d = (o.distance ?? 88) * UNIT_PER_M;
      this.chaseOffset.set(0, d * 0.24, d);
      this.chaseYawInit = false;
      this.padInit = false;
    }
    if (mode === 'top') {
      this.topHeight = (o.distance ?? 90000) * UNIT_PER_M;
      this.controls.target.copy(fp);
      this.stage.camera.position.set(fp.x, fp.y + this.topHeight, fp.z + 1e-4);
    }
    if (mode === 'cockpit') { this.lookYaw = 0; this.lookPitch = 0; }
    this.beginTransition(o.instant);
  }

  private switchModeRaw(mode: CameraMode): void {
    this._mode = mode;
    this.hasLastFocus = false;
    const c = this.controls;
    c.enableRotate = mode === 'orbit' || mode === 'chase';
    c.enablePan = mode === 'orbit' || mode === 'top';
    c.enableZoom = mode !== 'cockpit';
    c.enabled = mode !== 'cockpit';
    if (mode === 'top') { c.minPolarAngle = 0; c.maxPolarAngle = 0; }
    else { c.minPolarAngle = 0; c.maxPolarAngle = Math.PI * 0.93; }
    this.setHidden(mode === 'cockpit' ? this.focusId : null);
  }

  /** Follow an entity (or look at a fixed point, metres). Keeps the mode. */
  focusOn(target: FocusTarget | null, o: { distance?: number; instant?: boolean } = {}): void {
    this.captureFrom();
    this.focusTarget = target;
    this.group = null;
    this.hasLastFocus = false;
    if (this._mode === 'cockpit') this.setHidden(this.focusId);
    this.pendingDist = null;
    if (this.focusPoint(_a) && (this._mode === 'orbit' || this._mode === 'top')) {
      const cam = this.stage.camera;
      _b.copy(cam.position).sub(this.controls.target);
      if (o.distance !== undefined) _b.setLength(o.distance * UNIT_PER_M);
      this.controls.target.copy(_a);
      cam.position.copy(_a).add(_b);
    } else if (o.distance !== undefined) {
      this.pendingDist = o.distance * UNIT_PER_M;
    }
    this.beginTransition(o.instant);
  }

  /** Fit a group of entities/points in view (orbit mode). With follow, keeps tracking the group. */
  frame(targets: FocusTarget[], o: FrameOptions = {}): void {
    if (!targets.length) return;
    this.captureFrom();
    if (this._mode !== 'orbit') this.switchModeRaw('orbit');
    this.group = targets.slice();
    this.groupAuto = o.follow ?? true;
    this.groupPad = o.padding ?? 1.25;
    this.groupMin = (o.minRadius ?? 3000) * UNIT_PER_M;
    this.groupFit = o.fit ?? 'sphere';
    this.focusTarget = null;
    this.hasLastFocus = false;
    const heading = o.headingDeg ?? this.currentHeadingDeg();
    const elev = o.elevationDeg ?? this.currentElevationDeg();
    orbitBasis(heading, elev, _f, _r, _v);
    const fit = this.fitGroup(_a, _f, _r, _v);
    if (!fit) return;
    this.controls.target.copy(_a);
    this.placeOrbit(_a, heading, elev, fit);
    if (!(o.follow ?? true)) this.group = null;
    this.beginTransition(o.instant);
  }

  /** Set the orbit view: look heading (deg, compass), elevation (deg), distance (m). */
  setView(v: { headingDeg?: number; elevationDeg?: number; distance?: number }, instant = false): void {
    this.captureFrom();
    const t = this.controls.target;
    const d = v.distance !== undefined ? v.distance * UNIT_PER_M : this.stage.camera.position.distanceTo(t);
    this.placeOrbit(t, v.headingDeg ?? this.currentHeadingDeg(), v.elevationDeg ?? this.currentElevationDeg(), d);
    this.groupAuto = false;
    this.beginTransition(instant);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.off();
    this.setHidden(null);
    for (const c of this.cleanup) c();
    // OrbitControls.dispose() disconnects, which needs a DOM element: skip it when never connected.
    if (this.controls.domElement) this.controls.dispose();
    this.setTouchScroll(false); // back to the stylesheet's value
    this.stage.untrack(this);
  }

  // ---------------------------------------------------------------- internals

  private setHidden(id: EntityId | null): void {
    if (this.hiddenId && this.hiddenId !== id) this.source?.setHidden?.(this.hiddenId, false);
    this.hiddenId = id;
    if (id) this.source?.setHidden?.(id, true);
  }

  private currentHeadingDeg(): number {
    const cam = this.stage.camera.position, t = this.controls.target;
    const dx = t.x - cam.x, dz = t.z - cam.z;
    if (Math.hypot(dx, dz) < 1e-6) return 0;
    return (Math.atan2(dx, -dz) * 180) / Math.PI;
  }
  private currentElevationDeg(): number {
    const cam = this.stage.camera.position, t = this.controls.target;
    const d = cam.distanceTo(t) || 1;
    return (Math.asin(Math.max(-1, Math.min(1, (cam.y - t.y) / d))) * 180) / Math.PI;
  }

  /** Place the camera around `target` (units) looking along heading, elevated, at distance d (units). */
  private placeOrbit(target: Vector3, headingDeg: number, elevationDeg: number, d: number): void {
    const h = (headingDeg * Math.PI) / 180, e = (elevationDeg * Math.PI) / 180;
    const cam = this.stage.camera;
    cam.position.set(target.x - Math.sin(h) * Math.cos(e) * d, target.y + Math.sin(e) * d, target.z + Math.cos(h) * Math.cos(e) * d);
    if (cam.position.y < 0.03) cam.position.y = 0.03;
    cam.up.copy(_up);
    cam.lookAt(target);
  }

  /** Focus point in units; false when there is nothing to follow. */
  private focusPoint(out: Vector3): boolean {
    const f = this.focusTarget;
    if (f === null) return false;
    if (typeof f === 'string') {
      if (!this.source || !this.source.positionOf(f, out)) return false;
      out.multiplyScalar(UNIT_PER_M);
      return true;
    }
    out.set(f.x, f.y, f.z).multiplyScalar(UNIT_PER_M);
    return true;
  }

  private groupPoint(f: FocusTarget, out: Vector3): boolean {
    if (typeof f === 'string') {
      if (!this.source || !this.source.positionOf(f, out)) return false;
      out.multiplyScalar(UNIT_PER_M);
      return true;
    }
    out.set(f.x, f.y, f.z).multiplyScalar(UNIT_PER_M);
    return true;
  }

  /**
   * Group centre (units) into out; returns the fitting distance (units) or 0. For fit 'viewport' pass the
   * camera basis (forward, right, up); without it the current camera orientation is used.
   */
  private fitGroup(out: Vector3, fwd?: Vector3, right?: Vector3, up?: Vector3): number {
    const g = this.group;
    if (!g) return 0;
    let n = 0;
    out.set(0, 0, 0);
    for (const f of g) if (this.groupPoint(f, _c)) { out.add(_c); n++; }
    if (!n) return 0;
    out.divideScalar(n);
    const cam = this.stage.camera;
    const vf = (cam.fov * Math.PI) / 180;
    const hf = 2 * Math.atan(Math.tan(vf / 2) * cam.aspect);
    const minDist = this.groupMin / Math.sin(Math.min(vf, hf) / 2);
    if (this.groupFit === 'viewport') {
      if (!fwd || !right || !up) {
        fwd = _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
        right = _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
        up = _v.set(0, 1, 0).applyQuaternion(cam.quaternion);
      }
      return fitDistance(g.length, i => (this.groupPoint(g[i], _c) ? _c.sub(out) : null), fwd, right, up,
        Math.tan(hf / 2), Math.tan(vf / 2), this.groupPad, minDist);
    }
    let r = this.groupMin;
    for (const f of g) if (this.groupPoint(f, _c)) r = Math.max(r, _c.distanceTo(out));
    return (r * this.groupPad) / Math.sin(Math.min(vf, hf) / 2);
  }

  /** Remember the on-screen pose, then put the camera back on its logical pose for the state change. */
  private captureFrom(): void {
    const cam = this.stage.camera;
    this.from.pos.copy(cam.position);
    this.from.quat.copy(cam.quaternion);
    if (this.tStart >= 0) { cam.position.copy(this.logicalPos); cam.quaternion.copy(this.logicalQuat); }
  }

  /** The camera now holds the new logical pose; blend to it from the captured on-screen pose. */
  private beginTransition(instant?: boolean): void {
    const cam = this.stage.camera;
    this.logicalPos.copy(cam.position);
    this.logicalQuat.copy(cam.quaternion);
    this.stage.requestRender();
    if (instant || this.duration <= 0) { this.tStart = -1; return; }
    cam.position.copy(this.from.pos);
    cam.quaternion.copy(this.from.quat);
    this.tStart = this.clock;
  }

  private installCockpitLook(): void {
    const el = this.stage.canvas;
    let drag = false, lx = 0, ly = 0;
    const down = (e: PointerEvent) => { if (this._mode !== 'cockpit' || !this.interactive) return; drag = true; lx = e.clientX; ly = e.clientY; };
    const move = (e: PointerEvent) => {
      if (!drag || this._mode !== 'cockpit') return;
      this.lookYaw = Math.max(-2.6, Math.min(2.6, this.lookYaw - (e.clientX - lx) * 0.005));
      this.lookPitch = Math.max(-1.3, Math.min(1.3, this.lookPitch - (e.clientY - ly) * 0.005));
      lx = e.clientX; ly = e.clientY;
      this.stage.requestRender();
    };
    const up = () => { drag = false; };
    const dbl = () => { if (this._mode === 'cockpit' && this.interactive) { this.lookYaw = 0; this.lookPitch = 0; this.stage.requestRender(); } };
    const win = el.ownerDocument?.defaultView ?? null;
    el.addEventListener('pointerdown', down);
    win?.addEventListener('pointermove', move);
    win?.addEventListener('pointerup', up);
    el.addEventListener('dblclick', dbl);
    this.cleanup.push(() => {
      el.removeEventListener('pointerdown', down);
      win?.removeEventListener('pointermove', move);
      win?.removeEventListener('pointerup', up);
      el.removeEventListener('dblclick', dbl);
    });
  }

  /** Per-frame update (registered on the Stage). */
  update(dt: number): void {
    if (this.disposed) return;
    this.clock += dt;
    const cam = this.stage.camera;
    // Work on the logical camera; the rendered one may be mid-transition.
    if (this.tStart >= 0) { cam.position.copy(this.logicalPos); cam.quaternion.copy(this.logicalQuat); }
    const transitioning = this.tStart >= 0;
    const c = this.controls;
    c.enabled = !transitioning && this._mode !== 'cockpit';

    switch (this._mode) {
      case 'orbit': this.updateOrbit(dt); break;
      case 'top': this.updateTop(); break;
      case 'chase': this.updateChase(dt); break;
      case 'cockpit': this.updateCockpit(); break;
    }
    this.logicalPos.copy(cam.position);
    this.logicalQuat.copy(cam.quaternion);

    if (transitioning) {
      const k = Math.min(1, (this.clock - this.tStart) / this.duration);
      const e = ease(k);
      cam.position.lerpVectors(this.from.pos, this.logicalPos, e);
      cam.quaternion.slerpQuaternions(this.from.quat, this.logicalQuat, e);
      if (k >= 1) this.tStart = -1;
      else this.stage.requestRender();
    }
    cam.updateMatrixWorld();
  }

  private followDelta(): void {
    // Move target and camera together by the focus displacement (keeps user orbit/pan offsets).
    let ok = false;
    if (this.group) {
      const d = this.fitGroup(_a);
      ok = d > 0;
      if (ok && this.groupAuto) {
        const cam = this.stage.camera;
        const cur = cam.position.distanceTo(this.controls.target);
        const want = cur + (d - cur) * 0.05;
        _b.copy(cam.position).sub(this.controls.target).setLength(want);
        cam.position.copy(this.controls.target).add(_b);
      }
    } else {
      ok = this.focusPoint(_a);
    }
    if (!ok) { this.hasLastFocus = false; return; }
    if (this.hasLastFocus) {
      _b.copy(_a).sub(this.lastFocus);
      this.controls.target.add(_b);
      this.stage.camera.position.add(_b);
    } else if (this.focusTarget !== null || this.group) {
      // First frame on this focus: snap the pivot onto it (and apply a pending distance).
      const cam = this.stage.camera;
      _b.copy(cam.position).sub(this.controls.target);
      if (this.pendingDist !== null) { _b.setLength(this.pendingDist); this.pendingDist = null; }
      this.controls.target.copy(_a);
      cam.position.copy(_a).add(_b);
    }
    this.lastFocus.copy(_a);
    this.hasLastFocus = true;
  }

  private updateOrbit(dt: number): void {
    this.followDelta();
    this.controls.update(dt);
    const cam = this.stage.camera;
    if (cam.position.y < 0.03) cam.position.y = 0.03;
  }

  private updateTop(): void {
    this.followDelta();
    const cam = this.stage.camera, t = this.controls.target;
    // Keep straight down, north up.
    const h = Math.max(0.5, cam.position.distanceTo(t));
    cam.position.set(t.x, t.y + h, t.z + 1e-4 * h);
    this.controls.update();
  }

  private updateChase(dt: number): void {
    const src = this.source, id = this.focusId;
    if (!src || !id || !src.positionOf(id, _a)) { this.controls.update(dt); return; }
    _a.multiplyScalar(UNIT_PER_M);
    // Frame of reference: the jet's heading, or (padlock) the 3D line from the threat through the jet,
    // so a lofted missile high above or a threat far below stays in the picture.
    const padlocked = !!this.lookAtId && src.positionOf(this.lookAtId, _b);
    if (padlocked) {
      _b.multiplyScalar(UNIT_PER_M);
      _d.copy(_b).sub(_a);
      if (_d.lengthSq() < 1e-10) _d.set(0, 0, -1);
      _d.normalize();
      // Keep the frame away from straight up / down (degenerate roll).
      const maxSin = Math.sin((72 * Math.PI) / 180);
      if (Math.abs(_d.y) > maxSin) {
        const hl = Math.hypot(_d.x, _d.z) || 1;
        const k = Math.sqrt(1 - maxSin * maxSin) / hl;
        _d.set(_d.x * k, Math.sign(_d.y) * maxSin, _d.z * k);
      }
      if (!this.padInit) { this.padDir.copy(_d); this.padInit = true; }
      else this.padDir.lerp(_d, 1 - Math.exp(-dt * 3)).normalize();
      // Local -z toward the threat, +y up: the chase offset (0, up, back) sits behind and above the jet.
      _m.lookAt(_origin, this.padDir, _up);
      _q.setFromRotationMatrix(_m);
      this.chaseYaw = Math.atan2(this.padDir.x, -this.padDir.z);
      this.chaseYawInit = true;
    } else {
      this.padInit = false;
      const yaw = src.headingOf(id) ?? 0;
      if (!this.chaseYawInit) { this.chaseYaw = yaw; this.chaseYawInit = true; }
      this.chaseYaw = lerpAngle(this.chaseYaw, yaw, 1 - Math.exp(-dt * 3));
      headingQuaternion(this.chaseYaw, _q);
    }
    const cam = this.stage.camera;
    const c = this.controls;
    // Scale offsets with the jet's display scale when boosted far away (stays sensible).
    const sc = Math.max(1, (src.displayScaleOf?.(id) ?? UNIT_PER_M) / UNIT_PER_M);
    _b.copy(this.chaseOffset).multiplyScalar(sc).applyQuaternion(_q);
    cam.position.copy(_a).add(_b);
    c.target.copy(_a);
    c.update(dt);
    // Read back the (possibly user-adjusted) offset in the reference frame.
    _q2.copy(_q).invert();
    this.chaseOffset.copy(cam.position).sub(_a).applyQuaternion(_q2).divideScalar(sc);
    if (cam.position.y < 0.01) cam.position.y = 0.01;
    if (padlocked && src.positionOf(this.lookAtId as EntityId, _b)) {
      // Aim between the jet and the threat (bisect the two sight lines) so both stay in frame.
      _b.multiplyScalar(UNIT_PER_M).sub(cam.position);
      _c.copy(_a).sub(cam.position);
      if (_b.lengthSq() > 1e-12 && _c.lengthSq() > 1e-12) {
        _b.normalize().add(_c.normalize());
        if (_b.lengthSq() < 1e-8) _b.copy(_c); // exactly opposite: look at the jet
        _b.add(cam.position);
        cam.lookAt(_b);
      }
    }
  }

  private updateCockpit(): void {
    const src = this.source, id = this.focusId;
    if (!src || !id || !src.positionOf(id, _a) || !src.orientationOf(id, _q)) return;
    _a.multiplyScalar(UNIT_PER_M);
    const cam = this.stage.camera;
    // Eye slightly forward and above the reference point.
    _b.set(0, 1.1, -5.5).multiplyScalar(UNIT_PER_M).applyQuaternion(_q);
    cam.position.copy(_a).add(_b);
    _q2.setFromEuler(_e.set(this.lookPitch, this.lookYaw, 0, 'YXZ'));
    cam.quaternion.copy(_q).multiply(_q2);
  }

  /** Metres between the camera and a point (sim metres). */
  distanceTo(p: XYZ): number {
    const c = this.stage.camera.position;
    return Math.hypot(c.x * M_PER_UNIT - p.x, c.y * M_PER_UNIT - p.y, c.z * M_PER_UNIT - p.z);
  }
}

/** Camera basis for an orbit view looking toward `headingDeg`, `elevationDeg` above the target. */
export function orbitBasis(headingDeg: number, elevationDeg: number, fwd: Vector3, right: Vector3, up: Vector3): void {
  const h = (headingDeg * Math.PI) / 180, e = (elevationDeg * Math.PI) / 180;
  fwd.set(Math.sin(h) * Math.cos(e), -Math.sin(e), -Math.cos(h) * Math.cos(e));
  right.set(Math.cos(h), 0, Math.sin(h)); // horizontal, perpendicular to the look heading
  up.crossVectors(right, fwd).normalize();
}

/**
 * Distance from the group centre (along -fwd) at which every point (offset from the centre, units)
 * fits inside the view: |x| ≤ depth · tanH / pad and |y| ≤ depth · tanV / pad. Never below minDist.
 */
export function fitDistance(
  n: number, pointAt: (i: number) => Vector3 | null, fwd: Vector3, right: Vector3, up: Vector3,
  tanH: number, tanV: number, pad: number, minDist: number,
): number {
  let d = minDist;
  for (let i = 0; i < n; i++) {
    const p = pointAt(i);
    if (!p) continue;
    const x = Math.abs(p.dot(right)), y = Math.abs(p.dot(up)), z = p.dot(fwd);
    d = Math.max(d, (pad * x) / tanH - z, (pad * y) / tanV - z);
  }
  return d;
}
