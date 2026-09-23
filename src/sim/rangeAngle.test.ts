import { describe, expect, it } from 'vitest';
import { AIRCRAFT } from '../data/aircraft';
import type { FighterId } from '../data/types';
import { D2R } from './math';
import { radarRules, setCursor } from './radar';
import { World } from './world';

function setup(type: FighterId = 'su27') {
  const world = new World();
  const ac = world.spawnAircraft({ type, side: 'blue', controller: 'player', pos: { x: 0, y: 5000, z: 0 }, heading: 0, speed: 250 });
  return { world, ac };
}

describe('FC3 range-angle scan aiming', () => {
  it('preserves the entered height difference when range changes, independently of the cursor', () => {
    const { world, ac } = setup();
    world.setScan(ac.id, { expectedRange: 80000, elCenter: Math.atan2(5000, 80000) });
    setCursor(world, ac, { az: 0.2, range: 10000 });
    expect(ac.radar.expectedRange).toBe(80000);
    world.setScan(ac.id, { expectedRange: 40000 });
    expect(ac.radar.expectedRange).toBe(40000);
    expect(ac.radar.elCenter).toBeCloseTo(Math.atan2(5000, 40000));
    expect(ac.radar.cursor).toEqual({ az: 0.2, range: 10000 });
    world.setScan(ac.id, { rangeScale: 10000 });
    expect(ac.radar.expectedRange).toBe(40000);
  });

  it('bounds range input, rejects non-finite input and lets explicit elevation take precedence', () => {
    const { world, ac } = setup();
    world.setScan(ac.id, { expectedRange: 0 });
    expect(ac.radar.expectedRange).toBe(1000);
    world.setScan(ac.id, { expectedRange: 1e9 });
    expect(ac.radar.expectedRange).toBe(200000);
    world.setScan(ac.id, { expectedRange: NaN });
    expect(ac.radar.expectedRange).toBe(200000);
    world.setScan(ac.id, { expectedRange: 50000, elCenter: -3 * D2R });
    expect(ac.radar.elCenter).toBeCloseTo(-3 * D2R);
  });

  it('does not introduce range-angle aiming on continuously aimed Western radars', () => {
    const { world, ac } = setup('f15c');
    world.setScan(ac.id, { elCenter: 2 * D2R });
    world.setScan(ac.id, { expectedRange: 40000 });
    expect(ac.radar.expectedRange).toBeNull();
    expect(ac.radar.elCenter).toBeCloseTo(2 * D2R);
  });

  it('uses the catalogue scan-center positions while leaving other radars continuous', () => {
    for (const type of ['su27', 'su33', 'j11a', 'mig29s'] as const) {
      const { world, ac } = setup(type);
      expect(radarRules(type).azPositionsDeg).toEqual(AIRCRAFT[type].radar.azCenterOptionsDeg);
      world.setScan(ac.id, { azCenter: 22 * D2R });
      expect(ac.radar.azCenter).toBeCloseTo(30 * D2R);
      world.setScan(ac.id, { azCenter: -10 * D2R });
      expect(ac.radar.azCenter).toBe(0);
    }
    const { world, ac } = setup('f15c');
    world.setScan(ac.id, { azHalf: 30 * D2R, azCenter: 12 * D2R });
    expect(ac.radar.azCenter).toBeCloseTo(12 * D2R);
  });
});
