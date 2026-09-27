/**
 * Target marks: the smoke, laser spot or IR pointer spot a JTAC puts on the ground (docs/research/cas-jtac.md).
 * Game level only: a mark is a point with a kind, a colour or a code, and a lifetime. Who can see it (eyes for
 * smoke, a laser spot tracker for the laser, NVGs for the IR pointer) is decided by the pages and the renderer.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { EntityId, GroundMark, MarkSpawnOptions } from './types';

/**
 * How long a smoke mark stays up (s). Trainer value, not verified: no ED source gives the built-in JTAC smoke
 * duration; community JTAC scripts refresh their smoke every 5 minutes.
 */
export const SMOKE_DURATION_S = 300;

export function createMark(world: World, o: MarkSpawnOptions): GroundMark {
  const y = o.pos.y ?? world.groundHeight(o.pos.x, o.pos.z);
  const duration = o.durationS !== undefined ? o.durationS : o.type === 'smoke' ? SMOKE_DURATION_S : null;
  return {
    kind: 'mark',
    id: o.id ?? world.uid('mark'),
    type: o.type,
    colour: o.type === 'smoke' ? o.colour ?? 'white' : null,
    side: o.side,
    ownerId: o.ownerId ?? null,
    pos: new Vector3(o.pos.x, y, o.pos.z),
    code: o.type === 'laser' ? o.code ?? null : null,
    t0: world.t,
    until: duration == null ? null : world.t + duration,
    alive: true,
  };
}

/** End a mark now and emit 'mark off'. No-op when it has already ended. */
export function endMark(world: World, id: EntityId): void {
  const m = world.marks.get(id);
  if (!m || !m.alive) return;
  m.alive = false;
  world.emit({ t: world.t, type: 'mark', markId: m.id, mark: m.type, what: 'off', ownerId: m.ownerId });
}

/** Expire marks at their end time, and end every mark whose owner unit has died. */
export function stepMarks(world: World): void {
  for (const m of world.marks.values()) {
    if (!m.alive) continue;
    const owner = m.ownerId ? world.groundUnits.get(m.ownerId) : undefined;
    if ((m.until != null && world.t >= m.until) || (owner && !owner.alive)) endMark(world, m.id);
  }
}

/** Live marks within `radiusM` (horizontal) of a point, nearest first. */
export function marksNear(world: World, p: { x: number; z: number }, radiusM: number): GroundMark[] {
  const d = (m: GroundMark) => Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
  return [...world.marks.values()].filter(m => m.alive && d(m) <= radiusM).sort((a, b) => d(a) - d(b));
}
