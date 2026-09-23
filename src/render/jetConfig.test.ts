import { describe, expect, it } from 'vitest';
import { Box3, Color, Mesh, Vector3 } from 'three';
import { AIRCRAFT_ORDER } from '../data/aircraft';
import { JetMesh } from './jets';
import type { Palette } from './palette';
import { glidePoint } from './flightOps/approach';
import { runwayMarkings } from './flightOps/runway';

/** Every palette entry is a mid grey: enough for building materials without the DOM tokens. */
const palette = new Proxy({}, { get: () => new Color(0.5, 0.5, 0.5) }) as Palette;

const parts = (j: JetMesh, drive: string) => j.children.filter(c => c.name === 'part:' + drive) as Mesh[];

/** World-space bounds of the visible meshes (Box3.setFromObject ignores visibility). */
function visibleBounds(j: JetMesh): Box3 {
  j.updateMatrixWorld(true);
  const box = new Box3();
  j.traverse(o => {
    const m = o as Mesh;
    if (!m.isMesh || !m.visible) return;
    m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
  });
  return box;
}

describe('jet configuration parts', () => {
  it('defaults to gear up, flaps up, speedbrake in, with every part hidden', () => {
    for (const id of ['fa18c', 'f16c', 'f15c'] as const) {
      const j = new JetMesh(id, 'blue', palette);
      expect(j.config).toEqual({ gear: 0, flaps: 0, speedbrake: 0 });
      expect(j.configParts).toEqual({ gear: true, flaps: true, speedbrake: true });
      for (const c of j.children) if (c.name.startsWith('part:')) expect(c.visible).toBe(false);
    }
  });

  it('clamps to 0..1 and keeps missing or non-finite values', () => {
    const j = new JetMesh('fa18c', 'blue', palette);
    j.setConfig({ gear: 2, flaps: -1, speedbrake: 0.5 });
    expect(j.config).toEqual({ gear: 1, flaps: 0, speedbrake: 0.5 });
    j.setConfig({ gear: Number.NaN, speedbrake: Infinity });
    expect(j.config).toEqual({ gear: 1, flaps: 0, speedbrake: 0.5 });
    j.setConfig({ flaps: 0.25 });
    expect(j.config).toEqual({ gear: 1, flaps: 0.25, speedbrake: 0.5 });
  });

  it('hangs the wheels down to the ground clearance with the gear down', () => {
    for (const id of ['fa18c', 'f16c', 'f15c'] as const) {
      const j = new JetMesh(id, 'blue', palette);
      const clean = visibleBounds(j).min.y;
      j.setConfig({ gear: 1 });
      const down = visibleBounds(j).min.y;
      expect(down).toBeCloseTo(-j.groundClearanceM, 1);
      expect(down).toBeLessThan(clean - 0.5);
      // Mirrored main legs sit symmetrically.
      const mains = parts(j, 'gearLeg').filter(m => m.position.x !== 0);
      expect(mains).toHaveLength(2);
      expect(mains[0].position.x).toBeCloseTo(-mains[1].position.x, 6);
    }
  });

  it('drops the flap trailing edges symmetrically and raises the speedbrake', () => {
    const j = new JetMesh('fa18c', 'blue', palette);
    j.setConfig({ flaps: 1, speedbrake: 1 });
    const [r, l] = parts(j, 'flaps');
    expect(r.visible && l.visible).toBe(true);
    // A point aft of the hinge (trailing edge) moves down on both sides.
    const aft = new Vector3(0.5, 0, 0.6);
    const pr = aft.clone().applyQuaternion(r.quaternion);
    const pl = aft.clone().multiply(l.scale).applyQuaternion(l.quaternion);
    expect(pr.y).toBeLessThan(-0.2);
    expect(pl.y).toBeCloseTo(pr.y, 6);
    const [brake] = parts(j, 'brake');
    expect(new Vector3(0, 0, 1).applyQuaternion(brake.quaternion).y).toBeGreaterThan(0.5);
  });

  it('is a safe no-op on jets without parts and leaves their children unchanged', () => {
    for (const id of AIRCRAFT_ORDER.filter(a => a !== 'fa18c' && a !== 'f16c' && a !== 'f15c')) {
      const j = new JetMesh(id, 'red', palette);
      const n = j.children.length;
      expect(() => j.setConfig({ gear: 1, flaps: 1, speedbrake: 1 })).not.toThrow();
      expect(j.children.length).toBe(n);
      expect(j.configParts).toEqual({ gear: false, flaps: false, speedbrake: false });
      expect(j.groundClearanceM).toBe(0);
    }
  });
});

describe('flight-ops render geometry', () => {
  it('puts the glide path on the aim point and rising toward the approach', () => {
    const a = glidePoint(0, 3, 300);
    expect(a).toEqual({ x: 0, y: 0, z: -300 });
    const b = glidePoint(1852, 3, 300);
    expect(b.z).toBeCloseTo(1552, 6);
    expect(b.y).toBeCloseTo(1852 * Math.tan((3 * Math.PI) / 180), 6);
  });

  it('keeps runway markings on the runway and the aim blocks at the aim point', () => {
    const m = runwayMarkings(2500, 45, 300);
    for (const [x0, x1, z0, z1] of m) {
      expect(x0).toBeGreaterThanOrEqual(-22.5);
      expect(x1).toBeLessThanOrEqual(22.5);
      expect(z0).toBeGreaterThanOrEqual(-2500);
      expect(z1).toBeLessThanOrEqual(0);
    }
    expect(m.some(([x0, , z0, z1]) => x0 === 6 && (z0 + z1) / 2 === -300)).toBe(true);
  });
});
