import { describe, expect, it } from 'vitest';
import { World } from './world';
import type { AgWeapon, SimEvent } from './types';
import { AG_WEAPONS } from '../data/agWeapons';
import type { AgLaunchCheck } from './agWeapons';
import type { AgWeaponId } from '../data/types';

const isCheck = (r: AgWeapon[] | AgLaunchCheck): r is AgLaunchCheck => !Array.isArray(r);

/** Su-25T at `alt` flying north at 200 m/s, a tank `range` m north, sight on it. */
function setup(o: { loadout?: string; range?: number; alt?: number; seed?: number } = {}) {
  const world = new World(o.seed ?? 5);
  world.record = false;
  const ac = world.spawnAircraft({ id: 'me', side: 'blue', type: 'su25t', controller: 'script', pos: { x: 0, y: o.alt ?? 2000, z: 0 }, heading: 0, speed: 200, agLoadout: o.loadout });
  const tank = world.spawnGroundUnit({ id: 'T', kind: 'tank', side: 'red', pos: { x: 0, z: -(o.range ?? 6000) } });
  const events: SimEvent[] = [];
  world.on(e => events.push(e));
  return { world, ac, tank, events, ag: ac.ag! };
}

function lockAndLase(world: World, laser = true) {
  world.setAgMaster('me', 'ag');
  world.shkvalPower('me', true);
  world.shkvalPointAt('me', world.groundUnits.get('T')!.pos);
  expect(world.shkvalLock('me').ok).toBe(true);
  if (laser) expect(world.laser('me', true).ok).toBe(true);
}

function flyOut(world: World, ws: AgWeapon[], maxS = 60) {
  for (let t = 0; t < maxS && ws.some(w => w.alive); t += 0.5) world.step(0.5);
}

describe('Vikhr: lock and laser held to impact', () => {
  it('hits with the lock and the laser held', () => {
    const { world, tank, events } = setup();
    lockAndLase(world);
    const check = world.canAgLaunch('me');
    expect(check).toMatchObject({ ok: true, pr: true, weapon: 'vikhr', targetId: 'T' });
    const r = world.agLaunch('me');
    if (isCheck(r)) throw new Error(r.reason);
    expect(r).toHaveLength(1);
    flyOut(world, r);
    expect(r[0].result).toMatchObject({ kind: 'hit' });
    expect(tank.alive).toBe(false);
    expect(events.some(e => e.type === 'ground-kill' && e.targetId === 'T' && e.weapon === 'vikhr')).toBe(true);
  });

  it('misses when the laser is switched off mid-flight', () => {
    const { world, tank, events } = setup();
    lockAndLase(world);
    const r = world.agLaunch('me') as AgWeapon[];
    world.step(4);
    world.laser('me', false);
    flyOut(world, r);
    expect(r[0].result).toMatchObject({ kind: 'miss', reason: 'laser-off' });
    expect(tank.alive).toBe(true);
    expect(events.some(e => e.type === 'ag-miss' && e.reason === 'laser-off')).toBe(true);
  });

  it('misses when the lock breaks at the gimbal limit', () => {
    const { world, ac, tank } = setup();
    lockAndLase(world);
    const r = world.agLaunch('me') as AgWeapon[];
    world.step(3);
    ac.heading = ac.cmd.heading = Math.PI; // turn away: target behind
    world.step(0.1);
    flyOut(world, r);
    expect(r[0].result).toMatchObject({ kind: 'miss', reason: 'gimbal' });
    expect(tank.alive).toBe(true);
  });

  it.each<AgWeaponId>(['vikhr', 'kh25ml', 'kh29l'])('%s misses without damage when the laser goes off just before impact', weapon => {
    const { world, tank, events } = setup({ loadout: weapon === 'vikhr' ? 'vikhr' : 'laser' });
    lockAndLase(world);
    world.selectAgWeapon('me', weapon);
    const r = world.agLaunch('me');
    if (isCheck(r)) throw new Error(r.reason);
    const wp = r[0];
    for (let i = 0; i < 3600 && wp.alive && wp.pos.distanceTo(tank.pos) > 100; i++) world.step(1 / 60);
    expect(wp.alive).toBe(true);
    expect(wp.pos.distanceTo(tank.pos)).toBeLessThanOrEqual(100);
    const hp = tank.hp;
    world.laser('me', false);
    world.step(1 / 60);
    expect(wp.lostWhy).toBe('laser-off');
    // Restoring the laser must not reacquire guidance or erase the first failure.
    world.laser('me', true);
    flyOut(world, r);
    expect(wp.result).toMatchObject({ kind: 'miss', reason: 'laser-off' });
    expect(wp.guided).toBe(false);
    expect(tank.alive).toBe(true);
    expect(tank.hp).toBe(hp);
    expect(events.some(e => e.type === 'ground-kill')).toBe(false);
    expect(events.some(e => e.type === 'ag-miss' && e.reason === 'laser-off')).toBe(true);
  });

  it('fires a pair from alternate stations', () => {
    const { world, ag } = setup();
    lockAndLase(world);
    world.setAgPair('me', true);
    const before = ag.stores.vikhr!;
    const r = world.agLaunch('me') as AgWeapon[];
    expect(r).toHaveLength(2);
    expect(ag.stores.vikhr).toBe(before - 2);
    const st = ag.stations.filter(s => s.weapon === 'vikhr').map(s => s.count);
    expect(st).toEqual([7, 7]);
  });
});

describe('ПР (launch authorised) per weapon', () => {
  it('guided missiles: mode, Shkval, lock, laser and range band', () => {
    const { world } = setup();
    expect(world.canAgLaunch('me').reason).toMatch(/air-to-ground mode/);
    world.setAgMaster('me', 'ag');
    expect(world.canAgLaunch('me').reason).toMatch(/Shkval is off/);
    world.shkvalPower('me', true);
    expect(world.canAgLaunch('me').reason).toMatch(/No lock/);
    world.shkvalPointAt('me', world.groundUnits.get('T')!.pos);
    world.shkvalLock('me');
    expect(world.canAgLaunch('me').reason).toMatch(/Laser off/);
    world.laser('me', true);
    expect(world.canAgLaunch('me').pr).toBe(true);
    expect(isCheck(world.agLaunch('me'))).toBe(false);
  });

  it('out of range is refused', () => {
    const { world } = setup({ range: 14000 });
    lockAndLase(world);
    const c = world.canAgLaunch('me');
    expect(c.ok).toBe(false);
    expect(c.reason).toMatch(/Out of range/);
    expect(isCheck(world.agLaunch('me'))).toBe(true);
  });

  it('TV weapons need the lock but no laser, then fly on without it', () => {
    const { world, tank } = setup({ loadout: 'tv', range: 7000 });
    lockAndLase(world, false);
    world.selectAgWeapon('me', 'kh29t');
    expect(world.canAgLaunch('me')).toMatchObject({ ok: true, pr: true, weapon: 'kh29t' });
    const r = world.agLaunch('me') as AgWeapon[];
    world.step(1);
    world.shkvalUnlock('me');
    flyOut(world, r);
    expect(r[0].result?.kind).toBe('hit');
    expect(tank.alive).toBe(false);
  });

  it('fixed reticle refuses guided weapons', () => {
    const { world } = setup();
    lockAndLase(world);
    world.setAgMaster('me', 'fixed');
    expect(world.canAgLaunch('me').reason).toMatch(/Fixed reticle/);
  });

  it('Kh-58 needs the pod, passive detection and an emitting radar', () => {
    const { world } = setup({ loadout: 'sead', range: 6000 });
    const site = world.spawnSam({ id: 'S', side: 'red', type: 'sa11', pos: { x: 0, z: -40000 }, holdFire: true });
    world.setAgMaster('me', 'ag');
    world.selectAgWeapon('me', 'kh58');
    expect(world.canAgLaunch('me').reason).toMatch(/Passive detection/);
    expect(world.armDetect('me', true).ok).toBe(true);
    expect(world.canAgLaunch('me').reason).toMatch(/Lock an emitter/);
    expect(world.armLock('me').ok).toBe(true);
    expect(world.canAgLaunch('me')).toMatchObject({ ok: true, pr: true, targetId: 'S' });
    world.setSamActive('S', false);
    expect(world.canAgLaunch('me').reason).toMatch(/Emitter silent/);
    world.setSamActive('S', true);
    const r = world.agLaunch('me') as AgWeapon[];
    flyOut(world, r, 120);
    expect(r[0].result?.kind).toBe('hit');
    expect(site.alive).toBe(false);
  });

  it('Kh-58 rechecks the locked emitter zone and emission at release', () => {
    const { world, ac, ag } = setup({ loadout: 'sead' });
    world.spawnSam({ id: 'S', side: 'red', type: 'sa11', pos: { x: 0, z: -40000 }, holdFire: true });
    world.setAgMaster('me', 'ag');
    world.selectAgWeapon('me', 'kh58');
    world.armDetect('me', true);
    expect(world.armLock('me', 'S').ok).toBe(true);
    expect(world.canAgLaunch('me')).toMatchObject({ ok: true, pr: true });
    ac.heading = ac.cmd.heading = Math.PI;
    expect(world.canAgLaunch('me')).toMatchObject({ ok: false, pr: false, reason: expect.stringMatching(/±30°/) });
    const rounds = ag.stores.kh58;
    expect(isCheck(world.agLaunch('me'))).toBe(true);
    expect(ag.stores.kh58).toBe(rounds);
    ac.heading = ac.cmd.heading = 0;
    world.setSamActive('S', false);
    expect(world.canAgLaunch('me')).toMatchObject({ ok: false, pr: false, reason: 'Emitter silent' });
    world.setSamActive('S', true);
    expect(world.canAgLaunch('me')).toMatchObject({ ok: true, pr: true });
  });

  it('Kh-58 without the pod is refused', () => {
    const { world } = setup({ loadout: 'vikhr' });
    expect(world.armDetect('me', true).ok).toBe(false);
    expect(world.canAgLaunch('me', 'kh58').ok).toBe(false);
  });

  it('every guided range band is flagged not verified', () => {
    for (const w of Object.values(AG_WEAPONS)) expect(w.rangeVerified).toBe(false);
  });
});

describe('Ballistic stores: fixed dispersion, deterministic', () => {
  const salvo = (seed: number) => {
    const { world } = setup({ loadout: 'unguided', alt: 600, seed });
    world.setAgMaster('me', 'ag');
    world.selectAgWeapon('me', 's8');
    const ws: AgWeapon[] = [];
    for (let i = 0; i < 6; i++) { ws.push(...(world.agLaunch('me') as AgWeapon[])); world.step(0.05); }
    flyOut(world, ws);
    return ws.map(w => [Math.round(w.pos.x * 100), Math.round(w.pos.z * 100)]);
  };

  it('same seed, same impacts; another seed, other impacts', () => {
    const a = salvo(11), b = salvo(11), c = salvo(12);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    const xs = a.map(p => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0);
  });

  it('a bomb released with the impact point on a truck kills it', () => {
    const world = new World(9);
    world.record = false;
    const ac = world.spawnAircraft({ id: 'me', side: 'blue', type: 'su25t', controller: 'script', pos: { x: 0, y: 1000, z: 0 }, heading: 0, speed: 200, agLoadout: 'unguided' });
    world.setAgMaster('me', 'ag');
    world.selectAgWeapon('me', 'fab250');
    const c = world.canAgLaunch('me');
    expect(c.ok).toBe(true);
    const aim = ac.ag && c.range != null ? c.range : 0;
    expect(aim).toBeGreaterThan(1000);
    // Put the truck on the predicted impact point (the CCIP pipper).
    const z = -Math.sqrt(aim * aim - 1000 * 1000);
    const truck = world.spawnGroundUnit({ kind: 'truck', side: 'red', pos: { x: 0, z } });
    const r = world.agLaunch('me') as AgWeapon[];
    flyOut(world, r);
    expect(truck.alive).toBe(false);
  });

  it('the cannon fires a short burst', () => {
    const { world, ag } = setup({ alt: 300 });
    world.setAgMaster('me', 'ag');
    world.selectAgWeapon('me', 'gun25t');
    const n = ag.stores.gun25t!;
    const r = world.agLaunch('me') as AgWeapon[];
    expect(r.length).toBe(10);
    expect(ag.stores.gun25t).toBe(n - 10);
  });
});
