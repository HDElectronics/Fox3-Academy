/** [OWNER: displays] Pure-logic tests for the cockpit displays (mappings, labels, RWR ordering, picking). */
import { describe, expect, it } from 'vitest';
import type { RwrContact } from '../../sim/types';
import { RWRS } from '../../data/rwr';
import {
  aspectSide, aspectTens, bscopeToScreen, f15StoresCode, fmtScale, fmtVsdAlt, hitTest, isAirborne, missileDigits, niceCeil, planToScreen,
  ruWeaponLabel, rwrPriority, rwrSymbolFor, scopeRadius, screenToBscope, screenToPlan, spoLamps, SPO_FWD_LAMPS, tidAltDigit,
  viperAzLegend, type Rect,
} from './geometry';
import { MissileClock } from './glyphs';
import { ruModeLabel } from './radar/ruHud';

const D = Math.PI / 180;
const contact = (p: Partial<RwrContact>): RwrContact => ({
  emitterId: 'e', emitterType: 'su27', state: 'search', bearing: 0, elevation: 0, strength: 0.5, firstSeen: 0, lastSeen: 0, ...p,
});

describe('coordinate mappings', () => {
  const r: Rect = { x: 10, y: 20, w: 200, h: 100 };
  it('B-scope: nose at the centre, range 0 at the bottom, full scale at the top', () => {
    expect(bscopeToScreen(r, 60 * D, 1000, 0, 0)).toEqual({ x: 110, y: 120 });
    const p = bscopeToScreen(r, 60 * D, 1000, 60 * D, 1000);
    expect(p.x).toBeCloseTo(210);
    expect(p.y).toBeCloseTo(20);
  });
  it('B-scope inverse round-trips and rejects points outside the plot', () => {
    const p = bscopeToScreen(r, 60 * D, 74000, -23 * D, 41000);
    const q = screenToBscope(r, 60 * D, 74000, p.x, p.y);
    expect(q?.az).toBeCloseTo(-23 * D);
    expect(q?.range).toBeCloseTo(41000);
    expect(screenToBscope(r, 60 * D, 74000, 5, 50)).toBeNull();
  });
  it('plan view round-trips with a rotation (TID ground-stabilised)', () => {
    const o = { x: 100, y: 100 };
    const p = planToScreen(o, 0.01, 0.7, 20 * D, 5000);
    const q = screenToPlan(o, 0.01, 0.7, p.x, p.y);
    expect(q.az).toBeCloseTo(20 * D);
    expect(q.range).toBeCloseTo(5000);
    // Heading-up: a target dead ahead is straight up.
    const up = planToScreen(o, 0.01, 0, 0, 1000);
    expect(up.x).toBeCloseTo(100);
    expect(up.y).toBeCloseTo(90);
  });
});

describe('aspect readouts', () => {
  it('reports which side of the target we see', () => {
    // Target dead ahead flying east (relHeading +90°): its nose points right, we are off its right wing.
    expect(aspectSide(0, 90 * D)).toBe('R');
    expect(aspectSide(0, -90 * D)).toBe('L');
  });
  it('counts tens of degrees from the tail: head-on is 18, beam 9', () => {
    expect(aspectTens(0, 'R')).toBe('18');
    expect(aspectTens(90, 'L')).toBe('9L');
    expect(aspectTens(180, 'R')).toBe('0');
  });
});

describe('labels', () => {
  it('formats VSD altitude and TID altitude digit', () => {
    expect(fmtVsdAlt(29900 * 0.3048, 'imperial')).toBe('29-9');
    expect(fmtVsdAlt(8200, 'metric')).toBe('8.2');
    expect(tidAltDigit(3000 * 0.3048)).toBe('0');
    expect(tidAltDigit(40000 * 0.3048)).toBe('4');
  });
  it('formats range scales', () => {
    expect(fmtScale(80 * 1852, 'imperial')).toBe('80');
    expect(fmtScale(100000, 'metric')).toBe('100');
    expect(fmtScale(10 * 1852, 'metric')).toBe('18.5');
  });
  it('builds cockpit weapon codes', () => {
    expect(ruWeaponLabel('r27er', 'R-27ER')).toBe('27ЭР');
    expect(f15StoresCode('aim120c', 4, 'AIM-120C')).toBe('A4C');
    expect(f15StoresCode('aim7m', 2, 'AIM-7M')).toBe('M2M');
    expect(missileDigits('AIM-120C')).toBe('120');
    expect(missileDigits('R-77')).toBe('77');
    expect(viperAzLegend(60 * D)).toBe('A6');
    expect(viperAzLegend(10 * D)).toBe('A1');
  });
  it('adds the BVR suffix to FC3 mode labels once', () => {
    expect(ruModeLabel('СНП', 'tws')).toBe('СНП ДВБ');
    expect(ruModeLabel('ОБЗ ДВБ', 'rws')).toBe('ОБЗ ДВБ');
    expect(ruModeLabel('БВБ', 'acm')).toBe('БВБ');
  });
});

describe('RWR logic', () => {
  it('orders threats: missile/launch, lock, then signal strength', () => {
    const list = rwrPriority([
      contact({ emitterId: 'a', state: 'search', strength: 0.9 }),
      contact({ emitterId: 'b', state: 'lock', strength: 0.3 }),
      contact({ emitterId: 'c', state: 'missile', emitterType: 'missile', strength: 0.2 }),
      contact({ emitterId: 'd', state: 'search', strength: 0.4 }),
    ]);
    expect(list.map(c => c.emitterId)).toEqual(['c', 'b', 'a', 'd']);
  });
  it('ranks by emitter type after lock and before strength: airborne > SAM long > medium > short > EW > AWACS', () => {
    const list = rwrPriority([
      contact({ emitterId: 'awacs', emitterType: 'awacs', strength: 1 }),
      contact({ emitterId: 'sa15', emitterType: 'sam-short', strength: 0.95 }),
      contact({ emitterId: 'sa10', emitterType: 'sam-long', strength: 0.2 }),
      contact({ emitterId: 'ew', emitterType: 'unknown', strength: 0.9 }),
      contact({ emitterId: 'f15', emitterType: 'f15c', strength: 0.1 }),
      contact({ emitterId: 'sa11', emitterType: 'sam-medium', strength: 0.5 }),
      contact({ emitterId: 'lockedSam', emitterType: 'sam-short', state: 'lock', strength: 0.1 }),
    ]);
    expect(list.map(c => c.emitterId)).toEqual(['lockedSam', 'f15', 'sa10', 'sa11', 'sa15', 'ew', 'awacs']);
  });
  it('draws the airborne hat on aircraft and AWACS only (not SAMs, unknown or missiles)', () => {
    expect(isAirborne({ emitterType: 'f15c' })).toBe(true);
    expect(isAirborne({ emitterType: 'awacs' })).toBe(true);
    for (const e of ['sam-long', 'sam-medium', 'sam-short', 'unknown', 'missile'] as const) expect(isAirborne({ emitterType: e })).toBe(false);
  });
  it('reads symbols from the RWR spec', () => {
    expect(rwrSymbolFor(RWRS.spo15, contact({ emitterType: 'f15c' }))).toBe('П');
    expect(rwrSymbolFor(RWRS.alr56c, contact({ emitterType: 'missile', state: 'missile' }))).toBe('M');
    const s = rwrSymbolFor(RWRS.alr67, contact({ emitterType: 'su27' }));
    expect(s).toBe(RWRS.alr67.symbols.find(x => x.emitter === 'su27')?.symbol);
  });
  it('lights SPO-15 lamps: both 10° lamps dead ahead, both bracketing lamps in between, rear lamps behind', () => {
    const idx = (deg: number) => SPO_FWD_LAMPS.indexOf(deg);
    expect(spoLamps(0).sort()).toEqual([idx(-10), idx(10)].sort());
    expect(spoLamps(20 * D).sort()).toEqual([idx(10), idx(30)].sort());
    expect(spoLamps(-31 * D)).toEqual([idx(-30)]);
    expect(spoLamps(95 * D)).toEqual([idx(90)]);
    expect(spoLamps(150 * D)).toEqual([9]);
    expect(spoLamps(-150 * D)).toEqual([8]);
  });
  it('places lethality by ring, per RWR (not by range)', () => {
    const search = contact({ state: 'search', strength: 0.5 });
    const lock = contact({ state: 'lock', strength: 0.5 });
    const launch = contact({ state: 'launch', strength: 0.5 });
    // Hornet / F-14 ALR-67: critical band is the OUTER ring.
    expect(scopeRadius('alr67', lock, 0)).toBeGreaterThan(scopeRadius('alr67', search, 0));
    // Viper ALR-56M and Serval: more lethal = nearer the centre.
    expect(scopeRadius('alr56m', lock, 0)).toBeLessThan(scopeRadius('alr56m', search, 0));
    expect(scopeRadius('alr56m', launch, 0)).toBeLessThan(scopeRadius('alr56m', lock, 0));
    expect(scopeRadius('serval', launch, 0)).toBeLessThan(scopeRadius('serval', search, 0));
    // DCS ALR-56C: stronger signal sits nearer the centre.
    expect(scopeRadius('alr56c', contact({ strength: 0.9 }), 0)).toBeLessThan(scopeRadius('alr56c', contact({ strength: 0.1 }), 0));
    // DCS ALR-56C: EW and AWACS never in the inner ring (0.42 R), even at full strength or with a lock state.
    for (const emitterType of ['awacs', 'unknown'] as const)
      for (const state of ['search', 'lock'] as const)
        expect(scopeRadius('alr56c', contact({ emitterType, state, strength: 1 }), 0)).toBeGreaterThan(0.42);
  });
});

describe('picking and misc', () => {
  it('prefers tracks over bricks when both are under the pointer', () => {
    const h = hitTest([
      { x: 10, y: 10, r: 12, id: 'brick', kind: 'brick', prio: 2 },
      { x: 14, y: 10, r: 12, id: 'track', kind: 'track', prio: 1 },
    ], 11, 10);
    expect(h?.id).toBe('track');
    expect(hitTest([{ x: 10, y: 10, r: 5, id: 'x', kind: 'track', prio: 1 }], 30, 30)).toBeNull();
  });
  it('rounds scales up to nice numbers', () => {
    expect(niceCeil(37)).toBe(50);
    expect(niceCeil(18)).toBe(20);
    expect(niceCeil(2.2)).toBe(2.5);
  });
  it('tracks missile fly-out progress from first sighting', () => {
    const c = new MissileClock();
    c.frame(10);
    expect(c.progress('m', 10, 30)).toBeCloseTo(0);
    c.frame(20);
    expect(c.progress('m', 20, 20)).toBeCloseTo(10 / 30);
    c.prune(30);
    c.frame(30);
    expect(c.progress('m', 30, 10)).toBeCloseTo(0); // forgotten, first seen again
  });
});
