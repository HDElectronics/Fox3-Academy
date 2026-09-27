import { describe, expect, it } from 'vitest';
import { World } from './world';
import { buildRadarPicture } from './picture';
import { datalinkFor } from './datalink';
import { DATALINK, DL_COAST_S } from '../data/datalink';
import { FIGHTER_ORDER } from '../data/aircraft';
import type { FighterId } from '../data/types';

/** Blue player at the origin heading north; a red Su-27 `range` m north flying south. */
function setup(me: FighterId, range = 150_000) {
  const world = new World(21);
  world.record = false;
  world.spawnAircraft({ id: 'me', side: 'blue', type: me, controller: 'player', pos: { x: 0, y: 8000, z: 0 }, heading: 0, speed: 250, radarMode: 'tws' });
  world.spawnAircraft({ id: 'bandit', side: 'red', type: 'su27', controller: 'script', pos: { x: 0, y: 8000, z: -range }, heading: Math.PI, speed: 200 });
  return world;
}

const run = (world: World, s: number) => { for (let i = 0; i < s * 60; i++) world.step(1 / 60); };
const dl = (world: World, id = 'me') => buildRadarPicture(world, id)!.datalink;

describe('datalink picture as DCS shows it (docs/research/ecm-datalink-iff.md §2)', () => {
  it('every fighter has a rule; the F-15C and M-2000C have no air-to-air picture', () => {
    for (const id of FIGHTER_ORDER) expect(DATALINK[id]).toBeDefined();
    expect(DATALINK.f15c.name).toBeNull();
    expect(DATALINK.m2000c.name).toBeNull();
  });

  it('no AWACS and no donors: nothing on the datalink', () => {
    const world = setup('f16c');
    run(world, 12);
    expect(dl(world)).toHaveLength(0);
  });

  it('an AWACS shows a bandit far beyond the radar, called hostile, to Link 16 jets but not the F-15C', () => {
    for (const [me, sees] of [['f16c', true], ['fa18c', true], ['f15c', false], ['m2000c', false]] as const) {
      const world = setup(me);
      world.setAwacs('blue', { x: 0, y: 9000, z: 100_000 });
      run(world, 1);
      const pic = dl(world);
      expect(pic.some(d => d.targetId === 'bandit' && d.source === 'awacs' && d.sovereignty === 'hostile')).toBe(sees);
      if (sees) expect(pic.find(d => d.targetId === 'bandit')!.correlated).toBe(false);
    }
  });

  it('FC3: the AWACS picture needs the radar switched on once, then stays with it off', () => {
    const world = new World(3);
    world.record = false;
    world.spawnAircraft({ id: 'me', side: 'red', type: 'su27', controller: 'player', pos: { x: 0, y: 8000, z: 0 }, heading: 0, speed: 250, radarMode: 'off' });
    world.spawnAircraft({ id: 'eagle', side: 'blue', type: 'f15c', controller: 'script', pos: { x: 0, y: 8000, z: -150_000 }, heading: Math.PI, speed: 200 });
    world.setAwacs('red', { x: 0, y: 9000, z: 50_000 });
    run(world, 1);
    expect(datalinkFor(world, world.get('me')!)).toHaveLength(0);
    world.setRadarMode('me', 'rws');
    expect(datalinkFor(world, world.get('me')!).map(d => d.source)).toEqual(['awacs']);
    run(world, 1);
    world.setRadarMode('me', 'off');
    run(world, 1);
    expect(datalinkFor(world, world.get('me')!).map(d => d.source)).toEqual(['awacs']);
  });

  it('tracks coast 20 s after the last update, then drop', () => {
    const world = setup('f16c');
    world.setAwacs('blue', { x: 0, y: 9000, z: 100_000 });
    run(world, 1);
    world.setAwacs('blue', null);
    const p0 = dl(world).find(d => d.targetId === 'bandit')!;
    run(world, 10);
    const p1 = dl(world).find(d => d.targetId === 'bandit')!;
    expect(p1.range).toBeLessThan(p0.range);            // extrapolated toward us
    run(world, DL_COAST_S - 9);
    expect(dl(world).some(d => d.targetId === 'bandit')).toBe(false);
  });

  it('a Link 16 wingman shares his radar tracks and his position; the F-14 does not get Link 16', () => {
    const world = setup('f16c', 60_000);
    world.spawnAircraft({ id: 'wing', side: 'blue', type: 'fa18c', callsign: 'Hornet 2', controller: 'script', pos: { x: 3000, y: 8000, z: 0 }, heading: 0, speed: 250, radarMode: 'tws' });
    world.spawnAircraft({ id: 'cat', side: 'blue', type: 'f14b', controller: 'player', pos: { x: -3000, y: 8000, z: 0 }, heading: 0, speed: 250, radarMode: 'off' });
    world.setRadarMode('me', 'off');
    run(world, 12);
    const pic = dl(world);
    expect(pic.find(d => d.targetId === 'bandit')).toMatchObject({ source: 'donor', donorLabel: 'Hornet 2', sovereignty: 'unknown' });
    expect(pic.find(d => d.targetId === 'wing')).toMatchObject({ source: 'ppli', sovereignty: 'friendly' });
    expect(datalinkFor(world, world.get('cat')!)).toHaveLength(0);
  });

  it('AWACS hostile is the Hornet\'s second ID factor on its own track', () => {
    const world = setup('fa18c', 60_000);
    world.setAwacs('blue', { x: 0, y: 9000, z: 100_000 });
    run(world, 12);
    const tr = buildRadarPicture(world, 'me')!.tracks.find(t => t.targetId === 'bandit')!;
    expect(tr.dl).toBe('hostile');
  });

  it('a datalink-only track cannot be fired on', () => {
    const world = setup('f16c');
    world.setAwacs('blue', { x: 0, y: 9000, z: 100_000 });
    run(world, 1);
    expect(dl(world).some(d => d.targetId === 'bandit')).toBe(true);
    expect(world.canLaunch('me', 'bandit', 'aim120c').ok).toBe(false);
  });
});
