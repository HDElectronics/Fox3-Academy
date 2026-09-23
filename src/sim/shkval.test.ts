import { describe, expect, it } from 'vitest';
import { World } from './world';
import type { SimEvent } from './types';
import { LASER_LIMIT_S, canIdentify, idRangeKm, inLockGimbal, shkvalAimPoint, shkvalDir, shkvalFovDeg } from './shkval';
import { groundIntersect } from './ground';
import { D2R, dirFrom } from './math';

/** Su-25T at 2000 m flying north at 200 m/s; ground targets placed by each test. */
function setup(seed = 3) {
  const world = new World(seed);
  world.record = false;
  const ac = world.spawnAircraft({ id: 'me', side: 'blue', type: 'su25t', controller: 'script', pos: { x: 0, y: 2000, z: 0 }, heading: 0, speed: 200 });
  world.setAgMaster('me', 'ag');
  world.shkvalPower('me', true);
  const events: SimEvent[] = [];
  world.on(e => events.push(e));
  return { world, ac, events, sh: ac.ag!.shkval };
}

describe('Shkval lock rule (S1: within 5 m of the set size, 60 m cap)', () => {
  it('locks a tank when the set size matches and refuses a mismatch', () => {
    const { world, sh, events } = setup();
    const tank = world.spawnGroundUnit({ id: 'T', kind: 'tank', side: 'red', pos: { x: 0, z: -6000 } });
    world.shkvalPointAt('me', tank.pos);
    world.shkvalTargetSize('me', { m: 20 });
    const bad = world.shkvalLock('me');
    expect(bad.ok).toBe(false);
    expect(bad.reason).toMatch(/does not match/);
    world.shkvalTargetSize('me', { m: 15 });
    expect(world.shkvalLock('me')).toMatchObject({ ok: true, unitId: 'T' });
    expect(sh.mode).toBe('АС');
    expect(events.some(e => e.type === 'shkval-lock' && e.unitId === 'T')).toBe(true);
  });

  it('picks the matching unit nearest the aim point', () => {
    const { world, sh } = setup();
    world.spawnGroundUnit({ id: 'far', kind: 'tank', side: 'red', pos: { x: 7, z: -6000 } });
    world.spawnGroundUnit({ id: 'near', kind: 'tank', side: 'red', pos: { x: -2, z: -6000 } });
    world.spawnGroundUnit({ id: 'house', kind: 'building', side: 'red', pos: { x: 0, z: -6001 } });
    world.shkvalPointAt('me', { x: 0, y: 0, z: -6000 });
    world.shkvalTargetSize('me', { m: 10 });
    expect(world.shkvalLock('me').unitId).toBe('near');
    expect(sh.lockedUnitId).toBe('near');
  });

  it('locks objects larger than 60 m at the 60 m maximum', () => {
    const { world } = setup();
    world.spawnGroundUnit({ id: 'hangar', kind: 'building', side: 'red', pos: { x: 0, z: -6000 }, sizeM: 120 });
    world.shkvalPointAt('me', { x: 0, y: 0, z: -6000 });
    world.shkvalTargetSize('me', { m: 50 });
    expect(world.shkvalLock('me').ok).toBe(false);
    world.shkvalTargetSize('me', { m: 60 });
    expect(world.shkvalLock('me').unitId).toBe('hangar');
    world.shkvalTargetSize('me', { m: 90 });
    expect(world.aircraft.get('me')!.ag!.shkval.targetSizeM).toBe(60);
  });

  it('reports an empty frame', () => {
    const { world } = setup();
    world.spawnGroundUnit({ kind: 'tank', side: 'red', pos: { x: 300, z: -6000 } });
    world.shkvalPointAt('me', { x: 0, y: 0, z: -6000 });
    expect(world.shkvalLock('me').reason).toMatch(/Nothing in the target frame/);
  });
});

describe('Shkval gimbal and line of sight', () => {
  it('gimbal limits are ±35° azimuth, +15° to −85° elevation', () => {
    expect(inLockGimbal(34 * D2R, -20 * D2R)).toBe(true);
    expect(inLockGimbal(36 * D2R, -20 * D2R)).toBe(false);
    expect(inLockGimbal(0, 16 * D2R)).toBe(false);
    expect(inLockGimbal(0, -86 * D2R)).toBe(false);
  });

  it('drops the lock when the target leaves the gimbal', () => {
    const { world, ac, sh, events } = setup();
    world.spawnGroundUnit({ id: 'T', kind: 'tank', side: 'red', pos: { x: 0, z: -6000 } });
    world.shkvalPointAt('me', { x: 0, y: 0, z: -6000 });
    expect(world.shkvalLock('me').ok).toBe(true);
    ac.heading = ac.cmd.heading = Math.PI / 2; // hard turn east: target now 90° left
    ac.vel.copy(dirFrom(ac.heading).multiplyScalar(200));
    world.step(0.1);
    expect(sh.lockedUnitId).toBeNull();
    expect(sh.mode).toBe('КС');
    expect(events.find(e => e.type === 'shkval-lost')).toMatchObject({ unitId: 'T', why: 'gimbal' });
  });

  it('cannot lock, and loses the lock, when terrain masks the target', () => {
    const { world, events } = setup();
    world.spawnGroundUnit({ id: 'T', kind: 'tank', side: 'red', pos: { x: 0, z: -6000 } });
    let masked = true;
    world.terrain = { heightAt: () => 0, lineOfSight: () => !masked };
    world.shkvalPointAt('me', { x: 0, y: 0, z: -6000 });
    expect(world.shkvalLock('me').reason).toMatch(/Terrain masks/);
    masked = false;
    expect(world.shkvalLock('me').ok).toBe(true);
    masked = true;
    world.step(0.1);
    expect(events.find(e => e.type === 'shkval-lost')).toMatchObject({ why: 'terrain' });
  });

  it('ground-stabilised sight holds its ground point as the jet flies', () => {
    const { world, sh } = setup();
    world.shkvalPointAt('me', { x: 100, y: 0, z: -5000 });
    expect(world.shkvalStabilise('me', true).ok).toBe(true);
    const p0 = sh.stabPoint!.clone();
    world.step(3);
    expect(sh.stabPoint!.distanceTo(p0)).toBeLessThan(1);
    expect(sh.el).toBeLessThan(-20 * D2R); // looking steeper down as the jet closes
  });
});

describe('Shkval aim point consistency', () => {
  it.each([false, true])('releases an unreachable stabilised point (locked initially: %s)', locked => {
    const { world, ac, sh } = setup();
    const tank = world.spawnGroundUnit({ id: 'T', kind: 'tank', side: 'red', pos: { x: 0, z: -6000 } });
    world.shkvalPointAt('me', tank.pos);
    world.shkvalStabilise('me', true);
    if (locked) expect(world.shkvalLock('me').ok).toBe(true);
    ac.heading = ac.cmd.heading = Math.PI / 2;
    world.step(1 / 60);
    expect(sh.groundStab).toBe(false);
    expect(sh.stabPoint).toBeNull();
    expect(sh.lockedUnitId).toBeNull();
    const intersection = groundIntersect(world, ac.pos, shkvalDir(ac));
    expect(intersection).not.toBeNull();
    expect(shkvalAimPoint(world, ac)!.distanceTo(intersection!)).toBeLessThan(0.001);
    expect(shkvalAimPoint(world, ac)!.distanceTo(tank.pos)).toBeGreaterThan(1000);
  });

  it.each(['slew', 'point'] as const)('releases stabilisation when %s moves the sight above the ground', action => {
    const { world, ac, sh } = setup();
    expect(world.shkvalStabilise('me', true).ok).toBe(true);
    if (action === 'slew') {
      world.shkvalSlew('me', 0, 1);
      world.step(2);
    } else {
      world.shkvalPointAt('me', { x: 0, y: 2500, z: -6000 });
    }
    expect(sh.el).toBeGreaterThan(0);
    expect(sh.groundStab).toBe(false);
    expect(sh.stabPoint).toBeNull();
    expect(shkvalAimPoint(world, ac)).toBeNull();
  });

  it('records the current unstabilised LOS rather than null or a stale point', () => {
    const { world, ac, sh } = setup();
    world.record = true;
    for (const stale of [false, true]) {
      sh.stabPoint = stale ? ac.pos.clone() : null;
      world.shkvalSlew('me', 1, 0);
      world.record = false;
      world.step(0.5);
      world.record = true;
      world.step(1 / 60);
      const point = shkvalAimPoint(world, ac)!;
      expect(point).not.toBeNull();
      expect(world.recording.at(-1)!.shkval).toEqual([
        { ownerId: 'me', point: [point.x, point.y, point.z], locked: null, laser: false },
      ]);
    }
  });
});

describe('Laser (simplified trainer heat and recovery model)', () => {
  it('needs the Shkval on', () => {
    const { world } = setup();
    world.shkvalPower('me', false);
    expect(world.laser('me', true).ok).toBe(false);
  });

  it('trips at the limit, cannot be switched on while cooling, then works again', () => {
    const { world, sh, events } = setup();
    expect(world.laser('me', true).ok).toBe(true);
    sh.laserUsedS = LASER_LIMIT_S - 0.5;
    world.step(1);
    expect(sh.laserOn).toBe(false);
    expect(events.find(e => e.type === 'laser' && !e.on)).toMatchObject({ why: 'limit' });
    expect(sh.laserCoolS).toBeGreaterThan(LASER_LIMIT_S - 1);
    expect(world.laser('me', true).reason).toMatch(/cooling/);
    sh.laserCoolS = 0.5; sh.laserUsedS = 0.5;
    world.step(1);
    expect(world.laser('me', true).ok).toBe(true);
  });
});

describe('Shkval helpers', () => {
  it('zoom steps wide, 8x, 23x; S1 23x field of view', () => {
    const { world, sh } = setup();
    world.shkvalZoom('me', 1); expect(sh.zoom).toBe(8);
    world.shkvalZoom('me', 1); expect(sh.zoom).toBe(23);
    world.shkvalZoom('me', 1); expect(sh.zoom).toBe(23);
    expect(shkvalFovDeg(23).h).toBeCloseTo(0.97);
  });

  it('identification ranges from S1: house 15 km, tank 8–10 km', () => {
    expect(idRangeKm('building')).toMatchObject({ maxKm: 15, source: 'S1' });
    expect(idRangeKm('tank')).toMatchObject({ minKm: 8, maxKm: 10, source: 'S1' });
    expect(idRangeKm('truck').source).toBe('simplified');
    expect(canIdentify('tank', 9000, 23)).toBe(true);
    expect(canIdentify('tank', 9000, 8)).toBe(false);
    expect(canIdentify('tank', 12000, 23)).toBe(false);
  });

  it('fighters have no A-G state and the attack jet has no radar', () => {
    const { world, ac } = setup();
    const f = world.spawnAircraft({ side: 'red', type: 'su27', controller: 'script', pos: { x: 0, y: 8000, z: -40000 }, heading: Math.PI, speed: 250 });
    expect(f.ag).toBeUndefined();
    expect(ac.radar.mode).toBe('off');
    world.step(2);
    expect(world.canLaunch('me').ok).toBe(false);
  });
});
