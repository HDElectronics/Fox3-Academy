import { describe, expect, it } from 'vitest';
import { World } from './world';
import { AIRCRAFT, FIGHTER_ORDER } from '../data/aircraft';
import { rwrSymbol } from '../data/rwr';
import { SAMS } from '../data/sams';
import type { FighterId, SamId } from '../data/types';
import type { RwrContact, SimEvent } from './types';
import { SAM_MODEL, samRingM, samSightBlock } from './sam';
import { bearingTo, wrap2Pi } from './math';
import { duel, samDrill } from './scenarios';

const SITE = 'site';

/** Player `range` m south of a site at the origin, flying north (hot) at `alt`. */
function setup(opts: { type?: FighterId; sam?: SamId; range?: number; alt?: number; seed?: number; maskAltM?: number; holdFire?: boolean } = {}) {
  const world = new World(opts.seed ?? 7);
  world.record = false;
  const sam = opts.sam ?? 'sa11';
  const site = world.spawnSam({ id: SITE, side: 'red', type: sam, pos: { x: 0, z: 0 }, maskAltM: opts.maskAltM, holdFire: opts.holdFire });
  const alt = opts.alt ?? 6000;
  const me = world.spawnAircraft({
    id: 'player', side: 'blue', type: opts.type ?? 'f16c', controller: 'player',
    pos: { x: 0, y: alt, z: opts.range ?? 40000 }, heading: 0, speed: 250,
  });
  const events: SimEvent[] = [];
  world.on(e => events.push(e));
  return { world, site, me, events };
}

function runUntil(world: World, pred: () => boolean, maxS: number): boolean {
  for (let t = 0; t < maxS; t += 0.1) { world.step(0.1); if (pred()) return true; }
  return false;
}

const samEvents = (events: SimEvent[]) => events.filter((e): e is Extract<SimEvent, { type: 'sam' }> => e.type === 'sam');

describe('SAM site: search, track, launch', () => {
  it('searches, locks and launches deterministically', () => {
    const trace = () => {
      const { world, events } = setup();
      runUntil(world, () => world.samMissiles.size > 0, 60);
      return samEvents(events).map(e => `${e.what}@${e.t.toFixed(2)}`);
    };
    const a = trace();
    expect(a[0]).toMatch(/^track@/);
    expect(a.some(s => s.startsWith('launch@'))).toBe(true);
    expect(trace()).toEqual(a);
  });

  it('waits for the acquisition delay and the intercept point inside the ring', () => {
    const { world, events } = setup();
    runUntil(world, () => world.samMissiles.size > 0, 60);
    const ev = samEvents(events);
    const track = ev.find(e => e.what === 'track');
    const launch = ev.find(e => e.what === 'launch');
    expect(track && launch).toBeTruthy();
    expect(launch!.t - track!.t).toBeGreaterThanOrEqual(SAM_MODEL.sa11.acquireS - 1e-6);
    expect(track!.range!).toBeLessThanOrEqual(samRingM('sa11'));
  });

  it('never launches above the ceiling, below the floor or with hold fire', () => {
    for (const o of [{ alt: SAMS.sa15.maxAltM + 1500, sam: 'sa15' as const, range: 11000 }, { holdFire: true }]) {
      const { world } = setup(o);
      world.step(40);
      expect(world.samMissiles.size).toBe(0);
    }
  });

  it('shows search, lock and launch on the RWR of every jet, with that RWR\'s symbol', () => {
    for (const type of FIGHTER_ORDER) {
      const { world, me } = setup({ type, range: 48000 });
      const seen = new Set<RwrContact['state']>();
      runUntil(world, () => {
        const c = me.rwr.find(x => x.emitterId === SITE);
        if (c) { expect(c.emitterType).toBe('sam-medium'); seen.add(c.state); }
        return seen.has('launch');
      }, 80);
      expect([...seen].sort(), type).toEqual(['launch', 'lock', 'search']);
      expect(rwrSymbol(AIRCRAFT[type].rwr, 'sam-medium')).not.toBe('');
    }
  });

  it('a silent site makes no RWR contact and never tracks', () => {
    const { world, me } = setup();
    world.setSamActive(SITE, false);
    world.step(20);
    expect(me.rwr.some(c => c.emitterId === SITE)).toBe(false);
    expect(world.samSites.get(SITE)!.state).toBe('off');
  });
});

describe('SAM defences (gameplay rules)', () => {
  it('a hot, non-manoeuvring target inside the ring is hit', () => {
    const { world, me, events } = setup({ range: 30000 });
    runUntil(world, () => !me.alive, 90);
    expect(me.alive).toBe(false);
    expect(events.some(e => e.type === 'kill' && e.by === SITE)).toBe(true);
  });

  it('terrain masking breaks the track and the missile loses guidance', () => {
    const { world, me, site, events } = setup({ range: 30000, alt: 1500, maskAltM: 300 });
    runUntil(world, () => world.samMissiles.size > 0, 60);
    expect(samSightBlock(site, me)).toBeNull();
    // Drop below the ridge line.
    me.pos.y = site.pos.y + 150; me.cmd.altitude = me.pos.y; me.vel.y = 0;
    expect(samSightBlock(site, me)).toBe('terrain');
    runUntil(world, () => [...world.samMissiles.values()].every(m => !m.alive), 60);
    const lost = samEvents(events).find(e => e.what === 'lost');
    expect(lost?.why).toBe('terrain');
    expect(me.alive).toBe(true);
    const miss = events.find(e => e.type === 'miss');
    expect(miss && miss.type === 'miss' && miss.reason).toBe('lost-guidance');
  });

  it('low level hides you below the radar horizon', () => {
    const { world, me, site } = setup({ range: 60000, alt: 50 });
    expect(samSightBlock(site, me)).toBe('horizon');
    world.step(5);
    expect(site.painted).not.toContain(me.id);
    expect(me.rwr.some(c => c.emitterId === SITE)).toBe(false);
  });

  /** Fly hot until the first launch, then keep flying hot or hold the site on the beam; optional chaff every second. */
  function shot(seed: number, beam: boolean, chaff: boolean) {
    const { world, me, site, events } = setup({ range: 32000, seed });
    runUntil(world, () => world.samMissiles.size > 0, 60);
    let next = world.t;
    runUntil(world, () => {
      if (beam) me.cmd.heading = wrap2Pi(bearingTo(me.pos, site.pos) + Math.PI / 2);
      if (chaff && world.t >= next) { world.chaff(me.id); next = world.t + 1; }
      return !me.alive;
    }, 60);
    const lost = samEvents(events).filter(e => e.what === 'lost').map(e => e.why);
    return { hit: !me.alive, lost };
  }

  it('notch breaks the track; chaff alone does not', () => {
    const seeds = [1, 2, 3, 4, 5, 6];
    const hot = seeds.map(s => shot(s, false, true));
    expect(hot.every(r => r.hit)).toBe(true);
    expect(hot.flatMap(r => r.lost).includes('chaff')).toBe(false);
    const beam = seeds.map(s => shot(s, true, false));
    expect(beam.every(r => !r.hit)).toBe(true);
    expect(beam.flatMap(r => r.lost)).toContain('notched');
  });

  it('beam plus chaff can break the track before the notch memory runs out', () => {
    const lost = [1, 2, 3, 4, 5, 6, 7, 8].flatMap(s => shot(s, true, true).lost);
    expect(lost).toContain('chaff');
  });

  it('the SA-10 flyout reaches its threat ring against a hot high target', () => {
    const { world, me } = setup({ sam: 'sa10', range: 115000, alt: 10000 });
    runUntil(world, () => !me.alive, 200);
    expect(me.alive).toBe(false);
  });
});

describe('SAM scenarios', () => {
  it('samDrill: the RWR shows search outside the ring, then lock and launch as you fly in', () => {
    for (const sam of ['sa10', 'sa11', 'sa15'] as const) {
      const world = new World(3); world.record = false;
      const d = samDrill(world, 'f15c', sam, { playerAlt: 5000 });
      const me = world.get(d.playerId)!;
      world.step(1);
      expect(me.rwr.find(c => c.emitterId === d.siteId)?.state, sam).toBe('search');
      runUntil(world, () => d.missiles().length > 0, 200);
      expect(d.missiles().length, sam).toBeGreaterThan(0);
      expect(d.site().state).toBe('engage');
      expect(me.rwr[0].emitterId).toBe(d.siteId);
      expect(me.rwr[0].state).toBe('launch');
    }
  });

  it('sortie engagements can place SAM sites and default to none', () => {
    const w1 = new World(1); w1.record = false;
    expect(duel(w1, 'su27').samIds).toEqual([]);
    const w2 = new World(1);
    const eng = duel(w2, 'su27', undefined, 'regular', { sams: [{ type: 'sa11', offsetDeg: 20 }, { type: 'sa15', range: 30000 }] });
    expect(eng.samIds).toEqual(['sam1', 'sam2']);
    expect(w2.samSites.get('sam1')?.type).toBe('sa11');
    expect(w2.samSites.get('sam2')?.pos.length()).toBeCloseTo(30000, -1);
    w2.step(2);
    expect(w2.recording.length).toBeGreaterThan(0);
    expect(w2.recording.at(-1)?.sams?.length).toBe(2);
  });
});
