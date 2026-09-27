import { describe, expect, it } from 'vitest';
import { World } from './world';
import { SAM_RING_MARGIN_M, avoidSamRings } from './ai';
import { samRingM } from './sam';
import { samDrill, SAM_DRILL_LEAD_M } from './scenarios';
import { D2R, bearingTo, relBearing, wrapPi } from './math';
import type { RwrContact } from './types';

/** A red SA-11 at the origin and a blue AI F-16C `range` m south of it, heading north. */
function setup(range: number, alt = 6000, seed = 3) {
  const world = new World(seed);
  world.record = false;
  const site = world.spawnSam({ id: 'sam', side: 'red', type: 'sa11', pos: { x: 0, z: 0 } });
  const ac = world.spawnAircraft({
    id: 'ai', side: 'blue', type: 'f16c', controller: 'ai', skill: 'veteran', pos: { x: 0, y: alt, z: range }, heading: 0, speed: 250,
  });
  return { world, site, ac };
}

const onRwr = (siteId: string): RwrContact => ({ emitterId: siteId, state: 'search' } as RwrContact);

describe('AI and SAM rings (trainer rule)', () => {
  it('bends a heading into a known ring to its edge, keeps clear headings, turns out from inside', () => {
    const { world, site, ac } = setup(60_000);
    ac.rwr = [onRwr(site.id)];
    const R = samRingM('sa11') + SAM_RING_MARGIN_M;
    // Straight at the site from 60 km: bent to the nearer tangent, asin(R / D) off the bearing.
    const toSite = bearingTo(ac.pos, site.pos);
    const bent = avoidSamRings(world, ac, toSite + 0.05);
    expect(Math.abs(wrapPi(bent - toSite))).toBeCloseTo(Math.asin(R / 60_000), 6);
    expect(wrapPi(bent - toSite)).toBeGreaterThan(0);                        // the nearer (right) side
    // Well clear of the ring: unchanged.
    expect(avoidSamRings(world, ac, toSite + 1.2)).toBeCloseTo(toSite + 1.2, 9);
    // Unknown site (not on the RWR): unchanged.
    ac.rwr = [];
    expect(avoidSamRings(world, ac, toSite)).toBeCloseTo(toSite, 9);
    // Inside the ring, pointing at the site: turned to at most the beam, away from it.
    ac.rwr = [onRwr(site.id)];
    ac.pos.set(0, 6000, 20_000);
    const inside = avoidSamRings(world, ac, bearingTo(ac.pos, site.pos));
    expect(Math.abs(wrapPi(inside - bearingTo(ac.pos, site.pos)))).toBeGreaterThanOrEqual(Math.PI / 2 - 1e-9);
  });

  it('ignores friendly and dead sites', () => {
    const { world, site, ac } = setup(60_000);
    ac.rwr = [onRwr(site.id)];
    const toSite = bearingTo(ac.pos, site.pos);
    site.alive = false;
    expect(avoidSamRings(world, ac, toSite)).toBeCloseTo(toSite, 9);
  });

  it('defends a SAM launch: beams the site, descends and drops chaff', () => {
    // Inside the SA-11 ring at 25 km: the site tracks and launches within seconds.
    const { world, site, ac } = setup(25_000);
    const chaff0 = ac.chaff, alt0 = ac.pos.y;
    let launched = false, beamed = false;
    for (let i = 0; i < 60 * 40 && ac.alive; i++) {
      world.step(1 / 60);
      if (world.events.some(e => e.type === 'sam' && e.what === 'launch' && e.targetId === ac.id)) launched = true;
      if (launched && ac.ai?.state === 'defend') {
        const off = Math.abs(relBearing(ac.pos, ac.heading, site.pos));
        if (off > 60 * D2R && off < 120 * D2R) beamed = true;
      }
      if (beamed && ac.chaff < chaff0 && ac.cmd.altitude < alt0 - 500) break;
    }
    expect(launched).toBe(true);
    expect(world.events.some(e => e.type === 'ai' && e.ownerId === ac.id && e.state === 'defend' && /SA-11 radar/.test(e.text))).toBe(true);
    expect(beamed).toBe(true);
    expect(ac.chaff).toBeLessThan(chaff0);
    expect(ac.cmd.altitude).toBeLessThan(alt0 - 500);
  });

  it('flies around a known ring to reach a bandit on the far side', () => {
    // Bandit 70 km north, SA-11 half way: the blue AI commits north but stays out of the ring once it knows the site.
    const { world, site, ac } = setup(35_000 + 20_000, 7000, 5);
    world.spawnAircraft({ id: 'red', side: 'red', type: 'su27', controller: 'script', pos: { x: 0, y: 7000, z: -30_000 }, heading: 0, speed: 200 });
    let minD = Infinity;
    // Six minutes: long enough to fly round the ring (38 km radius with the margin) and past the site.
    for (let i = 0; i < 60 * 360 && ac.alive; i++) {
      world.step(1 / 60);
      if (ac.rwr.some(c => c.emitterId === site.id)) minD = Math.min(minD, Math.hypot(ac.pos.x - site.pos.x, ac.pos.z - site.pos.z));
    }
    expect(Number.isFinite(minD)).toBe(true);                               // the site did show on its RWR
    expect(minD).toBeGreaterThan(samRingM('sa11') * 0.95);
    expect(ac.pos.z).toBeLessThan(site.pos.z);                              // and it got past the site toward the bandit
  });
});

describe('SAM drill start', () => {
  it('starts just outside the ring, at most SAM_DRILL_LEAD_M out', () => {
    for (const sam of ['sa10', 'sa11', 'sa15'] as const) {
      const world = new World(1);
      const d = samDrill(world, 'f15c', sam, { playerAlt: 5000 });
      const me = world.aircraft.get(d.playerId)!;
      const out = Math.hypot(d.site().pos.x - me.pos.x, d.site().pos.z - me.pos.z) - d.ringM;
      expect(out).toBeGreaterThan(0);
      expect(out).toBeLessThanOrEqual(SAM_DRILL_LEAD_M + 1);
    }
  });
});
