/**
 * [OWNER: page-strike] Su-25T sortie (strike page, lesson 'sortie'): mission rules and debrief metrics, pure
 * (World in, numbers out) so tests can fly it. Phases: ingress to the IP, attack, egress back past the IP; the
 * mission ends on egress, death or the time limit. The tracker listens to the World and keeps what the debrief
 * shows: per-weapon results with miss reasons, laser-on intervals, time inside each SAM ring and the ZSU-23-4
 * envelope, the Shkval gimbal margin at each guided launch (and its minimum while a laser weapon flies), kills.
 * Game level only (AGENTS.md rule 1). The ZSU-23-4 is a trainer gun-site rule (simplified, not verified).
 */
import { AG_WEAPONS, SU25T_LOADOUTS } from '../../data/agWeapons';
import type { AgWeaponId } from '../../data/types';
import type { World } from '../../sim/world';
import type { AgMissReason, Aircraft, EntityId, SimEvent } from '../../sim/types';
import { R2D, relBearing } from '../../sim/math';
import { SHKVAL_LOCK_GIMBAL } from '../../sim/shkval';
import { samRingM } from '../../sim/sam';
import { BUNKER_AT, COLUMN_AT, SORTIE_AAA_AT, SORTIE_IP, SORTIE_START, type Scenario } from './scenario';
import { MISS_TEXT, type Debrief } from './lessons';

/** Mission time limit (s). */
export const SORTIE_TIME_S = 600;
/** The IP counts as reached inside this radius (m). */
export const IP_RADIUS_M = 2000;
/** Ingress counts as low below this height above the ground (m). */
export const LOW_AGL_M = 150;
/** ZSU-23-4 trainer envelope: horizontal range and height above the site (m). Simplified, not verified. */
export const AAA_RING_M = 2500;
export const AAA_CEILING_M = 2000;
/** Seconds of exposure at the gun's feet (less farther out) that bring the jet down. Trainer value. */
export const AAA_LETHAL = 6;
/** Kh-58 detection zone half-width (deg, S1: ±30°). */
export const KH58_ZONE_DEG = 30;
/** Laser: S1 documents about 1 minute of continuous operation before it must cool (printed p. 57). */
export const LASER_CONTINUOUS_S = 60;

/** Target area centre, for steering and phases. */
export const SORTIE_TARGET = { x: COLUMN_AT.x, z: COLUMN_AT.z } as const;
export const IP_DIST_M = Math.hypot(SORTIE_IP.x - SORTIE_TARGET.x, SORTIE_IP.z - SORTIE_TARGET.z);

/** Loadouts offered in the brief (SU25T_LOADOUTS) with the plan each one implies. */
export const SORTIE_PLANS: Record<string, string> = {
  vikhr: 'Stand off: Vikhrs on the column from 8–10 km, outside the SA-15 ring. S-8 rockets for what is left.',
  laser: 'Kh-25ML and Kh-29L on the bunker, Vikhrs on the column. Lase every missile to impact.',
  tv: 'Kh-29T and KAB-500Kr: lock with the Shkval and launch. They guide themselves; the KAB needs height.',
  unguided: 'Bombs and rockets only: you must overfly the target inside the SA-15 ring and the ZSU-23-4. High risk.',
  sead: 'Kh-58 on the SA-15 from beyond 12 km first, then Vikhrs on the column.',
};
export const SORTIE_LOADOUTS = SU25T_LOADOUTS.map(l => ({ id: l.id, name: l.name, plan: SORTIE_PLANS[l.id] ?? '' }));

export type SortiePhase = 'ingress' | 'attack' | 'egress';
export type EndReason = 'egress' | 'dead' | 'time' | 'pilot';
export interface Interval { from: number; to: number | null }

export interface SortieShot {
  id: EntityId;
  weapon: AgWeaponId;
  t: number;
  rangeM: number | null;
  guided: boolean;
  targetId: EntityId | null;
  result: 'flying' | 'hit' | 'miss';
  reason: AgMissReason | 'hit' | null;
  killed: EntityId[];
  endT: number | null;
  /** Gimbal margin (deg) at launch: Shkval lock gimbal for sight-guided stores, the ±30° zone for the Kh-58. */
  launchMarginDeg: number | null;
  /** Smallest Shkval margin while a laser weapon flew guided. */
  minMarginDeg: number | null;
}

export type MarkerKind = 'ip' | 'launch' | 'hit' | 'miss' | 'kill' | 'sam' | 'damage' | 'egress' | 'flare' | 'lock';
export interface Marker { t: number; kind: MarkerKind; text: string; tone: 'ok' | 'caution' | 'warning' | 'dim' }

export interface Exposure { id: EntityId; name: string; ringM: number; s: number; intervals: Interval[] }

/** Shkval lock-gimbal margin (deg) from az / el (rad): how far the line of sight is from the nearest limit. */
export function shkvalMarginDeg(az: number, el: number): number {
  const a = Math.abs(az * R2D), e = el * R2D;
  return Math.min(SHKVAL_LOCK_GIMBAL.azDeg - a, SHKVAL_LOCK_GIMBAL.elUpDeg - e, e - SHKVAL_LOCK_GIMBAL.elDownDeg);
}

/** Steering to a point: bearing (deg true, 0..360), range (m), turn (deg, + right). */
export function navCue(me: Pick<Aircraft, 'pos' | 'heading'>, p: { x: number; z: number }): { brgDeg: number; rangeM: number; turnDeg: number } {
  const dx = p.x - me.pos.x, dz = p.z - me.pos.z;
  const brg = Math.atan2(dx, -dz);
  let turn = brg - me.heading;
  while (turn > Math.PI) turn -= 2 * Math.PI;
  while (turn < -Math.PI) turn += 2 * Math.PI;
  return { brgDeg: ((brg * R2D) % 360 + 360) % 360, rangeM: Math.hypot(dx, dz), turnDeg: turn * R2D };
}

/** The steer point for the phase: the IP on ingress, the target on the attack, the IP then home on egress. */
export function steerPoint(phase: SortiePhase, egressPastIp = false): { name: string; x: number; z: number } {
  if (phase === 'ingress') return { name: 'IP', ...SORTIE_IP };
  if (phase === 'attack') return { name: 'Target', ...SORTIE_TARGET };
  return egressPastIp ? { name: 'Home', ...SORTIE_START } : { name: 'IP', ...SORTIE_IP };
}

/** Trainer terrain following: the altitude that holds `aglM` above the highest ground over the next 1.2 km. */
export function terrainFollowAlt(world: World, ac: Pick<Aircraft, 'pos' | 'vel'>, aglM: number): number {
  const sp = Math.max(1, Math.hypot(ac.vel.x, ac.vel.z));
  let g = world.groundHeight(ac.pos.x, ac.pos.z);
  for (let d = 200; d <= 1200; d += 200) g = Math.max(g, world.groundHeight(ac.pos.x + ac.vel.x / sp * d, ac.pos.z + ac.vel.z / sp * d));
  return g + aglM;
}

const LASER_GUIDED = (w: AgWeaponId) => AG_WEAPONS[w].guidance === 'laser' || AG_WEAPONS[w].guidance === 'beam-riding';
const SIGHT_GUIDED = (w: AgWeaponId) => LASER_GUIDED(w) || AG_WEAPONS[w].guidance === 'tv';

/**
 * Live mission tracker. Construct it right after the scenario, call step(dt) after every world.step, read
 * endReason(), then summary(). dispose() unsubscribes from the World.
 */
export class SortieTracker {
  phase: SortiePhase = 'ingress';
  ipAt: number | null = null;
  attackStarted = false;
  egressAt: number | null = null;
  endT: number | null = null;
  readonly laser: Interval[] = [];
  readonly rings: Exposure[];
  readonly aaa: Exposure | null;
  aaaDamage = 0;
  readonly shots = new Map<EntityId, SortieShot>();
  readonly markers: Marker[] = [];
  readonly kills: { t: number; id: EntityId; name: string }[] = [];
  flares = 0;
  samLaunches = 0;
  hitsTaken = 0;
  killedBy: 'sam' | 'aaa' | null = null;
  ingressS = 0;
  lowS = 0;
  private minRange = Infinity;
  private off: () => void;

  constructor(readonly world: World, readonly sc: Scenario) {
    this.rings = sc.sams.map(id => {
      const s = world.samSites.get(id)!;
      return { id, name: s.callsign, ringM: samRingM(s.type), s: 0, intervals: [] };
    });
    this.aaa = sc.aaa ? { id: sc.aaa, name: 'ZSU-23-4', ringM: AAA_RING_M, s: 0, intervals: [] } : null;
    this.off = world.on(e => this.onEvent(e));
  }

  dispose(): void { this.off(); }

  get me(): Aircraft { return this.sc.me; }

  private mark(t: number, kind: MarkerKind, text: string, tone: Marker['tone']): void { this.markers.push({ t, kind, text, tone }); }

  private name(id: EntityId | null): string {
    if (!id) return 'target';
    return this.world.groundUnits.get(id)?.name ?? this.world.samSites.get(id)?.callsign ?? id;
  }

  private onEvent(e: SimEvent): void {
    const me = this.me, w = this.world;
    switch (e.type) {
      case 'laser':
        if (e.ownerId !== me.id) break;
        if (e.on) this.laser.push({ from: e.t, to: null });
        else { const l = this.laser[this.laser.length - 1]; if (l && l.to == null) l.to = e.t; }
        break;
      case 'shkval-lock':
        if (e.ownerId === me.id) this.mark(e.t, 'lock', `АС: ${this.name(e.unitId)} at ${(e.range / 1000).toFixed(1)} km`, 'dim');
        break;
      case 'ag-launch': {
        if (e.shooterId !== me.id) break;
        const spec = AG_WEAPONS[e.weapon];
        let margin: number | null = null;
        if (SIGHT_GUIDED(e.weapon)) margin = shkvalMarginDeg(me.ag!.shkval.az, me.ag!.shkval.el);
        else if (e.weapon === 'kh58' && e.targetId) {
          const site = w.samSites.get(e.targetId);
          if (site) margin = KH58_ZONE_DEG - Math.abs(relBearing(me.pos, me.heading, site.pos) * R2D);
        }
        this.shots.set(e.weaponId, {
          id: e.weaponId, weapon: e.weapon, t: e.t, rangeM: e.range, guided: spec.guidance !== 'ballistic', targetId: e.targetId,
          result: 'flying', reason: null, killed: [], endT: null, launchMarginDeg: margin, minMarginDeg: LASER_GUIDED(e.weapon) ? margin : null,
        });
        // Guns fire bursts of rounds: one marker per trigger press is enough.
        const last = this.markers[this.markers.length - 1];
        if (!(e.weapon === 'gun25t' && last?.kind === 'launch' && e.t - last.t < 0.5)) {
          this.mark(e.t, 'launch', `${spec.hudLabel} away${e.range != null ? ` at ${(e.range / 1000).toFixed(1)} km` : ''}${e.targetId ? `, ${this.name(e.targetId)}` : ''}`, 'dim');
        }
        this.attackStarted = true;
        break;
      }
      case 'ag-miss': {
        const s = this.shots.get(e.weaponId);
        if (s && (s.result === 'flying' || s.reason === 'ground')) {
          s.result = 'miss'; s.reason = e.reason; s.endT = e.t;
          if (s.guided) this.mark(e.t, 'miss', `${AG_WEAPONS[s.weapon].hudLabel} missed: ${e.reason}`, 'caution');
        }
        break;
      }
      case 'ag-impact': {
        const s = this.shots.get(e.weaponId);
        if (!s || s.result !== 'flying') break;
        const hit = e.killed.length > 0 || e.targetId != null;
        s.result = hit ? 'hit' : 'miss'; s.reason = hit ? 'hit' : 'ground'; s.killed = [...e.killed]; s.endT = e.t;
        if (s.guided && hit) this.mark(e.t, 'hit', `${AG_WEAPONS[s.weapon].hudLabel} hit ${this.name(e.targetId ?? e.killed[0] ?? null)}`, 'ok');
        break;
      }
      case 'ground-kill':
        if (this.kills.some(k => k.id === e.targetId)) break;
        this.kills.push({ t: e.t, id: e.targetId, name: this.name(e.targetId) });
        this.mark(e.t, 'kill', `${this.name(e.targetId)} destroyed`, 'ok');
        break;
      case 'sam':
        if (e.targetId !== me.id) break;
        if (e.what === 'launch') { this.samLaunches++; this.mark(e.t, 'sam', `SPO-15 launch: ${w.samSites.get(e.siteId)?.callsign ?? 'SAM'}`, 'warning'); }
        break;
      case 'hit':
        if (e.targetId === me.id) { this.hitsTaken++; this.killedBy ??= 'sam'; this.mark(e.t, 'damage', 'Hit by a SAM', 'warning'); }
        break;
      case 'cm':
        if (e.ownerId === me.id && e.what === 'flare') {
          this.flares++;
          const last = this.markers[this.markers.length - 1];
          if (!(last?.kind === 'flare' && e.t - last.t < 2)) this.mark(e.t, 'flare', 'Flares', 'dim');
        }
        break;
      default: break;
    }
  }

  /** One tick after world.step: phases, exposure, the gun site, gimbal margins of laser weapons in flight. */
  step(dt: number): void {
    const w = this.world, me = this.me, t = w.t;
    if (this.endT != null) return;
    if (!me.alive) return;
    const d = Math.hypot(me.pos.x - SORTIE_TARGET.x, me.pos.z - SORTIE_TARGET.z);
    const agl = me.pos.y - w.groundHeight(me.pos.x, me.pos.z);
    if (this.phase === 'ingress') {
      this.ingressS += dt;
      if (agl < LOW_AGL_M) this.lowS += dt;
      if (Math.hypot(me.pos.x - SORTIE_IP.x, me.pos.z - SORTIE_IP.z) <= IP_RADIUS_M) {
        this.phase = 'attack'; this.ipAt = t; this.mark(t, 'ip', 'IP: turn in and pop up', 'dim');
      }
    }
    if (d < IP_DIST_M - 1500) this.attackStarted = true;
    if (this.phase !== 'egress') {
      this.minRange = Math.min(this.minRange, d);
      if (this.attackStarted && d > this.minRange + 1000) { this.phase = 'egress'; this.mark(t, 'egress', 'Egress', 'dim'); }
    } else if (this.egressAt == null && d > IP_DIST_M + 500) {
      this.egressAt = t; this.mark(t, 'egress', 'Out past the IP', 'ok');
    }
    // SAM rings: slant range to a live site.
    for (const r of this.rings) {
      const s = w.samSites.get(r.id);
      this.expose(r, !!s?.alive && me.pos.distanceTo(s.pos) <= r.ringM, t, dt);
    }
    if (this.aaa) {
      const u = w.groundUnits.get(this.aaa.id);
      let inside = false, depth = 0;
      if (u?.alive) {
        const hd = Math.hypot(me.pos.x - u.pos.x, me.pos.z - u.pos.z);
        const hgt = me.pos.y - u.pos.y;
        if (hd <= AAA_RING_M && hgt <= AAA_CEILING_M && w.lineOfSight({ x: u.pos.x, y: u.pos.y + 3, z: u.pos.z }, me.pos)) {
          inside = true; depth = 1 - hd / AAA_RING_M;
        }
      }
      this.expose(this.aaa, inside, t, dt);
      if (inside) {
        this.aaaDamage += dt * (0.3 + 0.7 * depth);
        if (this.aaaDamage >= AAA_LETHAL) {
          this.killedBy ??= 'aaa';
          this.mark(t, 'damage', 'Shot down by the ZSU-23-4', 'warning');
          w.kill(me.id, this.aaa.id);
        }
      }
    }
    // Laser weapons in flight: the smallest Shkval margin while they still guide.
    const sh = me.ag!.shkval;
    for (const s of this.shots.values()) {
      if (s.result !== 'flying' || s.minMarginDeg == null) continue;
      const wp = w.agWeapons.get(s.id);
      if (!wp?.alive || !wp.guided) continue;
      s.minMarginDeg = Math.min(s.minMarginDeg, shkvalMarginDeg(sh.az, sh.el));
    }
  }

  private expose(x: Exposure, inside: boolean, t: number, dt: number): void {
    const last = x.intervals[x.intervals.length - 1];
    if (inside) {
      x.s += dt;
      if (!last || last.to != null) x.intervals.push({ from: Math.max(0, t - dt), to: null });
    } else if (last && last.to == null) last.to = t;
  }

  /** Why the mission ends now, or null. Egress waits for the phase; weapons in flight are the page's call. */
  endReason(limitS = SORTIE_TIME_S): EndReason | null {
    if (!this.me.alive) return 'dead';
    if (this.egressAt != null) return 'egress';
    if (this.world.t >= limitS) return 'time';
    return null;
  }

  /** Close open intervals and flying shots at the end time. */
  close(t = this.world.t): void {
    if (this.endT != null) return;
    this.endT = t;
    for (const l of this.laser) if (l.to == null) l.to = t;
    for (const x of [...this.rings, ...(this.aaa ? [this.aaa] : [])]) for (const l of x.intervals) if (l.to == null) l.to = t;
    for (const s of this.shots.values()) if (s.result === 'flying') { s.result = 'miss'; s.reason = 'timeout'; s.endT = t; }
  }

  summary(end: EndReason, loadout: string): SortieSummary {
    const w = this.world, sc = this.sc;
    const dead = (id: EntityId) => !w.groundUnits.get(id)?.alive;
    const column = [...sc.tanks, ...sc.apcs];
    const laserS = this.laser.reduce((a, l) => a + ((l.to ?? w.t) - l.from), 0);
    const longestLaserS = this.laser.reduce((a, l) => Math.max(a, (l.to ?? w.t) - l.from), 0);
    return {
      loadout, end, t: this.endT ?? w.t, alive: this.me.alive, killedBy: this.me.alive ? null : this.killedBy ?? 'sam',
      column: { total: column.length, killed: column.filter(dead).length },
      bunker: dead(sc.bunker),
      trucksKilled: sc.trucks.filter(dead).length,
      samsKilled: sc.sams.filter(id => !w.samSites.get(id)?.alive).length, samsTotal: sc.sams.length,
      aaaKilled: sc.aaa != null && dead(sc.aaa),
      shots: [...this.shots.values()],
      laserS, longestLaserS, laserIntervals: this.laser.map(l => ({ ...l })),
      rings: this.rings.map(r => ({ ...r, intervals: r.intervals.map(i => ({ ...i })) })),
      ringS: this.rings.reduce((a, r) => a + r.s, 0),
      aaaS: this.aaa?.s ?? 0,
      aaaIntervals: this.aaa?.intervals.map(i => ({ ...i })) ?? [],
      ipReached: this.ipAt != null,
      lowFrac: this.ingressS > 0 ? this.lowS / this.ingressS : 0,
      flares: this.flares, samLaunches: this.samLaunches, hitsTaken: this.hitsTaken,
    };
  }
}

export interface SortieSummary {
  loadout: string;
  end: EndReason;
  t: number;
  alive: boolean;
  killedBy: 'sam' | 'aaa' | null;
  column: { total: number; killed: number };
  bunker: boolean;
  trucksKilled: number;
  samsKilled: number;
  samsTotal: number;
  aaaKilled: boolean;
  shots: SortieShot[];
  laserS: number;
  longestLaserS: number;
  laserIntervals: Interval[];
  rings: Exposure[];
  ringS: number;
  aaaS: number;
  aaaIntervals: Interval[];
  ipReached: boolean;
  /** Share of the ingress flown below LOW_AGL_M. */
  lowFrac: number;
  flares: number;
  samLaunches: number;
  hitsTaken: number;
}

/** Per weapon type: fired (trigger presses for the gun count rounds), hits, misses by reason. */
export interface WeaponRow { weapon: AgWeaponId; label: string; fired: number; hits: number; misses: Partial<Record<AgMissReason, number>> }
export function weaponRows(shots: readonly SortieShot[]): WeaponRow[] {
  const rows = new Map<AgWeaponId, WeaponRow>();
  for (const s of shots) {
    const r = rows.get(s.weapon) ?? { weapon: s.weapon, label: `${AG_WEAPONS[s.weapon].name} (${AG_WEAPONS[s.weapon].hudLabel})`, fired: 0, hits: 0, misses: {} };
    r.fired++;
    if (s.result === 'hit') r.hits++;
    else if (s.reason && s.reason !== 'hit') r.misses[s.reason] = (r.misses[s.reason] ?? 0) + 1;
    rows.set(s.weapon, r);
  }
  return [...rows.values()];
}

/** Miss reasons that are the pilot's doing (the rule of the weapon broke). */
export const PILOT_MISS: readonly AgMissReason[] = ['lock-lost', 'laser-off', 'gimbal', 'terrain'];
/** A guided launch this close to the gimbal edge (deg) earns a coaching line. */
export const TIGHT_MARGIN_DEG = 8;

export interface SortieScore extends Debrief { score: number }

/**
 * Score out of 100: the column (45) and the bunker (15), a SAM killed (10), getting home (30, 10 on time out),
 * minus time inside SAM rings past 10 s, pilot-error misses and the gun envelope. Stars 3 / 2 / 1 at 85 / 60 / 30;
 * shot down caps at one star.
 */
export function scoreSortie(s: SortieSummary): SortieScore {
  const colPts = s.column.total ? 45 * s.column.killed / s.column.total : 0;
  const pos = colPts + (s.bunker ? 15 : 0) + (s.samsKilled > 0 ? 10 : 0) + (s.alive ? (s.end === 'egress' ? 30 : 10) : 0);
  const pilotMisses = s.shots.filter(x => x.result === 'miss' && x.reason && PILOT_MISS.includes(x.reason as AgMissReason));
  const pen = Math.min(15, Math.max(0, s.ringS - 10) / 2) + Math.min(15, 5 * pilotMisses.length) + Math.min(10, s.aaaS / 2);
  const score = Math.max(0, Math.min(100, Math.round(pos - pen)));
  const stars: Debrief['stars'] = !s.alive ? (score >= 30 ? 1 : 0) : score >= 85 ? 3 : score >= 60 ? 2 : score >= 30 ? 1 : 0;

  const km = (m: number) => (m / 1000).toFixed(1);
  const lines = [
    `Armour column ${s.column.killed} of ${s.column.total}, bunker ${s.bunker ? 'destroyed' : 'standing'}${s.trucksKilled ? `, trucks ${s.trucksKilled}` : ''}`,
    `SAM sites destroyed ${s.samsKilled} of ${s.samsTotal}${s.aaaKilled ? ', ZSU-23-4 destroyed' : ''}`,
    `Laser on ${Math.round(s.laserS)} s in ${s.laserIntervals.length} burst${s.laserIntervals.length === 1 ? '' : 's'}, longest ${Math.round(s.longestLaserS)} s`,
    `Inside SAM rings ${Math.round(s.ringS)} s, gun envelope ${Math.round(s.aaaS)} s, SAMs fired at you ${s.samLaunches}`,
    s.alive ? (s.end === 'egress' ? 'Egressed past the IP' : s.end === 'time' ? 'Time limit reached' : 'Mission ended by the pilot') : `Shot down by the ${s.killedBy === 'aaa' ? 'ZSU-23-4' : 'SAM'}`,
  ];

  const coaching: string[] = [];
  const reasons = new Map<AgMissReason, number>();
  for (const m of s.shots) if (m.result === 'miss' && m.guided && m.reason && m.reason !== 'hit') reasons.set(m.reason, (reasons.get(m.reason) ?? 0) + 1);
  for (const [r, n] of reasons) coaching.push(`${n} × ${MISS_TEXT[r]}`);
  const tight = s.shots.filter(x => x.launchMarginDeg != null && x.launchMarginDeg < TIGHT_MARGIN_DEG);
  if (tight.length) coaching.push(`${tight.length} guided launch${tight.length > 1 ? 'es' : ''} within ${TIGHT_MARGIN_DEG}° of the gimbal edge (worst ${Math.min(...tight.map(x => x.launchMarginDeg!)).toFixed(0)}°). Point the nose at the target before launch.`);
  const squeezed = s.shots.filter(x => x.minMarginDeg != null && x.minMarginDeg < 3 && x.result !== 'hit');
  if (squeezed.length && !reasons.has('gimbal')) coaching.push('You turned away while a laser weapon flew: keep the target inside ±35° until impact.');
  if (!s.ipReached) coaching.push('You never flew the IP. It lines up the run-in outside the SA-15 ring and away from the gun.');
  if (s.lowFrac < 0.5) coaching.push(`Only ${Math.round(s.lowFrac * 100)} % of the ingress below ${LOW_AGL_M} m. Low, the terrain hides you from the SAM radars until the pop-up.`);
  if (s.ringS > 10) coaching.push(`${Math.round(s.ringS)} s inside a SAM ring. Fire from outside it (Vikhr 10 km, Kh-58 well beyond 12 km) or kill the SA-15 first.`);
  if (s.aaaS > 3) coaching.push(`${Math.round(s.aaaS)} s inside the ZSU-23-4 envelope (2.5 km, trainer value). Stay out of gun range: stand off with guided weapons.`);
  if (s.longestLaserS > LASER_CONTINUOUS_S) coaching.push(`Laser on ${Math.round(s.longestLaserS)} s in one go. S1: about 1 minute continuous, then it must cool. Lase for range and guidance only.`);
  if (s.flares > 0 && s.samLaunches > 0) coaching.push('Flares decoy IR missiles only. The SA-15 and SA-11 are radar guided: notch and descend instead (the Su-25T carries no chaff).');
  if (s.samLaunches > 0 && s.alive) coaching.push('A SAM was fired at you. On the SPO-15 launch cue put it at 3 or 9 o\'clock and descend into the terrain.');
  if (!s.shots.length) coaching.push('Nothing fired. Past the IP: pop up, 7, O, find the column, lock (10 m), laser on, fire at ПР.');
  if (s.end === 'time') coaching.push(`Time limit ${SORTIE_TIME_S / 60} min: keep the attack to one or two passes and get out.`);
  if (!s.alive) coaching.push(s.killedBy === 'aaa' ? 'The gun got you: never overfly a defended target low when a stand-off weapon will do.' : 'Shot down by a SAM. Stay outside the ring, low, and notch on the launch cue.');
  if (stars === 3) coaching.push('Clean sortie: in low, on target, out past the IP.');

  const title = !s.alive ? 'Shot down' : ['Mission failed', 'Partial success', 'Mission success', 'Clean sortie'][stars]!;
  return { score, stars, title, lines, coaching, passed: stars >= 2 };
}

/** Plan-view objects the brief map and the replay share (m). */
export const PLAN = { start: SORTIE_START, ip: SORTIE_IP, target: SORTIE_TARGET, bunker: BUNKER_AT, aaa: SORTIE_AAA_AT } as const;

/** Progress key for the sortie. */
export const SORTIE_PROGRESS = 'strike:sortie:su25t';
