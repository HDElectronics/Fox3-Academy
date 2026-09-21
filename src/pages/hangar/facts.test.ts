import { describe, expect, it } from 'vitest';
import { AIRCRAFT, AIRCRAFT_ORDER, MISSILES } from '../../data';
import type { Units } from '../../app/format';
import {
  LESSON_PATH, capFacts, detectSource, detectionScale, guidanceRuleFor, headlineBind, isDone, lessonLine, modeChips,
  nextLesson, niceScale, primaryRadarMissile, refLegend, tileFacts, twsRule, weaponCols, weaponFacts, weaponScale, weaponsSummary,
  type LessonRoute,
} from './facts';

const UNITS: Units[] = ['metric', 'imperial'];
const clean = (s: string) => {
  expect(s.length).toBeGreaterThan(10);
  expect(s).not.toMatch(/undefined|NaN|null|Infinity|!/);
};

describe('jet tiles', () => {
  it('flags Fox 3 and multi-target from data', () => {
    const f = (id: Parameters<typeof tileFacts>[0]) => { const t = tileFacts(id); return [t.fox3, t.multi]; };
    expect(f('su27')).toEqual([false, false]);
    expect(f('su33')).toEqual([false, false]);
    expect(f('j11a')).toEqual([true, false]);
    expect(f('mig29s')).toEqual([true, true]);
    expect(f('f15c')).toEqual([true, true]);
    expect(f('m2000c')).toEqual([false, false]);
    expect(tileFacts('fa18c').module).toBe('FULL');
    expect(tileFacts('su27').module).toBe('FC3');
  });
});

describe('capability readout', () => {
  it('works for every jet in both units', () => {
    for (const id of AIRCRAFT_ORDER) for (const u of UNITS) {
      const c = capFacts(AIRCRAFT[id], u);
      clean(c.tws.rule);
      expect(c.modes.length).toBeGreaterThanOrEqual(3);
      expect(c.scan.frameS).toBeGreaterThan(0);
      expect(c.detectHeadOnM).toBeGreaterThan(c.detectTailM);
    }
  });
  it('says plainly what a jet cannot do', () => {
    // A radar with neither multi-target nor single-target TWS metadata.
    const bare = { ...AIRCRAFT.m2000c, radar: { ...AIRCRAFT.m2000c.radar, singleTargetTws: undefined } };
    expect(twsRule(bare, 'metric').answer).toBe('NO TWS');
    expect(modeChips(bare).some(m => m.mode === 'tws' && m.missing)).toBe(true);
    const su = twsRule(AIRCRAFT.su27, 'metric');
    expect(su.answer).toBe('NO');
    expect(su.rule).toContain('85 %');
    expect(twsRule(AIRCRAFT.mig29s, 'metric').rule).toContain('СНП2');
    expect(twsRule(AIRCRAFT.j11a, 'imperial').rule).toMatch(/R-77.*nm/);
    const f15 = twsRule(AIRCRAFT.f15c, 'imperial');
    expect(f15.yes).toBe(true);
    expect(f15.rule).toContain('AIM-7M still needs STT');
    expect(twsRule(AIRCRAFT.jf17, 'imperial').rule).toContain('SD-10');
    expect(twsRule(AIRCRAFT.f14b, 'imperial').rule).toContain('AIM-7M still needs PD STT');
  });
  it('gives the M-2000C its single-target PSID, not a flat "no TWS"', () => {
    const m = AIRCRAFT.m2000c;
    const chip = modeChips(m).find(c => c.mode === 'tws');
    expect(chip).toMatchObject({ label: 'PSID', limited: true });
    expect(chip?.missing).toBeFalsy();
    const r = twsRule(m, 'imperial');
    expect(r.answer).toBe('NO');
    expect(r.rule).toMatch(/No multi-target TWS.*PSID.*PSIC/);
    expect(capFacts(m, 'imperial').twsTracks).toBe('1 (PSID)');
    expect(lessonLine('tws', m, 'imperial')).toContain('no multi-target TWS');
  });
  it('never says a TWS target hears nothing (his RWR still shows your search)', () => {
    for (const id of AIRCRAFT_ORDER) for (const u of UNITS) {
      const texts = [twsRule(AIRCRAFT[id], u).rule, weaponsSummary(AIRCRAFT[id]), ...LESSON_PATH.map(r => lessonLine(r, AIRCRAFT[id], u))];
      for (const t of texts) expect(t).not.toMatch(/hears nothing|silent until/);
    }
    expect(twsRule(AIRCRAFT.f15c, 'imperial').rule).toContain('no lock or launch warning');
  });
  it('marks the Hornet target cap as simplified and keeps confirmed caps plain', () => {
    expect(capFacts(AIRCRAFT.fa18c, 'imperial').targetsAtOnce).toBe('10 (simplified)');
    expect(twsRule(AIRCRAFT.fa18c, 'imperial').rule).toContain('several targets');
    expect(lessonLine('tws', AIRCRAFT.fa18c, 'imperial')).not.toContain('up to 10');
    expect(capFacts(AIRCRAFT.f16c, 'imperial').targetsAtOnce).toBe('6');
    expect(capFacts(AIRCRAFT.f15c, 'imperial').targetsAtOnce).toBe('4');
  });
  it('derives single-target modes and cap caveats from radar metadata, independent of aircraft id', () => {
    const mirage = { ...AIRCRAFT.m2000c, radar: { ...AIRCRAFT.m2000c.radar, singleTargetTws: undefined } };
    expect(modeChips(mirage).find(c => c.mode === 'tws')).toMatchObject({ missing: true });
    expect(capFacts(mirage, 'imperial').twsTracks).toBe('none');
    const hornet = { ...AIRCRAFT.fa18c, radar: { ...AIRCRAFT.fa18c.radar, tws: { ...AIRCRAFT.fa18c.radar.tws!, capConfidence: 'documented' as const } } };
    expect(capFacts(hornet, 'imperial').targetsAtOnce).toBe('10');
    expect(twsRule(hornet, 'imperial').rule).toContain('up to 10 targets');
  });
  it('names where each detection figure comes from', () => {
    expect(detectSource(AIRCRAFT.su27)).toBe('DCS AI table');
    expect(detectSource(AIRCRAFT.f14b)).toBe('Heatblur manual');
    expect(detectSource(AIRCRAFT.m2000c)).not.toBe('DCS AI table');
  });
  it('uses cockpit mode labels', () => {
    expect(modeChips(AIRCRAFT.su27).map(m => m.label)).toEqual(['ОБЗ ДВБ', 'СНП ДВБ', 'АТК ДВБ']);
    expect(modeChips(AIRCRAFT.f14b).map(m => m.label)).toContain('PD STT');
  });
});

describe('scales', () => {
  it('covers the maximum with round ticks', () => {
    for (const u of UNITS) {
      const s = detectionScale(u);
      expect(s.ticks[0]).toBe(0);
      expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
      expect(s.max).toBeGreaterThanOrEqual(u === 'metric' ? 167 : 167 / 1.852);
    }
    expect(niceScale(59000, 'metric').max).toBe(60);
    expect(niceScale(120000, 'metric').max).toBe(120);
    expect(weaponScale(AIRCRAFT.f14b, 'metric').max).toBeGreaterThanOrEqual(120);
  });
});

describe('weapons', () => {
  it('one card per carried missile, every jet', () => {
    for (const id of AIRCRAFT_ORDER) for (const u of UNITS) {
      const w = weaponFacts(AIRCRAFT[id], u);
      expect(w.map(x => x.id)).toEqual(AIRCRAFT[id].missiles);
      for (const x of w) {
        clean(x.rule);
        expect(x.ranges.every(r => r.m > 0)).toBe(true);
        if (MISSILES[x.id].seeker === 'arh') expect(x.pitbull).toMatch(u === 'metric' ? /km$/ : /nm$/);
      }
      clean(weaponsSummary(AIRCRAFT[id]));
    }
  });
  it('drops rule clauses that name another jet', () => {
    // The F-15C-only FLOOD option lives in the AIM-7M notes, not in the shared guidance rule.
    expect(MISSILES.aim7m.guidanceRule).not.toContain('F-15C');
    expect(MISSILES.aim7m.notes.some(n => n.startsWith('F-15C only') && n.includes('FLOOD'))).toBe(true);
    expect(guidanceRuleFor(MISSILES.aim7m, AIRCRAFT.fa18c)).not.toContain('F-15C');
    expect(guidanceRuleFor(MISSILES.aim7m, AIRCRAFT.fa18c)).toMatch(/impact\.$/);
    expect(guidanceRuleFor(MISSILES.s530d, AIRCRAFT.m2000c)).toBe(MISSILES.s530d.guidanceRule);
  });
  it('picks the main radar missile', () => {
    expect(primaryRadarMissile(AIRCRAFT.su27)?.id).toBe('r27er');
    expect(primaryRadarMissile(AIRCRAFT.f14b)?.id).toBe('aim54c');
    expect(primaryRadarMissile(AIRCRAFT.m2000c)?.id).toBe('s530d');
    expect(weaponsSummary(AIRCRAFT.su27)).toMatch(/^No Fox 3/);
    expect(weaponsSummary(AIRCRAFT.f15c)).toBe('Fire the AIM-120B or AIM-120C from TWS and the target gets no lock or launch warning until the missile goes active.');
    expect(weaponsSummary(AIRCRAFT.j11a)).toMatch(/^R-77 is the Fox 3 here, but it leaves from STT/);
  });
  it('lays weapon cards out in full rows', () => {
    expect([2, 4, 5, 6].map(weaponCols)).toEqual([2, 4, 5, 3]);
    for (const id of AIRCRAFT_ORDER) {
      const n = AIRCRAFT[id].missiles.length, c = weaponCols(n);
      expect(n % c === 0 || n % c >= c - 1).toBe(true);
    }
  });
  it('uses missile confidence when marking pitbull distances', () => {
    for (const id of AIRCRAFT_ORDER) for (const w of weaponFacts(AIRCRAFT[id], 'metric')) {
      if (MISSILES[w.id].seeker === 'arh') expect(w.pitbull.startsWith('~')).toBe(MISSILES[w.id].pitbullApprox);
    }
  });
  it('does not claim M0.85 at 1 km in the range legend', () => {
    for (const u of UNITS) {
      expect(refLegend(u)).not.toMatch(/M0\.85/);
      expect(refLegend(u)).toContain('900 km/h');
    }
  });
});

describe('lessons', () => {
  it('has jet-aware copy for every route, jet and unit', () => {
    const routes: LessonRoute[] = [...LESSON_PATH, 'reference'];
    for (const id of AIRCRAFT_ORDER) for (const u of UNITS) for (const r of routes) clean(lessonLine(r, AIRCRAFT[id], u));
    expect(lessonLine('tws', AIRCRAFT.su27, 'metric')).toContain('0.85 Rmax');
    expect(lessonLine('tws', AIRCRAFT.m2000c, 'imperial')).toContain('no multi-target TWS');
    expect(lessonLine('defense', AIRCRAFT.su27, 'metric')).not.toMatch(/drag cold when it runs out/);
    expect(lessonLine('tws', AIRCRAFT.f15c, 'imperial')).toContain('PDT');
    expect(lessonLine('radar', AIRCRAFT.su27, 'metric')).toContain('km/h');
    expect(lessonLine('radar', AIRCRAFT.f16c, 'imperial')).toContain('kt');
    expect(lessonLine('rwr', AIRCRAFT.su27, 'metric')).toContain('П');
  });
  it('reads progress by route and page-folder keys', () => {
    const store: Record<string, boolean> = { 'radar:su27:done': true, 'missile-lab:su27:done': true, 'tws:f15c:done': true };
    const get = (k: string) => store[k];
    expect(isDone('radar', 'su27', get)).toBe(true);
    expect(isDone('missiles', 'su27', get)).toBe(true);
    expect(isDone('tws', 'su27', get)).toBe(false);
    expect(nextLesson('su27', get)).toBe('tws');
    expect(nextLesson('f16c', get)).toBe('radar');
    const all = Object.fromEntries(LESSON_PATH.map(r => [`${r}:jf17:done`, 1]));
    expect(nextLesson('jf17', k => all[k])).toBe(null);
    expect(isDone('radar', 'su27', () => false)).toBe(false);
  });
  it('has a headline bind for every jet', () => {
    for (const id of AIRCRAFT_ORDER) {
      const b = headlineBind(AIRCRAFT[id]);
      expect(b).not.toBeNull();
      expect(b?.action.length).toBeGreaterThan(2);
    }
    expect(headlineBind(AIRCRAFT.su27)?.keys).toBe('RAlt + I');
    // Qualifiers that change what the key does must survive the trim (TMS Right short = bug, held 1 s = TWS).
    expect(headlineBind(AIRCRAFT.f16c)?.action).toBe('TWS on / off (hold 1 s)');
    expect(headlineBind(AIRCRAFT.jf17)?.action).toContain('2nd press');
    expect(headlineBind(AIRCRAFT.m2000c)?.action).toBe('Lock (PSIC)');
  });
});
