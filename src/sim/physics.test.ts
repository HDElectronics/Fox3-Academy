/**
 * sim-physics: fast sanity tests for the tactical flight model, the game missile model, countermeasures
 * and launch zones. Reference numbers come from data/missiles.ts at run time (never hard-coded here).
 */
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { World, type GuidanceSupport } from './world';
import type { Aircraft, Missile, SimEvent } from './types';
import type { AircraftId, MissileId } from '../data/types';
import { MISSILES } from '../data/missiles';
import { AIRCRAFT } from '../data/aircraft';
import { availableG, stepAircraft } from './flight';
import { createMissile, notchState, stepMissile } from './missile';
import { CHAFF_LIFE_S, DISPENSE_INTERVAL_S, dropChaff, dropFlare, stepCountermeasures } from './countermeasures';
import { dlzFor, dlzTargetType, findRange, platformsFor, simulateShot, type ShotSetup } from './dlz';
import { irAcquisitionRange } from './launch';
import { missileModel } from './missileModel';
import { mach, speedFromMach } from './atmosphere';
import { D2R, dirFrom, wrapPi } from './math';

// ---------------------------------------------------------------------------------------------------------
// helpers

const DT = 1 / 60;

function spawn(w: World, type: AircraftId, side: 'blue' | 'red', x: number, y: number, z: number, heading: number, speed: number): Aircraft {
  return w.spawnAircraft({ side, type, controller: 'script', pos: { x, y, z }, heading, speed });
}

/** Step only the sim-physics modules (independent of radar / AI / RWR work in progress). */
function stepPhysics(w: World, dt = DT): void {
  w.t += dt;
  for (const ac of w.aircraft.values()) if (ac.alive) stepAircraft(w, ac, dt);
  stepCountermeasures(w, dt);
  for (const m of w.missiles.values()) if (m.alive) stepMissile(w, m, dt);
}

function fly(w: World, ac: Aircraft, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += DT) { each?.(); w.t += DT; stepAircraft(w, ac, DT); }
}

function launch(w: World, shooter: Aircraft, type: MissileId, target: Aircraft | null): Missile {
  const m = createMissile(w, shooter, type, target ? target.id : null);
  w.missiles.set(m.id, m);
  return m;
}

function perfect(target: Aircraft): (m: Missile) => GuidanceSupport {
  return () => ({ datalink: true, illuminating: true, estimate: { pos: target.pos, vel: target.vel } });
}

const NONE: GuidanceSupport = { datalink: false, illuminating: false, estimate: null };

function runUntilDone(w: World, m: Missile, maxS = 250): void {
  for (let t = 0; t < maxS && m.alive; t += DT) stepPhysics(w);
}

/** Head-on shot at the reference geometry (both at 250 m/s TAS), range in km. */
function refShot(missile: MissileId, rangeKm: number, alt = 10000, aspectDeg = 0): ShotSetup {
  const mc = mach(250, alt);
  return { missile, shooterAlt: alt, shooterMach: mc, targetAlt: alt, targetMach: mc, range: rangeKm * 1000, aspectDeg, maneuver: 'none' };
}

// ---------------------------------------------------------------------------------------------------------

describe('flight: tactical autopilot', () => {
  it('turns the short way to the commanded heading', () => {
    const w = new World(1);
    const ac = spawn(w, 'f16c', 'blue', 0, 6000, 0, 350 * D2R, 250);
    ac.cmd.heading = 10 * D2R;
    let maxErr = 0;
    fly(w, ac, 15, () => { maxErr = Math.max(maxErr, Math.abs(wrapPi(ac.heading - 0))); });
    expect(Math.abs(wrapPi(ac.heading - 10 * D2R))).toBeLessThan(1 * D2R);
    expect(maxErr).toBeLessThan(25 * D2R); // never went the long way round
  });

  it('banks into the turn, pulls g within its limits and bleeds speed at military power', () => {
    const w = new World(1);
    const ac = spawn(w, 'su27', 'blue', 0, 5000, 0, 0, speedFromMach(0.8, 5000));
    ac.cmd.heading = Math.PI - 0.01; ac.cmd.maxG = 9;
    const v0 = ac.vel.length();
    let maxBank = 0, maxG = 0;
    fly(w, ac, 8, () => { maxBank = Math.max(maxBank, Math.abs(ac.roll)); maxG = Math.max(maxG, ac.g); });
    expect(maxBank).toBeGreaterThan(60 * D2R);
    expect(maxG).toBeGreaterThan(3);
    expect(maxG).toBeLessThanOrEqual(AIRCRAFT.su27.perf.maxG + 1e-6);
    expect(ac.vel.length()).toBeLessThan(v0 - 20);
  });

  it('respects cmd.maxG and has less g available when slow', () => {
    const w = new World(1);
    const fast = spawn(w, 'f15c', 'blue', 0, 3000, 0, 0, 240);
    const slow = spawn(w, 'f15c', 'blue', 5000, 3000, 0, 0, 110);
    expect(availableG(slow)).toBeLessThan(availableG(fast));
    fast.cmd.maxG = 4; fast.cmd.heading = Math.PI / 2;
    let maxG = 0;
    fly(w, fast, 6, () => { maxG = Math.max(maxG, fast.g); });
    expect(maxG).toBeLessThanOrEqual(4 + 1e-6);
  });

  it('afterburner accelerates; perf.maxMach is reachable high with afterburner', () => {
    const w = new World(1);
    const mil = spawn(w, 'f15c', 'blue', 0, 11000, 0, 0, speedFromMach(0.9, 11000));
    const ab = spawn(w, 'f15c', 'blue', 5000, 11000, 0, 0, speedFromMach(0.9, 11000));
    mil.cmd.speed = ab.cmd.speed = 2000;
    ab.cmd.afterburner = true;
    for (let t = 0; t < 300; t += 1 / 30) { w.t += 1 / 30; stepAircraft(w, mil, 1 / 30); stepAircraft(w, ab, 1 / 30); }
    expect(mach(mil.vel.length(), mil.pos.y)).toBeLessThan(1.15);
    expect(mach(ab.vel.length(), ab.pos.y)).toBeGreaterThan(0.95 * AIRCRAFT.f15c.perf.maxMach);
  });

  it('climbs at a limited rate and trades speed for height; dives are steeper', () => {
    const w = new World(1);
    const ac = spawn(w, 'fa18c', 'blue', 0, 3000, 0, 0, 230);
    ac.cmd.altitude = 9000;
    const v0 = ac.vel.length();
    let minV = v0, maxVs = 0;
    fly(w, ac, 20, () => { minV = Math.min(minV, ac.vel.length()); maxVs = Math.max(maxVs, ac.vel.y); });
    expect(ac.pos.y).toBeGreaterThan(3500);
    expect(minV).toBeLessThan(v0 - 10);
    expect(maxVs).toBeLessThan(v0 * Math.sin(26 * D2R));
    const d = spawn(w, 'fa18c', 'blue', 9000, 9000, 0, 0, 230);
    d.cmd.altitude = 1000;
    let minVs = 0;
    fly(w, d, 20, () => { minVs = Math.min(minVs, d.vel.y); });
    expect(-minVs).toBeGreaterThan(maxVs);
  });

  it('never flies below groundAlt + 150 m', () => {
    const w = new World(1);
    w.groundAlt = 400;
    const ac = spawn(w, 'mig29s', 'blue', 0, 3000, 0, 0, 280);
    ac.cmd.altitude = -2000;
    let minAlt = Infinity;
    fly(w, ac, 60, () => { minAlt = Math.min(minAlt, ac.pos.y); });
    expect(minAlt).toBeGreaterThanOrEqual(w.groundAlt + 150 - 1e-6);
    expect(ac.pos.y).toBeLessThan(w.groundAlt + 200);
  });

  it('keeps pos, vel, heading, pitch consistent', () => {
    const w = new World(1);
    const ac = spawn(w, 'jf17', 'blue', 0, 5000, 0, 1, 220);
    ac.cmd.heading = 2.5; ac.cmd.altitude = 7000;
    fly(w, ac, 10);
    const dir = dirFrom(ac.heading, ac.pitch);
    expect(ac.vel.clone().normalize().distanceTo(dir)).toBeLessThan(1e-6);
    expect(Number.isFinite(ac.pos.x + ac.pos.y + ac.pos.z)).toBe(true);
  });
});

describe('missiles: game model', () => {
  it('hits a non-manoeuvring target inside Rmax with perfect support (every missile)', () => {
    for (const id of Object.keys(MISSILES) as MissileId[]) {
      const rangeKm = Math.min(0.8 * MISSILES[id].ref.highHeadOnKm, MISSILES[id].seeker === 'ir' ? irAcquisitionRange(id, 0) / 1000 * 0.9 : Infinity);
      const r = simulateShot(refShot(id, rangeKm));
      expect(r.hit, `${id}: ${r.reason}`).toBe(true);
      expect(r.missDistance).toBeLessThanOrEqual(missileModel(id).hitRadiusM);
      expect(r.impactMach).toBeGreaterThan(0.5);
    }
  });

  it('matches the reference ranges within 15% (sample)', () => {
    for (const id of ['aim120c', 'r27er', 'r77', 'aim9m'] as MissileId[]) {
      const ref = MISSILES[id].ref;
      const { range: _r, maneuver: _m, ...base } = refShot(id, 0);
      const a = findRange(base, 'rmax', { dt: 1 / 30 }).range / 1000;
      expect(Math.abs(a / ref.highHeadOnKm - 1), `${id} head-on ${a.toFixed(1)} vs ${ref.highHeadOnKm}`).toBeLessThan(0.15);
    }
  });

  it('misses at 1.5× Rmax for lack of energy', () => {
    for (const id of ['aim120c', 'r27er'] as MissileId[]) {
      const r = simulateShot(refShot(id, 1.5 * MISSILES[id].ref.highHeadOnKm));
      expect(r.hit).toBe(false);
      expect(['kinematic', 'timeout']).toContain(r.reason);
    }
    const cold = simulateShot(refShot('aim120c', 1.5 * MISSILES.aim120c.ref.highColdKm, 10000, 180));
    expect(cold.hit).toBe(false);
    expect(['kinematic', 'timeout']).toContain(cold.reason);
  });

  it('SARH without the shooter lock goes ballistic and misses (lost-guidance)', () => {
    const w = new World(3);
    const shooter = spawn(w, 'su27', 'red', 0, 8000, 0, 0, 250);
    const target = spawn(w, 'f15c', 'blue', 0, 8000, -25000, Math.PI, 250);
    const events: SimEvent[] = [];
    w.on(e => events.push(e));
    w.supportOverride = () => NONE;
    const m = launch(w, shooter, 'r27er', target);
    expect(m.guidance).toBe('sarh');
    for (let t = 0; t < 1.4; t += DT) stepPhysics(w);
    expect(m.guidance).toBe('sarh'); // 1.5 s grace for a quick relock
    for (let t = 0; t < 0.3; t += DT) stepPhysics(w);
    expect(m.guidance).toBe('ballistic');
    expect(events.some(e => e.type === 'seeker-lost' && e.missileId === m.id && e.why === 'lost-guidance')).toBe(true);
    runUntilDone(w, m);
    expect(m.result?.kind).toBe('miss');
    expect(m.result?.reason).toBe('lost-guidance');
    expect(target.alive).toBe(true);
  });

  it('SARH keeps guiding through a short lock drop', () => {
    const w = new World(3);
    const shooter = spawn(w, 'su27', 'red', 0, 8000, 0, 0, 250);
    const target = spawn(w, 'f15c', 'blue', 0, 8000, -20000, Math.PI, 250);
    let t = 0;
    const good = perfect(target);
    w.supportOverride = mm => (t > 5 && t < 5.6 ? NONE : good(mm));
    const m = launch(w, shooter, 'r27er', target);
    for (; t < 120 && m.alive; t += DT) stepPhysics(w);
    expect(m.result?.kind).toBe('hit');
  });

  it('SARH flies on memory while the shooter STT is in memory, and goes dumb only when the lock is gone', () => {
    const w = new World(3);
    const shooter = spawn(w, 'su27', 'red', 0, 8000, 0, 0, 250);
    const target = spawn(w, 'f15c', 'blue', 0, 8000, -25000, Math.PI, 250);
    const m = launch(w, shooter, 'r27er', target);
    // radar STT on the target, degraded (memory) for 2.5 s: no illumination, but the lock still exists
    shooter.radar.mode = 'stt';
    shooter.radar.stt = { targetId: target.id, lostFor: 0.5 };
    for (let t = 0; t < 2.5; t += DT) stepPhysics(w);
    expect(m.guidance).toBe('sarh');
    // the lock breaks: after the relock grace the missile is unguided
    shooter.radar.mode = 'rws';
    shooter.radar.stt = { targetId: null, lostFor: 0 };
    for (let t = 0; t < 1.7; t += DT) stepPhysics(w);
    expect(m.guidance).toBe('ballistic');
  });

  it('ARH flying inertial (no datalink) still hits a non-manoeuvring target', () => {
    const w = new World(4);
    const shooter = spawn(w, 'f15c', 'blue', 0, 9000, 0, 0, 260);
    const target = spawn(w, 'su27', 'red', 3000, 9000, -40000, Math.PI, 260);
    const events: SimEvent[] = [];
    w.on(e => events.push(e));
    w.supportOverride = () => NONE;
    const m = launch(w, shooter, 'aim120c', target);
    expect(m.guidance).toBe('datalink');
    expect(m.timeToActive).toBeGreaterThan(0);
    stepPhysics(w);
    expect(m.guidance).toBe('inertial');
    let sawTta = false;
    for (let t = 0; t < 200 && m.alive; t += DT) {
      stepPhysics(w);
      if (m.guidance === 'inertial' && (m.timeToActive ?? 0) > 0 && (m.timeToImpact ?? 0) > 0) sawTta = true;
    }
    expect(sawTta).toBe(true);
    expect(events.filter(e => e.type === 'datalink-lost' && e.missileId === m.id)).toHaveLength(1);
    expect(events.some(e => e.type === 'pitbull' && e.missileId === m.id)).toBe(true);
    expect(m.result?.kind).toBe('hit');
    expect(target.alive).toBe(false);
    expect(target.killedBy).toBe(shooter.id);
    expect(events.some(e => e.type === 'hit' && e.targetId === target.id)).toBe(true);
  });

  it('ARH on datalink goes pitbull near its pitbull distance and reports time to active', () => {
    const w = new World(5);
    const shooter = spawn(w, 'f15c', 'blue', 0, 9000, 0, 0, 260);
    const target = spawn(w, 'su27', 'red', 0, 9000, -45000, Math.PI, 260);
    w.supportOverride = perfect(target);
    let pitbullRange = -1;
    w.on(e => { if (e.type === 'pitbull') pitbullRange = m.pos.distanceTo(target.pos); });
    const m = launch(w, shooter, 'aim120c', target);
    let lastTta = Infinity, monotone = true;
    for (let t = 0; t < 200 && m.alive; t += DT) {
      stepPhysics(w);
      if (m.guidance === 'datalink' && m.timeToActive !== null) { if (m.timeToActive > lastTta + 0.5) monotone = false; lastTta = m.timeToActive; }
      if (m.guidance === 'active') expect(m.timeToActive).toBeNull();
    }
    expect(monotone).toBe(true);
    const pit = missileModel('aim120c').pitbullM;
    expect(pitbullRange).toBeGreaterThan(pit * 0.9);
    expect(pitbullRange).toBeLessThan(pit * 1.1);
    expect(m.result?.kind).toBe('hit');
    expect(Number.isFinite(m.closestApproach)).toBe(true);
  });

  it('ARH launched inside pitbull distance comes off the rail active', () => {
    const w = new World(6);
    const shooter = spawn(w, 'f16c', 'blue', 0, 6000, 0, 0, 250);
    const target = spawn(w, 'su27', 'red', 0, 6000, -8000, Math.PI, 250);
    const events: SimEvent[] = [];
    w.on(e => events.push(e));
    w.supportOverride = () => NONE;
    const m = launch(w, shooter, 'aim120c', target);
    expect(m.guidance).toBe('active');
    expect(m.seekerOn).toBe(target.id);
    stepPhysics(w);
    expect(events.some(e => e.type === 'pitbull')).toBe(true);
    runUntilDone(w, m);
    expect(m.result?.kind).toBe('hit');
  });

  it('ARH that finds nothing at pitbull misses with no-acquisition', () => {
    const w = new World(7);
    const shooter = spawn(w, 'f15c', 'blue', 0, 9000, 0, 0, 260);
    const target = spawn(w, 'su27', 'red', 0, 9000, -35000, Math.PI, 260);
    // a bad track: the shooter's estimate sits 8 km to the side of the real jet
    w.supportOverride = () => ({ datalink: true, illuminating: false, estimate: { pos: target.pos.clone().setX(target.pos.x + 8000), vel: target.vel } });
    const m = launch(w, shooter, 'aim120c', target);
    runUntilDone(w, m);
    expect(m.result?.kind).toBe('miss');
    expect(m.result?.reason).toBe('no-acquisition');
    expect(target.alive).toBe(true);
  });

  it('a notching target dropping chaff beats an active missile a fair share of the time', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const reasons: string[] = [];
    for (const seed of seeds) {
      const r = simulateShot({ ...refShot('aim120c', 30), maneuver: 'notch-chaff', reactAfter: 3, seed });
      reasons.push(r.reason);
    }
    const defeated = reasons.filter(r => r !== 'hit').length;
    expect(defeated, reasons.join(',')).toBeGreaterThanOrEqual(3);
    expect(reasons.some(r => r === 'chaff' || r === 'notched')).toBe(true);
  });

  it('chaff steals a Doppler seeker only near the notch', () => {
    // same notch + chaff, but a chaff-proof variant of the geometry: head-on chaff is ignored
    let chaffMisses = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const w = new World(seed);
      const shooter = spawn(w, 'f15c', 'blue', 0, 9000, 0, 0, 260);
      const target = spawn(w, 'su27', 'red', 0, 9000, -12000, Math.PI, 260);
      w.supportOverride = perfect(target);
      const m = launch(w, shooter, 'aim120c', target);
      for (let t = 0; t < 60 && m.alive; t += DT) {
        if (Math.round(t / DT) % 12 === 0) dropChaff(w, target); // chaff while flying straight at the missile
        stepPhysics(w);
      }
      if (m.result?.reason === 'chaff') chaffMisses++;
    }
    expect(chaffMisses).toBe(0);
  });

  it('flares can decoy an IR missile', () => {
    let flareMisses = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = simulateShot({ ...refShot('r73', 8, 6000, 180), maneuver: 'notch-chaff', seed, targetMach: 0.8 });
      if (r.reason === 'flare') flareMisses++;
    }
    expect(flareMisses).toBeGreaterThan(0);
  });

  it('lofting missiles climb on long shots, non-lofting ones do not', () => {
    const loft = simulateShot(refShot('aim120c', 60));
    const flat = simulateShot(refShot('r77', 40));
    const top = (r: ReturnType<typeof simulateShot>) => Math.max(...r.trace.map(s => s.missileAlt));
    expect(top(loft)).toBeGreaterThan(10000 + 2000);
    expect(top(flat)).toBeLessThan(10000 + 500);
    expect(loft.hit).toBe(true);
    const short = simulateShot(refShot('aim120c', 12));
    expect(top(short)).toBeLessThan(10000 + 500);
    // ShotSetup.loft = false: the same long shot without the loft (Missile Lab what-if), the model untouched
    const noLoft = simulateShot({ ...refShot('aim120c', 60), loft: false });
    expect(top(noLoft)).toBeLessThan(10000 + 500);
    expect(top(simulateShot(refShot('aim120c', 60)))).toBeCloseTo(top(loft), 3);
  });

  it('notchState reports the seeker notch for displays without changing the missile', () => {
    const w = new World(9);
    const shooter = spawn(w, 'f15c', 'blue', 0, 9000, 0, 0, 260);
    const target = spawn(w, 'su27', 'red', 0, 3000, -12000, Math.PI / 2, 250); // beaming, below: look-down
    w.supportOverride = perfect(target);
    const m = launch(w, shooter, 'aim120c', target);
    const n = notchState(w, m);
    expect(n).not.toBeNull();
    expect(n?.targetId).toBe(target.id);
    expect(n?.lookDown).toBe(true);
    expect(n?.inNotch).toBe(true);
    expect(n?.radialMps).toBeLessThan(n?.gateMps ?? 0);
    expect(n?.holdS).toBe(missileModel('aim120c').notchHoldS);
    target.vel.copy(dirFrom(Math.PI)).multiplyScalar(250); // hot
    expect(notchState(w, m)?.inNotch).toBe(false);
    expect(notchState(w, launch(w, shooter, 'aim9m', target))).toBeNull(); // IR: no Doppler notch
  });

  it('a second missile at a dead target misses with target-dead', () => {
    const w = new World(8);
    const shooter = spawn(w, 'f15c', 'blue', 0, 9000, 0, 0, 260);
    const target = spawn(w, 'su27', 'red', 0, 9000, -20000, Math.PI, 260);
    w.supportOverride = perfect(target);
    const m1 = launch(w, shooter, 'aim120c', target);
    for (let t = 0; t < 3; t += DT) stepPhysics(w);
    const m2 = launch(w, shooter, 'aim120c', target);
    for (let t = 0; t < 120 && (m1.alive || m2.alive); t += DT) stepPhysics(w);
    expect(m1.result?.kind).toBe('hit');
    expect(m2.result?.reason).toBe('target-dead');
  });

  it('same seed gives the same result; runs through World.step with the real loop', () => {
    const a = simulateShot({ ...refShot('aim120c', 30), maneuver: 'notch-chaff', reactAfter: 2, seed: 11 });
    const b = simulateShot({ ...refShot('aim120c', 30), maneuver: 'notch-chaff', reactAfter: 2, seed: 11 });
    expect(JSON.stringify(a.trace)).toBe(JSON.stringify(b.trace));
    expect(a.reason).toBe(b.reason);
    const run = () => {
      const w = new World(21);
      w.record = false;
      const shooter = spawn(w, 'f15c', 'blue', 0, 9000, 0, 0, 260);
      const target = spawn(w, 'su27', 'red', 0, 9000, -30000, Math.PI, 260);
      w.supportOverride = perfect(target);
      const m = launch(w, shooter, 'aim120c', target);
      for (let i = 0; i < 90 * 4 && m.alive; i++) w.step(0.25);
      return `${m.result?.kind}:${m.result?.reason}:${m.pos.x.toFixed(3)}:${m.pos.y.toFixed(3)}`;
    };
    expect(run()).toBe(run());
  });

  it('keeps display estimates updated', () => {
    const w = new World(9);
    const shooter = spawn(w, 'su27', 'red', 0, 8000, 0, 0, 250);
    const target = spawn(w, 'f15c', 'blue', 0, 8000, -20000, Math.PI, 250);
    w.supportOverride = perfect(target);
    const m = launch(w, shooter, 'r27er', target);
    for (let t = 0; t < 2; t += DT) stepPhysics(w);
    expect(m.timeToActive).toBeNull();
    expect(m.timeToImpact).toBeGreaterThan(5);
    expect(m.timeToImpact).toBeLessThan(40);
    expect(m.closestApproach).toBeLessThan(20000);
  });
});

describe('countermeasures', () => {
  it('respects counts and the dispense interval', () => {
    const w = new World(1);
    const ac = spawn(w, 'f16c', 'blue', 0, 5000, 0, 0, 250);
    ac.chaff = 2; ac.flares = 1;
    expect(dropChaff(w, ac)).toBe(true);
    expect(dropChaff(w, ac)).toBe(false); // too soon
    w.t += DISPENSE_INTERVAL_S;
    expect(dropChaff(w, ac)).toBe(true);
    w.t += DISPENSE_INTERVAL_S;
    expect(dropChaff(w, ac)).toBe(false); // empty
    expect(dropFlare(w, ac)).toBe(true);
    expect(ac.chaff).toBe(0);
    expect(ac.flares).toBe(0);
  });

  it('chaff stops almost dead, flares fall and burn out', () => {
    const w = new World(1);
    const ac = spawn(w, 'f16c', 'blue', 0, 5000, 0, 0, 250);
    dropChaff(w, ac); dropFlare(w, ac);
    const chaff = w.countermeasures.find(c => c.kind === 'chaff');
    const flare = w.countermeasures.find(c => c.kind === 'flare');
    for (let t = 0; t < 1.5; t += DT) { w.t += DT; stepCountermeasures(w, DT); }
    expect(chaff?.vel.length()).toBeLessThan(20);
    expect(flare?.vel.y).toBeLessThan(-10);
    for (let t = 0; t < CHAFF_LIFE_S; t += DT) { w.t += DT; stepCountermeasures(w, DT); }
    expect(w.countermeasures).toHaveLength(0);
  });
});

describe('launch zones', () => {
  it('exports the platforms the tables were flown with (target: F-15C for Russian / Chinese carriers, Su-27 otherwise)', () => {
    expect(dlzTargetType('r77')).toBe('f15c');
    expect(dlzTargetType('aim120c')).toBe('su27');
    expect(AIRCRAFT[platformsFor('aim54c').shooter].missiles).toContain('aim54c');
  });

  it('dlzFor is ordered, grows with altitude and shrinks against a cold target', () => {
    const mk = (alt: number, aspectDeg: number, id: MissileId = 'aim120c') => {
      const shooterPos = new Vector3(0, alt, 0);
      const targetPos = new Vector3(0, alt, -40000);
      const sv = dirFrom(0).multiplyScalar(250);
      const tv = dirFrom(Math.PI + aspectDeg * D2R).multiplyScalar(250);
      return dlzFor(shooterPos, sv, targetPos, tv, id);
    };
    for (const id of ['aim120c', 'r27er', 'aim9m'] as MissileId[]) {
      const hot = mk(10000, 0, id), cold = mk(10000, 180, id), low = mk(1000, 0, id);
      expect(hot.rmin).toBeLessThan(hot.rne);
      expect(hot.rne).toBeLessThanOrEqual(hot.rmax);
      expect(cold.rmax).toBeLessThan(hot.rmax);
      expect(low.rmax).toBeLessThan(hot.rmax);
      // within 15 % of the reference numbers at the reference geometry
      const ref = MISSILES[id].ref;
      expect(Math.abs(hot.rmax / 1000 / ref.highHeadOnKm - 1)).toBeLessThan(0.15);
      expect(Math.abs(cold.rmax / 1000 / ref.highColdKm - 1)).toBeLessThan(0.15);
      expect(Math.abs(low.rmax / 1000 / ref.lowHeadOnKm - 1)).toBeLessThan(0.15);
    }
  });

  it('simulateShot returns a sampled trace, paths and events', () => {
    const r = simulateShot({ ...refShot('aim120c', 40), maneuver: 'turn-cold', reactAfter: 5 });
    expect(r.trace.length).toBeGreaterThan(20);
    expect(r.trace[1].t - r.trace[0].t).toBeCloseTo(0.25, 5);
    expect(r.missilePath).toHaveLength(r.trace.length);
    expect(r.targetPath).toHaveLength(r.trace.length);
    expect(r.shooterPath).toHaveLength(r.trace.length);
    expect(r.events.some(e => e.type === 'launch')).toBe(true);
    expect(r.events.some(e => e.type === 'hit' || e.type === 'miss')).toBe(true);
    expect(r.timeOfFlight).toBeGreaterThan(10);
  });
});
