import { describe, expect, it } from 'vitest';
import { ROUTES, routeFor } from '../../app/routes';
import { jetAllowed, pickerJets } from '../../app/roleGate';
import { LESSON_LINKS } from '../../app/navigation';
import { PROCEDURES } from '../../data/procedures';
import { parseKeyList } from '../../ui/keys';
import { LESSONS, LESSON_ORDER, MISS_TEXT, STRIKE_CAVEATS, strikeWeaponsResolved, progressKey, scoreBombs, scoreCcip, scoreSead, scoreThreat, scoreVikhr, type ShotRecord } from './lessons';
import { AG_CAVEATS, AG_WEAPONS } from '../../data/agWeapons';
import { samRingM } from '../../sim/sam';
import { D2R, relBearing } from '../../sim/math';
import { START, buildScenario, centreOf } from './scenario';

import { SAM_CAVEATS } from '../../data/sams';
import { hudAngles, projectArmHudPoint } from '../../ui/displays/su25tHud';
import { pickArmEmitter } from './targeting';

const shot = (result: ShotRecord['result'], reason?: ShotRecord['reason']): ShotRecord => ({ weapon: 'vikhr', rangeM: 8000, result, reason, killed: result === 'hit' });

describe('strike route', () => {
  it('is an attack-only route in the lesson navigation', () => {
    const r = routeFor('strike');
    expect(r.path).toBe('strike');
    expect(jetAllowed(r, 'su25t')).toBe(true);
    expect(jetAllowed(r, 'f15c')).toBe(false);
    expect(pickerJets(r, 'su25t')).toEqual(['su25t']);
    expect(ROUTES.filter(x => x.roles?.includes('attack') && !x.roles.includes('fighter')).map(x => x.path)).toEqual(['strike']);
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

describe('bombs, SEAD and SAM-threat lessons', () => {
  it('scores the bombs lesson on automatic CCRP release and miss distance', () => {
    expect(scoreBombs({ ccrpAuto: true, ccrpMissM: 8, ccrpPassesMissed: 0, ccipMissM: 12, kills: 3 }).stars).toBe(3);
    const one = scoreBombs({ ccrpAuto: true, ccrpMissM: 10, ccrpPassesMissed: 1, ccipMissM: 90, kills: 1 });
    expect(one.stars).toBe(2);
    expect(one.coaching.join(' ')).toContain('director circle');
    expect(scoreBombs({ ccrpAuto: false, ccrpMissM: null, ccrpPassesMissed: 2, ccipMissM: null, kills: 0 }).stars).toBe(0);
    expect(scoreBombs({ ccrpAuto: true, ccrpMissM: 45, ccrpPassesMissed: 0, ccipMissM: null, kills: 0 }).stars).toBe(1);
  });

  it('scores SEAD on kill, launch outside the ring and time exposed', () => {
    const band = { min: 10000, max: 70000 };
    expect(scoreSead({ killed: true, fired: 1, launchRangeM: 28000, ringM: 12000, band, ringS: 0, shotDown: false }).stars).toBe(3);
    const inside = scoreSead({ killed: true, fired: 1, launchRangeM: 11000, ringM: 12000, band, ringS: 20, shotDown: false });
    expect(inside.stars).toBe(2);
    expect(inside.coaching.join(' ')).toContain('before the ring');
    expect(scoreSead({ killed: false, fired: 0, launchRangeM: null, ringM: 12000, band, ringS: 0, shotDown: false }).stars).toBe(0);
    expect(scoreSead({ killed: true, fired: 1, launchRangeM: 11000, ringM: 12000, band, ringS: 30, shotDown: true }).stars).toBe(1);
  });

  it('scores the SAM-threat attack on kills, hits taken and time in the ring', () => {
    expect(scoreThreat({ tanks: 4, tanksKilled: 4, samsKilled: 1, hitsTaken: 0, ringS: 0, samLaunches: 0 }).stars).toBe(3);
    const long = scoreThreat({ tanks: 4, tanksKilled: 4, samsKilled: 0, hitsTaken: 0, ringS: 40, samLaunches: 2 });
    expect(long.stars).toBe(2);
    expect(long.coaching.join(' ')).toContain('Flares');
    expect(scoreThreat({ tanks: 4, tanksKilled: 2, samsKilled: 0, hitsTaken: 1, ringS: 30, samLaunches: 1 }).stars).toBe(1);
  });

  it('SEAD starts with the SA-15 outside the ±30° zone, inside the Kh-58 band and outside its ring', () => {
    const sc = buildScenario('sead');
    const site = sc.world.samSites.get(sc.sams[0]!)!;
    const r = sc.me.pos.distanceTo(site.pos);
    expect(r).toBeGreaterThan(samRingM('sa15') * 2);
    expect(r).toBeLessThan(AG_WEAPONS.kh58.rangeKm.max * 1000);
    sc.me.heading = -30 * D2R;
    expect(Math.abs(relBearing(sc.me.pos, sc.me.heading, site.pos))).toBeGreaterThan(30 * D2R);
    expect(sc.me.ag!.pod).toBe(true);
    expect(sc.world.groundUnits.get(sc.samUnits[0]!)!.samSiteId).toBe(site.id);
  });

  it('SAM threat: a Vikhr fired 10 km from the platoon keeps the jet outside the SA-15 ring; the SA-11 is optional', () => {
    const sc = buildScenario('threat');
    const site = sc.world.samSites.get(sc.sams[0]!)!;
    expect(Math.hypot(site.pos.x, site.pos.z - 10000)).toBeGreaterThan(samRingM('sa15'));
    expect(buildScenario('threat', 7, { sa11: true }).sams.length).toBe(2);
    expect(sc.me.ag!.stores.kh58).toBe(2);
  });

  it('flies the bombs lesson CCRP pass: designate, lase, hold, automatic release on the platoon', () => {
    const { world, me, tanks } = buildScenario('bombs');
    const id = me.id;
    world.setAgMaster(id, 'ag'); world.selectAgWeapon(id, 'fab250'); world.shkvalPower(id, true);
    world.shkvalPointAt(id, world.groundUnits.get(tanks[1]!)!.pos); world.shkvalStabilise(id, true); world.laser(id, true);
    expect(world.ccrpHold(id, true).ok).toBe(true);
    const launched: boolean[] = [];
    world.on(e => { if (e.type === 'ag-launch') launched.push(!!e.ccrp); });
    for (let t = 0; t < 90 && !launched.length; t += 0.1) world.step(0.1);
    expect(launched).toEqual([true]);
  });
});


describe('strike review regressions', () => {
  it('waits after the last tank dies and counts a later SAM hit and exposure in the debrief', () => {
    const weapons = [{ alive: false }];
    const incoming = { alive: true, targetId: 'me' };
    const score = { tanks: 4, tanksKilled: 4, samsKilled: 0, hitsTaken: 0, ringS: 10, samLaunches: 1 };
    const finish = () => strikeWeaponsResolved('me', weapons, [incoming]) ? scoreThreat(score) : null;
    expect(finish()).toBeNull(); // last tank killed, no A-G weapons left
    score.ringS += 3; // the old 2 s deadline has elapsed
    expect(finish()).toBeNull();
    incoming.alive = false;
    score.hitsTaken = 1;
    score.ringS += 4;
    expect(finish()).toMatchObject({ stars: 1, passed: false });
    expect(finish()!.lines).toContain('Time inside a SAM ring 17 s');
    score.hitsTaken = 0; // if the SAM missed instead, the extra exposure still reduces the score
    expect(finish()).toMatchObject({ stars: 2, passed: true });
  });

  it('waits for all incoming SAMs, including a live missile after track loss, and accepts terminal misses', () => {
    const sams = [{ alive: false, targetId: 'me' }, { alive: true, targetId: 'me', guided: false }];
    expect(strikeWeaponsResolved('me', [], sams)).toBe(false);
    sams[1]!.alive = false;
    expect(strikeWeaponsResolved('me', [], sams)).toBe(true);
    expect(strikeWeaponsResolved('me', [{ alive: true }], sams)).toBe(false);
    expect(strikeWeaponsResolved('me', [], [{ alive: true, targetId: 'other' }])).toBe(true);
  });

  it('picks the Kh-58 diamond drawn below the HUD at 3000 m and 13 km', () => {
    const raw = hudAngles({ x: 0, y: 3000, z: 0 }, 0, 0, { x: 0, y: 0, z: -13000 });
    expect(raw.yDeg).toBeCloseTo(-12.995, 2);
    const diamond = { id: 'sam', ...raw };
    expect(projectArmHudPoint(diamond).yDeg).toBe(-8.5);
    expect(pickArmEmitter([diamond], { xDeg: 0, yDeg: -9 })?.id).toBe('sam');
    expect(pickArmEmitter([diamond], { xDeg: 3.01, yDeg: -9 })).toBeNull();
    const neighbour = { id: 'nearer', xDeg: 2, yDeg: -8.5 };
    expect(pickArmEmitter([diamond, neighbour], { xDeg: 2, yDeg: -9 })?.id).toBe('nearer');
  });

  it('labels SAM ranges and includes SAM caveats alongside A-G caveats', () => {
    for (const id of ['threat', 'sead'] as const) expect(LESSONS[id].goal).toMatch(/12 km, not verified/);
    expect(LESSONS.threat.steps[0]!.text).toMatch(/15 km.*simplified.*1.25.*not verified/);
    expect(STRIKE_CAVEATS).toEqual(expect.arrayContaining([...AG_CAVEATS, ...SAM_CAVEATS]));
  });
});
