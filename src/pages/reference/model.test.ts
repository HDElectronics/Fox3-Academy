import { describe, expect, it } from 'vitest';
import { AIRCRAFT, AIRCRAFT_ORDER, MISSILES, PROCEDURES, RWRS } from '../../data';
import {
  beamWindowDeg, filterMissiles, groupBinds, matches, queryTokens, rangeNum, rwrRows, samRows,
  scanMatrix, simultaneousText, sortMissiles, speedText, splitControlsName, splitHits, twsAllows, twsPatternText, twsPatternsOf, ALL_MISSILES,
} from './model';
import { radarRules } from '../../sim/radar';
import { GLOSSARY, glossaryHaystack } from './glossary';

describe('quick filter', () => {
  it('matches every token, case-insensitive, Cyrillic included', () => {
    expect(matches('R-27ER AA-10 Alamo-C', queryTokens('r-27 alamo'))).toBe(true);
    expect(matches('R-27ER AA-10 Alamo-C', queryTokens('r-27 archer'))).toBe(false);
    expect(matches('СНП ДВБ', queryTokens('снп'))).toBe(true);
    expect(matches('anything', queryTokens('   '))).toBe(true);
  });
  it('splits highlight pieces and merges overlaps', () => {
    expect(splitHits('Notch the notch', ['notch'])).toEqual([
      { text: 'Notch', hit: true }, { text: ' the ', hit: false }, { text: 'notch', hit: true },
    ]);
    expect(splitHits('abcdef', ['bcd', 'cde']).map(p => p.text)).toEqual(['a', 'bcde', 'f']);
    expect(splitHits('text', [])).toEqual([{ text: 'text', hit: false }]);
  });
  it('finds the glossary terms the brief asks for', () => {
    const want = ['RWS', 'TWS', 'STT', 'L&S', 'DT2', 'Bugged', 'Pitbull', 'Husky', 'Notch', 'Beam', 'Crank', 'Pump', 'Drag',
      'F-pole', 'A-pole', 'Rmax', 'Rne', 'Rtr', 'Rpi', 'Rmin', 'MLC', 'HPRF', 'ППС', 'ЗПС', 'АВТ', 'SARH', 'ARH',
      'Datalink', 'Loft', 'Fox 1', 'Bandit', 'Bogey', 'Spike', 'Mud'];
    for (const w of want) expect(GLOSSARY.some(g => matches(glossaryHaystack(g), queryTokens(w))), w).toBe(true);
    for (const g of GLOSSARY) expect(g.def, g.term).not.toMatch(/!/);
  });
});

describe('units', () => {
  it('formats ranges in the user units', () => {
    expect(rangeNum(59, 'metric')).toBe('59');
    expect(rangeNum(25.5, 'metric')).toBe('25.5');
    expect(rangeNum(59, 'imperial')).toBe('32');
    expect(rangeNum(16, 'imperial')).toBe('8.6');
    expect(rangeNum(18.52, 'imperial')).toBe('10');
  });
  it('formats speeds and the beam window', () => {
    expect(speedText(54, 'metric')).toBe('100 km/h');
    expect(speedText(113, 'metric')).toBe('210 km/h');
    expect(speedText(54, 'imperial')).toBe('54 kt');
    expect(beamWindowDeg(54, 450)).toBeCloseTo(6.9, 1);
    expect(beamWindowDeg(133, 450)).toBeCloseTo(17.2, 1);
  });
});

describe('binds', () => {
  it('keeps punctuation keys and unknown defaults distinct from prose', () => {
    const fcr = PROCEDURES.f16c.binds.find(b => b.action === 'FCR as sensor of interest');
    expect(fcr?.keyboard).toBe('RAlt + .');
    expect(PROCEDURES.f14b.binds.find(b => /^Launch/.test(b.action))?.keyboard).toBeNull();
    for (const ac of AIRCRAFT_ORDER) for (const b of PROCEDURES[ac].binds) {
      expect(b.note ?? '').not.toMatch(/^Keyboard:/);
      expect(['radar', 'weapons', 'defence']).toContain(b.group);
    }
  });
  it('splits FC3 controls-menu names from caveats', () => {
    expect(splitControlsName('"Radar On/Off". ИЗЛ shows on the HUD while it transmits.'))
      .toEqual({ menu: '"Radar On/Off"', rest: 'ИЗЛ shows on the HUD while it transmits.' });
    expect(splitControlsName('"Weapon Change" / "Cannon"')).toEqual({ menu: '"Weapon Change" / "Cannon"', rest: '' });
    expect(splitControlsName('"Unlock TWS Target": bind it yourself.').rest).toBe('bind it yourself.');
    expect(splitControlsName('Hold for at least 1 s.').menu).toBe('');
  });
  it('groups binds into radar, weapons and countermeasures for every jet', () => {
    for (const ac of AIRCRAFT_ORDER) {
      const g = groupBinds(PROCEDURES[ac].binds);
      expect(g.radar.length, ac).toBeGreaterThan(2);
      expect(g.weapons.length, ac).toBeGreaterThan(0);
      expect(g.defence.length, ac).toBeGreaterThan(0);
      expect(g.radar.length + g.weapons.length + g.defence.length).toBe(PROCEDURES[ac].binds.length);
    }
  });
});

describe('missiles', () => {
  it('filters by jet and Fox number', () => {
    expect(filterMissiles('su27', { scope: 'jet', fox: 3, tokens: [] })).toHaveLength(0);
    expect(filterMissiles('su27', { scope: 'jet', fox: 0, tokens: [] }).map(m => m.id).sort())
      .toEqual([...AIRCRAFT.su27.missiles].sort());
    expect(filterMissiles('su27', { scope: 'all', fox: 0, tokens: [] })).toHaveLength(ALL_MISSILES.length);
    expect(filterMissiles('f15c', { scope: 'all', fox: 3, tokens: [] }).every(m => m.fox === 3)).toBe(true);
    expect(filterMissiles('f15c', { scope: 'all', fox: 0, tokens: queryTokens('j-11a') }).map(m => m.id)).toContain('r77');
  });
  it('sorts by any column, with stable tie-breaks', () => {
    const all = ALL_MISSILES.map(id => MISSILES[id]);
    const byHi = sortMissiles(all, { key: 'hi', dir: -1 });
    expect(byHi[0].ref.highHeadOnKm).toBe(Math.max(...all.map(m => m.ref.highHeadOnKm)));
    const byName = sortMissiles(all, { key: 'name', dir: 1 }).map(m => m.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, 'en')));
    const byPitbull = sortMissiles(all, { key: 'pitbull', dir: -1 });
    expect(byPitbull[0].pitbullKm).toBeDefined();
    expect(byPitbull[byPitbull.length - 1].pitbullKm).toBeUndefined();
  });
});

describe('radar and RWR', () => {
  it('marks the TWS patterns each jet accepts', () => {
    const f14 = AIRCRAFT.f14b;
    expect(twsAllows(f14, 20, 4)).toBe(true);
    expect(twsAllows(f14, 40, 2)).toBe(true);
    expect(twsAllows(f14, 10, 4)).toBe(false);
    expect(twsAllows(AIRCRAFT.fa18c, 40, 2)).toBe(true);
    expect(twsAllows(AIRCRAFT.fa18c, 30, 4)).toBe(false);
    expect(twsAllows(AIRCRAFT.m2000c, 30, 2)).toBe(false);
    // Hornet TWS has no 1-bar pattern and 4B only up to 40° wide (hornet-viper.md).
    expect(twsAllows(AIRCRAFT.fa18c, 10, 1)).toBe(false);
    expect(twsAllows(AIRCRAFT.fa18c, 20, 4)).toBe(true);
    expect(twsAllows(AIRCRAFT.fa18c, 10, 6)).toBe(true);
    expect(twsAllows(AIRCRAFT.fa18c, 20, 6)).toBe(false);
    // JF-17: ±60° 2-bar, ±25° 3-bar, ±10° 4-bar only.
    expect(twsAllows(AIRCRAFT.jf17, 60, 2)).toBe(true);
    expect(twsAllows(AIRCRAFT.jf17, 30, 2)).toBe(false);
    expect(twsAllows(AIRCRAFT.jf17, 60, 1)).toBe(false);
    expect(twsPatternText(twsPatternsOf('f14b') ?? [])).toBe('±20° 4-bar or ±40° 2-bar');
    expect(twsPatternText(twsPatternsOf('fa18c') ?? [])).toBe('2 bars up to ±40°, 4 bars up to ±20°, 6 bars at ±10°');
    // Every listed DCS pattern is a cell the table can show.
    for (const ac of AIRCRAFT_ORDER) {
      const list = twsPatternsOf(ac);
      if (!list) continue;
      const mx = scanMatrix(AIRCRAFT[ac], radarRules(ac).bugScan);
      const shown = mx.cells.flat().filter(c => c.tws).map(c => `${c.azHalfDeg}/${c.bars}`).sort();
      expect(shown).toEqual(list.map(([a, b]) => `${a}/${b}`).sort());
    }
    const m = scanMatrix(AIRCRAFT.f16c, { azHalfDeg: 25, bars: 3 });
    expect(m.az).not.toContain(25);
    expect(m.bars).not.toContain(3);
    expect(m.cells[m.bars.indexOf(4)][m.az.indexOf(60)].frameS).toBeCloseTo(8, 5);
  });
  it('says plainly what each jet can shoot at once', () => {
    expect(simultaneousText(AIRCRAFT.su27)).toBe('1 (STT)');
    expect(simultaneousText(AIRCRAFT.mig29s)).toBe('2 (СНП2)');
    expect(simultaneousText(AIRCRAFT.m2000c)).toBe('1 (PSIC)');
    expect(simultaneousText(AIRCRAFT.f15c)).toBe('4');
    expect(simultaneousText(AIRCRAFT.f16c)).toBe('6');
    // ED publishes no Hornet cap: do not print the 10 trackfiles as if it were one.
    expect(simultaneousText(AIRCRAFT.fa18c)).toBe('No published cap');
  });
  it('keeps the F-15 and the SA-15 apart on the scopes', () => {
    const rows = rwrRows(RWRS.alr56c).filter(r => r.symbol === '15');
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.airborne)?.emitters).toEqual(['f15c']);
    const spo = rwrRows(RWRS.spo15);
    expect(spo.find(r => r.symbol === 'П' && r.airborne)?.emitters).toHaveLength(10);
    for (const id of Object.keys(RWRS) as (keyof typeof RWRS)[]) {
      expect(rwrRows(RWRS[id]).reduce((n, r) => n + r.emitters.length, 0)).toBe(RWRS[id].symbols.length);
    }
  });
});

describe('SAM rows', () => {
  it('lists the three sites with this RWR symbol, ring and band in the chosen units', () => {
    const m = samRows('alr67', 'metric');
    expect(m.map(r => r.id)).toEqual(['sa10', 'sa11', 'sa15']);
    expect(m[1]).toMatchObject({ ring: '35 km', band: '15 m to 22000 m' });
    for (const r of m) expect(r.beat.length).toBeGreaterThan(10);
    const i = samRows('spo15', 'imperial');
    expect(i[0].ring).toMatch(/nm$/);
    expect(i[0].band).toMatch(/ft to .* ft$/);
  });
});
