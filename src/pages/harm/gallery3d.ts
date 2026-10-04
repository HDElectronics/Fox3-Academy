/**
 * [OWNER: page-harm] Vehicle gallery: one SAM battery at true size on land, laid out as a site, with a tag over each
 * vehicle (name, RWR symbol or "no radar"). Drag to orbit; a slow auto orbit unless reduced motion. While the
 * radars emit, their antennas turn and a faint pulse and beam mark every radar vehicle. Original art (models.ts).
 *
 * Scale: this close-up uses its own scene scale (GAL_UNIT_PER_M, 1 unit = 100 m) so the camera can sit at a few
 * metres above the ground; the CameraRig's metre API is fed through `rigM`. Nothing here talks to the sim.
 */
import {
  AdditiveBlending, ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, SphereGeometry, type Object3D,
} from 'three';
import { CameraRig, Stage, isWebGLAvailable, Tag } from '../../render';
import { VEHICLE_INFO, VEHICLE_SIZE, animateVehicle, buildVehicle, disposeVehicle, modelRig } from './models';
import type { SystemId, VehicleId } from './types';

/** Render units per metre in the gallery (1 unit = 100 m). */
export const GAL_UNIT_PER_M = 0.01;
/** Gallery metres → CameraRig metres (the rig assumes 1 unit = 1 km). */
const rigM = (m: number) => m * GAL_UNIT_PER_M * 1000;

/** A vehicle in a battery layout: metres from the site centre (x east, z south), heading in degrees. */
export interface LayoutSlot { id: VehicleId; x: number; z: number; headingDeg: number }

/** Display layouts (artist choice, not doctrine): vehicles tens of metres apart. */
export const SITE_LAYOUT: Readonly<Record<SystemId, readonly LayoutSlot[]>> = {
  sa6: [
    { id: 'sa6-str', x: 0, z: 0, headingDeg: 0 },
    { id: 'sa6-tel', x: 0, z: -42, headingDeg: 0 },
    { id: 'sa6-tel', x: 36, z: 21, headingDeg: 120 },
    { id: 'sa6-tel', x: -36, z: 21, headingDeg: 240 },
  ],
  sa8: [{ id: 'sa8', x: 0, z: 0, headingDeg: 30 }],
  sa11: [
    { id: 'sa11-sr', x: -32, z: 18, headingDeg: 340 },
    { id: 'sa11-cp', x: 28, z: 26, headingDeg: 20 },
    { id: 'sa11-telar', x: -22, z: -30, headingDeg: 350 },
    { id: 'sa11-telar', x: 26, z: -24, headingDeg: 15 },
  ],
  sa15: [{ id: 'sa15', x: 0, z: 0, headingDeg: 30 }],
  sa10: [
    { id: 'sa10-sr', x: -48, z: 30, headingDeg: 300 },
    { id: 'sa10-tr', x: 0, z: 0, headingDeg: 0 },
    { id: 'sa10-ln', x: 38, z: -28, headingDeg: 10 },
    { id: 'sa10-ln', x: -30, z: -40, headingDeg: 350 },
  ],
};

export interface GalleryOptions { reducedMotion: boolean; ariaLabel?: string }

export interface GalleryHandle {
  /** False when WebGL could not start (a text fallback is shown instead). */
  readonly ok: boolean;
  /** Show a battery; `focus` frames the first vehicle of that type. */
  show(system: SystemId, focus?: VehicleId): void;
  /** Radars transmitting: antennas turn, pulses and beams on. */
  setEmitting(on: boolean): void;
  dispose(): void;
}

interface Item {
  slot: LayoutSlot;
  group: Group;
  tag: Tag;
  /** Emitters only: expanding pulse and rotating beam. */
  pulse: Mesh<SphereGeometry, MeshBasicMaterial> | null;
  beam: Group | null;
  phase: number;
}

const PULSE_S = 2.2;
const BEAM_M = 60;

export function mountGallery(host: HTMLElement, opts: GalleryOptions): GalleryHandle {
  const label = opts.ariaLabel ?? 'SAM battery vehicles in 3D';
  if (!isWebGLAvailable()) {
    host.append(fallback('3D view unavailable: this browser could not start WebGL. The vehicle list below still applies.'));
    return { ok: false, show() {}, setEmitting() {}, dispose() {} };
  }
  let stage: Stage;
  try {
    stage = new Stage(host, {
      autoStart: !opts.reducedMotion,
      fov: 40,
      ariaLabel: label,
      environment: { surface: 'land', grid: false, hazeKm: 60, sunAzimuthDeg: 150, sunElevationDeg: 36 },
    });
  } catch {
    host.append(fallback('3D view unavailable: WebGL failed to start. The vehicle list below still applies.'));
    return { ok: false, show() {}, setEmitting() {}, dispose() {} };
  }

  const P = stage.palette;
  const root = new Group();
  root.name = 'harm-gallery';
  root.scale.setScalar(GAL_UNIT_PER_M);
  stage.scene.add(root);

  // Shared emission resources (geometry in metres, under the scaled root).
  const pulseGeo = new SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const beamGeo = new ConeGeometry(BEAM_M * Math.tan(0.07), BEAM_M, 18, 1, true);
  beamGeo.rotateX(Math.PI / 2); // apex (+y) → +z
  beamGeo.translate(0, 0, -BEAM_M / 2); // apex at the antenna, mouth opening toward −z
  const beamMat = new MeshBasicMaterial({
    color: P.caution.clone(), transparent: true, opacity: 0.06, depthWrite: false, side: DoubleSide, blending: AdditiveBlending, toneMapped: false,
  });

  const rig = new CameraRig(stage, {
    autoOrbit: opts.reducedMotion ? 0 : 2.5,
    focus: { x: 0, y: rigM(3), z: 0 },
    view: { headingDeg: 215, elevationDeg: 16, distance: rigM(110) },
  });
  rig.controls.minDistance = 8 * GAL_UNIT_PER_M;
  rig.controls.maxDistance = 400 * GAL_UNIT_PER_M;
  rig.controls.maxPolarAngle = Math.PI * 0.47;
  stage.camera.near = 0.01;
  stage.camera.updateProjectionMatrix();

  let items: Item[] = [];
  let system: SystemId | null = null;
  let emitting = true;
  let disposed = false;

  const clear = () => {
    for (const it of items) {
      it.tag.dispose();
      // The pulse sits on the root, not on the vehicle group: take it out of the scene too.
      it.pulse?.removeFromParent();
      it.pulse?.material.dispose();
      disposeVehicle(it.group);
    }
    items = [];
  };

  const build = (sys: SystemId) => {
    clear();
    system = sys;
    SITE_LAYOUT[sys].forEach((slot, i) => {
      const info = VEHICLE_INFO[slot.id];
      const [, , H] = VEHICLE_SIZE[slot.id];
      const group = buildVehicle(slot.id, P, { onReady: () => stage.requestRender() });
      group.position.set(slot.x, 0, slot.z);
      group.rotation.y = -(slot.headingDeg * Math.PI) / 180;
      root.add(group);
      const tag = new Tag(stage.labels, 'site', info.rwr ? 'red' : 'neutral');
      tag.set(info.name, '', info.rwr ? 'RWR ' + info.rwr : 'no radar');
      tag.obj.position.set(slot.x * GAL_UNIT_PER_M, (H + 1.2) * GAL_UNIT_PER_M, slot.z * GAL_UNIT_PER_M);
      let pulse: Item['pulse'] = null, beam: Group | null = null;
      if (info.rwr) {
        pulse = new Mesh(pulseGeo, new MeshBasicMaterial({
          color: P.caution.clone(), transparent: true, opacity: 0.15, depthWrite: false, side: DoubleSide, toneMapped: false,
        }));
        pulse.name = 'pulse';
        pulse.position.set(slot.x, 0.05, slot.z);
        root.add(pulse);
        beam = new Group();
        beam.name = 'beam';
        beam.position.y = H * 0.8;
        beam.rotation.order = 'YXZ'; // tilt up, then yaw with the antenna
        beam.rotation.x = 0.1;
        beam.add(new Mesh(beamGeo, beamMat));
        group.add(beam);
      }
      items.push({ slot, group, tag, pulse, beam, phase: i * 0.37 });
    });
    applyEmitting();
  };

  const applyEmitting = () => {
    for (const it of items) {
      const em = !!VEHICLE_INFO[it.slot.id].rwr;
      it.tag.setTone(em && emitting ? null : 'dim');
      if (it.pulse) it.pulse.visible = emitting;
      if (it.beam) it.beam.visible = emitting;
    }
    pose(stage.elapsed);
    stage.requestRender();
  };

  /** Antennas, beams and pulses at time t (s). */
  const pose = (t: number) => {
    const still = opts.reducedMotion;
    for (const it of items) {
      if (emitting && !still) animateVehicle(it.group, t + it.phase * 3);
      const spin = modelRig(it.group)?.spin[0];
      if (it.beam && spin) it.beam.rotation.y = yawIn(spin.obj, it.group);
      if (it.pulse) {
        const k = still ? 0.55 : ((t + it.phase) / PULSE_S) % 1;
        const r = VEHICLE_SIZE[it.slot.id][0] * (0.6 + k * 2.4);
        it.pulse.scale.set(r, r * 0.6, r);
        it.pulse.material.opacity = still ? 0.07 : 0.14 * (1 - k);
      }
    }
  };

  stage.onFrame((dt, t) => { if (!disposed && emitting && dt > 0) pose(t); }, { always: true });

  const frameOn = (focus?: VehicleId) => {
    const list = system ? SITE_LAYOUT[system] : [];
    const one = focus ? list.find(s => s.id === focus) : undefined;
    for (const it of items) it.tag.setSelected(!!one && it.slot === one);
    if (one) {
      const [L, , H] = VEHICLE_SIZE[one.id];
      rig.focusOn({ x: rigM(one.x), y: rigM(H * 0.45), z: rigM(one.z) }, { distance: rigM(Math.max(L * 2.4, 20)) });
      return;
    }
    rig.frame(list.map(s => ({ x: rigM(s.x), y: rigM(VEHICLE_SIZE[s.id][2] * 0.5), z: rigM(s.z) })), {
      follow: false, padding: 1.15, minRadius: rigM(12), elevationDeg: 18, fit: 'viewport',
    });
  };

  return {
    ok: true,
    show(sys: SystemId, focus?: VehicleId) {
      if (disposed) return;
      if (sys !== system) build(sys);
      frameOn(focus);
      stage.requestRender();
    },
    setEmitting(on: boolean) {
      if (disposed || on === emitting) return;
      emitting = on;
      applyEmitting();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      pulseGeo.dispose();
      beamGeo.dispose();
      beamMat.dispose();
      root.removeFromParent();
      stage.dispose(); // also disposes the CameraRig (tracked)
    },
  };
}

/** Yaw of `obj` relative to `ancestor` (sum of y rotations along the chain; antennas only yaw). */
function yawIn(obj: Object3D, ancestor: Object3D): number {
  let a = 0;
  for (let o: Object3D | null = obj; o && o !== ancestor; o = o.parent) a += o.rotation.y;
  return a;
}

function fallback(text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'harm-gallery__fallback';
  d.setAttribute('role', 'status');
  d.textContent = text;
  return d;
}
