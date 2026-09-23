import { describe, expect, it } from 'vitest';
import { SU25T_LOADOUTS } from '../../data/agWeapons';
import { samRingM } from '../../sim/sam';
import { D2R, R2D, relBearing } from '../../sim/math';
import { SORTIE_AAA_AT, SORTIE_IP, SORTIE_START, buildScenario, type Scenario } from './scenario';
import { progressKey } from './lessons';
import {
  AAA_LETHAL, IP_DIST_M, SORTIE_LOADOUTS, SORTIE_PROGRESS, SortieTracker, navCue, scoreSortie, shkvalMarginDeg, steerPoint,
  terrainFollowAlt, weaponRows, type SortieShot, type SortieSummary,
} from './sortie';

const DT = 1 / 30;
function fly(sc: Scenario, tr: SortieTracker, sec: number, steer?: (() => { x: number; z: number } | null) | null, agl = 60, stop: () => boolean = () => false): void {
  const w = sc.world, me = sc.me;
  for (let i = 0; i < sec / DT && !stop(); i++) {
    const p = steer?.();
    if (p) me.cmd.heading = Math.atan2(p.x - me.pos.x, -(p.z - me.pos.z));
    if (me.alive) me.cmd.altitude = terrainFollowAlt(w, me, agl);
    w.step(DT);
    tr.step(DT);
  }
}
const quiet = (sc: Scenario) => { for (const id of sc.sams) sc.world.samSites.get(id)!.holdFire = true; };

describe('sortie layout', () => {
  it('offers every Su-25T loadout with a plan, and spawns the same target area for each', () => {
    expect(SORTIE_LOADOUTS.map(l => l.id)).toEqual(SU25T_LOADOUTS.map(l => l.id));
    for (const l of SORTIE_LOADOUTS) {
      expect(l.plan.length).toBeGreaterThan(20);
      const sc = buildScenario('sortie', 7, { loadout: l.id });
      const ag = sc.me.ag!;
      const spec = SU25T_LOADOUTS.find(x => x.id === l.id)!;
      for (const st of spec.stations) if (st.weapon !== 'r60' && st.weapon !== 'r73' && st.weapon !== 'l081') expect(ag.stores[st.weapon as keyof typeof ag.stores]).toBeGreaterThan(0);
      expect(ag.pod).toBe(l.id === 'sead');
      expect(sc.tanks).toHaveLength(4);
      expect(sc.apcs).toHaveLength(2);
      expect(sc.world.groundUnits.get(sc.bunker)!.sizeM).toBe(60);
      expect(sc.sams.map(id => sc.world.samSites.get(id)!.type)).toEqual(['sa15']);
      expect(sc.world.groundUnits.get(sc.aaa!)!.kind).toBe('aaa');
      // start low, south-east, pointing at the IP
      expect(sc.me.pos.x).toBe(SORTIE_START.x);
      expect(sc.me.pos.y - sc.world.groundHeight(sc.me.pos.x, sc.me.pos.z)).toBeCloseTo(60, 0);
      expect(Math.abs(navCue(sc.me, SORTIE_IP).turnDeg)).toBeLessThan(0.5);
    }
    expect(buildScenario('sortie', 7, { sa11: true }).sams).toHaveLength(2);
  });

  it('keeps the IP and the start outside the SA-15 ring, the target inside it', () => {
    const sc = buildScenario('sortie');
    const site = sc.world.samSites.get(sc.sams[0]!)!;
    const d = (p: { x: number; z: number }) => Math.hypot(p.x - site.pos.x, p.z - site.pos.z);
    expect(d(SORTIE_IP)).toBeGreaterThan(samRingM('sa15') + 4000);
    expect(d(SORTIE_START)).toBeGreaterThan(samRingM('sa15') + 4000);
    expect(d(steerPoint('attack'))).toBeLessThan(samRingM('sa15'));
    expect(progressKey('sortie')).toBe(SORTIE_PROGRESS);
  });
});

describe('sortie end conditions', () => {
  it('runs ingress → IP → attack → egress and ends on egress past the IP', () => {
    const sc = buildScenario('sortie'); quiet(sc);
    const tr = new SortieTracker(sc.world, sc);
    fly(sc, tr, 200, () => steerPoint('ingress'), 60, () => tr.phase !== 'ingress');
    expect(tr.ipAt).not.toBeNull();
    expect(tr.lowS / tr.ingressS).toBeGreaterThan(0.9);
    fly(sc, tr, 120, () => steerPoint('attack'), 600, () => Math.hypot(sc.me.pos.x, sc.me.pos.z) < 8000);
    expect(tr.endReason()).toBeNull();
    fly(sc, tr, 300, () => steerPoint('egress', Math.hypot(sc.me.pos.x, sc.me.pos.z) > IP_DIST_M - 500), 60, () => tr.endReason() != null);
    expect(tr.phase).toBe('egress');
    expect(tr.endReason()).toBe('egress');
    expect(tr.markers.map(m => m.kind)).toEqual(expect.arrayContaining(['ip', 'egress']));
    tr.dispose();
  });

  it('ends on the time limit and on death; the ZSU-23-4 kills a jet that loiters low over it', () => {
    const sc = buildScenario('sortie'); quiet(sc);
    const tr = new SortieTracker(sc.world, sc);
    fly(sc, tr, 2, () => steerPoint('ingress'));
    expect(tr.endReason(1)).toBe('time');
    // Put the jet 800 m from the gun at 150 m, circling.
    const g = sc.world.groundHeight(SORTIE_AAA_AT.x, SORTIE_AAA_AT.z);
    sc.me.pos.set(SORTIE_AAA_AT.x + 800, g + 150, SORTIE_AAA_AT.z);
    fly(sc, tr, 30, () => SORTIE_AAA_AT, 150, () => !sc.me.alive);
    expect(sc.me.alive).toBe(false);
    expect(tr.endReason()).toBe('dead');
    expect(tr.killedBy).toBe('aaa');
    expect(tr.aaa!.s).toBeGreaterThan(AAA_LETHAL);
    tr.close();
    expect(tr.summary('dead', 'vikhr').aaaIntervals[0]!.to).not.toBeNull();
  });
});

describe('sortie debrief metrics', () => {
  it('records laser-on intervals and time inside the SAM ring', () => {
    const sc = buildScenario('sortie'); quiet(sc);
    const w = sc.world, me = sc.me, tr = new SortieTracker(w, sc);
    w.setAgMaster(me.id, 'ag'); w.shkvalPower(me.id, true);
    fly(sc, tr, 1);
    w.laser(me.id, true); const on1 = w.t; fly(sc, tr, 3);
    w.laser(me.id, false); const off1 = w.t; fly(sc, tr, 2);
    w.laser(me.id, true); const on2 = w.t; fly(sc, tr, 1);
    tr.close();
    expect(tr.laser).toHaveLength(2);
    expect(tr.laser[0]!.from).toBeCloseTo(on1, 5);
    expect(tr.laser[0]!.to).toBeCloseTo(off1, 5);
    expect(tr.laser[1]!.from).toBeCloseTo(on2, 5);
    expect(tr.laser[1]!.to).toBeCloseTo(w.t, 5);
    const s = tr.summary('pilot', 'vikhr');
    expect(s.laserS).toBeCloseTo(off1 - on1 + (w.t - on2), 3);
    expect(s.ringS).toBe(0);

    // 10 s inside the SA-15 ring (holding fire), then out.
    const sc2 = buildScenario('sortie'); quiet(sc2);
    const tr2 = new SortieTracker(sc2.world, sc2);
    const site = sc2.world.samSites.get(sc2.sams[0]!)!;
    sc2.me.pos.set(site.pos.x + 9000, site.pos.y + 800, site.pos.z); sc2.me.heading = sc2.me.cmd.heading = 0;
    fly(sc2, tr2, 10, null, 800);
    sc2.me.pos.set(site.pos.x + 20000, site.pos.y + 800, site.pos.z);
    fly(sc2, tr2, 2, null, 800);
    expect(tr2.rings[0]!.s).toBeGreaterThan(9.5);
    expect(tr2.rings[0]!.s).toBeLessThan(10.5);
    expect(tr2.rings[0]!.intervals).toHaveLength(1);
    expect(tr2.rings[0]!.intervals[0]!.to).not.toBeNull();
  });

  it('measures the gimbal margin at a guided launch and its minimum while the Vikhr flies', () => {
    const sc = buildScenario('sortie'); quiet(sc);
    const w = sc.world, me = sc.me, tr = new SortieTracker(w, sc);
    const tank = w.groundUnits.get(sc.tanks[0]!)!;
    const g = w.groundHeight(0, 8000);
    me.pos.set(1500, g + 600, 8000);
    me.heading = me.cmd.heading = Math.atan2(tank.pos.x - me.pos.x, -(tank.pos.z - me.pos.z)) + 12 * D2R;
    w.setAgMaster(me.id, 'ag'); w.selectAgWeapon(me.id, 'vikhr'); w.shkvalPower(me.id, true);
    w.shkvalPointAt(me.id, tank.pos); w.shkvalStabilise(me.id, true); w.shkvalLock(me.id); w.laser(me.id, true);
    fly(sc, tr, 0.2, null, 600);
    expect(w.canAgLaunch(me.id).ok).toBe(true);
    const expected = shkvalMarginDeg(me.ag!.shkval.az, me.ag!.shkval.el);
    expect(expected).toBeGreaterThan(15);
    expect(expected).toBeLessThan(35 - 10);
    w.agLaunch(me.id);
    const shot = [...tr.shots.values()][0]!;
    expect(shot.launchMarginDeg).toBeCloseTo(expected, 1);
    // Hard turn away: the target leaves the gimbal, the Vikhr misses on the gimbal rule.
    me.cmd.heading = me.heading + 90 * D2R;
    fly(sc, tr, 30, null, 600, () => shot.result !== 'flying');
    expect(shot.minMarginDeg!).toBeLessThan(1);
    expect(shot.result).toBe('miss');
    expect(shot.reason).toBe('gimbal');
    const d = scoreSortie({ ...base(), shots: [shot] });
    expect(d.coaching.join(' ')).toContain('gimbal');
  });

  it('uses the ±30° zone as the Kh-58 launch margin', () => {
    const sc = buildScenario('sortie', 7, { loadout: 'sead' });
    const w = sc.world, me = sc.me, tr = new SortieTracker(w, sc);
    const site = w.samSites.get(sc.sams[0]!)!;
    me.heading = me.cmd.heading = Math.atan2(site.pos.x - me.pos.x, -(site.pos.z - me.pos.z)) - 10 * D2R;
    w.setAgMaster(me.id, 'ag'); w.selectAgWeapon(me.id, 'kh58'); w.armDetect(me.id, true);
    fly(sc, tr, 0.5, null, 1500);
    expect(w.armLock(me.id, site.id).ok).toBe(true);
    fly(sc, tr, 0.1, null, 1500);
    const off = Math.abs(relBearing(me.pos, me.heading, site.pos) * R2D);
    w.agLaunch(me.id);
    const shot = [...tr.shots.values()].find(s => s.weapon === 'kh58')!;
    expect(shot.launchMarginDeg).toBeCloseTo(30 - off, 0);
    expect(shot.minMarginDeg).toBeNull();
  });
});

function base(): SortieSummary {
  return {
    loadout: 'vikhr', end: 'egress', t: 300, alive: true, killedBy: null,
    column: { total: 6, killed: 6 }, bunker: true, trucksKilled: 0, samsKilled: 0, samsTotal: 1, aaaKilled: false,
    shots: [], laserS: 40, longestLaserS: 20, laserIntervals: [{ from: 100, to: 120 }, { from: 130, to: 150 }],
    rings: [], ringS: 0, aaaS: 0, aaaIntervals: [], ipReached: true, lowFrac: 0.95, flares: 0, samLaunches: 0, hitsTaken: 0,
  };
}
const hit = (t: number): SortieShot => ({ id: `W${t}`, weapon: 'vikhr', t, rangeM: 9000, guided: true, targetId: 'T1', result: 'hit', reason: 'hit', killed: ['T1'], endT: t + 18, launchMarginDeg: 25, minMarginDeg: 20 });

describe('sortie scoring', () => {
  it('scores a clean sortie at three stars', () => {
    const d = scoreSortie({ ...base(), shots: [hit(100), hit(130)] });
    expect(d.score).toBe(90);
    expect(d.stars).toBe(3);
    expect(d.passed).toBe(true);
    expect(d.coaching.at(-1)).toContain('Clean sortie');
    expect(weaponRows(d.lines.length ? [hit(1), { ...hit(2), result: 'miss', reason: 'laser-off' }] : [])).toEqual([
      { weapon: 'vikhr', label: 'Vikhr (9А4172)', fired: 2, hits: 1, misses: { 'laser-off': 1 } },
    ]);
  });

  it('takes points for ring time, pilot-error misses and the gun, and coaches each mistake', () => {
    const miss = { ...hit(160), result: 'miss' as const, reason: 'laser-off' as const, killed: [] };
    const d = scoreSortie({ ...base(), column: { total: 6, killed: 3 }, bunker: false, shots: [hit(100), miss], ringS: 40, aaaS: 8, lowFrac: 0.2, ipReached: false, longestLaserS: 75, flares: 12, samLaunches: 1 });
    // 22.5 + 30 − (15 + 5 + 4)
    expect(d.score).toBe(29);
    expect(d.stars).toBe(0);
    const c = d.coaching.join(' | ');
    for (const k of ['Laser off', 'never flew the IP', 'of the ingress below', 'inside a SAM ring', 'ZSU-23-4 envelope', '1 minute continuous', 'Flares decoy IR', 'SPO-15 launch cue']) expect(c).toContain(k);
  });

  it('caps a loss at one star and says what got the jet', () => {
    const d = scoreSortie({ ...base(), alive: false, end: 'dead', killedBy: 'aaa', shots: [hit(100)] });
    expect(d.stars).toBeLessThanOrEqual(1);
    expect(d.title).toBe('Shot down');
    expect(d.coaching.join(' ')).toContain('The gun got you');
    expect(scoreSortie({ ...base(), end: 'time' }).coaching.join(' ')).toContain('Time limit');
  });
});
