/** [OWNER: displays] A-10C II displays: pure helpers and draw smoke tests on a recording canvas. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { A10cHudView, MsgPageView, TadView, TgpPageView } from './types';
import { A10cHud, ccrpCueFraction, fmtTtr, headingTapeLabel, hudPoint } from './hud';
import { A10cTgpPage, coverSource, fmtTgpRange, fovText, lssOsbLabel, lssText, trackText } from './tgpPage';
import { A10cTadPage, bearingRange, fmtBrgRng, hookedPoint, tadProject } from './tadPage';
import { A10cMsgPage, msgOsbLabels } from './msgPage';
import { osbAnchor } from './mfcd';

const NM = 1852;

describe('TAD projection', () => {
  const own = { x: 1000, z: -2000, heading: 0 };
  it('puts own ship at the centre and a point at the scale on the ring, heading-up', () => {
    expect(tadProject(own, 10, 200, 200, 160, own)).toEqual({ x: 200, y: 200 });
    const ahead = tadProject(own, 10, 200, 200, 160, { x: 1000, z: -2000 - 10 * NM });
    expect(ahead.x).toBeCloseTo(200, 6);
    expect(ahead.y).toBeCloseTo(40, 6);
    const east = tadProject(own, 10, 200, 200, 160, { x: 1000 + 5 * NM, z: -2000 });
    expect(east.x).toBeCloseTo(280, 6);
    expect(east.y).toBeCloseTo(200, 6);
  });
  it('rotates with the heading: flying east, a point to the east is straight up', () => {
    const e = { ...own, heading: Math.PI / 2 };
    const p = tadProject(e, 20, 0, 0, 100, { x: 1000 + 20 * NM, z: -2000 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(-100, 6);
    const north = tadProject(e, 20, 0, 0, 100, { x: 1000, z: -2000 - 20 * NM });
    expect(north.x).toBeCloseTo(-100, 6);
  });
  it('gives true bearing and range for the hook readout', () => {
    expect(bearingRange({ x: 0, z: 0 }, { x: 0, z: -NM })).toEqual({ brgDeg: 0, rangeNm: 1 });
    expect(bearingRange({ x: 0, z: 0 }, { x: -3 * NM, z: 0 }).brgDeg).toBe(270);
    expect(fmtBrgRng({ x: 0, z: 0 }, { x: 12.3 * NM * Math.SQRT1_2, z: -12.3 * NM * Math.SQRT1_2 })).toBe('045/12.3');
  });
  it('resolves the hooked symbol', () => {
    const v = tad({ hooked: 'friendly', cursor: { x: 900, z: 0 }, friendlies: [{ x: 0, z: 0 }, { x: 1000, z: 0 }] });
    expect(hookedPoint(v)).toEqual({ x: 1000, z: 0 });
    expect(hookedPoint(tad({ hooked: 'tasking' }))).toEqual(tad().tasking);
    expect(hookedPoint(tad({ hooked: null }))).toBeNull();
  });
});

describe('TGP text fields', () => {
  it('prefixes the range with L / T / E, nm (km in metric)', () => {
    expect(fmtTgpRange(2.4 * NM, 'L', 'imperial')).toBe('L 2.4');
    expect(fmtTgpRange(5000, 'T', 'metric')).toBe('T 5.0KM');
    expect(fmtTgpRange(10 * NM, 'E', 'imperial')).toBe('E 10.0');
    expect(fmtTgpRange(null, 'L', 'imperial')).toBe('');
    expect(fmtTgpRange(1000, null, 'imperial')).toBe('');
  });
  it('names the LSS states, the OSB 6 legend and the FOV field as the manual does', () => {
    expect(['off', 'search', 'detect', 'track', 'lost'].map(s => lssText(s as TgpPageView['lss']))).toEqual(['', 'LSRCH', 'DETECT', 'LTRACK', 'NO LSR']);
    expect(lssOsbLabel('search')).toBe('LSS');
    expect(lssOsbLabel('detect')).toBe('LST');
    expect(lssOsbLabel('track')).toBe('LST');
    expect(fovText('wide', 'off')).toBe('WIDE');
    expect(fovText('narrow', 'off')).toBe('NARO');
    expect(fovText('wide', 'search')).toBe('WSCH');
    expect(fovText('narrow', 'detect')).toBe('NSCH');
    expect(trackText('point')).toBe('POINT');
    expect(trackText('none')).toBe('');
  });
  it('crops a video frame to the square page', () => {
    expect(coverSource(640, 480)).toEqual({ sx: 80, sy: 0, sw: 480, sh: 480 });
  });
});

describe('HUD helpers', () => {
  it('formats time to release and moves the CCRP cue in the last 6 s', () => {
    expect(fmtTtr(25)).toBe('');
    expect(fmtTtr(12.2)).toBe('13');
    expect(fmtTtr(-1)).toBe('0');
    expect(ccrpCueFraction(10)).toBeNull();
    expect(ccrpCueFraction(6)).toBe(0);
    expect(ccrpCueFraction(3)).toBeCloseTo(0.5);
    expect(ccrpCueFraction(-2)).toBe(1);
  });
  it('labels the heading tape in tens of degrees', () => {
    expect(headingTapeLabel(0)).toBe('36');
    expect(headingTapeLabel(30)).toBe('03');
    expect(headingTapeLabel(270)).toBe('27');
    expect(headingTapeLabel(-10)).toBe('35');
  });
  it('clamps HUD points to the glass and flags them', () => {
    expect(hudPoint(0, 0, 100, 80, 500, 200, 200, 5)).toEqual({ x: 100, y: 80, clipped: false });
    const q = hudPoint(1, 0, 100, 80, 500, 200, 200, 5);
    expect(q.x).toBe(195);
    expect(q.clipped).toBe(true);
  });
});

describe('MFCD OSBs', () => {
  it('places WILCO (OSB 19) left and CNTCO (OSB 7) right at the same height', () => {
    const w = osbAnchor(19, 400), c = osbAnchor(7, 400);
    expect(w.side).toBe('left');
    expect(c.side).toBe('right');
    expect(w.y).toBe(c.y);
    expect(osbAnchor(1, 400).x).toBeLessThan(osbAnchor(5, 400).x);
    expect(osbAnchor(11, 400).x).toBeGreaterThan(osbAnchor(15, 400).x);
    expect(osbAnchor(16, 400).y).toBeGreaterThan(osbAnchor(20, 400).y);
    expect(() => osbAnchor(21, 400)).toThrow();
  });
  it('shows the MSG answer as a filled legend', () => {
    expect(msgOsbLabels('new').map(l => l.style)).toEqual(['plain', 'plain']);
    expect(msgOsbLabels('wilco')[0].style).toBe('inverse');
    expect(msgOsbLabels('cntco')[1].style).toBe('inverse');
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
function fakeCanvas(calls: Call[], w = 400, h = 400): HTMLCanvasElement {
  const ctx = recorder(calls);
  return {
    width: 0, height: 0, style: {}, clientWidth: w, clientHeight: h,
    getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
  } as unknown as HTMLCanvasElement;
}
const texts = (calls: Call[]) => calls.filter(c => c.name === 'fillText').map(c => String(c.args[0]));
const strokeRects = (calls: Call[]) => calls.filter(c => c.name === 'strokeRect');

function tgp(p: Partial<TgpPageView> = {}): TgpPageView {
  return {
    t: 1.1, on: true, image: null, fov: 'narrow', track: 'point', lss: 'off', lssCode: 1688, laserCode: 1688, laserFiring: false,
    rangeM: 4.2 * NM, rangeSource: 'L', soi: true, isSpi: true, units: 'imperial', ...p,
  };
}
function tad(p: Partial<TadView> = {}): TadView {
  return {
    t: 0.2, own: { x: 0, z: 0, heading: 0.3 }, scaleNm: 10, spi: { x: 2000, z: -9000 }, steerpoint: { x: -3000, z: -12000, name: 'A' },
    friendlies: [{ x: 1500, z: -7000, label: 'JTAC' }], tasking: { x: 2600, z: -9800, accepted: false }, newTasking: true,
    cursor: { x: 2600, z: -9800 }, hooked: 'tasking', soi: true, ...p,
  };
}
function hud(p: Partial<A10cHudView> = {}): A10cHudView {
  return {
    t: 0.1, heading: 0.5, pitch: -0.2, roll: 0.1, speedKt: 300, altFt: 9000, master: 'CCIP', soi: true,
    weapon: { id: 'gbu12', label: 'GBU-12', count: 2 },
    pipper: { az: 0.01, el: -0.1 }, releaseCue: 0.5, ccrp: null, spi: { az: 0.02, el: -0.09 }, belowMinAlt: false, laserFiring: true, ...p,
  };
}

describe('A-10C II displays draw', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#33cc66' }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('TGP page: every LSS state draws its text; STBY when off; NO VIDEO without a picture', () => {
    for (const [lss, want] of [['search', 'LSRCH'], ['detect', 'DETECT'], ['track', 'LTRACK'], ['lost', 'NO LSR']] as const) {
      const calls: Call[] = [];
      const p = new A10cTgpPage(fakeCanvas(calls));
      p.draw(tgp({ lss, track: 'none' }));
      expect(texts(calls)).toContain(want);
      expect(texts(calls)).toContain(lss === 'detect' || lss === 'track' ? 'LST' : 'LSS');
      p.dispose();
    }
    const off: Call[] = [];
    new A10cTgpPage(fakeCanvas(off)).draw(tgp({ on: false }));
    expect(texts(off)).toContain('STBY');
    const nv: Call[] = [];
    new A10cTgpPage(fakeCanvas(nv)).draw(tgp());
    expect(texts(nv)).toEqual(expect.arrayContaining(['NO VIDEO', 'NARO', 'CCD', 'POINT', 'L 4.2', 'SPI', '1688', 'A-G', 'CNTL', 'LSR']));
    for (const track of ['none', 'area', 'point', 'inr'] as const) {
      expect(() => new A10cTgpPage(fakeCanvas([])).draw(tgp({ track, fov: 'wide', rangeSource: 'E' }))).not.toThrow();
    }
  });

  it('TGP page: SOI box when SOI, NOT SOI otherwise; L flashes while firing', () => {
    const soi: Call[] = [], not: Call[] = [];
    new A10cTgpPage(fakeCanvas(soi)).draw(tgp({ soi: true }));
    new A10cTgpPage(fakeCanvas(not)).draw(tgp({ soi: false }));
    expect(texts(soi)).not.toContain('NOT SOI');
    expect(texts(not)).toContain('NOT SOI');
    expect(strokeRects(soi).length).toBeGreaterThan(strokeRects(not).length);
    const frames = [0, 0.1, 0.25, 0.35].map(t => { const c: Call[] = []; new A10cTgpPage(fakeCanvas(c)).draw(tgp({ t, laserFiring: true })); return texts(c).includes('L'); });
    expect(new Set(frames).size).toBe(2);
  });

  it('TAD: NEW TASKING only when set, ATTACK flashes until accepted, hook readout', () => {
    const a: Call[] = [], b: Call[] = [];
    new A10cTadPage(fakeCanvas(a)).draw(tad({ t: 0.1 }));
    new A10cTadPage(fakeCanvas(b)).draw(tad({ newTasking: false, t: 0.1, tasking: { x: 2600, z: -9800, accepted: true } }));
    expect(texts(a)).toEqual(expect.arrayContaining(['NEW TASKING', 'ATTACK', 'OWN', 'NET', '10', 'A', 'JTAC']));
    expect(texts(b)).not.toContain('NEW TASKING');
    expect(texts(b)).not.toContain('ATTACK');
    const blink = [0.1, 0.8].map(t => { const c: Call[] = []; new A10cTadPage(fakeCanvas(c)).draw(tad({ t })); return texts(c).includes('ATTACK'); });
    expect(blink).toEqual([true, false]);
    for (const hooked of ['spi', 'friendly', null] as const) {
      expect(() => new A10cTadPage(fakeCanvas([])).draw(tad({ hooked, cursor: null, spi: null, tasking: null, scaleNm: 160 }))).not.toThrow();
    }
  });

  it('MSG page: 9-line and WILCO / CNTCO in every state', () => {
    const msg = (state: MsgPageView['state']): MsgPageView => ({
      title: 'CAS 9-LINE', state, lines: [{ label: '1', value: 'IP HAWK' }, { label: '4', value: '1200 FT MSL' }, { label: '6', value: '38T KM 12345 67890 A VERY LONG MGRS FIELD' }],
    });
    for (const st of ['new', 'wilco', 'cntco'] as const) {
      const c: Call[] = [];
      new A10cMsgPage(fakeCanvas(c)).draw(msg(st));
      expect(texts(c)).toEqual(expect.arrayContaining(['CAS 9-LINE', 'WILCO', 'CNTCO', 'IP HAWK', '1200 FT MSL']));
      expect(c.some(x => x.name === 'fillRect')).toBe(true);
    }
  });

  it('HUD: every master mode draws; SOI asterisk; X below minimum; transparent overlay', () => {
    for (const master of ['NAV', 'GUNS', 'CCIP', 'CCRP'] as const) {
      const c: Call[] = [];
      const h = new A10cHud(fakeCanvas(c, 500, 500));
      h.draw(hud({ master, ccrp: master === 'CCRP' ? { ttrS: 4, errRad: 0.02 } : null, releaseCue: master === 'CCIP' ? 0.4 : null }));
      expect(texts(c)).toContain(master);
      expect(texts(c)).toContain('*');
      expect(texts(c)).toContain('GBU-12 2');
      h.dispose();
    }
    const ns: Call[] = [];
    new A10cHud(fakeCanvas(ns)).draw(hud({ soi: false, pipper: null, spi: { az: 2, el: 2 }, belowMinAlt: true, weapon: null }));
    expect(texts(ns)).not.toContain('*');
    const ov: Call[] = [];
    new A10cHud(fakeCanvas(ov), { overlay: true }).draw(hud());
    expect(ov.some(x => x.name === 'clearRect')).toBe(true);
    const ccrp: Call[] = [];
    new A10cHud(fakeCanvas(ccrp)).draw(hud({ master: 'CCRP', ccrp: { ttrS: 12.5, errRad: -0.03 } }));
    expect(texts(ccrp)).toContain('13');
  });
});
