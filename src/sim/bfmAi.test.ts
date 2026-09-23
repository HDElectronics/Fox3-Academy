/**
 * Fighting AI (bfmAi.ts): circle choice, pursuit ranges, lead turn, jink under a gun solution, guns against a
 * turning target, high yo-yo on an overshoot, determinism.
 */
import { describe, expect, it } from 'vitest';
import { World } from './world';
import type { Aircraft } from './types';
import type { FighterId } from '../data/types';
import { BFM_SKILL, bfmAiStep, chooseCircle, newBfmAi, overshootRisk, pursuitFor, type BfmAiState, type BfmSkill } from './bfmAi';
import { gunSolution } from './guns';
import { D2R } from './math';

const DT = 1 / 60;
const ALT = 4600;

function jet(w: World, type: FighterId, x: number, z: number, heading: number, speed: number, side: 'blue' | 'red', y = ALT): Aircraft {
  const ac = w.spawnAircraft({ side, type, controller: 'script', pos: { x, y, z }, heading, speed });
  ac.cmd.bfm = { bank: 0, g: 1, throttle: 'mil' };
  return ac;
}

interface Duel { w: World; ai: Aircraft; me: Aircraft; s: BfmAiState }

function duel(seed: number, skill: BfmSkill, aiAt: [number, number, number, number], meAt: [number, number, number, number], aiType: FighterId = 'f16c', meType: FighterId = 'su27'): Duel {
  const w = new World(seed);
  w.record = false;
  const ai = jet(w, aiType, aiAt[0], aiAt[1], aiAt[2], aiAt[3], 'red');
  const me = jet(w, meType, meAt[0], meAt[1], meAt[2], meAt[3], 'blue');
  return { w, ai, me, s: newBfmAi(ai, meType, skill, () => w.rand()) };
}

/** Run `seconds`; `meCmd` flies the other jet each tick. `ai` false leaves the AI jet on its own command. */
function run(d: Duel, seconds: number, meCmd: (t: number) => void, ai = true, each?: () => void): void {
  for (let k = 0; k < seconds / DT; k++) {
    meCmd(d.w.t);
    if (ai && d.ai.alive) {
      const o = bfmAiStep(d.s, d.ai, d.me, d.w.t, DT, () => d.w.rand());
      d.ai.cmd.bfm = o.bfm; d.ai.cmd.trigger = o.trigger;
    }
    d.w.step(DT);
    each?.();
  }
}

const levelTurn = (ac: Aircraft, g: number) => () => { ac.cmd.bfm = { bank: Math.acos(1 / g), g, throttle: 'ab' }; };

describe('fighting AI helpers', () => {
  it('chooses the circle by jet and skill', () => {
    expect(chooseCircle('fa18c', 'f16c', 'rookie')).toBe('two');
    expect(chooseCircle('f16c', 'fa18c', 'regular')).toBe('two');
    expect(chooseCircle('fa18c', 'f16c', 'regular')).toBe('one');
    expect(chooseCircle('fa18c', 'f16c', 'veteran')).toBe('one');
  });

  it('lags far out, leads to close, guns inside gun range', () => {
    expect(pursuitFor(3000, 1200)).toBe('lag');
    expect(pursuitFor(1500, 1200)).toBe('lead');
    expect(pursuitFor(900, 1200)).toBe('guns');
  });

  it('skill levels get quicker and sharper', () => {
    expect(BFM_SKILL.rookie.reactionS).toBeGreaterThan(BFM_SKILL.regular.reactionS);
    expect(BFM_SKILL.regular.reactionS).toBeGreaterThan(BFM_SKILL.veteran.reactionS);
    expect(BFM_SKILL.rookie.yoyo).toBe(false);
  });
});

describe('fighting AI', () => {
  it('lead turns at a head-on merge (regular, two-circle)', () => {
    const d = duel(3, 'regular', [0, 0, 0, 230], [500, -7000, Math.PI, 230]);
    expect(d.s.circle).toBe('two');
    run(d, 26, () => {});
    expect(d.s.entered['lead-turn']).toBeGreaterThan(0);
    // After a lead turn and the turn round behind him it points at him.
    const los = d.me.pos.clone().sub(d.ai.pos).normalize();
    expect(Math.acos(los.dot(d.ai.vel.clone().normalize()))).toBeLessThan(60 * D2R);
  });

  it('jinks out of a straight-flying attacker\'s gun solution and survives better than a bandit that does not', () => {
    const attack = (jinks: boolean) => {
      const d = duel(7, 'regular', [0, -500, 0, 220], [0, 0, 0, 220]);
      d.ai.damage = 0;
      run(d, 6, () => { d.me.cmd.bfm = { bank: 0, g: 1, throttle: 'mil' }; d.me.cmd.trigger = true; }, jinks);
      return d;
    };
    const straight = attack(false), jink = attack(true);
    expect(straight.ai.alive).toBe(false);
    expect(jink.s.entered.jink).toBeGreaterThan(0);
    expect(jink.ai.alive).toBe(true);
    expect(jink.ai.damage).toBeLessThan(0.6);
  });

  it.each(['regular', 'veteran'] as const)('%s gets gun solutions on a level-turning target', skill => {
    const d = duel(11, skill, [0, 1300, 0, 220], [0, 0, 0, 200]);
    d.me.damage = -1e9;
    let sol = 0;
    run(d, 40, levelTurn(d.me, 4), true, () => { if (gunSolution(d.ai, d.me).inSolution) sol += DT; });
    expect(sol).toBeGreaterThan(1.5);
    expect(d.me.gun.hits + d.ai.gun.hits).toBeGreaterThan(0);
  });

  it('flies a high yo-yo on an overshoot and climbs out of plane', () => {
    const d = duel(5, 'regular', [-900, 700, 30 * D2R, 300], [0, 0, 0, 170]);
    d.me.damage = -1e9;
    let yoyoAlt = -Infinity;
    const y0 = d.ai.pos.y;
    run(d, 12, levelTurn(d.me, 6), true, () => { if (d.s.mode === 'yoyo') yoyoAlt = Math.max(yoyoAlt, d.ai.pos.y); });
    expect(d.s.entered.yoyo).toBeGreaterThan(0);
    expect(yoyoAlt - y0).toBeGreaterThan(80);
  });

  it('flags the overshoot geometry', () => {
    const w = new World(1);
    const a = jet(w, 'f16c', 0, 600, 0, 300, 'red');
    const fast = jet(w, 'su27', 300, 0, 90 * D2R, 200, 'blue');
    expect(overshootRisk(a, fast.pos, fast.vel)).toBe(true);
    const slowCross = jet(w, 'su27', 0, -900, 0, 280, 'blue', ALT + 500);
    expect(overshootRisk(a, slowCross.pos, slowCross.vel)).toBe(false);
  });

  it('is deterministic for a seed', () => {
    const go = () => {
      const d = duel(9, 'veteran', [0, 0, 0, 230], [400, -6000, Math.PI, 230]);
      run(d, 30, levelTurn(d.me, 5));
      return [d.ai.pos.toArray(), d.s.reactionS, d.ai.gun.rounds];
    };
    expect(go()).toEqual(go());
  });
});
