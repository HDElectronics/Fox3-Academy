import { expect, it } from 'vitest';
import { drawAcm, type AcmPicture } from './acmCues';
import type { Gfx } from './surface';
import type { Theme } from '../theme';

it('draws the outside-gimbal X inside the HUD even with the helmet looking 80° away', () => {
  const circles: number[][] = [], segments: number[][] = [];
  const gfx = {
    ink() { return this; }, dash() { return this; }, font() {}, text() {}, reset() {},
    circle(...args: number[]) { circles.push(args); }, segs(args: number[]) { segments.push(args); },
  };
  const pic: AcmPicture = {
    modeName: 'HELMET', cue: 'helmet', area: null, dashed: false, sensor: 'IRST', locked: null,
    seeker: { az: 0, el: 0, mode: 'caged', tone: 'none' }, fc3: true,
    helmet: { az: 80, el: 0, outside: true }, ready: false, missile: 'R-73',
  };
  drawAcm(gfx as unknown as Gfx, { sym: '#fff', symDim: '#888', symHi: '#fff' } as Theme,
    { X: az => 150 + 500 * Math.tan(az * Math.PI / 180), Y: el => 150 - el * 10,
      cx: 150, cy: 150, u: 2, box: { l: 10, r: 290, t: 10, b: 290 }, fs: 12, lineH: 15 }, pic);
  expect(circles).toHaveLength(1);
  expect(segments).toHaveLength(1); // the outside-gimbal X
  expect(circles[0]![0]).toBeGreaterThan(150);
  for (const coordinate of segments[0]!) {
    expect(coordinate).toBeGreaterThanOrEqual(10);
    expect(coordinate).toBeLessThanOrEqual(290);
  }
});
