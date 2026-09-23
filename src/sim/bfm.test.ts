/**
 * BFM flight mode (issue #11). Gameplay behaviour only: loops and yo-yos fly, energy bleeds at max g, and the
 * sustained g at full afterburner holds speed.
 */
import { describe, expect, it } from 'vitest';
import { World } from './world';
import type { Aircraft } from './types';
import type { FighterId } from '../data/types';
import { MIN_ALT_AGL, stepAircraft, sustainedGAt } from './flight';
import { GUNS, GUN_JET_IDS, TURN_PERF, sustainedG } from '../data/wvr';
import { AIRCRAFT } from '../data/aircraft';
import { soundSpeed } from './atmosphere';
import { D2R, wrapPi } from './math';

const DT = 1 / 60;

function jet(w: World, type: FighterId, x: number, y: number, z: number, heading: number, speed: number): Aircraft {
  return w.spawnAircraft({ side: 'blue', type, controller: 'script', pos: { x, y, z }, heading, speed });
}

function fly(w: World, ac: Aircraft, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) { each?.(); w.t += DT; stepAircraft(w, ac, DT); }
}

describe('BFM mode', () => {
  it.each([NaN, Infinity, -Infinity])('ignores non-finite bank and g commands (%s) and can return to autopilot', value => {
    const w = new World(30);
    const ac = jet(w, 'f15c', 0, 5000, 0, 0, 200);
    ac.roll = 30 * D2R;
    ac.cmd.bfm = { bank: value, g: value, throttle: 'mil' };
    stepAircraft(w, ac, DT);
    expect(ac.roll).toBeCloseTo(30 * D2R, 8);
    expect(ac.g).toBe(1);
    ac.cmd.bfm = null;
    fly(w, ac, 1);
    for (const value of [...ac.pos.toArray(), ...ac.vel.toArray(), ac.heading, ac.pitch, ac.roll, ac.g]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it.each([0, 1e-10, 30])('restores the speed floor independently of direction at %s m/s', speed => {
    const w = new World(31);
    const heading = Math.PI / 3;
    const ac = jet(w, 'f15c', 0, 5000, 0, heading, speed);
    ac.cmd.bfm = { bank: 0, g: 1, throttle: 'idle' };
    stepAircraft(w, ac, DT);
    expect(ac.vel.length()).toBeCloseTo(60, 8);
    expect(ac.heading).toBeCloseTo(heading, 8);
    expect(ac.pitch).toBeCloseTo(0, 8);
    expect(ac.pos.x).toBeGreaterThan(0);
    expect(ac.pos.z).toBeLessThan(0);
  });

  it.each(['floor', 'ceiling'] as const)('restores forward motion after a vertical %s clamp', boundary => {
    const w = new World(32);
    const floor = w.groundAlt + MIN_ALT_AGL;
    const altitude = boundary === 'floor' ? floor : AIRCRAFT.f15c.perf.ceilingFt * 0.3048 + 201;
    const ac = jet(w, 'f15c', 0, altitude, 0, Math.PI / 2, 200);
    ac.vel.set(0, boundary === 'floor' ? -200 : 200, 0);
    ac.cmd.bfm = { bank: 0, g: 0, throttle: 'idle' };
    stepAircraft(w, ac, DT);
    expect(ac.vel.length()).toBeGreaterThanOrEqual(60);
    expect(ac.vel.y).toBe(0);
    expect(ac.heading).toBeCloseTo(Math.PI / 2, 8);
    expect(ac.pitch).toBe(0);
    const x = ac.pos.x;
    fly(w, ac, 1);
    expect(ac.pos.x).toBeGreaterThan(x + 50);
    expect(ac.pos.y).toBeGreaterThanOrEqual(floor);
  });

  it('uses the same flight direction below and at the speed floor in a climb', () => {
    const w = new World(33);
    const slow = jet(w, 'f15c', 0, 5000, 0, 0, 30);
    const floor = jet(w, 'f15c', 0, 5000, 0, 0, 60);
    for (const ac of [slow, floor]) {
      const speed = ac.vel.length();
      ac.vel.set(0, speed / Math.sqrt(2), -speed / Math.sqrt(2));
      ac.cmd.bfm = { bank: 0, g: 1, throttle: 'idle' };
      stepAircraft(w, ac, DT);
    }
    expect(slow.vel.distanceTo(floor.vel)).toBeLessThan(1e-9);
    expect(slow.pos.distanceTo(floor.pos)).toBeLessThan(1e-9);
  });

  it('flies a full loop: through the vertical, inverted on top, back to the entry heading', () => {
    const w = new World(1);
    const ac = jet(w, 'f16c', 0, 3000, 0, 0, 230);
    ac.cmd.maxG = 9;
    let maxAlt = 0, sawInverted = false, done = false;
    fly(w, ac, 40, () => {
      if (done) return;
      // over the top the lift vector reads π: keep pulling on whichever side it is
      ac.cmd.bfm = { bank: Math.abs(ac.roll) > Math.PI / 2 ? Math.PI : 0, g: 'max', throttle: 'ab' };
      maxAlt = Math.max(maxAlt, ac.pos.y);
      if (Math.abs(wrapPi(ac.heading - Math.PI)) < 0.2 && Math.abs(ac.pitch) < 0.2 && ac.pos.y > 3500) sawInverted = true;
      if (sawInverted && ac.pitch > -0.05 && Math.abs(wrapPi(ac.heading)) < 0.3) { done = true; ac.cmd.bfm = { bank: 0, g: 1, throttle: 'mil' }; }
    });
    expect(sawInverted).toBe(true);
    expect(done).toBe(true);
    expect(maxAlt).toBeGreaterThan(4000);
  });

  it('flies a high yo-yo: pull up out of plane, then roll over the top and come back down', () => {
    const w = new World(2);
    const ac = jet(w, 'su27', 0, 5000, 0, 0, 250);
    fly(w, ac, 4, () => { ac.cmd.bfm = { bank: 30 * D2R, g: 4, throttle: 'mil' }; });
    const hdg1 = ac.heading;
    expect(ac.pos.y).toBeGreaterThan(5100);
    expect(wrapPi(hdg1)).toBeGreaterThan(5 * D2R);
    fly(w, ac, 6, () => { ac.cmd.bfm = { bank: 120 * D2R, g: 3, throttle: 'mil' }; });
    expect(ac.pitch).toBeLessThan(0);
    expect(wrapPi(ac.heading - hdg1)).toBeGreaterThan(20 * D2R);
  });

  it('a max-g pull bleeds energy; the autopilot takes over again when bfm is cleared', () => {
    const w = new World(3);
    const ac = jet(w, 'f15c', 0, 5000, 0, 0, 260);
    ac.cmd.maxG = 9;
    fly(w, ac, 10, () => { ac.cmd.bfm = { bank: 80 * D2R, g: 'max', throttle: 'mil' }; });
    const e0 = 5000 * 9.81 + 0.5 * 260 * 260;
    const e1 = ac.pos.y * 9.81 + 0.5 * ac.vel.lengthSq();
    expect(e1).toBeLessThan(e0 * 0.85);
    ac.cmd.bfm = null;
    ac.cmd.altitude = ac.pos.y; ac.cmd.heading = ac.heading; ac.cmd.speed = 250;
    fly(w, ac, 20);
    expect(Math.abs(ac.pitch)).toBeLessThan(5 * D2R);
  });

  it('a level turn at the sustained g and full afterburner holds speed', () => {
    const w = new World(4);
    const alt = 5000 * 0.3048;
    const v = 0.9 * soundSpeed(alt);
    const ac = jet(w, 'su27', 0, alt, 0, 0, v);
    ac.cmd.maxG = 9;
    const ns = sustainedGAt(ac, 0.9, alt);
    expect(ns).toBeCloseTo(sustainedG(TURN_PERF.su27, 0.9, 5000), 5);
    const bank = Math.acos(1 / ns);
    ac.roll = bank;                          // already rolled in: no climb from the roll-in transient
    fly(w, ac, 15, () => { ac.cmd.bfm = { bank, g: ns, throttle: 'ab' }; });
    expect(Math.abs(ac.vel.length() - v)).toBeLessThan(0.03 * v);
    expect(Math.abs(ac.pos.y - alt)).toBeLessThan(300);
  });

  it('every gun jet has a turn table within its g limit and a loaded gun', () => {
    for (const id of GUN_JET_IDS) {
      for (const row of TURN_PERF[id].sustainedG) for (const g of row) expect(g).toBeLessThanOrEqual(AIRCRAFT[id].perf.maxG);
      expect(GUNS[id].rounds.value).toBeGreaterThan(0);
    }
  });
});
