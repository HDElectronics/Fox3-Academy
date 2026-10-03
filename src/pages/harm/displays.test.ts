/** [OWNER: page-harm displays] HARM page displays: OSB geometry, timers, and draw smoke tests on a recording canvas. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HarmDdi, fmtTimer, hornetOsbAnchor, pickOsb, timerDiff } from './ddi';
import { EwPage, ewPoint } from './ew';
import { HornetHud, hudHeading, hudPx } from './hud';
import { CLASS_OSB, type EwView, type FormatView, type HudView, type Osb } from './types';

const S = 400;
const ALL: Osb[] = Array.from({ length: 20 }, (_, i) => (i + 1) as Osb);

describe('Hornet DDI pushbuttons', () => {
  it('numbers the left column bottom to top, top row left to right, right column top to bottom, bottom row right to left', () => {
    for (const n of [1, 2, 3, 4, 5] as Osb[]) expect(hornetOsbAnchor(n, S).side).toBe('left');
    for (const n of [6, 7, 8, 9, 10] as Osb[]) expect(hornetOsbAnchor(n, S).side).toBe('top');
    for (const n of [11, 12, 13, 14, 15] as Osb[]) expect(hornetOsbAnchor(n, S).side).toBe('right');
    for (const n of [16, 17, 18, 19, 20] as Osb[]) expect(hornetOsbAnchor(n, S).side).toBe('bottom');
    for (let n = 1; n < 5; n++) expect(hornetOsbAnchor(n as Osb, S).y).toBeGreaterThan(hornetOsbAnchor((n + 1) as Osb, S).y);
    for (let n = 6; n < 10; n++) expect(hornetOsbAnchor(n as Osb, S).x).toBeLessThan(hornetOsbAnchor((n + 1) as Osb, S).x);
    for (let n = 11; n < 15; n++) expect(hornetOsbAnchor(n as Osb, S).y).toBeLessThan(hornetOsbAnchor((n + 1) as Osb, S).y);
    for (let n = 16; n < 20; n++) expect(hornetOsbAnchor(n as Osb, S).x).toBeGreaterThan(hornetOsbAnchor((n + 1) as Osb, S).x);
    expect(hornetOsbAnchor(1, S).x).toBeLessThan(S * 0.1);
    expect(hornetOsbAnchor(11, S).x).toBeGreaterThan(S * 0.9);
    expect(hornetOsbAnchor(6, S).y).toBeLessThan(S * 0.1);
    expect(hornetOsbAnchor(16, S).y).toBeGreaterThan(S * 0.9);
    expect(() => hornetOsbAnchor(21 as Osb, S)).toThrow();
  });

  it('picks back every button from its anchor, and nothing in the middle or the corners', () => {
    for (const n of ALL) {
      const a = hornetOsbAnchor(n, S);
      expect(pickOsb(a.x, a.y, S)).toBe(n);
    }
    expect(pickOsb(S / 2, S / 2, S)).toBeNull();
    expect(pickOsb(2, 2, S)).toBeNull();
    expect(pickOsb(-5, 100, S)).toBeNull();
    // A press right at the edge next to OSB 3 still picks it.
    expect(pickOsb(1, hornetOsbAnchor(3, S).y + 10, S)).toBe(3);
  });

  it('puts the 15 classes on 15 different buttons', () => {
    const v = Object.values(CLASS_OSB);
    expect(v).toHaveLength(15);
    expect(new Set(v).size).toBe(15);
  });
});

describe('PB timers', () => {
  it('formats m:ss and --:-- without a value', () => {
    expect(fmtTimer(null)).toBe('--:--');
    expect(fmtTimer(0)).toBe('0:00');
    expect(fmtTimer(65)).toBe('1:05');
    expect(fmtTimer(59.6)).toBe('1:00');
    expect(fmtTimer(-7)).toBe('-0:07');
    expect(fmtTimer(Number.NaN)).toBe('--:--');
  });
  it('takes the difference only when both timers exist', () => {
    expect(timerDiff(90, 60)).toBe(30);
    expect(timerDiff(null, 60)).toBeNull();
    expect(timerDiff(90, null)).toBeNull();
  });
});

describe('EW and HUD geometry', () => {
  it('places EW symbols nose up, clockwise, inner ring closer', () => {
    const n = ewPoint(0, 0), e = ewPoint(90, 0), inner = ewPoint(0, 1);
    expect(n.x).toBeCloseTo(50);
    expect(n.y).toBeLessThan(50);
    expect(e.x).toBeGreaterThan(50);
    expect(inner.y).toBeGreaterThan(n.y);
  });
  it('maps ±12° to the HUD edges and formats the heading', () => {
    expect(hudPx(-12, 0, 600, 400).x).toBeCloseTo(0);
    expect(hudPx(12, 0, 600, 400).x).toBeCloseTo(600);
    expect(hudPx(0, 5, 600, 400).y).toBeLessThan(hudPx(0, 0, 600, 400).y);
    expect(hudHeading(-5)).toBe('355');
    expect(hudHeading(360)).toBe('000');
  });
});

// ------------------------------------------------------------------ draw smoke tests on a recording canvas

type Call = { name: string; args: unknown[] };
function recorder(calls: Call[]): unknown {
  const store: Record<string | symbol, unknown> = { measureText: (s: string) => ({ width: s.length * 6 }), font: '12px mono' };
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
interface FakeCanvas { canvas: HTMLCanvasElement; listeners: Map<string, (e: unknown) => void> }
function fakeCanvas(calls: Call[], w = 400, h = 400): FakeCanvas {
  const ctx = recorder(calls);
  const listeners = new Map<string, (e: unknown) => void>();
  const canvas = {
    width: 0, height: 0, style: {}, clientWidth: w, clientHeight: h,
    getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    addEventListener: (t: string, f: (e: unknown) => void) => { listeners.set(t, f); },
    removeEventListener: (t: string) => { listeners.delete(t); },
  } as unknown as HTMLCanvasElement;
  return { canvas, listeners };
}
const texts = (calls: Call[]) => calls.filter(c => c.name === 'fillText').map(c => String(c.args[0]));

function fmt(p: Partial<FormatView> = {}): FormatView {
  return {
    page: 'HARM', sms: null, mode: 'SP', weapon: { boxed: true, crossed: false }, status: 'RDY', station: 8,
    modeAvailable: { SP: true, TOO: true, PB: true }, hrmOvrd: true, tdc: true,
    too: null, pb: null, classPage: null, scanPage: null, hintOsb: null, ...p,
  };
}
const TOO: NonNullable<FormatView['too']> = {
  cls: 'ALL', limit: true, arrows: { left: true, right: false, up: true, down: false },
  targets: [
    { label: '6', xDeg: -5, yDeg: 2, boxed: true, hoff: true, lockedYou: true },
    { label: 'SD', xDeg: 8, yDeg: -3, boxed: false, hoff: false, lockedYou: false },
    { label: '15', xDeg: 40, yDeg: 0, boxed: false, hoff: false, lockedYou: false },
  ],
};
const PB: NonNullable<FormatView['pb']> = { pullup: 'AC', code: 108, inRange: 'A/C RNG', tofS: 95, ttiS: 40 };

function hud(p: Partial<HudView> = {}): HudView {
  return {
    headingDeg: 355, pitchDeg: 3, altFt: 30000, iasKt: 420, mach: 0.92, g: 1.1, fpm: { xDeg: 0.5, yDeg: -1 },
    master: 'AG', masterArm: true, harmLegend: true, pullback: null,
    ew: [{ label: '6', azDeg: 20, boxed: true }, { label: 'SD', azDeg: -60, boxed: false }],
    los: { xDeg: 3, yDeg: -4, hoff: true }, steer: { name: 'TGT', distNm: 42.9, xDeg: 2, yDeg: -5, tgt: true }, pb: null, ...p,
  };
}

describe('HARM page displays draw', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#33cc66' }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('HARM format: every mode and page draws without throwing', () => {
    const views: FormatView[] = [
      fmt(),
      fmt({ mode: 'SP', weapon: { boxed: true, crossed: true }, status: 'STBY', station: null, tdc: false, hrmOvrd: false, hintOsb: 4 }),
      fmt({ mode: 'TOO', too: TOO, modeAvailable: { SP: true, TOO: true, PB: false } }),
      fmt({ mode: 'TOO', too: { ...TOO, targets: [], arrows: { left: false, right: true, up: false, down: true } } }),
      fmt({ mode: 'PB', pb: PB }),
      fmt({ mode: 'PB', pb: { pullup: 'HRM', code: null, inRange: null, tofS: null, ttiS: null }, hintOsb: 14 }),
      fmt({ page: 'CLASS', mode: 'TOO', too: TOO, classPage: { selected: 'H2', detected: ['H1', 'H2', 'HS'] }, hintOsb: 9 }),
      fmt({ page: 'SCAN', mode: 'TOO', too: TOO, scanPage: { rows: [{ cls: 'H1', side: 'in' }, { cls: 'H2', side: 'left' }, { cls: 'HS', side: 'right' }] } }),
      fmt({ page: 'SMS', sms: { stations: [{ sta: 2, loaded: true, selected: false }, { sta: 3, loaded: false, selected: false }, { sta: 7, loaded: true, selected: false }, { sta: 8, loaded: true, selected: true }], status: 'STBY' } }),
    ];
    for (const v of views) {
      const calls: Call[] = [];
      expect(() => new HarmDdi(fakeCanvas(calls).canvas, () => undefined).draw(v)).not.toThrow();
      expect(calls.length).toBeGreaterThan(0);
    }
    const nul: Call[] = [];
    expect(() => new HarmDdi(fakeCanvas(nul).canvas, () => undefined).draw(null)).not.toThrow();
  });

  it('HARM format writes the mode legends, the TOO targets and the PB timers', () => {
    const too: Call[] = [];
    new HarmDdi(fakeCanvas(too).canvas, () => undefined).draw(fmt({ mode: 'TOO', too: TOO }));
    const t = texts(too);
    for (const s of ['HARM', 'RDY', 'STA 8', 'S', 'P', 'T', 'O', 'B', 'C', 'L', 'ALL', 'SCAN', 'LIMIT', 'H-OFF', '6', 'SD', 'HRM OVRD', 'TOO']) expect(t).toContain(s);
    expect(t).not.toContain('15');
    const pb: Call[] = [];
    new HarmDdi(fakeCanvas(pb).canvas, () => undefined).draw(fmt({ mode: 'PB', pb: PB }));
    const p = texts(pb);
    for (const s of ['A/C RNG', 'FLT', '1:35', '0:40', '0:55', 'TGT', '108', 'PB']) expect(p).toContain(s);
  });

  it('stores page writes HARM under the loaded stations and the status under the selected one', () => {
    const c: Call[] = [];
    new HarmDdi(fakeCanvas(c).canvas, () => undefined).draw(fmt({
      page: 'SMS', sms: { stations: [{ sta: 2, loaded: true, selected: false }, { sta: 3, loaded: false, selected: false }, { sta: 8, loaded: true, selected: true }], status: 'STBY' },
    }));
    const t = texts(c);
    expect(t.filter(s => s === 'HARM')).toHaveLength(3); // OSB 6 legend + stations 2 and 8
    for (const s of ['2', '3', '8', 'STBY', 'HRM OVRD']) expect(t).toContain(s);
  });

  it('a click on a button edge calls onOsb with the DCS number', () => {
    const fc = fakeCanvas([]);
    const got: Osb[] = [];
    const d = new HarmDdi(fc.canvas, n => got.push(n));
    d.draw(fmt());
    const a = hornetOsbAnchor(3, 400);
    fc.listeners.get('click')?.({ clientX: a.x, clientY: a.y });
    fc.listeners.get('click')?.({ clientX: 200, clientY: 200 });
    expect(got).toEqual([3]);
    d.dispose();
    expect(fc.listeners.size).toBe(0);
  });

  it('EW page draws emitters, boxes and the HUD legend', () => {
    const v: EwView = {
      emitters: [{ label: '6', azDeg: 15, ring: 1, boxed: true, lockedYou: true }, { label: 'SD', azDeg: -100, ring: 0, boxed: false, lockedYou: false }],
      lamps: { ai: true, cw: false, sam: true }, hudOn: true, hintOsb: 14,
    };
    const c: Call[] = [];
    const fc = fakeCanvas(c);
    const p = new EwPage(fc.canvas, () => undefined);
    expect(() => p.draw(v)).not.toThrow();
    const t = texts(c);
    for (const s of ['ASPJ', 'ALR-67', 'ALE-47', 'ARM', '6', 'SD']) expect(t).toContain(s);
    expect(() => new EwPage(fakeCanvas([]).canvas).draw(null)).not.toThrow();
    p.dispose();
    expect(fc.listeners.size).toBe(0);
  });

  it('HUD draws every cue variant without throwing', () => {
    const views: HudView[] = [
      hud(),
      hud({ pullback: 'HARM', master: 'NAV', masterArm: false, los: null, steer: { name: '3', distNm: 12, xDeg: -30, yDeg: 0, tgt: false } }),
      hud({ pullback: 'HARM-X', ew: [] }),
      hud({ pullback: 'PLBK', harmLegend: false, master: 'AA', steer: null }),
      hud({ pb: { aslXDeg: -2, inRange: 'HRM RNG', distNm: 42.9, acCueYDeg: 20, hrmCueYDeg: 8, minCueYDeg: -2 } }),
      hud({ pb: { aslXDeg: 40, inRange: null, distNm: 80, acCueYDeg: null, hrmCueYDeg: null, minCueYDeg: null } }),
    ];
    for (const v of views) {
      const c: Call[] = [];
      expect(() => new HornetHud(fakeCanvas(c, 600, 400).canvas).draw(v)).not.toThrow();
      expect(c.length).toBeGreaterThan(0);
    }
    const c: Call[] = [];
    new HornetHud(fakeCanvas(c, 600, 400).canvas).draw(hud({ pb: { aslXDeg: 1, inRange: 'A/C RNG', distNm: 42.9, acCueYDeg: 20, hrmCueYDeg: null, minCueYDeg: null } }));
    const t = texts(c);
    for (const s of ['A/C RNG', '42.9 TGT', 'HARM', 'A/G', 'ARM', 'H-OFF', '355']) expect(t).toContain(s);
    expect(() => new HornetHud(fakeCanvas([]).canvas).draw(null)).not.toThrow();
  });
});
