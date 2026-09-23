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
  it('gives every jet gear, flaps (not the M-2000C) and a speedbrake, all hidden by default', () => {
    for (const id of AIRCRAFT_ORDER) {
      const j = new JetMesh(id, 'blue', palette);
      expect(j.config).toEqual({ gear: 0, flaps: 0, speedbrake: 0 });
      expect(j.configParts).toEqual({ gear: true, flaps: id !== 'm2000c', speedbrake: true });
      expect(j.groundClearanceM).toBeGreaterThan(1);
      for (const c of j.children) if (c.name.startsWith('part:')) expect(c.visible).toBe(false);
    }
  });

  it('clamps to 0..1 and keeps missing or non-finite values', () => {
    for (const id of AIRCRAFT_ORDER) {
      const j = new JetMesh(id, 'blue', palette);
      j.setConfig({ gear: 2, flaps: -1, speedbrake: 0.5 });
      expect(j.config).toEqual({ gear: 1, flaps: 0, speedbrake: 0.5 });
      j.setConfig({ gear: Number.NaN, speedbrake: Infinity });
      expect(j.config).toEqual({ gear: 1, flaps: 0, speedbrake: 0.5 });
      j.setConfig({ flaps: 0.25 });
      expect(j.config).toEqual({ gear: 1, flaps: 0.25, speedbrake: 0.5 });
    }
  });

  it('hangs the wheels down to the ground clearance with the gear down', () => {
    for (const id of AIRCRAFT_ORDER) {
      const j = new JetMesh(id, 'blue', palette);
      const clean = visibleBounds(j).min.y;
      j.setConfig({ gear: 1 });
      const down = visibleBounds(j).min.y;
      expect(down, id).toBeCloseTo(-j.groundClearanceM, 1);
      expect(down, id).toBeLessThan(clean - 0.4);
      // Mirrored main legs sit symmetrically.
      const mains = parts(j, 'gearLeg').filter(m => m.position.x !== 0);
      expect(mains).toHaveLength(2);
      expect(mains[0].position.x).toBeCloseTo(-mains[1].position.x, 6);
      expect(parts(j, 'gearLeg').every(m => m.visible)).toBe(true);
      // Extended legs stand upright: each leg is taller than it is long or wide, wheel on the ground.
      for (const leg of parts(j, 'gearLeg')) {
        leg.geometry.computeBoundingBox();
        const b = leg.geometry.boundingBox!.clone().applyMatrix4(leg.matrixWorld);
        const h = b.max.y - b.min.y;
        expect(h, `${id} leg height`).toBeGreaterThan(b.max.z - b.min.z);
        expect(h, `${id} leg height`).toBeGreaterThan(b.max.x - b.min.x);
        expect(b.min.y, `${id} wheel on ground`).toBeCloseTo(-j.groundClearanceM, 1);
      }
    }
  });

  it('drops the flap trailing edges symmetrically on every jet with flaps', () => {
    for (const id of AIRCRAFT_ORDER.filter(a => a !== 'm2000c')) {
      const j = new JetMesh(id, 'blue', palette);
      j.setConfig({ flaps: 1 });
      const [r, l] = parts(j, 'flaps');
      expect(r.visible && l.visible, id).toBe(true);
      // A point aft of the hinge (trailing edge) moves down on both sides.
      const aft = new Vector3(0.5, 0, 0.6);
      const pr = aft.clone().applyQuaternion(r.quaternion);
      const pl = aft.clone().multiply(l.scale).applyQuaternion(l.quaternion);
      expect(pr.y, id).toBeLessThan(-0.2);
      expect(pl.y).toBeCloseTo(pr.y, 6);
    }
  });

  it('opens every speedbrake panel away from the fuselage', () => {
    for (const id of AIRCRAFT_ORDER) {
      const j = new JetMesh(id, 'blue', palette);
      j.setConfig({ speedbrake: 1 });
      const brakes = parts(j, 'brake');
      expect(brakes.length, id).toBeGreaterThan(0);
      // Each panel opens at least ~40 degrees at full travel.
      for (const b of brakes) {
        expect(b.visible).toBe(true);
        const tip = new Vector3(0, 0, 1).applyQuaternion(b.quaternion);
        expect(1 - tip.z, id).toBeGreaterThan(0.25);
      }
    }
    // Dorsal brakes rise.
    for (const id of ['fa18c', 'f15c', 'su27', 'su33', 'j11a'] as const) {
      const [b] = parts(new JetMesh(id, 'blue', palette), 'brake');
      const j = b.parent as JetMesh;
      j.setConfig({ speedbrake: 1 });
      expect(new Vector3(0, 0, 1).applyQuaternion(b.quaternion).y, id).toBeGreaterThan(0.5);
    }
    // JF-17 side brakes swing outboard on both sides.
    const jf = new JetMesh('jf17', 'blue', palette);
    jf.setConfig({ speedbrake: 1 });
    for (const b of parts(jf, 'brake')) {
      const tip = new Vector3(0, 0, 1).multiply(b.scale).applyQuaternion(b.quaternion);
      expect(Math.sign(tip.x)).toBe(Math.sign(b.position.x));
    }
  });

  it('hides the F-14 flaps while the wings are swept back', () => {
    const j = new JetMesh('f14b', 'blue', palette);
    j.setConfig({ flaps: 1 });
    expect(parts(j, 'flaps').every(m => m.visible)).toBe(true);
    j.setSweep(68);
    expect(parts(j, 'flaps').some(m => m.visible)).toBe(false);
    j.setSweep(20);
    expect(parts(j, 'flaps').every(m => m.visible)).toBe(true);
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
