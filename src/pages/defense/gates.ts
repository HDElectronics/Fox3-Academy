/** Defense gauge adapters: radar geometry and the sim's read-only missile notch state. */
import type { Vector3 } from 'three';
import type { World } from '../../sim/world';
import type { Aircraft, Missile } from '../../sim/types';
import { AIRCRAFT } from '../../data/aircraft';
import { MPS_PER_KT, aspectAngle, clamp, isLookDown } from '../../sim/math';
import { notchState } from '../../sim/missile';
import { missileModel } from '../../sim/missileModel';
import { radarRules, trackOf } from '../../sim/radar';
import { fighterSpec, fighterType } from '../../sim/jet';

export interface GateRead {
  /** Is this sensor looking at you right now (radar tracking you, seeker switched on)? */
  on: boolean;
  /** Your radial speed vs the ground along its line of sight, m/s. + = closing on it, - = opening. */
  radial: number;
  /** Gate half-width, m/s (0 when no gate applies). */
  gate: number;
  /** Would the gate apply here (look-down where the sensor needs it)? */
  applies: boolean;
  lookDown: boolean;
  /** Needs ground behind you to notch it at all. */
  needsLookDown: boolean;
  inGate: boolean;
  /** 1 at zero radial speed, 0.5 at the gate edge, 0 at twice the gate (chaff odds scale with it). */
  depth: number;
  /** Slant range to the sensor, m. */
  range: number;
}

const EMPTY: GateRead = { on: false, radial: 0, gate: 0, applies: false, lookDown: false, needsLookDown: false, inGate: false, depth: 0, range: 0 };

/** Signed radial speed of `tVel` along the line of sight from `obs` to `t` (m/s, + = closing). */
export function signedClosing(obs: Vector3, t: Vector3, tVel: Vector3): number {
  const lx = t.x - obs.x, ly = t.y - obs.y, lz = t.z - obs.z;
  const l = Math.hypot(lx, ly, lz) || 1;
  return -(tVel.x * lx + tVel.y * ly + tVel.z * lz) / l;
}

/** What the shooter's radar sees of you. */
export function radarGate(world: World, shooter: Aircraft | undefined, me: Aircraft): GateRead {
  if (!shooter || !shooter.alive || !me.alive) return EMPTY;
  const spec = fighterSpec(shooter).radar;
  const st = shooter.radar;
  const on = st.mode !== 'off' && ((st.mode === 'stt' && st.stt.targetId === me.id) || !!trackOf(st, me.id));
  const radial = signedClosing(shooter.pos, me.pos, me.vel);
  const lookDown = isLookDown(shooter.pos, me.pos, world.groundAlt);
  const needsLookDown = spec.notchNeedsLookDown;
  const applies = !needsLookDown || lookDown;
  const gate = spec.notchKts * MPS_PER_KT;
  const inGate = applies && Math.abs(radial) < gate;
  return {
    on, radial, gate, applies, lookDown, needsLookDown, inGate,
    depth: applies ? clamp(1 - Math.abs(radial) / (2 * gate), 0, 1) : 0,
    range: shooter.pos.distanceTo(me.pos),
  };
}

/** Is the seeker switched on and looking (SARH homing, or ARH after pitbull)? */
export function seekerOn(m: Missile | null): boolean {
  return !!m && m.alive && (m.guidance === 'sarh' || m.guidance === 'active');
}

/** What the missile's own seeker sees of you. */
export function seekerGate(world: World, m: Missile | null, me: Aircraft): GateRead {
  if (!m || !me.alive) return EMPTY;
  const state = notchState(world, m);
  if (!state || state.targetId !== me.id) return EMPTY;
  return {
    on: seekerOn(m), radial: signedClosing(m.pos, me.pos, me.vel), gate: state.gateMps,
    applies: true, lookDown: state.lookDown, needsLookDown: false, inGate: state.inNotch,
    depth: state.depth, range: m.pos.distanceTo(me.pos),
  };
}

/** STT memory of the shooter's radar (s): the lock breaks after this long in the notch. */
export function sttMemory(shooter: Aircraft): number {
  return radarRules(fighterType(shooter)).sttMemoryS;
}

/** Chaff is only rolled while the missile is this close (m). */
export function chaffRange(m: Missile): number {
  return missileModel(m.type).decoyRangeM;
}

/**
 * Chance one bundle steals the seeker right now (0..1), as missile.ts rolls it: while the seeker tracks
 * you, chaffChance × notch depth (full at zero radial speed, half at the gate edge, nothing at twice the
 * gate); once it has dropped you in the notch, the full chance but only while you stay inside the gate.
 * A seeker already on a chaff cloud rolls nothing more.
 */
export function chaffOdds(world: World, m: Missile | null, me: Aircraft): number {
  if (!m || !seekerOn(m) || !me.alive) return 0;
  const model = missileModel(m.type);
  if (m.pos.distanceTo(me.pos) > model.decoyRangeM) return 0;
  if (m.seekerOn !== null && m.seekerOn !== me.id) return 0;
  const g = seekerGate(world, m, me);
  const depth = m.seekerOn === null ? (g.inGate ? 1 : 0) : g.depth;
  return clamp(model.chaffChance * depth, 0, 1);
}

export type RefKind = 'shooter' | 'missile';
export type RefMode = 'auto' | RefKind;

export interface ThreatRef { kind: RefKind; id: string; pos: Vector3; vel: Vector3 }

/**
 * The threat the maneuver buttons fly against. Auto: the missile once its own seeker is active (ARH after
 * pitbull), otherwise the shooter's radar (it illuminates a SARH shot and feeds an ARH shot until pitbull).
 */
export function threatRef(mode: RefMode, shooter: Aircraft | undefined, m: Missile | null): ThreatRef | null {
  const liveM = m && m.alive ? m : null;
  const liveS = shooter && shooter.alive ? shooter : null;
  let kind: RefKind | null;
  if (mode === 'shooter') kind = liveS ? 'shooter' : liveM ? 'missile' : null;
  else if (mode === 'missile') kind = liveM ? 'missile' : liveS ? 'shooter' : null;
  else kind = liveM && liveM.guidance === 'active' ? 'missile' : liveS ? 'shooter' : liveM ? 'missile' : null;
  if (kind === 'missile' && liveM) return { kind, id: liveM.id, pos: liveM.pos, vel: liveM.vel };
  if (kind === 'shooter' && liveS) return { kind, id: liveS.id, pos: liveS.pos, vel: liveS.vel };
  return null;
}

/** Your aspect as the threat sees you, degrees: 0 hot (nose on it), 90 beam, 180 cold. */
export function aspectDeg(me: Aircraft, threatPos: Vector3): number {
  return (aspectAngle(me.pos, me.vel, threatPos) * 180) / Math.PI;
}
