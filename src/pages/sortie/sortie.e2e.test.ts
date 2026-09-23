/**
 * End to end, no DOM: every jet flies a whole sortie with the scripted pilot through the same builder,
 * recorder and end rules as the page, and the debrief analysis runs on the result.
 */
import { describe, expect, test } from 'vitest';
import { FIGHTER_ORDER } from '../../data/aircraft';
import { simulateSortie } from './headless';
import { defaultSetup, SORTIE_LIMIT_S } from './setup';
import { coachSortie, describeShot, scoreSortie } from './coach';

describe('sortie end to end', () => {
  for (const ac of FIGHTER_ORDER) {
    test(`${ac}: 1v1 flies to an end and debriefs`, () => {
      const setup = defaultSetup(ac);
      const o = simulateSortie(ac, setup, 'metric');
      expect(o.world.t).toBeLessThanOrEqual(SORTIE_LIMIT_S + 5);
      expect(['win', 'loss', 'draw']).toContain(o.result.outcome);
      const inp = o.recorder.input();
      expect(inp.samples.length).toBeGreaterThan(10);
      // Someone fired, and every finished shot has its launch zone and outcome.
      expect(inp.shots.length).toBeGreaterThan(0);
      for (const s of inp.shots) {
        if (s.targetId) expect(s.rmax).toBeGreaterThan(0);
        if (s.outcome !== 'flying') expect(s.endT).not.toBeNull();
        const row = describeShot(s, inp);
        expect(row.title.length).toBeGreaterThan(3);
      }
      const items = coachSortie(inp);
      expect(items.every(i => i.text.length > 10 && !/undefined|NaN/.test(i.text))).toBe(true);
      const sc = scoreSortie(inp, o.result, setup.skill, setup.scenario);
      expect(Number.isFinite(sc.score)).toBe(true);
      if (o.result.outcome === 'loss') expect(sc.score).toBe(0);
    });
  }

  test('2v2 with the wingman records the wingman and both bandits', () => {
    const setup = { ...defaultSetup('f15c'), scenario: '2v2' as const, skill: 'veteran' as const };
    const o = simulateSortie('f15c', setup, 'imperial');
    const inp = o.recorder.input();
    expect(inp.friends).toEqual(['wingman']);
    expect(inp.enemies.length).toBe(2);
    expect(inp.samples[0].bandits.length).toBe(2);
    expect(coachSortie(inp).every(i => !/undefined|NaN/.test(i.text))).toBe(true);
  });

  test('the same setup gives the same fight (Fly again)', () => {
    const a = simulateSortie('su27', defaultSetup('su27'), 'metric');
    const b = simulateSortie('su27', defaultSetup('su27'), 'metric');
    expect(a.result).toEqual(b.result);
    expect(a.recorder.shots.length).toBe(b.recorder.shots.length);
  });
});
