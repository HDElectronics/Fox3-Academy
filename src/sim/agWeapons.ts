/**
 * Su-25T air-to-ground weapons: launch authorisation (ПР), release, and an arcade flight model.
 * Game level only (AGENTS.md rule 1). The rules are the ones the ED Su-25T Flight Manual (S1) gives the player:
 *  - Vikhr, Kh-25ML, Kh-29L: Shkval lock and laser on to launch, both held to impact or the weapon misses
 *    (a lock lost to the gimbal limit or terrain counts the same).
 *  - Kh-29T, KAB-500Kr: Shkval lock to launch, then fire and forget.
 *  - Rockets, bombs, cannon: ballistic (gravity only), fixed dispersion drawn from world.rand().
 *  - Kh-58: L-081 pod, an emitting radar locked through passive detection; guides while the radar emits.
 * Flight is a speed-over-time curve and a turn-rate cap; hits are a proximity check plus a trainer kill radius.
 * None of these constants is DCS weapon data.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { AgWeaponId } from '../data/types';
import { AG_WEAPONS } from '../data/agWeapons';
import type { AgMissReason, AgWeapon, Aircraft, AttackState, EntityId } from './types';
import { D2R, G0, clamp, dirFrom, relBearing } from './math';
import { cycleAgWeapon, stationsWith } from './attack';
import { damageGround, groundHeight, groundUnitVel } from './ground';

/** Arcade flight constants (trainer values, not DCS data). Speeds are m/s at seconds after launch. */
interface AgModel {
  speed: readonly (readonly [t: number, v: number])[];
  turnRate: number;      // rad/s
  maxTime: number;       // s
  /** Guided weapons: closest approach (m) that counts as a hit on the target. */
  hitRadiusM: number;
  /** Units within this radius of an impact take the damage (m). */
  killRadiusM: number;
  damage: number;        // trainer hit points
  /** Ballistic weapons: 1-sigma aim dispersion (mrad). */
  dispersionMrad: number;
  /** Ballistic weapons: speed added along the boresight at release (m/s): rocket motor, muzzle velocity. */
  boost: number;
}

export const AG_MODEL: Record<AgWeaponId, AgModel> = {
  vikhr:    { speed: [[0, 250], [1.5, 610], [10, 520], [25, 400]], turnRate: 0.6, maxTime: 30, hitRadiusM: 4, killRadiusM: 3, damage: 1, dispersionMrad: 0, boost: 0 },
  kh25ml:   { speed: [[0, 250], [3, 800], [20, 650]], turnRate: 0.4, maxTime: 40, hitRadiusM: 5, killRadiusM: 8, damage: 2, dispersionMrad: 0, boost: 0 },
  kh29l:    { speed: [[0, 250], [3, 650], [25, 550]], turnRate: 0.35, maxTime: 40, hitRadiusM: 5, killRadiusM: 12, damage: 2, dispersionMrad: 0, boost: 0 },
  kh29t:    { speed: [[0, 250], [3, 650], [25, 550]], turnRate: 0.35, maxTime: 45, hitRadiusM: 5, killRadiusM: 12, damage: 2, dispersionMrad: 0, boost: 0 },
  kab500kr: { speed: [[0, 220], [30, 260]], turnRate: 0.25, maxTime: 90, hitRadiusM: 6, killRadiusM: 15, damage: 2, dispersionMrad: 0, boost: 0 },
  kh58:     { speed: [[0, 250], [4, 1100], [60, 850]], turnRate: 0.3, maxTime: 120, hitRadiusM: 8, killRadiusM: 15, damage: 2, dispersionMrad: 0, boost: 0 },
  s8:       { speed: [], turnRate: 0, maxTime: 20, hitRadiusM: 0, killRadiusM: 5, damage: 1, dispersionMrad: 8, boost: 500 },
  s13:      { speed: [], turnRate: 0, maxTime: 20, hitRadiusM: 0, killRadiusM: 8, damage: 1, dispersionMrad: 6, boost: 450 },
  fab250:   { speed: [], turnRate: 0, maxTime: 60, hitRadiusM: 0, killRadiusM: 20, damage: 2, dispersionMrad: 4, boost: 0 },
  gun25t:   { speed: [], turnRate: 0, maxTime: 6, hitRadiusM: 0, killRadiusM: 2, damage: 0.35, dispersionMrad: 4, boost: 900 },
};

/** Rounds per cannon trigger press (one release = one short burst). Trainer value. */
export const GUN_BURST = 10;
/** Kh-58 passive detection zone (S1: a diamond appears when the emitter is inside ±30°). */
export const ARM_ZONE_DEG = 30;

const speedAt = (m: AgModel, t: number): number => {
  const c = m.speed;
  if (t <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i][0]) { const [t0, v0] = c[i - 1], [t1, v1] = c[i]; return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  }
  return c[c.length - 1][1];
};

/** Take one round of `w` off its current station and move to the next station (alternates left / right). */
function takeRound(ag: AttackState, w: AgWeaponId): number | null {
  ag.stores[w] = Math.max(0, (ag.stores[w] ?? 0) - 1);
  if (w === 'gun25t') return null;
  const list = stationsWith(ag, w);
  const cur = list.find(s => s.station === ag.station) ?? list[0];
  if (!cur) return null;
  cur.count--;
  const left = stationsWith(ag, w);
  if (left.length) {
    const next = left.find(s => s.station > cur.station) ?? left[0];
    ag.station = next.station;
  } else {
    ag.station = null;
  }
  return cur.station;
}

// ─────────────────────────────────────────────────────────── Kh-58 passive detection

/** [I]: passive radar detection on / off. Needs the L-081 pod. */
export function setArmDetect(ag: AttackState, on: boolean): { ok: boolean; reason: string } {
  if (on && !ag.pod) return { ok: false, reason: 'No L-081 Fantasmagoria pod on station 6' };
  ag.arm.detecting = on;
  if (!on) ag.arm.emitterId = null;
  return { ok: true, reason: '' };
}

/** Emitting, live SAM sites inside the ±30° detection zone, nearest to the nose first. */
export function armEmitters(world: World, ac: Aircraft): EntityId[] {
  if (!ac.ag?.arm.detecting) return [];
  return [...world.samSites.values()]
    .filter(s => s.alive && s.active && Math.abs(relBearing(ac.pos, ac.heading, s.pos)) <= ARM_ZONE_DEG * D2R)
    .sort((a, b) => Math.abs(relBearing(ac.pos, ac.heading, a.pos)) - Math.abs(relBearing(ac.pos, ac.heading, b.pos)))
    .map(s => s.id);
}

/** [Enter] on a detected emitter: lock it for the Kh-58 (default: the one nearest the nose). */
export function armLock(world: World, ac: Aircraft, siteId?: EntityId): { ok: boolean; reason: string } {
  const ag = ac.ag;
  if (!ag) return { ok: false, reason: 'No air-to-ground system' };
  if (!ag.pod) return { ok: false, reason: 'No L-081 Fantasmagoria pod on station 6' };
  if (!ag.arm.detecting) return { ok: false, reason: 'Passive detection is off [I]' };
  const list = armEmitters(world, ac);
  const id = siteId ?? list[0];
  if (!id || !list.includes(id)) return { ok: false, reason: 'No emitter inside ±30°' };
  ag.arm.emitterId = id;
  return { ok: true, reason: '' };
}

// ─────────────────────────────────────────────────────────── launch authorisation (ПР)

export interface AgLaunchCheck {
  /** Release possible now (guided weapons: only with ПР). */
  ok: boolean;
  /** Launch-authorised cue (ПР) on the IT-23M / HUD. */
  pr: boolean;
  /** Why not, in pilot words. Empty when ПР. */
  reason: string;
  weapon: AgWeaponId | null;
  targetId: EntityId | null;
  /** Slant range to the target or aim point (m). */
  range: number | null;
  /** Gameplay launch band (m), not verified. */
  band: { min: number; max: number } | null;
}

const kmS = (m: number) => `${(m / 1000).toFixed(1)} km`;

/** Target of the selected guided weapon: the Shkval lock, or the Kh-58 emitter. */
function guidedTarget(world: World, ac: Aircraft, w: AgWeaponId): { id: EntityId; pos: Vector3 } | null {
  const ag = ac.ag!;
  if (AG_WEAPONS[w].needsEmitter) {
    const s = ag.arm.emitterId ? world.samSites.get(ag.arm.emitterId) : undefined;
    return s ? { id: s.id, pos: s.pos } : null;
  }
  const u = ag.shkval.lockedUnitId ? world.groundUnits.get(ag.shkval.lockedUnitId) : undefined;
  return u && u.alive ? { id: u.id, pos: u.pos } : null;
}

/** ПР rule per weapon: in the range band + Shkval lock + laser where needed (Kh-58: pod + emitting radar). */
export function canAgLaunch(world: World, ac: Aircraft, weapon?: AgWeaponId): AgLaunchCheck {
  const ag = ac.ag;
  const w = weapon ?? ag?.selected ?? null;
  const out: AgLaunchCheck = { ok: false, pr: false, reason: '', weapon: w, targetId: null, range: null, band: null };
  const fail = (reason: string) => ({ ...out, reason });
  if (!ag || !ac.alive) return fail('No air-to-ground system');
  if (ag.master === 'nav') return fail('Select air-to-ground mode [7]');
  if (!w) return fail('Select a weapon [D]');
  const spec = AG_WEAPONS[w];
  if ((ag.stores[w] ?? 0) <= 0) return fail(`No ${spec.name} left`);
  out.band = { min: spec.rangeKm.min * 1000, max: spec.rangeKm.max * 1000 };

  if (spec.guidance === 'ballistic') {
    const imp = predictImpact(world, ac, w);
    if (imp) out.range = ac.pos.distanceTo(imp);
    out.ok = true;
    out.pr = out.range != null && out.range >= out.band.min && out.range <= out.band.max;
    if (!out.pr) out.reason = out.range == null ? 'No impact point' : `Impact point at ${kmS(out.range)}, band ${kmS(out.band.min)}–${kmS(out.band.max)}`;
    return out;
  }
  if (ag.master === 'fixed') return fail('Fixed reticle: unguided weapons only');
  if (spec.needsEmitter) {
    if (!ag.pod) return fail('No L-081 Fantasmagoria pod on station 6');
    if (!ag.arm.detecting) return fail('Passive detection is off [I]');
    const s = ag.arm.emitterId ? world.samSites.get(ag.arm.emitterId) : undefined;
    if (!s || !s.alive) return fail('Lock an emitter [Enter]');
    if (!s.active) return fail('Emitter silent');
    if (!armEmitters(world, ac).includes(s.id)) return fail('Emitter outside ±30° detection zone');
  } else {
    const sh = ag.shkval;
    if (!sh.on) return fail('Shkval is off [O]');
    if (spec.needsLock && !sh.lockedUnitId) return fail('No lock (КС): lock the target (АС)');
    if (spec.needsLaser && !sh.laserOn) return fail('Laser off: switch on ЛД [RShift-O]');
  }
  const tgt = guidedTarget(world, ac, w);
  if (!tgt) return fail('No target');
  out.targetId = tgt.id;
  out.range = ac.pos.distanceTo(tgt.pos);
  if (out.range > out.band.max) return fail(`Out of range: ${kmS(out.range)}, max ${kmS(out.band.max)}`);
  if (out.range < out.band.min) return fail(`Too close: ${kmS(out.range)}, min ${kmS(out.band.min)}`);
  return { ...out, ok: true, pr: true };
}

// ─────────────────────────────────────────────────────────── release

function gauss(world: World): number {
  const u = Math.max(1e-12, world.rand()), v = world.rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Boresight release velocity for a ballistic store, with optional dispersion. */
function releaseVel(ac: Aircraft, w: AgWeaponId, world: World | null): Vector3 {
  const m = AG_MODEL[w];
  let h = ac.heading, p = ac.pitch;
  if (world && m.dispersionMrad > 0) {
    h += gauss(world) * m.dispersionMrad / 1000;
    p += gauss(world) * m.dispersionMrad / 1000;
  }
  const v = ac.vel.clone();
  if (m.boost > 0) v.addScaledVector(dirFrom(h, p), m.boost);
  else if (world && m.dispersionMrad > 0) v.copy(dirFrom(h, p).multiplyScalar(ac.vel.length()));
  return v;
}

/**
 * Ballistic impact point of a store released now, without dispersion (the CCIP pipper's point).
 * Null for guided weapons or when it would not reach the ground within the weapon's flight time.
 */
export function predictImpact(world: World, ac: Aircraft, w: AgWeaponId): Vector3 | null {
  if (AG_WEAPONS[w].guidance !== 'ballistic') return null;
  const m = AG_MODEL[w];
  const p = ac.pos.clone(), v = releaseVel(ac, w, null);
  const dt = 0.05;
  for (let t = 0; t < m.maxTime; t += dt) {
    v.y -= G0 * dt;
    p.addScaledVector(v, dt);
    const gy = groundHeight(world, p.x, p.z);
    if (p.y <= gy) { p.y = gy; return p; }
  }
  return null;
}

function spawnWeapon(world: World, ac: Aircraft, w: AgWeaponId, targetId: EntityId | null, aim: Vector3, vel: Vector3, lateral = 0): AgWeapon {
  const pos = ac.pos.clone();
  if (lateral) pos.addScaledVector(dirFrom(ac.heading + Math.PI / 2), lateral);
  pos.y -= 2;
  const wp: AgWeapon = {
    kind: 'ag-weapon', id: world.uid('W'), type: w, side: ac.side, shooterId: ac.id, targetId,
    aimPoint: aim.clone(), pos, vel, launchedAt: world.t, alive: true, guided: AG_WEAPONS[w].guidance !== 'ballistic',
    lostWhy: null, timeToImpact: null, result: null,
  };
  world.agWeapons.set(wp.id, wp);
  return wp;
}

/**
 * Release the selected store if allowed. Guided weapons need ПР; pairs fire two where S1 allows it (Vikhr);
 * the cannon fires a short burst. Returns the weapons released, or the failed check.
 */
export function agLaunch(world: World, ac: Aircraft): AgWeapon[] | AgLaunchCheck {
  const check = canAgLaunch(world, ac);
  if (!check.ok || !check.weapon) return check;
  const ag = ac.ag!, w = check.weapon, spec = AG_WEAPONS[w];
  const out: AgWeapon[] = [];
  if (spec.guidance === 'ballistic') {
    const n = w === 'gun25t' ? Math.min(GUN_BURST, ag.stores[w] ?? 0) : 1;
    for (let i = 0; i < n; i++) {
      const station = takeRound(ag, w);
      const aim = predictImpact(world, ac, w) ?? ac.pos.clone();
      const lateral = station == null ? 0 : (station - 6) * 0.8;
      out.push(spawnWeapon(world, ac, w, null, aim, releaseVel(ac, w, world), lateral));
    }
  } else {
    const tgt = guidedTarget(world, ac, w)!;
    const n = ag.pair && spec.pairable ? Math.min(2, ag.stores[w] ?? 0) : 1;
    for (let i = 0; i < n; i++) {
      const station = takeRound(ag, w);
      const lateral = station == null ? 0 : (station - 6) * 0.8;
      out.push(spawnWeapon(world, ac, w, tgt.id, tgt.pos, ac.vel.clone(), lateral));
    }
  }
  for (const wp of out) {
    world.emit({ t: world.t, type: 'ag-launch', weaponId: wp.id, shooterId: ac.id, targetId: wp.targetId, weapon: w, range: check.range });
  }
  if ((ag.stores[w] ?? 0) <= 0 && w !== 'gun25t') cycleAgWeapon(ag);
  return out;
}

// ─────────────────────────────────────────────────────────── flight

const tmpA = new Vector3(), tmpB = new Vector3(), tmpC = new Vector3();

function finish(world: World, wp: AgWeapon, kind: 'hit' | 'miss', reason: AgMissReason | 'hit'): void {
  wp.alive = false;
  wp.result = { kind, reason, t: world.t };
  if (kind === 'miss') world.emit({ t: world.t, type: 'ag-miss', weaponId: wp.id, weapon: wp.type, reason: reason as AgMissReason });
}

/** Damage everything within the kill radius of `p`. Returns the ids killed and whether `targetId` was hit. */
function impact(world: World, wp: AgWeapon, p: Vector3, direct: EntityId | null): { killed: EntityId[]; hitTarget: boolean } {
  const m = AG_MODEL[wp.type];
  const killed: EntityId[] = [];
  let hitTarget = false;
  const hitIds = new Set<EntityId>();
  if (direct) hitIds.add(direct);
  for (const u of world.groundUnits.values()) {
    if (u.alive && u.pos.distanceTo(p) <= m.killRadiusM + u.sizeM / 2) hitIds.add(u.id);
  }
  for (const s of world.samSites.values()) if (s.alive && s.pos.distanceTo(p) <= m.killRadiusM + 5) hitIds.add(s.id);
  for (const id of hitIds) {
    if (id === wp.targetId) hitTarget = true;
    if (damageGround(world, id, m.damage, wp.shooterId, wp.type)) killed.push(id);
  }
  world.emit({ t: world.t, type: 'ag-impact', weaponId: wp.id, weapon: wp.type, targetId: hitTarget ? wp.targetId : (killed[0] ?? null), pos: [p.x, p.y, p.z], killed });
  return { killed, hitTarget: hitTarget || killed.length > 0 };
}

/** Does the guidance rule still hold? Returns why not, or null. */
function guidanceBroken(world: World, wp: AgWeapon): AgMissReason | null {
  const spec = AG_WEAPONS[wp.type];
  const shooter = world.aircraft.get(wp.shooterId);
  if (spec.guidance === 'anti-radiation') {
    const s = wp.targetId ? world.samSites.get(wp.targetId) : undefined;
    if (!s || !s.alive) return 'target-dead';
    return s.active ? null : 'emitter-off';
  }
  const u = wp.targetId ? world.groundUnits.get(wp.targetId) : undefined;
  if (!spec.holdToImpact) return u && u.alive ? null : 'target-dead';
  const sh = shooter?.alive ? shooter.ag?.shkval : undefined;
  if (!sh || sh.lockedUnitId !== wp.targetId) {
    const why = sh?.lastLost?.unitId === wp.targetId ? sh.lastLost.why : null;
    return why === 'gimbal' ? 'gimbal' : why === 'terrain' ? 'terrain' : why === 'target-dead' ? 'target-dead' : 'lock-lost';
  }
  if (spec.needsLaser && !sh.laserOn) return 'laser-off';
  return null;
}

/** Where the guided weapon steers now. */
function steerPoint(world: World, wp: AgWeapon, out: Vector3): Vector3 {
  const spec = AG_WEAPONS[wp.type];
  if (spec.guidance === 'anti-radiation') {
    const s = world.samSites.get(wp.targetId!);
    return out.copy(s ? s.pos : wp.aimPoint);
  }
  const u = world.groundUnits.get(wp.targetId!);
  const tp = u ? u.pos : wp.aimPoint;
  if (spec.guidance === 'beam-riding') {
    // Ride the Shkval line of sight: steer for a point on the beam a little ahead of the missile.
    const shooter = world.aircraft.get(wp.shooterId);
    if (shooter) {
      const los = tmpC.subVectors(tp, shooter.pos);
      const L = los.length();
      los.divideScalar(L || 1);
      const along = tmpB.subVectors(wp.pos, shooter.pos).dot(los);
      return out.copy(shooter.pos).addScaledVector(los, Math.min(L, along + 400));
    }
  }
  // Laser / TV: straight at the target with a simple lead for moving units.
  out.copy(tp);
  if (u) {
    const tgo = wp.pos.distanceTo(tp) / Math.max(100, wp.vel.length());
    out.addScaledVector(groundUnitVel(u, tmpB), tgo);
  }
  return out;
}

/** Closest distance from point `c` to the segment a→b. */
function segDist(a: Vector3, b: Vector3, c: Vector3): number {
  const ab = tmpA.subVectors(b, a), L2 = ab.lengthSq();
  const k = L2 > 0 ? clamp(tmpB.subVectors(c, a).dot(ab) / L2, 0, 1) : 0;
  return tmpB.copy(a).addScaledVector(ab, k).distanceTo(c);
}

export function stepAgWeapon(world: World, wp: AgWeapon, dt: number): void {
  if (!wp.alive) return;
  const m = AG_MODEL[wp.type];
  const age = world.t - wp.launchedAt;
  if (age > m.maxTime) { finish(world, wp, 'miss', wp.lostWhy ?? 'timeout'); return; }
  const prev = wp.pos.clone();

  if (wp.guided) {
    const why = guidanceBroken(world, wp);
    if (why) { wp.guided = false; wp.lostWhy = why; }
  }
  if (wp.guided) {
    const want = steerPoint(world, wp, new Vector3()).sub(wp.pos).normalize();
    const cur = wp.vel.clone().normalize();
    const ang = cur.angleTo(want), maxTurn = m.turnRate * dt;
    const dir = ang <= maxTurn || ang < 1e-9 ? want : cur.lerp(want, maxTurn / ang).normalize();
    wp.vel.copy(dir).multiplyScalar(speedAt(m, age));
    wp.pos.addScaledVector(wp.vel, dt);
    const tp = wp.targetId ? (world.groundUnits.get(wp.targetId)?.pos ?? world.samSites.get(wp.targetId)?.pos) : undefined;
    if (tp) {
      const d = segDist(prev, wp.pos, tp);
      wp.timeToImpact = wp.pos.distanceTo(tp) / Math.max(1, wp.vel.length());
      if (d <= m.hitRadiusM) {
        const r = impact(world, wp, tp.clone(), wp.targetId);
        finish(world, wp, r.hitTarget ? 'hit' : 'miss', r.hitTarget ? 'hit' : 'ground');
        return;
      }
    }
  } else {
    wp.vel.y -= G0 * dt;
    wp.pos.addScaledVector(wp.vel, dt);
    wp.timeToImpact = null;
  }
  const gy = groundHeight(world, wp.pos.x, wp.pos.z);
  if (wp.pos.y <= gy) {
    // Interpolate the ground crossing so the impact point does not depend on the step size.
    const k = (prev.y - groundHeight(world, prev.x, prev.z)) / Math.max(1e-6, prev.y - wp.pos.y);
    const p = prev.clone().lerp(wp.pos, clamp(k, 0, 1));
    p.y = groundHeight(world, p.x, p.z);
    wp.pos.copy(p);
    // Guidance loss is final in this trainer: proximity at ground impact cannot rescue the shot.
    // Emit the impact for the debrief, but apply no damage and retain the original failure reason.
    if (wp.lostWhy) {
      world.emit({ t: world.t, type: 'ag-impact', weaponId: wp.id, weapon: wp.type, targetId: null, pos: [p.x, p.y, p.z], killed: [] });
      finish(world, wp, 'miss', wp.lostWhy);
      return;
    }
    const r = impact(world, wp, p, null);
    const ballistic = AG_WEAPONS[wp.type].guidance === 'ballistic';
    if (ballistic) finish(world, wp, r.killed.length ? 'hit' : 'miss', r.killed.length ? 'hit' : 'ground');
    else finish(world, wp, r.hitTarget ? 'hit' : 'miss', r.hitTarget ? 'hit' : (wp.lostWhy ?? 'ground'));
  }
}

export function stepAgWeapons(world: World, dt: number): void {
  for (const wp of world.agWeapons.values()) if (wp.alive) stepAgWeapon(world, wp, dt);
}
