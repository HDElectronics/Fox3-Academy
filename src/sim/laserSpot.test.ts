import { describe, expect, it } from 'vitest';
import { World } from './world';

/** A-10C II at 4 km heading north, a tank `range` m ahead and a JTAC truck nearby. */
function setup(loadout: string, range = 7000) {
  const world = new World(9);
  world.record = false;
  const ac = world.spawnAircraft({ id: 'hog', side: 'blue', type: 'a10c', controller: 'player', pos: { x: 0, y: 4000, z: 0 }, heading: 0, speed: 130, agLoadout: loadout });
  world.spawnGroundUnit({ id: 'T', kind: 'tank', side: 'red', pos: { x: 0, z: -range } });
  world.spawnGroundUnit({ id: 'jtac', kind: 'truck', side: 'blue', pos: { x: 3000, z: -range + 1000 } });
  world.setAgMaster('hog', 'ag');
  return { world, ac };
}
const run = (world: World, s: number, until: () => boolean = () => false) => { for (let i = 0; i < s * 60 && !until(); i++) world.step(1 / 60); };
const jtacLase = (world: World, code = 1688) =>
  world.spawnMark({ type: 'laser', side: 'blue', ownerId: 'jtac', pos: world.groundUnits.get('T')!.pos, code, followUnitId: 'T' });

describe('laser-spot stores home on any spot with their code (A-10C II)', () => {
  it('GBU-12 on the JTAC spot kills the tank', () => {
    const { world, ac } = setup('pgm', 3500);
    world.selectAgWeapon('hog', 'gbu12');
    expect(world.canAgLaunch('hog').reason).toMatch(/No laser spot on code 1688 and no SPI/);
    jtacLase(world);
    expect(world.canAgLaunch('hog').ok).toBe(true);
    const out = world.agLaunch('hog');
    expect(Array.isArray(out) && out[0]!.laserCode).toBe(1688);
    run(world, 60, () => !world.groundUnits.get('T')!.alive);
    expect(world.groundUnits.get('T')!.alive).toBe(false);
    expect(ac.ag!.stores.gbu12).toBe(1);
  });

  it('a spot on another code is ignored', () => {
    const { world } = setup('laser');
    world.selectAgWeapon('hog', 'agm65l');
    jtacLase(world, 1511);
    expect(world.canAgLaunch('hog').reason).toMatch(/No laser spot on code 1688/);
  });

  it('AGM-65L misses when the JTAC stops lasing (laser off); it needs the spot to impact', () => {
    const { world } = setup('laser');
    world.selectAgWeapon('hog', 'agm65l');
    const spot = jtacLase(world);
    const out = world.agLaunch('hog');
    expect(Array.isArray(out)).toBe(true);
    const wp = (out as { id: string }[])[0]!;
    run(world, 2);
    world.endMark(spot.id);
    const results: string[] = [];
    world.on(e => { if (e.type === 'ag-miss' && e.weaponId === wp.id) results.push(e.reason); });
    run(world, 60, () => results.length > 0);
    expect(results).toEqual(['laser-off']);
    expect(world.groundUnits.get('T')!.alive).toBe(true);
  });

  it('APKWS on the own pod laser hits', () => {
    const { world } = setup('pgm', 7500);
    world.tgpPower('hog', true);
    world.tgpPointAt('hog', { x: 0, z: -7500 });
    expect(world.tgpTrack('hog', 'point').ok).toBe(true);
    expect(world.tgpLaser('hog', true).ok).toBe(true);
    world.selectAgWeapon('hog', 'apkws');
    expect(world.canAgLaunch('hog').ok).toBe(true);
    world.agLaunch('hog');
    run(world, 40, () => !world.groundUnits.get('T')!.alive);
    expect(world.groundUnits.get('T')!.alive).toBe(false);
  });

  it('A-10C II Maverick D: caged, slaved to the SPI, locked with the gate, one lock per missile', () => {
    const { world, ac } = setup('maverick');
    world.selectAgWeapon('hog', 'agm65d');
    expect(world.canAgLaunch('hog').reason).toMatch(/caged/);
    expect(world.mavSlaveToSpi('hog').reason).toMatch(/No SPI/);
    world.tgpPower('hog', true);
    world.tgpPointAt('hog', { x: 0, z: -7000 });
    world.tgpTrack('hog', 'point');
    world.setSpi('hog');
    expect(world.mavSlaveToSpi('hog').ok).toBe(true);
    expect(world.canAgLaunch('hog').reason).toMatch(/No Maverick lock/);
    expect(world.mavLock('hog')).toMatchObject({ ok: true, unitId: 'T' });
    expect(world.canAgLaunch('hog').ok).toBe(true);
    world.agLaunch('hog');
    expect(ac.ag!.mav!.lockedUnitId).toBeNull();
    run(world, 40, () => !world.groundUnits.get('T')!.alive);
    expect(world.groundUnits.get('T')!.alive).toBe(false);
  });

  it('Maverick lock rules: profile, range, gate', () => {
    const { world } = setup('maverick', 20_000);
    world.selectAgWeapon('hog', 'agm65d');
    world.mavPointAt('hog', { x: 0, z: -20_000 });
    expect(world.mavLock('hog').reason).toMatch(/Too far/);
    const near = setup('maverick', 7000);
    near.world.selectAgWeapon('hog', 'agm65d');
    near.world.mavPointAt('hog', { x: 400, z: -7000 });
    expect(near.world.mavLock('hog').reason).toMatch(/Nothing in the gate/);
    near.world.selectAgWeapon('hog', 'gau8');
    expect(near.world.mavLock('hog').reason).toMatch(/SENSOR/);
  });
});
