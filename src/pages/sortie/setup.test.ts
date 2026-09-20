import { describe, expect, test } from 'vitest';
import { article, briefFacts, defaultSetup, multiShot, parseSetup } from './setup';
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
  test('rejects prototype keys and clamps numbers', () => {
    const s = parseSetup('su27', JSON.stringify({ enemy: 'constructor', range: 1e9, playerAlt: -5, skill: 'god' }));
    const d = defaultSetup('su27');
    expect(s.enemy).toBe(d.enemy);
    expect(s.range).toBe(170_000);
    expect(s.playerAlt).toBe(2_000);
    expect(s.skill).toBe(d.skill);
  });
});

test('a headless (scripted) sortie is marked scripted, so the debrief never saves it', () => {
  const o = simulateSortie('f15c', defaultSetup('f15c'), 'imperial');
  expect(o.scripted).toBe(true);
});
