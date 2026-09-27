import { describe, expect, test } from 'vitest';
import { article, briefFacts, buildSortie, burnThroughLabel, defaultSetup, ecmBriefLines, multiShot, parseEcm, parseSetup } from './setup';
import { applyParams } from './index';
import { jammerKey, jetKeyMap } from './keys';
import { AIRCRAFT, FIGHTER_ORDER } from '../../data/aircraft';
import { BURN_THROUGH_M, ECM_USING, OWN_JAMMER } from '../../data/ecm';
import { fmtRange } from '../../app/format';
import { World } from '../../sim/world';
import { simulateSortie } from './headless';

describe('brief facts', () => {
  test('articles by the spoken first sound', () => {
    expect(article('MiG-29S')).toBe('a');
    expect(article('Su-27')).toBe('an');
    expect(article('F-16C')).toBe('an');
    expect(article('M-2000C')).toBe('an');
    expect(article('J-11A')).toBe('a');
    const f = briefFacts('fa18c', defaultSetup('fa18c'), 'imperial');
    expect(f.radar).toMatch(/sees a MiG-29S head-on/);
  });

  test('multi-target Fox 3 never claims more targets than missiles carried', () => {
    expect(multiShot('fa18c')).toBe('each of your 6 AIM-120C can go to a different target.');
    expect(multiShot('f15c')).toBe('the F-15C guides Fox 3s at up to 4 targets at once.');
    expect(multiShot('jf17')).toMatch(/up to 2 targets/);
    expect(briefFacts('fa18c', defaultSetup('fa18c'), 'imperial').yourJet.join(' ')).not.toMatch(/up to 10/);
  });

  test('an STT Fox 3 is flagged as not verified; a TWS one as silent', () => {
    const vsFlanker = briefFacts('f16c', defaultSetup('f16c'), 'imperial');   // J-11A: R-77 from STT
    expect(vsFlanker.threats.find(t => t.startsWith('R-77'))).toMatch(/lock; here, no launch warning.*not verified/);
    const vsEagle = briefFacts('su27', defaultSetup('su27'), 'metric');       // F-15C: AIM-120 from TWS
    expect(vsEagle.threats.find(t => t.startsWith('AIM-120C'))).toMatch(/from TWS: no lock, no launch warning/);
  });
});

describe('parseSetup', () => {
  test('replaces a stored attack opponent with the default fighter for the brief and fight', () => {
    const s = parseSetup('f15c', JSON.stringify({ enemy: 'su25t', skill: 'veteran' }));
    expect(s.enemy).toBe(defaultSetup('f15c').enemy);
    expect(s.skill).toBe('veteran');
    expect(() => briefFacts('f15c', s, 'imperial')).not.toThrow();
    expect(() => buildSortie(new World(1), 'f15c', s, 'imperial')).not.toThrow();
  });
  test('retains a valid stored fighter opponent', () => {
    expect(parseSetup('f15c', JSON.stringify({ enemy: 'm2000c' })).enemy).toBe('m2000c');
  });
  test('rejects prototype keys and clamps numbers', () => {
    const s = parseSetup('su27', JSON.stringify({ enemy: 'constructor', range: 1e9, playerAlt: -5, skill: 'god' }));
    const d = defaultSetup('su27');
    expect(s.enemy).toBe(d.enemy);
    expect(s.range).toBe(170_000);
    expect(s.playerAlt).toBe(2_000);
    expect(s.skill).toBe(d.skill);
  });
});

describe('bandit ECM', () => {
  test('defaults to Never and survives storage; junk falls back', () => {
    expect(defaultSetup('f15c').ecm).toBe('never');
    expect(parseSetup('f15c', JSON.stringify({ ecm: 'always' })).ecm).toBe('always');
    expect(parseSetup('f15c', JSON.stringify({ ecm: 'sometimes' })).ecm).toBe('never');
    expect(parseSetup('f15c', JSON.stringify({})).ecm).toBe('never');
    for (const x of ECM_USING) expect(parseEcm(x.id)).toBe(x.id);
    expect(parseEcm('constructor')).toBeNull();
  });

  test('URL ?ecm= sets the option, anything else keeps it', () => {
    const d = defaultSetup('su27');
    expect(applyParams(d, new URLSearchParams('ecm=detected')).ecm).toBe('detected');
    expect(applyParams({ ...d, ecm: 'locked' }, new URLSearchParams('ecm=bogus')).ecm).toBe('locked');
  });

  test('every bandit gets the option: "always" jams, "never" does not', () => {
    for (const [ecm, want] of [['always', true], ['never', false]] as const) {
      const s = { ...defaultSetup('f15c'), scenario: '1v2' as const, ecm };
      const w = new World(3);
      const eng = buildSortie(w, 'f15c', s, 'imperial');
      for (let i = 0; i < 20; i++) w.step(0.25);
      for (const id of eng.enemyIds) expect(w.get(id)?.jamming, `${ecm} ${id}`).toBe(want);
      expect(w.get(eng.playerId)?.jamming).toBe(false);
    }
  });

  test('a bandit without a jammer never jams, and the brief says so', () => {
    const s = { ...defaultSetup('f15c'), enemy: 'j11a' as const, ecm: 'always' as const };
    const w = new World(3);
    const eng = buildSortie(w, 'f15c', s, 'imperial');
    for (let i = 0; i < 20; i++) w.step(0.25);
    expect(w.get(eng.enemyIds[0])?.jamming).toBe(false);
    expect(ecmBriefLines('f15c', s, 'imperial', 'E')[0]).toMatch(/J-11A has no jammer.*never jams/);
  });

  test('brief line per jet: burn-through in your units, labelled by source; own jammer key notes', () => {
    for (const ac of FIGHTER_ORDER) {
      const units = AIRCRAFT[ac].nation === 'ru' ? 'metric' : 'imperial';
      const enemy = ac === 'f15c' ? 'su27' : 'f15c';
      const key = jammerKey(jetKeyMap(ac)).key;
      const lines = ecmBriefLines(ac, { ecm: 'always', enemy }, units, key);
      const burn = fmtRange(BURN_THROUGH_M[ac].value, units, 0);
      expect(lines[0], ac).toContain(`burn-through at about ${burn} (${burnThroughLabel(ac)})`);
      expect(lines[0], ac).toMatch(/strobe: bearing, no range/);
      const own = OWN_JAMMER[ac];
      const last = lines[lines.length - 1];
      if (!own) expect(last, ac).toMatch(/No jammer/);
      else if (!key) expect(last, ac).toMatch(/a button here/);
      else {
        expect(last, ac).toContain(`(${own.key}`);
        expect(last.includes('trainer key'), ac).toBe(own.trainerKey);
        expect(last.includes('not verified'), ac).toBe(!own.verified);
      }
    }
    expect(burnThroughLabel('f15c')).toBe('ED manual');
    expect(burnThroughLabel('f16c')).toBe('community');
    expect(ecmBriefLines('su27', { ecm: 'always', enemy: 'f15c' }, 'metric', 'E')[0]).toContain('25 km');
    expect(ecmBriefLines('m2000c', { ecm: 'never', enemy: 'su27' }, 'imperial', 'E')[0]).toMatch(/no jamming/);
    expect(ecmBriefLines('f15c', { ecm: 'always', enemy: 'su27' }, 'imperial', 'E')[1]).toMatch(/AIM-120C.*can home on the jam/);
  });
});

test('a headless (scripted) sortie is marked scripted, so the debrief never saves it', () => {
  const o = simulateSortie('f15c', defaultSetup('f15c'), 'imperial');
  expect(o.scripted).toBe(true);
});
