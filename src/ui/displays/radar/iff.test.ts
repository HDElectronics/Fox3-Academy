/** [OWNER: displays] IFF cues on the five radar formats: each draws its own friendly cue, and only from own IFF. */
import { describe, expect, it } from 'vitest';
import type { DisplayFormat, FighterId } from '../../../data/types';
import type { RadarPicture } from '../../../sim/types';
import type { Theme } from '../../theme';
import { MissileClock } from '../glyphs';
import type { Gfx } from '../surface';
import type { FormatRenderer, FrameCtx, PicBrick, PicTrack } from './common';
import { drawF15Vsd } from './f15Vsd';
import { drawMfd, viperIffAlpha } from './mfd';
import { drawRuHud } from './ruHud';
import { drawTid } from './tid';
import { drawVtb } from './vtb';

const D = Math.PI / 180;

type Call = { name: string; args: unknown[] };

/** Records every Gfx call and returns itself, so `g.ink(...).dash(...)` chains. */
function recorder(calls: Call[], overrides: Record<string, unknown> = {}): unknown {
  const store: Record<string | symbol, unknown> = { ...overrides };
  const self: unknown = new Proxy({}, {
    get(_t, p) {
      if (p in store) return store[p];
      if (p === 'then') return undefined;
      return (...args: unknown[]) => { calls.push({ name: String(p), args }); return self; };
    },
    set(_t, p, v) { store[p] = v; return true; },
  });
  return self;
}

/** Each token resolves to '#<name>', so the tests can tell which token a symbol used. */
const THEME = new Proxy({}, { get: (_t, p) => (p === 'cockpit' ? 'us' : `#${String(p)}`) }) as Theme;

const track = (patch: Partial<PicTrack> = {}): PicTrack => ({
  targetId: 'c1', label: 'T1', az: 5 * D, range: 40000, alt: 7000, relHeading: Math.PI, speed: 250, aspectDeg: 10,
  closure: 480, firm: true, coasting: false, designation: null, designationIndex: -1, locked: false, friendly: false,
  missiles: [], ...patch,
});
const brick = (patch: Partial<PicBrick> = {}): PicBrick => ({
  key: 'b1', targetId: 'b1', az: -10 * D, range: 50000, alt: 6000, age: 0.2, fade: 1, ...patch,
});

function picture(aircraftType: FighterId, patch: Partial<RadarPicture> = {}): RadarPicture {
  return {
    t: 3.2, ownerId: 'own', aircraftType, units: 'imperial', ownHeading: 0,
    mode: 'tws', modeLabel: 'TWS', rangeScale: 148000, gimbalAz: 60 * D,
    scan: { azCenter: 0, azHalf: 60 * D, elCenter: 0, bars: 4, beamAz: 0, beamEl: 0, bar: 0, frameTime: 4 },
    altCoverage: { top: 10000, bottom: 2000, atRange: 40000 }, ownAlt: 6000, ownSpeed: 250,
    bricks: [], strobes: [], ownJamming: false, tracks: [], stt: null, weapon: null, dlz: null, shootCue: false,
    cueLabel: '', launchBlockedReason: '', missilesInFlight: [], cursor: { az: -40 * D, range: 30000 }, ...patch,
  };
}

function render(fn: FormatRenderer, format: DisplayFormat, pic: RadarPicture) {
  const calls: Call[] = [];
  const g = recorder(calls, { ctx: recorder([]), measure: () => 10 }) as Gfx;
  const size = 400;
  const f: FrameCtx = {
    g, th: THEME, S: size, W: size, H: size, u: size / 100, ox: 0, oy: 0, pic,
    units: pic.units, aircraft: pic.aircraftType, now: 0, hits: [], clock: new MissileClock(), ownHeading: 0,
    opts: { format, units: null, aircraft: null, nonFriendly: 'unknown', tidStab: 'aircraft', glow: 0, color: null, manualCursor: true },
  };
  fn(f);
  const count = (name: string, pred: (c: Call) => boolean = () => true) => calls.filter(c => c.name === name && pred(c)).length;
  const texts = calls.filter(c => c.name === 'text').map(c => String(c.args[0]));
  const inks = calls.filter(c => c.name === 'ink').map(c => String(c.args[0]));
  return { calls, count, texts, inks };
}

describe('F-15C VSD IFF (automatic): circle for a friend, rectangle for everything else', () => {
  const circles = (pic: RadarPicture) => render(drawF15Vsd, 'f15-vsd', pic).count('circle');
  const base = circles(picture('f15c'));

  it('draws a friendly brick as a circle and an ordinary brick without one', () => {
    expect(circles(picture('f15c', { bricks: [brick({ friendly: true })] }))).toBe(base + 1);
    expect(circles(picture('f15c', { bricks: [brick()] }))).toBe(base);
  });

  it('draws a friendly track as a circle; an unidentified friend (friendly false) as a rectangle', () => {
    expect(circles(picture('f15c', { tracks: [track({ friendly: true })] }))).toBe(base + 1);
    expect(circles(picture('f15c', { tracks: [track()] }))).toBe(base);
  });

  it('keeps the STT ring on a locked friend', () => {
    const pic = picture('f15c', { mode: 'stt', tracks: [track({ friendly: true, locked: true })] });
    expect(render(drawF15Vsd, 'f15-vsd', pic).count('circle')).toBe(circles(picture('f15c', { mode: 'stt' })) + 2);
  });
});

describe('FC3 HUD IFF (automatic): a second row of dots', () => {
  const dots = (pic: RadarPicture) => render(drawRuHud, 'ru-hud', pic).count('circle', c => c.args[3] === true);

  it.each(['su27', 'mig29s'] as const)('%s: friendly brick and track get four dots, others two', ac => {
    expect(dots(picture(ac, { bricks: [brick({ friendly: true })] }))).toBe(4);
    expect(dots(picture(ac, { bricks: [brick()] }))).toBe(2);
    expect(dots(picture(ac, { tracks: [track({ friendly: true })] }))).toBe(4);
    expect(dots(picture(ac, { tracks: [track()] }))).toBe(2);
  });
});

describe('Hornet HAFU IFF: hemisphere for a friend, unknown bracket otherwise', () => {
  it('draws the friendly hemisphere only for an IFF friend', () => {
    const friend = render(drawMfd, 'mfd', picture('fa18c', { tracks: [track({ friendly: true, iff: { reply: 'friend', age: 1 } })] }));
    expect(friend.count('arc')).toBe(1);
    const noReply = render(drawMfd, 'mfd', picture('fa18c', { tracks: [track({ iff: { reply: 'no-reply', age: 1 } })] }));
    expect(noReply.count('arc')).toBe(0);
    // No reply is still unknown (bracket), never hostile: two factors are needed for hostile.
    expect(noReply.inks).not.toContain('#hostile');
    expect(render(drawMfd, 'mfd', picture('fa18c', { tracks: [track()] })).count('arc')).toBe(0);
  });
});

describe('Viper IFF: green circle with 4 for 2 s', () => {
  const texts = (t: PicTrack) => render(drawMfd, 'mfd', picture('f16c', { tracks: [t] })).texts;

  it('shows the 4 only with a fresh friend reply', () => {
    expect(texts(track({ friendly: true, iff: { reply: 'friend', age: 0.5 } }))).toContain('4');
    expect(texts(track({ friendly: true, iff: { reply: 'friend', age: 2.5 } }))).not.toContain('4');
    expect(texts(track({ iff: { reply: 'no-reply', age: 0.5 } }))).not.toContain('4');
    expect(texts(track())).not.toContain('4');
  });

  it('draws the mark in the ok (green) token and leaves the track symbol unchanged', () => {
    const r = render(drawMfd, 'mfd', picture('f16c', { tracks: [track({ friendly: true, iff: { reply: 'friend', age: 0.5 } })] }));
    expect(r.inks).toContain('#ok');
    expect(r.count('poly')).toBe(render(drawMfd, 'mfd', picture('f16c', { tracks: [track()] })).count('poly'));
  });

  it('fades the mark out by 2 s', () => {
    expect(viperIffAlpha(0)).toBe(1);
    expect(viperIffAlpha(1.2)).toBe(1);
    expect(viperIffAlpha(1.8)).toBeLessThan(1);
    expect(viperIffAlpha(1.8)).toBeGreaterThan(0);
    expect(viperIffAlpha(2.01)).toBe(0);
  });
});

describe('JF-17 IFF (community): green friend, red no reply', () => {
  const inks = (t: PicTrack) => render(drawMfd, 'mfd', picture('jf17', { tracks: [t] })).inks;

  it('colours a friend ok, a no-reply warning, and leaves an uninterrogated contact plain', () => {
    expect(inks(track({ friendly: true, iff: { reply: 'friend', age: 1 } }))).toContain('#ok');
    const red = inks(track({ iff: { reply: 'no-reply', age: 1 } }));
    expect(red).toContain('#warning');
    expect(red).not.toContain('#ok');
    const plain = inks(track());
    expect(plain).not.toContain('#warning');
    expect(plain).not.toContain('#ok');
  });

  it('colours a friendly brick ok', () => {
    expect(render(drawMfd, 'mfd', picture('jf17', { bricks: [brick({ friendly: true })] })).inks).toContain('#ok');
    expect(render(drawMfd, 'mfd', picture('jf17', { bricks: [brick()] })).inks).not.toContain('#ok');
  });
});

describe('F-14 TID IFF: friendly symbol ∩', () => {
  const arcs = (pic: RadarPicture) => render(drawTid, 'tid', pic).count('arc');

  it('draws ∩ for a friendly track and brick, the unknown symbol otherwise', () => {
    expect(arcs(picture('f14b', { tracks: [track({ friendly: true, iff: { reply: 'friend', age: 1 } })] }))).toBe(1);
    expect(arcs(picture('f14b', { tracks: [track()] }))).toBe(0);
    expect(arcs(picture('f14b', { bricks: [brick({ friendly: true })] }))).toBe(1);
    expect(arcs(picture('f14b', { bricks: [brick()] }))).toBe(0);
  });
});

describe('M-2000C VTB IFF: A (ami)', () => {
  it('marks a friendly track with A and an unidentified friend with nothing', () => {
    expect(render(drawVtb, 'vtb', picture('m2000c', { tracks: [track({ friendly: true })] })).texts).toContain('A');
    expect(render(drawVtb, 'vtb', picture('m2000c', { tracks: [track()] })).texts).not.toContain('A');
  });

  it('puts the A in the STT data block for a locked friend', () => {
    const stt = { targetId: 'c1', az: 5 * D, range: 40000, alt: 7000, aspectDeg: 10, closure: 480, lost: false, hoj: false };
    const r = render(drawVtb, 'vtb', picture('m2000c', { mode: 'stt', stt, tracks: [track({ friendly: true, locked: true })] }));
    expect(r.texts).not.toContain('A');
    expect(r.texts.some(t => / {2}A$/.test(t))).toBe(true);
    const foe = render(drawVtb, 'vtb', picture('m2000c', { mode: 'stt', stt, tracks: [track({ locked: true })] }));
    expect(foe.texts.some(t => / {2}A$/.test(t))).toBe(false);
  });
});
