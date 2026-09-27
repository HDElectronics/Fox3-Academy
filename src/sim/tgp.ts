/**
 * [OWNER: sim] The A-10C II Litening targeting pod at game level (docs/research/a10c.md §3, cas-jets.md §2): slew the
 * line of sight over the ground, AREA / POINT / INR track, the own laser with its code, the laser spot search
 * (LSS → DETECT → LST) for a spot on the LSS code, and the SPI. The laser spot is an ordinary laser mark
 * (marks.ts) owned by the jet, so laser weapons and other sensors see it like a JTAC spot.
 *
 * Trainer values (not verified): the fields of view, the slew rate, the point-track gate, the LSS search cone and
 * the DETECT → LTRACK delay.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { Aircraft, EntityId, GroundMark, TgpState } from './types';
import { lineOfSight } from './ground';
import { endMark } from './marks';

/** Horizontal field of view (deg): WIDE and NARO. Trainer values. */
export const TGP_FOV_DEG = { wide: 4, narrow: 1 } as const;
/** Default laser and LSS code (ED manual: 1688). Valid codes 1111–1788 (research a10c.md §3). */
export const TGP_DEFAULT_CODE = 1688;
export const TGP_CODE_RANGE = { min: 1111, max: 1788 } as const;
/** Slew: fraction of the field of view per second at full deflection. Trainer value. */
const SLEW_FOV_PER_S = 0.6;
/** POINT track takes the nearest unit within this ground radius of the aim (m), or this share of the FOV. Trainer value. */
const POINT_GATE_M = 25;
/** LSS searches a cone around the line of sight this wide (deg, half angle). Trainer value. */
export const LSS_HALF_DEG = 6;
/** DETECT shows this long before LTRACK takes over (s). Trainer value. */
const LSS_DETECT_S = 1;
/** The pod cannot look above this elevation (deg): no ground in view. Trainer value. */
const MAX_EL_DEG = 5;

export interface TgpResult { ok: boolean; reason: string; unitId?: EntityId }
const ok = (unitId?: EntityId): TgpResult => ({ ok: true, reason: '', unitId });
const no = (reason: string): TgpResult => ({ ok: false, reason });

/** A code is four digits 1111–1788 with digits 1–8 after the first (as the DCS pod accepts). */
export function validLaserCode(code: number): boolean {
  if (!Number.isInteger(code) || code < TGP_CODE_RANGE.min || code > TGP_CODE_RANGE.max) return false;
  return String(code).slice(1).split('').every(d => d >= '1' && d <= '8');
}

export function createTgp(aim: Vector3): TgpState {
  return {
    on: false, aim: aim.clone(), slew: { x: 0, y: 0 }, track: 'none', trackedUnitId: null, fov: 'wide',
    laserCode: TGP_DEFAULT_CODE, laserFiring: false, laserMarkId: null,
    lssCode: TGP_DEFAULT_CODE, lss: 'off', lssMarkId: null, lssSince: 0,
  };
}

const tgpOf = (ac: Aircraft): TgpState | null => ac.ag?.tgp ?? null;

/** Elevation of `p` from the jet (deg, + up). */
function elevationDeg(ac: Aircraft, p: Vector3): number {
  const d = Math.hypot(p.x - ac.pos.x, p.z - ac.pos.z);
  return Math.atan2(p.y - ac.pos.y, d) * 180 / Math.PI;
}

/** Can the pod see this ground point: below its elevation limit and not behind terrain. */
function canSee(world: World, ac: Aircraft, p: Vector3): boolean {
  return elevationDeg(ac, p) <= MAX_EL_DEG && lineOfSight(world, ac.pos, { x: p.x, y: p.y + 2, z: p.z });
}

export function setTgpPower(world: World, ac: Aircraft, on: boolean): void {
  const t = tgpOf(ac);
  if (!t || t.on === on) return;
  if (!on) { setTgpLaser(world, ac, false); stopLss(world, t); t.track = 'none'; t.trackedUnitId = null; }
  t.on = on;
}

/** Hold slew input (TDC), −1..1 per axis; applied in stepTgp. Slewing breaks a POINT track to AREA. */
export function setTgpSlew(ac: Aircraft, x: number, y: number): void {
  const t = tgpOf(ac);
  if (!t) return;
  t.slew = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  if ((x || y) && t.track === 'point') { t.track = 'area'; t.trackedUnitId = null; }
}

/** Slave the line of sight to a ground point (SPI, a mark, coordinates, or a lesson script). */
export function pointTgp(world: World, ac: Aircraft, p: { x: number; y?: number; z: number }): void {
  const t = tgpOf(ac);
  if (!t) return;
  t.aim.set(p.x, p.y ?? world.groundHeight(p.x, p.z), p.z);
  if (t.track === 'point') { t.track = 'area'; t.trackedUnitId = null; }
}

/** Width of the view on the ground at the aim (m). */
export function tgpViewWidthM(ac: Aircraft, t: TgpState): number {
  return 2 * ac.pos.distanceTo(t.aim) * Math.tan((TGP_FOV_DEG[t.fov] * Math.PI) / 360);
}

/** Toggle WIDE / NARO (research: the pod's field of view steps). */
export function toggleTgpFov(ac: Aircraft): TgpState['fov'] | null {
  const t = tgpOf(ac);
  if (!t) return null;
  return (t.fov = t.fov === 'wide' ? 'narrow' : 'wide');
}

/**
 * TMS Forward Short: POINT track on the nearest live unit at the aim (AREA when nothing is there); TMS Aft Short:
 * INR (stop tracking, hold the point). Reason in pilot words when it fails.
 */
export function tgpTrack(world: World, ac: Aircraft, mode: 'area' | 'point' | 'inr'): TgpResult {
  const t = tgpOf(ac);
  if (!t || !t.on) return no('Targeting pod is off');
  if (!canSee(world, ac, t.aim)) return no('Pod cannot see the point: masked or above the horizon');
  if (mode === 'inr') { t.track = 'inr'; t.trackedUnitId = null; return ok(); }
  if (mode === 'area') { t.track = 'area'; t.trackedUnitId = null; return ok(); }
  const gate = Math.max(POINT_GATE_M, 0.08 * tgpViewWidthM(ac, t));
  let best: { id: EntityId; d: number } | null = null;
  for (const u of world.groundUnits.values()) {
    if (!u.alive) continue;
    const d = Math.hypot(u.pos.x - t.aim.x, u.pos.z - t.aim.z);
    if (d <= gate && (!best || d < best.d) && canSee(world, ac, u.pos)) best = { id: u.id, d };
  }
  if (!best) { t.track = 'area'; t.trackedUnitId = null; return no('Nothing to point track: AREA track'); }
  t.track = 'point';
  t.trackedUnitId = best.id;
  t.aim.copy(world.groundUnits.get(best.id)!.pos);
  return ok(best.id);
}

/** TMS Forward Long: make the pod's line of sight the SPI. */
export function setSpiFromTgp(world: World, ac: Aircraft): TgpResult {
  const t = tgpOf(ac);
  if (!ac.ag || !t || !t.on) return no('Targeting pod is off');
  ac.ag.spi = t.aim.clone();
  return ok(t.trackedUnitId ?? undefined);
}

/** Set the own laser code or the LSS code (CNTL page). */
export function setTgpCode(ac: Aircraft, which: 'laser' | 'lss', code: number): TgpResult {
  const t = tgpOf(ac);
  if (!t) return no('No targeting pod');
  if (!validLaserCode(code)) return no(`Code ${code} not valid: four digits 1111–1788, digits 1–8`);
  if (which === 'laser') t.laserCode = code; else t.lssCode = code;
  return ok();
}

/** Fire the laser (Nosewheel Steering button in the air) or stop it. The spot is a laser mark on the aim. */
export function setTgpLaser(world: World, ac: Aircraft, on: boolean): TgpResult {
  const t = tgpOf(ac);
  if (!t) return no('No targeting pod');
  if (!on) {
    if (t.laserMarkId) endMark(world, t.laserMarkId);
    t.laserMarkId = null;
    t.laserFiring = false;
    return ok();
  }
  if (!t.on) return no('Targeting pod is off');
  if (!canSee(world, ac, t.aim)) return no('Pod cannot see the point: no laser');
  if (!t.laserFiring) {
    const m = world.spawnMark({ type: 'laser', side: ac.side, ownerId: ac.id, pos: t.aim, code: t.laserCode });
    t.laserMarkId = m.id;
    t.laserFiring = true;
  }
  return ok();
}

/** LSS (OSB 6): start the laser spot search on the LSS code, or stop it. */
export function setTgpLss(world: World, ac: Aircraft, on: boolean): TgpResult {
  const t = tgpOf(ac);
  if (!t) return no('No targeting pod');
  if (!on) { stopLss(world, t); return ok(); }
  if (!t.on) return no('Targeting pod is off');
  t.lss = 'search';
  t.lssMarkId = null;
  t.lssSince = world.t;
  return ok();
}

function stopLss(_world: World, t: TgpState): void {
  t.lss = 'off';
  t.lssMarkId = null;
}

/** Laser spots on `code` the pod can see within the LSS cone around its line of sight, nearest the aim first. */
export function spotsInCone(world: World, ac: Aircraft, t: TgpState, code: number): GroundMark[] {
  const los = new Vector3().subVectors(t.aim, ac.pos).normalize();
  const cos = Math.cos((LSS_HALF_DEG * Math.PI) / 180);
  const out: GroundMark[] = [];
  for (const m of world.marks.values()) {
    if (!m.alive || m.type !== 'laser' || m.code !== code || m.ownerId === ac.id) continue;
    const v = new Vector3().subVectors(m.pos, ac.pos).normalize();
    if (v.dot(los) >= cos && canSee(world, ac, m.pos)) out.push(m);
  }
  return out.sort((a, b) => a.pos.distanceToSquared(t.aim) - b.pos.distanceToSquared(t.aim));
}

/** Advance the pod: slew, follow a POINT track, move the own laser spot, run the LSS. */
export function stepTgp(world: World, ac: Aircraft, dt: number): void {
  const t = tgpOf(ac);
  if (!t || !t.on || !ac.alive) return;
  // Slew over the ground, at a rate proportional to the view width.
  if ((t.slew.x || t.slew.y) && t.lss !== 'track') {
    const step = SLEW_FOV_PER_S * tgpViewWidthM(ac, t) * dt;
    const fwd = new Vector3(t.aim.x - ac.pos.x, 0, t.aim.z - ac.pos.z);
    if (fwd.lengthSq() < 1) fwd.set(Math.sin(ac.heading), 0, -Math.cos(ac.heading));
    fwd.normalize();
    const right = new Vector3(-fwd.z, 0, fwd.x);
    t.aim.addScaledVector(right, t.slew.x * step).addScaledVector(fwd, t.slew.y * step);
    t.aim.y = world.groundHeight(t.aim.x, t.aim.z);
  }
  // POINT track follows the unit; it breaks to INR when the unit dies or is masked.
  if (t.track === 'point' && t.trackedUnitId) {
    const u = world.groundUnits.get(t.trackedUnitId);
    if (!u || !u.alive || !canSee(world, ac, u.pos)) { t.track = 'inr'; t.trackedUnitId = null; }
    else t.aim.copy(u.pos);
  }
  // LSS: search → DETECT → LTRACK on a spot with the LSS code; NO LSR when the spot goes.
  if (t.lss === 'search') {
    const found = spotsInCone(world, ac, t, t.lssCode)[0];
    if (found) { t.lss = 'detect'; t.lssMarkId = found.id; t.lssSince = world.t; }
  } else if (t.lss === 'detect' || t.lss === 'track') {
    const m = t.lssMarkId ? world.marks.get(t.lssMarkId) : undefined;
    if (!m || !m.alive || !canSee(world, ac, m.pos)) { t.lss = 'lost'; t.lssMarkId = null; t.lssSince = world.t; }
    else {
      if (t.lss === 'detect' && world.t - t.lssSince >= LSS_DETECT_S) t.lss = 'track';
      if (t.lss === 'track') { t.aim.copy(m.pos); t.track = 'area'; t.trackedUnitId = null; }
    }
  }
  // Own laser: the spot sits on the aim while the pod can see it.
  if (t.laserFiring && t.laserMarkId) {
    const m = world.marks.get(t.laserMarkId);
    if (!m || !m.alive || !canSee(world, ac, t.aim)) setTgpLaser(world, ac, false);
    else m.pos.copy(t.aim);
  }
}
