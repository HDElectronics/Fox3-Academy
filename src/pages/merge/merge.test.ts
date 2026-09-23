/** [OWNER: page-merge] Pure helpers of Merge & guns: pursuit classes, stick, scoring, scripted bandit paths, runs. */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { World } from '../../sim/world';
import { wrapPi } from '../../sim/math';
import type { AircraftId } from '../../data/types';
import { AIRCRAFT_ORDER } from '../../data/aircraft';
import { atCorner, classifyPursuit, levelG, newStick, stepStick } from './bfm';
import { banditStep, newBandit, REVERSE_S, type BanditMode } from './bandit';
import { debrief, emptyMetrics, LESSON_ORDER, PURSUIT_HOLD_S, scoreLesson, stepPursuitPhase, type LessonId } from './lessons';
import { MergeRun, type Autopilot } from './runner';

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

function run(ac: AircraftId, lesson: LessonId, mode: BanditMode, ap: Autopilot | null, s: number) {
  const r = new MergeRun(ac, lesson, mode, 7);
  r.world.record = false;
  r.autopilot = ap;
  r.start();
  for (let i = 0; i < s * 30 && r.phase === 'run'; i++) r.tick(1 / 30);
  return r;
}

describe('lesson runs (demo autopilot)', () => {
  it('every fighter can start every lesson', () => {
    for (const ac of AIRCRAFT_ORDER) for (const id of LESSON_ORDER) {
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
