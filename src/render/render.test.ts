import { describe, expect, it } from 'vitest';
import { Box3, BufferAttribute, Frustum, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { dirFrom, D2R } from '../sim/math';
import { AIRCRAFT, AIRCRAFT_ORDER } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import type { MissileId } from '../data/types';
import {
  boostedScale, headingQuaternion, lerpAngle, orientationQuaternion, pxPerUnitAt, toMetres, toUnits, UNIT_PER_M,
} from './units';
import { altitudeCoverage, barElevation, coverageText, scanElevationLimits, stepSyntheticScan, type ScanStateLike } from './radarVolume';
import { RibbonGeometry } from './ribbon';
import { sampleIndex } from './replay';
import { f14SweepForMach, getJetModel, getMissileGeometry, JET_DIMENSIONS, smokeDensity } from './jets';
import { CameraRig, fitDistance, orbitBasis } from './cameras';
import type { Stage } from './stage';
import type { EntitySource } from './tactical';

const bbox = (g: { getAttribute(n: string): unknown }) => new Box3().setFromBufferAttribute(g.getAttribute('position') as BufferAttribute);

describe('units', () => {
  it('converts metres <-> km units', () => {
    const u = toUnits({ x: 1000, y: 9000, z: -45000 });
    expect(u.toArray()).toEqual([1, 9, -45]);
    expect(toMetres(u).toArray()).toEqual([1000, 9000, -45000]);
  });

  it('orients the model nose along the sim heading/pitch', () => {
    for (const [h, p] of [[0, 0], [90, 0], [200, 10], [315, -25]]) {
      const q = orientationQuaternion(h * D2R, p * D2R, 0);
      const nose = new Vector3(0, 0, -1).applyQuaternion(q);
      const want = dirFrom(h * D2R, p * D2R);
      expect(nose.distanceTo(want)).toBeLessThan(1e-6);
    }
  });

  it('positive roll puts the right wing down', () => {
    const q = orientationQuaternion(0, 0, 30 * D2R);
    const right = new Vector3(1, 0, 0).applyQuaternion(q);
    expect(right.y).toBeLessThan(-0.4);
    const qh = headingQuaternion(Math.PI / 2);
    expect(new Vector3(0, 0, -1).applyQuaternion(qh).x).toBeCloseTo(1, 6);
  });

  it('keeps a pixel floor far away and true size up close', () => {
    const far = pxPerUnitAt(100, 50, 900); // 100 km
    const s = boostedScale(far, 19, 40);
    expect(19 * s * far).toBeCloseTo(40, 6);
    const near = pxPerUnitAt(0.05, 50, 900); // 50 m
    expect(boostedScale(near, 19, 40)).toBe(UNIT_PER_M);
  });

  it('interpolates angles the short way', () => {
    expect(lerpAngle(350 * D2R, 10 * D2R, 0.5)).toBeCloseTo(360 * D2R, 6);
    expect(lerpAngle(10 * D2R, 350 * D2R, 0.5)).toBeCloseTo(0, 6);
  });
});

describe('radar volume maths', () => {
  it('computes the elevation band of a bar pattern', () => {
    const l = scanElevationLimits(0, 4, 2 * D2R, 3 * D2R);
    expect(l.hi / D2R).toBeCloseTo(4.5, 6);
    expect(l.lo / D2R).toBeCloseTo(-4.5, 6);
    expect(barElevation(0, 4, 0, 2 * D2R) / D2R).toBeCloseTo(3, 6); // bar 0 is the top bar
  });

  it('gives altitude coverage at range (flat earth, range × tan)', () => {
    const c = altitudeCoverage(9000, 50000, 5 * D2R, -5 * D2R);
    expect(c.top).toBeCloseTo(9000 + 50000 * Math.tan(5 * D2R), 3);
    expect(c.bottom).toBeCloseTo(9000 - 50000 * Math.tan(5 * D2R), 3);
    expect(coverageText(c.top, c.bottom, 50000, 'metric')).toBe('↑13.4 ↓4.6 km @50 km');
    expect(coverageText(12192, 3048, 55560, 'imperial')).toBe('↑40k ↓10k ft @30 nm');
  });

  it('sweeps the synthetic scan inside the limits and steps bars', () => {
    const spec = AIRCRAFT.f15c.radar;
    const s: ScanStateLike = { mode: 'rws', azCenter: 0, azHalf: 30 * D2R, elCenter: 0, bars: 2, rangeScale: 1, beamAz: 0, beamEl: 0, sweepDir: 1, bar: 0, cursor: { az: 0, range: 1 } };
    const bars = new Set<number>();
    for (let i = 0; i < 600; i++) {
      stepSyntheticScan(s, spec, 1 / 60);
      expect(Math.abs(s.beamAz)).toBeLessThanOrEqual(30 * D2R + 1e-9);
      bars.add(s.bar);
    }
    expect(bars.size).toBe(2);
  });
});

describe('ribbon buffer', () => {
  it('samples at the interval and keeps the head on the entity', () => {
    const r = new RibbonGeometry(16, 0.1);
    for (let i = 0; i <= 50; i++) r.track(i, 0, 0, i * 0.02);
    // 1 s of flight at 0.1 s → ~11 samples, head at the last position
    expect(r.count).toBeGreaterThanOrEqual(10);
    expect(r.count).toBeLessThanOrEqual(13);
    expect(r.lastTime).toBeCloseTo(1, 6);
    r.trimBefore(0.5);
    expect(r.firstTime).toBeGreaterThanOrEqual(0.39);
    r.track(0, 0, 0, 0.1); // time went backwards → cleared
    expect(r.count).toBe(1);
    r.dispose();
  });

  it('grows and keeps all samples', () => {
    const r = new RibbonGeometry(8, 0);
    for (let i = 0; i < 100; i++) r.push(i, 0, 0, i);
    expect(r.count).toBe(100);
    expect(r.lastTime).toBe(99);
    r.dispose();
  });

  it('shows a replay prefix with an interpolated head, then restores it', () => {
    const r = new RibbonGeometry(16, 0);
    for (let i = 0; i < 10; i++) r.push(i, 0, 0, i);
    r.setVisible(4, { x: 4.5, y: 0, z: 0, t: 4.5 });
    expect(r.geometry.drawRange.count).toBe(5 * 6);
    const pos = r.geometry.getAttribute('position') as BufferAttribute;
    expect(pos.getX(5 * 2)).toBeCloseTo(4.5, 6);
    r.setVisible(8);
    expect(pos.getX(5 * 2)).toBeCloseTo(5, 6);
    r.dispose();
  });
});

describe('replay sampling', () => {
  it('finds the last sample at or before t', () => {
    const t = [0, 0.25, 0.5, 0.75];
    expect(sampleIndex(t, -1)).toBe(-1);
    expect(sampleIndex(t, 0)).toBe(0);
    expect(sampleIndex(t, 0.3)).toBe(1);
    expect(sampleIndex(t, 0.75)).toBe(3);
    expect(sampleIndex(t, 9)).toBe(3);
  });
});

describe('models', () => {
  it('builds every jet with a plausible size and nose toward −z', () => {
    for (const id of AIRCRAFT_ORDER) {
      const m = getJetModel(id);
      const b = bbox(m.geometry);
      const len = b.max.z - b.min.z, span = b.max.x - b.min.x;
      const dim = JET_DIMENSIONS[id];
      expect(len, id).toBeGreaterThan(dim.length * 0.9);
      expect(len, id).toBeLessThan(dim.length * 1.12);
      if (id !== 'f14b') {
        expect(span, id).toBeGreaterThan(dim.span * 0.85);
        expect(span, id).toBeLessThan(dim.span * 1.15);
      }
      expect(Math.abs(b.min.z + dim.length / 2), id).toBeLessThan(0.6); // nose at −L/2
      expect(m.geometry.groups.length, id).toBeGreaterThanOrEqual(3);
    }
    const tomcat = getJetModel('f14b');
    expect(tomcat.swing).toBeDefined();
  });

  it('builds a missile for every MissileId sized from the data', () => {
    for (const id of Object.keys(MISSILES) as MissileId[]) {
      const b = bbox(getMissileGeometry(id));
      expect(b.max.z - b.min.z, id).toBeCloseTo(MISSILES[id].lengthM, 1);
    }
    expect(smokeDensity('aim54c')).toBeLessThan(smokeDensity('aim54a'));
  });

  it('schedules F-14 sweep with Mach', () => {
    expect(f14SweepForMach(0.3)).toBe(20);
    expect(f14SweepForMach(0.65)).toBeCloseTo(44, 6);
    expect(f14SweepForMach(1.2)).toBe(68);
  });
});

describe('camera rig', () => {
  /** Minimal Stage stand-in: a camera and a manual frame loop (no canvas: interactive false). */
  function fakeStage(aspect = 16 / 9) {
    const camera = new PerspectiveCamera(50, aspect, 0.01, 2000);
    const subs: ((dt: number, t: number) => void)[] = [];
    const stage = {
      camera, canvas: { addEventListener() {}, removeEventListener() {}, ownerDocument: null }, width: 1600, height: 900,
      onFrame(fn: (dt: number, t: number) => void) { subs.push(fn); return () => {}; },
      track() {}, untrack() {}, requestRender() {},
    };
    const step = (n: number) => { for (let i = 0; i < n; i++) for (const f of subs) f(1 / 60, 0); camera.updateMatrixWorld(); };
    return { stage: stage as unknown as Stage, camera, step };
  }
  function source(pos: Record<string, { x: number; y: number; z: number }>, heading = 0): EntitySource {
    return {
      positionOf(id: string, out: Vector3) { const p = pos[id]; if (!p) return false; out.set(p.x, p.y, p.z); return true; },
      orientationOf(_id: string, q: Quaternion) { q.identity(); return true; },
      headingOf() { return heading; },
      displayScaleOf() { return UNIT_PER_M; },
    } as unknown as EntitySource;
  }
  const inView = (cam: PerspectiveCamera, pM: { x: number; y: number; z: number }) => {
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const f = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    return f.containsPoint(new Vector3(pM.x, pM.y, pM.z).multiplyScalar(UNIT_PER_M));
  };

  it('builds an orthonormal orbit basis matching the look heading', () => {
    const f = new Vector3(), r = new Vector3(), u = new Vector3();
    orbitBasis(0, 0, f, r, u);
    expect(f.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-9); // heading 0 looks north (-z)
    expect(r.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-9);
    orbitBasis(123, 31, f, r, u);
    expect(f.dot(r)).toBeCloseTo(0);
    expect(f.dot(u)).toBeCloseTo(0);
    expect(u.y).toBeGreaterThan(0);
  });

  it('fits a long flat group to a wide viewport closer than a bounding sphere', () => {
    const f = new Vector3(), r = new Vector3(), u = new Vector3();
    orbitBasis(0, 0, f, r, u); // looking north, the group spreads east-west
    const pts = [new Vector3(-50, 0, 0), new Vector3(50, 0, 0)];
    const tanV = Math.tan((25 * Math.PI) / 180), tanH = tanV * (16 / 9);
    const d = fitDistance(pts.length, i => pts[i].clone(), f, r, u, tanH, tanV, 1, 0);
    const sphere = 50 / Math.sin(Math.atan(tanV));
    expect(d).toBeCloseTo(50 / tanH);
    expect(d).toBeLessThan(sphere * 0.6);
  });

  it('does not touch the canvas when not interactive, and auto-orbits', () => {
    const { stage, camera, step } = fakeStage();
    const rig = new CameraRig(stage, { interactive: false, autoOrbit: 30, focus: { x: 0, y: 9000, z: 0 }, view: { headingDeg: 0, elevationDeg: 10, distance: 20000 } });
    expect(rig.isInteractive).toBe(false);
    expect(rig.controls.domElement).toBeNull();
    const before = camera.position.clone();
    step(60); // one second at 30°/s
    const a0 = Math.atan2(before.x, before.z), a1 = Math.atan2(camera.position.x, camera.position.z);
    expect(Math.abs(((a1 - a0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)).toBeGreaterThan(0.3); // ≈ 0.52 rad
    rig.dispose(); // no DOM element: must not throw
  });

  it('padlock keeps both the jet and a lofted missile high above in frame', () => {
    const { stage, camera, step } = fakeStage(4 / 3);
    const jet = { x: 0, y: 6000, z: 0 };
    const threats = [
      { x: 1000, y: 22000, z: -25000 },  // lofted Fox 3 well above
      { x: -9000, y: 800, z: -20000 },   // shooter low, look-up from him
      { x: 0, y: 6000, z: 40000 },       // behind
    ];
    for (const threat of threats) {
      const rig = new CameraRig(stage, { interactive: false, source: source({ me: jet, bandit: threat }) });
      rig.setMode('chase', { focus: 'me', lookAt: 'bandit', instant: true, distance: 260 });
      step(120);
      expect(inView(camera, jet)).toBe(true);
      expect(inView(camera, threat)).toBe(true);
      rig.dispose();
    }
  });
});
