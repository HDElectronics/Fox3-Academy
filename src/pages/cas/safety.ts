/**
 * [OWNER: page-cas] Friendly-safety and geometry rules for the CAS lessons, evaluated by the page from World events
 * (ag-impact, ground-kill). Trainer rules, labelled as such in the UI: DCS does not document how its AI JTAC judges
 * attacks (docs/research/cas-jtac.md), and nothing here models weapon effects.
 */
import type { World } from '../../sim/world';
import type { EntityId } from '../../sim/types';
import type { XZ } from './scenario';
import { DANGER_CLOSE_M } from './nineLine';

export { DANGER_CLOSE_M };

export type ImpactClass = 'on-target' | 'wrong-target' | 'fratricide' | 'danger-close' | 'miss';

export interface ImpactResult { cls: ImpactClass; nearestFriendlyM: number | null }

/** Horizontal distance (m) from a point to the nearest live-or-dead unit of the list. */
export function nearestM(world: World, ids: readonly EntityId[], p: XZ): number | null {
  let best: number | null = null;
  for (const id of ids) {
    const u = world.groundUnits.get(id); if (!u) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (best == null || d < best) best = d;
  }
  return best;
}

/**
 * Classify one impact: any friendly killed is fratricide; a briefed target killed is on target; another red unit
 * killed is the wrong target; otherwise an impact inside DANGER_CLOSE_M of a friendly is danger close, else a miss.
 */
export function classifyImpact(world: World, impact: { pos: readonly number[]; killed: readonly EntityId[] },
  sides: { targets: readonly EntityId[]; friendlies: readonly EntityId[] }): ImpactResult {
  const p = { x: impact.pos[0]!, z: impact.pos[2]! };
  const nearestFriendlyM = nearestM(world, sides.friendlies, p);
  const killed = new Set(impact.killed);
  const hit = (ids: readonly EntityId[]) => ids.some(id => killed.has(id));
  let cls: ImpactClass;
  if (hit(sides.friendlies)) cls = 'fratricide';
  else if (hit(sides.targets)) cls = 'on-target';
  else if ([...killed].some(id => world.groundUnits.get(id)?.side === 'red')) cls = 'wrong-target';
  else if (nearestFriendlyM != null && nearestFriendlyM < DANGER_CLOSE_M) cls = 'danger-close';
  else cls = 'miss';
  return { cls, nearestFriendlyM };
}

/** Degrees outside the allowed heading window [from, to] (clockwise), 0 inside it. */
export function headingErrorDeg(headingDeg: number, win: readonly [number, number]): number {
  const n = (d: number) => ((d % 360) + 360) % 360;
  const h = n(headingDeg), a = n(win[0]), b = n(win[1]);
  const span = n(b - a);
  if (n(h - a) <= span) return 0;
  return Math.min(n(a - h), n(h - b));
}
