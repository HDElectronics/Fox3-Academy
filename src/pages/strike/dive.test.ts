import { describe, expect, it } from 'vitest';
import { buildScenario, centreOf, TRUCKS_AT } from './scenario';
import { holdAngleAltitude, noseOffsetM } from './cockpit';
import { predictImpact } from '../../sim/agWeapons';
import { trailSamples } from '../../render/attack/impactTrail';

describe('trainer pitch (Up nose down, Down nose up)', () => {
  it('steepens the longer the key is held, up to a cap', () => {
    expect(noseOffsetM(0)).toBe(150);
    expect(noseOffsetM(1)).toBeGreaterThan(noseOffsetM(0.5));
    expect(noseOffsetM(10)).toBe(1500);
  });
});

describe('impact trail', () => {
  it('keeps the last seconds, fades with age, and clears when the clock goes back', () => {
    const pts = [0, 1, 2, 3, 4, 5].map(t => ({ x: t, y: 0, z: 0, t }));
    const kept = trailSamples(pts, 5, 4);
    expect(kept.map(k => k.p.t)).toEqual([1, 2, 3, 4, 5]);
    expect(kept[0]!.alpha).toBeLessThan(kept[4]!.alpha);
    expect(trailSamples(pts, -1, 4)).toEqual([]);
  });
});

describe('CCIP pass flown by hand', () => {
  // Regression: the lesson rolled in and pulled out on its own (900 m / 300 m AGL) before the trucks were in
  // rocket range. With the pilot's pitch only, a nose-down dive puts the S-8 on the trucks.
  it('push over until the pipper reaches the trucks, let go to hold the dive, fire on a truck: a kill', () => {
    const sc = buildScenario('ccip');
    const w = sc.world, me = sc.me, id = me.id;
    w.setAgMaster(id, 'ag'); w.selectAgWeapon(id, 's8');
    let held = 0, gamma: number | null = null, fired = 0, pulled = false;
    for (let i = 0; i < 60 * 45 && me.alive; i++) {
      const c = centreOf(w, sc.trucks) ?? { x: TRUCKS_AT.x, y: sc.groundM, z: TRUCKS_AT.z };
      me.cmd.heading = Math.atan2(c.x - me.pos.x, -(c.z - me.pos.z));
      const agl = me.pos.y - w.groundHeight(me.pos.x, me.pos.z);
      const p = predictImpact(w, me, 's8');
      const pipperShort = p ? Math.hypot(p.x - me.pos.x, p.z - me.pos.z) < Math.hypot(c.x - me.pos.x, c.z - me.pos.z) : false;
      const rT = Math.hypot(c.x - me.pos.x, c.z - me.pos.z);
      if (agl < 300 || pulled) { pulled = true; gamma = null; me.cmd.altitude = me.pos.y + noseOffsetM(1); }       // Down: pull out
      else if (rT < 4200 && !pipperShort) {                                                                          // pipper long: Up
        if (gamma != null) { gamma = null; held = 0; }
        held += 1 / 60; me.cmd.altitude = me.pos.y - noseOffsetM(held);
      } else if (gamma == null && held > 0) gamma = me.pitch;                                                        // let go: hold
      if (gamma != null && !pulled) me.cmd.altitude = holdAngleAltitude(me.pos.y, me.vel.length(), gamma);
      const onTruck = p && sc.trucks.some(t => { const u = w.groundUnits.get(t)!; return u.alive && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 25; });
      if (onTruck && w.canAgLaunch(id).pr && fired < 6) { const out = w.agLaunch(id); if (Array.isArray(out)) fired++; }
      w.step(1 / 60);
    }
    for (let i = 0; i < 60 * 10 && [...w.agWeapons.values()].some(x => x.alive); i++) w.step(1 / 60);
    expect(fired, 'salvos fired').toBeGreaterThan(0);
    expect(sc.trucks.filter(t => !w.groundUnits.get(t)?.alive).length, `trucks killed after ${fired} salvos`).toBeGreaterThan(0);
    expect(me.alive).toBe(true);
  });
});
