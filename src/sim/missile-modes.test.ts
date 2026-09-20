import { describe, expect, it } from 'vitest';
import { World } from './world';
import { createMissile } from './missile';
import { simulateShot, shotHits, type ShotSetup } from './dlz';
import { lockTarget, setRadarMode } from './radar';
import { irAcquisitionRange } from './launch';
import { M_PER_NM } from './math';

const shot: ShotSetup = {
  missile: 'aim54a', shooterAlt: 10000, shooterMach: 0.9,
  targetAlt: 10000, targetMach: 0.8, range: 50000, aspectDeg: 0, maneuver: 'none',
};
function encounter(range = 50000) {
  const world = new World(1);
  const shooter = world.spawnAircraft({ type: 'f14b', side: 'blue', controller: 'script', pos: { x: 0, y: 10000, z: 0 }, heading: 0, speed: 270 });
  const target = world.spawnAircraft({ type: 'su27', side: 'red', controller: 'script', pos: { x: 0, y: 10000, z: -range }, heading: Math.PI, speed: 250 });
  return { world, shooter, target };
}

describe('DCS Phoenix launch modes', () => {
  for (const missile of ['aim54a', 'aim54c'] as const) {
    it(`${missile}: TWS goes active, PD-STT stays semi-active through impact`, () => {
      const tws = simulateShot({ ...shot, missile, phoenixLaunchMode: 'tws' });
      const pd = simulateShot({ ...shot, missile, phoenixLaunchMode: 'pd-stt' });
      expect(tws.hit).toBe(true);
      expect(tws.trace[0].guidance).toBe('datalink');
      expect(tws.pitbull).not.toBeNull();
      expect(pd.hit).toBe(true);
      expect(pd.pitbull).toBeNull();
      expect(pd.trace.every(t => t.guidance === 'sarh')).toBe(true);
    });
    for (const phoenixLaunchMode of ['p-stt', 'ph-act'] as const) {
      it(`${missile}: ${phoenixLaunchMode} is active at launch without loft`, () => {
        const { world, shooter, target } = encounter();
        const m = createMissile(world, shooter, missile, target.id, { phoenixLaunchMode });
        expect(m.guidance).toBe('active');
        expect(m.lofting).toBe(false);
        expect(m.phoenixLaunchMode).toBe(phoenixLaunchMode);
      });
    }
  }
  it('inside 10 nm overrides PD-STT; outside 10 nm does not', () => {
    for (const [range, guidance] of [[9.9 * M_PER_NM, 'active'], [10.1 * M_PER_NM, 'sarh']] as const) {
      const { world, shooter, target } = encounter(range);
      lockTarget(world, shooter, target.id);
      const m = createMissile(world, shooter, 'aim54a', target.id);
      expect(m.guidance).toBe(guidance);
    }
  });
  it('captures launch selection: late PH ACT cannot convert a PD-STT shot', () => {
    const { world, shooter, target } = encounter();
    lockTarget(world, shooter, target.id);
    const m = createMissile(world, shooter, 'aim54a', target.id);
    world.missiles.set(m.id, m);
    shooter.radar.phoenixLaunchMode = 'ph-act';
    world.step(1);
    expect(m.phoenixLaunchMode).toBe('pd-stt');
    expect(m.launchRadarMode).toBe('stt');
    expect(m.guidance).toBe('sarh');
    expect(target.rwr.find(c => c.emitterId === shooter.id)?.state).toBe('launch');
    world.setRadarMode(shooter.id, 'off');
    world.step(3);
    expect(m.guidance).toBe('ballistic');
  });
  it('ignores stale P-STT selection after switching to TWS', () => {
    const { world, shooter, target } = encounter();
    shooter.radar.phoenixLaunchMode = 'p-stt';
    setRadarMode(world, shooter, 'tws');
    const m = createMissile(world, shooter, 'aim54c', target.id);
    expect(m.phoenixLaunchMode).toBe('tws');
    expect(m.guidance).toBe('datalink');
  });
});

describe('standalone lab acquisition and radar support', () => {
  it('refuses an IR shot beyond aspect acquisition without producing a missile flight', () => {
    const missile = 'r27et';
    const range = irAcquisitionRange(missile, 0) + 100;
    const hot = simulateShot({ ...shot, missile, range });
    expect(hot.reason).toBe('no-ir-lock');
    expect(hot.hit).toBe(false);
    expect(hot.timeOfFlight).toBe(0);
    expect(hot.trace).toEqual([]);
    expect(hot.events.some(e => e.type === 'launch')).toBe(false);
    const cold = simulateShot({ ...shot, missile, range, aspectDeg: 180 });
    expect(cold.trace.length).toBeGreaterThan(0);
    // Offline reach tables deliberately measure energy separately from acquisition.
    expect(shotHits({ ...shot, missile, range }).reason).not.toBe('no-ir-lock');
  });
  it('radar support loses the shooter lock when the target beams it', () => {
    const setup: ShotSetup = { ...shot, missile: 'r27er', range: 30000, targetAlt: 8000, maneuver: 'beam', reactAfter: 3, seed: 1 };
    const modeled = simulateShot({ ...setup, support: 'radar' });
    const perfect = simulateShot({ ...setup, support: 'perfect' });
    expect(modeled.events.some(e => e.type === 'lock' && e.what === 'broken' && /notch/i.test(e.why ?? ''))).toBe(true);
    expect(modeled.events.some(e => e.type === 'seeker-lost' && e.why === 'lost-guidance')).toBe(true);
    expect(modeled.hit).toBe(false);
    expect(perfect.events.some(e => e.type === 'seeker-lost' && e.why === 'lost-guidance')).toBe(false);
  });
  it('radar support refuses a target already hidden in the shooter notch', () => {
    const r = simulateShot({ ...shot, missile: 'r27er', range: 25000, targetAlt: 7000, aspectDeg: 90, support: 'radar' });
    expect(r.reason).toBe('no-radar-lock');
    expect(r.events).toEqual([]);
  });
  it('omitting support retains the previous perfect-support comparison', () => {
    const setup: ShotSetup = { ...shot, missile: 'aim120c', range: 30000, maneuver: 'beam', seed: 3 };
    expect(simulateShot(setup)).toEqual(simulateShot({ ...setup, support: 'perfect' }));
  });
});
