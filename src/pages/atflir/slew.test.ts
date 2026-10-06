import { describe, expect, it } from 'vitest';
import { SLEW_TAP, SlewInput } from './slew';
describe('continuous ATFLIR slew input', () => {
  it('moves the same distance at different frame rates without repeated keydown', () => {
    const distance = (frames: number) => {
      const input = new SlewInput(); input.press('right', 1, 0);
      let x = 0; for (let i = 0; i < frames; i++) x += input.step(1 / frames, 0)[0]; return x;
    };
    expect(distance(30)).toBeCloseTo(32); expect(distance(120)).toBeCloseTo(32);
  });
  it('ignores auto-repeat presses and stops on release or focus loss', () => {
    const input = new SlewInput(); expect(input.press('right', 1, 0)).toBe(true);
    expect(input.press('right', 1, 0)).toBe(false); input.release('right'); expect(input.step(.02, 0)).toEqual([0, 0]);
    input.press('pointer1', 0, -1); input.clear(); expect(input.step(.02, 0)).toEqual([0, 0]);
  });
  it('normalizes diagonals, cancels opposites and keeps other sources held on release', () => {
    const input = new SlewInput(); input.press('right', 1, 0); input.press('up', 0, -1);
    expect(Math.hypot(...input.step(.05, 0))).toBeCloseTo(1.6);
    input.release('up'); input.press('left', -1, 0); expect(input.step(.02, 0)).toEqual([0, 0]);
    input.release('left'); expect(input.step(.02, 0)[0]).toBeGreaterThan(0);
  });
  it('uses small taps and finer rates when zoomed, with no jump after a suspended frame', () => {
    const input = new SlewInput(); input.press('right', 1, 0);
    expect(SLEW_TAP[0]).toBe(1); expect(SLEW_TAP[2]).toBeLessThan(.1);
    expect(input.step(5, 0)[0]).toBeCloseTo(1.6);
    expect(input.step(.02, 2)[0]).toBeLessThan(input.step(.02, 0)[0]);
  });
});
