/**
 * FlightOpsScene: the airfield pattern and approach view. Owns a runway, the approach overlay, the jet
 * and a small camera controller on a page's Stage.
 *
 * Render scale: the global 1 unit = 1 km is kept (the Environment sky, ground and haze are built for
 * it). Runway and overlay live in `root`, a Group scaled by 0.001, so they are authored in runway-frame
 * metres. The jet is true size in the chase and cockpit views; in the side and tower views it gets a
 * Tacview-style screen-size floor (`boostPx`) so a 15 m jet stays readable next to a 7 km corridor.
 * The Stage camera near plane is lowered to 0.5 m for the cockpit view and restored on dispose; the far
 * plane (2000 km) and the Environment haze (130 km) already cover an RTB start 40 km out at 4000 m.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three';
import { FLIGHT_OPS } from '../../data/flightOps';
import { basketRest, boomPoint } from '../../sim/flightOps/aar';
import { SHIPS } from '../../data/ships';
import { aimPointU, landingHeading, shipFrame } from '../../sim/flightOps/carrier';
import { LineBatch } from '../lines';
import { Note } from '../tags';
import type { FlightOpsJetId, FlightOpsState, ShipId, TankerFrameVec, TankerId } from '../../sim/flightOps/types';
import { JetMesh, NOMINAL_JET_M } from '../jets';
import type { VisualSide } from '../palette';
import { FramePriority, type Stage } from '../stage';
import { boostedScale, headingQuaternion, orientationQuaternion, UNIT_PER_M } from '../units';
import { ApproachOverlay, type ApproachGeometryOptions } from './approach';
import { CarrierMesh } from './carrier';
import { LaunchDeck } from './launchDeck';
import { RunwayMesh } from './runway';
import { TankerMesh } from './tanker';

/**
 * 'lso' is the LSO platform view on a carrier start; without a ship it falls back to 'tower' (and 'tower' to 'lso'
 * with one). 'deck' is the shooter's view on a launch start (beside the jet on the deck); without a launch it falls
 * back to 'chase'. 'wing' and 'receiver' are the refuelling views (#28): beside the tanker looking at the receiver,
 * and behind the receiver looking at the basket or the boom; without a tanker they fall back to 'chase'.
 */
export type FlightOpsCamera = 'chase' | 'side' | 'tower' | 'lso' | 'cockpit' | 'deck' | 'wing' | 'receiver';

/**
 * Refuelling camera eye points, tanker frame metres (display choices). Wing: under the wing, outboard of and behind the
 * hose pod (drogue, offsets from the pod) or beside the rear fuselage (boom), looking aft at the receiver. Receiver: `aft` behind the receiver's tail and `up` above its
 * reference, in line with the probe tip or receptacle, looking at the basket or the boom nozzle.
 */
export const WING_EYE = { drogue: { aft: 3, right: -5, up: -1.5 }, boom: { aft: 6, right: -9, up: 2.5 } } as const;
export const RECEIVER_EYE = { aft: 14, up: 4.5 } as const;
/** Probe rod drawn on the receiver (model metres): length and radius. Drawing values. */
const PROBE_LEN_M = 2.4;

/** LSO platform eye point, landing frame (u from the ramp, v right of the axis, h above the deck), metres. Display choice. */
export const LSO_EYE = { u: 18, v: -24, h: 3 } as const;
/** Carrier approach corridor length, metres (1.5 nm). */
export const CARRIER_CORRIDOR_M = 1.5 * 1852;
/** LSO view: sky height framed around the jet (m) and the narrowest field of view (deg). Display choices. */
const LSO_FRAME_M = 90;
const LSO_FOV_MIN = 6;
/** Deck (shooter) view: eye ahead of and beside the held jet, ship frame metres; framed sky around the jet (m). Display choices. */
export const DECK_EYE = { ahead: 22, beside: 17, h: 1.8 } as const;
const DECK_FRAME_M = 45;
const HOOK_DOWN_RAD = 35 * Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const _aim = new Vector3();

export interface FlightOpsSceneOptions extends ApproachGeometryOptions {
  camera?: FlightOpsCamera;
  side?: VisualSide;
  /** Minimum on-screen jet length (px) in the side and tower views. Default 56. */
  boostPx?: number;
}

const _q = new Quaternion();
const _v = new Vector3();
const _w = new Vector3();
const _t = new Vector3();
const _f = new Vector3();
const _a = new Vector3();
const _b = new Vector3();

/** Nav marker size (m): pillar height and ground ring radius. Display choices. */
const NAV_PILLAR_M = 1200;
const NAV_RING_M = 180;

export class FlightOpsScene {
  readonly stage: Stage;
  /** Runway-frame metres (scale 0.001). Add page-specific objects here. */
  readonly root = new Group();
  readonly runway: RunwayMesh;
  readonly overlay: ApproachOverlay;
  jet: JetMesh;
  private mode: FlightOpsCamera;
  private side: VisualSide;
  private boostPx: number;
  private state: FlightOpsState | null = null;
  private snap = true;
  private readonly camPos = new Vector3();
  private readonly camLook = new Vector3();
  private readonly baseFov: number;
  private readonly oldNear: number;
  private readonly offFrame: () => void;
  private disposed = false;
  private readonly nav: LineBatch;
  private readonly navAnchor = new Group();
  private readonly navNote: Note;
  /** The ship on a carrier start (null on the airfield). */
  carrier: CarrierMesh | null = null;
  /** Landing-frame group carrying the overlay: identity on the airfield, at the ramp on the angled deck at sea. */
  readonly landing = new Group();
  /** Catapult or ski-jump furniture on a launch start (child of `carrier`). */
  launchDeck: LaunchDeck | null = null;
  /** Ship-frame spot where the jet was held for the launch (the deck camera and the side view key on it). */
  private hold: { a: number; c: number } | null = null;
  private hook: Mesh | null = null;
  private hookMat: MeshStandardMaterial | null = null;
  private readonly runwayApproach: ApproachGeometryOptions;
  /** The tanker on a refuelling start (null otherwise). */
  tanker: TankerMesh | null = null;
  private probe: Mesh | null = null;
  private probeMat: MeshStandardMaterial | null = null;
  private readonly tipMark = new Object3D();

  constructor(stage: Stage, aircraft: FlightOpsJetId, opts: FlightOpsSceneOptions = {}) {
    this.stage = stage;
    this.mode = opts.camera ?? 'chase';
    this.side = opts.side ?? 'blue';
    this.boostPx = opts.boostPx ?? 56;
    stage.env?.setSurface('land');
    stage.env?.setGrid(false);
    this.baseFov = stage.camera.fov;
    this.oldNear = stage.camera.near;
    stage.camera.near = 0.0005;
    stage.camera.updateProjectionMatrix();

    this.root.name = 'flightOps';
    this.root.scale.setScalar(UNIT_PER_M);
    this.runway = new RunwayMesh(stage.palette, { aimPointM: opts.aimPointM });
    this.overlay = new ApproachOverlay(stage.shared, stage.palette, opts);
    this.root.add(this.runway, this.landing);
    this.landing.name = 'flightOps:landingFrame';
    this.landing.add(this.overlay);
    this.runwayApproach = { ...opts, glideDeg: this.overlay.glideDeg, aimPointM: this.overlay.aimPointM, lengthM: opts.lengthM ?? 4 * 1852 };
    this.jet = new JetMesh(aircraft, this.side, stage.palette, { onReady: () => stage.requestRender() });
    stage.scene.add(this.root, this.jet);
    this.nav = new LineBatch(stage.shared, { capacity: 64 });
    this.nav.visible = false;
    this.root.add(this.nav);
    this.navAnchor.name = 'flightOps:navLabel';
    this.navNote = new Note(this.navAnchor, 'r3-above r3-center', undefined, true);
    this.navNote.visible = false;
    stage.labels.add(this.navAnchor);
    this.offFrame = stage.onFrame(dt => this.frame(dt), { priority: FramePriority.camera, always: true });
  }

  get camera(): FlightOpsCamera { return this.mode; }

  /**
   * Carrier start (#26): show the ship on the sea and hide the runway; the approach overlay moves into the
   * landing frame (origin at the ramp at deck height, −z along the angled deck, glide path to the hook aim
   * point) and follows the ship. Pass trail and gate points in that frame: x = v (right of the axis),
   * y = height above the deck, z = −u. `null` goes back to the airfield.
   */
  setCarrier(id: ShipId | null): void {
    if ((this.carrier?.shipId ?? null) === id) return;
    this.launchDeck?.dispose();
    this.launchDeck = null;
    this.hold = null;
    this.carrier?.dispose();
    this.carrier = null;
    this.overlay.clearTrail();
    if (id) {
      this.carrier = new CarrierMesh(this.stage.palette, id);
      this.launchDeck = new LaunchDeck(this.stage.palette, id);
      this.carrier.add(this.launchDeck);
      this.root.add(this.carrier);
      const ship = SHIPS[id];
      this.overlay.setGeometry({ glideDeg: ship.glideDeg.value, aimPointM: aimPointU(ship), lengthM: CARRIER_CORRIDOR_M, minHalfM: 3 });
      this.stage.env?.setSurface('sea');
    } else {
      this.landing.position.set(0, 0, 0);
      this.landing.rotation.set(0, 0, 0);
      this.overlay.setGeometry({ ...this.runwayApproach, minHalfM: this.runwayApproach.minHalfM ?? 6 });
      this.stage.env?.setSurface('land');
    }
    this.runway.visible = !id;
    this.snap = true;
    this.stage.requestRender();
  }

  /**
   * Refuelling start (#28): add the tanker to `root` (world metres), hide the runway and the approach overlay.
   * `update(state)` then places it from `state.aar` and draws the receiver's probe. `null` removes it.
   */
  setTanker(id: TankerId | null): void {
    if ((this.tanker?.tankerId ?? null) === id) return;
    this.tanker?.dispose();
    this.tanker = null;
    if (id) {
      this.tanker = new TankerMesh(this.stage.shared, this.stage.palette, id);
      this.root.add(this.tanker);
    }
    this.runway.visible = !id && !this.carrier;
    this.landing.visible = !id;
    this.snap = true;
    this.stage.requestRender();
  }

  setCamera(mode: FlightOpsCamera): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.snap = true;
    this.stage.requestRender();
  }

  /** Swap the jet type (keeps the camera and overlay). */
  setAircraft(id: FlightOpsJetId): void {
    if (id === this.jet.aircraft) return;
    this.jet.dispose();
    this.jet = new JetMesh(id, this.side, this.stage.palette, { onReady: () => this.stage.requestRender() });
    this.stage.scene.add(this.jet);
    this.hook?.geometry.dispose();
    this.hook = null;
    if (this.state) this.update(this.state);
  }

  /** Glide angle, aim point and corridor tolerances (moves the runway aim blocks too). */
  setApproach(opts: ApproachGeometryOptions): void {
    Object.assign(this.runwayApproach, opts);
    if (this.carrier) return;
    this.overlay.setGeometry(opts);
    if (opts.aimPointM !== undefined) this.runway.setAimPoint(opts.aimPointM);
    this.stage.requestRender();
  }

  /**
   * Steer-point marker (runway-frame metres, on the ground): a ground ring, a tall pillar readable from
   * 40 km, and an optional label at its top. `null` hides it.
   */
  setNavTarget(pos: { x: number; z: number } | null, label?: string): void {
    const L = this.nav;
    L.reset();
    if (!pos) {
      L.commit();
      L.visible = false;
      this.navNote.visible = false;
      this.stage.requestRender();
      return;
    }
    const p = this.stage.palette;
    const c = p.symHi;
    const ring: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      ring.push({ x: pos.x + Math.cos(a) * NAV_RING_M, y: 2, z: pos.z + Math.sin(a) * NAV_RING_M });
    }
    L.polyline(ring, { color: c, alpha: 0.9, width: 2 }, true);
    L.line({ x: pos.x, y: 0, z: pos.z }, { x: pos.x, y: NAV_PILLAR_M, z: pos.z }, { color: c, alpha: 0.95, colorB: c, alphaB: 0.25, width: 2.5 });
    L.line({ x: pos.x - NAV_RING_M, y: 2, z: pos.z }, { x: pos.x + NAV_RING_M, y: 2, z: pos.z }, { color: c, alpha: 0.6, width: 1.2 });
    L.line({ x: pos.x, y: 2, z: pos.z - NAV_RING_M }, { x: pos.x, y: 2, z: pos.z + NAV_RING_M }, { color: c, alpha: 0.6, width: 1.2 });
    L.commit();
    L.visible = true;
    this.navAnchor.position.set(pos.x * UNIT_PER_M, NAV_PILLAR_M * UNIT_PER_M, pos.z * UNIT_PER_M);
    this.navNote.set(label ?? '');
    this.navNote.visible = !!label;
    this.stage.requestRender();
  }

  /**
   * Place the jet from the sim state. `pos.y` is the wheel height above the runway (0 = on the runway
   * with the gear down); the model origin sits `groundClearanceM` above it along the jet's up axis.
   */
  update(state: FlightOpsState): void {
    this.state = state;
    if (state.aircraft !== this.jet.aircraft) this.setAircraft(state.aircraft);
    this.jet.setConfig({ gear: state.gearPos, flaps: state.flapPos, speedbrake: state.speedbrakePos });
    this.jet.quaternion.copy(orientationQuaternion(state.heading, state.pitch, state.bank, _q));
    if (state.ship && this.carrier) {
      this.carrier.place(state.ship);
      this.carrier.setBall(state.lso?.ball ?? null);
      this.landing.position.set(state.ship.x, this.carrier.ship.deckHeightM, state.ship.z);
      this.landing.rotation.set(0, -landingHeading(state), 0);
      const L = state.launch;
      const f = L ? shipFrame(state) : null;
      if (L && f && (L.stage === 'hold' || L.stage === 'shot' || !this.hold)) this.hold = { a: f.a, c: f.c };
      if (!L) this.hold = null;
      this.launchDeck?.update(L, f, this.jet.lengthM, state.t);
    }
    this.updateHook(state.hookPos);
    this.placeJet(this.jet.scale.x || UNIT_PER_M);
    this.updateAar(state);
    this.stage.requestRender();
  }

  /**
   * Refuelling: a probe rod on probe jets (out by `aar.probePos`), the probe tip or receptacle marker at the data's
   * contact point, and the tanker driven from the state with the basket or boom on the drawn tip while connected.
   */
  private updateAar(state: FlightOpsState): void {
    const a = state.aar, T = this.tanker;
    const r = FLIGHT_OPS[state.aircraft].aar;
    if (!a || !T || !r) { if (this.probe) this.probe.visible = false; return; }
    const c = r.contactPointM.value;
    if (this.tipMark.parent !== this.jet) this.jet.add(this.tipMark);
    this.tipMark.position.set(c.right, c.up, -c.fwd);
    if (r.kind === 'probe') {
      if (!this.probe || this.probe.parent !== this.jet) {
        this.probe?.geometry.dispose();
        this.probeMat ??= new MeshStandardMaterial({ color: this.stage.palette.dark.clone().lerp(this.stage.palette.smoke, 0.4), roughness: 0.6, metalness: 0.3 });
        const g = new CylinderGeometry(0.06, 0.08, 1, 8).rotateX(Math.PI / 2).translate(0, 0, -0.5);
        this.probe = new Mesh(g, this.probeMat);
        this.probe.name = 'flightOps:probe';
        this.jet.add(this.probe);
      }
      const k = Math.max(0, Math.min(1, a.probePos));
      this.probe.visible = k > 0.02;
      // Base aft of the tip, slightly low; the rod grows toward the tip as the probe comes out.
      this.probe.position.set(c.right, c.up - 0.2, -c.fwd + PROBE_LEN_M);
      this.probe.quaternion.setFromUnitVectors(_a.set(0, 0, -1), _b.set(0, 0.2, -PROBE_LEN_M).normalize());
      this.probe.scale.set(1, 1, Math.max(0.01, k * Math.hypot(0.2, PROBE_LEN_M)));
    } else if (this.probe) this.probe.visible = false;
    this.jet.updateMatrixWorld(true);
    const w = this.tipMark.getWorldPosition(_f).divideScalar(UNIT_PER_M);
    T.update(a, a.connected ? T.toFrame(w) : undefined);
  }

  /** Tanker-frame target the receiver closes on: the basket at rest (or on the tip) or the boom nozzle. */
  private aarTarget(): TankerFrameVec | null {
    const a = this.state?.aar, T = this.tanker;
    if (!a || !T) return null;
    if (a.connected) return a.tip;
    return T.tanker.drogue ? basketRest(T.tanker) : boomPoint(T.tanker);
  }

  /**
   * Tail hook: a simple arm under the tail (model frame, metres), shown once the state has a hook and swung
   * down by `hookPos` (0 stowed and hidden, 1 down). Drawn by the scene, not a JetMesh part; display geometry.
   */
  private updateHook(pos: number | undefined): void {
    if (pos === undefined) { if (this.hook) this.hook.visible = false; return; }
    if (!this.hook) {
      const gc = this.jet.groundClearanceM || 2;
      const len = Math.max(1.5, gc);
      const g = new BoxGeometry(0.16, 0.16, len);
      g.translate(0, 0, len / 2);
      this.hookMat ??= new MeshStandardMaterial({ color: this.stage.palette.dark.clone(), roughness: 0.8 });
      this.hook = new Mesh(g, this.hookMat);
      this.hook.name = 'flightOps:hook';
      this.hook.position.set(0, -gc * 0.3, this.jet.lengthM * 0.34);
      this.jet.add(this.hook);
    }
    this.hook.visible = pos > 0.02;
    this.hook.rotation.x = pos * HOOK_DOWN_RAD;
  }

  /** Approach reference: the aim point (units) and the landing heading. Airfield: aim point north of the threshold. */
  private aimRef(out: Vector3): number {
    const s = this.state;
    if (s?.aar && this.tanker) {
      out.copy(this.tanker.position).multiplyScalar(UNIT_PER_M);
      return s.aar.tankerHeading;
    }
    if (s?.ship && this.carrier && s.launch && this.hold) {
      // Launch: the spot the jet was held on, along the ship's heading.
      const h = s.ship.heading, a = this.hold.a, c = this.hold.c;
      out.set(s.ship.x + Math.sin(h) * a + Math.cos(h) * c, this.carrier.ship.deckHeightM, s.ship.z - Math.cos(h) * a + Math.sin(h) * c).multiplyScalar(UNIT_PER_M);
      return h;
    }
    if (s?.ship && this.carrier) {
      const hl = landingHeading(s), u = this.overlay.aimPointM;
      out.set(s.ship.x + Math.sin(hl) * u, this.carrier.ship.deckHeightM, s.ship.z - Math.cos(hl) * u).multiplyScalar(UNIT_PER_M);
      return hl;
    }
    out.set(0, 0, -this.overlay.aimPointM * UNIT_PER_M);
    return 0;
  }

  private placeJet(scale: number): void {
    const s = this.state;
    if (!s) return;
    this.jet.scale.setScalar(scale);
    // In the air behind a tanker the model origin is the sim reference (the probe and receptacle key on it).
    _v.set(0, s.aar ? 0 : this.jet.groundClearanceM * scale, 0).applyQuaternion(this.jet.quaternion);
    this.jet.position.set(s.pos.x * UNIT_PER_M, s.pos.y * UNIT_PER_M, s.pos.z * UNIT_PER_M).add(_v);
  }

  /** Jet reference point (units), for the camera. */
  private jetPoint(out: Vector3): Vector3 {
    const s = this.state;
    return s ? out.set(s.pos.x, s.pos.y, s.pos.z).multiplyScalar(UNIT_PER_M) : out.set(0, 0.2, 3);
  }

  private frame(dt: number): void {
    if (this.disposed) return;
    const cam = this.stage.camera;
    const s = this.state;
    const aimP = _aim;
    const hl = this.aimRef(aimP);
    const carrier = !!(s?.ship && this.carrier);
    const launch = carrier && !!s?.launch && !!this.hold;
    const aar = !!(s?.aar && this.tanker);
    const view = this.mode === 'deck' && !launch ? 'chase'
      : (this.mode === 'wing' || this.mode === 'receiver') && !aar ? 'chase'
      : carrier && this.mode === 'tower' ? 'lso' : !carrier && this.mode === 'lso' ? 'tower' : this.mode;
    const jet = this.jetPoint(_t);
    const m = UNIT_PER_M;
    this.jet.visible = this.mode !== 'cockpit';

    if (this.mode === 'cockpit' && s) {
      if (cam.fov !== this.baseFov) { cam.fov = this.baseFov; cam.updateProjectionMatrix(); }
      const q = orientationQuaternion(s.heading, s.pitch, s.bank, _q);
      _v.set(0, (this.jet.groundClearanceM + 1.2) * m, -0.3 * this.jet.lengthM * m).applyQuaternion(q);
      cam.position.copy(jet).add(_v);
      cam.quaternion.copy(q);
      this.snap = false;
      this.placeJet(m);
      return;
    }

    let fov = this.baseFov;
    const want = _w;
    const look = _v;
    switch (view) {
      case 'chase': {
        // High and left of the jet, so on final the jet sits low right and the runway stays in view.
        const hq = headingQuaternion(s?.heading ?? 0, _q);
        want.set(-7 * m, 9 * m, 46 * m).applyQuaternion(hq).add(jet);
        _f.set(0, 0, -1).applyQuaternion(hq);
        // Along the heading, or between the jet and the aim point when the runway is ahead.
        look.set(0, 1 * m, -40 * m).applyQuaternion(hq).add(jet).sub(want).normalize();
        _a.copy(aimP).sub(jet);
        const ahead = Math.hypot(_a.x, _a.z) > 1e-6 ? (_f.x * _a.x + _f.z * _a.z) / Math.hypot(_a.x, _a.z) : 0;
        const k = Math.min(1, Math.max(0, (ahead - 0.3) / 0.5));
        if (k > 0) {
          _a.copy(aimP).sub(want).normalize();
          _b.copy(jet).sub(want).normalize();
          _a.add(_b).normalize();
          look.lerp(_a, k).normalize();
        }
        look.add(want);
        break;
      }
      case 'side': {
        // Abeam the approach, right of the landing direction (east of the north runway), looking across it:
        // the approach reads left to right. Frames the jet and the aim point.
        const fx = Math.sin(hl), fz = -Math.cos(hl), rx = Math.cos(hl), rz = Math.sin(hl);
        const along = (jet.x - aimP.x) * fx + (jet.z - aimP.z) * fz;
        const across = (jet.x - aimP.x) * rx + (jet.z - aimP.z) * rz;
        const cxw = aimP.x + fx * along / 2, czw = aimP.z + fz * along / 2;
        const base = aimP.y;
        const yc = Math.max(base + (jet.y - base) / 2, base + 0.02);
        const spanZ = Math.abs(along) * 1.3 + (carrier ? 0.25 : 0.4), spanY = Math.max(0, jet.y - base) * 1.3 + 0.1;
        const vf = (cam.fov * Math.PI) / 360, hf = Math.atan(Math.tan(vf) * cam.aspect);
        const dist = Math.max(launch ? 0.12 : carrier ? 0.3 : 0.4, spanZ / 2 / Math.tan(hf), spanY / 2 / Math.tan(vf)) + Math.max(0, across);
        want.set(cxw + rx * dist, yc + dist * 0.14, czw + rz * dist);
        look.set(cxw, yc, czw);
        break;
      }
      case 'lso': {
        // LSO platform, port side aft, eye just above the deck, looking up the groove at the jet.
        if (s?.ship && this.carrier) {
          const fx = Math.sin(hl), fz = -Math.cos(hl), rx = Math.cos(hl), rz = Math.sin(hl);
          const sx = s.ship.x + fx * LSO_EYE.u + rx * LSO_EYE.v, sz = s.ship.z + fz * LSO_EYE.u + rz * LSO_EYE.v;
          want.set(sx * m, (this.carrier.ship.deckHeightM + LSO_EYE.h) * m, sz * m);
          look.copy(jet);
          const dist = want.distanceTo(jet) / m;
          if (dist < 30) look.set(want.x - fx * 0.2, want.y, want.z - fz * 0.2);
          // Zoom with range: about LSO_FRAME_M of sky around the jet, so the jet reads in the groove and the
          // deck is only a strip at the bottom.
          fov = clamp(2 * Math.atan(LSO_FRAME_M / 2 / Math.max(1, dist)) * 180 / Math.PI, LSO_FOV_MIN, this.baseFov);
          this.snap = true;   // the platform moves with the ship: no smoothing lag
        }
        break;
      }
      case 'deck': {
        // Shooter's view: on the deck ahead of and beside the held jet, outboard of it, looking at the jet;
        // stays on the deck and zooms as the jet flies off. No smoothing (the deck moves with the ship).
        if (s?.ship && this.carrier && this.hold) {
          const h = s.ship.heading, fx = Math.sin(h), fz = -Math.cos(h), rx = Math.cos(h), rz = Math.sin(h);
          const side = this.hold.c >= 0 ? 1 : -1;
          const a = this.hold.a + DECK_EYE.ahead, c = this.hold.c + side * DECK_EYE.beside;
          want.set((s.ship.x + fx * a + rx * c) * m, (this.carrier.ship.deckHeightM + DECK_EYE.h) * m, (s.ship.z + fz * a + rz * c) * m);
          look.copy(jet);
          const dist = want.distanceTo(jet) / m;
          fov = clamp(2 * Math.atan(DECK_FRAME_M / 2 / Math.max(1, dist)) * 180 / Math.PI, LSO_FOV_MIN, this.baseFov);
          this.snap = true;
        }
        break;
      }
      case 'wing':
      case 'receiver': {
        const a = s!.aar!, T = this.tanker!;
        const tgt = this.aarTarget()!;
        if (view === 'wing') {
          const e = T.tanker.drogue ? { ...WING_EYE.drogue, right: T.tanker.drogue.pod.right + WING_EYE.drogue.right, aft: T.tanker.drogue.pod.aft + WING_EYE.drogue.aft }
            : WING_EYE.boom;
          T.toWorld(e, want).multiplyScalar(m);
          look.copy(jet);
        } else {
          T.toWorld({ aft: a.rel.aft + this.jet.lengthM / 2 + RECEIVER_EYE.aft, right: a.tip.right, up: a.rel.up + RECEIVER_EYE.up }, want).multiplyScalar(m);
          T.toWorld(tgt, look).multiplyScalar(m);
        }
        this.snap = true;   // rides with the tanker: no smoothing lag
        break;
      }
      case 'tower': {
        const aim = this.overlay.aimPointM;
        want.set(0.25, 0.035, (-aim - 150) * m);
        look.copy(jet);
        break;
      }
    }
    if (aar) this.snap = true;   // 150 m/s behind the tanker: a smoothed camera would lag tens of metres
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const k = this.snap || dt <= 0 ? 1 : 1 - Math.exp(-dt * 5);
    if (this.snap) { this.camPos.copy(want); this.camLook.copy(look); this.snap = false; }
    else { this.camPos.lerp(want, k); this.camLook.lerp(look, k); }
    cam.position.copy(this.camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.camLook);

    // Screen-size floor for the jet in the distant views.
    const boost = view === 'side' || view === 'tower' ? this.boostPx : view === 'lso' ? Math.min(this.boostPx, 24) : 0;
    const d = cam.position.distanceTo(jet);
    this.placeJet(boostedScale(this.stage.pxPerUnit(d), NOMINAL_JET_M, boost));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame();
    this.runway.dispose();
    this.launchDeck?.dispose();
    this.carrier?.dispose();
    this.hook?.geometry.dispose();
    this.hookMat?.dispose();
    this.tanker?.dispose();
    this.probe?.geometry.dispose();
    this.probeMat?.dispose();
    this.overlay.dispose();
    this.nav.dispose();
    this.navNote.dispose();
    this.navAnchor.removeFromParent();
    this.jet.dispose();
    this.root.removeFromParent();
    this.stage.camera.near = this.oldNear;
    this.stage.camera.fov = this.baseFov;
    this.stage.camera.updateProjectionMatrix();
  }
}
