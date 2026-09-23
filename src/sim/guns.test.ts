/**
 * Arcade gun model (issue #11): hits need time in the solution inside max range, rounds deplete, deterministic.
 */
import { describe, expect, it, vi } from 'vitest';
import { World } from './world';
import type { Aircraft, SimEvent } from './types';
import type { FighterId } from '../data/types';
import { stepAircraft } from './flight';
import { GUN_TRACER_S, funnelPoints, gunSolution, sightPoint, stepGuns } from './guns';
import { GUNS } from '../data/wvr';

const DT = 1 / 60;

function jet(w: World, type: FighterId, x: number, y: number, z: number, heading: number, speed: number, side: 'blue' | 'red' = 'blue'): Aircraft {
  return w.spawnAircraft({ side, type, controller: 'script', pos: { x, y, z }, heading, speed });
}

function fly(w: World, ac: Aircraft, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) { each?.(); w.t += DT; stepAircraft(w, ac, DT); }
}

/** Shooter behind a target flying the same line at `range`. */
function gunSetup(seed: number, range: number, type: FighterId = 'f15c') {
  const w = new World(seed);
  w.record = false;
  const s = jet(w, type, 0, 5000, 0, 0, 200);
  const t = jet(w, 'su27', 0, 5000, -range, 0, 200, 'red');
  t.damage = -1e9;                          // unkillable for counting
  return { w, s, t };
}

function fire(w: World, s: Aircraft, t: Aircraft, seconds: number): void {
  s.cmd.trigger = true;
  for (let k = 0; k < seconds / DT - 1e-6; k++) {
    w.t += DT;
    for (const a of [s, t]) stepAircraft(w, a, DT);
    stepGuns(w, DT);
  }
  s.cmd.trigger = false;
  stepGuns(w, DT);
}

describe('guns', () => {
  it.each([['f15c', 10], ['jf17', 8], ['su27', 4]] as const)('%s kills at the lethal hit count (%s) and caps damage at 1', (type, lethalHits) => {
    const { w, s, t } = gunSetup(30, 300, type);
    vi.spyOn(w, 'rand').mockReturnValue(0); // every round in the centre hits
    t.damage = 0;
    s.cmd.trigger = true;
    for (let hits = 1; hits <= lethalHits; hits++) {
      s.gun.rounds = 1;
      stepGuns(w, 60 / GUNS[type].rateRpm.value);
      expect(s.gun.hits).toBe(hits);
      expect(t.alive).toBe(hits < lethalHits);
      expect(t.damage).toBeLessThanOrEqual(1);
    }
    expect(t.damage).toBe(1);
    expect(t.killedBy).toBe(s.id);
    expect(w.events.filter(e => e.type === 'kill')).toHaveLength(1);
    expect(w.events.filter(e => e.type === 'gun-hit').at(-1)).toMatchObject({ damage: 1 });
  });

  it('preserves the shot cooldown across alternating trigger ticks and lets it expire while released', () => {
    const { w, s } = gunSetup(31, 3000, 'su27');
    const initial = s.gun.rounds;
    for (let tick = 0; tick < 60; tick++) {
      s.cmd.trigger = tick % 2 === 0;
      stepGuns(w, DT);
    }
    expect(initial - s.gun.rounds).toBeLessThanOrEqual(1 + GUNS.su27.rateRpm.value / 60);
    expect(initial - s.gun.rounds).toBeGreaterThan(0);
    s.cmd.trigger = false;
    stepGuns(w, 1);
    const remaining = s.gun.rounds;
    s.cmd.trigger = true;
    stepGuns(w, DT);
    expect(remaining - s.gun.rounds).toBe(1); // ready again, with no stockpile of idle shots
  });

  it('does not consume rounds or emit gun events without positive elapsed time', () => {
    const { w, s } = gunSetup(32, 3000);
    s.cmd.trigger = true;
    const before = { ...s.gun };
    w.step(0);
    expect(s.gun).toEqual(before);
    stepGuns(w, -DT);
    expect(s.gun).toEqual(before);
    expect(w.events.filter(e => e.type === 'gun' || e.type === 'tracer' || e.type === 'gun-hit')).toHaveLength(0);
  });

  it('paces low-rate gun tracers by firing time, including ticks without rounds', () => {
    const { w, s, t } = gunSetup(33, 3000, 'su27');
    fire(w, s, t, 2);
    const times = w.events.filter(e => e.type === 'tracer').map(e => e.t);
    expect(times.length).toBeGreaterThanOrEqual(19);
    expect(times.length).toBeLessThanOrEqual(21);
    const shotInterval = 60 / GUNS.su27.rateRpm.value;
    for (let i = 1; i < times.length; i++) {
      expect(times[i]! - times[i - 1]!).toBeLessThanOrEqual(GUN_TRACER_S + shotInterval + DT);
    }
  });

  it('records firing only on shot ticks while keeping burst events continuous', () => {
    const { w, s } = gunSetup(34, 3000, 'su27');
    w.record = true;
    s.cmd.trigger = true;
    let sawNoShot = false, checkedSnapshots = 0;
    for (let tick = 0; tick < 120; tick++) {
      const rounds = s.gun.rounds;
      const frames = w.recording.length;
      w.step(DT);
      const fired = s.gun.rounds < rounds;
      expect(s.gun.firing).toBe(fired);
      if (!fired) sawNoShot = true;
      if (w.recording.length > frames) {
        expect(w.recording.at(-1)!.aircraft.find(a => a.id === s.id)!.firing).toBe(fired);
        checkedSnapshots++;
      }
    }
    expect(sawNoShot).toBe(true);
    expect(checkedSnapshots).toBeGreaterThan(1);
    expect(s.gun.burst).toBeCloseTo(2);
    // Release on a tick after no round left: cease must not depend on firing.
    while (s.gun.firing) w.step(DT);
    s.cmd.trigger = false;
    w.step(DT);
    w.step(DT);
    expect(w.events.filter(e => e.type === 'gun' && e.shooterId === s.id)).toMatchObject([
      { what: 'burst' }, { what: 'cease' },
    ]);
    s.gun.rounds = 1;
    s.cmd.trigger = true;
    for (let tick = 0; tick < 10; tick++) w.step(DT);
    expect(w.events.filter(e => e.type === 'gun' && e.what === 'empty')).toHaveLength(1);
    expect(s.gun.firing).toBe(false);
  });

  it('hits scale with the time in the solution', () => {
    const a = gunSetup(10, 300), b = gunSetup(10, 300);
    expect(gunSolution(a.s, a.t).inSolution).toBe(true);
    fire(a.w, a.s, a.t, 0.5);
    fire(b.w, b.s, b.t, 1.5);
    expect(a.s.gun.hits).toBeGreaterThan(5);
    expect(b.s.gun.hits).toBeGreaterThan(2 * a.s.gun.hits);
  });

  it('no hits beyond the max range or off the lead point', () => {
    const far = gunSetup(11, GUNS.f15c.maxRangeM.value + 200);
    fire(far.w, far.s, far.t, 1);
    expect(far.s.gun.hits).toBe(0);
    const off = gunSetup(12, 300);
    off.t.pos.x += 60;                        // 11° off the nose
    fire(off.w, off.s, off.t, 1);
    expect(off.s.gun.hits).toBe(0);
  });

  it('rounds deplete at the rate of fire and the gun runs empty', () => {
    const { w, s, t } = gunSetup(13, 3000);
    const events: SimEvent[] = [];
    w.on(e => events.push(e));
    fire(w, s, t, 1);
    expect(Math.abs(GUNS.f15c.rounds.value - s.gun.rounds - GUNS.f15c.rateRpm.value / 60)).toBeLessThan(3);
    fire(w, s, t, 20);
    expect(s.gun.rounds).toBe(0);
    expect(events.some(e => e.type === 'gun' && e.what === 'empty')).toBe(true);
    expect(events.filter(e => e.type === 'tracer').length).toBeGreaterThan(5);
  });

  it('is deterministic for a seed and kills through the damage pool', () => {
    const a = gunSetup(21, 300, 'su27'), b = gunSetup(21, 300, 'su27');
    a.t.damage = 0; b.t.damage = 0;
    fire(a.w, a.s, a.t, 2); fire(b.w, b.s, b.t, 2);
    expect(a.s.gun.hits).toBe(b.s.gun.hits);
    expect(a.t.alive).toBe(false);
    expect(a.t.killedBy).toBe(a.s.id);
  });

  it('sight geometry: pipper on the gun line in level flight, below it in a pull', () => {
    const w = new World(5);
    const ac = jet(w, 'f16c', 0, 5000, 0, 0, 200);
    fly(w, ac, 0.5);
    expect(Math.abs(sightPoint(ac, 600).up)).toBeLessThan(0.002);
    fly(w, ac, 2, () => { ac.cmd.bfm = { bank: 0, g: 6, throttle: 'ab' }; });
    expect(sightPoint(ac, 600).up).toBeLessThan(-0.01);
    const f = funnelPoints(ac);
    expect(f.length).toBe(7);
    expect(f[6]!.up).toBeLessThan(f[0]!.up);
    expect(f[6]!.halfSpan).toBeLessThan(f[0]!.halfSpan);
  });
});
