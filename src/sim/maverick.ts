/**
 * [OWNER: sim] A-10C II AGM-65D/H Maverick seeker at game level (docs/research/a10c.md §6, ED manual pp. 687–691):
 * slave the seeker to the SPI (China Hat Forward Long), slew the gate, lock with TMS Forward Short (the gate collapses),
 * recage with China Hat Aft Short; a lock breaks when the target dies, is masked or leaves the seeker's field of regard.
 * The AGM-65L homes on a laser spot instead (agWeapons.ts 'laser-spot'); it does not use this seeker.
 *
 * Trainer values (not verified): the lock gate, the lock range limit, the seeker field of regard and the slew rate.
 * "Any contrast inside the gate locks" is the simplification the research names.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { Aircraft, EntityId, MavState } from './types';
import { lineOfSight } from './ground';
import { M_PER_NM, dirFrom } from './math';

/** Lock gate on the ground: this share of the slant range, never under 20 m. Trainer value. */
const GATE_FRACTION = 0.004;
const GATE_MIN_M = 20;
/** Locks are refused beyond this slant range (ED lessons lock at about 7.5–7.8 nm). Trainer value. */
export const MAV_LOCK_MAX_M = 8 * M_PER_NM;
/** Seeker field of regard: the lock breaks beyond this angle off the nose (deg). Trainer value. */
const FOR_DEG = 60;
/** Slew: metres per second per metre of range at full deflection. Trainer value. */
const SLEW_PER_S = 0.02;

export interface MavResult { ok: boolean; reason: string; unitId?: EntityId }
const ok = (unitId?: EntityId): MavResult => ({ ok: true, reason: '', unitId });
const no = (reason: string): MavResult => ({ ok: false, reason });

export function createMav(): MavState {
  return { aim: null, slew: { x: 0, y: 0 }, lockedUnitId: null, lastBreak: null };
}

const mavOf = (ac: Aircraft): MavState | null => ac.ag?.mav ?? null;

function offNoseDeg(ac: Aircraft, p: Vector3): number {
  const v = new Vector3().subVectors(p, ac.pos).normalize();
  return (Math.acos(Math.max(-1, Math.min(1, v.dot(dirFrom(ac.heading, ac.pitch))))) * 180) / Math.PI;
}

/** China Hat Forward Long: the seeker looks at the SPI. */
export function mavSlaveToSpi(ac: Aircraft): MavResult {
  const m = mavOf(ac);
  if (!m) return no('No Maverick on this jet');
  if (!ac.ag?.spi) return no('No SPI: set one with the pod first (TMS Forward Long)');
  m.aim = ac.ag.spi.clone();
  m.lockedUnitId = null;
  return ok();
}

/** Point the seeker at a ground point (lesson scripts). */
export function mavPointAt(world: World, ac: Aircraft, p: { x: number; y?: number; z: number }): void {
  const m = mavOf(ac);
  if (!m) return;
  m.aim = new Vector3(p.x, p.y ?? world.groundHeight(p.x, p.z), p.z);
  m.lockedUnitId = null;
}

/** Held slew input (TDC with the Maverick as SOI), −1..1; slewing a locked seeker breaks the lock. */
export function setMavSlew(ac: Aircraft, x: number, y: number): void {
  const m = mavOf(ac);
  if (!m) return;
  m.slew = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  if ((x || y) && m.lockedUnitId) m.lockedUnitId = null;
}

/** China Hat Aft Short: recage (unlock, seeker back to boresight: no aim). */
export function mavRecage(ac: Aircraft): void {
  const m = mavOf(ac);
  if (!m) return;
  m.lockedUnitId = null;
  m.aim = null;
}

/** TMS Forward Short with the Maverick as SOI: lock the unit in the gate. Reason in pilot words when it fails. */
export function mavLock(world: World, ac: Aircraft): MavResult {
  const m = mavOf(ac);
  if (!m) return no('No Maverick on this jet');
  const sel = ac.ag?.selected;
  if (sel !== 'agm65d' && sel !== 'agm65h') return no('Select a Maverick profile (AGM-65D or H): the page reads SENSOR');
  if (!m.aim) return no('Seeker caged: slave it to the SPI (China Hat Forward Long)');
  const range = ac.pos.distanceTo(m.aim);
  if (range > MAV_LOCK_MAX_M) return no(`Too far to lock: ${(range / M_PER_NM).toFixed(1)} nm (lock inside about 7.5 nm)`);
  if (offNoseDeg(ac, m.aim) > FOR_DEG) return no('Target outside the seeker field of view: turn toward it');
  const gate = Math.max(GATE_MIN_M, GATE_FRACTION * range);
  let best: { id: EntityId; d: number } | null = null;
  for (const u of world.groundUnits.values()) {
    if (!u.alive) continue;
    const d = Math.hypot(u.pos.x - m.aim.x, u.pos.z - m.aim.z);
    if (d <= gate && (!best || d < best.d) && lineOfSight(world, ac.pos, { x: u.pos.x, y: u.pos.y + 2, z: u.pos.z })) best = { id: u.id, d };
  }
  if (!best) return no('Nothing in the gate to lock: slew onto the target');
  m.lockedUnitId = best.id;
  m.aim.copy(world.groundUnits.get(best.id)!.pos);
  return ok(best.id);
}

/** Advance the seeker: slew the gate, follow the lock, break it when the target dies, is masked or leaves the field. */
export function stepMav(world: World, ac: Aircraft, dt: number): void {
  const m = mavOf(ac);
  if (!m || !ac.alive) return;
  if (m.aim && !m.lockedUnitId && (m.slew.x || m.slew.y)) {
    const step = SLEW_PER_S * ac.pos.distanceTo(m.aim) * dt;
    const fwd = new Vector3(m.aim.x - ac.pos.x, 0, m.aim.z - ac.pos.z).normalize();
    const right = new Vector3(-fwd.z, 0, fwd.x);
    m.aim.addScaledVector(right, m.slew.x * step).addScaledVector(fwd, m.slew.y * step);
    m.aim.y = world.groundHeight(m.aim.x, m.aim.z);
  }
  if (!m.lockedUnitId) return;
  const u = world.groundUnits.get(m.lockedUnitId);
  const why = !u || !u.alive ? 'target-dead'
    : !lineOfSight(world, ac.pos, { x: u.pos.x, y: u.pos.y + 2, z: u.pos.z }) ? 'masked'
    : offNoseDeg(ac, u.pos) > FOR_DEG ? 'gimbal' : null;
  if (why) { m.lastBreak = { t: world.t, unitId: m.lockedUnitId, why }; m.lockedUnitId = null; return; }
  m.aim!.copy(u!.pos);
}
