import { projectArmHudPoint } from '../../ui/displays/su25tHud';

/** Trainer tolerance in projected HUD degrees, shared with the drawn emitter/cursor positions. */
const ARM_PICK_DEG = 3;

export function pickArmEmitter<T extends { id: string; xDeg: number; yDeg: number }>(
  marks: readonly T[], cursor: { xDeg: number; yDeg: number },
): T | null {
  const c = projectArmHudPoint(cursor);
  let best: T | null = null, distance = Infinity;
  for (const mark of marks) {
    const p = projectArmHudPoint(mark);
    const d = Math.hypot(p.xDeg - c.xDeg, p.yDeg - c.yDeg);
    if (d <= ARM_PICK_DEG && d < distance) { best = mark; distance = d; }
  }
  return best;
}
