/** [OWNER: page-merge] Pure helpers of Merge & guns: pursuit classes, stick, scoring, scripted bandit paths, runs. */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { World } from '../../sim/world';
import { wrapPi } from '../../sim/math';
import type { FighterId } from '../../data/types';
import { FIGHTER_ORDER } from '../../data/aircraft';
import { atCorner, classifyPursuit, levelG, newStick, stepStick } from './bfm';
import { banditStep, newBandit, REVERSE_S, type BanditMode } from './bandit';
import { debrief, emptyMetrics, LESSON_ORDER, PURSUIT_HOLD_S, rangeScore, scoreLesson, stepPursuitPhase, type LessonId } from './lessons';
import { anglesOf, MergeRun, type Autopilot } from './runner';

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

describe('pursuit classification', () => {
  // Bandit 1000 m north flying east (crossing left to right).
  const bPos = v(0, 5000, -1000), bVel = v(200, 0, 0);
  it('nose on the bandit is pure', () => {
    expect(classifyPursuit(v(0, 5000, 0), v(0, 0, -200), bPos, bVel).kind).toBe('pure');
  });
  it('nose ahead of him (toward his motion) is lead, behind him is lag', () => {
    const lead = classifyPursuit(v(0, 5000, 0), v(60, 0, -200), bPos, bVel);
    expect(lead.kind).toBe('lead');
    expect(lead.leadDeg).toBeGreaterThan(0);
    const lag = classifyPursuit(v(0, 5000, 0), v(-60, 0, -200), bPos, bVel);
    expect(lag.kind).toBe('lag');
    expect(lag.leadDeg).toBeLessThan(0);
  });
});

describe('stick and corner helpers', () => {
  it('level-turn g is 1 / cos(bank), capped by what is available', () => {
    expect(levelG(0, 0, 9)).toBeCloseTo(1);
    expect(levelG(Math.acos(1 / 4), 0, 9)).toBeCloseTo(4);
    expect(levelG(Math.acos(1 / 4), 0, 3)).toBe(3);
  });
  it('corner band needs a hard turn near corner speed', () => {
    const kt = 0.514444;
    expect(atCorner(420 * kt, 420, 5)).toBe(true);
    expect(atCorner(470 * kt, 420, 5)).toBe(false);
    expect(atCorner(420 * kt, 420, 2)).toBe(false);
  });
  it('roll keys roll the commanded lift vector; pull ramps to the available g', () => {
    const w = new World(1);
    const ac = w.spawnAircraft({ side: 'blue', type: 'f16c', controller: 'player', pos: { x: 0, y: 5000, z: 0 }, heading: 0, speed: 230 });
    const s = newStick();
    s.roll = 1;
    let cmd = stepStick(s, ac, 0.5);
    expect(cmd.bank).toBeGreaterThan(1);
    s.roll = 0; s.pitch = 1;
    for (let i = 0; i < 60; i++) cmd = stepStick(s, ac, 1 / 30);
    expect(cmd.g).toBeGreaterThan(5);
  });
});

describe('scoring', () => {
  it('pursuit phases advance after the hold time and score the share held', () => {
    const m = emptyMetrics();
    for (let i = 0; i < 600; i++) stepPursuitPhase(m, 'lead', 1 / 60);
    expect(m.phase).toBe(1);
    expect(m.held[0]).toBeCloseTo(PURSUIT_HOLD_S, 1);
    expect(scoreLesson('pursuit', m)).toBe(33);
  });
  it('corner, tracking, defence and fight scores stay in 0..100 and reward the goal', () => {
    const m = emptyMetrics();
    for (const id of LESSON_ORDER) {
      const s = scoreLesson(id, m);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    expect(scoreLesson('defence', m)).toBe(100);
    m.cornerS = 25; m.solutionS = 5; m.damageDealt = 1; m.roundsFired = 100; m.roundsInSolution = 100;
    expect(scoreLesson('corner', m)).toBe(100);
    expect(scoreLesson('tracking', m)).toBe(100);
    m.damageTaken = 1; m.hisSolutionS = 10;
    expect(scoreLesson('defence', m)).toBe(0);
    m.killed = 'bandit';
    expect(scoreLesson('fight', m)).toBe(100);
  });
  it('the debrief has stats and coaching, with no exclamation marks', () => {
    for (const id of LESSON_ORDER) {
      const d = debrief(id, emptyMetrics(), { corner: '420 kt', minSpeed: '300 kt' });
      expect(d.stats.length).toBeGreaterThan(0);
      expect(d.coaching.length).toBeGreaterThan(0);
      expect(JSON.stringify(d)).not.toContain('!');
    }
  });
  it('a passing yo-yo needs height, a raised lift vector and recovery after the climb', () => {
    const m = emptyMetrics();
    m.heldS = 15;
    expect(scoreLesson('yoyo', m)).toBeLessThan(50);
    m.climbM = 300;
    expect(scoreLesson('yoyo', m)).toBeLessThan(50);
    m.outOfPlane = true;
    expect(scoreLesson('yoyo', m)).toBeLessThan(50);
    m.recoveredS = 0.99;
    expect(scoreLesson('yoyo', m)).toBeLessThan(50);
    m.recoveredS = 1;
    m.climbM = 150;
    expect(scoreLesson('yoyo', m)).toBeLessThan(50);
    m.climbM = 300;
    expect(scoreLesson('yoyo', m)).toBe(100);
  });
});

function fly(mode: BanditMode, seconds: number) {
  const w = new World(5);
  w.record = false;
  const b = w.spawnAircraft({ side: 'red', type: 'su27', controller: 'script', pos: { x: 0, y: 4600, z: 0 }, heading: 0, speed: 230 });
  const p = w.spawnAircraft({ side: 'blue', type: 'f15c', controller: 'script', pos: { x: 0, y: 4600, z: -700 }, heading: 0, speed: 210 });
  p.cmd.bfm = { bank: 0, g: 1, throttle: 'mil' };
  const s = newBandit(mode, b, 1);
  const headings: number[] = [];
  let turned = 0, last = b.heading, fired = false;
  for (let i = 0; i < seconds * 60; i++) {
    const r = banditStep(s, b, p, w.t, 1 / 60);
    b.cmd.bfm = r.bfm; b.cmd.trigger = r.trigger;
    fired ||= r.trigger;
    w.step(1 / 60);
    turned += wrapPi(b.heading - last); last = b.heading;
    if (i % 60 === 0) headings.push(turned);
  }
  return { b, p, turned, headings, fired };
}

describe('scripted bandit paths', () => {
  it('straight and level holds heading and altitude', () => {
    const { b, turned } = fly('straight', 30);
    expect(Math.abs(turned)).toBeLessThan(0.02);
    expect(Math.abs(b.pos.y - 4600)).toBeLessThan(100);
  });
  it('level turn goes around and holds altitude', () => {
    const { b, turned } = fly('turn', 40);
    expect(turned).toBeGreaterThan(2 * Math.PI * 0.6);
    expect(Math.abs(b.pos.y - 4600)).toBeLessThan(400);
  });
  it('turning and reversing changes turn direction', () => {
    const { headings } = fly('reverse', REVERSE_S * 2);
    const at = (s: number) => headings[s]!;
    expect(at(REVERSE_S - 2) - at(2)).toBeGreaterThan(0);
    expect(at(2 * REVERSE_S - 2) - at(REVERSE_S + 3)).toBeLessThan(0);
  });
  it('gun attack closes on a straight target and fires', () => {
    const { fired, p } = fly('guns', 15);
    expect(fired).toBe(true);
    expect(p.damage).toBeGreaterThan(0);
  });
});

function run(ac: FighterId, lesson: LessonId, mode: BanditMode, ap: Autopilot | null, s: number) {
  const r = new MergeRun(ac, lesson, mode, 7);
  r.world.record = false;
  r.autopilot = ap;
  r.start();
  for (let i = 0; i < s * 30 && r.phase === 'run'; i++) r.tick(1 / 30);
  return r;
}

describe('lesson runs (demo autopilot)', () => {
  it.each(['dealt', 'taken'] as const)('scores actual damage %s even on steps without hit events, including the kill', direction => {
    const r = new MergeRun('su27', 'tracking', direction === 'dealt' ? 'straight' : 'guns', 7);
    r.world.record = false;
    const shooter = direction === 'dealt' ? r.me : r.bandit;
    const target = direction === 'dealt' ? r.bandit : r.me;
    shooter.pos.set(0, 4600, 0); target.pos.set(0, 4600, -600);
    for (const ac of [shooter, target]) {
      ac.vel.set(0, 0, -230); ac.heading = 0; ac.roll = 0;
      ac.damage = 0;
    }
    r.stick.trigger = direction === 'dealt';
    r.banditState.aim.copy(shooter.vel).normalize();
    r.start();
    let withoutHits = 0;
    for (let i = 0; i < 1200 && r.phase === 'run'; i++) {
      const damage = target.damage;
      const hits = r.metrics.hits + r.metrics.hitsTaken;
      r.tick(1 / 120);
      const scored = direction === 'dealt' ? r.metrics.damageDealt : r.metrics.damageTaken;
      expect(scored).toBeCloseTo(target.damage, 10);
      if (target.damage > damage && r.metrics.hits + r.metrics.hitsTaken === hits) withoutHits++;
    }
    expect(withoutHits).toBeGreaterThan(0);
    expect(target.alive).toBe(false);
    expect(direction === 'dealt' ? r.metrics.damageDealt : r.metrics.damageTaken).toBe(1);
    const finalMetrics = structuredClone(r.metrics);
    r.tick(2);
    expect(r.metrics).toEqual(finalMetrics);
  });

  it('scores damage deltas for a drill bandit with a negative damage baseline', () => {
    const r = new MergeRun('su27', 'yoyo', 'straight', 7);
    r.world.record = false;
    r.me.pos.set(0, 4600, 0); r.bandit.pos.set(0, 4600, -600);
    for (const ac of [r.me, r.bandit]) {
      ac.vel.set(0, 0, -230); ac.heading = 0; ac.roll = 0;
    }
    const initial = r.bandit.damage;
    expect(initial).toBeLessThan(0);
    r.stick.trigger = true;
    r.start();
    for (let i = 0; i < 60; i++) r.tick(1 / 60);
    expect(r.metrics.damageDealt).toBeGreaterThan(0);
    expect(r.metrics.damageDealt).toBeCloseTo(r.bandit.damage - initial, 10);
  });

  it('every fighter can start every lesson', () => {
    for (const ac of FIGHTER_ORDER) for (const id of LESSON_ORDER) {
      const r = new MergeRun(ac, id, 'turn', 1);
      r.start(); r.tick(0.5);
      expect(r.me.alive).toBe(true);
    }
  });
  it('corner autopilot spends time at corner', () => {
    expect(run('f16c', 'corner', 'turn', 'corner', 30).metrics.cornerS).toBeGreaterThan(5);
  });
  it('tracking autopilot gets a solution and hits a turning bandit', () => {
    const r = run('fa18c', 'tracking', 'turn', 'track', 45);
    expect(r.metrics.solutionS).toBeGreaterThan(0.5);
    expect(r.metrics.hits).toBeGreaterThan(0);
  });
  it('a hard break takes fewer hits than flying straight', () => {
    const straight = run('f15c', 'defence', 'guns', null, 20).metrics.damageTaken;
    const broke = run('f15c', 'defence', 'guns', 'defend', 20).metrics.damageTaken;
    expect(straight).toBeGreaterThan(0);
    expect(broke).toBeLessThan(straight);
  });
});

describe('merge, circle and yo-yo drills', () => {
  it('scores reward angles, the advised circle, and no overshoot', () => {
    const m = emptyMetrics();
    expect(scoreLesson('merge', m)).toBe(0);
    expect(scoreLesson('circles', m)).toBe(0);
    m.passT = 10; m.passRange = 400; m.leadTurnDeg = 40; m.anglesDeg = 90;
    expect(scoreLesson('merge', m)).toBe(100);
    m.anglesDeg = -60;
    expect(scoreLesson('merge', m)).toBe(40);
    m.aotDeg = 0; m.myAtaDeg = 0; m.rangeM = 900; m.circleFlown = 'two'; m.circleAdvised = 'two';
    expect(scoreLesson('circles', m)).toBe(100);
    m.circleFlown = 'one';
    expect(scoreLesson('circles', m)).toBe(90);
    expect(rangeScore(900)).toBe(1);
    expect(rangeScore(4000)).toBe(0);
    expect(rangeScore(Infinity)).toBe(0);
    m.heldS = 15; m.climbM = 300; m.outOfPlane = true; m.recoveredS = 1;
    expect(scoreLesson('yoyo', m)).toBe(100);
    m.overshoots = 1;
    expect(scoreLesson('yoyo', m)).toBe(50);
  });

  it('the merge bandit turns toward you after the pass (two-circle) or away (one-circle)', () => {
    const two = run('f16c', 'circles', 'two-circle', null, 20).banditState;
    const one = run('f16c', 'circles', 'one-circle', null, 20).banditState;
    expect(two.passed && one.passed).toBe(true);
    expect(two.dir).toBe(-one.dir);
  });

  it('the fighting AI flying your jet lead turns the merge and records the pass', () => {
    const r = run('f16c', 'merge', 'two-circle', 'ai', 60);
    expect(r.metrics.passT).not.toBeNull();
    expect(r.metrics.leadTurnDeg).toBeGreaterThan(10);
    expect(r.metrics.passRange).toBeLessThan(1500);
    expect(r.metrics.vertical).not.toBeNull();
  });

  it.each([1 / 60, 1 / 30, 0.01, 0.013, 0.1])('circle scoring finishes on the first step crossing 30 s (dt=%s)', dt => {
    const r = new MergeRun('fa18c', 'circles', 'two-circle', 7);
    r.world.record = false;
    r.autopilot = 'ai';
    r.start();
    for (let t = 0; t < 60 && r.phase === 'run'; t += dt) r.tick(dt);
    expect(r.metrics.circleAdvised).toBe('one');
    expect(r.metrics.circleFlown).not.toBeNull();
    expect(r.phase).toBe('end');
    const h = dt / Math.ceil(dt * 60 - 1e-6);
    expect(r.metrics.t - r.metrics.passT!).toBeGreaterThanOrEqual(30);
    expect(r.metrics.t - r.metrics.passT!).toBeLessThan(30 + h + 1e-9);
    if (dt <= 1 / 60) {
      const a = anglesOf(r.me, r.bandit);
      expect(r.metrics.myAtaDeg).toBeCloseTo(a.myAta, 10);
      expect(r.metrics.rangeM).toBeCloseTo(a.range, 10);
    }
    const score = scoreLesson('circles', r.metrics);
    r.tick(1);
    expect(scoreLesson('circles', r.metrics)).toBe(score);
  });

  it('rolling level for 0.43 s then flying hands-off cannot pass the yo-yo', () => {
    const r = new MergeRun('fa18c', 'yoyo', 'hard', 7);
    r.world.record = false;
    r.start();
    r.stick.roll = -1;
    for (let i = 0; i < 43; i++) r.tick(0.01);
    r.stick.roll = 0;
    while (r.phase === 'run') r.tick(0.01);
    expect(r.metrics.overshoots).toBe(0);
    expect(r.metrics.climbM).toBeLessThan(150);
    expect(scoreLesson('yoyo', r.metrics)).toBeLessThan(50);
  });

  it('a yo-yo avoids the overshoot that holding the turn gives', () => {
    const held = run('fa18c', 'yoyo', 'hard', null, 25).metrics;
    const yoyo = run('fa18c', 'yoyo', 'hard', 'ai', 25).metrics;
    expect(held.overshoots).toBeGreaterThan(0);
    expect(yoyo.overshoots).toBe(0);
    expect(yoyo.climbM).toBeGreaterThan(held.climbM);
    expect(yoyo.climbM).toBeGreaterThan(150);
    expect(yoyo.outOfPlane).toBe(true);
    expect(yoyo.recoveredS).toBeGreaterThanOrEqual(1);
    expect(scoreLesson('yoyo', yoyo)).toBeGreaterThanOrEqual(50);
    expect(scoreLesson('yoyo', yoyo)).toBeGreaterThan(scoreLesson('yoyo', held));
  });

  it.each(['rookie', 'regular', 'veteran'] as const)('free fight against the %s fighting AI runs and names its moves', skill => {
    const r = run('m2000c', 'fight', skill, 'ai', 40);
    expect(Object.keys(r.metrics.aiMoves).length).toBeGreaterThan(0);
    const d = debrief('fight', r.metrics, { corner: '360 kt', minSpeed: '200 kt', skill });
    expect(d.stats.find(([k]) => k === 'Bandit moves')?.[1]).not.toBe('-');
  });
});
