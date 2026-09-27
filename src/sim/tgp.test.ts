import { describe, expect, it } from 'vitest';
import { World } from './world';
import { TGP_DEFAULT_CODE, validLaserCode } from './tgp';

/** A-10C II at 4 km heading north over a tank 8 km ahead, and a JTAC truck 2 km to the side. */
function setup(loadout = 'laser') {
  const world = new World(5);
  world.record = false;
  const ac = world.spawnAircraft({ id: 'hog', side: 'blue', type: 'a10c', controller: 'player', pos: { x: 0, y: 4000, z: 0 }, heading: 0, speed: 110, agLoadout: loadout });
  const tank = world.spawnGroundUnit({ id: 'T', kind: 'tank', side: 'red', pos: { x: 0, z: -8000 } });
  world.spawnGroundUnit({ id: 'jtac', kind: 'truck', side: 'blue', pos: { x: 2000, z: -6000 } });
  return { world, ac, tank };
}
const run = (world: World, s: number) => { for (let i = 0; i < s * 60; i++) world.step(1 / 60); };

describe('A-10C II targeting pod (docs/research/a10c.md §3)', () => {
  it('the A-10C II spawns with a pod, per-jet stores and 1688 codes; the Su-25T has none', () => {
    const { ac } = setup();
    expect(ac.ag!.tgp).not.toBeNull();
    expect(ac.ag!.tgp!.laserCode).toBe(1688);
    expect(ac.ag!.stores.gau8).toBeGreaterThan(0);
    expect(ac.ag!.laserCodes).toMatchObject({ gbu12: 1688, agm65l: 1688 });
    const w = new World(1);
    const frog = w.spawnAircraft({ id: 'f', side: 'blue', type: 'su25t', controller: 'player', pos: { x: 0, y: 3000, z: 0 }, heading: 0, speed: 180 });
    expect(frog.ag!.tgp).toBeNull();
    expect(frog.ag!.stores.gun25t).toBeGreaterThan(0);
  });

  it('codes: four digits 1111–1788, digits 1–8', () => {
    expect(validLaserCode(TGP_DEFAULT_CODE)).toBe(true);
    for (const bad of [1110, 1789, 1698, 2111, 1609, 168]) expect(validLaserCode(bad), String(bad)).toBe(false);
    const { world } = setup();
    expect(world.tgpCode('hog', 'lss', 1511).ok).toBe(true);
    expect(world.tgpCode('hog', 'lss', 1999).ok).toBe(false);
  });

  it('point tracks the unit under the crosshair, sets the SPI, and follows it', () => {
    const { world, ac, tank } = setup();
    expect(world.tgpTrack('hog', 'point').reason).toMatch(/off/);
    world.tgpPower('hog', true);
    world.tgpPointAt('hog', { x: 10, z: -8010 });
    expect(world.tgpTrack('hog', 'point')).toMatchObject({ ok: true, unitId: 'T' });
    tank.speed = 10; tank.heading = Math.PI / 2;
    run(world, 3);
    expect(ac.ag!.tgp!.aim.x).toBeGreaterThan(20);
    expect(world.setSpi('hog').ok).toBe(true);
    expect(ac.ag!.spi!.distanceTo(tank.pos)).toBeLessThan(5);
  });

  it('own laser puts a spot with the pod code on the aim, gone when the laser stops', () => {
    const { world, ac } = setup();
    world.tgpPower('hog', true);
    world.tgpPointAt('hog', { x: 0, z: -8000 });
    expect(world.tgpLaser('hog', true).ok).toBe(true);
    const spot = [...world.marks.values()].find(m => m.type === 'laser' && m.ownerId === 'hog')!;
    expect(spot.code).toBe(1688);
    world.tgpSlew('hog', 1, 0);
    run(world, 1);
    world.tgpSlew('hog', 0, 0);
    expect(spot.pos.distanceTo(ac.ag!.tgp!.aim)).toBeLessThan(1);
    world.tgpLaser('hog', false);
    expect(spot.alive).toBe(false);
  });

  it('LSS finds a JTAC spot on the LSS code: LSRCH → DETECT → LTRACK, NO LSR when the JTAC stops', () => {
    const { world, ac, tank } = setup();
    world.tgpPower('hog', true);
    world.tgpPointAt('hog', { x: 300, z: -7800 });           // near, not on, the target
    const spot = world.spawnMark({ type: 'laser', side: 'blue', ownerId: 'jtac', pos: tank.pos, code: 1688, followUnitId: 'T' });
    const other = world.spawnMark({ type: 'laser', side: 'blue', ownerId: 'jtac', pos: { x: 200, z: -7900 }, code: 1511 });
    world.tgpLss('hog', true);
    expect(ac.ag!.tgp!.lss).toBe('search');
    run(world, 0.1);
    expect(ac.ag!.tgp!.lss).toBe('detect');
    expect(ac.ag!.tgp!.lssMarkId).toBe(spot.id);             // the 1511 spot is ignored
    run(world, 1.5);
    expect(ac.ag!.tgp!.lss).toBe('track');
    expect(ac.ag!.tgp!.aim.distanceTo(tank.pos)).toBeLessThan(1);
    world.endMark(spot.id);
    run(world, 0.1);
    expect(ac.ag!.tgp!.lss).toBe('lost');
    expect(other.alive).toBe(true);
  });

  it('a JTAC spot follows a moving unit; a jet laser spot ends when the jet dies', () => {
    const { world, ac, tank } = setup();
    const spot = world.spawnMark({ type: 'laser', side: 'blue', ownerId: 'jtac', pos: tank.pos, code: 1688, followUnitId: 'T' });
    tank.speed = 8; tank.heading = 0;
    run(world, 2);
    expect(spot.pos.distanceTo(tank.pos)).toBeLessThan(0.5);
    world.tgpPower('hog', true);
    world.tgpPointAt('hog', { x: 0, z: -8000 });
    world.tgpLaser('hog', true);
    const own = world.marks.get(ac.ag!.tgp!.laserMarkId!)!;
    ac.alive = false;
    run(world, 0.1);
    expect(own.alive).toBe(false);
  });
});
