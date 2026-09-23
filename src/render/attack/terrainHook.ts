/**
 * Ground-attack terrain setup: a seeded height field with flattened target pads, and the adapter that plugs it
 * into the sim as `world.terrain`. Pure (no three.js), unit-tested.
 */
import { createHeightField, heightAt, lineOfSight, type HeightField } from '../terrain/heightmap';
import type { TerrainHook } from '../../sim/types';

export interface AttackPad { x: number; z: number; radiusM: number }

export interface AttackFieldOptions {
  seed?: number;
  /** Square map side in metres (default 44000: an approach from 15 km stays on the map). */
  extentM?: number;
  segments?: number;
  maxReliefM?: number;
  /** Target areas flattened at their own height, in order. */
  pads?: readonly AttackPad[];
}

export function createAttackField(o: AttackFieldOptions = {}): HeightField {
  const field = createHeightField({ seed: o.seed ?? 25, extentM: o.extentM ?? 44000, segments: o.segments ?? 512, maxReliefM: o.maxReliefM ?? 380 });
  for (const p of o.pads ?? []) field.flatten(p.x, p.z, p.radiusM, heightAt(field, p.x, p.z));
  return field;
}

/**
 * Lift (m) applied to line-of-sight end points that sit on the ground. The height-field query treats a ray that
 * touches the terrain as blocked, while ground units sit exactly on it; the lift is about a vehicle's height.
 */
export const LOS_LIFT_M = 2;

/** `world.terrain` adapter for a height field. Line of sight lifts ground-level end points by LOS_LIFT_M. */
export function terrainHook(field: HeightField): TerrainHook {
  const hx = field.extentM.x / 2 - 1, hz = field.extentM.z / 2 - 1;
  const lift = (p: { x: number; y: number; z: number }) => {
    const x = Math.max(-hx, Math.min(hx, p.x)), z = Math.max(-hz, Math.min(hz, p.z));
    return { x, z, y: Math.max(p.y, heightAt(field, x, z) + LOS_LIFT_M) };
  };
  return {
    heightAt: (x, z) => heightAt(field, x, z),
    lineOfSight: (a, b) => lineOfSight(field, lift(a), lift(b)),
  };
}
