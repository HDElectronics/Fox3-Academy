import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { World } from './world';
import { AI_SKILLS, aiStatus, configureAi, thinkAi } from './ai';
import {
  carriersOf, cruiseFor, defaultAdversary, defaultThreatMissile, defenseDrill, duel, pair, radarLab, setManeuver,
  twoVTwo, twsDrill,
} from './scenarios';
import { D2R, R2D, aspectAngle, bearingTo, relBearing, wrapPi } from './math';
import type { Aircraft, AiMemory, Missile, MissileGuidance, RwrContact, SimEvent } from './types';
import type { MissileId } from '../data/types';
import { AIRCRAFT_ORDER } from '../data/aircraft';

type AiEvent = Extract<SimEvent, { type: 'ai' }>;
type LaunchEvent = Extract<SimEvent, { type: 'launch' }>;

const aiEvents = (w: World, id?: string) =>
  w.events.filter((e): e is AiEvent => e.type === 'ai' && (!id || e.ownerId === id));
const launches = (w: World, shooter?: string) =>
  w.events.filter((e): e is LaunchEvent => e.type === 'launch' && (!shooter || e.shooterId === shooter));

/** Step until `until()` is true or `seconds` pass; returns the sim time it stopped at. */
function runUntil(w: World, seconds: number, until: () => boolean = () => false, dt = 0.1): number {
  const end = w.t + seconds;
  while (w.t < end) {
    w.step(dt);
    if (until()) break;
  }
  return w.t;
}

/** A hand-made missile for unit tests (no missile model involved). */
function fakeMissile(w: World, shooter: Aircraft, target: Aircraft, type: MissileId, pos: Vector3, guidance: MissileGuidance): Missile {
  const vel = target.pos.clone().sub(pos).setLength(900);
  const m: Missile = {
    kind: 'missile', id: w.uid('M'), type, side: shooter.side, shooterId: shooter.id, targetId: target.id,
    pos: pos.clone(), vel, launchedAt: w.t, alive: true, guidance, aimPos: target.pos.clone(), aimVel: target.vel.clone(),
    seekerOn: guidance === 'active' ? target.id : null, motorLeft: 0, mass: 150, lofting: false,
    timeToActive: null, timeToImpact: null, result: null, closestApproach: Infinity,
  };
  w.missiles.set(m.id, m);
  return m;
}

function contact(ac: Aircraft, emitterId: string, at: Vector3, state: RwrContact['state'], missileType?: MissileId): RwrContact {
  return {
    emitterId, emitterType: state === 'missile' ? 'missile' : 'su27', missileType, state,
    bearing: relBearing(ac.pos, ac.heading, at), elevation: 0, strength: 0.9, firstSeen: 0, lastSeen: 0,
  };
}

/** Advance the AI alone (no world.step), `seconds` of decisions. `refresh` rebuilds the fake RWR each think. */
function think(w: World, ac: Aircraft, seconds: number, refresh?: () => void): void {
  for (let t = 0; t < seconds; t += 0.05) {
    w.t += 0.05;
    refresh?.();
    thinkAi(w, ac, 0.05);
  }
}

const aiOf = (ac: Aircraft): AiMemory => {
  if (!ac.ai) throw new Error(`${ac.id} has no AI`);
  return ac.ai;
};

// ───────────────────────────────────────────────────────────── scenarios

describe('scenario builders', () => {
  it('JF-17 BVR scenarios enter INTC TWS while generic navigation and explicit overrides remain RWS', () => {
    const w = new World(3);
    const drill = twsDrill(w, 'jf17');
    expect(w.get(drill.playerId)?.radar.mode).toBe('tws');
    const nav = w.spawnAircraft({ side: 'blue', type: 'jf17', controller: 'script',
      pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 250 });
    expect(nav.radar.mode).toBe('rws');
    const override = new World(4);
    const d = twsDrill(override, 'jf17', { playerRadarMode: 'rws' });
    expect(override.get(d.playerId)?.radar.mode).toBe('rws');
  });
  it('twsDrill: four scripted bandits at 70-100 km, hot, different altitudes', () => {
    const w = new World(3);
    const d = twsDrill(w, 'su27');
    const me = w.get(d.playerId);
    expect(me?.controller).toBe('player');
    expect(d.banditIds).toHaveLength(4);
    const alts = new Set<number>();
    for (const id of d.banditIds) {
      const b = w.get(id);
      expect(b?.side).toBe('red');
      expect(b?.type).toBe(defaultAdversary('su27'));
      const r = me && b ? me.pos.distanceTo(b.pos) : 0;
      expect(r).toBeGreaterThan(70_000);
      expect(r).toBeLessThan(100_000);
      expect(Math.abs(wrapPi((b?.heading ?? 0) - Math.PI))).toBeLessThan(1e-6);
      alts.add(Math.round(b?.pos.y ?? 0));
      expect(aiStatus(b as Aircraft)?.script).toBe('straight');
    }
    expect(alts.size).toBe(4);
  });

  it('duel / pair / twoVTwo place sensible opponents head-on at ~100 km', () => {
    const w1 = new World(1);
    const e1 = duel(w1, 'f15c');
    expect(e1.enemyIds).toHaveLength(1);
    const bandit = w1.get(e1.enemyIds[0]);
    const me = w1.get(e1.playerId);
    expect(bandit?.type).toBe('su27');
    expect(me && bandit ? me.pos.distanceTo(bandit.pos) : 0).toBeCloseTo(100_000, -3);
    // Bandit points at the player.
    expect(me && bandit ? Math.abs(relBearing(bandit.pos, bandit.heading, me.pos)) : 1).toBeLessThan(0.01);

    const w2 = new World(1);
    const e2 = pair(w2, 'su27', undefined, 'veteran');
    expect(e2.enemyIds).toHaveLength(2);
    expect(e2.enemyType).toBe('f15c');
    const [a, b] = e2.enemyIds.map(id => w2.get(id));
    expect(a && b ? a.pos.distanceTo(b.pos) : 0).toBeGreaterThan(4000);

    const w3 = new World(1);
    const e3 = twoVTwo(w3, 'fa18c');
    expect(e3.wingmanId).toBe('wingman');
    const wing = w3.get('wingman');
    expect(wing?.side).toBe('blue');
    expect(wing?.controller).toBe('ai');
    expect(e3.friendIds).toEqual(['wingman']);
  });

  it('every jet gets a cruise state, an adversary and a carrier for its default threat', () => {
    for (const id of AIRCRAFT_ORDER) {
      const c = cruiseFor(id);
      expect(c.alt).toBeGreaterThanOrEqual(7500);
      expect(c.speed).toBeGreaterThan(200);
      expect(defaultAdversary(id)).not.toBe(id);
      expect(carriersOf(defaultThreatMissile(id), id).length).toBeGreaterThan(0);
    }
    expect(carriersOf('aim54c')[0]).toBe('f14b');
    expect(carriersOf('r27er', 'f16c')[0]).toBe('su27');
  });

  it('defenseDrill places the shooter at the requested aspect and picks the launch method', () => {
    const w = new World(5);
    const d = defenseDrill(w, 'f16c', 'r27er', { range: 30_000, aspectDeg: 90, side: 'left' });
    const me = w.get(d.playerId);
    const sh = w.get(d.shooterId);
    expect(sh?.type).toBe('su27');
    expect(d.method).toBe('stt');
    expect(me && sh ? aspectAngle(me.pos, me.vel, sh.pos) * R2D : 0).toBeCloseTo(90, 0);
    expect(me && sh ? relBearing(me.pos, me.heading, sh.pos) : 0).toBeLessThan(0); // on the left
    expect(sh?.stores.r27er).toBe(1);
    const d2 = defenseDrill(new World(5), 'su27', 'aim120c', { range: 40_000 });
    expect(d2.method).toBe('tws');
    const d3 = defenseDrill(new World(5), 'su27', 'aim120c', { range: 40_000, mode: 'stt' });
    expect(d3.method).toBe('stt');
  });

  it('radarLab puts targets at range, bearing, altitude and aspect', () => {
    const w = new World(2);
    const lab = radarLab(w, 'f15c', [
      { range: 60_000, alt: 1000, bearingDeg: 0, aspectDeg: 0 },
      { range: 40_000, alt: 9000, bearingDeg: 30, aspectDeg: 90 },
    ]);
    const me = w.get(lab.playerId);
    const [t1, t2] = lab.targetIds.map(id => w.get(id));
    if (!me || !t1 || !t2) throw new Error('missing');
    // range is ground range; aspect is horizontal (heading vs the bearing to the player)
    expect(Math.hypot(t1.pos.x - me.pos.x, t1.pos.z - me.pos.z)).toBeCloseTo(60_000, 3);
    expect(t1.pos.y).toBe(1000);
    expect(relBearing(me.pos, me.heading, t2.pos) * R2D).toBeCloseTo(30, 1);
    expect(Math.abs(wrapPi(t1.heading - bearingTo(t1.pos, me.pos)))).toBeLessThan(1e-6);
    expect(Math.abs(wrapPi(t2.heading - bearingTo(t2.pos, me.pos))) * R2D).toBeCloseTo(90, 3);
    expect(t1.radar.mode).toBe('rws'); // radar switches off on its first think
    w.step(0.5);
    expect(t1.radar.mode).toBe('off');
  });
});

// ───────────────────────────────────────────────────────────── scripted flight

describe('scripted manoeuvres', () => {
  it('beam puts the reference at 3 or 9 o\'clock and announces it; hot points at it', () => {
    const w = new World(9);
    const d = twsDrill(w, 'f15c');
    w.step(0.5);
    const id = d.banditIds[1];
    const b = w.get(id);
    const me = w.get(d.playerId);
    if (!b || !me) throw new Error('missing');
    d.setManeuver(id, 'beam');
    const ev = aiEvents(w, id).at(-1);
    expect(ev?.text).toMatch(/beam/);
    think(w, b, 0.5);
    const rel = wrapPi(bearingTo(b.pos, me.pos) - b.cmd.heading);
    expect(Math.abs(Math.abs(rel) - Math.PI / 2)).toBeLessThan(1 * D2R);
    d.setManeuver(id, 'hot');
    think(w, b, 0.5);
    expect(Math.abs(wrapPi(bearingTo(b.pos, me.pos) - b.cmd.heading))).toBeLessThan(1 * D2R);
    setManeuver(w, id, 'cold');
    think(w, b, 0.5);
    expect(Math.abs(Math.abs(wrapPi(bearingTo(b.pos, me.pos) - b.cmd.heading)) - Math.PI)).toBeLessThan(1 * D2R);
  });
});

// ───────────────────────────────────────────────────────────── defence (unit, AI alone)

describe('AI defence decisions', () => {
  function setup(skill: 'rookie' | 'regular' | 'veteran' | 'ace' = 'ace') {
    const w = new World(11);
    const red = w.spawnAircraft({ id: 'red', side: 'red', type: 'su27', controller: 'ai', skill, pos: { x: 0, y: 8000, z: 0 }, heading: 0, speed: 250 });
    const blue = w.spawnAircraft({ id: 'blue', side: 'blue', type: 'f15c', controller: 'player', pos: { x: 0, y: 9000, z: -40_000 }, heading: Math.PI, speed: 250 });
    configureAi(w, 'red', { holdFire: true });
    return { w, red, blue };
  }

  it('notches an active ARH: missile on the beam, descends, drops chaff in bursts', () => {
    const { w, red, blue } = setup('ace');
    const m = fakeMissile(w, blue, red, 'aim120c', new Vector3(8000, 9000, -9000), 'active');
    const rwr = () => { red.rwr = [contact(red, m.id, m.pos, 'missile', 'aim120c')]; };
    think(w, red, 1.5, rwr);
    expect(aiOf(red).state).toBe('defend');
    expect(aiStatus(red)?.defendMode).toBe('notch');
    const rel = wrapPi(bearingTo(red.pos, m.pos) - red.cmd.heading);
    expect(Math.abs(Math.abs(rel) - Math.PI / 2)).toBeLessThan(AI_SKILLS.ace.notchErrDeg * D2R + 1e-6);
    expect(red.cmd.altitude).toBeLessThan(8000 - 1000);
    expect(red.cmd.afterburner).toBe(false);
    const ev = aiEvents(w, 'red').find(e => e.state === 'defend');
    expect(ev?.text).toMatch(/notches .* against your AIM-120C, dropping chaff/);
    // Once it is actually in the notch, chaff comes out in bursts.
    red.heading = red.cmd.heading;
    const before = red.chaff;
    think(w, red, 4, rwr);
    const used = before - red.chaff;
    expect(used).toBeGreaterThanOrEqual(AI_SKILLS.ace.chaffBurst);
    expect(used).toBeLessThan(20);
  });

  it('notches the shooter, not the missile, against a SARH shot', () => {
    const { w, red, blue } = setup('veteran');
    const m = fakeMissile(w, blue, red, 'aim7m', new Vector3(9000, 9000, -15_000), 'sarh');
    const rwr = () => { red.rwr = [contact(red, blue.id, blue.pos, 'launch', 'aim7m')]; };
    think(w, red, 3, rwr);
    expect(aiOf(red).state).toBe('defend');
    const relShooter = wrapPi(bearingTo(red.pos, blue.pos) - red.cmd.heading);
    expect(Math.abs(Math.abs(relShooter) - Math.PI / 2)).toBeLessThan(AI_SKILLS.veteran.notchErrDeg * D2R + 1e-6);
    expect(aiEvents(w, 'red').find(e => e.state === 'defend')?.text).toMatch(/against your radar/);
    expect(aiStatus(red)?.threatMissileId).toBe(m.id);
  });

  it('drags cold against a distant ARH still on datalink', () => {
    const { w, red, blue } = setup('veteran');
    const m = fakeMissile(w, blue, red, 'aim120c', new Vector3(0, 9000, -40_000), 'datalink');
    const rwr = () => { red.rwr = [contact(red, blue.id, blue.pos, 'launch', 'aim120c')]; };
    think(w, red, 3, rwr);
    expect(aiOf(red).state).toBe('defend');
    expect(aiStatus(red)?.defendMode).toBe('drag');
    expect(Math.abs(wrapPi(bearingTo(red.pos, m.pos) - red.cmd.heading))).toBeGreaterThan(170 * D2R);
    expect(red.cmd.afterburner).toBe(true);
  });

  it('reaction time scales with skill', () => {
    const delay = (skill: 'rookie' | 'ace') => {
      const { w, red, blue } = setup(skill);
      const m = fakeMissile(w, blue, red, 'aim120c', new Vector3(8000, 9000, -9000), 'active');
      const t0 = w.t;
      for (let i = 0; i < 200 && aiOf(red).state !== 'defend'; i++) {
        think(w, red, 0.05, () => { red.rwr = [contact(red, m.id, m.pos, 'missile', 'aim120c')]; });
      }
      return w.t - t0;
    };
    const ace = delay('ace');
    const rookie = delay('rookie');
    expect(ace).toBeLessThan(1.2);
    expect(rookie).toBeGreaterThan(2.3);
  });

  it('does not react to a TWS Fox 3 it cannot hear or see (no RWR, far away)', () => {
    const { w, red, blue } = setup('ace');
    fakeMissile(w, blue, red, 'aim120c', new Vector3(0, 9000, -30_000), 'datalink');
    think(w, red, 3, () => { red.rwr = []; });
    expect(aiOf(red).state).not.toBe('defend');
  });

  it('holds its script when evade is off; defends when evade is on', () => {
    const w = new World(4);
    const d = twsDrill(w, 'f15c');
    const me = w.get(d.playerId);
    const b = w.get(d.banditIds[0]);
    if (!me || !b) throw new Error('missing');
    const m = fakeMissile(w, me, b, 'aim120c', b.pos.clone().add(new Vector3(6000, 500, 8000)), 'active');
    const rwr = () => { b.rwr = [contact(b, m.id, m.pos, 'missile', 'aim120c')]; };
    think(w, b, 3, rwr);
    expect(aiOf(b).state).toBe('patrol');
    configureAi(w, b.id, { evade: true });
    think(w, b, 3, rwr);
    expect(aiOf(b).state).toBe('defend');
    // Threat gone: back to the script.
    m.alive = false;
    m.result = { kind: 'miss', reason: 'notched', t: w.t };
    think(w, b, 1, () => { b.rwr = []; });
    expect(aiOf(b).state).toBe('patrol');
    expect(aiEvents(w, b.id).at(-1)?.text).toMatch(/defeated the AIM-120C/);
  });
});

// ───────────────────────────────────────────────────────────── full engagement (integration)

describe('AI engagement (integration with radar, launch, missiles)', () => {
  it('a bandit commits, locks and fires an R-27ER at a player who flies straight', () => {
    const w = new World(21);
    const e = duel(w, 'f15c', 'su27', 'regular', { range: 90_000 });
    const id = e.enemyIds[0];
    runUntil(w, 150, () => launches(w, id).length > 0);
    const states = aiEvents(w, id).map(ev => ev.state);
    expect(states).toContain('commit');
    expect(states).toContain('attack');
    const shot = launches(w, id)[0];
    expect(shot, `no launch; last block: ${aiStatus(w.get(id) as Aircraft)?.lastLaunchBlock}`).toBeDefined();
    expect(shot.targetId).toBe(e.playerId);
    expect(shot.missile).toBe('r27er');
    expect(shot.radarMode).toBe('stt');
    const bandit = w.get(id);
    expect(bandit?.radar.stt.targetId).toBe(e.playerId);
    const sup = aiEvents(w, id).find(ev => ev.state === 'support');
    expect(sup?.text).toMatch(/^Bandit-1 locks you and fires an R-27ER from \d+ nm$/);
    // Supports it: keeps the lock and cranks while the missile flies.
    runUntil(w, 6);
    if (bandit && bandit.alive && w.missiles.get(shot.missileId)?.alive) {
      expect(aiOf(bandit).state).toBe('support');
      expect(bandit.radar.stt.targetId).toBe(e.playerId);
      const me = w.get(e.playerId);
      const off = me ? Math.abs(relBearing(bandit.pos, bandit.heading, me.pos)) * R2D : 0;
      expect(off).toBeGreaterThan(20);
      expect(off).toBeLessThan(60);
    }
  });

  it('an F-15C AI shoots from TWS (no lock) and a Flanker AI defends at pitbull with a notch and chaff', () => {
    const w = new World(31);
    const shooter = w.spawnAircraft({ id: 'eagle', side: 'blue', type: 'f15c', controller: 'ai', skill: 'veteran', pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 260, stores: { aim120c: 2 } });
    const red = w.spawnAircraft({ id: 'flanker', side: 'red', type: 'su27', controller: 'ai', skill: 'veteran', pos: { x: 3000, y: 8000, z: -70_000 }, heading: Math.PI, speed: 250 });
    configureAi(w, 'eagle', { targetId: 'flanker', fireAtRange: 38_000, shots: 1, gci: true, evade: false, recommit: false });
    configureAi(w, 'flanker', { holdFire: true, gci: false });
    runUntil(w, 90, () => launches(w, 'eagle').length > 0);
    const shot = launches(w, 'eagle')[0];
    expect(shot, `no launch; last block: ${aiStatus(shooter)?.lastLaunchBlock}`).toBeDefined();
    expect(shot.radarMode).toBe('tws');
    expect(aiEvents(w, 'eagle').find(ev => ev.state === 'support')?.text).toMatch(/in TWS/);
    // Before pitbull the Flanker should not be defending (no warning from a TWS shot).
    const m = w.missiles.get(shot.missileId);
    runUntil(w, 60, () => !m || !m.alive || m.guidance === 'active');
    const beforeActive = aiEvents(w, 'flanker').filter(ev => ev.state === 'defend');
    expect(beforeActive.length).toBe(0);
    // After pitbull: defend, chaff.
    let sawNotch = false;
    runUntil(w, 40, () => {
      if (aiOf(red).state === 'defend' && aiStatus(red)?.defendMode === 'notch' && m && m.alive) {
        const rel = Math.abs(relBearing(red.pos, red.heading, m.pos));
        if (Math.abs(rel - Math.PI / 2) < 15 * D2R) sawNotch = true;
      }
      return !m || !m.alive;
    });
    expect(aiEvents(w, 'flanker').some(ev => ev.state === 'defend')).toBe(true);
    expect(sawNotch).toBe(true);
    const chaff = w.events.filter(e => e.type === 'cm' && e.ownerId === 'flanker' && e.what === 'chaff').length;
    expect(chaff).toBeGreaterThan(0);
  });

  it('pumps about 1 km lower, not all the way down, and presses closer after a failed shot', () => {
    const w = new World(31);
    const shooter = w.spawnAircraft({ id: 'eagle', side: 'blue', type: 'f15c', controller: 'ai', skill: 'regular', pos: { x: 0, y: 10000, z: 0 }, heading: 0, speed: 260, stores: { aim120c: 4 } });
    const red = w.spawnAircraft({ id: 'flanker', side: 'red', type: 'su27', controller: 'ai', skill: 'ace', pos: { x: 3000, y: 9000, z: -90_000 }, heading: Math.PI, speed: 250 });
    configureAi(w, 'eagle', { targetId: 'flanker', gci: true, evade: false });
    configureAi(w, 'flanker', { holdFire: true, gci: true });
    let pumpMin = Infinity, pumpStart = NaN;
    runUntil(w, 400, () => {
      if (aiOf(shooter).state === 'pump') {
        if (Number.isNaN(pumpStart)) pumpStart = shooter.pos.y;
        pumpMin = Math.min(pumpMin, shooter.cmd.altitude);
      }
      return launches(w, 'eagle').length >= 2 || !red.alive;
    });
    expect(Number.isNaN(pumpStart)).toBe(false);
    expect(pumpStart).toBeGreaterThan(7000);
    expect(pumpMin).toBeGreaterThan(pumpStart - 1300);
    const shots = launches(w, 'eagle');
    expect(red.alive && shots.length >= 2).toBe(true); // the ace target notched / dragged the first one
    {
      // the second shot came with the first one defeated: it is closer, as a fraction of the zone
      const [a, b] = shots.map(e => e.range ?? 0);
      const first = w.missiles.get(shots[0].missileId);
      expect(first?.result?.kind).toBe('miss');
      expect(b).toBeLessThan(a);
    }
    // the calls carry the structured fields
    const fire = aiEvents(w, 'eagle').find(e => / fires /.test(e.text));
    expect(fire?.missileId).toBe(shots[0].missileId);
    expect(fire?.missile).toBe('aim120c');
    expect(fire?.targetId).toBe('flanker');
    expect(fire?.range).toBeCloseTo(shots[0].range ?? 0, -3);
  });

  it('every AI state change is announced with a sentence', () => {
    const w = new World(41);
    const e = twoVTwo(w, 'f16c', 'j11a', 'veteran');
    const ids = [...e.enemyIds, ...e.friendIds];
    const last = new Map(ids.map(id => [id, aiOf(w.get(id) as Aircraft).state]));
    let missing = 0;
    runUntil(w, 150, () => {
      for (const id of ids) {
        const ac = w.get(id);
        if (!ac || !ac.alive || !ac.ai) continue;
        if (ac.ai.state !== last.get(id)) {
          const ev = aiEvents(w, id).at(-1);
          if (!ev || ev.state !== ac.ai.state || ev.t < ac.ai.stateSince - 1e-9) missing++;
          last.set(id, ac.ai.state);
        }
      }
      return false;
    });
    const evs = aiEvents(w);
    expect(evs.length).toBeGreaterThan(3);
    expect(missing).toBe(0);
    for (const ev of evs) {
      expect(ev.text.length).toBeGreaterThan(8);
      expect(ev.text).not.toMatch(/undefined|NaN|null/);
    }
  });

  it('is deterministic for a given seed', () => {
    const once = () => {
      const w = new World(77);
      pair(w, 'f15c', 'mig29s', 'ace');
      runUntil(w, 120);
      return JSON.stringify({
        ev: w.events.filter(e => e.type === 'ai' || e.type === 'launch' || e.type === 'cm'),
        pos: [...w.aircraft.values()].map(a => [a.id, a.pos.x.toFixed(3), a.pos.z.toFixed(3), a.alive]),
      });
    };
    expect(once()).toBe(once());
  });
});

// Shared СНП2 integration: an AI trigger releases a pair, not a page-owned exception.
describe('MiG-29S two-target AI', () => {
  function scenario(jamming = false, shots = 2) {
    const w = new World(15);
    w.record = false;
    const me = w.spawnAircraft({ side: 'blue', type: 'mig29s', controller: 'ai', skill: 'regular',
      pos: { x: 0, y: 9000, z: 0 }, heading: 0, speed: 280, stores: { r77: 4 }, radarMode: 'tws' });
    const targets = [-800, 800].map(x => w.spawnAircraft({ side: 'red', type: 'f15c', controller: 'script',
      pos: { x, y: 9000, z: -40000 }, heading: Math.PI, speed: 280, stores: {}, jamming }));
    configureAi(w, me.id, { gci: true, evade: false, shots });
    // Fresh sensor observations isolate the AI decision from scan timing.
    me.radar.tracks = targets.map((t, i) => ({ targetId: t.id, label: `T${i + 1}`, pos: t.pos.clone(),
      vel: t.vel.clone(), firstHit: 0, lastHit: 0, hits: 2, firm: true, coasting: false }));
    return { w, me, targets };
  }
  it('uses the shared two-target launch and accounts for both missiles', () => {
    const { w, me } = scenario();
    runUntil(w, 65, () => launches(w, me.id).length >= 2);
    const shots = launches(w, me.id);
    expect(shots).toHaveLength(2);
    expect(shots[0].t).toBe(shots[1].t);
    expect(new Set(shots.map(s => s.targetId)).size).toBe(2);
    expect(shots.every(s => s.radarMode === 'tws')).toBe(true);
    expect(aiStatus(me)?.shotsFired).toBe(2);
    expect(me.stores.r77).toBe(2);
  });
  it('does not use a two-target salvo against jamming targets', () => {
    const { w, me } = scenario(true);
    runUntil(w, 65, () => launches(w, me.id).length >= 2);
    const shots = launches(w, me.id);
    expect(shots.some(s => s.radarMode === 'tws')).toBe(false);
  });
  it('does not exceed an odd total shot budget while supporting a pair', () => {
    const { w, me } = scenario(false, 3);
    configureAi(w, me.id, { maxInFlightPerTarget: 2 });
    runUntil(w, 150);
    expect(launches(w, me.id).length).toBeGreaterThanOrEqual(2);
    expect(launches(w, me.id).length).toBeLessThanOrEqual(3);
    expect(aiStatus(me)?.shotsFired).toBe(launches(w, me.id).length);
  });
});
