import { describe, it, expect } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { POD_FOV, podAim, setPodCamera } from './camera';
describe('ATFLIR 3D camera', () => {
  it('puts the tracked truck under the reticle even when acquisition begins off centre', () => {
    const camera = new PerspectiveCamera(38, 1.3, 0.001, 5);
    const aim = podAim({ x: 132, y: -60, tracked: 'assigned' });
    setPodCamera(camera, aim, POD_FOV[2]);
    expect(aim.x).toBeCloseTo(.14); expect(aim.z).toBeCloseTo(-.07);
    const projected = aim.clone().project(camera);
    expect(projected.x).toBeCloseTo(0); expect(projected.y).toBeCloseTo(0);
  });
  it('keeps slew coordinates consistent with the scene and exposes both trucks in the wide view', () => {
    const camera = new PerspectiveCamera(38, 1, 0.001, 5);
    setPodCamera(camera, podAim({ x: 0, y: 0, tracked: null }), POD_FOV[0]);
    for (const p of [new Vector3(.14, .002, -.07), new Vector3(-.14, .002, .03)]) {
      const q = p.project(camera); expect(Math.abs(q.x)).toBeLessThan(1); expect(Math.abs(q.y)).toBeLessThan(1);
    }
    const aim = podAim({ x: -100, y: 80, tracked: null });
    expect(aim.x).toBe(-.1); expect(aim.z).toBe(.08);
  });
});
