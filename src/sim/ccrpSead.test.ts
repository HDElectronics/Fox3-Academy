import { describe, expect, it } from 'vitest';
import { World } from './world';
import type { AgWeapon, SimEvent } from './types';
import { CCRP_TOL_DEG, armEmitters, ccrpSolution } from './agWeapons';
import { kh58CanAttack, KH58_TARGET_CODES } from '../data/agWeapons';

function jet(o: { loadout: string; alt?: number; heading?: number; x?: number; seed?: number }) {
  const world = new World(o.seed ?? 3);
  world.record = false;
  const ac = world.spawnAircraft({ id: 'me', side: 'blue', type: 'su25t', controller: 'script', pos: { x: o.x ?? 0, y: o.alt ?? 1000, z: 0 }, heading: o.heading ?? 0, speed: 150, agLoadout: o.loadout });
  ac.cmd.heading = ac.heading; ac.cmd.altitude = ac.pos.y; ac.cmd.speed = 150;
  const events: SimEvent[] = [];
  world.on(e => events.push(e));
  return { world, ac, events };
}

function runUntil(world: World, done: () => boolean, maxS: number, dt = 0.05): void {
  for (let t = 0; t < maxS && !done(); t += dt) world.step(dt);
}

describe('CCRP release rule', () => {
  function designate(offsetX = 0) {
    const r = jet({ loadout: 'unguided' });
    const tank = r.world.spawnGroundUnit({ id: 'T', kind: 'tank', side: 'red', pos: { x: offsetX, z: -6000 } });
    r.world.setAgMaster('me', 'ag');
    r.world.selectAgWeapon('me', 'fab250');
    r.world.shkvalPower('me', true);
    r.world.shkvalPointAt('me', tank.pos);
    expect(r.world.shkvalStabilise('me', true).ok).toBe(true);
    return { ...r, tank };
  }

  it('needs a bomb, the Shkval designation and the laser', () => {
    const { world, ac } = designate();
    expect(ccrpSolution(world, ac).reason).toContain('Laser');
    expect(world.ccrpHold('me', true).ok).toBe(false);
    world.laser('me', true);
    const s = ccrpSolution(world, ac);
    expect(s.active).toBe(true);
    expect(s.ttrS!).toBeGreaterThan(10);
    world.selectAgWeapon('me', 's8');
    expect(ccrpSolution(world, ac).reason).toContain('bomb');
  });

  it('releases automatically at time to release 0 with the keel in the circle, and the bomb lands on the point', () => {
    const { world, ac, events, tank } = designate();
    world.laser('me', true);
    expect(world.ccrpHold('me', true).ok).toBe(true);
    const before = ac.ag!.stores.fab250!;
    let ttrAtRelease: number | null = null;
    runUntil(world, () => { const s = ccrpSolution(world, ac); if (s.active) ttrAtRelease = s.ttrS; return events.some(e => e.type === 'ag-launch'); }, 60);
    const launch = events.find(e => e.type === 'ag-launch');
    expect(launch).toMatchObject({ weapon: 'fab250', ccrp: true });
    expect(Math.abs(ttrAtRelease!)).toBeLessThan(0.2);
    expect(ac.ag!.stores.fab250).toBe(before - 1);
    expect(ac.ag!.ccrpHeld).toBe(false);
    const bomb = [...world.agWeapons.values()][0] as AgWeapon;
    runUntil(world, () => !bomb.alive, 40);
    const impact = events.find(e => e.type === 'ag-impact');
    expect(impact && impact.type === 'ag-impact' && Math.hypot(impact.pos[0] - tank.pos.x, impact.pos[2] - tank.pos.z)).toBeLessThan(30);
  });

  it('consumes the automatic release pass even if release is pressed again on consecutive ticks', () => {
    const { world, ac, events } = designate();
    world.laser('me', true);
    world.ccrpHold('me', true);
    runUntil(world, () => events.some(e => e.type === 'ag-launch'), 60);
    const remaining = ac.ag!.stores.fab250;
    expect(ccrpSolution(world, ac).ttrS!).toBeGreaterThan(-0.5);
    expect(ac.ag!.ccrpReleased).toBe(true);
    for (let i = 0; i < 10; i++) {
      expect(world.ccrpHold('me', true)).toMatchObject({ ok: false, reason: expect.stringContaining('already released') });
      world.step(1 / 60);
    }
    expect(ac.ag!.stores.fab250).toBe(remaining);
    expect(events.filter(e => e.type === 'ag-launch')).toHaveLength(1);
    // A new approach to the same designation resets the latch, even with release let go.
    ac.pos.z = 0;
    world.step(1 / 60);
    expect(ac.ag!.ccrpReleased).toBe(false);
    expect(world.ccrpHold('me', true).ok).toBe(true);
    runUntil(world, () => events.filter(e => e.type === 'ag-launch').length === 2, 60);
    expect(events.filter(e => e.type === 'ag-launch')).toHaveLength(2);
  });

  it('does not release with the keel outside the director circle, and drops the pass once the point is behind', () => {
    const { world, ac, events } = designate(700);
    world.laser('me', true);
    const s0 = ccrpSolution(world, ac);
    expect(Math.abs(s0.errDeg!)).toBeGreaterThan(CCRP_TOL_DEG);
    expect(s0.errDeg!).toBeGreaterThan(0); // target right of track
    expect(world.ccrpHold('me', true).ok).toBe(true);
    runUntil(world, () => ccrpSolution(world, ac).passed, 60);
    expect(events.some(e => e.type === 'ag-launch')).toBe(false);
    world.step(0.1);
    expect(ac.ag!.ccrpHeld).toBe(false);
    expect(world.ccrpHold('me', true).reason).toContain('passed');
  });

  it('letting go of release stops the automatic release', () => {
    const { world, ac, events } = designate();
    world.laser('me', true);
    world.ccrpHold('me', true);
    world.step(1);
    world.ccrpHold('me', false);
    runUntil(world, () => ccrpSolution(world, ac).passed, 60);
    expect(events.some(e => e.type === 'ag-launch')).toBe(false);
  });
});

describe('Kh-58 SEAD: detection, lock, ПР, kill', () => {
  function sead(siteBearingDeg: number, rangeM: number) {
    const r = jet({ loadout: 'sead', alt: 3000 });
    const b = siteBearingDeg * Math.PI / 180;
    const site = r.world.spawnSam({ id: 'sam', side: 'red', type: 'sa15', pos: { x: Math.sin(b) * rangeM, z: -Math.cos(b) * rangeM } });
    const radar = r.world.spawnGroundUnit({ id: 'tor', kind: 'sam-site', side: 'red', pos: { x: site.pos.x, z: site.pos.z }, samSiteId: 'sam' });
    r.world.setAgMaster('me', 'ag');
    r.world.selectAgWeapon('me', 'kh58');
    return { ...r, site, radar };
  }

  it('shows the emitter only with [I] and inside ±30°, and every SAM carries a type code', () => {
    const { world, ac } = sead(40, 40000);
    expect(armEmitters(world, ac)).toEqual([]);
    expect(world.armDetect('me', true).ok).toBe(true);
    expect(armEmitters(world, ac)).toEqual([]);
    expect(world.armLock('me').ok).toBe(false);
    ac.heading = 20 * Math.PI / 180;
    expect(armEmitters(world, ac)).toEqual(['sam']);
    for (const id of ['sa10', 'sa11', 'sa15'] as const) { expect(kh58CanAttack(id)).toBe(true); expect(KH58_TARGET_CODES[id]).toBeTruthy(); }
  });

  it('locks, gives ПР only inside the band, and kills the emitting site and its radar vehicle', () => {
    const { world, ac, site, radar, events } = sead(0, 80000);
    world.armDetect('me', true);
    expect(world.armLock('me').ok).toBe(true);
    const far = world.canAgLaunch('me');
    expect(far.pr).toBe(false);
    expect(far.reason).toContain('Out of range');
    runUntil(world, () => world.canAgLaunch('me').pr, 120, 0.5);
    const c = world.canAgLaunch('me');
    expect(c.pr).toBe(true);
    expect(c.range!).toBeLessThanOrEqual(70000);
    const out = world.agLaunch('me');
    expect(Array.isArray(out)).toBe(true);
    ac.cmd.heading = Math.PI; // turn away: the Kh-58 needs only the emitter
    runUntil(world, () => !site.alive || !(out as AgWeapon[])[0]!.alive, 150, 0.1);
    expect(site.alive).toBe(false);
    expect(radar.alive).toBe(false);
    const kills = events.filter(e => e.type === 'ground-kill').map(e => e.type === 'ground-kill' ? e.targetId : '');
    expect(kills).toContain('sam');
    expect(kills).toContain('tor');
  });

  it('a Vikhr on the SAM radar vehicle kills the site: it stops emitting', () => {
    const r = jet({ loadout: 'vikhr', alt: 1500 });
    const site = r.world.spawnSam({ id: 'sam', side: 'red', type: 'sa15', pos: { x: 0, z: -7000 }, holdFire: true });
    const tor = r.world.spawnGroundUnit({ id: 'tor', kind: 'sam-site', side: 'red', pos: { x: 0, z: -7000 }, samSiteId: 'sam' });
    const w = r.world;
    w.setAgMaster('me', 'ag'); w.selectAgWeapon('me', 'vikhr'); w.shkvalPower('me', true);
    w.shkvalPointAt('me', tor.pos);
    w.shkvalZoom('me', 1); w.shkvalZoom('me', 1);
    expect(w.shkvalLock('me').ok).toBe(true);
    w.laser('me', true);
    const out = w.agLaunch('me');
    expect(Array.isArray(out)).toBe(true);
    runUntil(w, () => !(out as AgWeapon[])[0]!.alive, 40, 0.1);
    expect(tor.alive).toBe(false);
    expect(site.alive).toBe(false);
    expect(site.active).toBe(false);
    w.step(0.1);
    expect(r.ac.rwr.some(c => c.emitterId === 'sam')).toBe(false);
  });
});
