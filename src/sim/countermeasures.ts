/**
 * [OWNER: sim-physics] Chaff and flares as game mechanics.
 * - Dispensing respects the jet's counts and a short dispense interval (one cartridge per call).
 * - Chaff leaves the jet at its speed and slows almost to a stop within about a second, then drifts down
 *   slowly. That is why it decoys a Doppler seeker only when the jet is in the notch: in the notch the
 *   jet's radial speed is near zero too, so the seeker cannot tell them apart (missile.ts rolls the chance).
 * - Flares fall and slow down, and burn out after a few seconds.
 * missile.ts decides whether a seeker switches to a decoy; this module only moves and ages them.
 */
import type { World } from './world';
import type { Aircraft, Countermeasure } from './types';
import { G0 } from './math';

/** Minimum time between two cartridges of the same kind from one jet (s). */
export const DISPENSE_INTERVAL_S = 0.12;
/** How long a chaff bundle stays attractive to a radar seeker (s). */
export const CHAFF_LIFE_S = 5;
/** Flare burn time (s). */
export const FLARE_LIFE_S = 4;

const CHAFF_SLOWDOWN_S = 0.3;   // time constant: ~96 % of the jet's speed is gone after 1 s
const CHAFF_FALL_MPS = 3;
const FLARE_SLOWDOWN_S = 1.2;
const FLARE_FALL_MAX_MPS = 45;
const FLARE_EJECT_MPS = 20;     // pushed down / out of the jet

const lastDrop = new WeakMap<Aircraft, { chaff: number; flare: number }>();

function canDispense(world: World, ac: Aircraft, kind: 'chaff' | 'flare'): boolean {
  if (!ac.alive) return false;
  if ((kind === 'chaff' ? ac.chaff : ac.flares) <= 0) return false;
  let rec = lastDrop.get(ac);
  if (!rec) { rec = { chaff: -Infinity, flare: -Infinity }; lastDrop.set(ac, rec); }
  const last = rec[kind];
  // A World restarted with the same jet object would have a smaller clock: allow it.
  if (world.t >= last && world.t - last < DISPENSE_INTERVAL_S - 1e-9) return false;
  rec[kind] = world.t;
  return true;
}

export function dropChaff(world: World, ac: Aircraft): boolean {
  if (!canDispense(world, ac, 'chaff')) return false;
  ac.chaff--;
  world.countermeasures.push({
    kind: 'chaff', id: world.uid('C'), ownerId: ac.id,
    pos: ac.pos.clone(), vel: ac.vel.clone(), t0: world.t, life: CHAFF_LIFE_S,
  });
  world.emit({ t: world.t, type: 'cm', ownerId: ac.id, what: 'chaff' });
  return true;
}

export function dropFlare(world: World, ac: Aircraft): boolean {
  if (!canDispense(world, ac, 'flare')) return false;
  ac.flares--;
  const vel = ac.vel.clone();
  vel.y -= FLARE_EJECT_MPS;
  world.countermeasures.push({
    kind: 'flare', id: world.uid('F'), ownerId: ac.id,
    pos: ac.pos.clone(), vel, t0: world.t, life: FLARE_LIFE_S,
  });
  world.emit({ t: world.t, type: 'cm', ownerId: ac.id, what: 'flare' });
  return true;
}

export function stepCountermeasures(world: World, dt: number): void {
  const list = world.countermeasures;
  const chaffKeep = Math.exp(-dt / CHAFF_SLOWDOWN_S);
  const flareKeep = Math.exp(-dt / FLARE_SLOWDOWN_S);
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const c: Countermeasure = list[i];
    if (world.t - c.t0 >= c.life) continue;
    if (c.kind === 'chaff') {
      c.vel.x *= chaffKeep; c.vel.z *= chaffKeep;
      c.vel.y = -CHAFF_FALL_MPS + (c.vel.y + CHAFF_FALL_MPS) * chaffKeep;
    } else {
      c.vel.x *= flareKeep; c.vel.z *= flareKeep;
      c.vel.y = Math.max(-FLARE_FALL_MAX_MPS, c.vel.y * flareKeep - G0 * dt);
    }
    c.pos.addScaledVector(c.vel, dt);
    if (c.pos.y < world.groundAlt) { c.pos.y = world.groundAlt; c.vel.set(0, 0, 0); }
    list[n++] = c;
  }
  list.length = n;
}
