import { describe, expect, it } from 'vitest';
import { ROUTES, routeFor } from '../../app/routes';
import { jetAllowed, pickerJets } from '../../app/roleGate';
import { LESSON_LINKS } from '../../app/navigation';
import { PROCEDURES } from '../../data/procedures';
import { parseKeyList } from '../../ui/keys';
import { LESSONS, LESSON_ORDER, MISS_TEXT, progressKey, scoreCcip, scoreVikhr, type ShotRecord } from './lessons';
import { START, buildScenario, centreOf } from './scenario';

const shot = (result: ShotRecord['result'], reason?: ShotRecord['reason']): ShotRecord => ({ weapon: 'vikhr', rangeM: 8000, result, reason, killed: result === 'hit' });

describe('strike route', () => {
  it('is an attack-only route in the lesson navigation', () => {
    const r = routeFor('strike');
    expect(r.path).toBe('strike');
    expect(jetAllowed(r, 'su25t')).toBe(true);
    expect(jetAllowed(r, 'f15c')).toBe(false);
    expect(pickerJets(r, 'su25t')).toEqual(['su25t']);
    expect(ROUTES.filter(x => x.roles?.includes('attack')).map(x => x.path)).toEqual(['strike']);
    expect(LESSON_LINKS.some(l => l.path === 'strike')).toBe(true);
  });
});

describe('strike lessons', () => {
  it('prints only bindable Su-25T keys that exist in the procedures data', () => {
    const binds = PROCEDURES.su25t.binds.map(b => b.keys).join(' ');
    for (const id of LESSON_ORDER) for (const s of LESSONS[id].steps) {
      if (!s.keys) continue;
      for (const k of ['7', 'O', 'RShift+O', 'Enter', 'Space', 'D']) if (s.keys.split(/[ ,]+/).includes(k)) expect(binds.replace(/ \+ /g, '+')).toContain(k);
      expect(parseKeyList(s.keys.split(' then ')[0]!.split(',')[0]!).length + (s.keys.includes('/') ? 1 : 0)).toBeGreaterThan(0);
    }
  });

  it('has a coaching line for every sim miss reason', () => {
    for (const r of ['lock-lost', 'laser-off', 'gimbal', 'terrain', 'emitter-off', 'target-dead', 'ground', 'timeout'] as const) expect(MISS_TEXT[r].length).toBeGreaterThan(10);
  });

  it('scores the Vikhr drill on kills and misses, with coaching per miss reason', () => {
    const clean = scoreVikhr({ shots: [shot('hit'), shot('hit'), shot('hit'), shot('hit')], tanks: 4, tanksKilled: 4, laserS: 60 });
    expect(clean.stars).toBe(3);
    expect(clean.passed).toBe(true);
    const sloppy = scoreVikhr({ shots: [shot('hit'), shot('miss', 'laser-off'), shot('miss', 'laser-off'), shot('hit'), shot('hit'), shot('miss', 'gimbal')], tanks: 4, tanksKilled: 3, laserS: 90 });
    expect(sloppy.stars).toBe(2);
    expect(sloppy.coaching.join(' ')).toContain('2 × Laser off');
    expect(sloppy.coaching.join(' ')).toContain('gimbal');
    expect(scoreVikhr({ shots: [], tanks: 4, tanksKilled: 0, laserS: 0 }).stars).toBe(0);
    expect(scoreVikhr({ shots: [shot('miss', 'lock-lost')], tanks: 4, tanksKilled: 0, laserS: 5 }).coaching[0]).toContain('Lock lost');
  });

  it('scores the CCIP pass', () => {
    expect(scoreCcip({ salvos: 2, kills: 2, bestMissM: 3 }).stars).toBe(3);
    expect(scoreCcip({ salvos: 2, kills: 0, bestMissM: 40 }).stars).toBe(1);
    expect(scoreCcip({ salvos: 0, kills: 0, bestMissM: null }).coaching[0]).toContain('Nothing fired');
    expect(progressKey('vikhr')).toBe('strike:vikhr:su25t');
  });
});

describe('strike scenario', () => {
  it('starts the Vikhr drill 12–15 km out with the platoon in view', () => {
    const sc = buildScenario('vikhr');
    const c = centreOf(sc.world, sc.tanks)!;
    const r = sc.me.pos.distanceTo(sc.world.groundUnits.get(sc.tanks[0]!)!.pos);
    expect(r).toBeGreaterThan(12000); expect(r).toBeLessThan(15000);
    expect(START.vikhr.rangeM).toBeGreaterThanOrEqual(12000);
    for (const id of sc.tanks) expect(sc.world.lineOfSight(sc.me.pos, sc.world.groundUnits.get(id)!.pos)).toBe(true);
    expect(c.y).toBeCloseTo(sc.groundM, 3);
  });

  it('flies a full Vikhr shot: lock, lase, ПР inside 10 km, hold to impact, tank destroyed', () => {
    const { world, me, tanks } = buildScenario('vikhr');
    const id = me.id;
    world.setAgMaster(id, 'ag');
    world.selectAgWeapon(id, 'vikhr');
    world.shkvalPower(id, true);
    const tank = world.groundUnits.get(tanks[1]!)!;
    world.shkvalPointAt(id, tank.pos);
    expect(world.shkvalStabilise(id, true).ok).toBe(true);
    world.shkvalZoom(id, 1); world.shkvalZoom(id, 1);
    expect(world.shkvalLock(id).ok).toBe(true);
    expect(world.laser(id, true).ok).toBe(true);
    let t = 0;
    while (!world.canAgLaunch(id).pr && t < 60) { world.step(0.1); t += 0.1; }
    const check = world.canAgLaunch(id);
    expect(check.pr).toBe(true);
    expect(check.range!).toBeLessThanOrEqual(10000);
    const out = world.agLaunch(id);
    expect(Array.isArray(out)).toBe(true);
    for (let i = 0; i < 400 && world.agWeapons.size && [...world.agWeapons.values()].some(w => w.alive); i++) world.step(0.1);
    expect(tank.alive).toBe(false);
  });
});
