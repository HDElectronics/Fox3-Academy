/**
 * [OWNER: sim-sensors] SAM sites and their missiles, as gameplay rules (ARCHITECTURE.md "Scope").
 *
 * A site cycles search -> track -> engage, the way the player's RWR reads it:
 *   search: the search radar paints every aircraft in line of sight inside SEARCH_FACTOR x the threat ring
 *           (RWR search, whatever side it is on);
 *   track:  the nearest enemy inside the ring is locked by the track radar (RWR lock);
 *   engage: after the site's acquisition delay, and while the predicted intercept point sits inside the ring
 *           and the target is inside the altitude band, it launches (RWR launch while a missile is guided).
 * Guidance rule (data SamSpec.guidance 'track-to-impact'): the missile flies to the site's track until impact.
 * Break the track and every missile on you goes ballistic.
 *
 * What breaks the track, all gameplay stand-ins reused from the air-to-air rules:
 *   - line of sight: the 4/3-earth radar horizon (4.12 km x (sqrt h_antenna + sqrt h_target), heights in m)
 *     and a scenario terrain-mask height around the site (beyond 2 km, targets below it are hidden);
 *     the track survives LOST_GRACE_S without line of sight (memory), then drops;
 *   - notch: radial speed vs the ground below the site's gate for notchHoldS (half gate when the target is
 *     more than 10 deg above the site's horizon: less clutter behind it);
 *   - chaff: each bundle the target drops while near the notch is rolled once, chance chaffChance x depth
 *     (depth 1 at zero radial speed, 0.5 at the gate edge, 0 beyond twice the gate): chaff alone does nothing;
 *   - range: beyond TRACK_FACTOR x the ring.
 * After a drop the site waits REACQUIRE_S before it can lock again, and the acquisition delay restarts.
 *
 * Missiles: arcade speed curve (linear boost to peak speed over boostS, then dv/dt = -K sigma v^2), a turn cap
 * (maxG, full only when sigma v^2 is high), steer to the intercept point of the site's track, battery time.
 * Every constant below is gameplay tuning so that the flyout reaches the Mission Editor ring; none is verified
 * in DCS and none is weapon data. Randomness: world.rand() only.
 */
import { Vector3 } from 'three';
import type { World } from './world';
import type { Aircraft, EntityId, MissReason, RwrContact, SamLostReason, SamMissile, SamSite, SamSpawnOptions } from './types';
import type { SamId } from '../data/types';
import { SAMS } from '../data/sams';
import { sigma } from './atmosphere';
import { D2R, G0, clamp, elevationTo, groundRange, radialSpeedVsGround, relBearing } from './math';

/** Gameplay constants per site. Not verified in game; tuned so the flyout reaches the threat ring. */
export interface SamModel {
  /** Radar height above the site's ground for the horizon rule (m). */
  antennaM: number;
  /** Seconds from lock to the first launch. */
  acquireS: number;
  /** Seconds between two launches. */
  salvoGapS: number;
  /** Missiles in flight on one target at once. */
  maxInFlight: number;
  /** Ready missiles at spawn. */
  missiles: number;
  /** Average flyout speed used to predict the intercept point for the launch decision (m/s). */
  avgMps: number;
  // --- missile speed curve and turning ---
  boostS: number;
  peakMps: number;
  /** dv/dt = -decayK * sigma * v^2 after the boost. */
  decayK: number;
  minSpeedMps: number;
  maxTimeS: number;
  maxG: number;
  steerGain: number;
  hitRadiusM: number;
  armTimeS: number;
  /** Initial climb angle off the launcher (deg). */
  launchPitchDeg: number;
  // --- defences ---
  notchMps: number;
  notchHoldS: number;
  /** Per-bundle chance to break the track at full notch depth. */
  chaffChance: number;
}

export const SAM_MODEL: Record<SamId, SamModel> = {
  sa10: {
    antennaM: 25, acquireS: 6, salvoGapS: 4, maxInFlight: 2, missiles: 8, avgMps: 1250,
    boostS: 10, peakMps: 1900, decayK: 1e-5, minSpeedMps: 300, maxTimeS: 110, maxG: 25, steerGain: 3,
    hitRadiusM: 20, armTimeS: 1.5, launchPitchDeg: 45,
    notchMps: 15, notchHoldS: 3, chaffChance: 0.15,
  },
  sa11: {
    antennaM: 10, acquireS: 5, salvoGapS: 4, maxInFlight: 2, missiles: 4, avgMps: 750,
    boostS: 15, peakMps: 1100, decayK: 2e-5, minSpeedMps: 250, maxTimeS: 60, maxG: 25, steerGain: 3,
    hitRadiusM: 17, armTimeS: 1, launchPitchDeg: 25,
    notchMps: 30, notchHoldS: 2, chaffChance: 0.35,
  },
  sa15: {
    antennaM: 8, acquireS: 3, salvoGapS: 3, maxInFlight: 2, missiles: 8, avgMps: 600,
    boostS: 4, peakMps: 850, decayK: 4e-5, minSpeedMps: 200, maxTimeS: 25, maxG: 30, steerGain: 3.5,
    hitRadiusM: 12, armTimeS: 0.5, launchPitchDeg: 30,
    notchMps: 25, notchHoldS: 2, chaffChance: 0.3,
  },
};

/** Search radar reach as a multiple of the threat ring. */
export const SEARCH_FACTOR = 1.25;
/** Track radar reach as a multiple of the threat ring. */
export const TRACK_FACTOR = 1.1;
/** Seconds a track survives without line of sight before it drops. */
export const LOST_GRACE_S = 1.5;
/** Seconds after a drop before the site can lock again. */
export const REACQUIRE_S = 3;
/** Terrain mask applies beyond this ground range from the site (m). */
export const MASK_NEAR_M = 2000;
/** Above this elevation from the site the notch gate halves (less clutter behind the target). */
const CLUTTER_EL = 10 * D2R;
const LAUNCH_SPEED = 60;
const FULL_G_SIGMA_V2 = 0.3 * 800 * 800;

export function samModel(type: SamId): SamModel {
  return SAM_MODEL[type];
}

/** Threat-ring radius (m): the Mission Editor ring from data/sams.ts. */
export function samRingM(type: SamId): number {
  return SAMS[type].threatRingKm * 1000;
}

// ─────────────────────────────────────────────────────────── per-entity memory (not part of the contract)

interface SiteMemo {
  estPos: Vector3;
  estVel: Vector3;
  rolled: Set<EntityId>;
  cooldownUntil: number;
}
interface MissileMemo {
  dir: Vector3;
  speed: number;
  lostWhy: MissReason | null;
  prevRange: number;
  wasClosing: boolean;
}
const siteMemos = new WeakMap<SamSite, SiteMemo>();
const missileMemos = new WeakMap<SamMissile, MissileMemo>();

function siteMemo(site: SamSite): SiteMemo {
  let m = siteMemos.get(site);
  if (!m) { m = { estPos: new Vector3(), estVel: new Vector3(), rolled: new Set(), cooldownUntil: -Infinity }; siteMemos.set(site, m); }
  return m;
}

// ─────────────────────────────────────────────────────────── spawn

export function createSamSite(world: World, o: SamSpawnOptions): SamSite {
  return {
    kind: 'sam', id: o.id ?? world.uid('S'), side: o.side, type: o.type, callsign: o.callsign ?? SAMS[o.type].nato,
    pos: new Vector3(o.pos.x, o.pos.y ?? world.groundAlt, o.pos.z), maskAltM: o.maskAltM ?? 0,
    active: o.active ?? true, holdFire: o.holdFire ?? false, alive: true,
    state: (o.active ?? true) ? 'search' : 'off', targetId: null, trackSince: null, lostFor: 0, notchFor: 0,
    lastLost: null, missiles: o.missiles ?? SAM_MODEL[o.type].missiles, lastLaunch: -Infinity, painted: [],
  };
}

// ─────────────────────────────────────────────────────────── line of sight

export type SamSightBlock = 'horizon' | 'terrain' | 'below-ground' | null;

/** What hides `ac` from the site's radars (null = in line of sight). Gameplay rule, see the header. */
export function samSightBlock(site: SamSite, ac: Aircraft): SamSightBlock {
  const hT = ac.pos.y - site.pos.y;
  if (hT <= 0) return 'below-ground';
  const hS = SAM_MODEL[site.type].antennaM;
  const gr = groundRange(site.pos, ac.pos);
  if (gr > 4120 * (Math.sqrt(hS) + Math.sqrt(hT))) return 'horizon';
  if (gr > MASK_NEAR_M && hT < site.maskAltM) return 'terrain';
  return null;
}

/** Notch gate (m/s) the site applies against `ac`: full with clutter behind it, half high above the horizon. */
export function samNotchGate(site: SamSite, ac: Aircraft): number {
  const g = SAM_MODEL[site.type].notchMps;
  return elevationTo(site.pos, ac.pos) > CLUTTER_EL ? g * 0.5 : g;
}

/** Notch depth 0..1 (1 = zero radial speed, 0.5 = gate edge), as the air-to-air seeker rule. */
export function samNotchDepth(site: SamSite, ac: Aircraft): { inNotch: boolean; depth: number; radialMps: number; gateMps: number } {
  const gate = samNotchGate(site, ac);
  const radial = radialSpeedVsGround(site.pos, ac.pos, ac.vel);
  return { inNotch: radial < gate, depth: clamp(1 - radial / (2 * gate), 0, 1), radialMps: radial, gateMps: gate };
}

/** Would the site launch at `ac` right now if it held a mature track? Reason in pilot words when not. */
export function samLaunchCheck(site: SamSite, ac: Aircraft): { ok: boolean; reason: string } {
  const spec = SAMS[site.type];
  const model = SAM_MODEL[site.type];
  const agl = ac.pos.y - site.pos.y;
  if (agl < spec.minAltM) return { ok: false, reason: `Below the ${spec.nato} floor (${spec.minAltM} m)` };
  if (agl > spec.maxAltM) return { ok: false, reason: `Above the ${spec.nato} ceiling (${spec.maxAltM} m)` };
  const range = site.pos.distanceTo(ac.pos);
  if (groundRange(site.pos, ac.pos) < spec.minRangeKm * 1000) return { ok: false, reason: 'Inside minimum range' };
  const tgo = range / model.avgMps;
  const pip = ac.pos.clone().addScaledVector(ac.vel, tgo);
  const ring = samRingM(site.type);
  if (site.pos.distanceTo(pip) > ring) return { ok: false, reason: `Intercept point outside the ${spec.threatRingKm} km ring` };
  return { ok: true, reason: '' };
}

// ─────────────────────────────────────────────────────────── stepping

function dropTrack(world: World, site: SamSite, why: SamLostReason): void {
  if (!site.targetId) return;
  const targetId = site.targetId;
  site.lastLost = { t: world.t, targetId, why };
  site.state = site.active ? 'search' : 'off';
  site.targetId = null; site.trackSince = null; site.lostFor = 0; site.notchFor = 0;
  const memo = siteMemo(site);
  memo.cooldownUntil = world.t + REACQUIRE_S;
  memo.rolled.clear();
  const reason: MissReason = why === 'notched' ? 'notched' : why === 'chaff' ? 'chaff' : why === 'target-dead' ? 'target-dead' : 'lost-guidance';
  for (const m of world.samMissiles.values()) {
    if (!m.alive || !m.guided || m.siteId !== site.id || m.targetId !== targetId) continue;
    m.guided = false;
    const mm = missileMemos.get(m);
    if (mm) mm.lostWhy = reason;
    world.emit({ t: world.t, type: 'seeker-lost', missileId: m.id, why: reason });
  }
  world.emit({ t: world.t, type: 'sam', siteId: site.id, what: 'lost', targetId, why });
}

function stepSite(world: World, site: SamSite, dt: number): void {
  if (!site.alive || !site.active) {
    if (site.targetId) dropTrack(world, site, 'radar-off');
    site.state = site.alive && site.active ? 'search' : 'off';
    site.painted = [];
    return;
  }
  const ring = samRingM(site.type);
  const model = SAM_MODEL[site.type];
  const memo = siteMemo(site);

  // Search radar: everything in line of sight inside the search reach.
  const painted: EntityId[] = [];
  for (const ac of world.aircraft.values()) {
    if (!ac.alive) continue;
    if (site.pos.distanceTo(ac.pos) > ring * SEARCH_FACTOR) continue;
    if (samSightBlock(site, ac)) continue;
    painted.push(ac.id);
  }
  site.painted = painted;

  // Track radar on the current target.
  if (site.targetId) {
    const tgt = world.aircraft.get(site.targetId);
    if (!tgt || !tgt.alive) { dropTrack(world, site, 'target-dead'); }
    else {
      const block = samSightBlock(site, tgt);
      const range = site.pos.distanceTo(tgt.pos);
      if (block || range > ring * TRACK_FACTOR) {
        site.lostFor += dt;
        memo.estPos.addScaledVector(memo.estVel, dt);
        if (site.lostFor > LOST_GRACE_S) dropTrack(world, site, block === 'terrain' ? 'terrain' : block ? 'horizon' : 'range');
      } else {
        site.lostFor = 0;
        const n = samNotchDepth(site, tgt);
        site.notchFor = n.inNotch ? site.notchFor + dt : 0;
        if (site.notchFor >= model.notchHoldS) dropTrack(world, site, 'notched');
        else {
          let chaffed = false;
          if (n.depth > 0) {
            for (const c of world.countermeasures) {
              if (c.kind !== 'chaff' || c.ownerId !== tgt.id || memo.rolled.has(c.id)) continue;
              memo.rolled.add(c.id);
              if (world.rand() < model.chaffChance * n.depth) { chaffed = true; break; }
            }
          }
          if (chaffed) dropTrack(world, site, 'chaff');
          else { memo.estPos.copy(tgt.pos); memo.estVel.copy(tgt.vel); }
        }
      }
    }
  }

  // Acquire: nearest enemy in the ring that the search radar sees.
  if (!site.targetId && world.t >= memo.cooldownUntil) {
    let best: Aircraft | null = null, bestR = Infinity;
    for (const id of painted) {
      const ac = world.aircraft.get(id);
      if (!ac || ac.side === site.side) continue;
      const r = site.pos.distanceTo(ac.pos);
      if (r <= ring && r < bestR) { best = ac; bestR = r; }
    }
    if (best) {
      site.targetId = best.id; site.trackSince = world.t; site.lostFor = 0; site.notchFor = 0; site.state = 'track';
      memo.estPos.copy(best.pos); memo.estVel.copy(best.vel);
      // Chaff already in the air before the lock does not count.
      for (const c of world.countermeasures) memo.rolled.add(c.id);
      world.emit({ t: world.t, type: 'sam', siteId: site.id, what: 'track', targetId: best.id, range: bestR });
    }
  }

  // Launch.
  if (site.targetId && site.trackSince !== null && site.lostFor === 0 && !site.holdFire && site.missiles > 0
      && world.t - site.trackSince >= model.acquireS && world.t - site.lastLaunch >= model.salvoGapS) {
    const tgt = world.aircraft.get(site.targetId);
    let inFlight = 0;
    for (const m of world.samMissiles.values()) if (m.alive && m.guided && m.siteId === site.id && m.targetId === site.targetId) inFlight++;
    if (tgt && inFlight < model.maxInFlight && samLaunchCheck(site, tgt).ok) launchSam(world, site, tgt);
  }

  let guiding = false;
  for (const m of world.samMissiles.values()) if (m.alive && m.guided && m.siteId === site.id && m.targetId === site.targetId) { guiding = true; break; }
  site.state = site.targetId ? (guiding ? 'engage' : 'track') : 'search';
}

function launchSam(world: World, site: SamSite, tgt: Aircraft): SamMissile {
  const model = SAM_MODEL[site.type];
  const memo = siteMemo(site);
  const pos = site.pos.clone(); pos.y += 5;
  const to = memo.estPos.clone().sub(pos);
  const hd = Math.hypot(to.x, to.z) || 1;
  const pitch = Math.max(Math.atan2(to.y, hd), model.launchPitchDeg * D2R);
  const dir = new Vector3(to.x / hd * Math.cos(pitch), Math.sin(pitch), to.z / hd * Math.cos(pitch));
  const m: SamMissile = {
    kind: 'sam-missile', id: world.uid('SM'), type: site.type, side: site.side, siteId: site.id, targetId: tgt.id,
    pos, vel: dir.clone().multiplyScalar(LAUNCH_SPEED), launchedAt: world.t, alive: true, guided: true,
    motorLeft: model.boostS, timeToImpact: null, result: null, closestApproach: Infinity,
  };
  missileMemos.set(m, { dir, speed: LAUNCH_SPEED, lostWhy: null, prevRange: Infinity, wasClosing: false });
  world.samMissiles.set(m.id, m);
  site.missiles--;
  site.lastLaunch = world.t;
  site.state = 'engage';
  world.emit({ t: world.t, type: 'sam', siteId: site.id, what: 'launch', targetId: tgt.id, missileId: m.id, range: site.pos.distanceTo(tgt.pos) });
  return m;
}

function interceptTime(from: Vector3, pos: Vector3, vel: Vector3, speed: number): number {
  const rx = pos.x - from.x, ry = pos.y - from.y, rz = pos.z - from.z;
  const c = rx * rx + ry * ry + rz * rz;
  const b = 2 * (rx * vel.x + ry * vel.y + rz * vel.z);
  const a = vel.lengthSq() - speed * speed;
  let t = -1;
  if (Math.abs(a) < 1e-6) { if (b < 0) t = -c / b; }
  else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const lo = Math.min((-b - sq) / (2 * a), (-b + sq) / (2 * a)), hi = Math.max((-b - sq) / (2 * a), (-b + sq) / (2 * a));
      t = lo > 0 ? lo : hi > 0 ? hi : -1;
    }
  }
  return t > 0 && t < 600 ? t : Math.sqrt(c) / Math.max(speed, 1);
}

/** Closest distance between a missile moving p0 -> p1 and a target now at q1 moving qVel, over one step. */
function sweptDistance(p0: Vector3, p1: Vector3, q1: Vector3, qVel: Vector3, dt: number): number {
  const q0x = q1.x - qVel.x * dt, q0y = q1.y - qVel.y * dt, q0z = q1.z - qVel.z * dt;
  const rx = p0.x - q0x, ry = p0.y - q0y, rz = p0.z - q0z;
  const vx = (p1.x - p0.x) - qVel.x * dt, vy = (p1.y - p0.y) - qVel.y * dt, vz = (p1.z - p0.z) - qVel.z * dt;
  const vv = vx * vx + vy * vy + vz * vz;
  const s = vv > 1e-9 ? clamp(-(rx * vx + ry * vy + rz * vz) / vv, 0, 1) : 0;
  return Math.hypot(rx + vx * s, ry + vy * s, rz + vz * s);
}

function finish(world: World, m: SamMissile, kind: 'hit' | 'miss', reason: MissReason | 'hit'): void {
  m.alive = false;
  m.guided = false;
  m.result = { kind, reason, t: world.t };
  m.timeToImpact = null;
  if (kind === 'miss') world.emit({ t: world.t, type: 'miss', missileId: m.id, reason: reason as MissReason });
}

const _des = new Vector3(), _pip = new Vector3(), _p0 = new Vector3(), _u = new Vector3();

function stepSamMissile(world: World, m: SamMissile, dt: number): void {
  const memo = missileMemos.get(m);
  if (!memo || !m.alive) return;
  const model = SAM_MODEL[m.type];
  const site = world.samSites.get(m.siteId);
  const target = m.targetId ? world.aircraft.get(m.targetId) : undefined;
  const tFlight = world.t - m.launchedAt;

  // Guidance: the site's track (estimate) until impact.
  if (m.guided && (!site || !site.alive || site.targetId !== m.targetId)) {
    m.guided = false;
    memo.lostWhy = memo.lostWhy ?? 'lost-guidance';
  }
  const v = memo.speed;
  const sg = sigma(Math.max(0, m.pos.y));
  if (m.guided && site) {
    const est = siteMemo(site);
    const tgo = interceptTime(m.pos, est.estPos, est.estVel, Math.max(v, model.avgMps));
    _pip.copy(est.estPos).addScaledVector(est.estVel, tgo);
    _des.copy(_pip).sub(m.pos);
    const dl = _des.length();
    if (dl > 1e-6) _des.divideScalar(dl); else _des.copy(memo.dir);
    const aMax = model.maxG * G0 * Math.min(1, (sg * v * v) / FULL_G_SIGMA_V2);
    const cosA = clamp(memo.dir.dot(_des), -1, 1);
    const ang = Math.acos(cosA);
    const step = Math.min(aMax / Math.max(v, 1), ang * model.steerGain) * dt;
    if (ang < 1e-6 || step >= ang) memo.dir.copy(_des);
    else {
      _u.copy(_des).addScaledVector(memo.dir, -cosA).normalize();
      memo.dir.multiplyScalar(Math.cos(step)).addScaledVector(_u, Math.sin(step)).normalize();
    }
    m.timeToImpact = tgo;
  } else {
    m.timeToImpact = null;
  }

  // Speed curve.
  let nv: number;
  if (m.motorLeft > 0) {
    m.motorLeft = Math.max(0, m.motorLeft - dt);
    nv = Math.min(model.peakMps, v + ((model.peakMps - LAUNCH_SPEED) / model.boostS) * dt);
  } else {
    nv = v / (1 + model.decayK * sg * v * dt) - G0 * memo.dir.y * dt;
  }
  memo.speed = Math.max(0, nv);
  if (m.guided) m.vel.copy(memo.dir).multiplyScalar(memo.speed);
  else {
    m.vel.copy(memo.dir).multiplyScalar(memo.speed);
    m.vel.y -= G0 * dt;
    const s = m.vel.length();
    if (s > 1e-6) memo.dir.copy(m.vel).divideScalar(s);
    memo.speed = s;
  }

  // Move and fuze.
  _p0.copy(m.pos);
  m.pos.addScaledVector(m.vel, dt);
  if (target) {
    const d = sweptDistance(_p0, m.pos, target.pos, target.vel, dt);
    if (d < m.closestApproach) m.closestApproach = d;
  }
  if (tFlight + dt >= model.armTimeS) {
    for (const ac of world.aircraft.values()) {
      if (!ac.alive || ac.side === m.side) continue;
      if (ac.pos.distanceTo(m.pos) > (memo.speed + ac.vel.length()) * dt + model.hitRadiusM + 5) continue;
      if (sweptDistance(_p0, m.pos, ac.pos, ac.vel, dt) <= model.hitRadiusM) {
        world.kill(ac.id, m.siteId);
        finish(world, m, 'hit', 'hit');
        world.emit({ t: world.t, type: 'hit', missileId: m.id, targetId: ac.id });
        return;
      }
    }
  }

  // End of flight.
  const tNow = tFlight + dt;
  if (target && !target.alive) { finish(world, m, 'miss', 'target-dead'); return; }
  if (m.pos.y <= world.groundAlt) { finish(world, m, 'miss', memo.lostWhy ?? 'ground'); return; }
  if (tNow >= model.maxTimeS) { finish(world, m, 'miss', memo.lostWhy ?? 'timeout'); return; }
  if (m.motorLeft <= 0 && memo.speed < model.minSpeedMps) { finish(world, m, 'miss', memo.lostWhy ?? 'kinematic'); return; }
  if (target && target.alive) {
    const rng = m.pos.distanceTo(target.pos);
    const closing = rng < memo.prevRange;
    if (memo.wasClosing && !closing && tNow > model.armTimeS) {
      finish(world, m, 'miss', memo.lostWhy ?? (m.guided ? 'overshoot' : 'lost-guidance'));
      return;
    }
    if (closing) memo.wasClosing = true;
    memo.prevRange = rng;
  }
}

/** One tick for every SAM site and SAM in flight. Called by World after the air-to-air missiles. */
export function stepSams(world: World, dt: number): void {
  for (const site of world.samSites.values()) stepSite(world, site, dt);
  for (const m of world.samMissiles.values()) if (m.alive) stepSamMissile(world, m, dt);
}

// ─────────────────────────────────────────────────────────── RWR

/**
 * The RWR contact a site makes on `rx` right now, or null: search when its search radar paints rx, lock when
 * its track radar holds rx, launch while one of its missiles is guided on rx. Bearing and elevation from rx.
 */
export function samRwrContact(world: World, site: SamSite, rx: Aircraft, prev: RwrContact | undefined): RwrContact | null {
  if (!site.alive || !site.active) return null;
  let state: RwrContact['state'] | null = null;
  if (site.painted.includes(rx.id)) state = 'search';
  if (site.targetId === rx.id && site.lostFor === 0) state = 'lock';
  if (state === 'lock') {
    for (const m of world.samMissiles.values()) {
      if (m.alive && m.guided && m.siteId === site.id && m.targetId === rx.id) { state = 'launch'; break; }
    }
  }
  if (!state) return null;
  const range = rx.pos.distanceTo(site.pos);
  const base = clamp(1 - range / (samRingM(site.type) * SEARCH_FACTOR), 0, 1);
  const strength = state === 'search' ? 0.15 + 0.55 * base : state === 'lock' ? 0.5 + 0.4 * base : 0.8 + 0.2 * base;
  return {
    emitterId: site.id, emitterType: SAMS[site.type].rwrClass, state,
    bearing: relBearing(rx.pos, rx.heading, site.pos), elevation: elevationTo(rx.pos, site.pos),
    strength, firstSeen: prev?.firstSeen ?? world.t, lastSeen: world.t,
  };
}
