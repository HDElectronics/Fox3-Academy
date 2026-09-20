import { describe, expect, it } from 'vitest';
import { World } from './world';
import { D2R, bearingTo, dirFrom } from './math';
import { guidanceSupport, revisitTime, stepRadar, supportedTargets } from './radar';

const DT = 1 / 60;

describe('СНП2 support after the final pair', () => {
  for (const spareIrMissiles of [2, 0]) {
    it(`keeps both datalinks after auto-selecting ${spareIrMissiles ? 'R-73' : 'no weapon'}`, () => {
      const world = new World(1);
      world.record = false;
      const shooter = world.spawnAircraft({
        type: 'mig29s', side: 'blue', controller: 'script',
        pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 250,
        stores: { r77: 2, r73: spareIrMissiles },
      });
      const targets = [0, 4].map(azimuth => {
        const pos = shooter.pos.clone().addScaledVector(dirFrom(azimuth * D2R), 16000);
        return world.spawnAircraft({
          type: 'f15c', side: 'red', controller: 'script', pos,
          heading: bearingTo(pos, shooter.pos), speed: 250, stores: {},
        });
      });
      expect(world.setSnp2(shooter.id, true)).toBe(true);
      // Acquire actual firm radar tracks while holding the launch geometry steady.
      const scanSteps = Math.ceil(revisitTime(shooter.radar) * 2.3 / DT);
      for (let i = 0; i < scanSteps; i++) {
        world.t += DT;
        stepRadar(world, shooter, DT);
      }
      world.designate(shooter.id, targets[0].id);
      stepRadar(world, shooter, DT);
      expect(shooter.radar.designated).toEqual(targets.map(t => t.id));
      expect(world.canLaunch(shooter.id).ok).toBe(true);

      // Exercise the normal trigger path, which dispatches the atomic pair.
      const result = world.launch(shooter.id);
      expect('kind' in result).toBe(true);
      const missiles = [...world.missiles.values()];
      expect(missiles).toHaveLength(2);
      expect(missiles.map(m => m.targetId)).toEqual(targets.map(t => t.id));
      expect(shooter.stores.r77).toBe(0);
      expect(shooter.selectedWeapon).toBe(spareIrMissiles ? 'r73' : null);

      // Include subsequent radar + missile ticks: support must survive auto-selection,
      // not merely report true during the launch call itself.
      world.step(0.1);
      expect(shooter.radar.snp2).toBe(true);
      expect(shooter.radar.mode).toBe('tws');
      expect(supportedTargets(world, shooter)).toEqual(new Set(targets.map(t => t.id)));
      for (const m of missiles) {
        expect(m.alive).toBe(true);
        expect(m.guidance).toBe('datalink');
        const support = guidanceSupport(world, shooter, m.targetId);
        expect(support.datalink).toBe(true);
        expect(support.estimate).not.toBeNull();
      }
      expect(world.events.some(e => e.type === 'datalink-lost')).toBe(false);
    });
  }
});
