/**
 * [OWNER: sim-sensors] Close-range acquisition (ACM) and the IR missile seeker, at gameplay level.
 *
 * ACM: each jet's modes come from data/acm.ts (scan area, lock range, lock rule, sensor). The first hostile inside
 * the area and range, held there for the mode's dwell, is locked: automatically, or when the pilot presses lock
 * ('enter' modes: FC3 BORE and HELMET). A radar mode locks through the radar (STT, so the target's RWR sees it);
 * FC3 IRST modes lock silently; Fi0 uses only the missile's seeker. The lock drops when the target dies, leaves
 * 1.5 × the lock range or 60° off the nose, or the radar loses its STT.
 *
 * IR seeker (for the HUD and the tone): caged on the boresight, or slaved to the ACM lock while it sits inside the
 * missile's gimbal. It "sees" a hostile inside its field of view and IR acquisition range (launch.ts): growl.
 * It tracks ('lock' tone, FC3 ПР) on its own ('auto' jets) or when the pilot uncages while it growls ('key' jets),
 * and keeps tracking inside the gimbal. irShotCheck() adds the launch rules: World.canLaunch plus the jet's
 * off-boresight launch limit (R-73 45°). No seeker engineering: rule-based states only (AGENTS.md rule 1).
 *
 * The state lives in an AcmState the page owns (no change to the Aircraft contract). Deterministic: no randomness.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { Aircraft, EntityId, LaunchCheck, Missile } from './types';
import { acmFor, type AcmArea, type AcmJet, type AcmModeId, type AcmModeSpec } from '../data/acm';
import { MISSILES } from '../data/missiles';
import { aircraftAngles } from './aircraftFrame';
import { irAcquisitionRange } from './launch';
import { R2D, aspectAngle, dirFrom } from './math';

export type SeekerMode = 'caged' | 'slaved' | 'track';
export type IrTone = 'none' | 'growl' | 'lock';

/** A lock drops beyond this × the mode's lock range, or this far off the nose (deg). */
export const ACM_HOLD_RANGE_FACTOR = 1.5;
export const ACM_HOLD_OFF_DEG = 60;
/** 'auto' seekers track after seeing the heat this long (s). */
export const SEEKER_AUTO_TRACK_S = 0.3;
/** A tracking seeker holds on out to this × its acquisition range. */
export const SEEKER_HOLD_FACTOR = 1.2;

export interface SeekerState {
  mode: SeekerMode;
  tone: IrTone;
  /** Target the seeker sees or tracks. */
  targetId: EntityId | null;
  /** Seconds it has seen heat continuously. */
  heatS: number;
  /** Pilot uncage request waiting for the next step. */
  uncageReq: boolean;
}

export interface AcmState {
  jet: AcmJet;
  mode: AcmModeId | null;
  lockedId: EntityId | null;
  lockSensor: AcmModeSpec['sensor'] | null;
  /** World time of the last lock, null before one. */
  lockT: number | null;
  /** Hostile currently in the area and its dwell (s). */
  candidateId: EntityId | null;
  /** Trainer padlock/look target, independent of acquisition and lock eligibility. */
  helmetLookId: EntityId | null;
  dwellS: number;
  seeker: SeekerState;
  /** Last reason a lock press or shot failed, in pilot words. */
  msg: string;
}

export function newAcmState(type: string): AcmState | null {
  const jet = acmFor(type);
  if (!jet) return null;
  return {
    jet, mode: null, lockedId: null, lockSensor: null, lockT: null, candidateId: null, helmetLookId: null, dwellS: 0, msg: '',
    seeker: { mode: 'caged', tone: 'none', targetId: null, heatS: 0, uncageReq: false },
  };
}

export function modeSpec(st: AcmState, id: AcmModeId | null = st.mode): AcmModeSpec | null {
  return id ? st.jet.modes.find(m => m.id === id) ?? null : null;
}

const _u = new Vector3(), _rel = new Vector3();

/** Angles of `p` from `me`'s flight path in the HUD frame (deg; az + right, el + up toward the canopy). */
export function acmAngles(me: Aircraft, p: Vector3): { az: number; el: number; range: number; ahead: boolean } {
  const a = aircraftAngles(me, p);
  return { ...a, az: a.az * R2D, el: a.el * R2D };
}

/** Is (az, el) (deg) inside the area? */
export function inArea(area: AcmArea, az: number, el: number): boolean {
  if (area.kind === 'cone') return Math.hypot(az - area.az, el - area.el) <= area.radiusDeg;
  return az >= area.az[0] && az <= area.az[1] && el >= area.el[0] && el <= area.el[1];
}

/** Angle between the nose and `p` (deg), as the launch rules measure it. */
export function offBoresightDeg(me: Aircraft, p: Vector3): number {
  const nose = dirFrom(me.heading, me.pitch, _u);
  const rel = _rel.subVectors(p, me.pos);
  const l = rel.length();
  return l > 0 ? Math.acos(Math.max(-1, Math.min(1, nose.dot(rel) / l))) * R2D : 0;
}

function hostiles(world: World, me: Aircraft): Aircraft[] {
  const out: Aircraft[] = [];
  for (const o of world.aircraft.values()) if (o.alive && o !== me && o.side !== me.side) out.push(o);
  return out;
}

/** Closest hostile inside the mode's area and lock range, or null. */
export function acmCandidate(world: World, me: Aircraft, spec: AcmModeSpec, lookId?: EntityId | null): Aircraft | null {
  let best: Aircraft | null = null, bestR = Infinity;
  for (const o of hostiles(world, me)) {
    if (spec.cue === 'helmet' && lookId && o.id !== lookId) continue;
    const a = acmAngles(me, o.pos);
    if (!a.ahead || !inArea(spec.area.value, a.az, a.el)) continue;
    if (a.range > spec.rangeM.value || a.range >= bestR) continue;
    best = o; bestR = a.range;
  }
  return best;
}

/** Drop the ACM lock (and the radar STT it made). */
export function acmUnlock(world: World, me: Aircraft, st: AcmState): void {
  if (st.lockedId && st.lockSensor === 'radar' && me.radar.mode === 'stt') world.unlock(me.id);
  st.lockedId = null;
  st.lockSensor = null;
  st.dwellS = 0;
  st.candidateId = null;
}

/**
 * Select an ACM mode (null leaves ACM). Drops any lock. Radar modes need the radar on (search); FC3 IRST and
 * seeker modes switch the radar off, so nothing reaches the bandit's RWR.
 */
export function setAcmMode(world: World, me: Aircraft, st: AcmState, id: AcmModeId | null): boolean {
  const spec = modeSpec(st, id);
  if (id && !spec) return false;
  acmUnlock(world, me, st);
  st.mode = id;
  st.msg = '';
  if (spec?.cue === 'helmet' && !world.get(st.helmetLookId)?.alive) {
    st.helmetLookId = hostiles(world, me).sort((a, b) => me.pos.distanceToSquared(a.pos) - me.pos.distanceToSquared(b.pos))[0]?.id ?? null;
  }
  if (spec?.sensor === 'radar') { if (me.radar.mode === 'off' || me.radar.mode === 'stt') world.setRadarMode(me.id, 'rws'); }
  else if (spec) world.setRadarMode(me.id, 'off');
  return true;
}

function lockOn(world: World, me: Aircraft, st: AcmState, spec: AcmModeSpec, tgt: Aircraft): boolean {
  if (spec.sensor === 'radar') {
    if (me.radar.mode === 'off') world.setRadarMode(me.id, 'rws');
    if (!world.lock(me.id, tgt.id, 'aircraft')) { st.msg = world.canLock(me.id, tgt.id, 'aircraft').reason || 'No lock'; return false; }
  }
  st.lockedId = tgt.id;
  st.lockSensor = spec.sensor;
  st.lockT = world.t;
  st.msg = '';
  return true;
}

/** Pilot lock press (Enter): locks the target in the area now. Needed by 'enter' modes; harmless on others. */
export function acmPressLock(world: World, me: Aircraft, st: AcmState): boolean {
  const spec = modeSpec(st);
  if (!spec) { st.msg = 'Select a close-combat mode'; return false; }
  if (spec.sensor === 'seeker') { st.msg = `${spec.name} uses the missile seeker: no lock to press`; return false; }
  if (st.lockedId) return true;
  const tgt = acmCandidate(world, me, spec, st.helmetLookId);
  if (!tgt) { st.msg = `Nobody inside the ${spec.name} area and range`; return false; }
  return lockOn(world, me, st, spec, tgt);
}

/** Uncage / cage the IR seeker (the jet's uncage key). Auto jets ignore it. */
export function toggleUncage(st: AcmState): void {
  const sk = st.seeker;
  if (sk.mode === 'track') { sk.mode = 'caged'; sk.tone = 'none'; sk.targetId = null; sk.heatS = 0; sk.uncageReq = false; return; }
  sk.uncageReq = true;
}

function irMissile(st: AcmState) { return st.jet.ir.missile; }

/** Does the seeker see `o` along `dirAngles` (the target's angle from the seeker line, deg)? */
function seesHeat(me: Aircraft, o: Aircraft, sepDeg: number, fovDeg: number, missile: ReturnType<typeof irMissile>, hold = 1): boolean {
  if (sepDeg > fovDeg / 2) return false;
  const r = me.pos.distanceTo(o.pos);
  return r <= hold * irAcquisitionRange(missile, aspectAngle(o.pos, o.vel, me.pos));
}

function stepSeeker(world: World, me: Aircraft, st: AcmState, dt: number): void {
  const sk = st.seeker, ir = st.jet.ir, missile = ir.missile;
  const gimbal = MISSILES[missile].seekerGimbalDeg ?? 45;
  const fov = ir.seekerFovDeg.value;
  const req = sk.uncageReq;
  sk.uncageReq = false;
  if (st.mode === 'gacq' || (me.stores[missile] ?? 0) <= 0 || !me.alive) { sk.mode = 'caged'; sk.tone = 'none'; sk.targetId = null; sk.heatS = 0; return; }
  if (sk.mode === 'track') {
    const t = world.get(sk.targetId);
    if (t && t.alive && offBoresightDeg(me, t.pos) <= gimbal && seesHeat(me, t, 0, fov, missile, SEEKER_HOLD_FACTOR)) { sk.tone = 'lock'; return; }
    sk.mode = 'caged'; sk.targetId = null; sk.heatS = 0;
  }
  // Slaved to the ACM lock while it is inside the gimbal; else caged on the boresight.
  const locked = world.get(st.lockedId);
  let seen: Aircraft | null = null;
  if (locked && locked.alive && offBoresightDeg(me, locked.pos) <= gimbal) {
    sk.mode = 'slaved';
    if (seesHeat(me, locked, 0, fov, missile)) seen = locked;
  } else {
    sk.mode = 'caged';
    let bestR = Infinity;
    for (const o of hostiles(world, me)) {
      const off = offBoresightDeg(me, o.pos);
      const r = me.pos.distanceTo(o.pos);
      if (r < bestR && seesHeat(me, o, off, fov, missile)) { seen = o; bestR = r; }
    }
  }
  if (!seen) { sk.tone = 'none'; sk.targetId = null; sk.heatS = 0; return; }
  if (sk.targetId !== seen.id) sk.heatS = 0;
  sk.targetId = seen.id;
  sk.heatS += dt;
  sk.tone = 'growl';
  const track = ir.uncage.value === 'auto' ? sk.heatS >= SEEKER_AUTO_TRACK_S : req;
  if (track) { sk.mode = 'track'; sk.tone = 'lock'; }
}

/** One step of ACM acquisition and the IR seeker. Call after World.step with the same dt. */
export function stepAcm(world: World, me: Aircraft, st: AcmState, dt: number): void {
  const spec = modeSpec(st);
  // Validate the lock.
  if (st.lockedId) {
    const t = world.get(st.lockedId);
    const range = spec && spec.sensor !== 'seeker' ? spec.rangeM.value * ACM_HOLD_RANGE_FACTOR : Infinity;
    const lost = !t || !t.alive || !me.alive || me.pos.distanceTo(t.pos) > range || offBoresightDeg(me, t.pos) > ACM_HOLD_OFF_DEG
      || (st.lockSensor === 'radar' && (me.radar.mode !== 'stt' || me.radar.stt.targetId !== st.lockedId));
    if (lost) acmUnlock(world, me, st);
  }
  // Acquire.
  if (spec && spec.sensor !== 'seeker' && !st.lockedId && me.alive) {
    const c = acmCandidate(world, me, spec, st.helmetLookId);
    if (c && c.id === st.candidateId) st.dwellS += dt;
    else { st.candidateId = c?.id ?? null; st.dwellS = 0; }
    if (c && spec.lock.value === 'auto' && st.dwellS >= spec.lockS.value) lockOn(world, me, st, spec, c);
  } else if (!st.lockedId) { st.candidateId = null; st.dwellS = 0; }
  // Fi0: the seeker is the sensor; its track counts as the lock time for the lesson.
  stepSeeker(world, me, st, dt);
  if (spec?.sensor === 'seeker' && st.seeker.mode === 'track' && st.lockT === null) st.lockT = world.t;
}

export interface IrShot {
  ok: boolean;
  /** Seeker tracking, World launch rules met and inside the off-boresight limit. */
  inZone: boolean;
  reason: string;
  targetId: EntityId | null;
  offDeg: number | null;
  limitDeg: number;
  range: number | null;
  rmin: number | null;
  rmax: number | null;
  check: LaunchCheck | null;
}

/** Can the IR missile go now, and is the shot in the zone? */
export function irShotCheck(world: World, me: Aircraft, st: AcmState): IrShot {
  const ir = st.jet.ir, missile = ir.missile, limitDeg = ir.launchLimitDeg.value;
  const name = MISSILES[missile].name;
  const tid = st.seeker.targetId ?? st.lockedId;
  const out: IrShot = { ok: false, inZone: false, reason: '', targetId: tid, offDeg: null, limitDeg, range: null, rmin: null, rmax: null, check: null };
  if (st.mode === 'gacq') { out.reason = 'GACQ is guns only. Select an IR-compatible mode.'; return out; }
  if ((me.stores[missile] ?? 0) <= 0) { out.reason = `No ${name} left`; return out; }
  const t = world.get(tid);
  if (!t || !t.alive) { out.reason = `No heat in the ${name} seeker`; return out; }
  const check = world.canLaunch(me.id, t.id, missile);
  out.check = check;
  out.offDeg = offBoresightDeg(me, t.pos);
  out.range = check.range;
  out.rmin = check.dlz?.rmin ?? null;
  out.rmax = check.dlz?.rmax ?? null;
  if (!check.ok) { out.reason = check.reason; return out; }
  if (out.offDeg > limitDeg) { out.reason = `${Math.round(out.offDeg)}° off the nose: ${name} launch limit ${limitDeg}°`; return out; }
  out.ok = true;
  out.inZone = st.seeker.mode === 'track';
  out.reason = out.inZone ? '' : 'No tone yet: the seeker is not tracking';
  return out;
}

/** Fire the IR missile if the launch rules allow; returns the missile and whether the shot was in the zone. */
export function fireIr(world: World, me: Aircraft, st: AcmState): { missile: Missile | null; shot: IrShot } {
  const shot = irShotCheck(world, me, st);
  if (!shot.ok || !shot.targetId) { st.msg = shot.reason; return { missile: null, shot }; }
  const r = world.launch(me.id, shot.targetId, st.jet.ir.missile);
  if (!('kind' in r)) { st.msg = r.reason; return { missile: null, shot: { ...shot, ok: false, reason: r.reason } }; }
  // The missile is away: the seeker on the rail goes back to caged for the next round.
  st.seeker.mode = 'caged'; st.seeker.tone = 'none'; st.seeker.targetId = null; st.seeker.heatS = 0;
  st.msg = '';
  return { missile: r, shot };
}

/** HUD angles (deg) of the seeker line: on the tracked / slaved target, else the boresight. */
export function seekerAim(world: World, me: Aircraft, st: AcmState): { az: number; el: number; onTarget: boolean } {
  const t = st.seeker.mode !== 'caged' ? world.get(st.seeker.targetId ?? st.lockedId) : undefined;
  if (t && t.alive) { const a = acmAngles(me, t.pos); if (a.ahead) return { az: a.az, el: a.el, onTarget: true }; }
  return { az: 0, el: 0, onTarget: false };
}
