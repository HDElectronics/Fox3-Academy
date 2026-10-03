/**
 * [OWNER: page-harm] The HARM page's own small simulation (page-local, deterministic, no World): the jet on a simple
 * autopilot, SAM sites whose radars transmit, lock and may go quiet, HARMs that home on a transmitting radar and go
 * ballistic when it stops (ED guide p367), PB shots that fly to a point and then look for the coded emitter (p373), and
 * a live site's missile that needs its radar until impact (Fox3 SAM notes). Arcade rules only (AGENTS.md rule 1);
 * trainer numbers in data.ts TRAINER, listed in HARM_CAVEATS.
 *
 * Frame: metres, x east, y up, z south; heading clockwise from north, so the nose points (sin h, 0, -cos h).
 */
import { SYSTEMS, TRAINER, type RadarInfo } from './data';
import type { Pullup, SceneView, SystemId, VehicleId } from './types';

export interface Vec3 { x: number; y: number; z: number }

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const G = 9.81;
const NM = 1852;
const FT = 0.3048;

const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const hdist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
export const wrapDeg = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;
/** Bearing from a to b, degrees clockwise from north. */
export const bearingDeg = (a: Vec3, b: Vec3): number => Math.atan2(b.x - a.x, -(b.z - a.z)) * R2D;

export interface SiteVehicle { id: VehicleId; pos: Vec3; headingRad: number; radar: RadarInfo | null; alive: boolean }

export interface Site {
  id: string;
  name: string;
  system: SystemId;
  vehicles: SiteVehicle[];
  /** Radars on (alarm state red). */
  active: boolean;
  /** Locks the jet and shoots (mission 2); false = weapons hold (mission 1). */
  live: boolean;
  /** Goes quiet when a HARM homes on it (Mission Editor "Evasion of ARM"). */
  evades: boolean;
  quietUntil: number;
  /** Continuous lock time on the jet (s). */
  lockS: number;
  notchUntil: number;
  missiles: number;
}

/** One radar the jet can hear: a site vehicle with a radar. */
export interface Emitter { key: string; site: Site; vehicle: SiteVehicle; radar: RadarInfo }

/** What the jet's RWR / HARM sensors know about a transmitting emitter. */
export interface Contact {
  key: string;
  emitter: Emitter;
  /** Relative to the nose, + right. */
  azDeg: number;
  elDeg: number;
  rangeM: number;
  lockedYou: boolean;
  /** A missile from this site is guiding at the jet. */
  guiding: boolean;
}

export interface Harm {
  id: string;
  pos: Vec3;
  vel: Vec3;
  t0: number;
  kind: 'direct' | 'pb';
  /** Emitter it homes on, null while a PB shot is still flying to its point. */
  targetKey: string | null;
  pbPoint: Vec3 | null;
  pbCode: number | null;
  loftDeg: number;
  range0: number;
  lost: boolean;
  alive: boolean;
  evaded: boolean;
}

export interface SamMissile { id: string; siteId: string; pos: Vec3; vel: Vec3; t0: number; guided: boolean; alive: boolean }

export type SimEvent =
  | { t: number; type: 'harm-launch'; harmId: string; text: string }
  | { t: number; type: 'harm-kill'; harmId: string; siteId: string; vehicle: VehicleId; text: string }
  | { t: number; type: 'harm-miss'; harmId: string; reason: 'lost' | 'no-emitter' | 'ground'; text: string }
  | { t: number; type: 'harm-lost'; harmId: string; text: string }
  | { t: number; type: 'harm-acquire'; harmId: string; key: string; text: string }
  | { t: number; type: 'radar-quiet'; siteId: string; text: string }
  | { t: number; type: 'lock'; siteId: string; text: string }
  | { t: number; type: 'sam-launch'; siteId: string; text: string }
  | { t: number; type: 'sam-miss'; siteId: string; text: string }
  | { t: number; type: 'jet-hit'; siteId: string; text: string };

export interface SiteSetup {
  id: string;
  name: string;
  system: SystemId;
  /** Main radar position (ground level y = 0). Other vehicles are laid out around it. */
  at: { x: number; z: number };
  active?: boolean;
  live?: boolean;
  evades?: boolean;
}

export interface SimSetup {
  jet: { x: number; z: number; altFt: number; headingDeg: number; speedKt: number };
  sites: SiteSetup[];
}

/** Vehicles of a battery around its main radar (metres east, north of it). */
const LAYOUT: Record<SystemId, { id: VehicleId; dx: number; dn: number }[]> = {
  sa6: [{ id: 'sa6-str', dx: 0, dn: 0 }, { id: 'sa6-tel', dx: -120, dn: 90 }, { id: 'sa6-tel', dx: 120, dn: 90 }, { id: 'sa6-tel', dx: 0, dn: -140 }],
  sa8: [{ id: 'sa8', dx: 0, dn: 0 }],
  sa11: [{ id: 'sa11-sr', dx: 0, dn: 0 }, { id: 'sa11-cp', dx: 60, dn: -40 }, { id: 'sa11-telar', dx: -250, dn: 200 }, { id: 'sa11-telar', dx: 250, dn: 200 }],
  sa15: [{ id: 'sa15', dx: 0, dn: 0 }],
  sa10: [{ id: 'sa10-sr', dx: 0, dn: 0 }, { id: 'sa10-tr', dx: 200, dn: 150 }, { id: 'sa10-ln', dx: -150, dn: 300 }, { id: 'sa10-ln', dx: 350, dn: 320 }],
};

function radarOf(system: SystemId, vehicle: VehicleId): RadarInfo | null {
  return SYSTEMS[system].radars.find(r => r.vehicle === vehicle) ?? null;
}

export class HarmSim {
  t = 0;
  readonly jet: { pos: Vec3; headingRad: number; pitchRad: number; speed: number; alive: boolean; turnCmd: number; pitchCmd: number; chaff: number; lastChaffT: number };
  readonly sites: Site[];
  harms: Harm[] = [];
  sams: SamMissile[] = [];
  blasts: { pos: Vec3; t: number }[] = [];
  readonly events: SimEvent[] = [];
  private nextId = 1;

  constructor(setup: SimSetup) {
    const j = setup.jet;
    this.jet = {
      pos: v3(j.x, j.altFt * FT, j.z), headingRad: j.headingDeg * D2R, pitchRad: 0, speed: j.speedKt * NM / 3600,
      alive: true, turnCmd: 0, pitchCmd: 0, chaff: 60, lastChaffT: -99,
    };
    this.sites = setup.sites.map(s => ({
      id: s.id, name: s.name, system: s.system,
      vehicles: LAYOUT[s.system].map(l => ({
        id: l.id, pos: v3(s.at.x + l.dx, 0, s.at.z - l.dn), headingRad: Math.PI * 1.5, radar: radarOf(s.system, l.id), alive: true,
      })),
      active: s.active ?? true, live: s.live ?? false, evades: s.evades ?? false,
      quietUntil: -1, lockS: 0, notchUntil: -1, missiles: 4,
    }));
  }

  /** Nose direction. */
  noseDir(): Vec3 {
    const h = this.jet.headingRad, p = this.jet.pitchRad;
    return v3(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p));
  }

  emitters(): Emitter[] {
    const out: Emitter[] = [];
    for (const site of this.sites) site.vehicles.forEach((v, i) => { if (v.radar) out.push({ key: `${site.id}:${i}`, site, vehicle: v, radar: v.radar }); });
    return out;
  }

  emitter(key: string): Emitter | null { return this.emitters().find(e => e.key === key) ?? null; }

  /** The radar is on the air: site active, not quiet, vehicle alive. */
  transmitting(e: Emitter): boolean {
    return e.site.active && e.vehicle.alive && this.t >= e.site.quietUntil;
  }

  /** Relative azimuth and elevation of a point from the jet. */
  relative(p: Vec3): { azDeg: number; elDeg: number; rangeM: number } {
    const d = sub(p, this.jet.pos);
    return {
      azDeg: wrapDeg(bearingDeg(this.jet.pos, p) - this.jet.headingRad * R2D),
      elDeg: Math.atan2(d.y, Math.hypot(d.x, d.z)) * R2D,
      rangeM: len(d),
    };
  }

  private locks(e: Emitter, rangeM: number): boolean {
    return this.jet.alive && e.site.live && e.radar.job !== 'search' && rangeM < TRAINER.lockM[e.site.system] && this.t >= e.site.notchUntil;
  }

  /** Emitters the jet hears right now (transmitting and inside the trainer detection range). */
  contacts(): Contact[] {
    const out: Contact[] = [];
    for (const e of this.emitters()) {
      if (!this.transmitting(e)) continue;
      const r = this.relative(e.vehicle.pos);
      if (r.rangeM > TRAINER.detectM[e.site.system]) continue;
      const guiding = this.sams.some(m => m.alive && m.guided && m.siteId === e.site.id);
      out.push({ key: e.key, emitter: e, azDeg: r.azDeg, elDeg: r.elDeg, rangeM: r.rangeM, lockedYou: this.locks(e, r.rangeM), guiding });
    }
    return out;
  }

  /** Fire a HARM at an emitter (SP, TOO, Pullback). */
  launchAt(key: string): Harm {
    const e = this.emitter(key);
    const range0 = e ? hdist(this.jet.pos, e.vehicle.pos) : 30_000;
    return this.addHarm('direct', key, null, null, Math.min(20, (range0 / 1000) * 0.35), range0);
  }

  /** Fire a PB shot at a point with an emitter code. HRM pull-up lofts the missile more; A/C pull-up relies on the jet's climb. */
  launchPb(point: Vec3, code: number, pullup: Pullup): Harm {
    const range0 = hdist(this.jet.pos, point);
    const loft = pullup === 'HRM' ? Math.min(35, (range0 / 1000) * 0.6) : Math.min(15, (range0 / 1000) * 0.25);
    return this.addHarm('pb', null, point, code, loft, range0);
  }

  private addHarm(kind: Harm['kind'], key: string | null, point: Vec3 | null, code: number | null, loftDeg: number, range0: number): Harm {
    const d = this.noseDir();
    const s = this.jet.speed;
    const h: Harm = {
      id: `harm-${this.nextId++}`, pos: { ...this.jet.pos, y: this.jet.pos.y - 2 }, vel: v3(d.x * s, d.y * s, d.z * s), t0: this.t,
      kind, targetKey: key, pbPoint: point, pbCode: code, loftDeg, range0, lost: false, alive: true, evaded: false,
    };
    this.harms.push(h);
    this.events.push({ t: this.t, type: 'harm-launch', harmId: h.id, text: 'Magnum: HARM away' });
    return h;
  }

  dropChaff(): boolean {
    if (this.jet.chaff <= 0) return false;
    this.jet.chaff -= 1;
    this.jet.lastChaffT = this.t;
    return true;
  }

  /** HARM speed for its age (arcade curve). */
  static harmSpeed(age: number, v0: number): number {
    if (age < 5) return v0 + (680 - v0) * (age / 5);
    return Math.max(420, 680 - 2 * (age - 5));
  }

  /** Estimated time of flight to a horizontal distance (trainer: average speed). */
  static timeOfFlight(distM: number): number { return distM / 560 + 4; }

  step(dt: number): void {
    const n = Math.max(1, Math.ceil(dt / 0.02));
    const h = dt / n;
    for (let i = 0; i < n; i++) this.substep(h);
  }

  private substep(dt: number): void {
    this.t += dt;
    this.stepJet(dt);
    this.stepSites(dt);
    for (const m of this.harms) if (m.alive) this.stepHarm(m, dt);
    for (const m of this.sams) if (m.alive) this.stepSam(m, dt);
    this.blasts = this.blasts.filter(b => this.t - b.t < 4);
  }

  private stepJet(dt: number): void {
    const j = this.jet;
    if (!j.alive) return;
    j.headingRad += j.turnCmd * 4 * D2R * dt;
    if (j.pitchCmd !== 0) j.pitchRad += j.pitchCmd * 10 * D2R * dt;
    else j.pitchRad -= Math.sign(j.pitchRad) * Math.min(Math.abs(j.pitchRad), 6 * D2R * dt);
    j.pitchRad = Math.max(-15 * D2R, Math.min(50 * D2R, j.pitchRad));
    const d = this.noseDir();
    j.pos.x += d.x * j.speed * dt;
    j.pos.y = Math.max(300, j.pos.y + d.y * j.speed * dt);
    j.pos.z += d.z * j.speed * dt;
  }

  private stepSites(dt: number): void {
    const j = this.jet;
    for (const site of this.sites) {
      const radar = this.emitters().find(e => e.site === site && e.radar.job !== 'search' && this.transmitting(e));
      const r = radar ? this.relative(radar.vehicle.pos) : null;
      const locked = !!radar && !!r && this.locks(radar, r.rangeM);
      // Notch: beam the site (little closing speed) with chaff in the last 3 s breaks the lock for 4 s (Fox3 SAM notes).
      if (locked && radar) {
        const toJet = sub(j.pos, radar.vehicle.pos);
        const d = this.noseDir();
        const radial = (toJet.x * d.x + toJet.y * d.y + toJet.z * d.z) / Math.max(1, len(toJet)) * j.speed;
        if (Math.abs(radial) < 0.3 * j.speed && this.t - j.lastChaffT < 3) {
          site.notchUntil = this.t + 4;
          site.lockS = 0;
          continue;
        }
      }
      if (locked) {
        if (site.lockS === 0) this.events.push({ t: this.t, type: 'lock', siteId: site.id, text: `${SYSTEMS[site.system].nato.split(' ')[0]} locked you` });
        site.lockS += dt;
        const busy = this.sams.some(m => m.alive && m.siteId === site.id);
        if (site.lockS > 6 && !busy && site.missiles > 0 && j.alive) this.launchSam(site);
      } else site.lockS = 0;
    }
  }

  private launchSam(site: Site): void {
    const from = site.vehicles.find(v => v.alive && (v.id === 'sa6-tel' || v.id === 'sa11-telar' || v.id === 'sa10-ln' || v.id === 'sa8' || v.id === 'sa15'));
    if (!from) return;
    site.missiles -= 1;
    const up = v3(0, 60, 0);
    this.sams.push({ id: `sam-${this.nextId++}`, siteId: site.id, pos: { x: from.pos.x, y: from.pos.y + 4, z: from.pos.z }, vel: up, t0: this.t, guided: true, alive: true });
    this.events.push({ t: this.t, type: 'sam-launch', siteId: site.id, text: `${SYSTEMS[site.system].nato.split(' ')[0]} launch` });
  }

  private stepSam(m: SamMissile, dt: number): void {
    const site = this.sites.find(s => s.id === m.siteId)!;
    const radar = this.emitters().find(e => e.site === site && e.radar.job !== 'search' && this.transmitting(e));
    const r = radar ? this.relative(radar.vehicle.pos) : null;
    // Track-to-impact: the site's radar must hold the lock (Fox3 SAM notes).
    if (m.guided && !(radar && r && this.locks(radar, r.rangeM * 1.2))) {
      m.guided = false;
      this.events.push({ t: this.t, type: 'sam-miss', siteId: site.id, text: 'Their missile lost guidance' });
    }
    const age = this.t - m.t0;
    const speed = age < 2 ? 60 + 320 * age : Math.max(250, 700 - 6 * (age - 2));
    if (m.guided && this.jet.alive) steer(m.vel, sub(this.jet.pos, m.pos), speed, 30 * D2R * dt);
    else { m.vel.y -= G * dt; scaleTo(m.vel, Math.max(200, len(m.vel) - 8 * dt)); }
    if (m.guided) scaleTo(m.vel, speed);
    m.pos.x += m.vel.x * dt; m.pos.y += m.vel.y * dt; m.pos.z += m.vel.z * dt;
    if (this.jet.alive && len(sub(m.pos, this.jet.pos)) < 40) {
      m.alive = false;
      this.jet.alive = false;
      this.blasts.push({ pos: { ...this.jet.pos }, t: this.t });
      this.events.push({ t: this.t, type: 'jet-hit', siteId: site.id, text: 'You were hit' });
    } else if (m.pos.y < 0 || age > 60) m.alive = false;
  }

  private stepHarm(m: Harm, dt: number): void {
    const age = this.t - m.t0;
    const speed = HarmSim.harmSpeed(age, this.jet.speed);
    let target = m.targetKey ? this.emitter(m.targetKey) : null;

    // PB: fly to the point, switch the receiver on near it, look for the coded emitter (ED guide p373).
    if (m.kind === 'pb' && !m.targetKey && m.pbPoint && !m.lost && hdist(m.pos, m.pbPoint) < TRAINER.pbSeekerOnM) {
      const found = this.emitters().filter(e => this.transmitting(e) && e.radar.alic === m.pbCode && hdist(e.vehicle.pos, m.pbPoint!) < TRAINER.pbSearchRadiusM)
        .sort((a, b) => hdist(a.vehicle.pos, m.pbPoint!) - hdist(b.vehicle.pos, m.pbPoint!))[0];
      if (found) {
        m.targetKey = found.key;
        target = found;
        this.events.push({ t: this.t, type: 'harm-acquire', harmId: m.id, key: found.key, text: `HARM found the ${found.radar.name} (code ${found.radar.alic})` });
      } else {
        m.lost = true;
        this.events.push({ t: this.t, type: 'harm-lost', harmId: m.id, text: `HARM receiver on: no code ${m.pbCode} radar near the point` });
      }
    }

    // Homing needs a transmitting radar (ED guide p367).
    if (target && !m.lost && !this.transmitting(target)) {
      m.lost = true;
      this.events.push({ t: this.t, type: 'harm-lost', harmId: m.id, text: `The ${target.radar.name} went quiet: HARM lost guidance` });
    }

    // Evasion: a site that evades goes quiet when the HARM homing on it gets close.
    if (target && !m.lost && !m.evaded && target.site.evades && len(sub(target.vehicle.pos, m.pos)) < TRAINER.evadeAtM) {
      m.evaded = true;
      target.site.quietUntil = this.t + TRAINER.evadeForS;
      this.events.push({ t: this.t, type: 'radar-quiet', siteId: target.site.id, text: `${target.site.name} switched its radar off` });
    }

    const aim = m.lost ? null : target ? target.vehicle.pos : m.pbPoint;
    if (aim) {
      const d = sub(aim, m.pos);
      const dh = Math.hypot(d.x, d.z);
      const loftK = Math.max(0, Math.min(1, (dh - 3000) / Math.max(1, m.range0)));
      const el = Math.atan2(d.y, dh) + m.loftDeg * D2R * loftK;
      const want = v3(d.x / Math.max(1, dh) * Math.cos(el), Math.sin(el), d.z / Math.max(1, dh) * Math.cos(el));
      steer(m.vel, want, speed, 25 * D2R * dt);
      scaleTo(m.vel, speed);
    } else {
      m.vel.y -= G * dt;
    }
    m.pos.x += m.vel.x * dt; m.pos.y += m.vel.y * dt; m.pos.z += m.vel.z * dt;

    if (target && !m.lost && len(sub(target.vehicle.pos, m.pos)) < 30) {
      m.alive = false;
      target.vehicle.alive = false;
      this.blasts.push({ pos: { ...target.vehicle.pos }, t: this.t });
      this.events.push({ t: this.t, type: 'harm-kill', harmId: m.id, siteId: target.site.id, vehicle: target.vehicle.id, text: `${target.radar.name} destroyed` });
      return;
    }
    if (m.pos.y <= 0 || age > 240) {
      m.alive = false;
      this.blasts.push({ pos: { x: m.pos.x, y: 0, z: m.pos.z }, t: this.t });
      const reason = m.kind === 'pb' && !m.targetKey ? 'no-emitter' : m.lost ? 'lost' : 'ground';
      const text = reason === 'no-emitter' ? 'HARM missed: no radar of that code at the point'
        : reason === 'lost' ? 'HARM missed: the radar went quiet' : 'HARM hit the ground';
      this.events.push({ t: this.t, type: 'harm-miss', harmId: m.id, reason, text });
    }
  }

  /** Remaining time to impact of the newest live HARM (s), null if none. */
  timeToImpact(): number | null {
    const m = [...this.harms].reverse().find(x => x.alive);
    if (!m) return null;
    const aim = m.targetKey ? this.emitter(m.targetKey)?.vehicle.pos : m.pbPoint;
    if (!aim) return null;
    return len(sub(aim, m.pos)) / Math.max(200, len(m.vel));
  }

  /** Snapshot for the 3D scene. */
  scene(): SceneView {
    const lockedSites = new Set(this.contacts().filter(c => c.lockedYou).map(c => c.emitter.site.id));
    return {
      t: this.t,
      jet: { pos: { ...this.jet.pos }, headingRad: this.jet.headingRad, pitchRad: this.jet.pitchRad, alive: this.jet.alive },
      sites: this.sites.map(s => ({
        id: s.id, system: s.system,
        vehicles: s.vehicles.map(v => ({ id: v.id, pos: { ...v.pos }, headingRad: v.headingRad, emitter: !!v.radar, alive: v.alive })),
        emitting: s.active && this.t >= s.quietUntil && s.vehicles.some(v => v.radar && v.alive),
        lockedJet: lockedSites.has(s.id),
      })),
      harms: [
        ...this.harms.map(m => ({ id: m.id, pos: { ...m.pos }, vel: { ...m.vel }, lost: m.lost, alive: m.alive })),
      ],
      blasts: this.blasts.map(b => ({ pos: { ...b.pos }, age: this.t - b.t })),
    };
  }
}

/** Turn vector v toward direction `want` by at most `maxRad`, keeping |v| (set later). */
function steer(v: Vec3, want: Vec3, speed: number, maxRad: number): void {
  const vl = len(v) || 1, wl = len(want) || 1;
  const a = v3(v.x / vl, v.y / vl, v.z / vl), b = v3(want.x / wl, want.y / wl, want.z / wl);
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const ang = Math.acos(dot);
  if (ang < 1e-6) { v.x = b.x * speed; v.y = b.y * speed; v.z = b.z * speed; return; }
  const k = Math.min(1, maxRad / ang);
  // Normalised linear blend: close enough to a slerp for small steps.
  const c = v3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
  const cl = len(c) || 1;
  v.x = c.x / cl * speed; v.y = c.y / cl * speed; v.z = c.z / cl * speed;
}

function scaleTo(v: Vec3, s: number): void {
  const l = len(v) || 1;
  v.x *= s / l; v.y *= s / l; v.z *= s / l;
}

export const UNITS = { NM, FT, D2R, R2D };
