/**
 * [OWNER: render] CCIP impact trail (trainer aid, not a DCS display): a ring on the ground where the selected
 * rockets, gun or bombs would land now (the HUD CCIP pipper's ground point), a fading trail of where that point has
 * been over the last seconds, and a faint line from the jet to it. It shows the pipper walking onto the target in a
 * dive. Drawn over the terrain in the overlay; pages hide it from the Shkval TV.
 */
import { Group } from 'three';
import type { Stage } from '../stage';
import { LineBatch } from '../lines';
import { Shape, SymbolLayer } from '../symbols';
import { ORDER } from '../shared';
import { UNIT_PER_M } from '../units';

/** Seconds of trail kept behind the current impact point. */
export const TRAIL_S = 4;

export interface TrailPoint { x: number; y: number; z: number; t: number }

/**
 * Keep the samples younger than `maxAgeS` at time `t` (a clock that went back clears the trail) and give each an
 * opacity that fades with age. Pure, for tests.
 */
export function trailSamples(pts: readonly TrailPoint[], t: number, maxAgeS = TRAIL_S): { p: TrailPoint; alpha: number }[] {
  const out: { p: TrailPoint; alpha: number }[] = [];
  for (const p of pts) {
    const age = t - p.t;
    if (age < 0 || age > maxAgeS) continue;
    out.push({ p, alpha: 0.85 * (1 - age / maxAgeS) });
  }
  return out;
}

export class ImpactTrail extends Group {
  private readonly lines: LineBatch;
  private readonly symbols: SymbolLayer;
  private pts: TrailPoint[] = [];
  private lastT = -Infinity;

  constructor(private readonly stage: Stage) {
    super();
    this.lines = new LineBatch(stage.shared, { capacity: 256, depthTest: false, renderOrder: ORDER.overlay });
    this.symbols = new SymbolLayer(stage.shared, { capacity: 8, depthTest: false, renderOrder: ORDER.overlay });
    this.add(this.lines, this.symbols);
    stage.scene.add(this);
  }

  /** Draw for sim time `t`: `impact` is the predicted ground point (null when there is no CCIP solution). */
  update(t: number, jet: { x: number; y: number; z: number } | null, impact: { x: number; y: number; z: number } | null): void {
    if (t < this.lastT) this.pts = [];
    this.lastT = t;
    if (impact && (!this.pts.length || t - this.pts[this.pts.length - 1]!.t >= 0.1)) this.pts.push({ x: impact.x, y: impact.y, z: impact.z, t });
    const kept = trailSamples(this.pts, t);
    this.pts = kept.map(k => k.p);
    const c = this.stage.palette.symHi, U = UNIT_PER_M, lift = 2;
    this.lines.reset();
    for (let i = 1; i < kept.length; i++) {
      const a = kept[i - 1]!, b = kept[i]!;
      this.lines.seg(a.p.x * U, (a.p.y + lift) * U, a.p.z * U, b.p.x * U, (b.p.y + lift) * U, b.p.z * U,
        c.r, c.g, c.b, a.alpha, c.r, c.g, c.b, b.alpha, 2, 0, 0, 1);
    }
    if (impact && jet) {
      this.lines.seg(jet.x * U, jet.y * U, jet.z * U, impact.x * U, (impact.y + lift) * U, impact.z * U,
        c.r, c.g, c.b, 0.05, c.r, c.g, c.b, 0.45, 1, 6, 0, 0.5);
    }
    this.lines.commit();
    this.symbols.reset();
    if (impact) {
      this.symbols.put(impact.x * U, (impact.y + lift) * U, impact.z * U, Shape.ring, 16, c, 0.95);
      this.symbols.put(impact.x * U, (impact.y + lift) * U, impact.z * U, Shape.dot, 4, c, 0.95);
    }
    this.symbols.commit();
  }

  reset(): void { this.pts = []; this.lastT = -Infinity; this.update(0, null, null); }

  override dispose(): void {
    this.stage.scene.remove(this);
    this.lines.dispose();
    this.symbols.dispose();
  }
}
