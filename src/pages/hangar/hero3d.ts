/**
 * Hangar hero: the selected jet at true size, high over a hazy sea, with its radar scan volume sweeping
 * ahead (render kit Stage + JetMesh + RadarVolume, synthetic scan from the jet's own radar spec).
 * The camera swings slowly behind the jet; the Stage pauses offscreen; reduced motion = one still frame.
 */
import { Vector3 } from 'three';
import {
  FramePriority, JET_DIMENSIONS, JetMesh, RadarVolume, Stage, f14SweepForMach, isWebGLAvailable, stepSyntheticScan,
} from '../../render';
import type { AircraftSpec } from '../../data/types';
import type { Units } from '../../app/format';
import { createRadarState } from '../../sim/radar';
import type { RadarState } from '../../sim/types';

const D2R = Math.PI / 180;
/** Hero altitude, km (scene units). */
const ALT_KM = 9.2;
const POS_M = { x: 0, y: ALT_KM * 1000, z: 0 };
/** Stylised volume length (m): a 20 m jet and a 70 km volume cannot share a frame. */
const VOLUME_M = 210;

export interface HeroScan { bar: number; bars: number; beamAzDeg: number }

export interface HeroHandle {
  /** True when WebGL started. */
  readonly ok: boolean;
  dispose(): void;
}

export interface HeroOptions {
  units: Units;
  reducedMotion: boolean;
  /** Called at ~8 Hz with the synthetic antenna position (for the viewport overlay). */
  onScan?: (s: HeroScan) => void;
}

export function mountHero(host: HTMLElement, spec: AircraftSpec, o: HeroOptions): HeroHandle {
  if (!isWebGLAvailable()) {
    host.append(fallback('3D view unavailable: this browser could not start WebGL. Everything below still applies.'));
    return { ok: false, dispose() {} };
  }
  let stage: Stage;
  try {
    stage = new Stage(host, {
      autoStart: !o.reducedMotion,
      labels: false,
      ariaLabel: `${spec.name} at altitude with its ${spec.radar.name} scan volume sweeping ahead`,
      environment: { clouds: { altitudeM: 2600, coverage: 0.3 }, sunAzimuthDeg: 200, sunElevationDeg: 38, hazeKm: 150 },
    });
  } catch {
    host.append(fallback('3D view unavailable: WebGL failed to start. Everything below still applies.'));
    return { ok: false, dispose() {} };
  }

  const jet = new JetMesh(spec.id, 'neutral', stage.palette);
  jet.scale.setScalar(0.001);
  jet.position.set(0, ALT_KM, 0);
  if (jet.hasSwingWing) jet.setSweep(f14SweepForMach(spec.perf.cruiseMach));
  stage.scene.add(jet);

  const scan: RadarState = createRadarState(spec);
  const vol = new RadarVolume(stage, spec.radar, { units: o.units, range: VOLUME_M, labels: false, coverageAt: [], opacity: 0.045 });

  const L = JET_DIMENSIONS[spec.id].length;
  const target = new Vector3();
  const cam = stage.camera;
  let lastScanOut = -1;
  let t0 = -1;

  // A still frame for reduced motion: beam part-way across the second bar.
  if (o.reducedMotion) {
    scan.bar = Math.min(1, scan.bars - 1);
    scan.beamAz = scan.azCenter + scan.azHalf * 0.3;
    scan.sweepDir = 1;
    stepSyntheticScan(scan, spec.radar, 0);
  }

  const place = (t: number) => {
    const aspect = stage.width / Math.max(1, stage.height);
    // Camera swings slowly between the jet's left and right rear quarters, never into the volume.
    const swing = o.reducedMotion ? 0.35 : Math.sin((t / 46) * Math.PI * 2);
    const headingDeg = 338 + swing * 26;
    const elevDeg = 22 + (o.reducedMotion ? 0 : Math.sin((t / 71) * Math.PI * 2) * 3);
    const wide = Math.max(0, scan.azHalf / D2R - 30) / 35;          // 0 at ±30°, ~1 at ±65°
    const small = stage.width < 600 ? 0.86 : 1;
    const dist = L * (2.55 + wide * 0.5) * small * Math.max(1, 1.35 / aspect) * 0.001;
    // Look at a point a little ahead of the nose so the volume opens into the frame.
    target.set(0, ALT_KM + L * 0.00008, -L * 0.00055);
    const h = headingDeg * D2R, e = elevDeg * D2R;
    cam.position.set(
      target.x - Math.sin(h) * Math.cos(e) * dist,
      target.y + Math.sin(e) * dist,
      target.z + Math.cos(h) * Math.cos(e) * dist,
    );
    cam.lookAt(target);
    cam.updateMatrixWorld();
  };

  stage.onFrame((dt, t) => {
    if (t0 < 0) t0 = t;
    const tt = t - t0;
    if (dt > 0) stepSyntheticScan(scan, spec.radar, dt);
    vol.update(scan, POS_M, 0);
    // A little life in the jet: slow roll and pitch wander, as if trimmed out in light air.
    if (!o.reducedMotion) {
      jet.rotation.set(Math.sin(tt * 0.37) * 0.012, 0, Math.sin(tt * 0.23) * 0.05, 'YXZ');
    }
    if (o.onScan && (tt - lastScanOut > 0.12 || lastScanOut < 0)) {
      lastScanOut = tt;
      o.onScan({ bar: scan.bar + 1, bars: scan.bars, beamAzDeg: Math.round((scan.beamAz * 180) / Math.PI) });
    }
  }, { priority: FramePriority.sim, always: true });
  stage.onFrame((_dt, t) => place(t0 < 0 ? 0 : t - t0), { priority: FramePriority.camera, always: true });
  stage.onResize(() => stage.requestRender());
  place(0);
  stage.requestRender();

  return {
    ok: true,
    dispose() { stage.dispose(); },
  };
}

function fallback(text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'hg-hero__fallback';
  d.textContent = text;
  return d;
}
