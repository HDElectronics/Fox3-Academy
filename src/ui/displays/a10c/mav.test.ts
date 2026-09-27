/** [OWNER: displays] A-10C II Maverick cues: MAV page and HUD cue helpers, draw smoke tests on a recording canvas. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { A10cHudView, HudMavCue, MavPageView } from './types';
import { A10cHud } from './hud';
import { A10cMavPage, MAV_BREAK_SPREAD_S, fmtMavRange, mavBreakSpread, mavProfileLabel, mavStaple } from './mavPage';

const NM = 1852;

describe('Maverick helpers', () => {
  it('puts the max tick at 15 nm and scales the min tick and caret on it', () => {
    const st = mavStaple(7.5 * NM, { min: 1.5 * NM, max: 12 * NM });
    expect(st.max).toBe(1);
    expect(st.min).toBeCloseTo(0.1);
    expect(st.caret).toBeCloseTo(0.5);
    expect(st.inZone).toBe(true);
    expect(st.beyond).toBe(false);
  });
  it('clamps a range beyond 15 nm to the top and flags it; out of zone below the min', () => {
    const far = mavStaple(20 * NM, { min: NM, max: 12 * NM });
    expect(far.caret).toBe(1);
    expect(far.beyond).toBe(true);
    expect(far.inZone).toBe(false);
    expect(mavStaple(0.5 * NM, { min: NM, max: 12 * NM }).inZone).toBe(false);
    const none = mavStaple(null, null);
    expect(none.min).toBeNull();
    expect(none.caret).toBeNull();
    expect(none.inZone).toBe(false);
  });
  it('spreads the crosshairs only in the first seconds after a break', () => {
    expect(mavBreakSpread(null)).toBeNull();
    expect(mavBreakSpread(-0.1)).toBeNull();
    expect(mavBreakSpread(0)).toBe(0);
    expect(mavBreakSpread(1)).toBeGreaterThan(0.5);
    expect(mavBreakSpread(1)).toBeLessThan(1);
    expect(mavBreakSpread(MAV_BREAK_SPREAD_S)).toBeNull();
    expect(mavBreakSpread(5)).toBeNull();
  });
  it('labels the profile and formats the range', () => {
    expect(mavProfileLabel('agm65d')).toBe('65D');
    expect(mavProfileLabel('agm65l')).toBe('65L');
    expect(mavProfileLabel(null)).toBe('');
    expect(fmtMavRange(6.3 * NM, 'imperial')).toBe('6.3');
    expect(fmtMavRange(9000, 'metric')).toBe('9.0KM');
    expect(fmtMavRange(null, 'imperial')).toBe('');
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
const count = (calls: Call[], name: string) => calls.filter(c => c.name === name).length;

function mav(p: Partial<MavPageView> = {}): MavPageView {
  return {
    t: 0.1, profile: 'agm65d', image: null, caged: false, locked: false, sinceBreakS: null, status: 'RDY',
    rangeM: 6.2 * NM, dlz: { min: 0.8 * NM, max: 10 * NM }, laserCode: null, spotSeen: false, soi: true, units: 'imperial', ...p,
  };
}
function drawMav(v: MavPageView): Call[] {
  const c: Call[] = [];
  const p = new A10cMavPage(fakeCanvas(c));
  p.draw(v);
  p.dispose();
  return c;
}
function hud(p: Partial<A10cHudView> = {}): A10cHudView {
  return {
    t: 0.1, heading: 0.5, pitch: -0.1, roll: 0, speedKt: 300, altFt: 9000, master: 'NAV', soi: true,
    weapon: { id: 'agm65d', label: '65D', count: 2 }, pipper: null, releaseCue: null, ccrp: null, spi: null, belowMinAlt: false, laserFiring: false, ...p,
  };
}
const cue = (p: Partial<HudMavCue> = {}): HudMavCue => ({ los: { az: 0.02, el: -0.08 }, locked: false, rangeM: 6.2 * NM, dlz: { min: 0.8 * NM, max: 10 * NM }, tooClose: false, ...p });

describe('A-10C II Maverick displays draw', () => {
  beforeEach(() => {
    vi.stubGlobal('document', { documentElement: { dataset: {} } });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '#33cc66' }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads SENSOR without a profile, and the DLZ with one', () => {
    const s = texts(drawMav(mav({ profile: null })));
    expect(s).toContain('SENSOR');
    expect(s).not.toContain('DLZ');
    expect(s).toContain('MAV');
    const d = texts(drawMav(mav()));
    expect(d).not.toContain('SENSOR');
    expect(d).toEqual(expect.arrayContaining(['DLZ', '65D', 'RDY', '6.2', '15', 'NO VIDEO']));
  });

  it('D: CAGED when caged; open gate brackets unlocked; locked box and flashing pointing cross', () => {
    expect(texts(drawMav(mav({ caged: true })))).toContain('CAGED');
    const open = drawMav(mav());
    expect(texts(open)).not.toContain('CAGED');
    const lockOn = drawMav(mav({ locked: true, t: 0.1 }));
    const lockOff = drawMav(mav({ locked: true, t: 0.35 }));
    // The locked gate is a stroked box; the open gate draws none (the SOI box is the only other one).
    expect(count(lockOn, 'strokeRect')).toBe(count(open, 'strokeRect') + 1);
    // Pointing cross flashes: more line segments on the "on" phase.
    expect(count(lockOn, 'lineTo')).toBeGreaterThan(count(lockOff, 'lineTo'));
    for (const status of ['ALN', 'EMPTY'] as const) expect(texts(drawMav(mav({ status, profile: 'agm65h' })))).toEqual(expect.arrayContaining([status, '65H']));
  });

  it('D: the break-lock spread draws only while recent', () => {
    const base = count(drawMav(mav()), 'lineTo');
    const recent = drawMav(mav({ sinceBreakS: 0.8 }));
    const old = drawMav(mav({ sinceBreakS: 4 }));
    expect(count(old, 'lineTo')).toBe(base);
    expect(count(recent, 'lineTo')).not.toBe(base);
  });

  it('L: synthetic view, X without a spot, solid square with one, and the code', () => {
    const noSpot = drawMav(mav({ profile: 'agm65l', laserCode: 1688, spotSeen: false }));
    const spot = drawMav(mav({ profile: 'agm65l', laserCode: 1688, spotSeen: true }));
    expect(texts(noSpot)).toEqual(expect.arrayContaining(['65L', 'CODE 1688']));
    expect(texts(noSpot)).not.toContain('NO VIDEO');
    expect(count(spot, 'fillRect')).toBe(count(noSpot, 'fillRect') + 1);
    expect(texts(drawMav(mav({ profile: 'agm65l', laserCode: null, soi: false })))).toEqual(expect.arrayContaining(['CODE ----', 'NOT SOI']));
  });

  it('HUD: draws the Maverick cue only when present, filled centre on lock, X when too close', () => {
    const draw = (v: A10cHudView) => { const c: Call[] = []; new A10cHud(fakeCanvas(c, 500, 500)).draw(v); return c; };
    const none = draw(hud());
    const withCue = draw(hud({ mav: cue() }));
    expect(texts(none)).not.toContain('6.2');
    expect(texts(withCue)).toContain('6.2');
    expect(count(withCue, 'arc')).toBeGreaterThan(count(none, 'arc'));
    const locked = draw(hud({ mav: cue({ locked: true }) }));
    expect(count(locked, 'arc')).toBe(count(withCue, 'arc'));
    const close = draw(hud({ mav: cue({ tooClose: true }) }));
    expect(count(close, 'lineTo')).toBe(count(withCue, 'lineTo') + 2);
    // Caged (no line of sight) still draws the staple and the X at the boresight; off the glass it clamps.
    expect(() => draw(hud({ mav: cue({ los: null, tooClose: true, rangeM: null, dlz: null }) }))).not.toThrow();
    expect(() => draw(hud({ mav: cue({ los: { az: 2, el: -2 } }) }))).not.toThrow();
  });
});
