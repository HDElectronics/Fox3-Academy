import { describe, expect, it } from 'vitest';
import { World } from './world';
import { buildRadarPicture } from './picture';
import { burnThroughRange, canLockJammer, isJammed, strobeRange } from './radar';
import { ecmWanted } from './ai';
import { BURN_THROUGH_M, HOJ_MISSILES, OWN_JAMMER } from '../data/ecm';
import { FIGHTER_ORDER } from '../data/aircraft';
import type { FighterId, MissileId } from '../data/types';
import type { RwrContact } from './types';

/** Blue fighter at the origin heading north; red jammer `range` m north, flying south at the same altitude. */
function setup(range: number, opts: { me?: FighterId; them?: FighterId; jamming?: boolean; stores?: Partial<Record<MissileId, number>> } = {}) {
  const world = new World(7);
  world.record = false;
  const me = world.spawnAircraft({
    id: 'me', side: 'blue', type: opts.me ?? 'f15c', controller: 'player', pos: { x: 0, y: 6000, z: 0 }, heading: 0, speed: 250,
    stores: opts.stores,
  });
  const them = world.spawnAircraft({
    id: 'them', side: 'red', type: opts.them ?? 'su27', controller: 'script', pos: { x: 0, y: 6000, z: -range }, heading: Math.PI, speed: 250,
    jamming: opts.jamming ?? true,
  });
  return { world, me, them };
}

/** Step until `until` is true or `s` seconds pass. */
function run(world: World, s: number, until: () => boolean = () => false): void {
  for (let i = 0; i < s * 60 && !until(); i++) world.step(1 / 60);
}

describe('jamming as DCS shows it (docs/research/ecm-datalink-iff.md)', () => {
  it('every fighter has a burn-through range and the F-15C one sits in the manual 15–23 nm', () => {
    for (const id of FIGHTER_ORDER) expect(BURN_THROUGH_M[id].value).toBeGreaterThan(10_000);
    expect(BURN_THROUGH_M.f15c.value / 1852).toBeGreaterThanOrEqual(15);
    expect(BURN_THROUGH_M.f15c.value / 1852).toBeLessThanOrEqual(23);
  });

  it('outside burn-through a jammer is a strobe (bearing only), not a brick; inside it is an ordinary contact', () => {
    const { world, me, them } = setup(70_000);
    expect(isJammed(me, them)).toBe(true);
    expect(70_000).toBeLessThan(strobeRange(me));
    run(world, 6, () => me.radar.strobes.length > 0);
    const pic = buildRadarPicture(world, 'me')!;
    expect(pic.strobes.map(x => x.targetId)).toEqual(['them']);
    expect(pic.strobes[0].az).toBeCloseTo(0, 1);
    expect(pic.bricks).toHaveLength(0);
    // Close inside burn-through (35 km for the F-15C): range comes back.
    them.pos.z = -(burnThroughRange(me) - 5000);
    me.radar.strobes.length = 0;
    run(world, 6, () => me.radar.bricks.length > 0);
    expect(me.radar.bricks.some(b => b.targetId === 'them')).toBe(true);
  });

  it('a silent target shows no strobe', () => {
    const { world, me } = setup(70_000, { jamming: false });
    run(world, 6);
    expect(me.radar.strobes).toHaveLength(0);
  });

  it('refuses a normal lock on a jammer, takes an angle-only jam lock, and hides the placeholder range', () => {
    const { world, me } = setup(70_000);
    run(world, 6, () => me.radar.strobes.length > 0);
    expect(world.lock('me', 'them')).toBe(false);
    expect(canLockJammer(world, me, 'them').ok).toBe(true);
    expect(world.lockJammer('me', 'them')).toBe(true);
    expect(me.radar.stt).toMatchObject({ targetId: 'them', hoj: true });
    run(world, 1);
    const pic = buildRadarPicture(world, 'me')!;
    expect(pic.stt?.hoj).toBe(true);
    expect(pic.tracks.some(t => t.targetId === 'them')).toBe(false);
  });

  it('jam lock: only home-on-jam missiles can be fired, with no launch zone', () => {
    const { world, me } = setup(70_000, { stores: { aim120c: 2, aim7m: 2, aim9m: 2 } });
    run(world, 6, () => me.radar.strobes.length > 0);
    world.lockJammer('me', 'them');
    const c120 = world.canLaunch('me', 'them', 'aim120c');
    expect(c120).toMatchObject({ ok: true, range: null, dlz: null });
    expect(world.canLaunch('me', 'them', 'aim7m').ok).toBe(true);
    expect(HOJ_MISSILES.r77).toBeUndefined();
    const mig = setup(70_000, { me: 'mig29s', stores: { r77: 2, r27r: 2 } });
    run(mig.world, 6, () => mig.me.radar.strobes.length > 0);
    expect(mig.world.lockJammer('me', 'them')).toBe(true);
    expect(mig.world.canLaunch('me', 'them', 'r77').reason).toMatch(/cannot home on jam/);
    expect(mig.world.canLaunch('me', 'them', 'r27r').ok).toBe(true);
  });

  it('home-on-jam flies pure pursuit: an R-27ER kills a jammer from 30 km, an AIM-120 runs out of energy from 60 km', () => {
    // Su-27 burn-through is 25 km, so at 30 km the F-15C is still a strobe.
    const { world, me, them } = setup(30_000, { me: 'su27', them: 'f15c', stores: { r27er: 2 } });
    run(world, 6, () => me.radar.strobes.length > 0);
    expect(world.lockJammer('me', 'them')).toBe(true);
    const m = world.launch('me', 'them', 'r27er');
    expect('kind' in m && m.guidance).toBe('hoj');
    run(world, 120, () => !them.alive);
    expect(them.alive).toBe(false);
    // No range means no loft: a long HOJ shot is a low-energy shot (DCS: low kill chance).
    const far = setup(60_000, { stores: { aim120c: 2 } });
    run(far.world, 6, () => far.me.radar.strobes.length > 0);
    far.world.lockJammer('me', 'them');
    const misses: string[] = [];
    far.world.on(e => { if (e.type === 'miss') misses.push(e.reason); });
    far.world.launch('me', 'them', 'aim120c');
    run(far.world, 120, () => misses.length > 0);
    expect(misses).toEqual(['kinematic']);
  });

  it('when the jammer stops: a HOJ AIM-7 goes ballistic, a HOJ AIM-120 flies on inertial', () => {
    const a = setup(60_000, { stores: { aim7m: 2, aim120c: 2 } });
    run(a.world, 6, () => a.me.radar.strobes.length > 0);
    a.world.lockJammer('me', 'them');
    const sparrow = a.world.launch('me', 'them', 'aim7m');
    const amraam = a.world.launch('me', 'them', 'aim120c');
    run(a.world, 2);
    a.world.setJamming('them', false);
    run(a.world, 0.5);
    expect('kind' in sparrow && sparrow.guidance).toBe('ballistic');
    expect('kind' in amraam && amraam.guidance).not.toBe('hoj');
  });

  it('a jam lock becomes an ordinary STT at burn-through', () => {
    const { world, me, them } = setup(45_000);
    run(world, 6, () => me.radar.strobes.length > 0);
    world.lockJammer('me', 'them');
    run(world, 40, () => !me.radar.stt.hoj);
    expect(me.radar.stt).toMatchObject({ targetId: 'them', hoj: false });
    expect(me.pos.distanceTo(them.pos)).toBeLessThanOrEqual(burnThroughRange(me) + 1000);
  });

  it('own jammer: jets with one switch it on with an event, the J-11A has none', () => {
    const { world } = setup(70_000, { me: 'f15c', jamming: false });
    const seen: boolean[] = [];
    world.on(e => { if (e.type === 'jam' && e.ownerId === 'me') seen.push(e.on); });
    expect(world.setJamming('me', true)).toBe(true);
    expect(world.get('me')!.jamming).toBe(true);
    expect(seen).toEqual([true]);
    expect(OWN_JAMMER.j11a).toBeNull();
    const j = setup(70_000, { me: 'j11a', jamming: false });
    expect(j.world.setJamming('me', true)).toBe(false);
  });

  it('AI "ECM Using" follows its RWR', () => {
    const { me } = setup(70_000);
    const c = (state: RwrContact['state'], emitterType: RwrContact['emitterType'] = 'f15c') => ({ emitterId: 'x', emitterType, state } as RwrContact);
    me.rwr = [];
    expect(ecmWanted(me, 'always')).toBe(true);
    expect(ecmWanted(me, 'never')).toBe(false);
    expect(ecmWanted(me, 'detected')).toBe(false);
    me.rwr = [c('search')];
    expect(ecmWanted(me, 'detected')).toBe(true);
    expect(ecmWanted(me, 'locked')).toBe(false);
    me.rwr = [c('lock')];
    expect(ecmWanted(me, 'locked')).toBe(true);
    me.rwr = [c('missile', 'missile')];
    expect(ecmWanted(me, 'detected')).toBe(false);
  });
});
