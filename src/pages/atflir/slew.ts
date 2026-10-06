/** Continuous held input, independent of keyboard auto-repeat. Rates are trainer tuning, not DCS measurements. */
export const SLEW_RATE = [32, 10, 2.5] as const;
export const SLEW_TAP = [1, .3, .08] as const;
export class SlewInput {
  private held = new Map<string, readonly [number, number]>();
  press(source: string, x: number, y: number): boolean {
    if (this.held.has(source)) return false;
    this.held.set(source, [x, y]); return true;
  }
  release(source: string): void { this.held.delete(source); }
  clear(): void { this.held.clear(); }
  step(dt: number, fov: number): [number, number] {
    let x = 0, y = 0;
    for (const v of this.held.values()) { x += v[0]; y += v[1]; }
    const length = Math.hypot(x, y);
    if (!length || !Number.isFinite(dt) || dt <= 0) return [0, 0];
    const distance = SLEW_RATE[fov] ?? SLEW_RATE[0];
    const scale = distance * Math.min(dt, .05) / length;
    return [x * scale, y * scale];
  }
}
