import { describe, expect, it } from 'vitest';
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { MAX_VIEW_ASPECT, horizontalFovDeg, viewFovDeg, wideViewZoom } from './viewFov';
import { vFovDeg } from './forwardView';
import { CameraRig } from './cameras';
import { UNIT_PER_M } from './units';
import type { Stage } from './stage';
import type { EntitySource } from './tactical';

/** Horizontal field of view (deg) a camera actually projects: angle between the left and right frustum edges. */
function projectedHFov(cam: PerspectiveCamera): number {
  cam.position.set(0, 0, 0);
  cam.rotation.set(0, 0, 0);
  cam.updateMatrixWorld();
  const r = new Vector3(1, 0, 0.5).unproject(cam);   // right edge, mid height
  return (2 * Math.atan2(r.x, -r.z) * 180) / Math.PI;
}

describe('wide viewport field of view', () => {
  it('leaves viewports up to the reference aspect alone', () => {
    for (const a of [0.6, 1, 4 / 3, 16 / 9, 2, MAX_VIEW_ASPECT]) {
      expect(wideViewZoom(a)).toBe(1);
      expect(viewFovDeg(50, a)).toBeCloseTo(50, 9);
    }
  });

  it('holds the horizontal field of view of the reference aspect on wider viewports', () => {
    const cap = horizontalFovDeg(50, MAX_VIEW_ASPECT);
    expect(cap).toBeGreaterThan(94);   // the ~2.3 : 1 lab view at 1440 × 900 keeps its picture
    expect(cap).toBeLessThan(97);
    for (const a of [2.5, 3, 3.6, 5, 10]) {
      const v = viewFovDeg(50, a);
      expect(v).toBeLessThan(50);
      expect(horizontalFovDeg(v, a)).toBeCloseTo(cap, 6);
    }
  });

  it('composes with any camera.fov a page sets (the zoom depends on the aspect only)', () => {
    for (const fov of [6, 26, 40, 50, 70]) {
      const cap = horizontalFovDeg(fov, MAX_VIEW_ASPECT);
      expect(horizontalFovDeg(viewFovDeg(fov, 3.6), 3.6)).toBeCloseTo(cap, 6);
    }
  });

  it('matches what three.js projects with camera.zoom = wideViewZoom', () => {
    for (const a of [1.5, 2.31, 3.64, 3.2]) {
      const cam = new PerspectiveCamera(50, a, 0.01, 100);
      cam.zoom = wideViewZoom(a);
      cam.updateProjectionMatrix();
      expect(cam.getEffectiveFOV()).toBeCloseTo(viewFovDeg(50, a), 9);
      expect(projectedHFov(cam)).toBeCloseTo(Math.min(horizontalFovDeg(50, a), horizontalFovDeg(50, MAX_VIEW_ASPECT)), 4);
    }
  });

  it('is the inverse of the forward view helper', () => {
    expect(horizontalFovDeg(vFovDeg(26, 2.2), 2.2)).toBeCloseTo(26, 9);
  });

  it('CameraRig.frame fits a group with the field actually on screen on an ultra-wide viewport', () => {
    // A 3.6 : 1 view (2560 × 1080 lab before the width cap): the Stage zooms, so the vertical field is ~36°, not 50°.
    const aspect = 3.6;
    const camera = new PerspectiveCamera(50, aspect, 0.01, 2000);
    camera.zoom = wideViewZoom(aspect);
    camera.updateProjectionMatrix();
    const stage = {
      camera, canvas: { addEventListener() {}, removeEventListener() {}, ownerDocument: null }, width: 2150, height: 597,
      onFrame() { return () => {}; }, track() {}, untrack() {}, requestRender() {},
    } as unknown as Stage;
    // A tall group seen level from the south: it fills the vertical field, the narrow one.
    const pts: Record<string, { x: number; y: number; z: number }> = { low: { x: 0, y: 1000, z: 0 }, high: { x: 0, y: 21000, z: 0 } };
    const source = {
      positionOf(id: string, out: Vector3) { const p = pts[id]; if (!p) return false; out.set(p.x, p.y, p.z); return true; },
      orientationOf(_id: string, q: { identity(): void }) { q.identity(); return true; },
      headingOf() { return 0; },
      displayScaleOf() { return UNIT_PER_M; },
    } as unknown as EntitySource;
    const rig = new CameraRig(stage, { interactive: false, source });
    rig.frame(['low', 'high'], { headingDeg: 0, elevationDeg: 0, padding: 1.1, follow: false, instant: true });
    camera.updateMatrixWorld();
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const p of Object.values(pts)) expect(frustum.containsPoint(new Vector3(p.x, p.y, p.z).multiplyScalar(UNIT_PER_M))).toBe(true);
    rig.dispose();
  });

  it('ignores bad input and can be switched off', () => {
    expect(wideViewZoom(0)).toBe(1);
    expect(wideViewZoom(NaN)).toBe(1);
    expect(wideViewZoom(5, Infinity)).toBe(1);
    expect(wideViewZoom(5, 0)).toBe(1);
  });
});
