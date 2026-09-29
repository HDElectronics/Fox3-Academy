import { describe, expect, it } from 'vitest';
import { World } from './world';

const R2D = 180 / Math.PI;

describe('push-over (attack jets flown with the pitch keys)', () => {
  for (const type of ['a10c', 'su25t'] as const) {
    it(`${type}: pushing the nose down stays upright, it never rolls inverted`, () => {
      const world = new World(3);
      world.record = false;
      const ac = world.spawnAircraft({ id: 'me', side: 'blue', type, controller: 'player', pos: { x: 0, y: 3000, z: 0 }, heading: 0, speed: 130 });
      let maxBank = 0, minPitch = 0;
      for (let i = 0; i < 60 * 8; i++) {
        ac.cmd.heading = 0;
        ac.cmd.altitude = ac.pos.y - 800;            // the pitch keys hold the command well below the jet
        world.step(1 / 60);
        maxBank = Math.max(maxBank, Math.abs(ac.roll) * R2D);
        minPitch = Math.min(minPitch, ac.pitch * R2D);
      }
      expect(minPitch).toBeLessThan(-10);             // it did push into a dive
      expect(maxBank).toBeLessThan(10);               // wings level, no roll to inverted
    });
  }
});
