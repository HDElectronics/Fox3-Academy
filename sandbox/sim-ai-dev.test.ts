/**
 * Dev harness for the AI state machine while flight.ts / missile.ts are being written by sim-physics.
 * Replaces them with minimal stand-ins (kinematic turns, constant-speed pursuit missile with SARH/ARH
 * support rules and a crude notch/chaff model) so whole engagements can be watched end to end.
 * Not part of `npm test`. Run: npx vitest run --config sandbox/sim-ai.vitest.config.ts
 */
import { describe, expect, it, vi } from 'vitest';
import { Vector3 } from 'three';

vi.mock('../src/sim/flight', async (importOriginal) => {
  if (process.env.REAL) return importOriginal();
  const { dirFrom, wrapPi, G0 } = await import('../src/sim/math');
  return {
    stepAircraft(world: { t: number; groundAlt: number }, ac: import('../src/sim/types').Aircraft, dt: number) {
      const v = Math.max(ac.vel.length(), 120);
      const n = Math.min(ac.cmd.maxG, 7);
      const wmax = (G0 * Math.sqrt(n * n - 1)) / v;
      const err = wrapPi(ac.cmd.heading - ac.heading);
      const turn = Math.max(-wmax * dt, Math.min(wmax * dt, err));
      ac.heading = (ac.heading + turn + Math.PI * 2) % (Math.PI * 2);
      ac.roll = Math.sign(turn) * Math.min(1.3, Math.abs(err));
      const dv = Math.max(-15 * dt, Math.min((ac.cmd.afterburner ? 20 : 10) * dt, ac.cmd.speed - v));
      const nv = v + dv;
      const dAlt = Math.max(-80, Math.min(60, (ac.cmd.altitude - ac.pos.y) * 0.2));
      ac.pitch = Math.asin(Math.max(-0.9, Math.min(0.9, dAlt / nv)));
      ac.vel.copy(dirFrom(ac.heading, ac.pitch)).multiplyScalar(nv);
      ac.pos.addScaledVector(ac.vel, dt);
      if (ac.pos.y < world.groundAlt + 150) ac.pos.y = world.groundAlt + 150;
      ac.g = 1 + Math.abs(turn / dt) * v / G0;
    },
  };
});

vi.mock('../src/sim/missile', async (importOriginal) => {
  if (process.env.REAL || process.env.REAL_MISSILE) return importOriginal();
  const { MISSILES } = await import('../src/data/missiles');
  const { guidanceSupport } = await import('../src/sim/radar');
  const { inDopplerNotch } = await import('../src/sim/math');
  type W = import('../src/sim/world').World;
  type M = import('../src/sim/types').Missile;
  type A = import('../src/sim/types').Aircraft;
  const miss = (w: W, m: M, reason: import('../src/sim/types').MissReason) => {
    m.alive = false; m.result = { kind: 'miss', reason, t: w.t };
    w.emit({ t: w.t, type: 'miss', missileId: m.id, reason });
  };
  return {
    createMissile(world: W, shooter: A, type: import('../src/data/types').MissileId, targetId: string | null): M {
      const spec = MISSILES[type];
      const target = world.get(targetId);
      return {
        kind: 'missile', id: world.uid('M'), type, side: shooter.side, shooterId: shooter.id, targetId,
        pos: shooter.pos.clone(), vel: shooter.vel.clone(), launchedAt: world.t, alive: true,
        guidance: spec.seeker === 'sarh' ? 'sarh' : spec.seeker === 'ir' ? 'ir' : 'datalink',
        aimPos: target ? target.pos.clone() : shooter.pos.clone(), aimVel: target ? target.vel.clone() : new Vector3(),
        seekerOn: null, motorLeft: spec.burnS, mass: spec.massKg, lofting: false,
        timeToActive: null, timeToImpact: null, result: null, closestApproach: Infinity,
      };
    },
    stepMissile(world: W, m: M, dt: number) {
      const spec = MISSILES[m.type];
      const tgt = world.get(m.targetId);
      const age = world.t - m.launchedAt;
      if (!tgt || !tgt.alive) return miss(world, m, 'target-dead');
      if (age > 90) return miss(world, m, 'timeout');
      const shooter = world.get(m.shooterId);
      const sup = shooter ? guidanceSupport(world, shooter, m.targetId) : { datalink: false, illuminating: false, estimate: null };
      if (m.guidance === 'sarh' && !sup.illuminating) {
        m.guidance = 'ballistic';
        world.emit({ t: world.t, type: 'seeker-lost', missileId: m.id, why: 'lost-guidance' });
      }
      if ((m.guidance === 'datalink' || m.guidance === 'inertial')) {
        if (sup.datalink && sup.estimate) { m.aimPos.copy(sup.estimate.pos); m.aimVel.copy(sup.estimate.vel); m.guidance = 'datalink'; }
        else { m.aimPos.addScaledVector(m.aimVel, dt); m.guidance = 'inertial'; }
        if (m.pos.distanceTo(m.aimPos) < (spec.pitbullKm ?? 15) * 1000) {
          m.guidance = 'active'; m.seekerOn = tgt.id;
          world.emit({ t: world.t, type: 'pitbull', missileId: m.id, targetId: m.targetId });
        }
      }
      // Crude seeker notch: active or SARH seeker loses a notching target in look-down, chaff seals it.
      if (m.guidance === 'active' || m.guidance === 'sarh') {
        const notched = inDopplerNotch(m.pos, tgt.pos, tgt.vel, 30, true, world.groundAlt);
        const chaffNear = world.countermeasures.some(c => c.kind === 'chaff' && c.ownerId === tgt.id && world.t - c.t0 < 2);
        if (notched && chaffNear && world.rand() < 0.02 * spec.chaffSusceptibility * 10) return miss(world, m, 'chaff');
      }
      const speed = age < spec.burnS ? 1100 : Math.max(250, 1100 - (age - spec.burnS) * 12);
      const aim = m.guidance === 'ballistic' ? m.pos.clone().addScaledVector(m.vel, 1) : m.guidance === 'active' || m.guidance === 'sarh' || m.guidance === 'ir' ? tgt.pos : m.aimPos;
      const dir = aim.clone().sub(m.pos).normalize();
      m.vel.lerp(dir.multiplyScalar(speed), Math.min(1, dt * 3));
      m.pos.addScaledVector(m.vel, dt);
      const d = m.pos.distanceTo(tgt.pos);
      m.closestApproach = Math.min(m.closestApproach, d);
      m.timeToImpact = d / Math.max(speed, 1);
      if (d < 40 && m.guidance !== 'ballistic') {
        m.alive = false; m.result = { kind: 'hit', reason: 'hit', t: world.t };
        world.emit({ t: world.t, type: 'hit', missileId: m.id, targetId: tgt.id });
        world.kill(tgt.id, m.shooterId);
      } else if (speed <= 260) miss(world, m, 'kinematic');
    },
  };
});

import { World } from '../src/sim/world';
import { aiStatus } from '../src/sim/ai';
import { duel, pair, twoVTwo, defenseDrill, twsDrill } from '../src/sim/scenarios';
import { relBearing, R2D } from '../src/sim/math';
import type { AiSkill } from '../src/sim/types';
import type { AircraftId } from '../src/data/types';

function log(w: World, filter: (e: import('../src/sim/types').SimEvent) => boolean = () => true): string[] {
  return w.events.filter(filter).map(e => {
    const t = e.t.toFixed(1).padStart(6);
    if (e.type === 'ai') return `${t} ai    ${e.ownerId}: [${e.state}] ${e.text}`;
    if (e.type === 'launch') return `${t} LAUNCH ${e.shooterId} → ${e.targetId} ${e.missile} ${(e.range ?? 0 / 1000).toFixed(0)} m ${e.radarMode}`;
    if (e.type === 'lock') return `${t} lock  ${e.ownerId} ${e.what} ${e.targetId} ${e.why ?? ''}`;
    if (e.type === 'rwr') return `${t} rwr   ${e.ownerId} hears ${e.emitterId} ${e.state}`;
    if (e.type === 'pitbull' || e.type === 'hit' || e.type === 'miss' || e.type === 'kill' || e.type === 'seeker-lost') return `${t} ${e.type} ${JSON.stringify(e)}`;
    return '';
  }).filter(Boolean);
}

function run(w: World, s: number) { const end = w.t + s; while (w.t < end) w.step(0.1); }

describe('dev: engagements with stand-in physics', () => {
  it('duel f15c vs su27 (player flies straight)', async () => {
    const w = new World(21);
    duel(w, 'f15c', 'su27', 'regular', { range: 90_000 });
    const b = w.get('bandit1'), me = w.get('player');
    for (let i = 0; i < 1200; i++) {
      w.step(0.1);
      if (i % 50 === 0 && b && me) {
        const { canLock } = await import('../src/sim/radar');
        console.log(`${w.t.toFixed(0)}s ${aiStatus(b)?.state} r=${(b.pos.distanceTo(me.pos)/1000).toFixed(1)} mode=${b.radar.mode} tracks=${b.radar.tracks.map(t=>t.targetId+(t.firm?'F':'')).join(',')} lock=${canLock(w, b, me.id).reason} block=${aiStatus(b)?.lastLaunchBlock}`);
      }
    }
    console.log(log(w, e => e.type !== 'cm' && e.type !== 'track' && e.type !== 'spawn').join('\n'));
    expect(w.events.some(e => e.type === 'launch')).toBe(true);
  });

  for (const [player, enemy, skill] of [['f16c', 'j11a', 'veteran'], ['su27', 'f15c', 'ace'], ['fa18c', 'mig29s', 'rookie'], ['su27', 'f14b', 'regular'], ['f15c', 'm2000c', 'veteran']] as [AircraftId, AircraftId, AiSkill][]) {
    it(`twoVTwo ${player} vs ${enemy} ${skill}`, () => {
      const w = new World(41);
      twoVTwo(w, player, enemy, skill);
      run(w, 240);
      console.log(`---- ${player} vs ${enemy} (${skill})\n` + log(w, e => e.type === 'ai' || e.type === 'launch' || e.type === 'hit' || e.type === 'kill' || e.type === 'miss' || e.type === 'pitbull').join('\n'));
      const bad = w.events.filter(e => e.type === 'ai' && /undefined|NaN|null/.test(e.text));
      expect(bad).toEqual([]);
    });
  }

  it('defenseDrill r27er at 30 km: shooter locks, fires, holds STT, cranks', () => {
    const w = new World(5);
    const d = defenseDrill(w, 'f16c', 'r27er', { range: 30_000 });
    const sh = w.get(d.shooterId);
    const me = w.get(d.playerId);
    const offs: string[] = [];
    for (let i = 0; i < 400; i++) {
      w.step(0.1);
      if (i % 20 === 0 && sh && me) offs.push(`${w.t.toFixed(0)}s ${aiStatus(sh)?.state} off=${(relBearing(sh.pos, sh.heading, me.pos) * R2D).toFixed(0)} r=${(sh.pos.distanceTo(me.pos) / 1000).toFixed(1)} stt=${sh.radar.stt.targetId} rwr=${me.rwr.map(c => c.state).join(',')}`);
    }
    console.log(log(w, e => e.type !== 'cm' && e.type !== 'track' && e.type !== 'spawn').join('\n') + '\n' + offs.join('\n'));
    const l = w.events.find(e => e.type === 'launch');
    expect(l && l.type === 'launch' ? l.range : 0).toBeLessThan(31_000);
    expect(d.missile()).not.toBeNull();
  });

  it('defenseDrill aim120c TWS vs su27 cold aspect', () => {
    const w = new World(6);
    const d = defenseDrill(w, 'su27', 'aim120c', { range: 25_000, aspectDeg: 180 });
    run(w, 60);
    console.log(log(w, e => e.type !== 'cm' && e.type !== 'track' && e.type !== 'spawn').join('\n'));
    expect(d.missile()).not.toBeNull();
  });

  it('twsDrill with evade: bandits notch at pitbull', () => {
    const w = new World(8);
    const d = twsDrill(w, 'f15c', { evade: true });
    const me = w.get(d.playerId);
    if (!me) throw new Error();
    w.setRadarMode(me.id, 'tws');
    run(w, 20);
    for (const id of d.banditIds) w.designate(me.id, id);
    console.log('designated', me.radar.designated, me.radar.tracks.map(t => `${t.label}:${t.targetId}:${t.firm}`));
    let fired = 0;
    for (let i = 0; i < 900; i++) {
      w.step(0.1);
      if (fired < 4) { const r = w.launch(me.id); if ('kind' in r) fired++; }
    }
    console.log(log(w, e => e.type === 'ai' || e.type === 'launch' || e.type === 'hit' || e.type === 'miss' || e.type === 'pitbull').join('\n'));
    expect(fired).toBeGreaterThan(0);
  });

  it('pair ace vs player f15c', () => {
    const w = new World(77);
    pair(w, 'f15c', 'mig29s', 'ace');
    run(w, 150);
    console.log(log(w, e => e.type === 'ai' || e.type === 'launch' || e.type === 'hit' || e.type === 'miss' || e.type === 'pitbull').join('\n'));
  });
});
