import { describe, expect, it } from 'vitest';
import { World } from './world';
import { buildRadarPicture } from './picture';
import { identifiedFriend, iffRange, iffReply } from './radar';
import { IFF } from '../data/iff';
import { FIGHTER_ORDER } from '../data/aircraft';
import type { FighterId } from '../data/types';

/** Player at the origin heading north; a friend and a bandit ahead, 40 km, 3° apart. */
function setup(me: FighterId, mode: 'rws' | 'tws' = 'rws') {
  const world = new World(11);
  world.record = false;
  const ac = world.spawnAircraft({ id: 'me', side: 'blue', type: me, controller: 'player', pos: { x: 0, y: 6000, z: 0 }, heading: 0, speed: 250, radarMode: mode });
  world.spawnAircraft({ id: 'friend', side: 'blue', type: 'f16c', controller: 'script', pos: { x: -1000, y: 6000, z: -40_000 }, heading: Math.PI, speed: 250 });
  world.spawnAircraft({ id: 'bandit', side: 'red', type: 'su27', controller: 'script', pos: { x: 1000, y: 6000, z: -40_000 }, heading: Math.PI, speed: 250 });
  return { world, me: ac };
}

const run = (world: World, s: number) => { for (let i = 0; i < s * 60; i++) world.step(1 / 60); };

describe('IFF as DCS shows it (docs/research/ecm-datalink-iff.md §3)', () => {
  it('every fighter has an IFF rule; the F-15C and FC3 jets are automatic, the others interrogate', () => {
    for (const id of FIGHTER_ORDER) expect(IFF[id]).toBeDefined();
    for (const id of ['f15c', 'su27', 'su33', 'j11a', 'mig29s'] as const) expect(IFF[id].mode).toBe('auto');
    for (const id of ['fa18c', 'f16c', 'f14b', 'jf17', 'm2000c'] as const) expect(IFF[id].mode).toBe('interrogate');
  });

  it('auto IFF (F-15C): the friend shows friendly with no action, the bandit never does', () => {
    const { world } = setup('f15c');
    run(world, 8);
    const pic = buildRadarPicture(world, 'me')!;
    const friendBrick = pic.bricks.find(b => b.targetId === 'friend');
    const banditBrick = pic.bricks.find(b => b.targetId === 'bandit');
    expect(friendBrick?.friendly).toBe(true);
    expect(banditBrick?.friendly).toBe(false);
  });

  it('interrogation (F-16C): nothing until TMS Left, then a friendly reply that shows for 2 s', () => {
    const { world, me } = setup('f16c', 'tws');
    run(world, 8);
    let pic = buildRadarPicture(world, 'me')!;
    expect(pic.tracks.find(t => t.targetId === 'friend')?.friendly).toBe(false);
    const events: { friends: number; asked: number }[] = [];
    world.on(e => { if (e.type === 'iff') events.push({ friends: e.friends, asked: e.asked }); });
    expect(world.interrogate('me')).toEqual({ friends: 1, asked: 2 });
    expect(events).toEqual([{ friends: 1, asked: 2 }]);
    pic = buildRadarPicture(world, 'me')!;
    expect(pic.tracks.find(t => t.targetId === 'friend')).toMatchObject({ friendly: true, iff: { reply: 'friend' } });
    expect(pic.tracks.find(t => t.targetId === 'bandit')).toMatchObject({ friendly: false, iff: { reply: 'no-reply' } });
    run(world, 2.5);
    expect(iffReply(world, me, 'friend')).toBeNull();
    expect(buildRadarPicture(world, 'me')!.tracks.find(t => t.targetId === 'friend')?.friendly).toBe(false);
  });

  it('a reply persists where the manual keeps it (M-2000C "A"), and the range and volume limit it', () => {
    const { world, me } = setup('m2000c');
    run(world, 2);
    world.interrogate('me');
    run(world, 30);
    expect(identifiedFriend(world, me, 'friend')).toBe(true);
    // Out of range: a friend far behind the IFF range does not answer.
    world.spawnAircraft({ id: 'far', side: 'blue', type: 'f16c', controller: 'script', pos: { x: 0, y: 6000, z: -(iffRange(me) + 20_000) }, heading: 0, speed: 250 });
    world.spawnAircraft({ id: 'behind', side: 'blue', type: 'f16c', controller: 'script', pos: { x: 0, y: 6000, z: 20_000 }, heading: 0, speed: 250 });
    world.interrogate('me');
    expect(iffReply(world, me, 'far')).toBeNull();
    expect(iffReply(world, me, 'behind')).toBeNull();
  });

  it('Hornet: designating or locking interrogates that contact', () => {
    const { world, me } = setup('fa18c', 'tws');
    run(world, 8);
    expect(identifiedFriend(world, me, 'friend')).toBe(false);
    world.designate('me', 'friend');
    expect(identifiedFriend(world, me, 'friend')).toBe(true);
  });

  it('a player can fire at an unidentified friend (fratricide, as in DCS), not at an identified one; the AI never can', () => {
    const { world, me } = setup('f16c', 'tws');
    run(world, 8);
    world.designate('me', 'friend');
    world.designate('me', 'friend');
    expect(me.radar.stt.targetId).toBe('friend');
    expect(world.canLaunch('me', 'friend', 'aim120c').reason).not.toMatch(/friendly/);
    world.interrogate('me');
    expect(world.canLaunch('me', 'friend', 'aim120c').reason).toMatch(/friendly \(IFF\)/);
    me.controller = 'ai';
    run(world, 3);
    expect(world.canLaunch('me', 'friend', 'aim120c').reason).toMatch(/friendly \(IFF\)/);
  });
});
