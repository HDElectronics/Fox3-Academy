import { describe, expect, test } from 'vitest';
import { AIRCRAFT_ORDER, MISSILES } from '../../data';
import type { AircraftId, MissileId } from '../../data/types';
import { dlzTargetType, findRange } from '../../sim/dlz';
import {
  ASPECT_DEG, PRESET_IDS, buildPreset, cueNames, defaultMissile, defaultSetup, dlzAt, flyShot, guidanceRuleFor, launchKey, missileChoices,
  presetTitle, rangeSliderMax, roundRange, shooterTypeFor, targetTypeFor, toShotSetup, weaponStepKey, zonePlace,
} from './model';
import { hitsIfColdAtLaunch, presetTakeaway, reasonHeadline, summarize } from './lessons';
import { rangeSearch } from './exact';
import { shotRecording } from './frames';
import { niceStep, sampleAt } from './plots';

const ALL = AIRCRAFT_ORDER as AircraftId[];

describe('model', () => {
  test('passes the lab radar-support and Phoenix selection through to the shot', () => {
    const setup = { ...defaultSetup('f14b', 'imperial'), support: 'radar' as const, phoenixLaunchMode: 'pd-stt' as const };
    expect(toShotSetup(setup)).toMatchObject({ support: 'radar', phoenixLaunchMode: 'pd-stt' });
    const result = flyShot(setup);
    expect(result.trace[0].guidance).toBe('sarh');
    expect(result.pitbull).toBeNull();
  });

  test('every jet has a default radar missile it carries, and a sane default setup', () => {
    for (const ac of ALL) {
      const m = defaultMissile(ac);
      expect(MISSILES[m]).toBeTruthy();
      const s = defaultSetup(ac, 'metric');
      const d = dlzAt(s);
      expect(d.rmax).toBeGreaterThan(d.rne);
      expect(s.range).toBeGreaterThan(d.rmin);
      expect(s.range).toBeLessThan(d.rmax * 1.05);
    }
  });

  test('own missiles come first, every missile is offered once', () => {
    for (const ac of ALL) {
      const { own, other } = missileChoices(ac);
      expect(new Set([...own, ...other]).size).toBe(Object.keys(MISSILES).length);
      expect(own.length).toBeGreaterThan(0);
    }
  });

  test('cue names use each jet\'s own words', () => {
    expect(cueNames('su27', 'r27er')).toMatchObject({ rmax: 'Rmax', rne: 'Rtr', cue: 'ПР', prFraction: 0.85 });
    expect(cueNames('f15c', 'aim120c')).toMatchObject({ rmax: 'Rpi', rne: 'Rtr' });
    expect(cueNames('f15c', 'aim7m').cue).toContain('▲');
    expect(cueNames('fa18c', 'aim120c')).toMatchObject({ rmax: 'RMAX', rne: 'RNE', cue: 'SHOOT' });
    expect(cueNames('f16c', 'aim120c')).toMatchObject({ rmax: 'RPI', rne: 'RTR' });
    expect(cueNames('jf17', 'sd10').rne).toBe('NEZ');
    expect(cueNames('m2000c', 's530d').cue).toBe('TIR');
    for (const ac of ALL) expect(cueNames(ac, defaultMissile(ac)).lines.length).toBeGreaterThan(0);
  });

  test('launch and weapon-step keys come from the binds', () => {
    expect(launchKey('su27')).toBe('Space');
    expect(launchKey('f15c')).toBe('RAlt + Space');
    expect(launchKey('fa18c')).toBe('Space');
    expect(launchKey('f16c')).toBe('RAlt + Space');
    expect(launchKey('jf17')).toBe('RAlt + Space');
    expect(launchKey('m2000c')).toBe('Space');
    expect(launchKey('f14b')).toBeNull();
    expect(weaponStepKey('su27')).toBe('D');
    expect(weaponStepKey('f16c')).toBe('S');
  });

  test('shooter in 3D is your jet when it carries the missile', () => {
    expect(shooterTypeFor('su27', 'r27er')).toBe('su27');
    expect(shooterTypeFor('su27', 'aim120c')).not.toBe('su27');
  });

  test('zone place and helpers', () => {
    const d = { rmax: 50000, rne: 20000, rmin: 1000 };
    expect(zonePlace(500, d)).toBe('inside-rmin');
    expect(zonePlace(15000, d)).toBe('nez');
    expect(zonePlace(40000, d)).toBe('rne-rmax');
    expect(zonePlace(60000, d)).toBe('beyond-rmax');
    expect(rangeSliderMax(d, 'metric')).toBeGreaterThanOrEqual(67.5);
    expect(roundRange(40300, 'metric')).toBe(40000);
  });
});

describe('presets fly the lesson they promise', () => {
  const checks: [AircraftId, 'metric' | 'imperial'][] = [['su27', 'metric'], ['f15c', 'imperial'], ['fa18c', 'imperial'], ['m2000c', 'imperial'], ['mig29s', 'metric'], ['f14b', 'imperial']];
  for (const [ac, u] of checks) {
    test(ac, () => {
      const base = defaultSetup(ac, u);
      const fly = (id: typeof PRESET_IDS[number]) => buildPreset(id, base, ac, u).shots.map(s => ({ setup: s.setup, result: flyShot(s.setup) }));
      const hf = fly('high-fast');
      expect(hf[0].result.hit).toBe(true);
      expect(hf[1].result.hit).toBe(false);
      const hc = fly('hot-cold');
      expect(hc[0].result.hit).toBe(true);
      expect(hc[1].result.hit).toBe(false);
      expect(ASPECT_DEG[hc[1].setup.aspect]).toBe(180);
      const rc = fly('rmax-cold');
      expect(rc[0].result.hit).toBe(true);
      expect(rc[1].result.hit).toBe(false);
      const ne = fly('rne');
      expect(ne[0].result.hit).toBe(true);
      expect(ne[0].setup.maneuver).toBe('turn-cold');
      const lo = fly('loft');
      expect(MISSILES[lo[0].setup.missile].lofts).toBe(true);
      const top = (r: typeof lo[0]) => Math.max(...r.result.trace.map(s => s.missileAlt));
      expect(top(lo[0])).toBeGreaterThan(top(lo[1]) + 500);
      // loft off must not leak into later shots
      const again = flyShot(lo[0].setup);
      expect(top({ setup: lo[0].setup, result: again })).toBeCloseTo(top(lo[0]), 0);
    });
  }
});

describe('lessons', () => {
  test('headlines', () => {
    expect(reasonHeadline('hit', false)).toBe('HIT');
    expect(reasonHeadline('kinematic', false)).toContain('ENERGY');
    expect(reasonHeadline('chaff', false)).toContain('CHAFF');
  });

  test('a turn-cold miss explains the energy at the end in pilot words', () => {
    const ac: AircraftId = 'f15c';
    const base = defaultSetup(ac, 'imperial', 'aim120c');
    const [, cold] = buildPreset('rmax-cold', base, ac, 'imperial').shots;
    const r = flyShot(cold.setup);
    const sum = summarize(cold.setup, r, dlzAt(cold.setup), cueNames(ac, 'aim120c'), 'imperial');
    expect(sum.hit).toBe(false);
    expect(sum.lesson).toMatch(/turned cold/);
    expect(sum.lesson).toMatch(/Mach \d\.\d/);
    expect(sum.lesson).not.toMatch(/!/);
    expect(sum.endG).toBeGreaterThan(0);
  });

  test('a Flanker shot past 85 % Rmax says there is no ПР', () => {
    const s = defaultSetup('su27', 'metric', 'r27er');
    const d = dlzAt(s);
    const far = { ...s, range: 0.95 * d.rmax };
    const r = flyShot(far);
    const sum = summarize(far, r, dlzAt(far), cueNames('su27', 'r27er'), 'metric');
    expect(sum.cueNote).toMatch(/ПР/);
  });

  test('takeaways for every preset', () => {
    const ac: AircraftId = 'fa18c';
    const base = defaultSetup(ac, 'imperial');
    for (const id of PRESET_IDS) {
      const p = buildPreset(id, base, ac, 'imperial');
      const shots = p.shots.map(sh => {
        const result = flyShot(sh.setup);
        return { setup: sh.setup, result, sum: summarize(sh.setup, result, dlzAt(sh.setup), cueNames(ac, sh.setup.missile), 'imperial') };
      });
      const text = presetTakeaway(id, shots, 'imperial');
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toMatch(/!/);
    }
  });
});

describe('compute exactly', () => {
  test('the chunked search matches findRange', () => {
    const base = { missile: 'aim120c' as MissileId, shooterAlt: 10000, shooterMach: 0.9, targetAlt: 10000, targetMach: 0.9, aspectDeg: 0, reactAfter: 0 };
    const guess = 70000;
    const gen = rangeSearch(base, 'rmax', guess);
    let n = 0, r = gen.next();
    while (!r.done) { n++; r = gen.next(); }
    const ref = findRange(base, 'rmax', { guess });
    expect(r.value.range).toBeCloseTo(ref.range, -1);
    expect(n).toBeGreaterThan(3);
  });
});

describe('recording and plots', () => {
  test('a shot becomes a replayable recording with a tail', () => {
    const s = defaultSetup('su27', 'metric');
    const r = flyShot(s);
    const rec = shotRecording(r, s.missile, 'su27', 'f15c');
    expect(rec.frames.length).toBe(r.trace.length + 16);
    expect(rec.last).toBeGreaterThan(rec.end);
    expect(rec.roster.missiles.msl.result?.kind).toBe(r.hit ? 'hit' : 'miss');
    const f = rec.frames[0];
    expect(f.aircraft.map(a => a.id)).toEqual(['shooter', 'target']);
    expect(Math.abs(f.aircraft[1].heading - Math.PI)).toBeLessThan(0.05);
  });

  test('plot helpers', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(37, 4)).toBe(10);
    expect(sampleAt([0, 1, 2], [0, 10, 20], 1.5)).toBe(15);
    expect(sampleAt([0, 1, 2], [0, 10, 20], 3)).toBeNull();
  });
});

describe('review fixes', () => {
  test('the 3D target and the flown target follow the sim\'s own launch-zone rule', () => {
    for (const m of Object.keys(MISSILES) as MissileId[]) expect(targetTypeFor(m)).toBe(dlzTargetType(m));
  });

  test('loft off uses the sim\'s per-shot switch, only for missiles that loft', () => {
    const s = defaultSetup('f15c', 'metric', 'aim120c');
    expect(toShotSetup({ ...s, loftOff: true }).loft).toBe(false);
    expect(toShotSetup(s).loft).toBeUndefined();
    expect(toShotSetup({ ...defaultSetup('su27', 'metric', 'r27er'), loftOff: true }).loft).toBeUndefined();
  });

  test('guidance rule drops clauses about another jet', () => {
    expect(guidanceRuleFor('aim7m', 'fa18c')).not.toMatch(/F-15C/);
    expect(guidanceRuleFor('aim7m', 'fa18c')).toMatch(/^Hold STT/);
    expect(guidanceRuleFor('aim7m', 'f15c')).not.toMatch(/F-15C/); // FLOOD is an F-15C-only note now
    for (const ac of ALL) for (const m of Object.keys(MISSILES) as MissileId[]) expect(guidanceRuleFor(m, ac).length).toBeGreaterThan(10);
  });

  test('presets and cues use the jet\'s own words', () => {
    expect(presetTitle('rne', cueNames('su27', 'r27er'))).toBe('Rtr shot');
    expect(presetTitle('rmax-cold', cueNames('f15c', 'aim120c'))).toMatch(/^Rpi/);
    expect(buildPreset('rne', defaultSetup('jf17', 'metric'), 'jf17', 'metric').shots[0].name).toMatch(/^NEZ/);
  });

  test('a JF-17 shot between NEZ and RMAX says there is no SHOOT yet', () => {
    const s = defaultSetup('jf17', 'metric', 'sd10');
    const d = dlzAt(s);
    const mid = { ...s, range: (d.rne + d.rmax) / 2 };
    const sum = summarize(mid, flyShot(mid), dlzAt(mid), cueNames('jf17', 'sd10'), 'metric');
    expect(sum.cueNote).toMatch(/SHOOT.*only inside NEZ/);
  });

  test('beyond Rmax on the F-14 does not claim a cockpit cue that is only this trainer\'s label', () => {
    const s = defaultSetup('f14b', 'imperial', 'aim54c');
    const far = { ...s, range: dlzAt(s).rmax * 1.2 };
    const sum = summarize(far, flyShot(far), dlzAt(far), cueNames('f14b', 'aim54c'), 'imperial');
    expect(sum.cueNote).toMatch(/Rmax mark/);
    expect(sum.cueNote).not.toMatch(/IN RNG/);
  });

  test('an IR shot against a plain beam never says flares were dropped', () => {
    const s = { ...defaultSetup('su27', 'metric', 'r73'), maneuver: 'beam' as const, reactAfter: 3 };
    const near = { ...s, range: 0.5 * dlzAt(s).rmax };
    const r = flyShot(near);
    const sum = summarize(near, r, dlzAt(near), cueNames('su27', 'r73'), 'metric');
    expect(sum.lesson + sum.what).not.toMatch(/dropped flares/);
  });

  test('a straight-flying hit only claims a cold turn would beat it when that shot really misses', () => {
    for (const [ac, m] of [['su27', 'r27er'], ['f15c', 'aim120c'], ['su27', 'r73']] as [AircraftId, MissileId][]) {
      const s = defaultSetup(ac, 'metric', m);
      for (const frac of [0.4, 0.8]) {
        const shot = { ...s, range: frac * dlzAt(s).rmax };
        const r = flyShot(shot);
        if (!r.hit) continue;
        const sum = summarize(shot, r, dlzAt(shot), cueNames(ac, m), 'metric');
        const saysBeaten = /would have beaten/.test(sum.lesson);
        expect(saysBeaten).toBe(!hitsIfColdAtLaunch(shot));
      }
    }
  });
});
