/** [OWNER: page-merge] Close-range lock and IR shot lesson: scoring, demo runs per jet, flares, free-fight IR shots. */
import { describe, expect, it } from 'vitest';
import type { FighterId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { debrief, emptyMetrics, IR_LESSONS, LESSON_ORDER, SCORED_LESSONS, scoreLesson } from './lessons';
import { MergeRun } from './runner';

function run(ac: FighterId, s: number) {
  const r = new MergeRun(ac, 'ir', 'turn', 7);
  r.world.record = false;
  r.autopilot = 'ir';
  r.start();
  for (let i = 0; i < s * 30 && r.phase === 'run'; i++) r.tick(1 / 30);
  return r;
}

describe('close-range lock and IR shot', () => {
  it('is a scored lesson before the free fight; IR shots only there and in the fight', () => {
    expect(LESSON_ORDER.indexOf('ir')).toBe(LESSON_ORDER.indexOf('fight') - 1);
    expect(SCORED_LESSONS).toContain('ir');
    expect(IR_LESSONS).toEqual(['ir', 'fight']);
  });

  it('scores lock time, shots in the zone and the result', () => {
    const m = emptyMetrics();
    expect(scoreLesson('ir', m)).toBe(0);
    m.lockS = 3; m.irShots = 1; m.irInZone = 1; m.irHits = 1;
    expect(scoreLesson('ir', m)).toBe(100);
    m.irHits = 0; m.irFlared = 1;
    expect(scoreLesson('ir', m)).toBe(80);
    m.irInZone = 0; m.irFlared = 0; m.irMissed = 1;
    expect(scoreLesson('ir', m)).toBe(30);
    m.lockS = 25;
    expect(scoreLesson('ir', m)).toBe(0);
    const d = debrief('ir', { ...emptyMetrics(), lockS: 4, acmMode: 'VS', irShots: 1, irInZone: 1, irFlared: 1, irOffDeg: 12, irRangeM: 2000 },
      { corner: '430 kt', minSpeed: '300 kt', irMissile: 'R-73', fc3: true });
    expect(d.stats).toContainEqual(['Result', 'Decoyed by flares']);
    expect(d.stats).toContainEqual(['Time to lock', '4.0 s']);
    expect(d.coaching.join(' ')).toContain('flares');
  });

  it.each(['su27', 'mig29s', 'f15c', 'fa18c', 'f16c', 'f14b', 'jf17', 'm2000c'] as FighterId[])(
    '%s: the demo autopilot locks, gets the tone and fires in the zone; the bandit flares', ac => {
      const r = run(ac, 25);
      const m = r.metrics;
      expect(m.lockS, ac).not.toBeNull();
      expect(m.lockS!).toBeLessThan(12);
      expect(m.irShots).toBeGreaterThanOrEqual(1);
      expect(m.irInZone).toBeGreaterThanOrEqual(1);
      expect(m.irOffDeg!).toBeLessThanOrEqual(r.acm!.jet.ir.launchLimitDeg.value);
      expect(r.bandit.flares).toBeLessThan(AIRCRAFT[r.bandit.type as FighterId].cms.flares);
      expect(m.irHits + m.irFlared + m.irMissed).toBeGreaterThanOrEqual(1);
    });

  it('is deterministic', () => {
    expect(run('su27', 20).metrics).toEqual(run('su27', 20).metrics);
  });

  it('allows an IR shot in the free fight; a shot on the growl is not in the zone', () => {
    const r = new MergeRun('fa18c', 'fight', 'rookie', 7);
    r.world.record = false;
    r.me.pos.set(0, 4600, 0);
    r.bandit.pos.set(0, 4600, -2500);
    r.bandit.vel.copy(r.me.vel);
    r.start();
    r.tick(0.1);
    expect(r.acm!.seeker.tone).toBe('growl');
    const s = r.fireIr();
    expect(s?.ok).toBe(true);
    expect(r.metrics.irShots).toBe(1);
    expect(r.metrics.irInZone).toBe(0);
  });
});
