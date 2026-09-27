/** [OWNER: displays] Jam strobes and jam locks on the five radar formats: drawn, pickable, and never ranged. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DisplayFormat, FighterId } from '../../../data/types';
import type { RadarPicture } from '../../../sim/types';
import type { Theme } from '../../theme';
import { MissileClock } from '../glyphs';
import type { Gfx } from '../surface';
import { RadarDisplay } from '../radarDisplay';
import type { FrameCtx, FormatRenderer } from './common';
import { drawF15Vsd } from './f15Vsd';
import { drawMfd } from './mfd';
import { drawRuHud } from './ruHud';
import { drawTid } from './tid';
import { drawVtb } from './vtb';

const D = Math.PI / 180;

/** A no-op object: every method is recorded and returns the object (so `g.ink(...).dash(...)` chains). */
function recorder(calls: { name: string; args: unknown[] }[], overrides: Record<string, unknown> = {}): unknown {
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

const THEME = new Proxy({}, { get: (_t, p) => (p === 'cockpit' ? 'us' : `#${String(p).length.toString(16).padStart(6, '0')}`) }) as Theme;

function picture(aircraftType: FighterId, patch: Partial<RadarPicture> = {}): RadarPicture {
  return {
    t: 3.2, ownerId: 'own', aircraftType, units: 'imperial', ownHeading: 0,
    mode: 'rws', modeLabel: 'RWS', rangeScale: 148000, gimbalAz: 60 * D,
    scan: { azCenter: 0, azHalf: 60 * D, elCenter: 0, bars: 4, beamAz: 0, beamEl: 0, bar: 0, frameTime: 4 },
    altCoverage: { top: 10000, bottom: 2000, atRange: 40000 }, ownAlt: 6000, ownSpeed: 250,
    bricks: [], strobes: [], ownJamming: false, tracks: [], stt: null, weapon: null, dlz: null, shootCue: false,
    cueLabel: '', launchBlockedReason: '', missilesInFlight: [], cursor: { az: 0, range: 30000 }, ...patch,
  };
}

const STROBE = { key: 'jammer~1.000', targetId: 'jammer', az: 12 * D, el: 0, age: 0.5, fade: 0.9 };
/** A jam lock: range 37 km, altitude 7777 m and closure 321 m/s are placeholders that must never be drawn. */
const JAM_LOCK = { targetId: 'jammer', az: 12 * D, range: 37000, alt: 7777, aspectDeg: 33, closure: 321, lost: false, hoj: true };

function render(fn: FormatRenderer, format: DisplayFormat, pic: RadarPicture) {
  const calls: { name: string; args: unknown[] }[] = [];
  const ctx = recorder([]);
  const g = recorder(calls, { ctx, measure: () => 10 }) as Gfx;
  const size = 400;
  const f: FrameCtx = {
    g, th: THEME, S: size, W: size, H: size, u: size / 100, ox: 0, oy: 0, pic,
    units: pic.units, aircraft: pic.aircraftType, now: 0, hits: [], clock: new MissileClock(), ownHeading: 0,
    opts: { format, units: null, aircraft: null, nonFriendly: 'unknown', tidStab: 'aircraft', glow: 0, color: null, manualCursor: false },
  };
  fn(f);
  const texts = calls.filter(c => c.name === 'text' || c.name === 'boxText').map(c => String(c.args[0]));
  const draws = calls.filter(c => ['line', 'segs', 'poly', 'rect', 'circle', 'arc'].includes(c.name)).length;
  return { texts, draws, hits: f.hits };
}

const CASES: { name: string; fn: FormatRenderer; format: DisplayFormat; ac: FighterId; lockLabel: string | null }[] = [
  { name: 'F-15C VSD', fn: drawF15Vsd, format: 'f15-vsd', ac: 'f15c', lockLabel: 'HOJ' },
  { name: 'Su-27 HUD', fn: drawRuHud, format: 'ru-hud', ac: 'su27', lockLabel: 'АП' },
  { name: 'MiG-29S HUD', fn: drawRuHud, format: 'ru-hud', ac: 'mig29s', lockLabel: 'АП' },
  { name: 'Hornet radar', fn: drawMfd, format: 'mfd', ac: 'fa18c', lockLabel: 'AOJ' },
  { name: 'Viper FCR', fn: drawMfd, format: 'mfd', ac: 'f16c', lockLabel: 'HOJ' },
  { name: 'JF-17 radar', fn: drawMfd, format: 'mfd', ac: 'jf17', lockLabel: 'HOJ' },
  { name: 'F-14 TID', fn: drawTid, format: 'tid', ac: 'f14b', lockLabel: 'JAT' },
  { name: 'M-2000C VTB', fn: drawVtb, format: 'vtb', ac: 'm2000c', lockLabel: null },
];

describe.each(CASES)('$name jamming', ({ fn, format, ac, lockLabel }) => {
  it('draws a strobe and registers it as a pickable strobe', () => {
    const base = render(fn, format, picture(ac));
    const jam = render(fn, format, picture(ac, { strobes: [STROBE] }));
    expect(jam.draws).toBeGreaterThan(base.draws);
    expect(jam.hits.some(h => h.kind === 'strobe' && h.id === 'jammer')).toBe(true);
    expect(base.hits.some(h => h.kind === 'strobe')).toBe(false);
  });

  it('skips a strobe outside the gimbal on B-scopes', () => {
    if (format === 'tid') return;
    const jam = render(fn, format, picture(ac, { strobes: [{ ...STROBE, az: 80 * D }] }));
    expect(jam.hits.some(h => h.kind === 'strobe')).toBe(false);
  });

  it('draws a jam lock with its label and no range, altitude, aspect or closure', () => {
    const base = render(fn, format, picture(ac, { mode: 'stt', modeLabel: 'STT' }));
    const jam = render(fn, format, picture(ac, { mode: 'stt', modeLabel: 'STT', stt: JAM_LOCK }));
    const extra = jam.texts.filter(t => !base.texts.includes(t));
    expect(extra).toEqual(lockLabel ? [lockLabel] : []);
    expect(jam.draws).toBeGreaterThan(base.draws);
    expect(jam.hits.filter(h => h.id === 'jammer').map(h => h.kind)).toEqual(['stt']);
    for (const t of jam.texts) expect(t).not.toMatch(/37|7\.8|78|321|624/);
  });
});

describe('Russian HUD jam cue', () => {
  it('shows АП while a strobe is on screen, and flashes the strobe marks', () => {
    const on = render(drawRuHud, 'ru-hud', picture('su27', { strobes: [STROBE] }));
    expect(on.texts).toContain('АП');
    const frames = [3.0, 3.25, 3.5, 3.75].map(t => render(drawRuHud, 'ru-hud', picture('su27', { t, strobes: [STROBE] })).draws);
    expect(new Set(frames).size).toBeGreaterThan(1);
    expect(render(drawRuHud, 'ru-hud', picture('su27')).texts).not.toContain('АП');
  });
});

describe('RadarDisplay.pickDetail on a strobe', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns kind strobe', () => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#00ff00' }));
    const ctx = recorder([], { measureText: () => ({ width: 10 }) });
    const canvas = {
      width: 0, height: 0, style: {}, clientWidth: 400, clientHeight: 400,
      getContext: () => ctx, hasAttribute: () => true, setAttribute: () => undefined,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
    } as unknown as HTMLCanvasElement;
    const d = new RadarDisplay(canvas, { format: 'f15-vsd' });
    d.draw(picture('f15c', { strobes: [STROBE] }));
    const p = d.pickables().find(x => x.kind === 'strobe');
    expect(p).toBeDefined();
    expect(d.pickDetail(p!.x, p!.y)).toEqual({ targetId: 'jammer', kind: 'strobe' });
    d.dispose();
  });
});
