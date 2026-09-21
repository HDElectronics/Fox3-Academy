import { describe, expect, it, vi } from 'vitest';
import type { RadarPicture } from '../../../sim/types';
import type { Theme } from '../../theme';
import { MissileClock } from '../glyphs';
import type { Gfx } from '../surface';
import type { FrameCtx, PicTrack } from './common';
import { drawRuHud } from './ruHud';

const track = (patch: Partial<PicTrack> = {}): PicTrack => ({
  targetId: 'contact', label: '1', az: 0, range: 40000, alt: 6000, relHeading: 0,
  speed: 250, aspectDeg: 0, closure: 500, firm: false, coasting: false,
  designation: null, designationIndex: -1, locked: false, friendly: false, missiles: [], ...patch,
});

function render(size: number, patch: Partial<RadarPicture> = {}) {
  const circle = vi.fn<(x: number, y: number, radius: number, fill?: boolean) => void>();
  const g = { circle, ink: vi.fn(), segs: vi.fn(), font: vi.fn(), text: vi.fn(),
    reset: vi.fn(), line: vi.fn(), poly: vi.fn() } as unknown as Gfx;
  const pic: RadarPicture = {
    t: 0, ownerId: 'own', aircraftType: 'su27', units: 'metric', ownHeading: 0,
    mode: 'tws', modeLabel: 'СНП', rangeScale: 80000, gimbalAz: Math.PI / 3,
    scan: { azCenter: 0, azHalf: Math.PI / 6, elCenter: 0, bars: 4, beamAz: 0, beamEl: 0, bar: 0, frameTime: 4 },
    altCoverage: { top: 10000, bottom: 2000, atRange: 40000 }, ownAlt: 6000, ownSpeed: 250,
    bricks: [], tracks: [track()], stt: null, weapon: null, dlz: null, shootCue: false,
    cueLabel: '', launchBlockedReason: '', missilesInFlight: [], cursor: { az: 0, range: 30000 }, ...patch,
  };
  const f: FrameCtx = {
    g, th: { sym: '#00ff00', symHi: '#ccffcc' } as Theme,
    S: size, W: size, H: size, u: size / 100, ox: 0, oy: 0, pic,
    units: 'metric', aircraft: pic.aircraftType, now: 0, hits: [], clock: new MissileClock(), ownHeading: null,
    opts: { format: 'ru-hud', units: null, aircraft: null, nonFriendly: 'unknown', tidStab: 'aircraft',
      glow: 0, color: null, manualCursor: true },
  };
  const mapping = drawRuHud(f);
  return { circles: circle.mock.calls, dots: circle.mock.calls.filter(call => call[3] === true), f, mapping };
}

describe('Russian HUD contact readability', () => {
  it.each(['brick', 'track', 'locked-track', 'standalone-stt'] as const)(
    'keeps %s dots visible and separated in a 230px bezel', state => {
      const target = track({ locked: state === 'locked-track' });
      const { dots, f, mapping } = render(230, {
        tracks: state === 'track' || state === 'locked-track' ? [target] : [],
        bricks: state === 'brick' ? [{ key: 'return', targetId: 'contact', az: 0, range: 40000, alt: 6000, age: 0, fade: 1 }] : [],
        stt: state === 'standalone-stt' ? { targetId: 'contact', az: 0, range: 40000, alt: 6000, aspectDeg: 0, closure: 500, lost: false } : null,
      });
      expect(dots).toHaveLength(2);
      const [left, right] = dots;
      // A 3.5px minimum diameter addresses the original 2.53px marks at this size.
      expect(left[2] * 2).toBeGreaterThanOrEqual(3.5);
      expect(right[0] - left[0] - left[2] - right[2]).toBeGreaterThan(1);
      const center = mapping.toScreen(0, 40000);
      expect((left[0] + right[0]) / 2).toBeCloseTo(center.x);
      expect(left[1]).toBeCloseTo(center.y);
      expect(f.hits[0]).toMatchObject({ id: 'contact', x: center.x, y: center.y });
    },
  );

  it.each([160, 230, 320, 460])('preserves the distinct friendly IFF row at %ipx', size => {
    const { dots } = render(size, { tracks: [track({ friendly: true })] });
    expect(dots).toHaveLength(4);
    const [left, right, upperLeft, upperRight] = dots;
    expect(upperLeft[0]).toBe(left[0]);
    expect(upperRight[0]).toBe(right[0]);
    expect(left[1] - upperLeft[1]).toBeGreaterThan(left[2] * 2);
    expect(dots.every(dot => dot[2] === left[2])).toBe(true);
  });

  it('bounds the small-display boost and retains proportional sizing on larger displays', () => {
    expect(render(160).dots[0][2]).toBeLessThanOrEqual(0.55 * 1.6 * 1.5);
    for (const size of [320, 460, 800]) {
      const [left, right] = render(size).dots;
      expect(left[2]).toBeCloseTo(0.55 * size / 100);
      expect(right[0] - left[0]).toBeCloseTo(1.7 * size / 100);
    }
  });

  it('does not turn the enlarged contact row into a lock cue', () => {
    expect(render(230).circles.every(circle => circle[3] === true)).toBe(true);
    const locked = render(230, { tracks: [track({ locked: true })] });
    expect(locked.circles.filter(circle => circle[3] !== true)).toHaveLength(1);
    expect(locked.dots).toHaveLength(2);
  });
});
