/**
 * Live sortie recorder. Listens to the World's events and samples it after every sim chunk, so the
 * debrief can say what happened: one ShotRecord per missile (launch zone and aspect at launch, first RWR
 * warning on the target, datalink loss, pitbull, outcome, F-pole, how the shooter cranked while guiding),
 * player-centred samples every 0.5 s (bandit ranges and Rne, missiles aimed at you, radar mode), and the
 * player's radar actions. The analysis itself is pure (coach.ts).
 */
import { Vector3 } from 'three';
import type { AircraftId, MissileId } from '../../data/types';
import { AIRCRAFT } from '../../data/aircraft';
import { MISSILES } from '../../data/missiles';
import type { World } from '../../sim/world';
import type { Aircraft, EntityId, Missile, SimEvent } from '../../sim/types';
import { dlzFor } from '../../sim/dlz';
import { aspectAngle, R2D, relBearing } from '../../sim/math';
import { mach } from '../../sim/atmosphere';
import { aiStatus } from '../../sim/ai';
import type { Engagement } from '../../sim/scenarios';
import type { Units } from '../../app/format';
import type { BanditSample, CoachInput, PlayerAction, Sample, ShotRecord, ThreatSample } from './coach';

const SAMPLE_EVERY = 0.5;
/** Event types kept for the debrief (the World's own list is capped). */
const KEEP = new Set<SimEvent['type']>(['launch', 'pitbull', 'datalink-lost', 'seeker-lost', 'hit', 'miss', 'kill', 'lock', 'cm', 'ai', 'rwr', 'note']);

/** Best missile a jet still carries (radar first, longest head-on reference range). */
export function bestMissile(ac: Aircraft): MissileId | null {
  let best: MissileId | null = null, score = -1;
  for (const [id, n] of Object.entries(ac.stores) as [MissileId, number][]) {
    if (!n) continue;
    const m = MISSILES[id];
    const s = (m.seeker === 'ir' ? 0 : 1000) + m.ref.highHeadOnKm;
    if (s > score) { score = s; best = id; }
  }
  return best;
}

export function missilesLeft(ac: Aircraft): number {
  let n = 0;
  for (const v of Object.values(ac.stores)) n += v ?? 0;
  return n;
}

const offNose = (from: Aircraft, to: Vector3) => Math.abs(relBearing(from.pos, from.heading, to)) * R2D;

export class SortieRecorder {
  readonly events: SimEvent[] = [];
  readonly shots: ShotRecord[] = [];
  readonly samples: Sample[] = [];
  readonly actions: PlayerAction[] = [];
  private byId = new Map<EntityId, ShotRecord>();
  private support = new Map<EntityId, { sum: number; max: number; seconds: number }>();
  private lastSample = -Infinity;
  private lastTick: number;
  private playerShots = 0;
  private off: () => void;

  constructor(private world: World, readonly eng: Engagement, readonly playerType: AircraftId, readonly units: Units) {
    this.lastTick = world.t;
    this.off = world.on(e => this.onEvent(e));
  }

  dispose(): void { this.off(); }

  /** Log a player radar/weapon action (for the "you locked B while M3 was on datalink to A" analysis). */
  action(kind: PlayerAction['kind'], detail?: string, targetId?: EntityId | null): void {
    this.actions.push({ t: this.world.t, kind, detail, targetId });
  }

  shot(id: EntityId): ShotRecord | undefined { return this.byId.get(id); }

  private onEvent(e: SimEvent): void {
    if (!KEEP.has(e.type)) return;
    if (e.type === 'rwr' && e.ownerId !== this.eng.playerId && !this.eng.friendIds.includes(e.ownerId) && !this.eng.enemyIds.includes(e.ownerId)) return;
    this.events.push(e);
    const w = this.world;
    switch (e.type) {
      case 'launch': {
        const shooter = w.get(e.shooterId);
        const m = w.missiles.get(e.missileId);
        if (!shooter) return;
        const target = w.get(e.targetId);
        const own = e.shooterId === this.eng.playerId;
        let range: number | null = null, dlz: { rmax: number; rne: number; rmin: number } | null = null, aspect: number | null = null;
        if (target) {
          range = shooter.pos.distanceTo(target.pos);
          const d = dlzFor(shooter.pos, shooter.vel, target.pos, target.vel, e.missile);
          dlz = { rmax: d.rmax, rne: d.rne, rmin: d.rmin };
          aspect = aspectAngle(target.pos, target.vel, shooter.pos) * R2D;
        }
        const rec: ShotRecord = {
          id: e.missileId, label: own ? `M${++this.playerShots}` : MISSILES[e.missile].name, missile: e.missile,
          shooterId: e.shooterId, targetId: e.targetId, side: m?.side ?? shooter.side, t: e.t,
          range, rmax: dlz?.rmax ?? null, rne: dlz?.rne ?? null, rmin: dlz?.rmin ?? null,
          radarMode: e.radarMode, targetAspectDeg: aspect,
          shooterAlt: shooter.pos.y, targetAlt: target?.pos.y ?? null, shooterMach: mach(shooter.vel.length(), shooter.pos.y),
          endT: null, outcome: 'flying', reason: null, fPole: null, warnedAt: null, warnKind: null,
          pitbullAt: null, datalinkLost: null, seekerLost: null, support: null,
        };
        this.shots.push(rec);
        this.byId.set(rec.id, rec);
        break;
      }
      case 'pitbull': { const s = this.byId.get(e.missileId); if (s && s.pitbullAt === null) s.pitbullAt = e.t; break; }
      case 'datalink-lost': { const s = this.byId.get(e.missileId); if (s && !s.datalinkLost) s.datalinkLost = { t: e.t, why: e.why }; break; }
      case 'seeker-lost': { const s = this.byId.get(e.missileId); if (s && !s.seekerLost) s.seekerLost = { t: e.t, why: e.why }; break; }
      case 'hit': case 'miss': {
        const s = this.byId.get(e.missileId);
        if (!s || s.outcome !== 'flying') return;
        s.outcome = e.type;
        s.reason = e.type === 'miss' ? e.reason : null;
        s.endT = e.t;
        const sh = w.get(s.shooterId), tg = w.get(s.targetId);
        s.fPole = sh && tg ? sh.pos.distanceTo(tg.pos) : null;
        this.closeSupport(s);
        break;
      }
      case 'rwr': this.warnFromRwr(e.ownerId, e.emitterId, e.state, e.t); break;
      default: break;
    }
  }

  private warnFromRwr(ownerId: EntityId, emitterId: EntityId, state: string, t: number): void {
    if (state === 'missile') {
      const s = this.byId.get(emitterId);
      if (s && s.targetId === ownerId && s.warnedAt === null) { s.warnedAt = t; s.warnKind = 'missile'; }
    } else if (state === 'launch') {
      const s = this.shots.find(x => x.shooterId === emitterId && x.targetId === ownerId && x.outcome === 'flying' && x.warnedAt === null && MISSILES[x.missile].seeker !== 'ir');
      if (s) { s.warnedAt = t; s.warnKind = 'launch'; }
    }
  }

  private closeSupport(s: ShotRecord): void {
    const a = this.support.get(s.id);
    if (a && a.seconds > 0) s.support = { meanOffNoseDeg: a.sum / a.seconds, maxOffNoseDeg: a.max, seconds: a.seconds };
  }

  /** Call after every world.step chunk. */
  tick(): void {
    const w = this.world;
    const dt = Math.max(0, w.t - this.lastTick);
    this.lastTick = w.t;
    for (const s of this.shots) {
      if (s.outcome !== 'flying') continue;
      const m = w.missiles.get(s.id);
      if (!m) continue;
      const target = w.get(s.targetId);
      // First warning on the target's RWR (the rwr event can be missed when the contact was already at 'launch').
      if (s.warnedAt === null && target?.alive) {
        for (const c of target.rwr) {
          if (c.state === 'missile' && c.emitterId === s.id) { s.warnedAt = w.t; s.warnKind = 'missile'; break; }
          if (c.state === 'launch' && c.emitterId === s.shooterId && c.missileType === s.missile) { s.warnedAt = w.t; s.warnKind = 'launch'; break; }
        }
      }
      // Support geometry while the shooter guides it.
      const sh = w.get(s.shooterId);
      if (dt > 0 && sh?.alive && target?.alive && (m.guidance === 'datalink' || m.guidance === 'sarh')) {
        const off = offNose(sh, target.pos);
        const a = this.support.get(s.id) ?? { sum: 0, max: 0, seconds: 0 };
        a.sum += off * dt; a.seconds += dt; a.max = Math.max(a.max, off);
        this.support.set(s.id, a);
        s.support = { meanOffNoseDeg: a.sum / a.seconds, maxOffNoseDeg: a.max, seconds: a.seconds };
      }
    }
    if (w.t - this.lastSample >= SAMPLE_EVERY) { this.lastSample = w.t; this.sample(); }
  }

  private sample(): void {
    const w = this.world;
    const me = w.get(this.eng.playerId);
    if (!me) return;
    const bandits: BanditSample[] = [];
    for (const id of this.eng.enemyIds) {
      const b = w.get(id);
      if (!b) continue;
      let rne: number | null = null, rmax: number | null = null;
      const best = b.alive ? bestMissile(b) : null;
      if (best && me.alive) { const d = dlzFor(b.pos, b.vel, me.pos, me.vel, best); rne = d.rne; rmax = d.rmax; }
      bandits.push({
        id, alive: b.alive, range: me.pos.distanceTo(b.pos), offNoseDeg: offNose(me, b.pos),
        banditHotDeg: offNose(b, me.pos), rne, rmax, defending: aiStatus(b)?.state === 'defend',
      });
    }
    const threats: ThreatSample[] = [];
    for (const m of w.missiles.values()) {
      if (!m.alive || m.targetId !== me.id) continue;
      threats.push(threatOf(me, m));
    }
    this.samples.push({
      t: w.t, alive: me.alive, alt: me.pos.y, speed: me.vel.length(),
      radarMode: me.radar.mode, sttTarget: me.radar.stt.targetId, designated: me.radar.designated.slice(),
      rwrTop: me.rwr[0]?.state ?? 'none', bandits, threats,
    });
  }

  /** Everything coach.ts needs. */
  input(): CoachInput {
    const w = this.world;
    const names: Record<EntityId, string> = {};
    for (const a of w.aircraft.values()) names[a.id] = a.callsign;
    const me = w.get(this.eng.playerId);
    const spec = AIRCRAFT[this.playerType];
    const twsLaunch = !!spec.radar.tws?.launchFromTws && spec.missiles.some(m => MISSILES[m].seeker === 'arh');
    for (const s of this.shots) if (s.outcome === 'flying') this.closeSupport(s);
    return {
      playerId: this.eng.playerId, playerType: this.playerType, friends: this.eng.friendIds.slice(), enemies: this.eng.enemyIds.slice(),
      names, units: this.units, gimbalDeg: spec.radar.gimbalAzDeg, twsLaunch, autoStt: !!spec.radar.tws?.autoSttAtRmaxFraction,
      events: this.events.slice(), shots: this.shots.map(s => ({ ...s })), samples: this.samples, actions: this.actions.slice(),
      endT: w.t, playerMissilesLeft: me ? missilesLeft(me) : 0,
    };
  }
}

function threatOf(me: Aircraft, m: Missile): ThreatSample {
  return {
    id: m.id, shooterId: m.shooterId, missile: m.type, seeker: MISSILES[m.type].seeker, guidance: m.guidance,
    range: me.pos.distanceTo(m.pos), offNoseDeg: offNose(me, m.pos), altAbove: me.pos.y - m.pos.y,
  };
}
