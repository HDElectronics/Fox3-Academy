/** [OWNER: render] Turn-circle geometry used by the BFM aids (pure). */
import { describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { G0 } from '../sim/math';
import { turnCircle } from './bfmAids';

describe('turnCircle', () => {
  it('is null in straight and level flight', () => {
    const w = new World(1);
    const ac = w.spawnAircraft({ side: 'blue', type: 'f16c', controller: 'script', pos: { x: 0, y: 5000, z: 0 }, heading: 0, speed: 200 });
    ac.g = 1;
    expect(turnCircle(ac)).toBeNull();
  });
  it('a level 4 g turn has radius v² / (g·√(n²−1)) with the plane of motion near horizontal', () => {
    const w = new World(1);
    w.record = false;
    const ac = w.spawnAircraft({ side: 'blue', type: 'f16c', controller: 'script', pos: { x: 0, y: 5000, z: 0 }, heading: 0, speed: 200 });
    ac.cmd.bfm = { bank: Math.acos(1 / 4), g: 4, throttle: 'ab' };
    for (let i = 0; i < 120; i++) w.step(1 / 60);
    const tc = turnCircle(ac)!;
    const v = ac.vel.length();
    const expected = v * v / (G0 * Math.sqrt(ac.g * ac.g - 1));
    expect(tc.radius).toBeGreaterThan(expected * 0.8);
    expect(tc.radius).toBeLessThan(expected * 1.2);
    const normal = tc.u.clone().cross(tc.n);
    expect(Math.abs(normal.y)).toBeGreaterThan(0.8);
  });
});
