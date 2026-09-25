import { describe, expect, test } from 'vitest';
import { FIGHTER_ORDER, MISSILES } from '../../data';
import type { MissileId } from '../../data/types';
import { ASPECTS, ASPECT_DEG, defaultSetup, flyShot, setupWithMissile, shooterTypeFor } from './model';
import { irAcquisitionRange } from '../../sim/launch';

const missiles = Object.keys(MISSILES) as MissileId[];
describe('Missiles lab launch coverage', () => {
  test('PL-5EII selection on the JF-17 keeps conditions and starts inside acquisition', () => {
    const base = { ...defaultSetup('jf17', 'metric'), loftOff: true };
    const setup = setupWithMissile(base, 'pl5e', 'jf17', 'metric');
    expect(setup).toMatchObject({ missile: 'pl5e', shooterType: 'jf17', loftOff: false,
      shooterAlt: base.shooterAlt, targetAlt: base.targetAlt, aspect: base.aspect });
    expect(setup.range).toBe(8000);
    expect(base.missile).toBe('sd10');
    expect(base.loftOff).toBe(true);
    expect(flyShot(setup).hit).toBe(true);
  });

  for (const ac of FIGHTER_ORDER) {
    for (const units of ['metric', 'imperial'] as const) {
      test(`${ac}: select and launch every offered missile in ${units}`, () => {
        let setup = defaultSetup(ac, units);
        for (const missile of missiles) {
          setup = setupWithMissile(setup, missile, ac, units);
          const result = flyShot(setup);
          expect(setup.shooterType).toBe(shooterTypeFor(ac, missile));
          expect(result.trace.length, `${missile}: ${result.reason}`).toBeGreaterThan(0);
          expect(result.hit, missile).toBe(true);
        }
      });
    }
  }

  for (const missile of missiles.filter(m => MISSILES[m].seeker === 'ir')) {
    test(`${missile}: acquisition still gates manual shots at every aspect`, () => {
      for (const aspect of ASPECTS) {
        const setup = { ...defaultSetup('jf17', 'metric', missile), aspect };
        const limit = irAcquisitionRange(missile, ASPECT_DEG[aspect] * Math.PI / 180);
        const rejected = flyShot({ ...setup, range: limit + 1000 });
        expect(rejected).toMatchObject({ reason: 'no-ir-lock', timeOfFlight: 0, trace: [], events: [], missilePath: [] });
        const selected = setupWithMissile(setup, missile, 'jf17', 'metric');
        expect(selected.range).toBeLessThan(limit);
        expect(flyShot(selected).trace.length).toBeGreaterThan(0);
      }
    });
  }

  for (const missile of missiles.filter(m => MISSILES[m].seeker !== 'ir')) {
    test(`${missile}: radar-support mode launches with a close acquired target`, () => {
      const setup = { ...defaultSetup('jf17', 'metric', missile), range: 8000, support: 'radar' as const };
      const result = flyShot(setup);
      expect(result.trace.length, result.reason).toBeGreaterThan(0);
      expect(result.events.some(e => e.type === 'launch')).toBe(true);
    });
  }

  for (const units of ['metric', 'imperial'] as const) {
    for (const missile of missiles) {
      test(`${missile}: opening shot launches in ${units}`, () => {
        const setup = defaultSetup('jf17', units, missile);
        const result = flyShot(setup);
        expect(result.trace.length, result.reason).toBeGreaterThan(0);
        expect(result.events.some(e => e.type === 'launch')).toBe(true);
        expect(result.hit).toBe(true);
      });
    }
  }
});
