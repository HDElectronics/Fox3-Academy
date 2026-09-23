import { describe, expect, it } from 'vitest';
import { FIGHTER_ORDER } from '../../data/aircraft';
import {
  SAM_DRILLS, SamRunner, emptySamMetrics, isSamDrill, samBrief, samCoach, samDebrief, samSetupFor, type SamCoachInput, type SamMetrics,
} from './samRun';

function fly(r: SamRunner, auto: boolean, maxS = 240): void {
  r.start();
  const st = { lastChaff: -9 };
  for (let i = 0; i < maxS * 30 && r.phase === 'run'; i++) {
    if (auto) r.autoDefend(st);
    r.tick(1 / 30, 1 / 30);
  }
}

describe('SAM drill setup and brief', () => {
  it('recognises the three drill ids only', () => {
    expect(SAM_DRILLS).toEqual(['sa10', 'sa11', 'sa15']);
    expect(isSamDrill('sa11')).toBe(true);
    expect(isSamDrill('lock')).toBe(false);
    expect(isSamDrill(null)).toBe(false);
  });

  it('briefs ring, band and RWR symbol for every jet', () => {
    for (const ac of FIGHTER_ORDER) for (const sam of SAM_DRILLS) {
      const b = samBrief(sam, ac, 'metric');
      expect(b.ring).toMatch(/km$/);
      expect(b.defeat.length).toBeGreaterThan(0);
      expect(b.notVerified.length).toBeGreaterThan(0);
      expect(b.rwr).toMatch(/search/);
    }
    expect(samBrief('sa11', 'f15c', 'metric').ring).toBe('35 km');
  });
});

describe('SAM drill runs', () => {
  it('goes search, lock, launch and ends when you hold hot', () => {
    const r = new SamRunner('f15c', samSetupFor('sa11'), 'metric', 11);
    fly(r, false);
    const m = r.metrics;
    expect(r.phase).toBe('end');
    expect(m.searchT).not.toBeNull();
    expect(m.trackT).not.toBeNull();
    expect(m.launchT).not.toBeNull();
    expect(m.searchT!).toBeLessThanOrEqual(m.trackT!);
    expect(m.trackT!).toBeLessThan(m.launchT!);
    expect(m.result).not.toBeNull();
  });

  it('a beam with chaff breaks the SA-11 track and gets a debrief', () => {
    const r = new SamRunner('su27', samSetupFor('sa11'), 'metric', 5);
    fly(r, true);
    expect(r.metrics.reactT).not.toBeNull();
    expect(r.metrics.chaffUsed).toBeGreaterThan(0);
    const d = samDebrief(r.metrics);
    expect(d.score).toBeGreaterThan(0);
    expect(d.coaching.length).toBeGreaterThan(0);
  });
});

describe('SAM coaching and debrief text', () => {
  const base: SamCoachInput = { sam: 'sa11', phase: 'run', rwr: 'none', inNotch: false, man: 'hold', inRing: false, masked: false, terrain: false, lastLost: null };

  it('tells you to beam at the launch, then chaff once in the notch', () => {
    expect(samCoach({ ...base, rwr: 'launch' })[0]).toMatch(/Beam the site/);
    expect(samCoach({ ...base, rwr: 'launch' })[2]).toBe('warning');
    expect(samCoach({ ...base, rwr: 'launch', man: 'notch-l', inNotch: true })[0]).toMatch(/Chaff now/);
    expect(samCoach({ ...base, rwr: 'launch', sam: 'sa10' })[1]).toMatch(/hardest/);
    expect(samCoach({ ...base, rwr: 'lock', inRing: true })[2]).toBe('caution');
    expect(samCoach({ ...base, lastLost: 'chaff' })[0]).toMatch(/Track broken/);
  });

  it('never uses exclamation marks', () => {
    for (const rwr of ['none', 'search', 'lock', 'launch'] as const) for (const man of ['hold', 'notch-l'] as const) {
      const [a, b] = samCoach({ ...base, rwr, man, inNotch: man !== 'hold' });
      expect(a + b).not.toMatch(/!/);
    }
  });

  it('scores a hit low and a broken track high', () => {
    const hit: SamMetrics = { ...emptySamMetrics('sa11', 5000), launchT: 20, launches: 1, result: 'hit' };
    expect(samDebrief(hit).survived).toBe(false);
    expect(samDebrief(hit).score).toBeLessThanOrEqual(30);
    const clean: SamMetrics = { ...emptySamMetrics('sa11', 5000), launchT: 20, launches: 1, reactT: 21, lost: ['chaff'], chaffUsed: 3, chaffInNotch: 3, result: 'defeated' };
    const d = samDebrief(clean);
    expect(d.passed).toBe(true);
    expect(d.score).toBe(100);
    expect(d.why).toMatch(/chaff/);
  });
});
