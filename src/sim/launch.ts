/**
 * [OWNER: sim-sensors] Launch rules, per aircraft and missile (canLaunch gates World.launch):
 * - Weapon: explicit or selected, carried by this jet, rounds left.
 * - Target: explicit targetId, else the STT target, else a designated TWS target (F-15C / F-14 ripple
 *   through the designations; other jets fire at the primary), else for IR the nearest hostile in the seeker.
 * - SARH (R-27R/ER, AIM-7M, Super 530D): STT on the target, not in memory.
 * - ARH: STT on the target, or TWS on jets with tws.launchFromTws: a designated, firm, fresh track and a free
 *   datalink slot (tws.maxSimultaneousTargets). FC3 Russian jets fire the R-77 from STT only.
 * - IR: no radar needed; the target must be inside the seeker's launch cone and IR acquisition range
 *   (simplified: 50 % of seeker range head-on, 100 % from the tail).
 * - Radar missiles: target inside the launch off-boresight limit.
 * - Range: inside dlz.rmax (dlz.ts) and outside rmin. FC3 Russian jets show ПР only inside
 *   autoSttAtRmaxFraction × Rmax (85 %), so they cannot fire before that (no launch-override key here).
 * - Friendly targets (IFF) are refused.
 * Reasons are pilot words ("Designate a track first", "R-27ER needs a lock (STT)").
 * When the lock is the only thing missing (SARH or FC3 missiles on a TWS / СНП track, or STT in memory) the
 * failed check still carries `range` and `dlz` from the firm track, so displays can draw the launch zone.
 * Other failures return them null.
 */
import type { World } from './world';
import type { Aircraft, Dlz, EntityId, LaunchCheck, Missile } from './types';
import type { MissileId, MissileSpec } from '../data/types';
import { AIRCRAFT } from '../data/aircraft';
import { MISSILES } from '../data/missiles';
import { D2R, M_PER_NM, R2D, aspectAngle, dirFrom } from './math';
import type { Vector3 } from 'three';
import { dlzFor } from './dlz';
import { createMissile } from './missile';
import { radarRules, snp2Eligibility, supportedTargets, trackOf } from './radar';

/**
 * IR seeker launch cone (deg off the nose) and acquisition range (km) when data/missiles.ts gives none.
 * DCS Lua (docs/research/missiles.md): Fi_start and IR sensitivity range.
 */
const IR_CONE_DEG: Partial<Record<MissileId, number>> = { r27t: 55, r27et: 55, r73: 45, aim9m: 17, aim9x: 90, pl5e: 17, magic2: 55 };
const IR_RANGE_KM: Partial<Record<MissileId, number>> = { r27t: 25, r27et: 25, r73: 20, aim9m: 20, aim9x: 25, pl5e: 20, magic2: 20 };
/** Radar missile launch off-boresight limit when data gives no seeker gimbal (deg). */
const RADAR_CONE_DEG = 60;

/** Launch cone of a missile (deg off the nose). */
export function launchConeDeg(missile: MissileId): number {
  const ms = MISSILES[missile];
  return ms.seekerGimbalDeg ?? (ms.seeker === 'ir' ? IR_CONE_DEG[missile] ?? 30 : RADAR_CONE_DEG);
}

/** IR acquisition range (m) against a target at `aspect` (rad, 0 hot .. π cold). Simplified. */
export function irAcquisitionRange(missile: MissileId, aspect: number): number {
  const ms = MISSILES[missile];
  const km = ms.seekerRangeKm ?? IR_RANGE_KM[missile] ?? 15;
  return km * 1000 * (0.5 + 0.5 * (aspect / Math.PI));
}

/** Angle between the shooter's nose (heading + pitch) and the line to `p` (rad). */
function offBoresight(ac: Aircraft, p: Vector3): number {
  const nose = dirFrom(ac.heading, ac.pitch);
  const los = p.clone().sub(ac.pos);
  const l = los.length();
  return l > 0 ? Math.acos(Math.max(-1, Math.min(1, nose.dot(los) / l))) : 0;
}

function fmtRange(m: number, units: 'metric' | 'imperial'): string {
  if (units === 'imperial') { const nm = m / M_PER_NM; return `${nm < 10 ? nm.toFixed(1) : nm.toFixed(0)} nm`; }
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : km.toFixed(0)} km`;
}

/** Live missiles `ac` has in the air against `targetId`. */
function liveMissilesAt(world: World, ac: Aircraft, targetId: EntityId): number {
  let n = 0;
  for (const m of world.missiles.values()) if (m.alive && m.shooterId === ac.id && m.targetId === targetId) n++;
  return n;
}

/** The target a launch would go to right now (radar-known), or null. */
export function launchTarget(world: World, ac: Aircraft, missile: MissileId | null = ac.selectedWeapon): EntityId | null {
  const st = ac.radar;
  if (st.mode === 'stt' && st.stt.targetId) return st.stt.targetId;
  const live = st.designated.filter(id => world.get(id)?.alive);
  if (st.mode === 'tws' && live.length) {
    if (radarRules(ac.type).launchOrder === 'primary') return live[0];
    // Ripple: the designated target with the fewest missiles in the air, in designation order (PDT, SDTs, PDT…).
    let best = live[0], bestN = Infinity;
    for (const id of live) { const n = liveMissilesAt(world, ac, id); if (n < bestN) { bestN = n; best = id; } }
    return best;
  }
  if (missile && MISSILES[missile].seeker === 'ir') {
    let best: EntityId | null = null, bestR = Infinity;
    const cone = launchConeDeg(missile) * D2R;
    for (const o of world.aircraft.values()) {
      if (!o.alive || o.side === ac.side) continue;
      const r = ac.pos.distanceTo(o.pos);
      if (r >= bestR || offBoresight(ac, o.pos) > cone) continue;
      if (r > irAcquisitionRange(missile, aspectAngle(o.pos, o.vel, ac.pos))) continue;
      best = o.id; bestR = r;
    }
    return best;
  }
  return null;
}

function noTargetReason(ac: Aircraft, ms: MissileSpec): string {
  const st = ac.radar, spec = AIRCRAFT[ac.type];
  if (ms.seeker === 'ir') return `No target in the ${ms.name} seeker`;
  if (st.mode === 'off') return 'Radar is off';
  if (st.mode === 'tws') return ms.seeker === 'sarh' ? `${ms.name} needs a lock (STT)` : 'Designate a track first';
  if (ms.seeker === 'sarh') return `${ms.name} needs a lock (STT)`;
  const tws = spec.radar.tws;
  if (tws && tws.launchFromTws && spec.radar.modes.includes('tws')) return 'Lock a target (STT) or designate a TWS track';
  return `${ms.name} needs a lock (STT)`;
}

export function canLaunch(world: World, ac: Aircraft, targetId?: EntityId, missile?: MissileId): LaunchCheck {
  if (ac.radar.snp2 && ac.radar.mode === 'tws') {
    const pair = canLaunchSnp2(world, ac);
    const mid = missile ?? ac.selectedWeapon;
    if (!pair.ok || mid !== 'r77' || (targetId && !pair.targetIds?.includes(targetId))) {
      return { ok: false, reason: pair.reason || 'СНП2 fires two R-77s at Ц1 and Ц2', targetId: targetId ?? pair.targetIds?.[0] ?? null, missile: mid, range: pair.range, dlz: null };
    }
    return canLaunchSingle(world, ac, targetId ?? pair.targetIds![0], 'r77', true);
  }
  return canLaunchSingle(world, ac, targetId, missile);
}

function canLaunchSingle(world: World, ac: Aircraft, targetId?: EntityId, missile?: MissileId, snp2 = false): LaunchCheck {
  const spec = AIRCRAFT[ac.type], units = spec.units, st = ac.radar;
  const mid = missile ?? ac.selectedWeapon;
  let tid: EntityId | null = null, range: number | null = null, dlz: Dlz | null = null;
  const fail = (reason: string): LaunchCheck => ({ ok: false, reason, targetId: tid, missile: mid ?? null, range, dlz });
  if (!mid) return fail('Select a missile');
  const ms = MISSILES[mid];
  if (!spec.missiles.includes(mid) && ac.stores[mid] === undefined) return fail(`The ${spec.short} cannot carry the ${ms.name}`);
  if ((ac.stores[mid] ?? 0) <= 0) return fail(`No ${ms.name} left`);

  tid = targetId ?? launchTarget(world, ac, mid);
  if (!tid) return fail(noTargetReason(ac, ms));
  const tgt = world.get(tid);
  if (!tgt || !tgt.alive || tgt.id === ac.id) return fail('No target');
  const trk = trackOf(st, tid);
  const label = trk?.label ?? 'Target';
  if (tgt.side === ac.side) return fail(`${label} is friendly (IFF)`);

  // Guidance requirements and the estimate the shot is computed on (radar-known for radar missiles).
  let estPos = tgt.pos, estVel = tgt.vel;
  // The only thing missing is the lock (Fox 1s, FC3 СНП before the auto-lock, STT memory): still report the
  // launch zone from the firm track so displays can show it, with the shoot cue off.
  const needLock = (reason: string): LaunchCheck => {
    if (trk && trk.firm) {
      range = ac.pos.distanceTo(trk.pos);
      dlz = dlzFor(ac.pos, ac.vel, trk.pos, trk.vel, mid);
    }
    return fail(reason);
  };
  if (ms.seeker !== 'ir') {
    if (st.mode === 'off') return fail('Radar is off');
    const locked = st.mode === 'stt' && st.stt.targetId === tid;
    if (ms.seeker === 'sarh') {
      if (!locked) return needLock(`${ms.name} needs a lock (STT)`);
    } else if (!locked) {
      const tws = spec.radar.tws;
      if (!tws || (!tws.launchFromTws && !snp2)) return needLock(`${ms.name} needs a lock (STT) in the ${spec.short}`);
      if (st.mode !== 'tws') return fail(st.mode === 'stt' ? `Locked on another target: unlock or lock ${label}` : 'Lock a target (STT) or designate a TWS track');
      if (!trk) return fail(`No track on ${label}`);
      if (!st.designated.includes(tid)) return fail(`Designate ${label} first`);
      if (!trk.firm) return fail(`${label} is not firm yet: wait for a second hit`);
      if (trk.coasting) return fail(`${label} is coasting: no fresh track`);
      const sup = supportedTargets(world, ac);
      if (!sup.has(tid) && sup.size >= tws.maxSimultaneousTargets) {
        return fail(`Datalink full: ${sup.size} target${sup.size === 1 ? '' : 's'} already supported`);
      }
    }
    if (locked && st.stt.lostFor > 0) return needLock('Lock in memory: target not tracked');
    if (!trk) return fail(`No track on ${label}`);
    estPos = trk.pos; estVel = trk.vel;
  }

  range = ac.pos.distanceTo(estPos);
  dlz = dlzFor(ac.pos, ac.vel, estPos, estVel, mid);
  const cone = launchConeDeg(mid);
  const off = offBoresight(ac, estPos) * R2D;
  if (off > cone) return fail(`${label} ${off.toFixed(0)}° off the nose: ${ms.name} limit ${cone.toFixed(0)}°`);
  if (ms.seeker === 'ir') {
    const irR = irAcquisitionRange(mid, aspectAngle(tgt.pos, tgt.vel, ac.pos));
    if (range > irR) return fail(`No IR lock at ${fmtRange(range, units)}: seeker sees this aspect at ${fmtRange(irR, units)}`);
  }
  if (range > dlz.rmax) return fail(`Out of range: ${fmtRange(range, units)}, Rmax ${fmtRange(dlz.rmax, units)}`);
  if (range < dlz.rmin) return fail(`Too close: ${fmtRange(range, units)}, Rmin ${fmtRange(dlz.rmin, units)}`);
  const frac = spec.radar.tws?.autoSttAtRmaxFraction;
  if (frac != null && (!snp2 || tid === st.designated[0]) && range > frac * dlz.rmax) {
    return fail(`No ПР yet: ${fmtRange(range, units)}, ПР at ${fmtRange(frac * dlz.rmax, units)} (${Math.round(frac * 100)}% Rmax)`);
  }
  return { ok: true, reason: '', targetId: tid, missile: mid, range, dlz };
}

export interface Snp2LaunchCheck {
  ok: boolean;
  reason: string;
  targetIds: [EntityId, EntityId] | null;
  sepDeg: number | null;
  range: number | null;
  prRange: number | null;
}

/** Atomic two-round launch check. Neither missile leaves unless both targets qualify. */
export function canLaunchSnp2(world: World, ac: Aircraft): Snp2LaunchCheck {
  const eligibility = snp2Eligibility(world, ac);
  const result: Snp2LaunchCheck = { ...eligibility, range: null, prRange: null };
  if (!eligibility.ok || !eligibility.targetIds) return result;
  if ((ac.stores.r77 ?? 0) < 2) return { ...result, ok: false, reason: 'СНП2 needs two R-77s' };
  if (ac.selectedWeapon !== 'r77') return { ...result, ok: false, reason: 'Select R-77: СНП2 fires two R-77s' };
  for (const target of eligibility.targetIds) {
    const check = canLaunchSingle(world, ac, target, 'r77', true);
    if (target === eligibility.targetIds[0]) {
      result.range = check.range;
      result.prRange = check.dlz ? check.dlz.rmax * 0.85 : null;
    }
    if (!check.ok) return { ...result, ok: false, reason: check.reason };
  }
  return result;
}

export function launchSnp2(world: World, ac: Aircraft): Missile[] {
  const check = canLaunchSnp2(world, ac);
  if (!check.ok || !check.targetIds) return [];
  const missiles = check.targetIds.map(id => createMissile(world, ac, 'r77', id));
  ac.stores.r77 = (ac.stores.r77 ?? 0) - 2;
  for (const m of missiles) {
    world.missiles.set(m.id, m);
    const track = trackOf(ac.radar, m.targetId!);
    world.emit({ t: world.t, type: 'launch', missileId: m.id, shooterId: ac.id, targetId: m.targetId!, missile: 'r77', range: track ? ac.pos.distanceTo(track.pos) : null, radarMode: 'tws' });
  }
  if (!ac.stores.r77) ac.selectedWeapon = (Object.keys(ac.stores) as MissileId[]).find(id => (ac.stores[id] ?? 0) > 0) ?? null;
  return missiles;
}
