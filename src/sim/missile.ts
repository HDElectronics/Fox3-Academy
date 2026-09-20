/**
 * [OWNER: sim-physics] Missiles as GAME MECHANICS (see ARCHITECTURE.md "Scope"): an arcade-style model
 * tuned so launch ranges, pitbull timing and defensive outcomes match what DCS players see.
 * Tuning constants live in missileModel.ts.
 *
 * - Movement: the missile's speed-over-time curve (boost, then a density-dependent decay), a turn-rate
 *   cap that shrinks as the missile slows, steering toward a predicted intercept point, and a
 *   climb–cruise–dive loft on long shots for missiles that loft in DCS.
 * - Guidance states follow the game rules in data/missiles.ts:
 *     sarh      homes while the shooter illuminates (STT); 1 s grace, then ballistic ("lost-guidance").
 *     datalink  ARH midcourse on the shooter's track updates.
 *     inertial  ARH midcourse without updates: flies to the extrapolated point.
 *     active    ARH seeker on (pitbull): picks what is in its cone near the aim point.
 *     ir        homes on its locked target.
 *     ballistic nothing.
 * - Defences as the game plays them: the Doppler notch (math.inDopplerNotch from the missile position)
 *   blinds active/semi-active seekers; chaff near a notching/beaming target can steal the seeker;
 *   flares can steal an IR seeker; running the missile out of energy; leaving its view.
 * - Emits pitbull / datalink-lost / seeker-lost / hit / miss events; calls world.kill() on a hit.
 * Deterministic: only world.rand() is used. No allocations per tick (module-level temp vectors).
 */
import { Vector3 } from 'three';
import type { GuidanceSupport, World } from './world';
import type { Aircraft, Countermeasure, EntityId, Missile, MissReason, PhoenixLaunchMode } from './types';
import type { MissileId } from '../data/types';
import { MISSILES } from '../data/missiles';
import { guidanceSupport } from './radar';
import { G0, M_PER_NM, clamp, inDopplerNotch, isLookDown, radialSpeedVsGround } from './math';
import { sigma, soundSpeed } from './atmosphere';
import { decayFactor, missileModel, type MissileModel } from './missileModel';

/** Private per-missile state (not part of the shared Missile contract). */
interface Memo {
  model: MissileModel;
  /** SARH: seconds without illumination. */
  grace: number;
  dlLostSent: boolean;
  /** Why the seeker is not on the intended target right now (null = it is, or never was). */
  lostReason: MissReason | null;
  /** Aircraft the seeker lost (notch / gimbal): it may come back to it. */
  lostTargetId: EntityId | null;
  /** Seeker memory: last known position / velocity of what it tracked (extrapolated when blind). */
  memPos: Vector3;
  memVel: Vector3;
  /** Countermeasures already rolled against (one roll per decoy per missile). */
  rolled: Set<EntityId>;
  /** Pass / energy bookkeeping against the current guide point. */
  guideKey: string;
  prevRange: number;
  wasClosing: boolean;
  openingFor: number;
  loftActive: boolean;
  loftClimb: number;
  /** Height the loft may gain (m). */
  loftGain: number;
  launchAlt: number;
  pitbullPending: boolean;
  /** Seconds the tracked target has sat in the notch (seeker memory). */
  notchT: number;
  /** The decoy the seeker locked has burnt out / dispersed. */
  decoyGone: boolean;
  /** Last lateral acceleration used (m/s²). */
  aLat: number;
  speed: number;
  dir: Vector3;
}

const memos = new WeakMap<Missile, Memo>();

const NO_SUPPORT: GuidanceSupport = { datalink: false, illuminating: false, estimate: null };
/** SARH: seconds without any lock (not counting the radar's STT memory) before the missile goes dumb. */
const SARH_GRACE_S = 1.5;
const KINEMATIC_OPENING_S = 2;
const CLOSE_GATE_M = 8000;

// Scratch vectors (no per-tick allocation).
const _gp = new Vector3();
const _gv = new Vector3();
const _pip = new Vector3();
const _des = new Vector3();
const _tmp = new Vector3();
const _tmp2 = new Vector3();
const _p0 = new Vector3();

function isRadarSeeker(m: Missile): boolean {
  return MISSILES[m.type].seeker !== 'ir';
}

function makeMemo(world: World, m: Missile): Memo {
  const model = missileModel(m.type);
  const speed = m.vel.length();
  const dir = speed > 1 ? m.vel.clone().divideScalar(speed) : new Vector3(0, 0, -1);
  return {
    model, grace: 0, dlLostSent: false, lostReason: null, lostTargetId: null,
    memPos: m.aimPos.clone(), memVel: m.aimVel.clone(), rolled: new Set(),
    guideKey: '', prevRange: Infinity, wasClosing: false, openingFor: 0,
    loftActive: false, loftClimb: 0, loftGain: 0, launchAlt: m.pos.y, pitbullPending: false,
    notchT: 0, decoyGone: false, aLat: 0, speed: Math.max(speed, 50), dir,
  };
}

function memoOf(world: World, m: Missile): Memo {
  let memo = memos.get(m);
  if (!memo) { memo = makeMemo(world, m); memos.set(m, memo); }
  return memo;
}

/** Seconds of flight so far. */
function flightTime(world: World, m: Missile): number {
  return world.t - m.launchedAt;
}

/**
 * Time for a missile at `from` flying `speed` to meet a body at `pos` moving with `vel` (constant-velocity
 * lead). Falls back to range / speed when there is no solution (target too fast).
 */
function interceptTime(from: Vector3, pos: Vector3, vel: Vector3, speed: number): number {
  const rx = pos.x - from.x, ry = pos.y - from.y, rz = pos.z - from.z;
  const c = rx * rx + ry * ry + rz * rz;
  const b = 2 * (rx * vel.x + ry * vel.y + rz * vel.z);
  const a = vel.x * vel.x + vel.y * vel.y + vel.z * vel.z - speed * speed;
  const range = Math.sqrt(c);
  let t = -1;
  if (Math.abs(a) < 1e-6) {
    if (b < 0) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a), t2 = (-b + sq) / (2 * a);
      const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
      t = lo > 0 ? lo : hi > 0 ? hi : -1;
    }
  }
  if (!(t > 0) || t > 600) t = range / Math.max(speed, 1);
  return t;
}

/** Average speed the missile will have over the rest of the flight (for lead). Continuous through burnout. */
function effectiveSpeed(m: Missile, memo: Memo): number {
  const v = memo.speed;
  const model = memo.model;
  if (m.motorLeft > 0) {
    const burnt = 1 - m.motorLeft / model.burnS;
    return Math.max(100, Math.min(model.peakSpeedRef, v + 0.6 * model.boostAccel * m.motorLeft) * (1 - 0.07 * burnt));
  }
  return Math.max(100, v * 0.93);
}

function findCm(world: World, id: EntityId): Countermeasure | undefined {
  for (const c of world.countermeasures) if (c.id === id) return c;
  return undefined;
}

/** Half-angle between the missile→a and missile→b lines (rad). */
function angleBetween(from: Vector3, a: Vector3, b: Vector3): number {
  const ax = a.x - from.x, ay = a.y - from.y, az = a.z - from.z;
  const bx = b.x - from.x, by = b.y - from.y, bz = b.z - from.z;
  const la = Math.hypot(ax, ay, az) || 1, lb = Math.hypot(bx, by, bz) || 1;
  return Math.acos(clamp((ax * bx + ay * by + az * bz) / (la * lb), -1, 1));
}

/** Off-boresight angle of a point from the missile's velocity (rad). */
function offBoresight(memo: Memo, from: Vector3, p: Vector3): number {
  const x = p.x - from.x, y = p.y - from.y, z = p.z - from.z;
  const l = Math.hypot(x, y, z) || 1;
  return Math.acos(clamp((x * memo.dir.x + y * memo.dir.y + z * memo.dir.z) / l, -1, 1));
}

/**
 * Notch gate for this seeker against this target (0 = not a Doppler seeker). Full width with ground behind
 * the target (look-down), narrower in look-up, and narrower again inside 8 km (DCS 2.7.14: "AMRAAMs were
 * too easy to notch inside pitbull range", improved range gate).
 */
function notchGate(world: World, m: Missile, memo: Memo, ac: Aircraft): number {
  if (!isRadarSeeker(m)) return 0;
  const lookDown = isLookDown(m.pos, ac.pos, world.groundAlt);
  const close = clamp(0.5 + 0.5 * m.pos.distanceTo(ac.pos) / CLOSE_GATE_M, 0.5, 1);
  return memo.model.notchMps * (lookDown ? 1 : memo.model.lookUpNotchFactor) * close;
}

/** Result of the last notchDepth() call (kept in module scope: no allocation per tick). */
const notch = { inNotch: false, depth: 0 };

/**
 * Is the target inside this seeker's Doppler notch, seen from the missile (math.inDopplerNotch), and how
 * deep: 0..1, 1 = zero radial speed, 0.5 = at the gate edge, 0 = twice the gate or more.
 */
function notchDepth(world: World, m: Missile, memo: Memo, ac: Aircraft): typeof notch {
  const gate = notchGate(world, m, memo, ac);
  if (gate <= 0) { notch.inNotch = false; notch.depth = 0; return notch; }
  notch.inNotch = inDopplerNotch(m.pos, ac.pos, ac.vel, gate, false, world.groundAlt);
  notch.depth = clamp(1 - radialSpeedVsGround(m.pos, ac.pos, ac.vel) / (2 * gate), 0, 1);
  return notch;
}

function emitSeekerLost(world: World, m: Missile, why: MissReason): void {
  world.emit({ t: world.t, type: 'seeker-lost', missileId: m.id, why });
}

/** Lock the seeker onto a decoy. */
function takeDecoy(world: World, m: Missile, memo: Memo, cm: Countermeasure): void {
  m.seekerOn = cm.id;
  memo.lostReason = cm.kind === 'chaff' ? 'chaff' : 'flare';
  memo.memPos.copy(cm.pos);
  memo.memVel.copy(cm.vel);
  emitSeekerLost(world, m, memo.lostReason);
}

/**
 * Decoy rolls against the thing the seeker is looking at (`center`). Radar seekers: chaff, with a chance of
 * chaffSusceptibility × notch depth. IR seekers: flares. Each decoy is rolled once per missile.
 */
function rollDecoys(world: World, m: Missile, memo: Memo, center: Vector3, depth: number, afterburner: boolean): boolean {
  const radar = isRadarSeeker(m);
  const kind = radar ? 'chaff' : 'flare';
  const base = radar ? memo.model.chaffChance * depth : memo.model.flareChance * (afterburner ? 0.6 : 1);
  if (base <= 0 || m.pos.distanceTo(center) > memo.model.decoyRangeM) return false;
  for (const c of world.countermeasures) {
    if (c.kind !== kind || memo.rolled.has(c.id)) continue;
    if (c.pos.distanceTo(center) > memo.model.decoyGateM) continue;
    if (angleBetween(m.pos, center, c.pos) > memo.model.decoyConeRad) continue;
    memo.rolled.add(c.id);
    if (world.rand() < base) { takeDecoy(world, m, memo, c); return true; }
  }
  return false;
}

/**
 * Seeker search around a point (pitbull or re-acquisition): the aircraft closest to `center` inside the
 * acquisition cone and seeker range, not hidden in the notch; chaff there too, if the roll says so.
 */
function acquire(world: World, m: Missile, memo: Memo, center: Vector3): Aircraft | Countermeasure | null {
  const model = memo.model;
  let best: Aircraft | null = null, bestScore = Infinity;
  for (const ac of world.aircraft.values()) {
    if (!ac.alive || ac.id === m.shooterId) continue;
    const d = m.pos.distanceTo(ac.pos);
    if (d > model.seekerRangeM) continue;
    if (angleBetween(m.pos, center, ac.pos) > model.acqConeRad) continue;
    if (offBoresight(memo, m.pos, ac.pos) > model.gimbalRad) continue;
    if (notchDepth(world, m, memo, ac).inNotch) {
      // there, but hidden in the notch: it may show up again when it turns out of the beam
      if (ac.id === (memo.lostTargetId ?? m.targetId)) { memo.lostTargetId = ac.id; memo.lostReason = 'notched'; }
      continue;
    }
    const score = ac.pos.distanceTo(center);
    if (score < bestScore) { bestScore = score; best = ac; }
  }
  if (best) return best;
  // Nothing visible: a chaff cloud in the cone can be taken for the target.
  if (isRadarSeeker(m) && model.chaffChance > 0) {
    for (const c of world.countermeasures) {
      if (c.kind !== 'chaff' || memo.rolled.has(c.id)) continue;
      if (m.pos.distanceTo(c.pos) > model.seekerRangeM) continue;
      if (angleBetween(m.pos, center, c.pos) > model.acqConeRad) continue;
      if (c.pos.distanceTo(center) > Math.max(2000, model.decoyGateM * 2)) continue;
      if (m.pos.distanceTo(c.pos) > model.decoyRangeM) continue;
      memo.rolled.add(c.id);
      if (world.rand() < model.chaffChance) return c;
    }
  }
  return null;
}

/** Switch an ARH missile to its own seeker. */
function goActive(world: World, m: Missile, memo: Memo, emit: boolean): void {
  m.guidance = 'active';
  m.lofting = false;
  memo.loftActive = false;
  memo.memPos.copy(m.aimPos);
  memo.memVel.copy(m.aimVel);
  const found = acquire(world, m, memo, m.aimPos);
  if (found && found.kind === 'aircraft') {
    m.seekerOn = found.id;
    memo.lostReason = null;
    memo.memPos.copy(found.pos);
    memo.memVel.copy(found.vel);
  } else if (found) {
    takeDecoy(world, m, memo, found);
  } else {
    m.seekerOn = null;
  }
  if (emit) {
    const on = found && found.kind === 'aircraft' ? found.id : m.targetId;
    world.emit({ t: world.t, type: 'pitbull', missileId: m.id, targetId: on });
  }
}

/**
 * Seeker update for homing states (sarh / active / ir). Sets _gp/_gv to the point to steer at.
 * Returns false when there is nothing to steer at.
 */
function updateSeeker(world: World, m: Missile, memo: Memo, dt: number, blind: boolean): boolean {
  const model = memo.model;
  // Tracking a decoy: follow it. When it has burnt out / dispersed the missile has nothing left: the
  // caller ends the flight (decoyGone).
  if (m.seekerOn && !world.aircraft.has(m.seekerOn)) {
    const cm = findCm(world, m.seekerOn);
    if (cm) { memo.memPos.copy(cm.pos); memo.memVel.copy(cm.vel); }
    else { memo.memPos.addScaledVector(memo.memVel, dt); memo.decoyGone = true; }
    _gp.copy(memo.memPos); _gv.copy(memo.memVel);
    return true;
  }
  const ac = m.seekerOn ? world.aircraft.get(m.seekerOn) : undefined;
  if (ac && ac.alive) {
    if (blind) {
      // SARH without illumination (grace): fly on memory.
      memo.memPos.addScaledVector(memo.memVel, dt);
      _gp.copy(memo.memPos); _gv.copy(memo.memVel);
      return true;
    }
    const n = notchDepth(world, m, memo, ac);
    memo.notchT = n.inNotch ? memo.notchT + dt : Math.max(0, memo.notchT - 2 * dt);
    if (n.inNotch && memo.notchT >= model.notchHoldS) {
      memo.notchT = 0;
      m.seekerOn = null;
      memo.lostTargetId = ac.id;
      memo.lostReason = 'notched';
      memo.memPos.copy(ac.pos); memo.memVel.copy(ac.vel);
      emitSeekerLost(world, m, 'notched');
    } else if (offBoresight(memo, m.pos, ac.pos) > model.gimbalRad && flightTime(world, m) > 1) {
      m.seekerOn = null;
      memo.lostTargetId = ac.id;
      memo.lostReason = 'overshoot';
      memo.memPos.copy(ac.pos); memo.memVel.copy(ac.vel);
    } else {
      memo.memPos.copy(ac.pos); memo.memVel.copy(ac.vel);
      // Beaming targets are close to the notch: chaff dropped there can steal the seeker.
      const decoyed = n.depth > 0 || !isRadarSeeker(m)
        ? rollDecoys(world, m, memo, ac.pos, n.depth, ac.cmd.afterburner)
        : false;
      if (!decoyed) { _gp.copy(ac.pos); _gv.copy(ac.vel); return true; }
      _gp.copy(memo.memPos); _gv.copy(memo.memVel);
      return true;
    }
  }
  // Blind (notched, out of view, or never acquired): fly on memory and keep looking.
  memo.memPos.addScaledVector(memo.memVel, dt);
  if (!blind) {
    const lost = memo.lostTargetId ? world.aircraft.get(memo.lostTargetId) : undefined;
    if (lost && lost.alive && memo.lostReason === 'notched') {
      // Still in the notch: chaff there looks just like the target.
      const n = notchDepth(world, m, memo, lost);
      if (n.inNotch && rollDecoys(world, m, memo, lost.pos, 1, false)) {
        _gp.copy(memo.memPos); _gv.copy(memo.memVel);
        return true;
      }
    }
    if (m.guidance === 'active' || m.guidance === 'sarh' || m.guidance === 'ir') {
      // ARH (and a boresight IR shot with no target) take what they find; locked SARH / IR only their own target
      const found = m.guidance === 'active' || !m.targetId ? acquire(world, m, memo, memo.memPos) : reacquireOwn(world, m, memo);
      if (found && found.kind === 'aircraft') {
        m.seekerOn = found.id;
        memo.lostReason = null;
        memo.lostTargetId = null;
        memo.memPos.copy(found.pos); memo.memVel.copy(found.vel);
      } else if (found) {
        takeDecoy(world, m, memo, found);
      }
    }
  }
  _gp.copy(memo.memPos); _gv.copy(memo.memVel);
  return true;
}

/** SARH / IR: they can only come back to the target they were locked on. */
function reacquireOwn(world: World, m: Missile, memo: Memo): Aircraft | null {
  const id = memo.lostTargetId ?? m.targetId;
  const ac = id ? world.aircraft.get(id) : undefined;
  if (!ac || !ac.alive) return null;
  if (angleBetween(m.pos, memo.memPos, ac.pos) > memo.model.acqConeRad) return null;
  if (offBoresight(memo, m.pos, ac.pos) > memo.model.gimbalRad) return null;
  if (notchDepth(world, m, memo, ac).inNotch) return null;
  return ac;
}

/** Loft height gain: full from 10 km up, much less from low altitude (ED's low-level ranges stay short). */
function loftGain(maxGainM: number, launchAlt: number): number {
  return maxGainM * clamp(Math.pow(Math.max(0, launchAlt) / 10000, 1.5), 0.1, 1);
}

/** Final miss reason: the defence that beat the seeker if there was one, else `fallback`. */
function reasonOr(memo: Memo, fallback: MissReason): MissReason {
  return memo.lostReason ?? fallback;
}

function finish(world: World, m: Missile, kind: 'hit' | 'miss', reason: MissReason | 'hit'): void {
  m.alive = false;
  m.result = { kind, reason, t: world.t };
  m.timeToImpact = null;
  m.timeToActive = null;
  m.lofting = false;
  if (kind === 'miss') world.emit({ t: world.t, type: 'miss', missileId: m.id, reason: reason as MissReason });
}

/** Closest distance between the missile and a body over the last step (swept test). */
function sweptDistance(p0: Vector3, p1: Vector3, q1: Vector3, qVel: Vector3, dt: number): number {
  // relative motion r(s) = (p0 - q0) + ((p1 - p0) - qVel·dt)·s, s ∈ [0, 1]
  const q0x = q1.x - qVel.x * dt, q0y = q1.y - qVel.y * dt, q0z = q1.z - qVel.z * dt;
  const rx = p0.x - q0x, ry = p0.y - q0y, rz = p0.z - q0z;
  const vx = (p1.x - p0.x) - qVel.x * dt, vy = (p1.y - p0.y) - qVel.y * dt, vz = (p1.z - p0.z) - qVel.z * dt;
  const vv = vx * vx + vy * vy + vz * vz;
  const s = vv > 1e-9 ? clamp(-(rx * vx + ry * vy + rz * vz) / vv, 0, 1) : 0;
  return Math.hypot(rx + vx * s, ry + vy * s, rz + vz * s);
}

export interface CreateMissileOptions {
  /** false: no loft on this shot even if the missile lofts in DCS (Missile Lab what-if). Default: the missile's rule. */
  loft?: boolean;
  /** Standalone lab launch selection. World launches read the shooter's radar selection. */
  phoenixLaunchMode?: PhoenixLaunchMode;
}

export function createMissile(world: World, shooter: Aircraft, type: MissileId, targetId: EntityId | null, opts: CreateMissileOptions = {}): Missile {
  const spec = MISSILES[type];
  const model = missileModel(type);
  const target = world.get(targetId);
  const tgt = target && target.alive ? target : undefined;
  const phoenix = type === 'aim54a' || type === 'aim54c';
  // PH ACT is an armament selection. P-STT only applies while actually locked; ignore stale STT choices.
  const selected = opts.phoenixLaunchMode ?? (shooter.radar.phoenixLaunchMode === 'ph-act' ? 'ph-act'
    : shooter.radar.mode === 'stt' ? (shooter.radar.phoenixLaunchMode === 'p-stt' ? 'p-stt' : 'pd-stt') : 'tws');
  const phoenixMode = phoenix ? selected : undefined;
  const closePhoenix = !!tgt && shooter.pos.distanceTo(tgt.pos) < 10 * M_PER_NM;
  const phoenixActive = phoenix && (closePhoenix || selected === 'p-stt' || selected === 'ph-act');
  const phoenixSarh = phoenix && !phoenixActive && selected === 'pd-stt';
  const m: Missile = {
    kind: 'missile', id: world.uid('M'), type, side: shooter.side, shooterId: shooter.id, targetId: tgt ? tgt.id : targetId,
    pos: shooter.pos.clone(), vel: shooter.vel.clone(), launchedAt: world.t, alive: true,
    launchRadarMode: shooter.radar.mode, phoenixLaunchMode: phoenixMode,
    guidance: spec.seeker === 'sarh' || phoenixSarh ? 'sarh' : spec.seeker === 'ir' ? 'ir' : spec.midcourse === 'inertial' ? 'inertial' : 'datalink',
    aimPos: tgt ? tgt.pos.clone() : shooter.pos.clone(), aimVel: tgt ? tgt.vel.clone() : new Vector3(),
    seekerOn: null, motorLeft: model.burnS, mass: spec.massKg, lofting: false,
    timeToActive: null, timeToImpact: null, result: null, closestApproach: Infinity,
  };
  const memo = makeMemo(world, m);
  memos.set(m, memo);
  if (!tgt) {
    // No target: an ARH comes off the rail active (maddog) and searches ahead; others fly dumb.
    memo.memPos.copy(m.pos).addScaledVector(memo.dir, 20000);
    memo.memVel.set(0, 0, 0);
    m.aimPos.copy(memo.memPos);
    if (spec.seeker === 'arh') { m.guidance = 'active'; memo.pitbullPending = true; }
    else if (spec.seeker === 'sarh') m.guidance = 'ballistic';
    return m;
  }
  const range = m.pos.distanceTo(tgt.pos);
  if (m.guidance === 'sarh' || spec.seeker === 'ir') m.seekerOn = tgt.id;
  if (spec.seeker === 'arh' && (phoenix ? phoenixActive : range <= model.pitbullM)) {
    // Inside pitbull distance: active off the rail.
    goActive(world, m, memo, false);
    memo.pitbullPending = true;
  } else if (spec.seeker === 'arh' && !phoenixSarh) {
    m.timeToActive = Math.max(0, (range - model.pitbullM) / Math.max(200, effectiveSpeed(m, memo)));
  }
  const loft = model.loft;
  if (loft && opts.loft !== false && range > loft.minRangeM && m.guidance !== 'active') {
    // longer shots loft steeper and higher
    const k = clamp((range - loft.minRangeM) / Math.max(1, loft.fullRangeM - loft.minRangeM), 0.1, 1);
    memo.loftActive = true;
    memo.loftClimb = loft.climbDeg * k * Math.PI / 180;
    memo.loftGain = loftGain(loft.maxGainM * k, m.pos.y);
    m.lofting = true;
  }
  return m;
}

export function stepMissile(world: World, m: Missile, dt: number): void {
  if (!m.alive || dt <= 0) return;
  const memo = memoOf(world, m);
  const model = memo.model;
  const tFlight = flightTime(world, m);
  const target = m.targetId ? world.aircraft.get(m.targetId) : undefined;

  if (memo.pitbullPending) {
    memo.pitbullPending = false;
    const on = m.seekerOn && world.aircraft.has(m.seekerOn) ? m.seekerOn : m.targetId;
    world.emit({ t: world.t, type: 'pitbull', missileId: m.id, targetId: on });
  }

  // ---- 1. guidance state -------------------------------------------------------------------------
  let hasGuide = false;
  switch (m.guidance) {
    case 'sarh': {
      const sup = support(world, m);
      // The radar's STT memory (lock degraded, not broken) keeps the missile flying on its memory without
      // using up the grace; once the lock is gone a quick relock still saves the shot (research: "if the
      // lock is lost briefly and regained quickly the missile continues").
      if (sup.illuminating) memo.grace = 0;
      else if (!radarMemory(world, m)) memo.grace += dt;
      if (memo.grace > SARH_GRACE_S) {
        m.guidance = 'ballistic';
        m.seekerOn = null;
        memo.lostReason = 'lost-guidance';
        emitSeekerLost(world, m, 'lost-guidance');
      } else {
        hasGuide = updateSeeker(world, m, memo, dt, !sup.illuminating);
      }
      break;
    }
    case 'datalink':
    case 'inertial': {
      const spec = MISSILES[m.type];
      const sup = spec.midcourse === 'datalink' ? support(world, m) : NO_SUPPORT;
      if (sup.datalink && sup.estimate) {
        m.guidance = 'datalink';
        m.aimPos.copy(sup.estimate.pos);
        m.aimVel.copy(sup.estimate.vel);
      } else {
        if (m.guidance === 'datalink' && spec.midcourse === 'datalink' && !memo.dlLostSent) {
          memo.dlLostSent = true;
          const shooter = world.aircraft.get(m.shooterId);
          const why = !shooter || !shooter.alive ? 'shooter destroyed' : 'shooter lost the track';
          world.emit({ t: world.t, type: 'datalink-lost', missileId: m.id, why });
        }
        m.guidance = 'inertial';
        m.aimPos.addScaledVector(m.aimVel, dt);
      }
      if (m.pos.distanceTo(m.aimPos) <= model.pitbullM) {
        goActive(world, m, memo, true);
        hasGuide = updateSeeker(world, m, memo, 0, false);
      } else {
        _gp.copy(m.aimPos); _gv.copy(m.aimVel);
        hasGuide = true;
      }
      break;
    }
    case 'active':
    case 'ir':
      hasGuide = updateSeeker(world, m, memo, dt, false);
      break;
    case 'ballistic':
      hasGuide = false;
      break;
  }
  if (hasGuide && (m.guidance === 'active' || m.guidance === 'sarh' || m.guidance === 'ir')) {
    m.aimPos.copy(_gp); m.aimVel.copy(_gv);
  }

  // ---- 2. steering ---------------------------------------------------------------------------------
  const v = memo.speed;
  const alt = m.pos.y;
  const sg = sigma(Math.max(0, alt));
  const aMax = model.maxG * G0 * Math.min(1, (sg * v * v) / model.fullGSigmaV2);
  let tgo: number | null = null;
  _p0.copy(m.pos);
  if (hasGuide) {
    const vEff = effectiveSpeed(m, memo);
    tgo = interceptTime(m.pos, _gp, _gv, vEff);
    _pip.copy(_gp).addScaledVector(_gv, tgo);
    _des.copy(_pip).sub(m.pos);
    if (memo.loftActive) {
      const loft = model.loft;
      const hd = Math.hypot(_des.x, _des.z) || 1;
      const depression = Math.atan2(-_des.y, hd);
      const gained = m.pos.y - memo.launchAlt;
      if (!loft || depression >= loft.diveDeg * Math.PI / 180 || m.guidance === 'active' || hd < 8000) {
        memo.loftActive = false;
        m.lofting = false;
      } else {
        // climb, then cruise level once the height gain is used up
        const g = gained < memo.loftGain && m.pos.y < 24000 ? memo.loftClimb : 0;
        _des.set(_des.x / hd * Math.cos(g), Math.sin(g), _des.z / hd * Math.cos(g));
      }
    }
    const dl = _des.length();
    if (dl > 1e-6) _des.divideScalar(dl); else _des.copy(memo.dir);
    // rotate the velocity direction toward the desired one, within the turn-rate cap
    const cosA = clamp(memo.dir.dot(_des), -1, 1);
    const ang = Math.acos(cosA);
    const rate = Math.min(aMax / Math.max(v, 1), ang * model.steerGain);
    const step = rate * dt;
    if (ang < 1e-6 || step >= ang) {
      memo.dir.copy(_des);
      memo.aLat = ang > 1e-6 ? Math.min(aMax, (ang / dt) * v) : 0;
    } else {
      // u = component of _des perpendicular to dir
      _tmp.copy(_des).addScaledVector(memo.dir, -cosA).normalize();
      memo.dir.multiplyScalar(Math.cos(step)).addScaledVector(_tmp, Math.sin(step)).normalize();
      memo.aLat = rate * v;
    }
  } else {
    memo.aLat = 0;
  }

  // ---- 3. speed curve ------------------------------------------------------------------------------
  let thrust = 0;
  if (m.motorLeft > 0) {
    const burn = Math.min(dt, m.motorLeft);
    thrust = model.boostAccel * (burn / dt);
    m.motorLeft = Math.max(0, m.motorLeft - dt);
  }
  const bleed = model.turnBleedK * memo.aLat * memo.aLat / Math.max(sg * v * v, 2000);
  const K = decayFactor(model, alt);
  if (hasGuide) {
    let nv = (v + (thrust - bleed - G0 * memo.dir.y) * dt) / (1 + K * v * dt);
    nv = Math.min(nv, model.maxSpeedMach * soundSpeed(Math.max(0, alt)));
    memo.speed = Math.max(0, nv);
    m.vel.copy(memo.dir).multiplyScalar(memo.speed);
  } else {
    // ballistic: gravity bends the path down
    m.vel.copy(memo.dir).multiplyScalar(v);
    m.vel.addScaledVector(memo.dir, thrust * dt);
    m.vel.y -= G0 * dt;
    const s = m.vel.length();
    const nv = s / (1 + K * s * dt);
    memo.speed = nv;
    if (s > 1e-6) memo.dir.copy(m.vel).divideScalar(s);
    m.vel.copy(memo.dir).multiplyScalar(nv);
  }
  const burned = model.burnS > 0 ? 1 - m.motorLeft / model.burnS : 1;
  m.mass = MISSILES[m.type].massKg * (1 - 0.35 * burned);

  // ---- 4. move and fuze ------------------------------------------------------------------------------
  m.pos.addScaledVector(m.vel, dt);
  if (target) {
    const d = sweptDistance(_p0, m.pos, target.pos, target.vel, dt);
    if (d < m.closestApproach) m.closestApproach = d;
  }
  if (tFlight + dt >= model.armTimeS) {
    for (const ac of world.aircraft.values()) {
      if (!ac.alive || ac.id === m.shooterId) continue;
      const dx = ac.pos.x - m.pos.x, dy = ac.pos.y - m.pos.y, dz = ac.pos.z - m.pos.z;
      const reach = (memo.speed + ac.vel.length()) * dt + model.hitRadiusM + 5;
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      if (sweptDistance(_p0, m.pos, ac.pos, ac.vel, dt) <= model.hitRadiusM) {
        world.kill(ac.id, m.shooterId);
        finish(world, m, 'hit', 'hit');
        world.emit({ t: world.t, type: 'hit', missileId: m.id, targetId: ac.id });
        return;
      }
    }
  }

  // ---- 5. end of flight -----------------------------------------------------------------------------
  const tNow = tFlight + dt;
  const seekerAc = m.seekerOn ? world.aircraft.get(m.seekerOn) : undefined;
  if (target && !target.alive && !(seekerAc && seekerAc.alive && seekerAc.id !== target.id)) {
    finish(world, m, 'miss', 'target-dead'); return;
  }
  if (m.pos.y <= world.groundAlt) { finish(world, m, 'miss', reasonOr(memo, 'ground')); return; }
  if (tNow >= model.maxTimeS) { finish(world, m, 'miss', reasonOr(memo, 'timeout')); return; }
  if (m.motorLeft <= 0 && memo.speed < model.minSpeed) { finish(world, m, 'miss', reasonOr(memo, 'kinematic')); return; }
  if (memo.decoyGone) { finish(world, m, 'miss', reasonOr(memo, 'chaff')); return; }

  // Pass / energy checks against what the missile is flying at (or the intended target when dumb).
  let ref: Vector3 | null = null;
  let key = '';
  if (hasGuide) { ref = _pip.copy(_gp); key = m.seekerOn ?? m.guidance; }
  else if (target && target.alive) { ref = target.pos; key = 'tgt'; }
  if (ref) {
    if (key !== memo.guideKey) { memo.guideKey = key; memo.prevRange = Infinity; memo.wasClosing = false; memo.openingFor = 0; }
    const rng = m.pos.distanceTo(ref);
    const closing = rng < memo.prevRange;
    _tmp2.copy(ref).sub(m.pos);
    const ahead = _tmp2.dot(memo.dir) > 0;
    if (memo.wasClosing && !closing && !ahead && tNow > model.armTimeS) {
      let why: MissReason;
      if (m.guidance === 'ballistic') why = reasonOr(memo, 'lost-guidance');
      else if (m.guidance === 'datalink' || m.guidance === 'inertial') why = reasonOr(memo, 'no-acquisition');
      else if (m.seekerOn && seekerAc) why = 'overshoot';
      else if (m.seekerOn) why = reasonOr(memo, 'chaff');
      else why = reasonOr(memo, m.guidance === 'active' ? 'no-acquisition' : 'overshoot');
      finish(world, m, 'miss', why); return;
    }
    // Chasing something that runs away faster than the missile flies: out of energy.
    if (!closing && ahead && m.motorLeft <= 0 && !memo.loftActive) {
      memo.openingFor += dt;
      if (memo.openingFor >= KINEMATIC_OPENING_S) { finish(world, m, 'miss', reasonOr(memo, 'kinematic')); return; }
    } else if (closing) {
      memo.openingFor = 0;
    }
    if (closing) memo.wasClosing = true;
    memo.prevRange = rng;
  }

  // ---- 6. display estimates -------------------------------------------------------------------------
  if (hasGuide && tgo !== null) {
    m.timeToImpact = Math.max(0, tgo);
    if (m.guidance === 'datalink' || m.guidance === 'inertial') {
      // the gap to the aim point closes at about (gap / time-to-go) on the way to the intercept
      const dAim = m.pos.distanceTo(m.aimPos);
      m.timeToActive = dAim > model.pitbullM ? Math.max(0, tgo * (1 - model.pitbullM / dAim)) : 0;
    } else {
      m.timeToActive = null;
    }
  } else {
    m.timeToImpact = null;
    m.timeToActive = null;
  }
}

/**
 * The shooter's STT on this missile's target is in memory (degraded: notch, gimbal, range) but not broken.
 * Only asked when the support says "not illuminating"; a supportOverride that says so is taken at its word.
 */
function radarMemory(world: World, m: Missile): boolean {
  if (world.supportOverride?.(m)) return false;
  const shooter = world.aircraft.get(m.shooterId);
  if (!shooter || !shooter.alive || !m.targetId) return false;
  const st = shooter.radar;
  return st.mode === 'stt' && st.stt.targetId === m.targetId && st.stt.lostFor > 0;
}

/** Guidance support from the shooter, or the World's override (DLZ sims, tests). */
function support(world: World, m: Missile): GuidanceSupport {
  const o = world.supportOverride?.(m);
  if (o) return o;
  const shooter = world.aircraft.get(m.shooterId);
  if (!shooter || !shooter.alive) return NO_SUPPORT;
  return guidanceSupport(world, shooter, m.targetId);
}

/** The seeker's Doppler notch against one aircraft, for displays and coaching (see notchState). */
export interface NotchState {
  /** The aircraft the seeker is (or was, before the notch) tracking. */
  targetId: EntityId;
  /** Notch gate (m/s radial speed vs the ground) for this geometry: narrower in look-up and close in. */
  gateMps: number;
  /** The aircraft's radial speed vs the ground, seen from the missile (m/s, ≥ 0). */
  radialMps: number;
  lookDown: boolean;
  inNotch: boolean;
  /** 0..1: 1 = zero radial speed, 0.5 = at the gate edge (chaff works in proportion). */
  depth: number;
  /** Seconds the target has been held in the notch so far, and how long it takes to break the seeker. */
  heldS: number;
  holdS: number;
  /** The seeker has lost the target in the notch (it may reacquire it when it leaves the beam). */
  lost: boolean;
}

/**
 * Read-only view of a radar-guided missile's notch state (null for IR missiles, dead missiles, or no
 * aircraft to track). Use it instead of mirroring missile.ts internals; it never changes the missile.
 */
export function notchState(world: World, m: Missile): NotchState | null {
  if (!m.alive || !isRadarSeeker(m)) return null;
  const memo = memoOf(world, m);
  const seeker = m.seekerOn ? world.aircraft.get(m.seekerOn) : undefined;
  const lostId = memo.lostReason === 'notched' ? memo.lostTargetId : null;
  const ac = seeker ?? world.get(lostId) ?? world.get(m.targetId);
  if (!ac || !ac.alive) return null;
  const gate = notchGate(world, m, memo, ac);
  const n = notchDepth(world, m, memo, ac);
  return {
    targetId: ac.id, gateMps: gate, radialMps: radialSpeedVsGround(m.pos, ac.pos, ac.vel),
    lookDown: isLookDown(m.pos, ac.pos, world.groundAlt), inNotch: n.inNotch, depth: n.depth,
    heldS: seeker ? memo.notchT : 0, holdS: memo.model.notchHoldS, lost: !seeker && lostId === ac.id,
  };
}

/** Current speed of a missile (m/s) and its Mach number — handy for displays. */
export function missileSpeed(m: Missile): { speed: number; mach: number } {
  const s = m.vel.length();
  return { speed: s, mach: s / soundSpeed(Math.max(0, m.pos.y)) };
}
