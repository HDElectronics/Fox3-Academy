/**
 * FlightOpsScene: the airfield pattern and approach view. Owns a runway, the approach overlay, the jet
 * and a small camera controller on a page's Stage.
 *
 * Render scale: the global 1 unit = 1 km is kept (the Environment sky, ground and haze are built for
 * it). Runway and overlay live in `root`, a Group scaled by 0.001, so they are authored in runway-frame
 * metres. The jet is true size in the chase and cockpit views; in the side and tower views it gets a
 * Tacview-style screen-size floor (`boostPx`) so a 15 m jet stays readable next to a 7 km corridor.
 * The Stage camera near plane is lowered to 0.5 m for the cockpit view and restored on dispose.
 */
import { Group, Quaternion, Vector3 } from 'three';
import type { FlightOpsJetId, FlightOpsState } from '../../sim/flightOps/types';
import { JetMesh, NOMINAL_JET_M } from '../jets';
import type { VisualSide } from '../palette';
import { FramePriority, type Stage } from '../stage';
import { boostedScale, headingQuaternion, orientationQuaternion, UNIT_PER_M } from '../units';
import { ApproachOverlay, type ApproachGeometryOptions } from './approach';
import { RunwayMesh } from './runway';

export type FlightOpsCamera = 'chase' | 'side' | 'tower' | 'cockpit';

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
  private readonly oldNear: number;
  private readonly offFrame: () => void;
  private disposed = false;

  constructor(stage: Stage, aircraft: FlightOpsJetId, opts: FlightOpsSceneOptions = {}) {
    this.stage = stage;
    this.mode = opts.camera ?? 'chase';
    this.side = opts.side ?? 'blue';
    this.boostPx = opts.boostPx ?? 56;
    stage.env?.setSurface('land');
    stage.env?.setGrid(false);
    this.oldNear = stage.camera.near;
    stage.camera.near = 0.0005;
    stage.camera.updateProjectionMatrix();

    this.root.name = 'flightOps';
    this.root.scale.setScalar(UNIT_PER_M);
    this.runway = new RunwayMesh(stage.palette, { aimPointM: opts.aimPointM });
    this.overlay = new ApproachOverlay(stage.shared, stage.palette, opts);
    this.root.add(this.runway, this.overlay);
    this.jet = new JetMesh(aircraft, this.side, stage.palette);
    stage.scene.add(this.root, this.jet);
    this.offFrame = stage.onFrame(dt => this.frame(dt), { priority: FramePriority.camera, always: true });
  }

  get camera(): FlightOpsCamera { return this.mode; }

  setCamera(mode: FlightOpsCamera): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.snap = true;
    this.stage.requestRender();
  }

  /** Swap the jet type (keeps the camera and overlay). */
  setAircraft(id: FlightOpsJetId): void {
    if (id === this.jet.aircraft) return;
    this.jet.removeFromParent();
    this.jet = new JetMesh(id, this.side, this.stage.palette);
    this.stage.scene.add(this.jet);
    if (this.state) this.update(this.state);
  }

  /** Glide angle, aim point and corridor tolerances (moves the runway aim blocks too). */
  setApproach(opts: ApproachGeometryOptions): void {
    this.overlay.setGeometry(opts);
    if (opts.aimPointM !== undefined) this.runway.setAimPoint(opts.aimPointM);
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
    this.placeJet(this.jet.scale.x || UNIT_PER_M);
    this.stage.requestRender();
  }

  private placeJet(scale: number): void {
    const s = this.state;
    if (!s) return;
    this.jet.scale.setScalar(scale);
    _v.set(0, this.jet.groundClearanceM * scale, 0).applyQuaternion(this.jet.quaternion);
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
    const aim = this.overlay.aimPointM;
    const jet = this.jetPoint(_t);
    const m = UNIT_PER_M;
    this.jet.visible = this.mode !== 'cockpit';

    if (this.mode === 'cockpit' && s) {
      const q = orientationQuaternion(s.heading, s.pitch, s.bank, _q);
      _v.set(0, (this.jet.groundClearanceM + 1.2) * m, -0.3 * this.jet.lengthM * m).applyQuaternion(q);
      cam.position.copy(jet).add(_v);
      cam.quaternion.copy(q);
      this.snap = false;
      this.placeJet(m);
      return;
    }

    const want = _w;
    const look = _v;
    switch (this.mode) {
      case 'chase': {
        const hq = headingQuaternion(s?.heading ?? 0, _q);
        want.set(0, 4 * m, 48 * m).applyQuaternion(hq).add(jet);
        look.set(0, 1 * m, -40 * m).applyQuaternion(hq).add(jet);
        break;
      }
      case 'side': {
        // Abeam the approach from the east, looking west: the approach reads left (south) to right (north).
        const zAim = -aim * m;
        const zc = (jet.z + zAim) / 2, yc = Math.max(jet.y / 2, 0.02);
        const spanZ = Math.abs(jet.z - zAim) * 1.3 + 0.4, spanY = jet.y * 1.3 + 0.1;
        const vf = (cam.fov * Math.PI) / 360, hf = Math.atan(Math.tan(vf) * cam.aspect);
        const dist = Math.max(0.4, spanZ / 2 / Math.tan(hf), spanY / 2 / Math.tan(vf));
        want.set(dist, yc + dist * 0.14, zc);
        look.set(0, yc, zc);
        break;
      }
      case 'tower':
        want.set(0.25, 0.035, (-aim - 150) * m);
        look.copy(jet);
        break;
    }
    const k = this.snap || dt <= 0 ? 1 : 1 - Math.exp(-dt * 5);
    if (this.snap) { this.camPos.copy(want); this.camLook.copy(look); this.snap = false; }
    else { this.camPos.lerp(want, k); this.camLook.lerp(look, k); }
    cam.position.copy(this.camPos);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.camLook);

    // Screen-size floor for the jet in the distant views.
    const boost = this.mode === 'side' || this.mode === 'tower' ? this.boostPx : 0;
    const d = cam.position.distanceTo(jet);
    this.placeJet(boostedScale(this.stage.pxPerUnit(d), NOMINAL_JET_M, boost));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.offFrame();
    this.runway.dispose();
    this.overlay.dispose();
    this.jet.removeFromParent();
    this.root.removeFromParent();
    this.stage.camera.near = this.oldNear;
    this.stage.camera.updateProjectionMatrix();
  }
}
