/** [OWNER: displays] Datalink picture on the radar formats (docs/research/ecm-datalink-iff.md §2). */
import { describe, expect, it } from 'vitest';
import type { DisplayFormat, FighterId } from '../../../data/types';
import type { RadarPicture } from '../../../sim/types';
import type { Theme } from '../../theme';
import { MissileClock } from '../glyphs';
import type { Gfx } from '../surface';
import { dlAlpha, type FormatRenderer, type FrameCtx, type PicBrick, type PicDatalink, type PicTrack } from './common';
import { drawF15Vsd } from './f15Vsd';
import { drawMfd, hafuTop } from './mfd';
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
    bricks: [], strobes: [], ownJamming: false, datalink: [], tracks: [], stt: null, weapon: null, dlz: null, shootCue: false,
    cueLabel: '', launchBlockedReason: '', missilesInFlight: [], cursor: { az: -40 * D, range: 30000 }, ...patch,
  };
}

const dl = (patch: Partial<PicDatalink> = {}): PicDatalink => ({
  key: 'awacs:d1', targetId: 'd1', az: -20 * D, range: 60000, alt: 8000, relHeading: Math.PI, speed: 250,
  source: 'awacs', donorLabel: null, sovereignty: 'hostile', correlated: false, age: 1, ...patch,
});

function render(fn: FormatRenderer, format: DisplayFormat, pic: RadarPicture, color: boolean | null = null) {
  const calls: Call[] = [];
  const g = recorder(calls, { ctx: recorder([]), measure: () => 10 }) as Gfx;
  const size = 400;
  const f: FrameCtx = {
    g, th: THEME, S: size, W: size, H: size, u: size / 100, ox: 0, oy: 0, pic,
    units: pic.units, aircraft: pic.aircraftType, now: 0, hits: [], clock: new MissileClock(), ownHeading: 0,
    opts: { format, units: null, aircraft: null, nonFriendly: 'unknown', tidStab: 'aircraft', glow: 0, color, manualCursor: true },
  };
  fn(f);
  const count = (name: string, pred: (c: Call) => boolean = () => true) => calls.filter(c => c.name === name && pred(c)).length;
  const texts = calls.filter(c => c.name === 'text').map(c => String(c.args[0]));
  const inks = calls.filter(c => c.name === 'ink').map(c => String(c.args[0]));
  return { calls, count, texts, inks, hits: f.hits };
}


/** Every Gfx call except ink, so two renders can be compared shape for shape. */
const shapes = (r: ReturnType<typeof render>) => r.calls.filter(c => c.name !== 'ink').map(c => c.name);
const AWACS = dl();
const DONOR = dl({ key: 'donor:d2', targetId: 'd2', source: 'donor', donorLabel: 'VIPR', sovereignty: 'unknown', az: 15 * D, range: 70000 });
const PPLI = dl({ key: 'ppli:d3', targetId: 'd3', source: 'ppli', sovereignty: 'friendly', az: 0, range: 20000 });
const ALL = [AWACS, DONOR, PPLI];

describe('dlAlpha: fades toward the 20 s coast', () => {
  it('is steady when fresh, fades, and is gone after 20 s', () => {
    expect(dlAlpha(0)).toBe(1);
    expect(dlAlpha(10)).toBeLessThan(1);
    expect(dlAlpha(10)).toBeGreaterThan(dlAlpha(19));
    expect(dlAlpha(19)).toBeGreaterThan(0);
    expect(dlAlpha(20.5)).toBe(0);
  });
});

describe('no datalink: F-15C VSD and M-2000C VTB draw nothing extra', () => {
  it.each([['f15c', drawF15Vsd, 'f15-vsd'], ['m2000c', drawVtb, 'vtb']] as const)('%s', (ac, fn, fmt) => {
    const base = render(fn, fmt, picture(ac));
    const withDl = render(fn, fmt, picture(ac, { datalink: ALL }));
    expect(shapes(withDl)).toEqual(shapes(base));
  });
});

describe('datalink entries are never pickable', () => {
  it.each([
    ['fa18c', drawMfd, 'mfd'], ['f16c', drawMfd, 'mfd'], ['jf17', drawMfd, 'mfd'], ['su27', drawRuHud, 'ru-hud'], ['f14b', drawTid, 'tid'],
  ] as const)('%s', (ac, fn, fmt) => {
    const r = render(fn, fmt, picture(ac, { datalink: ALL }));
    expect(r.hits.map(h => h.id)).not.toContain('d1');
    expect(r.hits.map(h => h.id)).not.toContain('d2');
    expect(r.hits.map(h => h.id)).not.toContain('d3');
  });
});

describe('Hornet: HAFU bottom half = datalink ID', () => {
  const hornet = (patch: Partial<RadarPicture>) => render(drawMfd, 'mfd', picture('fa18c', patch));

  it('draws a datalink-only AWACS HAFU (caret) and a PPLI circle', () => {
    const base = hornet({});
    expect(hornet({ datalink: [AWACS] }).count('poly')).toBe(base.count('poly') + 1);
    expect(hornet({ datalink: [PPLI] }).count('circle')).toBe(base.count('circle') + 1);
  });

  it('adds the bottom half on an own track with a datalink ID', () => {
    expect(hornet({ tracks: [track({ dl: 'friendly' })] }).count('arc')).toBe(1);
    expect(hornet({ tracks: [track({ dl: 'unknown' })] }).count('poly')).toBe(hornet({ tracks: [track()] }).count('poly') + 1);
  });

  it('does not draw the entry twice when own radar tracks the target', () => {
    const own = hornet({ tracks: [track({ targetId: 'd1', dl: 'hostile' })] });
    const both = hornet({ tracks: [track({ targetId: 'd1', dl: 'hostile' })], datalink: [dl({ correlated: true })] });
    expect(shapes(both)).toEqual(shapes(own));
  });

  it('shows the hostile top half only with both factors: no IFF reply and a hostile datalink ID', () => {
    const opts = { opts: { nonFriendly: 'unknown' as const } };
    expect(hafuTop(opts as never, { friendly: false, iff: { reply: 'no-reply', age: 1 }, dl: 'hostile' })).toBe('hostile');
    expect(hafuTop(opts as never, { friendly: false, iff: { reply: 'no-reply', age: 1 } })).toBe('unknown');
    expect(hafuTop(opts as never, { friendly: false, dl: 'hostile' })).toBe('unknown');
    expect(hafuTop(opts as never, { friendly: false, iff: { reply: 'no-reply', age: 1 }, dl: 'unknown' })).toBe('unknown');
    expect(hafuTop(opts as never, { friendly: true, dl: 'hostile' })).toBe('friendly');
  });

  it('colours the HAFU halves on the colour skin: red top only with both factors, yellow unknown bottom', () => {
    const reds = (t: PicTrack) => render(drawMfd, 'mfd', picture('fa18c', { tracks: [t] }), true).inks.filter(i => i === '#hostile').length;
    expect(reds(track({ iff: { reply: 'no-reply', age: 1 }, dl: 'hostile' }))).toBe(2);
    expect(reds(track({ dl: 'hostile' }))).toBe(1);
    expect(reds(track({ iff: { reply: 'no-reply', age: 1 } }))).toBe(0);
    expect(render(drawMfd, 'mfd', picture('fa18c', { tracks: [track({ dl: 'unknown' })] }), true).inks).toContain('#caution');
  });

  it('in RWS shows only datalink HAFUs correlated to a radar return', () => {
    const base = hornet({ mode: 'rws', modeLabel: 'RWS' });
    expect(hornet({ mode: 'rws', modeLabel: 'RWS', datalink: [AWACS] }).count('poly')).toBe(base.count('poly'));
    expect(hornet({ mode: 'rws', modeLabel: 'RWS', datalink: [dl({ correlated: true })] }).count('poly')).toBe(base.count('poly') + 1);
    expect(hornet({ mode: 'tws', datalink: [AWACS] }).count('poly')).toBe(hornet({ mode: 'tws' }).count('poly') + 1);
  });
});

describe('Viper: datalink air tracks on the FCR (colours community)', () => {
  it('draws PPLI blue, donor tracks green, AWACS tracks as a diamond (red when hostile)', () => {
    const v = (d: PicDatalink) => render(drawMfd, 'mfd', picture('f16c', { datalink: [d] }));
    expect(v(PPLI).inks).toContain('#datalink');
    expect(v(DONOR).inks).toContain('#ok');
    const aw = v(AWACS);
    expect(aw.inks).toContain('#hostile');
    expect(aw.count('poly')).toBe(render(drawMfd, 'mfd', picture('f16c')).count('poly') + 1);
  });

  it('colours an own track red when the datalink calls it hostile', () => {
    expect(render(drawMfd, 'mfd', picture('f16c', { tracks: [track({ dl: 'hostile' })] })).inks).toContain('#hostile');
    expect(render(drawMfd, 'mfd', picture('f16c', { tracks: [track()] })).inks).not.toContain('#hostile');
  });
});

describe('JF-17: green friendly, red unknown or hostile, a box when own radar does not see it (community)', () => {
  const j = (d: PicDatalink) => render(drawMfd, 'mfd', picture('jf17', { datalink: [d] }));
  const base = render(drawMfd, 'mfd', picture('jf17'));

  it('colours by sovereignty', () => {
    expect(j(PPLI).inks).toContain('#ok');
    expect(j(AWACS).inks).toContain('#hostile');
    expect(j(DONOR).inks).toContain('#hostile');
  });

  it('boxes a symbol own radar does not see', () => {
    expect(j(AWACS).count('rect')).toBe(base.count('rect') + 1);
    expect(j(dl({ correlated: true })).count('rect')).toBe(base.count('rect'));
  });
});

describe('FC3 HUD: open triangle for an AWACS track', () => {
  it.each(['su27', 'mig29s'] as const)('%s', ac => {
    const base = render(drawRuHud, 'ru-hud', picture(ac));
    const r = render(drawRuHud, 'ru-hud', picture(ac, { datalink: [AWACS] }));
    const open = (x: ReturnType<typeof render>) => x.count('poly', c => c.args[2] === false);
    expect(open(r)).toBe(open(base) + 1);
    // Own radar holds it (correlated): nothing extra, the contact is drawn as usual.
    expect(open(render(drawRuHud, 'ru-hud', picture(ac, { datalink: [dl({ correlated: true })] })))).toBe(open(base));
  });
});

describe('F-14 TID: datalink half-shape below the dot', () => {
  const base = render(drawTid, 'tid', picture('f14b'));

  it('draws friendly ∪ as an arc, hostile ∨ and unknown ⊔ as open polylines', () => {
    expect(render(drawTid, 'tid', picture('f14b', { datalink: [PPLI] })).count('arc')).toBe(base.count('arc') + 1);
    expect(render(drawTid, 'tid', picture('f14b', { datalink: [AWACS] })).count('poly')).toBe(base.count('poly') + 1);
    expect(render(drawTid, 'tid', picture('f14b', { datalink: [DONOR] })).count('poly')).toBe(base.count('poly') + 1);
  });

  it('adds the lower half to an own track with a datalink ID', () => {
    const own = render(drawTid, 'tid', picture('f14b', { tracks: [track()] }));
    expect(render(drawTid, 'tid', picture('f14b', { tracks: [track({ dl: 'hostile' })] })).count('poly')).toBe(own.count('poly') + 1);
  });

  it('draws nothing for an entry past the 20 s coast', () => {
    expect(shapes(render(drawTid, 'tid', picture('f14b', { datalink: [dl({ age: 21 })] })))).toEqual(shapes(base));
  });
});
