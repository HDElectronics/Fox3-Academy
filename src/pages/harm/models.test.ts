/** [OWNER: page-harm] Vehicle and HARM art: builds, sizes, budgets, animation and cleanup (node, no WebGL). */
import { describe, expect, it } from 'vitest';
import { Box3, Color, Mesh, Vector3, type Object3D } from 'three';
import type { Palette } from '../../render/palette';
import {
  HARM_LENGTH_M, VEHICLE_IDS, VEHICLE_INFO, VEHICLE_SIZE, animateVehicle, buildHarm, buildVehicle, disposeVehicle, meshCount,
  modelRig, setHarmLost, setVehicleWreck, usesAsset,
} from './models';
import type { VehicleId } from './types';

const palette = new Proxy({}, { get: () => new Color(0.5, 0.5, 0.5) }) as Palette;
const ALL: VehicleId[] = ['sa6-str', 'sa6-tel', 'sa8', 'sa11-sr', 'sa11-telar', 'sa11-cp', 'sa15', 'sa10-sr', 'sa10-tr', 'sa10-ln'];

function bounds(o: Object3D): Box3 {
  o.updateMatrixWorld(true);
  return new Box3().setFromObject(o);
}

describe('HARM page vehicle models', () => {
  it('lists every vehicle with a name, and RWR symbols on the emitters', () => {
    expect([...VEHICLE_IDS].sort()).toEqual([...ALL].sort());
    for (const id of ALL) {
      expect(VEHICLE_INFO[id].name.length).toBeGreaterThan(3);
      expect(VEHICLE_SIZE[id].every(v => v > 0)).toBe(true);
    }
    expect(VEHICLE_INFO['sa6-str'].rwr).toBe('6');
    expect(VEHICLE_INFO['sa10-sr'].rwr).toBe('BB');
    expect(VEHICLE_INFO['sa11-sr'].rwr).toBe('SD');
    expect(VEHICLE_INFO['sa6-tel'].rwr).toBeNull();
    expect(VEHICLE_INFO['sa11-cp'].rwr).toBeNull();
    expect(VEHICLE_INFO['sa10-ln'].rwr).toBeNull();
  });

  it.each(ALL)('%s builds on the ground at about its size, within the mesh budget', id => {
    const g = buildVehicle(id, palette);
    const rig = modelRig(g);
    expect(rig).not.toBeNull();
    expect(meshCount(g)).toBeGreaterThan(0);
    expect(meshCount(g)).toBeLessThanOrEqual(18);
    const b = bounds(rig?.fallback ?? g);
    const size = b.getSize(new Vector3());
    expect(Math.abs(b.min.y)).toBeLessThan(0.05);
    const [L, W, H] = VEHICLE_INFO[id].dims ?? VEHICLE_SIZE[id];
    expect(size.z / L).toBeGreaterThan(0.65); expect(size.z / L).toBeLessThan(1.35);
    expect(size.x / W).toBeGreaterThan(0.65); expect(size.x / W).toBeLessThan(1.35);
    expect(size.y / H).toBeGreaterThan(0.65); expect(size.y / H).toBeLessThan(1.35);
    expect(!!rig?.asset).toBe(usesAsset(id));
    disposeVehicle(g);
    expect(modelRig(g)).toBeNull();
  });

  it('animates radar antennas and leaves wrecks still', () => {
    for (const id of ['sa6-str', 'sa8', 'sa11-sr', 'sa10-sr', 'sa10-tr', 'sa15'] as const) {
      const g = buildVehicle(id, palette);
      const spin = modelRig(g)?.spin ?? [];
      expect(spin.length).toBeGreaterThan(0);
      expect(() => animateVehicle(g, 1.3)).not.toThrow();
      const a = spin[0].obj.rotation.y;
      expect(a).not.toBe(0);
      setVehicleWreck(g, true);
      animateVehicle(g, 2.7);
      expect(spin[0].obj.rotation.y).toBe(a);
      g.traverse(o => { if (o instanceof Mesh && o.parent && o.parent !== modelRig(g)?.asset) expect(Array.isArray(o.material)).toBe(false); });
      setVehicleWreck(g, false);
      expect(modelRig(g)?.body.scale.y).toBe(1);
      disposeVehicle(g);
    }
    for (const id of ['sa6-tel', 'sa11-cp', 'sa10-ln'] as const) {
      const g = buildVehicle(id, palette);
      expect(modelRig(g)?.spin.length).toBe(0);
      expect(() => animateVehicle(g, 3)).not.toThrow();
      disposeVehicle(g);
    }
  });

  it('builds a 4.17 m HARM, nose toward −z, in one mesh', () => {
    const h = buildHarm(palette);
    const b = bounds(h);
    const size = b.getSize(new Vector3());
    expect(size.z).toBeCloseTo(HARM_LENGTH_M, 1);
    expect(b.min.z).toBeCloseTo(-HARM_LENGTH_M / 2, 1);
    expect(size.x).toBeLessThan(1.2);
    expect(meshCount(h)).toBe(1);
    setHarmLost(h, true);
    expect(modelRig(h)?.state).toBe(true);
    expect(() => animateVehicle(h, 1)).not.toThrow();
    disposeVehicle(h);
  });
});
