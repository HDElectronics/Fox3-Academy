/**
 * Ground side of the sim: the terrain hook with its flat-ground fallback, ground units (targets), and
 * damage. Gameplay only: sizes are the Shkval target-size values S1 gives, hit points are trainer values.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { AgWeaponId } from '../data/types';
import type { EntityId, GroundUnit, GroundUnitKind, GroundUnitSpawnOptions, XYZ } from './types';
import { dirFrom } from './math';

/** Default size (m) per kind. S1: armour about 10 m, ships and buildings usually 60 m. Others are trainer values. */
export const GROUND_UNIT_SIZE: Record<GroundUnitKind, number> = {
  tank: 10, apc: 10, truck: 10, aaa: 10, 'sam-site': 10, bunker: 20, building: 60,
};

/** Trainer hit points: one guided hit kills anything but a building; cannon rounds do a fraction. */
export const GROUND_UNIT_HP: Record<GroundUnitKind, number> = {
  tank: 1, apc: 1, truck: 1, aaa: 1, 'sam-site': 1, bunker: 2, building: 2,
};

/** Ground height (m) at x, z: the terrain hook, or flat `world.groundAlt`. */
export function groundHeight(world: World, x: number, z: number): number {
  return world.terrain ? world.terrain.heightAt(x, z) : world.groundAlt;
}

/** Straight line of sight a→b over the terrain hook; on flat ground, true when both ends are above ground. */
export function lineOfSight(world: World, a: XYZ, b: XYZ): boolean {
  if (world.terrain) return world.terrain.lineOfSight(a, b);
  return Math.min(a.y, b.y) >= world.groundAlt - 0.5;
}

/**
 * Where a ray from `from` along the unit vector `dir` meets the ground, or null within `maxRange` (m).
 * Coarse march then bisection, so it works for any terrain hook.
 */
export function groundIntersect(world: World, from: XYZ, dir: XYZ, maxRange = 40000): Vector3 | null {
  if (!world.terrain) {
    if (dir.y >= -1e-6) return null;
    const s = (world.groundAlt - from.y) / dir.y;
    return s >= 0 && s <= maxRange ? new Vector3(from.x + dir.x * s, world.groundAlt, from.z + dir.z * s) : null;
  }
  const above = (s: number) => from.y + dir.y * s - groundHeight(world, from.x + dir.x * s, from.z + dir.z * s);
  let prev = 0;
  for (let s = 50; s <= maxRange + 50; s += 50) {
    const k = Math.min(s, maxRange);
    if (above(k) <= 0) {
      let lo = prev, hi = k;
      for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (above(mid) > 0) lo = mid; else hi = mid; }
      const x = from.x + dir.x * hi, z = from.z + dir.z * hi;
      return new Vector3(x, groundHeight(world, x, z), z);
    }
    prev = k;
    if (k === maxRange) break;
  }
  return null;
}

export function createGroundUnit(world: World, o: GroundUnitSpawnOptions): GroundUnit {
  const y = o.pos.y ?? groundHeight(world, o.pos.x, o.pos.z);
  return {
    id: o.id ?? world.uid('G'), kind: o.kind, side: o.side, name: o.name ?? o.kind,
    pos: new Vector3(o.pos.x, y, o.pos.z), heading: o.heading ?? 0, speed: o.speed ?? 0,
    sizeM: o.sizeM ?? GROUND_UNIT_SIZE[o.kind], hp: o.hp ?? GROUND_UNIT_HP[o.kind],
    alive: true, diedAt: null, killedBy: null, samSiteId: o.samSiteId,
  };
}

const tmp = new Vector3();

/** Move driving units along their heading, glued to the terrain. */
export function stepGroundUnits(world: World, dt: number): void {
  for (const u of world.groundUnits.values()) {
    if (!u.alive || u.speed <= 0) continue;
    u.pos.addScaledVector(dirFrom(u.heading, 0, tmp), u.speed * dt);
    u.pos.y = groundHeight(world, u.pos.x, u.pos.z);
  }
}

/** Velocity of a ground unit (m/s). */
export function groundUnitVel(u: GroundUnit, out = new Vector3()): Vector3 {
  return dirFrom(u.heading, 0, out).multiplyScalar(u.alive ? u.speed : 0);
}

/**
 * Apply `damage` hit points to a ground unit or a SAM site. Returns true when this killed it.
 * A unit linked to a SAM site takes the site with it, and the reverse.
 */
export function damageGround(world: World, id: EntityId, damage: number, by: EntityId | null, weapon: AgWeaponId | null): boolean {
  const u = world.groundUnits.get(id);
  if (u) {
    if (!u.alive) return false;
    u.hp -= damage;
    if (u.hp > 1e-9) return false;
    u.alive = false; u.speed = 0; u.diedAt = world.t; u.killedBy = by;
    world.emit({ t: world.t, type: 'ground-kill', targetId: u.id, by, weapon });
    if (u.samSiteId) killSite(world, u.samSiteId, by, weapon);
    return true;
  }
  if (world.samSites.has(id)) return killSite(world, id, by, weapon);
  return false;
}

function killSite(world: World, siteId: EntityId, by: EntityId | null, weapon: AgWeaponId | null): boolean {
  const s = world.samSites.get(siteId);
  if (!s || !s.alive) return false;
  s.alive = false; s.active = false; s.state = 'off'; s.targetId = null;
  world.emit({ t: world.t, type: 'ground-kill', targetId: s.id, by, weapon });
  for (const u of world.groundUnits.values()) {
    if (u.alive && u.samSiteId === siteId) damageGround(world, u.id, Infinity, by, weapon);
  }
  return true;
}
