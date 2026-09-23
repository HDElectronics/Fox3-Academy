import { describe, expect, it } from 'vitest';
import { azToX, elToY, fmtSlantKm, targetFramePx } from './it23m';
import { hudAngles, hudModeLabel, rangeScaleKm } from './su25tHud';

describe('IT-23M overlay mapping', () => {
  it('maps the azimuth scale −40..+40 across and clamps', () => {
    expect(azToX(-40, 100, 500)).toBe(100);
    expect(azToX(0, 100, 500)).toBe(300);
    expect(azToX(40, 100, 500)).toBe(500);
    expect(azToX(70, 100, 500)).toBe(500);
  });
  it('maps the elevation scale +20 at the top to −90 at the bottom', () => {
    expect(elToY(20, 0, 110)).toBe(0);
    expect(elToY(0, 0, 110)).toBe(20);
    expect(elToY(-90, 0, 110)).toBe(110);
    expect(elToY(-120, 0, 110)).toBe(110);
  });
  it('sizes the target frame from the set size, range and field of view', () => {
    const w = targetFramePx(10, 8000, 0.97, 400);
    expect(w).toBeCloseTo((400 * 10) / (2 * 8000 * Math.tan((0.97 * Math.PI) / 360)), 3);
    expect(targetFramePx(60, 8000, 0.97, 400)).toBeGreaterThan(w);
    expect(targetFramePx(10, 8000, 22.3, 400)).toBe(8);
    expect(targetFramePx(10, null, 1, 400)).toBe(32);
    expect(fmtSlantKm(8449)).toBe('8.4');
  });
});

describe('Su-25T HUD helpers', () => {
  it('places a point in HUD degrees from the boresight (CCIP marker)', () => {
    const from = { x: 0, y: 1000, z: 0 };
    const a = hudAngles(from, 0, 0, { x: 0, y: 0, z: -1000 });
    expect(a.xDeg).toBeCloseTo(0, 6);
    expect(a.yDeg).toBeCloseTo(-45, 6);
    expect(hudAngles(from, 0, (-20 * Math.PI) / 180, { x: 0, y: 0, z: -1000 }).yDeg).toBeCloseTo(-25, 6);
    expect(hudAngles(from, 0, 0, { x: 100, y: 1000, z: -1000 }).xDeg).toBeGreaterThan(0);
    expect(hudAngles(from, Math.PI / 2, 0, { x: 1000, y: 1000, z: 100 }).xDeg).toBeGreaterThan(0);
  });
  it('labels the air-to-ground mode as S1 does', () => {
    expect(hudModeLabel('nav', false)).toBeNull();
    expect(hudModeLabel('ag', false)).toBe('ОПТ-ЗЕМЛЯ');
    expect(hudModeLabel('ag', true)).toBe('ЗЕМЛЯ');
  });
  it('rounds the range scale above the band and the current range', () => {
    expect(rangeScaleKm(10000, 13000)).toBe(15);
    expect(rangeScaleKm(4000, null)).toBe(5);
  });
});
